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
  await expect(page).toHaveURL(/\/pomidorqa\/?$/);
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
) {
  await registerUserViaApi(page.context().request, user);

  const profile = new ProfilePage(page);
  await profile.goto();
  await profile.addSkill(skillTag, "can_help");
  await expect(profile.canHelpSkills).toContainText(skillTag);

  const slots = new SlotsPage(page);
  await slots.goto();
  await slots.addSlot(slotTime);
  await expect(slots.firstSlotCard).toBeVisible();
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
