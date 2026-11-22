import { expect, type Page } from "@playwright/test";

const API_URL = (process.env.E2E_API_URL ?? "http://127.0.0.1:8787").replace(
  /\/+$/,
  "",
);
const APP_PATHS = { react: "/", vue: "/vue.html" } as const;

/** Live deployments can cold-start for up to a minute on Render's free tier. */
const IS_LIVE =
  process.env.E2E_LIVE === "1" ||
  (process.env.E2E_WEB_URL !== undefined && process.env.E2E_API_URL !== undefined);
const UI_TIMEOUT_MS = Number(
  process.env.E2E_UI_TIMEOUT_MS ?? (IS_LIVE ? 90_000 : 20_000),
);
const CARD_TIMEOUT_MS = IS_LIVE ? 30_000 : 15_000;
const PUSH_TIMEOUT_MS = IS_LIVE ? 60_000 : 25_000;

export type AppKind = keyof typeof APP_PATHS;

let boardCounter = 0;

/** Each test gets its own board so seed data and pushes do not leak. */
export function uniqueBoard(prefix: string): string {
  boardCounter += 1;
  const nonce = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${boardCounter}-${nonce}`;
}

export function appPath(kind: AppKind): string {
  return APP_PATHS[kind];
}

export interface PageIssues {
  readonly errors: string[];
  readonly duplicateKeys: string[];
}

/** Collects errors and duplicate-key warnings that indicate a broken render. */
export function trackIssues(page: Page): PageIssues {
  const errors: string[] = [];
  const duplicateKeys: string[] = [];

  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error") errors.push(text);
    if (message.type() === "warning" && text.includes("same key")) {
      duplicateKeys.push(text);
    }
  });

  return { errors, duplicateKeys };
}

export async function openBoard(
  page: Page,
  kind: AppKind,
  boardId: string,
): Promise<void> {
  await page.goto(`${appPath(kind)}?board=${boardId}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".board-column")).toHaveCount(4);
  await expect(page.locator(".card").first()).toBeVisible({
    timeout: UI_TIMEOUT_MS,
  });
}

export function column(page: Page, index: number) {
  return page.locator(".board-column").nth(index);
}

export async function addCard(
  page: Page,
  columnIndex: number,
  title: string,
): Promise<void> {
  const target = column(page, columnIndex);
  if ((await target.locator(".add-card-form").count()) === 0) {
    await target.locator(".board-column__add").click();
  }
  await target.locator(".add-card-form__input").fill(title);
  await target.locator(".add-card-form .button--primary").click();
  await expect(target.getByText(title, { exact: true })).toBeVisible();
}

export async function expectCardInColumn(
  page: Page,
  columnIndex: number,
  title: string,
): Promise<void> {
  await expect(
    column(page, columnIndex).getByText(title, { exact: true }),
  ).toBeVisible({ timeout: CARD_TIMEOUT_MS });
}

export async function openCard(page: Page, title: string): Promise<void> {
  await page.locator(".card", { hasText: title }).first().click();
  await expect(page.locator(".dialog")).toBeVisible();
}

export async function openTestLab(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Test Lab" }).click();
  await expect(page.locator(".panel")).toBeVisible();
}

export async function closeTestLab(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Close Test Lab" }).click();
  await expect(page.locator(".panel")).toHaveCount(0);
}

interface PushStats {
  readonly totalPushes: number;
  readonly duplicatePushes: number;
  readonly uniqueClients: number;
}

export async function fetchStats(boardId: string): Promise<PushStats> {
  const response = await fetch(
    `${API_URL}/api/boards/${encodeURIComponent(boardId)}/stats`,
    { signal: AbortSignal.timeout(IS_LIVE ? 30_000 : 10_000) },
  );
  if (!response.ok) {
    throw new Error(`Stats request failed with HTTP ${response.status}`);
  }
  return (await response.json()) as PushStats;
}

export async function pushCount(boardId: string): Promise<number> {
  return (await fetchStats(boardId)).totalPushes;
}

export async function waitForPush(
  boardId: string,
  minimum: number,
): Promise<void> {
  await expect
    .poll(() => pushCount(boardId), {
      timeout: PUSH_TIMEOUT_MS,
      intervals: [250, 500, 1_000],
    })
    .toBeGreaterThanOrEqual(minimum);
}
