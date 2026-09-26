import { test, expect } from "@playwright/test";
import {
  cleanupUsersViaApi,
  makeUser,
  registerUserViaApi,
  UTC_CONTEXT_OPTIONS,
} from "../helpers/user";
import { openBookingSession } from "../helpers/booking";
import { ProfilePage } from "../pages/profile-page";
import { SlotsPage } from "../pages/slots-page";

// R5.6 (docs/requirements.md, п.5): профиль виден всем остальным участникам —
// на странице участника видно имя, «о себе», навыки обоих типов и свободные слоты.
test.describe("Профиль: виден другим участникам", () => {
  test("страница участника показывает имя, био, навыки двух типов и свободный слот", async ({
    browser,
  }) => {
    const runId = Date.now();
    const host = makeUser("host", runId);
    const guest = makeUser("guest", runId);
    const canHelpTag = `R56CanHelp-${runId}`;
    const wantToLearnTag = `R56WantLearn-${runId}`;
    const bio = `QA-инженер, прогон ${runId}. Проверяю публичный профиль.`;

    const hostSession = await openBookingSession(browser);
    const guestSession = await openBookingSession(browser);

    try {
      await test.step("Хост: добавляет навыки двух типов", async () => {
        await registerUserViaApi(hostSession.context.request, host);

        const hostProfile = new ProfilePage(hostSession.page);
        await hostProfile.goto();
        await hostProfile.addSkill(canHelpTag, "can_help");
        await expect(hostProfile.skillChip(canHelpTag)).toBeVisible();

        await hostProfile.addSkill(wantToLearnTag, "want_to_learn");
        await expect(hostProfile.skillChip(wantToLearnTag)).toBeVisible();
      });

      await test.step("Хост: заполняет «О себе» и сохраняет — последний шаг, чтобы не гонять добавление навыков с перерисовкой после POST", async () => {
        const hostProfile = new ProfilePage(hostSession.page);
        await hostProfile.bioInput.fill(bio);
        await hostProfile.save();
      });

      await test.step("Хост: открывает свободный слот на завтра", async () => {
        const hostSlots = new SlotsPage(hostSession.page);
        await hostSlots.goto();
        await hostSlots.addSlot("12:00");
        await expect(hostSlots.firstSlotCard).toBeVisible();
      });

      await test.step("Гость: находит хоста в каталоге по навыку и открывает его страницу", async () => {
        await registerUserViaApi(guestSession.context.request, guest);
        // Клик по карточке может попасть в негидратированную страницу —
        // повторяем навигацию, пока не окажемся на странице участника.
        await expect(async () => {
          if (!guestSession.page.url().includes("/pomidorqa/people/")) {
            await guestSession.bookingPage.navigateToHostProfile(
              canHelpTag,
              host.name,
            );
          }
          await expect(guestSession.bookingPage.personHeading).toHaveText(
            host.name,
          );
        }).toPass({ timeout: 15_000 });
      });

      await test.step("На странице участника видны имя, био, навыки обоих типов и слот", async () => {
        await expect(guestSession.bookingPage.personHeading).toHaveText(host.name);
        await expect(guestSession.bookingPage.personBio(bio)).toBeVisible();
        await expect(guestSession.bookingPage.personSkillChip(canHelpTag)).toBeVisible();
        await expect(guestSession.bookingPage.personSkillChip(wantToLearnTag)).toBeVisible();
        await expect(guestSession.bookingPage.calendarTimes.first()).toBeVisible();
      });
    } finally {
      await cleanupUsersViaApi([hostSession.context, guestSession.context]);
    }
  });
});
