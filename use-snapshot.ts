import { useEffect, useState, useRef } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import type { Snapshot } from "./model";

/** Sequential polling; no requests or clock ticks while the page is hidden. */
export function useSnapshot() {
  const rpc = useRpc<typeof rpcContract>();
  const [snapshot, setSnapshot] = useState<Snapshot>({
    accounts: [],
    fetchedAt: null,
    error: null,
  });
  const [now, setNow] = useState(Date.now);
  const refreshRef = useRef<() => void>(() => {});
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    let disposed = false;
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh(force = false) {
      if (disposed || pending || document.hidden) return;
      clearTimeout(timer);
      pending = true;
      setRefreshing(true);
      try {
        const next = await rpc.call(force ? "refresh" : "snapshot");
        if (!disposed) {
          setSnapshot((previous) => {
            const existing = new Map(previous.accounts.map((a) => [a.id, a]));
            const accounts = next.accounts.map((a) => {
              const old = existing.get(a.id);
              return old && JSON.stringify(old) === JSON.stringify(a) ? old : a;
            });
            return { ...next, accounts };
          });
          setNow(Date.now());
        }
      } catch {
        if (!disposed) {
          setSnapshot((s) => ({
            ...s,
            error: "Connection lost · showing last received readings",
          }));
          setNow(Date.now());
        }
      } finally {
        pending = false;
        if (!disposed) setRefreshing(false);
        if (!disposed && !document.hidden)
          timer = setTimeout(() => void refresh(), 5_000);
      }
    }
    refreshRef.current = () => void refresh(true);
    const visibility = () => {
      clearTimeout(timer);
      if (!document.hidden) void refresh(true);
    };
    window.addEventListener("focus", visibility);
    document.addEventListener("visibilitychange", visibility);
    void refresh();
    return () => {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener("focus", visibility);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [rpc]);
  return { snapshot, now, refreshing, refresh: () => refreshRef.current() };
}
