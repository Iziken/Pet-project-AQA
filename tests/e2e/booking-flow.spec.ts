import { test, expect } from "@playwright/test";
import {
  cleanupUsersViaApi,
  makeRandom,
  makeUser,
  prepareHost,
  registerUserViaApi,
  ROUTES,
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

  test("отмена в окне подтверждения не создаёт бронь", async ({ browser }) => {
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

      await test.step("Гость: открывает окно бронирования на первый слот", async () => {
        await registerUserViaApi(guestSession.context.request, guest);
        await openBookingDialogForFirstSlot(
          guestSession.bookingPage,
          skillTag,
          host.name,
        );
      });

      await test.step("Гость: закрывает окно кнопкой «Отмена»", async () => {
        await guestSession.bookingPage.cancelBookingConfirmation();
        await expect(guestSession.bookingPage.confirmDialog).toBeHidden();
      });

      await test.step("Бронь не создана: в «Мои встречи» встречи с хостом нет", async () => {
        const meeting = await guestSession.bookingPage.openUpcomingMeetings(
          host.name,
        );
        await expect(meeting).toHaveCount(0);
      });
    } finally {
      await cleanupUsersViaApi([hostSession.context, guestSession.context]);
    }
  });

  test("забронированный слот исчезает со страницы участника", async ({
    browser,
  }) => {
    const runId = Date.now();
    const skillTag = makeRandom("Playwright-demo");
    const host = makeUser("host", runId);
    const guest = makeUser("guest", runId);

    const hostSession = await openBookingSession(browser);
    const guestSession = await openBookingSession(browser);
    let hostUrl = "";

    try {
      await test.step("Хост: регистрируется, добавляет навык и свободный слот на завтра", async () => {
        await prepareHost(hostSession.page, host, skillTag);
      });

      await test.step("Гость: открывает страницу хоста и открывает окно брони", async () => {
        await registerUserViaApi(guestSession.context.request, guest);
        await openBookingDialogForFirstSlot(
          guestSession.bookingPage,
          skillTag,
          host.name,
        );
      });

      await test.step("Гость: запоминает адрес страницы хоста и подтверждает бронь", async () => {
        // После брони хост исчезнет из каталога — на его страницу вернёмся по прямой ссылке.
        hostUrl = guestSession.page.url();
        await guestSession.bookingPage.confirmBooking();
        await expectBookingSucceeds(guestSession.bookingPage);
      });

      await test.step("Забронированный слот не показывается на странице участника", async () => {
        await guestSession.page.goto(hostUrl);
        await expect(guestSession.bookingPage.noSlotsMessage).toBeVisible();
        await expect(guestSession.bookingPage.calendarDays).toHaveCount(0);
        await expect(guestSession.bookingPage.calendarTimes).toHaveCount(0);
      });
    } finally {
      await cleanupUsersViaApi([hostSession.context, guestSession.context]);
    }
  });

  test("хост не может забронировать собственный слот", async ({ browser }) => {
    const runId = Date.now();
    const skillTag = makeRandom("Playwright-demo");
    const host = makeUser("host", runId);

    const hostSession = await openBookingSession(browser);
    let hostId = "";

    try {
      await test.step("Хост: регистрируется, добавляет навык и свободный слот на завтра", async () => {
        const registered = await prepareHost(hostSession.page, host, skillTag);
        hostId = registered.id;
      });

      await test.step("Хост: открывает страницу самого себя по прямой ссылке", async () => {
        // В каталоге участник себя не видит, но страница доступна по /people/<id>.
        await hostSession.page.goto(`${ROUTES.people}/${hostId}`);
        await expect(hostSession.bookingPage.personHeading).toHaveText(host.name);
      });

      await test.step("Хост: выбирает свой слот и подтверждает бронирование", async () => {
        await hostSession.bookingPage.selectFirstSlot();
        await expect(hostSession.bookingPage.confirmDialog).toBeVisible();
        await hostSession.bookingPage.confirmBooking();
      });

      await test.step("Бронь отклонена: диалог с ошибкой про собственный слот", async () => {
        await expect(hostSession.bookingPage.errorAlert).toContainText(
          "Нельзя забронировать собственный слот",
        );
      });

      await test.step("Встреча не создана: в «Мои встречи» пусто", async () => {
        await hostSession.bookingPage.goto();
        await expect(hostSession.bookingPage.upcomingBookings).toHaveCount(0);
      });
    } finally {
      await cleanupUsersViaApi([hostSession.context]);
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
