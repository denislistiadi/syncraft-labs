import { expect, test } from "@playwright/test";
import {
  addCard,
  closeTestLab,
  expectCardInColumn,
  fetchStats,
  openBoard,
  openTestLab,
  trackIssues,
  uniqueBoard,
  waitForPush,
} from "./helpers.js";

test("queues edits offline and drains the outbox after reconnect", async ({
  page,
}) => {
  const issues = trackIssues(page);
  const boardId = uniqueBoard("offline");

  await openBoard(page, "react", boardId);
  await openTestLab(page);
  await page.getByRole("button", { name: "Offline", exact: true }).click();
  await closeTestLab(page);

  const title = `Offline card ${Date.now()}`;
  await addCard(page, 0, title);
  await expectCardInColumn(page, 0, title);

  await page.waitForTimeout(5_000);
  expect((await fetchStats(boardId)).totalPushes).toBe(0);

  await openTestLab(page);
  await page.getByRole("button", { name: "Online", exact: true }).click();
  await closeTestLab(page);

  await waitForPush(boardId, 1);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".board-column")).toHaveCount(4);
  await expectCardInColumn(page, 0, title);

  expect(issues.errors).toEqual([]);
  expect(issues.duplicateKeys).toEqual([]);
});

test("React and Vue tabs sync over SSE in separate contexts", async ({
  browser,
}) => {
  const boardId = uniqueBoard("sse");
  const reactContext = await browser.newContext();
  const vueContext = await browser.newContext();
  const react = await reactContext.newPage();
  const vue = await vueContext.newPage();
  const reactIssues = trackIssues(react);
  const vueIssues = trackIssues(vue);

  await Promise.all([
    openBoard(react, "react", boardId),
    openBoard(vue, "vue", boardId),
  ]);

  const reactTitle = `From React ${Date.now()}`;
  await addCard(react, 0, reactTitle);
  await expectCardInColumn(vue, 0, reactTitle);
  await waitForPush(boardId, 1);

  const vueTitle = `From Vue ${Date.now()}`;
  await addCard(vue, 1, vueTitle);
  await expectCardInColumn(react, 1, vueTitle);
  await waitForPush(boardId, 2);

  const stats = await fetchStats(boardId);
  expect(stats.uniqueClients).toBeGreaterThanOrEqual(2);

  expect(reactIssues.errors).toEqual([]);
  expect(vueIssues.errors).toEqual([]);
  expect(reactIssues.duplicateKeys).toEqual([]);
  expect(vueIssues.duplicateKeys).toEqual([]);

  await reactContext.close();
  await vueContext.close();
});

test("two tabs sharing IndexedDB do not duplicate replayed cards", async ({
  context,
}) => {
  const boardId = uniqueBoard("tabs");
  const react = await context.newPage();
  const vue = await context.newPage();
  const reactIssues = trackIssues(react);
  const vueIssues = trackIssues(vue);

  await Promise.all([
    openBoard(react, "react", boardId),
    openBoard(vue, "vue", boardId),
  ]);

  const reactTitle = `Shared React ${Date.now()}`;
  await addCard(react, 0, reactTitle);
  await expectCardInColumn(vue, 0, reactTitle);

  const vueTitle = `Shared Vue ${Date.now()}`;
  await addCard(vue, 1, vueTitle);
  await expectCardInColumn(react, 1, vueTitle);

  await react.waitForTimeout(6_000);
  for (const page of [react, vue]) {
    await expect(page.getByText(reactTitle, { exact: true })).toHaveCount(1);
    await expect(page.getByText(vueTitle, { exact: true })).toHaveCount(1);
  }

  expect(reactIssues.errors).toEqual([]);
  expect(vueIssues.errors).toEqual([]);
  expect(reactIssues.duplicateKeys).toEqual([]);
  expect(vueIssues.duplicateKeys).toEqual([]);
});
