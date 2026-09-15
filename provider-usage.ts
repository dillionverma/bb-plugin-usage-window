import { z } from "zod";
import type { Account } from "./model";
export const usageSchema = z.object({
  machines: z.array(
    z.object({
      id: z.string(),
      displayName: z.string(),
      providers: z.array(
        z.object({
          id: z.string(),
          providerId: z.string().optional(),
          displayName: z.string(),
          usage: z
            .object({
              status: z.string(),
              accountEmail: z.string().nullable().optional(),
              planLabel: z.string().nullable().optional(),
              windows: z
                .array(
                  z.object({
                    label: z.string(),
                    usedPercent: z.number(),
                    resetsAt: z.string().nullable(),
                  }),
                )
                .optional(),
            })
            .nullable(),
        }),
      ),
    }),
  ),
});
export function additionalAccounts(
  data: z.infer<typeof usageSchema>,
  pooled: Account[],
): Account[] {
  const result: Account[] = [];
  for (const machine of data.machines)
    for (const p of machine.providers) {
      const usage = p.usage;
      if (!usage || usage.status === "not_installed") continue;
      const provider =
        (p.providerId ?? p.id) === "claude-code"
          ? "claude"
          : (p.providerId ?? p.id);
      if (
        pooled.some(
          (a) =>
            a.provider === provider &&
            (!usage.accountEmail ||
              a.identity.toLowerCase() === usage.accountEmail.toLowerCase()),
        )
      )
        continue;
      if (
        result.some(
          (a) =>
            a.provider === p.displayName && a.identity === usage.accountEmail,
        )
      )
        continue;
      result.push({
        id: `usage:${machine.id}:${p.id}`,
        provider: p.displayName,
        label: p.displayName,
        identity:
          usage.accountEmail ?? `${p.displayName} · ${machine.displayName}`,
        plan: usage.planLabel ?? "Plan unknown",
        status: usage.status === "ok" ? "ready" : usage.status,
        enabled: true,
        active: 0,
        observedAt: null,
        retryAt: null,
        hasError: usage.status !== "ok",
        windows: (usage.windows ?? []).map((w) => ({
          label: w.label,
          used: Math.max(0, Math.min(1, w.usedPercent / 100)),
          resetAt:
            w.resetsAt && Number.isFinite(Date.parse(w.resetsAt))
              ? Date.parse(w.resetsAt)
              : null,
        })),
      });
    }
  return result;
}
