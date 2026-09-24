import { test, expect } from "@playwright/test";
import {
  cleanupUsersViaApi,
  makeRandom,
  makeUser,
  prepareHost,
  registerUserViaApi,
} from "../helpers/user";
import {
  bookFirstSlot,
  expectBookingFails,
  expectBookingSucceeds,
  openBookingDialogForFirstSlot,
  openBookingSession,
} from "../helpers/booking";

test.setTimeout(90_000);

test.describe("Бронирование", () => {
  test("гость бронирует свободный слот хоста — встреча видна у гостя и у хоста", async ({
    browser,
  }) => {
    const runId = Date.now();
    const skillTag = makeRandom("Playwright-demo");
    const host = makeUser("host", runId);
    const guest = makeUser("guest", runId);

    const hostSession = await openBookingSession(browser);
    const guestSession = await openBookingSession(browser);

    try {
      await test.step("Хост: регистрируется, добавляет навык и свободный слот на завтра", async () => {
        await prepareHost(hostSession.page, host, skillTag);
      });

      await test.step("Гость: регистрируется через API и бронирует первый слот хоста", async () => {
        await registerUserViaApi(guestSession.context.request, guest);
        await bookFirstSlot(guestSession.bookingPage, skillTag, host.name);
      });

      await test.step("Гость: видит встречу с хостом в разделе «Мои встречи»", async () => {
        const meeting = await guestSession.bookingPage.openUpcomingMeetings(
          host.name,
        );
        await expect(meeting).toBeVisible();
      });

      await test.step("Хост: видит встречу с гостем в разделе «Мои встречи»", async () => {
        const meeting = await hostSession.bookingPage.openUpcomingMeetings(
          guest.name,
        );
        await expect(meeting).toBeVisible();
      });
    } finally {
      await cleanupUsersViaApi([hostSession.context, guestSession.context]);
    }
  });

  test("двое гостей бронируют один слот — первый получает встречу, второй видит ошибку", async ({
    browser,
  }) => {
    const runId = Date.now();
    const skillTag = makeRandom("Playwright-demo");
    const host = makeUser("host", runId);
    const guest = makeUser("guest", runId);
    const guest2 = makeUser("guest2", runId);

    const hostSession = await openBookingSession(browser);
    const guestSession = await openBookingSession(browser);
    const guest2Session = await openBookingSession(browser);

    try {
      await test.step("Хост: регистрируется, добавляет навык и свободный слот на завтра", async () => {
        await prepareHost(hostSession.page, host, skillTag);
      });

      await test.step("Гость и гость2: регистрируются и оба открывают окно бронирования на первый слот", async () => {
        await registerUserViaApi(guestSession.context.request, guest);
        await registerUserViaApi(guest2Session.context.request, guest2);

        await openBookingDialogForFirstSlot(
          guestSession.bookingPage,
          skillTag,
          host.name,
        );
        await openBookingDialogForFirstSlot(
          guest2Session.bookingPage,
          skillTag,
          host.name,
        );
      });

      await test.step("Гость: подтверждает бронирование первым — успех", async () => {
        await guestSession.bookingPage.confirmBooking();
        await expectBookingSucceeds(guestSession.bookingPage);
      });

      await test.step("Гость2: подтверждает тот же слот вторым — видит ошибку", async () => {
        await guest2Session.bookingPage.confirmBooking();
        await expectBookingFails(guest2Session.bookingPage);
      });

      await test.step("Итог гонки: встреча есть у гостя, а у гостя2 её нет", async () => {
        const guestMeeting =
          await guestSession.bookingPage.openUpcomingMeetings(host.name);
        await expect(guestMeeting).toBeVisible();

        const guest2Meeting =
          await guest2Session.bookingPage.openUpcomingMeetings(host.name);
        await expect(guest2Meeting).toHaveCount(0);
      });
    } finally {
      await cleanupUsersViaApi([
        hostSession.context,
        guestSession.context,
        guest2Session.context,
      ]);
    }
  });
});
