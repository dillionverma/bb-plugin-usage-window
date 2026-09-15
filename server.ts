import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { normalizePool } from "./model";
import { poolSchema, snapshotSchema } from "./schemas";
import { additionalAccounts, usageSchema } from "./provider-usage";
import { createSnapshotCache } from "./cache";

export const rpcContract = defineRpcContract({
  refresh: { input: z.null(), output: snapshotSchema },
  snapshot: { input: z.null(), output: snapshotSchema },
});
export default function plugin(bb: BbPluginApi) {
  let extraData: import("zod").z.infer<typeof usageSchema> = { machines: [] };
  let extraReadAt = 0;
  const read = createSnapshotCache(async () => {
    const pooled = normalizePool({
      accounts: await bb.sdk.plugins.callRpc({
        pluginId: "account-pool",
        method: "account.list",
        input: null,
        outputSchema: poolSchema.shape.accounts,
      }),
    });
    if (Date.now() >= extraReadAt) {
      try {
        extraData = await bb.sdk.plugins.callRpc({
          pluginId: "provider-usage",
          method: "getUsage",
          input: { force: false, machineIds: null, maxAgeMs: 60_000 },
          outputSchema: usageSchema,
        });
      } catch {
        /* Pooled readings remain available if optional usage sources are offline. */
      }
      extraReadAt = Date.now() + 60_000;
    }
    return [...pooled, ...additionalAccounts(extraData, pooled)];
  });
  bb.rpc.register(rpcContract, {
    snapshot: () => read(),
    refresh: () => read(true),
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
