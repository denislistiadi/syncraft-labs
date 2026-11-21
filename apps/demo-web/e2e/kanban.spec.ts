import { expect, test } from "@playwright/test";
import {
  addCard,
  column,
  expectCardInColumn,
  openBoard,
  openCard,
  trackIssues,
  uniqueBoard,
  waitForPush,
  type AppKind,
} from "./helpers.js";

const APPS: readonly { kind: AppKind; label: string }[] = [
  { kind: "react", label: "React" },
  { kind: "vue", label: "Vue" },
];

for (const app of APPS) {
  test.describe(`${app.label} Kanban`, () => {
    test("creates, edits, moves, and deletes a card", async ({ page }) => {
      const issues = trackIssues(page);
      const boardId = uniqueBoard(`${app.kind}-parity`);

      await openBoard(page, app.kind, boardId);
      await expect(page.locator(".board-column")).toHaveCount(4);

      const title = `${app.label} card ${Date.now()}`;
      await addCard(page, 0, title);

      await openCard(page, title);
      await expect(page.locator("#card-dialog-title")).toHaveText("Edit card");
      const editedTitle = `${title} edited`;
      await page.locator(".dialog .field__input").first().fill(editedTitle);
      await page
        .locator(".dialog .field__input--area")
        .fill("Notes from Playwright");
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.locator(".dialog")).toHaveCount(0);
      await expectCardInColumn(page, 0, editedTitle);

      await page
        .locator(".card", { hasText: editedTitle })
        .first()
        .getByRole("button", { name: "Move card to next column" })
        .click();
      await expectCardInColumn(page, 1, editedTitle);

      await waitForPush(boardId, 1);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator(".board-column")).toHaveCount(4);
      await expectCardInColumn(page, 1, editedTitle);

      await openCard(page, editedTitle);
      await expect(page.locator(".dialog .field__input--area")).toHaveValue(
        "Notes from Playwright",
      );
      await page.locator(".dialog .icon-button").click();

      await openCard(page, editedTitle);
      await page.getByRole("button", { name: "Delete", exact: true }).click();
      await page
        .getByRole("button", { name: "Confirm delete", exact: true })
        .click();
      await expect(page.locator(".dialog")).toHaveCount(0);
      await expect(page.getByText(editedTitle, { exact: true })).toHaveCount(0);

      expect(issues.errors).toEqual([]);
      expect(issues.duplicateKeys).toEqual([]);
    });

    test("moves and reorders cards with the mobile controls", async ({
      page,
    }) => {
      const issues = trackIssues(page);
      const boardId = uniqueBoard(`${app.kind}-mobile`);

      await page.setViewportSize({ width: 390, height: 844 });
      await openBoard(page, app.kind, boardId);

      const first = `Mobile A ${Date.now()}`;
      const second = `Mobile B ${Date.now()}`;
      await addCard(page, 0, first);
      await addCard(page, 0, second);

      await expect(column(page, 0).locator(".card__title").first()).toHaveText(
        second,
      );
      await column(page, 0)
        .locator(".card", { hasText: second })
        .first()
        .getByRole("button", { name: "Move card down" })
        .click();
      await expect(column(page, 0).locator(".card__title").first()).toHaveText(
        first,
      );

      await column(page, 0)
        .locator(".card", { hasText: first })
        .first()
        .getByRole("button", { name: "Move card to next column" })
        .click();
      await expectCardInColumn(page, 1, first);

      expect(issues.errors).toEqual([]);
      expect(issues.duplicateKeys).toEqual([]);
    });
  });
}
