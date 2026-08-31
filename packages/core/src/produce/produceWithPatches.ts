import { assertNoCycles, isDevMode, validateStateShape } from "../guards/index.js";
import { createDraftContext } from "./context.js";
import { getDraft } from "./handlers/object.js";

export function produceWithPatches<T>(baseState: T, updater: (draft: T) => void | T): [T, import("./types.js").Patch[], import("./types.js").Patch[]] {
  if (baseState !== null && typeof baseState === "object") assertNoCycles(baseState);
  const devMode = isDevMode();
  const ctx = createDraftContext(devMode);
  const draft = getDraft(baseState, [], new Set(), ctx);
  const result = updater(draft as T);
  const nextState = result !== undefined ? result : ctx.copies.get(baseState) ?? baseState;
  if (nextState !== null && typeof nextState === "object") {
    assertNoCycles(nextState);
    if (devMode) validateStateShape(nextState, "produce nextState");
  }
  if (!ctx.isDirty.value && result === undefined) return [baseState, [], []];
  if (result !== undefined && result !== baseState) {
    return [nextState as T, [{ op: "replace", path: [], value: nextState }], [{ op: "replace", path: [], value: baseState }]];
  }
  return [nextState as T, ctx.patches, ctx.inversePatches];
}
