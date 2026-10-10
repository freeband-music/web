/** Counts failures per key within a window; in memory, so it resets on restart. */
export class RateLimiter {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Milliseconds until the key may try again, or 0 if it is not blocked. */
  blockedFor(key: string, now: number): number {
    const entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) return 0;
    return entry.count >= this.max ? entry.resetAt - now : 0;
  }

  fail(key: string, now: number): void {
    const entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.entries.size > 10_000) this.prune(now);
    } else {
      entry.count += 1;
    }
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  private prune(now: number): void {
    for (const [key, entry] of this.entries) if (entry.resetAt <= now) this.entries.delete(key);
  }
}
