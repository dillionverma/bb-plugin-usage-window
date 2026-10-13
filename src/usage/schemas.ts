import { z } from "zod";

const nullableNumber = z.number().finite().nullable().default(null);
const rawWindow = z.object({
  slot: z.string(),
  windowMinutes: nullableNumber,
  utilization: nullableNumber,
  resetAt: nullableNumber,
  observedAt: nullableNumber,
});
export const poolSchema = z.object({
  accounts: z.array(
    z.object({
      id: z.string(),
      provider: z.string(),
      label: z.string(),
      email: z.string().nullable().default(null),
      kind: z.string().default("oauth"),
      subscriptionType: z.string().nullable().default(null),
      rateLimitTier: z.string().nullable().default(null),
      enabled: z.boolean(),
      status: z.string(),
      inFlight: z.number().default(0),
      observedAt: nullableNumber,
      heldUntil: nullableNumber,
      error: z.string().nullable().default(null),
      fiveHourUtilization: nullableNumber,
      fiveHourResetAt: nullableNumber,
      sevenDayUtilization: nullableNumber,
      sevenDayResetAt: nullableNumber,
      limitWindows: z.array(rawWindow).default([]),
      familyWeekly: z
        .record(
          z.string(),
          z
            .object({ utilization: nullableNumber, resetAt: nullableNumber })
            .nullable(),
        )
        .default({}),
    }),
  ),
});
export const windowSchema = z.object({
  label: z.string(),
  used: nullableNumber,
  resetAt: nullableNumber,
});
export const accountSchema = z.object({
  id: z.string(),
  provider: z.string(),
  label: z.string(),
  identity: z.string(),
  plan: z.string(),
  status: z.string(),
  enabled: z.boolean(),
  active: z.number(),
  observedAt: nullableNumber,
  retryAt: nullableNumber,
  windows: z.array(windowSchema),
  hasError: z.boolean(),
});
export const snapshotSchema = z.object({
  accounts: z.array(accountSchema),
  fetchedAt: nullableNumber,
  error: z.string().nullable(),
});
