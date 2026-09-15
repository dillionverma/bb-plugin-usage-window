import { expect, it } from "vitest";
import { additionalAccounts, usageSchema } from "./provider-usage";
it("discovers provider usage and ignores unavailable installations", () => {
  const data = usageSchema.parse({
    machines: [
      {
        id: "host",
        displayName: "Mac",
        providers: [
          {
            id: "future",
            displayName: "Future",
            usage: {
              status: "ok",
              accountEmail: "a@example.com",
              planLabel: "Pro",
              windows: [{ label: "Monthly", usedPercent: 25, resetsAt: null }],
            },
          },
          {
            id: "cursor",
            displayName: "Cursor",
            usage: { status: "not_installed" },
          },
        ],
      },
    ],
  });
  const accounts = additionalAccounts(data, []);
  expect(accounts).toHaveLength(1);
  expect(accounts[0]!.windows).toEqual([
    { label: "Monthly", used: 0.25, resetAt: null },
  ]);
  expect(
    additionalAccounts(data, [{ ...accounts[0]!, provider: "future" }]),
  ).toEqual([]);
});
