import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { normalizePool } from "./model";
import { poolSchema, snapshotSchema } from "./schemas";
import { additionalAccounts, usageSchema } from "./provider-usage";
import { createSnapshotCache } from "./cache";

export const rpcContract = defineRpcContract({
  refresh: { input: z.null(), output: snapshotSchema },
  refreshAccount: {
    input: z.object({ accountId: z.string() }),
    output: snapshotSchema,
  },
  snapshot: { input: z.null(), output: snapshotSchema },
});
export default function plugin(bb: BbPluginApi) {
  let extraData: import("zod").z.infer<typeof usageSchema> = { machines: [] };
  let extraReadAt = 0;
  async function listPool() {
    return bb.sdk.plugins.callRpc({
      pluginId: "account-pool",
      method: "account.list",
      input: null,
      outputSchema: poolSchema.shape.accounts,
    });
  }
  async function readExtra(force: boolean) {
    try {
      extraData = await bb.sdk.plugins.callRpc({
        pluginId: "provider-usage",
        method: "getUsage",
        input: { force, machineIds: null, providerId: null, maxAgeMs: 60_000 },
        outputSchema: usageSchema,
      });
    } catch {
      /* Pooled readings remain available if optional usage sources are offline. */
    }
    extraReadAt = Date.now() + 60_000;
  }
  /** Asks the upstream provider for new quota numbers; a failed account keeps its last reading. */
  async function refreshPooled(accountIds: string[]) {
    await Promise.allSettled(
      accountIds.map((accountId) =>
        bb.sdk.plugins.callRpc({
          pluginId: "account-pool",
          method: "account.refreshUsage",
          input: { accountId },
          outputSchema: z.unknown(),
        }),
      ),
    );
  }
  const read = createSnapshotCache(async () => {
    const pooled = normalizePool({ accounts: await listPool() });
    if (Date.now() >= extraReadAt) await readExtra(false);
    return [...pooled, ...additionalAccounts(extraData, pooled)];
  });
  // Clicks from several windows share one upstream round instead of stacking requests.
  let upstream: Promise<void> | null = null;
  function refreshAll() {
    upstream ??= (async () => {
      const accounts = await listPool().catch(() => []);
      await Promise.allSettled([
        refreshPooled(
          accounts
            .filter((a) => a.enabled && a.kind === "oauth")
            .map((a) => a.id),
        ),
        readExtra(true),
      ]);
    })().finally(() => {
      upstream = null;
    });
    return upstream;
  }
  bb.rpc.register(rpcContract, {
    snapshot: () => read(),
    refresh: async () => {
      await refreshAll();
      return read(true);
    },
    refreshAccount: async ({ accountId }) => {
      // Provider Usage rows have no per-account refresh, so they re-collect every source.
      if (accountId.startsWith("usage:")) await readExtra(true);
      else await refreshPooled([accountId]);
      return read(true);
    },
  });
  bb.cli.register({
    name: "pool-monitor",
    summary: "Inspect pooled account monitor readings",
    commands: [
      {
        name: "status",
        summary: "Read cached quota status",
        usage: "bb pool-monitor status",
      },
    ],
    async run(argv) {
      if (argv.length !== 1 || argv[0] !== "status")
        return { exitCode: 1, stderr: "Usage: bb pool-monitor status" };
      const s = await read();
      return {
        exitCode: s.error ? 1 : 0,
        stdout: JSON.stringify({
          accounts: s.accounts.length,
          ready: s.accounts.filter((a) => a.enabled && a.status === "ready")
            .length,
          fetchedAt: s.fetchedAt,
          error: s.error,
        }),
      };
    },
  });
}
