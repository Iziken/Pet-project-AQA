import {
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { ProfilePage } from "../pages/profile-page";
import { RegisterPage } from "../pages/register-page";
import { SlotsPage } from "../pages/slots-page";

export const ROUTES = {
  home: "/pomidorqa",
  register: "/pomidorqa/auth/register",
  login: "/pomidorqa/auth/login",
  profile: "/pomidorqa/profile",
  slots: "/pomidorqa/profile/slots",
  booking: "/pomidorqa/bookings",
  people: "/pomidorqa/people",
};

export const UTC_CONTEXT_OPTIONS = {
  timezoneId: "UTC",
};

export type TestUser = {
  name: string;
  email: string;
  password: string;
};

export type RegisteredParticipant = {
  id: string;
  name: string;
  email: string;
};

const TEST_ACCOUNTS_ENDPOINT = "/api/pomidorqa/test/accounts";

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

export function makeUser(role: string, runId: number): TestUser {
  return {
    name: `${role}-${runId} Автотест`,
    email: `${role}-${runId}-${randomSuffix()}@example.com`,
    password: "testpass123",
  };
}

export function makeRandom(prefix: string) {
  return `${prefix}-${Date.now()}-${randomSuffix()}`;
}

export async function registerUser(page: Page, user: TestUser): Promise<void> {
  const registerPage = new RegisterPage(page);
  await registerPage.goto();
  await registerPage.fillForm(user);
  await registerPage.submit();
  // Без повторного submit: если регистрация уже прошла, повторная вернёт
  // «email занят». Ждём редирект дольше обычного — стенд бывает медленным.
  await expect(page).toHaveURL(/\/pomidorqa\/?$/, { timeout: 15_000 });
}

export async function registerUserViaApi(
  request: APIRequestContext,
  user: TestUser,
): Promise<RegisteredParticipant> {
  const response = await request.post(TEST_ACCOUNTS_ENDPOINT, {
    data: user,
  });

  if (response.status() !== 201) {
    throw new Error(
      `Регистрация ${user.email} не удалась: ${response.status()} ${await response.text()}`,
    );
  }

  return response.json();
}

export async function deleteUserViaApi(
  request: APIRequestContext,
): Promise<void> {
  const response = await request.delete(TEST_ACCOUNTS_ENDPOINT);

  if (response.status() !== 200) {
    throw new Error(
      `Удаление аккаунта не удалось: ${response.status()} ${await response.text()}`,
    );
  }
}

export async function cleanupUsersViaApi(
  contexts: BrowserContext[],
): Promise<void> {
  const results = await Promise.allSettled(
    contexts.map((context) => deleteUserViaApi(context.request)),
  );
  for (const result of results) {
    if (result.status === "rejected") {
      console.warn("Не удалось удалить тестового участника:", result.reason);
    }
  }

  await Promise.all(contexts.map((context) => context.close()));
}

export async function prepareHost(
  page: Page,
  user: TestUser,
  skillTag: string,
  slotTime = "12:00",
  slotDate?: string,
): Promise<RegisteredParticipant> {
  const registered = await registerUserViaApi(page.context().request, user);

  const profile = new ProfilePage(page);
  await profile.goto();
  // Клик «Добавить» может попасть в негидратированную страницу и быть
  // проглочен. Повтор безопасен: дубликат навыка продукт отбрасывает.
  await expect(async () => {
    await profile.addSkill(skillTag, "can_help");
    await expect(profile.canHelpSkills).toContainText(skillTag);
  }).toPass({ timeout: 15_000 });

  const slots = new SlotsPage(page);
  await slots.goto();
  // Ретрай повторяет добавление слота (как в работающих тестах без ретрая).
  // ВРЕМЕННАЯ диагностика (убрать после разбора CI-WebKit): перед повтором
  // логируем состояние страницы — оно попадает в results.json.
  await expect(async () => {
    await slots.addSlot(slotTime, slotDate);
    const visible = await slots.firstSlotCard.isVisible().catch(() => false);
    if (!visible) {
      const state = {
        url: page.url(),
        слоты: await slots.slotCards.count().catch(() => -1),
        дата: await slots.dateInput.inputValue().catch(() => "?"),
        время: await slots.timeInput.inputValue().catch(() => "?"),
        пусто: await slots.emptyState.isVisible().catch(() => false),
      };
      console.log("[prepareHost] карточка не появилась:", JSON.stringify(state));
      await slots.goto();
    }
    await expect(slots.firstSlotCard).toBeVisible();
  }).toPass({ timeout: 20_000 });

  return registered;
}

export async function loginUser(page: Page, user: TestUser) {
  const loginEmailInput = (page: Page) => page.getByLabel("Email");
  const loginPasswordInput = (page: Page) => page.getByLabel("Пароль");
  const loginSubmitButton = (page: Page) =>
    page.getByRole("button", { name: "Войти" });

  await page.goto(ROUTES.login);
  await loginEmailInput(page).fill(user.email);
  await loginPasswordInput(page).fill(user.password);
  await loginSubmitButton(page).click();
  await expect(page).toHaveURL(/\/pomidorqa\/?$/);
}
