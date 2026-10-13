import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, expect, it } from "vitest";
import type { z } from "zod";
import plugin from "./server";

const hosts: ReturnType<typeof createFakePluginHost>[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.harness.lifecycle.dispose();
});

type Call = { pluginId: string; method: string; input: unknown };
function fixture() {
  let utilization = 0.1;
  const calls: Call[] = [];
  const host = createFakePluginHost({ pluginId: "pool-monitor" });
  host.harness.sdk.stub("plugins.callRpc", (async ({
    pluginId,
    method,
    input,
    outputSchema,
  }: Call & { outputSchema: z.ZodType }) => {
    calls.push({ pluginId, method, input });
    if (method === "account.refreshUsage") {
      utilization = 0.6;
      return { account: null };
    }
    if (method === "getUsage") return outputSchema.parse({ machines: [] });
    return outputSchema.parse([
      {
        id: "a",
        provider: "claude",
        label: "A",
        enabled: true,
        status: "ready",
        fiveHourUtilization: utilization,
      },
      {
        id: "b",
        provider: "claude",
        label: "B",
        enabled: false,
        status: "ready",
      },
      {
        id: "c",
        provider: "claude",
        label: "C",
        enabled: true,
        status: "ready",
        kind: "api_key",
      },
    ]);
  }) as never);
  hosts.push(host);
  plugin(host.bb);
  const methods = (name: string) => calls.filter((c) => c.method === name);
  return { host, calls, methods };
}

it("polls read cached readings without asking providers for new ones", async () => {
  const f = fixture();
  await f.host.harness.behavior.callRpc("snapshot", null);
  expect(f.methods("account.refreshUsage")).toEqual([]);
  expect(f.methods("getUsage")[0]!.input).toMatchObject({
    force: false,
    providerId: null,
  });
});

it("refresh fetches upstream usage for enabled OAuth accounts before reading", async () => {
  const f = fixture();
  await f.host.harness.behavior.callRpc("snapshot", null);
  const snapshot = (await f.host.harness.behavior.callRpc("refresh", null)) as {
    accounts: { id: string; windows: { used: number | null }[] }[];
  };
  expect(f.methods("account.refreshUsage").map((c) => c.input)).toEqual([
    { accountId: "a" },
  ]);
  expect(f.methods("getUsage").at(-1)!.input).toMatchObject({ force: true });
  expect(snapshot.accounts.find((a) => a.id === "a")!.windows[0]!.used).toBe(
    0.6,
  );
});

it("clicking one account refreshes only that account", async () => {
  const f = fixture();
  await f.host.harness.behavior.callRpc("refreshAccount", { accountId: "a" });
  expect(f.methods("account.refreshUsage").map((c) => c.input)).toEqual([
    { accountId: "a" },
  ]);
});
