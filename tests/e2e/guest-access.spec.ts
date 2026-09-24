import { test, expect } from "@playwright/test";
import {
  cleanupUsersViaApi,
  makeRandom,
  makeUser,
  prepareHost,
  ROUTES,
  UTC_CONTEXT_OPTIONS,
} from "../helpers/user";
import { BookingPage } from "../pages/booking-page";

test.describe("Гость: доступ без регистрации", () => {
  test("гость находит участника в каталоге и видит его свободные слоты", async ({
    browser,
  }) => {
    const runId = Date.now();
    const skillTag = makeRandom("Playwright-demo");
    const host = makeUser("host", runId);

    const hostContext = await browser.newContext(UTC_CONTEXT_OPTIONS);
    const guestContext = await browser.newContext(UTC_CONTEXT_OPTIONS);

    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    const guestBookingPage = new BookingPage(guestPage);

    try {
      await test.step("Хост: регистрируется, добавляет навык и свободный слот на завтра", async () => {
        await prepareHost(hostPage, host, skillTag);
      });

      await test.step("Гость без аккаунта: открывает каталог и ищет по навыку", async () => {
        await guestBookingPage.gotoCatalog();
        await guestBookingPage.searchBySkill(skillTag);
      });

      await test.step("Каталог доступен гостю: карточка хоста в выдаче", async () => {
        await expect(guestBookingPage.getPersonCard(host.name)).toBeVisible();
      });

      await test.step("Гость: открывает страницу участника", async () => {
        await guestBookingPage.openPersonCard(host.name);
      });

      await test.step("Страница участника доступна гостю: имя и свободные слоты", async () => {
        await expect(guestPage).toHaveURL(/\/pomidorqa\/people\//);
        await expect(guestBookingPage.personHeading).toHaveText(host.name);
        await expect(guestBookingPage.calendarDays.first()).toBeVisible();
        await expect(guestBookingPage.calendarTimes.first()).toBeVisible();
      });
    } finally {
      await cleanupUsersViaApi([hostContext]);
      await guestContext.close();
    }
  });

  test("гость не может забронировать слот — продукт просит войти в аккаунт", async ({
    browser,
  }) => {
    const runId = Date.now();
    const skillTag = makeRandom("Playwright-demo");
    const host = makeUser("host", runId);

    const hostContext = await browser.newContext(UTC_CONTEXT_OPTIONS);
    const guestContext = await browser.newContext(UTC_CONTEXT_OPTIONS);

    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    const guestBookingPage = new BookingPage(guestPage);

    try {
      await test.step("Хост: регистрируется, добавляет навык и свободный слот на завтра", async () => {
        await prepareHost(hostPage, host, skillTag);
      });

      await test.step("Гость: открывает окно бронирования на первый слот хоста", async () => {
        await guestBookingPage.gotoCatalog();
        await guestBookingPage.searchBySkill(skillTag);
        await guestBookingPage.openPersonCard(host.name);
        await expect(guestPage).toHaveURL(/\/pomidorqa\/people\//);

        await guestBookingPage.selectFirstSlot();
        await expect(guestBookingPage.confirmDialog).toBeVisible();
      });

      await test.step("Гость: подтверждает бронирование", async () => {
        await guestBookingPage.confirmBooking();
      });

      await test.step("Бронь не создана: диалог открыт с ошибкой, со страницы участника не ушёл", async () => {
        await expect(guestBookingPage.errorAlert).toContainText(
          "Нужно войти в аккаунт PomidorQA",
        );
        await expect(guestPage).toHaveURL(/\/pomidorqa\/people\//);
      });
    } finally {
      await cleanupUsersViaApi([hostContext]);
      await guestContext.close();
    }
  });

  test("приватные страницы гостю недоступны — редирект на вход", async ({
    browser,
  }) => {
    const guestContext = await browser.newContext(UTC_CONTEXT_OPTIONS);
    const guestPage = await guestContext.newPage();

    const privateRoutes = [
      ["Профиль", ROUTES.profile],
      ["Мои встречи", ROUTES.booking],
      ["Мои слоты", ROUTES.slots],
    ] as const;

    try {
      for (const [name, route] of privateRoutes) {
        await test.step(`Гость: открывает «${name}» без входа`, async () => {
          await guestPage.goto(route);
        });

        await test.step(`«${name}» закрыт для гостя: редирект на страницу входа`, async () => {
          await expect(guestPage).toHaveURL(ROUTES.login);
        });
      }
    } finally {
      await guestContext.close();
    }
  });
});
