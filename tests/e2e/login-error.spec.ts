import { test, expect } from "@playwright/test";
import {
  deleteUserViaApi,
  makeUser,
  registerUserViaApi,
  type TestUser,
} from "../helpers/user";

test.afterEach(async ({ request }) => {
  try {
    await deleteUserViaApi(request);
  } catch (err) {
    console.warn("Не удалось удалить тестового участника:", err);
  }
});

test("вход с неверными данными — одинаковая ошибка в обоих случаях, без уточнения причины", async ({
  page,
  request,
}) => {
  const runId = Date.now();
  const user: TestUser = makeUser("login-check", runId);

  await test.step("Заводим реальный аккаунт для проверки", async () => {
    await registerUserViaApi(request, user);
  });

  let wrongPasswordError = "";

  await test.step("Пробуем войти с верным email, но неверным паролем", async () => {
    await page.goto("/pomidorqa/auth/login");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Пароль").fill("wrong-password");
    await page.getByRole("button", { name: "Войти" }).click();
    const error = page.getByText(/Неверный/);
    await expect(error).toBeVisible();
    wrongPasswordError = (await error.textContent())?.trim() ?? "";
  });

  let unknownEmailError = "";

  await test.step("Пробуем войти с несуществующим email", async () => {
    await page.goto("/pomidorqa/auth/login");
    await page.getByLabel("Email").fill(`no-such-user-${runId}@example.com`);
    await page.getByLabel("Пароль").fill("any-password-123");
    await page.getByRole("button", { name: "Войти" }).click();
    const error = page.getByText(/Неверный/);
    await expect(error).toBeVisible();
    unknownEmailError = (await error.textContent())?.trim() ?? "";
  });

  await test.step("Проверяем: текст ошибки одинаковый в обоих случаях — не раскрывает, что именно неверно", async () => {
    expect(wrongPasswordError).toBe(unknownEmailError);
    expect(wrongPasswordError).toContain("Неверный");
  });
});
