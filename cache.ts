import type { Snapshot } from "./model";

/** One shared read per TTL, including concurrent requests from multiple windows. */
export function createSnapshotCache(
  read: () => Promise<Snapshot["accounts"]>,
  clock = Date.now,
  ttl = 3_000,
) {
  let snapshot: Snapshot = { accounts: [], fetchedAt: null, error: null };
  let nextReadAt = 0;
  let pending: Promise<Snapshot> | null = null;
  return (force = false) => {
    if (pending) return pending;
    if (!force && clock() < nextReadAt) return Promise.resolve(snapshot);
    pending = Promise.resolve()
      .then(read)
      .then(
        (accounts) => {
          snapshot = { accounts, fetchedAt: clock(), error: null };
          return snapshot;
        },
        () => {
          snapshot = {
            ...snapshot,
            error: "Pool unavailable · showing last received readings",
          };
          return snapshot;
        },
      )
      .finally(() => {
        nextReadAt = clock() + ttl;
        pending = null;
      });
    return pending;
  };
}
