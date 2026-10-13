import type { z } from "zod";
import type {
  accountSchema,
  snapshotSchema,
  windowSchema,
  poolSchema,
} from "./schemas";

export type Account = z.infer<typeof accountSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type QuotaWindow = z.infer<typeof windowSchema>;
export const STALE_MS = 5 * 60_000;

function durationLabel(minutes: number | null): string | null {
  if (minutes === null) return null;
  if (minutes === 10080) return "Week";
  if (minutes >= 1440 && minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

function displayName(value: string): string {
  const name = value.replace(/[_-]+/g, " ");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function normalizePool(raw: z.infer<typeof poolSchema>): Account[] {
  return raw.accounts.map((a) => {
    const windows: QuotaWindow[] = [];
    const add = (
      label: string,
      used: number | null,
      resetAt: number | null,
    ) => {
      windows.push({
        label,
        used: used === null ? null : Math.max(0, Math.min(1, used)),
        resetAt,
      });
    };
    if (a.limitWindows.length > 0) {
      // Explicit provider windows supersede the legacy Claude duration fields.
      // A slot is a distinct quota even when another slot has the same duration.
      for (const w of a.limitWindows) {
        // Codex can emit an empty secondary header slot with an immediate reset.
        // It has no identified window and carries no usable quota measurement.
        if (
          w.slot === "secondary" &&
          w.windowMinutes === null &&
          w.utilization === 0 &&
          w.resetAt !== null &&
          w.observedAt !== null &&
          w.resetAt <= w.observedAt
        )
          continue;
        const duration = durationLabel(w.windowMinutes);
        const sharedDuration = a.limitWindows.some(
          (other) => other !== w && other.windowMinutes === w.windowMinutes,
        );
        const standardSlot = w.slot === "primary" || w.slot === "secondary";
        const label =
          duration === null
            ? standardSlot
              ? `${w.slot === "primary" ? "Main" : "Other"} limit · duration unknown`
              : `${displayName(w.slot)} · duration unknown`
            : standardSlot && !sharedDuration
              ? duration
              : `${displayName(w.slot)} · ${duration}`;
        add(label, w.utilization, w.resetAt);
      }
    } else {
      if (a.fiveHourUtilization !== null || a.fiveHourResetAt !== null)
        add("5h", a.fiveHourUtilization, a.fiveHourResetAt);
      if (a.sevenDayUtilization !== null || a.sevenDayResetAt !== null)
        add("Week", a.sevenDayUtilization, a.sevenDayResetAt);
    }
    for (const [family, w] of Object.entries(a.familyWeekly))
      if (w) add(`${displayName(family)} week`, w.utilization, w.resetAt);
    const tier = a.rateLimitTier?.match(/max_(\d+)x/)?.[1];
    return {
      id: a.id,
      provider: a.provider,
      label: a.label,
      identity: a.email ?? a.id.slice(0, 8),
      plan:
        a.kind === "api-key"
          ? "API key"
          : tier
            ? `Max ${tier}×`
            : (a.subscriptionType ?? "Plan unknown"),
      status: a.status,
      enabled: a.enabled,
      active: a.inFlight,
      observedAt: a.observedAt,
      retryAt: a.heldUntil,
      windows,
      hasError: a.error !== null,
    };
  });
}
export function isStale(a: Account, now: number): boolean {
  return a.observedAt === null || now - a.observedAt > STALE_MS;
}
export function resetText(time: number | null, now: number): string {
  if (time === null) return "Reset unknown";
  if (time <= now) return "Awaiting update";
  const minutes = Math.ceil((time - now) / 60000);
  return minutes < 60
    ? `${minutes}m`
    : minutes < 1440
      ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
      : `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
}
