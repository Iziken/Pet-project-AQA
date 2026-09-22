import { type Locator, type Page } from "@playwright/test";
import { ROUTES, type TestUser } from "../helpers/user";

export class RegisterPage {
  page: Page;
  nameInput: Locator;
  emailInput: Locator;
  passwordInput: Locator;
  submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nameInput = page.getByLabel("Имя");
    this.emailInput = page.getByLabel("Email");
    this.passwordInput = page.getByLabel("Пароль");
    this.submitButton = page.getByRole("button", {
      name: "Зарегистрироваться",
    });
  }

  async goto() {
    await this.page.goto(ROUTES.register);
  }

  async fillForm(user: TestUser) {
    await this.nameInput.fill(user.name);
    await this.emailInput.fill(user.email);
    await this.passwordInput.fill(user.password);
  }

  async submit() {
    await this.submitButton.click();
  }
}
