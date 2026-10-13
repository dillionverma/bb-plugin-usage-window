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
  let queued: Promise<Snapshot> | null = null;
  const get = (force = false): Promise<Snapshot> => {
    if (pending) {
      if (!force) return pending;
      // A forced read must start after the in-flight one, or it would return pre-refresh data.
      return (queued ??= pending.then(() => {
        queued = null;
        return get(true);
      }));
    }
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
  return get;
}
