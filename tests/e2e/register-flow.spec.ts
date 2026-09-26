import { test, expect } from "@playwright/test";
import {
  cleanupUsersViaApi,
  deleteUserViaApi,
  makeUser,
  registerUser,
  registerUserViaApi,
} from "../helpers/user";
import { ProfilePage } from "../pages/profile-page";
import { RegisterPage } from "../pages/register-page";

// R4.1–R4.4 (docs/requirements.md, п.4): правила регистрации через UI.
test.describe("Регистрация", () => {
  let registerPage: RegisterPage;
  // Аккаунт для негатива «занятый email»: живёт в request-фикстуре, а не в
  // браузерном контексте, чтобы страница оставалась неавторизованной.
  let apiUserCreated: boolean;

  test.beforeEach(async ({ page }) => {
    registerPage = new RegisterPage(page);
    apiUserCreated = false;
  });

  test.afterEach(async ({ page, request }) => {
    await cleanupUsersViaApi([page.context()]);
    if (apiUserCreated) {
      try {
        await deleteUserViaApi(request);
      } catch (err) {
        console.warn("Не удалось удалить тестового участника:", err);
      }
    }
  });

  test("обязательные поля: пустая форма не отправляется", async ({ page }) => {
    await test.step("Жмём «Зарегистрироваться» с пустыми полями", async () => {
      await registerPage.goto();
      await registerPage.submit();
    });

    await test.step("Отправки нет: остаёмся на форме, первое поле помечено браузером", async () => {
      await expect(page).toHaveURL(/\/pomidorqa\/auth\/register/);
      await expect(registerPage.nameInput).toBeFocused();
    });
  });

  test("пароль короче 8 символов — форма показывает ошибку", async ({ page }) => {
    const user = makeUser("register-short-pw", Date.now());

    await test.step("Заполняем форму паролем из 7 символов и отправляем", async () => {
      await registerPage.goto();
      await registerPage.nameInput.fill(user.name);
      await registerPage.emailInput.fill(user.email);
      await registerPage.passwordInput.fill("1234567");
      await registerPage.submit();
    });

    await test.step("Регистрация не прошла: форма сообщает про минимум 8 символов", async () => {
      await expect(page).toHaveURL(/\/pomidorqa\/auth\/register/);
      // Продукт сообщает о правиле в двух слоях: негидратированная форма —
      // нативной подсказкой поля ("8 characters"), гидратированная —
      // серверной ошибкой в alert ("не короче 8 символов"). Проверяем
      // наблюдаемое правило, а не слой реализации.
      await expect
        .poll(
          async () => {
            const serverText =
              (await registerPage.errorAlert.count()) > 0
                ? ((await registerPage.errorAlert.first().textContent()) ?? "")
                : "";
            const nativeText = await registerPage.passwordInput.evaluate(
              (el) => el.validationMessage,
            );
            return `${serverText} ${nativeText}`;
          },
          { timeout: 10_000 },
        )
        .toContain("8");
    });
  });

  test("после регистрации создан профиль: имя из формы и пояс Europe/Moscow", async ({
    page,
  }) => {
    const user = makeUser("register-profile", Date.now());

    await test.step("Регистрируемся через UI-форму", async () => {
      await registerUser(page, user);
    });

    await test.step("Открываем профиль: имя из формы, часовой пояс по умолчанию", async () => {
      const profile = new ProfilePage(page);
      await profile.goto();
      await expect(profile.nameInput).toHaveValue(user.name);
      await expect(profile.timezoneSelect).toHaveValue("Europe/Moscow");
    });
  });

  test("повторная регистрация с занятым email — форма показывает ошибку", async ({
    page,
    request,
  }) => {
    const user = makeUser("register-dup", Date.now());
    apiUserCreated = true;

    await test.step("Заводим аккаунт с этим email через служебный API", async () => {
      await registerUserViaApi(request, user);
    });

    await test.step("Пробуем зарегистрироваться через UI с тем же email", async () => {
      await registerPage.goto();
      await registerPage.fillForm(user);
      await registerPage.submit();
    });

    await test.step("Регистрация не прошла: форма показывает ошибку занятого email", async () => {
      // Повтор submit безопасен: сервер отвечает той же ошибкой занятого email.
      await expect(async () => {
        await registerPage.submit();
        await expect(registerPage.errorAlert).toContainText(
          "Этот email уже зарегистрирован",
        );
      }).toPass({ timeout: 15_000 });
    });
  });
});
