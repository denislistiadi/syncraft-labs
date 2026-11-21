import { expect, test } from "@playwright/test";
import {
  addCard,
  openBoard,
  openTestLab,
  trackIssues,
  uniqueBoard,
  waitForPush,
} from "./helpers.js";

test("reset restores the seed board for everyone", async ({ page }) => {
  const issues = trackIssues(page);
  const boardId = uniqueBoard("reset");

  await openBoard(page, "react", boardId);
  const title = `Reset me ${Date.now()}`;
  await addCard(page, 0, title);
  await waitForPush(boardId, 1);

  page.once("dialog", (dialog) => dialog.accept());
  await page
    .locator(".app-header")
    .getByRole("button", { name: "Reset", exact: true })
    .click();

  await expect(page.getByText(title, { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Open on a fresh device", { exact: true }),
  ).toBeVisible();

  expect(issues.errors).toEqual([]);
  expect(issues.duplicateKeys).toEqual([]);
});

test("clearing the local cache reloads the board from the API", async ({
  page,
}) => {
  const issues = trackIssues(page);
  const boardId = uniqueBoard("clear-cache");

  await openBoard(page, "vue", boardId);
  await expect(
    page.getByText("Open on a fresh device", { exact: true }),
  ).toBeVisible();

  await openTestLab(page);
  page.once("dialog", (dialog) => dialog.accept());
  const reload = page.waitForEvent("load");
  await page.getByRole("button", { name: "Clear local cache" }).click();
  await reload;

  await expect(page.locator(".board-column")).toHaveCount(4);
  await expect(
    page.getByText("Open on a fresh device", { exact: true }),
  ).toBeVisible();

  expect(issues.errors).toEqual([]);
  expect(issues.duplicateKeys).toEqual([]);
});
