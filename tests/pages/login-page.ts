import { type Locator, type Page } from "@playwright/test";
import { ROUTES } from "../helpers/user";

export class LoginPage {
  page: Page;
  emailInput: Locator;
  passwordInput: Locator;
  submitButton: Locator;
  errorAlert: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel("Email");
    this.passwordInput = page.getByLabel("Пароль");
    this.submitButton = page.getByRole("button", { name: "Войти" });
    this.errorAlert = page.getByText(/Неверный/);
  }

  async goto() {
    await this.page.goto(ROUTES.login);
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submit();
  }

  async submit() {
    await this.submitButton.click();
  }
}
