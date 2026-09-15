---
name: pool-monitor
description: Inspect the persistent Usage Window account quota display or troubleshoot its readings.
---

Run `bb pool-monitor status` to verify the shared Account Pooler read and account count. The monitor reads non-secret `account-pool` summaries; it does not refresh credentials, route requests, or fetch upstream quotas.

The app-wide panel groups accounts by provider with account identities and every reported quota. Each quota shows a bar, percentage and reset countdown. All percentages show usage; there is no Left mode or search control. Unknown usage remains a dash; elapsed resets show Pending, with Awaiting update in details. More than three limits wrap into labeled rows. No capacity-weighted pool total is inferred.

Drag the whole header to move; drag the any of the four corners to resize. Arrow keys on the focused header or resize handle move/resize (Shift for larger steps). Minus minimizes. Refresh bypasses the reading cache; Manage accounts / Sign in opens Account Pooler settings for login, reauthentication and quota refresh. Position, size and collapsed mode persist per browser. Hover an account for plan, status, observation age and reset details. Each account shows one email line. Only reported quota windows get columns, ordered five-hour then weekly when both exist. Empty Codex secondary header slots are omitted. Account Pooler exhausted status is displayed as At limit; observation age is in the hover tooltip. Additional accounts are discovered through BB Provider Usage, deduplicated against pooled accounts. OpenCode/Zen and Pi currently do not expose BB quota usage.

Old readings are marked after five minutes. Errors retain the last successful snapshot. Reads share a 3-second cache and one in-flight request; visible tabs poll every 5 seconds and hidden tabs stop. Only visible rows plus a buffer are rendered. Drag/resize uses one frame at a time and saves preferences on release.
