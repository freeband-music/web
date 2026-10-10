import { expect, test } from "vitest";
import { planPrefetch } from "./prefetch";

test("plans upcoming tracks in order, queueing only the first few and skipping cached ones", () => {
  const c = (streamCached: boolean, needsDetails: boolean) => ({ streamCached, needsDetails });
  const plan = planPrefetch(
    [c(false, false), c(true, true), c(false, true), c(false, true), c(false, false), c(false, true)],
    { limit: 5, queueAhead: 3 },
  );
  expect(plan).toEqual([
    { index: 0, allowQueue: true },
    // 1 is cached; 4 has full details and is past the queue window; 5 is past the limit.
    { index: 2, allowQueue: true },
    { index: 3, allowQueue: false },
  ]);
});
