import { test, expect } from "@playwright/test";
import {
  cleanupUsersViaApi,
  makeRandom,
  makeUser,
  prepareHost,
  registerUserViaApi,
} from "../helpers/user";
import { bookFirstSlot, openBookingSession } from "../helpers/booking";
import { SlotsPage } from "../pages/slots-page";

// R7.2–R7.5 (docs/requirements.md, п.7): статусы слота, удаление свободного
// и запрет удаления забронированного.
test.describe("Слоты: статусы и удаление", () => {
  test("свободный слот удаляется и не возвращается после перезагрузки", async ({
    browser,
  }) => {
    const host = makeUser("host", Date.now());

    const hostSession = await openBookingSession(browser);

    try {
      await test.step("Хост: регистрируется через API и открывает свободный слот на завтра", async () => {
        await registerUserViaApi(hostSession.context.request, host);

        const slots = new SlotsPage(hostSession.page);
        await slots.goto();
        await slots.addSlot("12:00");
        await expect(slots.freeSlotCard).toBeVisible();
      });

      await test.step("Хост: удаляет свободный слот", async () => {
        const slots = new SlotsPage(hostSession.page);
        await slots.removeFreeSlot();
      });

      await test.step("Карточка слота исчезла", async () => {
        const slots = new SlotsPage(hostSession.page);
        await expect(slots.slotCards).toHaveCount(0);
      });

      await test.step("После перезагрузки слота по-прежнему нет — удаление с сервера", async () => {
        const slots = new SlotsPage(hostSession.page);
        await slots.goto();
        await expect(slots.slotCards).toHaveCount(0);
        await expect(slots.emptyState).toBeVisible();
      });
    } finally {
      await cleanupUsersViaApi([hostSession.context]);
    }
  });

  test("у забронированного слота нет кнопки удаления — статус меняется на booked", async ({
    browser,
  }) => {
    const runId = Date.now();
    const skillTag = makeRandom("Playwright-demo");
    const host = makeUser("host", runId);
    const guest = makeUser("guest", runId);

    const hostSession = await openBookingSession(browser);
    const guestSession = await openBookingSession(browser);

    try {
      await test.step("Хост: регистрируется, добавляет навык и свободный слот", async () => {
        await prepareHost(hostSession.page, host, skillTag);
      });

      await test.step("Гость: бронирует слот хоста", async () => {
        await registerUserViaApi(guestSession.context.request, guest);
        await bookFirstSlot(guestSession.bookingPage, skillTag, host.name);
      });

      await test.step("Хост: на странице «Мои слоты» слот забронирован и без кнопки удаления", async () => {
        const slots = new SlotsPage(hostSession.page);
        await slots.goto();

        await expect(slots.bookedSlotCard).toHaveCount(1);
        await expect(slots.freeSlotCard).toHaveCount(0);
        await expect(slots.bookedSlotCard).toContainText("забронирован");
        await expect(slots.bookedSlotCard.getByRole("button")).toHaveCount(0);
      });
    } finally {
      await cleanupUsersViaApi([hostSession.context, guestSession.context]);
    }
  });
});
