import { type Locator, type Page } from "@playwright/test";

export class HeaderPage {
  page: Page;
  banner: Locator;
  navLinks: Locator;
  logoutButton: Locator;
  enterLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.banner = page.getByRole("banner");
    this.navLinks = this.banner.getByRole("navigation").getByRole("link");
    this.logoutButton = this.banner.getByRole("button", { name: "Выйти" });
    this.enterLink = this.banner.getByRole("link", { name: "Войти" });
  }

  async logout() {
    await this.logoutButton.click();
  }
}
