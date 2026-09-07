export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function createMonotonicClock(): () => number {
  let last = 0;
  return () => {
    const now = Date.now();
    if (now <= last) {
      last += 1;
      return last;
    }
    last = now;
    return now;
  };
}
