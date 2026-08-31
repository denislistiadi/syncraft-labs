import { assertNoCycles, validateStateShape } from "../../guards/index.js";
import type { Path } from "../types.js";
import type { DraftContext } from "../context.js";

export function validateValue(ctx: DraftContext, value: unknown, path: Path): void {
  if (value !== null && typeof value === "object") {
    assertNoCycles(value, undefined, path);
    if (ctx.devMode) validateStateShape(value, "draft mutation", path);
  } else if (typeof value === "function" && ctx.devMode) {
    validateStateShape(value, "draft mutation", path);
  }
}
