import { useEffect, useState, useRef } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import type { Snapshot } from "./model";

type Request = { kind: "all" } | { kind: "account"; accountId: string };

/** Sequential polling; no requests or clock ticks while the page is hidden. */
export function useSnapshot() {
  const rpc = useRpc<typeof rpcContract>();
  const [snapshot, setSnapshot] = useState<Snapshot>({
    accounts: [],
    fetchedAt: null,
    error: null,
  });
  const [now, setNow] = useState(Date.now);
  const requestRef = useRef<(request: Request) => void>(() => {});
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingAccounts, setRefreshingAccounts] = useState<
    ReadonlySet<string>
  >(new Set());
  useEffect(() => {
    let disposed = false;
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Clicks made while a poll is in flight run next instead of being dropped.
    const queue: Request[] = [];
    function apply(next: Snapshot) {
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
    function mark(request: Request, busy: boolean) {
      if (request.kind === "all") return setRefreshing(busy);
      setRefreshingAccounts((ids) => {
        const next = new Set(ids);
        if (busy) next.add(request.accountId);
        else next.delete(request.accountId);
        return next;
      });
    }
    async function poll(request?: Request) {
      if (disposed || pending) return;
      if (document.hidden) {
        if (request) mark(request, false);
        return;
      }
      clearTimeout(timer);
      pending = true;
      try {
        apply(
          await (request?.kind === "all"
            ? rpc.call("refresh")
            : request?.kind === "account"
              ? rpc.call("refreshAccount", { accountId: request.accountId })
              : rpc.call("snapshot")),
        );
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
        if (request && !disposed) mark(request, false);
        const next = queue.shift();
        if (next && !disposed) void poll(next);
        else if (!disposed && !document.hidden)
          timer = setTimeout(() => void poll(), 5_000);
      }
    }
    requestRef.current = (request) => {
      if (disposed) return;
      mark(request, true);
      if (pending) queue.push(request);
      else void poll(request);
    };
    const visibility = () => {
      clearTimeout(timer);
      if (!document.hidden) void poll();
    };
    window.addEventListener("focus", visibility);
    document.addEventListener("visibilitychange", visibility);
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener("focus", visibility);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [rpc]);
  return {
    snapshot,
    now,
    refreshing,
    refreshingAccounts,
    refresh: () => requestRef.current({ kind: "all" }),
    refreshAccount: (accountId: string) =>
      requestRef.current({ kind: "account", accountId }),
  };
}
