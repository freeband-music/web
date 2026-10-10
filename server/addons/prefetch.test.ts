import { expect, test } from "vitest";
import { planPrefetch } from "./prefetch";

test("plans upcoming tracks in order, queueing only the first few and skipping cached ones", () => {
  const c = (streamCached: boolean, needsDetails: boolean, checkWithoutQueue = false) => ({
    streamCached,
    needsDetails,
    checkWithoutQueue,
  });
  const plan = planPrefetch(
    [c(false, false), c(true, true), c(false, true), c(false, true), c(false, false), c(false, false, true), c(false, true)],
    { limit: 6, queueAhead: 3 },
  );
  expect(plan).toEqual([
    { index: 0, allowQueue: true },
    // 1 is cached; 4 has full details and no add-on to ask without queueing; 6 is past the limit.
    { index: 2, allowQueue: true },
    { index: 3, allowQueue: false },
    { index: 5, allowQueue: false },
  ]);
});
