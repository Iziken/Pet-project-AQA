import { test, expect } from "@playwright/test";
import {
  deleteUserViaApi,
  loginUser,
  makeUser,
  registerUserViaApi,
  ROUTES,
} from "../helpers/user";
import { HeaderPage } from "../pages/header-page";

test.describe("Вход и выход", () => {
  test.afterEach(async ({ request }) => {
    try {
      await deleteUserViaApi(request);
    } catch (err) {
      console.warn("Не удалось удалить тестового участника:", err);
    }
  });

  test("вход по email и паролю открывает сессию, выход её закрывает", async ({
    page,
    request,
  }) => {
    const user = makeUser("auth-flow", Date.now());
    const header = new HeaderPage(page);

    await test.step("Заводим аккаунт через служебный API", async () => {
      await registerUserViaApi(request, user);
    });

    await test.step("Входим через форму с email и паролем", async () => {
      await loginUser(page, user);
    });

    await test.step("После входа пользователь авторизован: в шапке «Выйти», ссылки «Войти» нет", async () => {
      await expect(header.logoutButton).toBeVisible();
      await expect(header.enterLink).toHaveCount(0);
    });

    await test.step("После перезагрузки сессия держится: «Выйти» на месте", async () => {
      await page.reload();
      await expect(header.logoutButton).toBeVisible();
    });

    await test.step("Выходим из аккаунта", async () => {
      await header.logout();
    });

    await test.step("После выхода шапка гостя: ссылка «Войти» вернулась", async () => {
      await expect(header.enterLink).toBeVisible();
      await expect(header.logoutButton).toHaveCount(0);
    });

    await test.step("Гость: открывает «Мои встречи»", async () => {
      await page.goto(ROUTES.booking);
    });

    await test.step("Сессия закрыта сервером: «Мои встречи» редиректит на вход", async () => {
      await expect(page).toHaveURL(ROUTES.login);
    });
  });
});
