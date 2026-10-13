import { describe, expect, it } from "vitest";
import { poolSchema } from "./schemas";
import { normalizePool, resetText } from "./model";
import { createSnapshotCache } from "./cache";
const raw = {
  id: "1",
  provider: "claude",
  label: "Test",
  enabled: true,
  status: "ready",
};
describe("quota interpretation", () => {
  it("retains weekly and family limits when the session is empty", () => {
    const [a] = normalizePool(
      poolSchema.parse({
        accounts: [
          {
            ...raw,
            fiveHourUtilization: 0,
            sevenDayUtilization: 0.9,
            familyWeekly: { opus: { utilization: 0.98, resetAt: null } },
          },
        ],
      }),
    );
    expect(a!.windows).toEqual([
      { label: "5h", used: 0, resetAt: null },
      { label: "Week", used: 0.9, resetAt: null },
      { label: "Opus week", used: 0.98, resetAt: null },
    ]);
  });
  it("keeps every reported Claude family quota and its own reset", () => {
    const [a] = normalizePool(
      poolSchema.parse({
        accounts: [
          {
            ...raw,
            email: "claude@example.test",
            fiveHourUtilization: 0.2,
            fiveHourResetAt: 1000,
            sevenDayUtilization: 0.7,
            sevenDayResetAt: 2000,
            familyWeekly: {
              fable: { utilization: 0, resetAt: 3000 },
              opus: { utilization: null, resetAt: null },
              sonnet: null,
            },
          },
        ],
      }),
    );
    expect(a!.identity).toBe("claude@example.test");
    expect(a!.windows).toEqual([
      { label: "5h", used: 0.2, resetAt: 1000 },
      { label: "Week", used: 0.7, resetAt: 2000 },
      { label: "Fable week", used: 0, resetAt: 3000 },
      { label: "Opus week", used: null, resetAt: null },
    ]);
  });
  it("uses explicit Codex windows without duplicating legacy limits", () => {
    const [a] = normalizePool(
      poolSchema.parse({
        accounts: [
          {
            ...raw,
            provider: "codex",
            fiveHourUtilization: 0.1,
            sevenDayUtilization: 0.9,
            limitWindows: [
              {
                slot: "primary",
                windowMinutes: 300,
                utilization: 0.2,
                resetAt: 1000,
              },
              {
                slot: "secondary",
                windowMinutes: 10080,
                utilization: 0.3,
                resetAt: 2000,
              },
            ],
          },
        ],
      }),
    );
    expect(a!.windows).toEqual([
      { label: "5h", used: 0.2, resetAt: 1000 },
      { label: "Week", used: 0.3, resetAt: 2000 },
    ]);
  });
  it("preserves distinct slots with equal durations and unknown readings", () => {
    const [a] = normalizePool(
      poolSchema.parse({
        accounts: [
          {
            ...raw,
            provider: "codex",
            limitWindows: [
              {
                slot: "primary",
                windowMinutes: 10080,
                utilization: 0.1,
                resetAt: 1000,
              },
              {
                slot: "secondary",
                windowMinutes: 10080,
                utilization: null,
                resetAt: null,
              },
              {
                slot: "future_model",
                windowMinutes: 90,
                utilization: 0.4,
                resetAt: 3000,
              },
            ],
          },
        ],
      }),
    );
    expect(a!.windows).toEqual([
      { label: "Primary · Week", used: 0.1, resetAt: 1000 },
      { label: "Secondary · Week", used: null, resetAt: null },
      { label: "Future model · 90m", used: 0.4, resetAt: 3000 },
    ]);
  });
  it("keeps unknown, disabled, errors and future providers visible", () => {
    const accounts = normalizePool(
      poolSchema.parse({
        accounts: [
          {
            ...raw,
            provider: "future",
            enabled: false,
            error: "sensitive upstream diagnostic",
          },
        ],
      }),
    );
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.windows).toEqual([]);
    expect(JSON.stringify(accounts)).not.toContain("sensitive upstream");
  });
  it("does not invent a fresh quota after its reset time", () =>
    expect(resetText(1, 2)).toBe("Awaiting update"));
  it("formats each remaining reset interval and unknown values", () => {
    const now = 5000;
    expect(resetText(now + 1, now)).toBe("1m");
    expect(resetText(now + 110 * 60_000, now)).toBe("1h 50m");
    expect(resetText(now + 68 * 60 * 60_000, now)).toBe("2d 20h");
    expect(resetText(null, now)).toBe("Reset unknown");
  });
});
describe("shared cache", () => {
  it("coalesces concurrent reads and retries failures without losing data", async () => {
    let now = 0;
    let calls = 0;
    let fail = false;
    const accounts = normalizePool(poolSchema.parse({ accounts: [raw] }));
    const read = createSnapshotCache(
      async () => {
        calls++;
        if (fail) throw new Error("offline");
        return accounts;
      },
      () => now,
      15,
    );
    const snapshots = await Promise.all(
      Array.from({ length: 20 }, () => read()),
    );
    expect(calls).toBe(1);
    expect(snapshots[0]!.accounts).toHaveLength(1);
    await read();
    expect(calls).toBe(1);
    now = 16;
    fail = true;
    const stale = await read();
    expect(stale.accounts).toHaveLength(1);
    expect(stale.fetchedAt).toBe(0);
    expect(stale.error).toBeTruthy();
    now = 32;
    fail = false;
    expect((await read()).error).toBeNull();
    expect(calls).toBe(3);
  });
});

it("forced refresh replaces deleted accounts inside the cache TTL", async () => {
  let accounts = normalizePool(poolSchema.parse({ accounts: [raw] }));
  const read = createSnapshotCache(async () => accounts);
  expect((await read()).accounts).toHaveLength(1);
  accounts = [];
  expect((await read()).accounts).toHaveLength(1);
  expect((await read(true)).accounts).toHaveLength(0);
});

it("omits empty Codex secondary header slots without inventing a five-hour window", () => {
  const [account] = normalizePool(
    poolSchema.parse({
      accounts: [
        {
          ...raw,
          provider: "codex",
          limitWindows: [
            {
              slot: "primary",
              windowMinutes: 10080,
              utilization: 0.08,
              resetAt: 100000,
              observedAt: 1000,
            },
            {
              slot: "secondary",
              windowMinutes: null,
              utilization: 0,
              resetAt: 1000,
              observedAt: 1000,
            },
          ],
        },
      ],
    }),
  );
  expect(account!.windows).toEqual([
    { label: "Week", used: 0.08, resetAt: 100000 },
  ]);
});

it("forced refresh during an in-flight read waits for a fresh read", async () => {
  let accounts = normalizePool(poolSchema.parse({ accounts: [raw] }));
  let calls = 0;
  const read = createSnapshotCache(async () => {
    const current = accounts;
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 0));
    return current;
  });
  const polling = read();
  await Promise.resolve();
  accounts = [];
  const forced = read(true);
  expect((await polling).accounts).toHaveLength(1);
  expect((await forced).accounts).toHaveLength(0);
  expect(calls).toBe(2);
});
