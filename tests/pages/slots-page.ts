import { Locator, Page } from "@playwright/test";
import { ROUTES } from "../helpers/user";

export class SlotsPage {
  page: Page;
  dateInput: Locator;
  timeInput: Locator;
  addSubmitButton: Locator;
  firstSlotCard: Locator;
  slotCards: Locator;
  freeSlotCard: Locator;
  bookedSlotCard: Locator;
  emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.dateInput = page.locator("#pomidorqa-slots-date");
    this.timeInput = page.locator("#pomidorqa-slots-time");
    this.addSubmitButton = page.getByRole("button", {
      name: "Добавить слот",
    });
    this.slotCards = page.locator("[data-slot-id]");
    this.freeSlotCard = page.locator('[data-slot-id][data-slot-status="free"]');
    this.bookedSlotCard = page.locator(
      '[data-slot-id][data-slot-status="booked"]',
    );
    this.firstSlotCard = this.slotCards.first();
    this.emptyState = page.getByText("Пока нет запланированных слотов");
  }

  async goto() {
    await this.page.goto(ROUTES.slots);
  }

  async addSlot(time: string, customDate?: string) {
    let targetDate = customDate;

    if (!targetDate) {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      targetDate = tomorrow.toISOString().slice(0, 10);
    }

    await this.dateInput.fill(targetDate);
    await this.timeInput.fill(time);
    // «Добавить слот» отправляет fetch (серверный action) и не перерисовывает
    // список во всех браузерах одинаково: в WebKit карточка появляется с
    // задержкой. Ждём сам POST-ответ — без него карточки не будет, а ретрай
    // с переходом обрывает fetch на полуслове.
    const postResponse = this.page.waitForResponse(
      (response) =>
        response.url().includes("/pomidorqa/profile/slots") &&
        response.request().method() === "POST",
      { timeout: 15_000 },
    );
    await this.addSubmitButton.click();
    const response = await postResponse;
    if (response.status() >= 400) {
      throw new Error(
        `Добавление слота не удалось: ${response.status()} ${await response.text()}`,
      );
    }
  }

  async removeFreeSlot() {
    await this.freeSlotCard.first()
      .getByRole("button", { name: "Удалить" })
      .click();
  }
}
