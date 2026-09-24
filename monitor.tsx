import {
  memo,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  isStale,
  resetText,
  type Account,
  type QuotaWindow,
  type Snapshot,
} from "./model";
import { useFloatingWindow } from "./use-floating-window";

const ROW_HEIGHT = 36;
const GROUP_HEIGHT = 24;
const LIST_HEIGHT = 288;
const PAGE_INSET_SELECTOR = '[data-sidebar="inset"]';
const PAGE_SHELF_ATTRIBUTES = [
  "data-sidebar-shelf",
  "data-panel-shelf",
  "style",
];

/**
 * On a phone bb reveals the sidebar and the right panel as shelves that slide
 * the page aside. This window is fixed at the app root, so it would stay put
 * and cover the open shelf. bb marks the page inset while a shelf is settled
 * (data-sidebar-shelf, data-panel-shelf) and moves it with an inline translate
 * while a swipe or settle is in flight, so the window hides for as long as
 * either says the page is shelved. Desktop never sets these, and a missing
 * inset leaves the window as it is.
 */
function isPageShelved(inset: HTMLElement): boolean {
  const sidebarShelf = inset.getAttribute("data-sidebar-shelf");
  const panelShelf = inset.getAttribute("data-panel-shelf");
  if (
    sidebarShelf === "open" ||
    panelShelf === "shelf" ||
    panelShelf === "full"
  )
    return true;
  const translate = inset.style.translate ?? "";
  return (
    translate !== "" && translate !== "none" && parseFloat(translate) !== 0
  );
}
function usePageShelved(): boolean {
  const [shelved, setShelved] = useState(false);
  useLayoutEffect(() => {
    const inset = document.querySelector(PAGE_INSET_SELECTOR);
    if (
      !(inset instanceof HTMLElement) ||
      typeof MutationObserver !== "function"
    )
      return;
    const update = () => setShelved(isPageShelved(inset));
    update();
    const observer = new MutationObserver(update);
    observer.observe(inset, {
      attributes: true,
      attributeFilter: PAGE_SHELF_ATTRIBUTES,
    });
    return () => observer.disconnect();
  }, []);
  return shelved;
}
function preference(key: string): string | null {
  try {
    return localStorage.getItem(`pool-monitor:${key}`);
  } catch {
    return null;
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(`pool-monitor:${key}`, value);
  } catch {
    /* Private storage. */
  }
}
function providerName(provider: string) {
  return provider === "claude"
    ? "Claude"
    : provider === "codex"
      ? "Codex"
      : provider;
}
function stateText(a: Account) {
  return !a.enabled
    ? "Disabled"
    : a.hasError
      ? "Needs attention"
      : a.active > 0
        ? `${a.active} running`
        : a.status;
}
function ageText(at: number | null, now: number) {
  if (at === null) return "Not observed";
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  return seconds < 60
    ? `${seconds}s ago`
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m ago`
      : `${Math.floor(seconds / 3600)}h ago`;
}
function clockText(at: number | null) {
  if (at === null) return null;
  try {
    return new Date(at).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}
function Tip({
  content,
  children,
  side = "top",
  align = "center",
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="pm-tip"
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
        >
          {content}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
function ProviderLogo({ provider }: { provider: string }) {
  if (provider === "claude")
    return (
      <svg
        className="pm-logo pm-logo-claude"
        viewBox="0 0 24 24"
        width="11"
        height="11"
        aria-hidden="true"
        fill="currentColor"
      >
        <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.146-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.365 1.942h.213l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.65 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" />
      </svg>
    );
  if (provider === "codex")
    return (
      <svg
        className="pm-logo pm-logo-codex"
        viewBox="0 0 24 24"
        width="11"
        height="11"
        aria-hidden="true"
        fill="currentColor"
      >
        <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
      </svg>
    );
  return null;
}
function Icon({
  name,
}: {
  name: "minimize" | "restore" | "close" | "refresh" | "accounts";
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "minimize" ? (
        <path d="M4 11h8" />
      ) : name === "restore" ? (
        <>
          <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
          <path d="M3 6h10" />
        </>
      ) : name === "close" ? (
        <path d="m4 4 8 8M12 4l-8 8" />
      ) : name === "refresh" ? (
        <>
          <path d="M13 8a5 5 0 1 1-1.5-3.6" />
          <path d="M13 2.5v3h-3" />
        </>
      ) : name === "accounts" ? (
        <>
          <circle cx="8" cy="5.5" r="2.5" />
          <path d="M3 13.5c0-2.5 2.2-4 5-4s5 1.5 5 4" />
        </>
      ) : (
        <path d="m3 13 10-10m-6 10 6-6m-2 6 2-2" />
      )}
    </svg>
  );
}

function QuotaCell({
  account,
  quota,
  label,
  now,
  showLabel,
}: {
  account: Account;
  quota?: QuotaWindow;
  label: string;
  now: number;
  showLabel: boolean;
}) {
  const used = quota?.used ?? null;
  const value = used === null ? null : Math.round(used * 100);
  const reset = resetText(quota?.resetAt ?? null, now);
  const resetLabel = !quota
    ? "Not reported"
    : quota.resetAt === null
      ? "Reset unknown"
      : reset === "Awaiting update"
        ? reset
        : `Resets in ${reset}`;
  const tone =
    used === null
      ? "unknown"
      : used >= 0.9
        ? "critical"
        : used >= 0.75
          ? "warning"
          : "normal";
  const stale = isStale(account, now);
  return (
    <Tip
      content={
        <>
          <strong>
            {label === "5h"
              ? "5-hour limit"
              : label === "Week"
                ? "Weekly limit"
                : label}
          </strong>
          <span>{value === null ? "Usage unknown" : `${value}% used`}</span>
          <span>{resetLabel}</span>
          {stale && <span className="pm-tip-warn">Old reading</span>}
        </>
      }
    >
      <span
        className={`pm-cell pm-${tone}`}
        onPointerMove={(e) => e.stopPropagation()}
      >
        {showLabel && <span className="pm-cell-label">{label}</span>}
        <span
          className="pm-meter"
          role="meter"
          aria-label={`${account.label} ${label} used`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value ?? undefined}
          aria-valuetext={value === null ? "Usage unknown" : `${value}% used`}
        >
          <span className="pm-percent">
            {value === null ? "—" : `${value}%`}
          </span>
          <span className="pm-reset" aria-label={resetLabel}>
            {quota?.resetAt == null
              ? "—"
              : reset === "Awaiting update"
                ? "Pending"
                : reset}
          </span>
          <span className="pm-track">
            <span
              style={{
                transform: `scaleX(${value === null ? 0 : value / 100})`,
              }}
            />
          </span>
        </span>
      </span>
    </Tip>
  );
}

type Group = {
  provider: string;
  accounts: Account[];
  labels: string[];
  columns: number;
  extended: boolean;
};
type Item = { top: number; height: number; group: Group; account?: Account };
function GroupHeading({ group }: { group: Group }) {
  return (
    <div
      className="pm-group pm-grid"
      style={{ "--pm-columns": group.columns } as CSSProperties}
    >
      <Tip
        side="bottom"
        align="start"
        content={`${group.accounts.length} ${providerName(group.provider)} ${group.accounts.length === 1 ? "account" : "accounts"} in the pool`}
      >
        <span className="pm-provider-name">
          <ProviderLogo provider={group.provider} />
          {providerName(group.provider)} <small>{group.accounts.length}</small>
        </span>
      </Tip>
      <span
        className={`pm-quotas ${group.extended ? "pm-extended-heading" : ""}`}
      >
        {group.extended || !group.labels.length ? (
          <span>All limits · resets in</span>
        ) : (
          group.labels.map((label) => (
            <span key={label} title={label}>
              {label === "5h" ? "5 hours" : label === "Week" ? "Weekly" : label}
            </span>
          ))
        )}
      </span>
    </div>
  );
}
function buildLayout(accounts: Account[]) {
  const groups = new Map<string, Group>();
  for (const account of accounts) {
    let group = groups.get(account.provider);
    if (!group) {
      group = {
        provider: account.provider,
        accounts: [],
        labels: [],
        columns: 2,
        extended: false,
      };
      groups.set(account.provider, group);
    }
    group.accounts.push(account);
    for (const window of account.windows)
      if (!group.labels.includes(window.label)) group.labels.push(window.label);
  }
  const items: Item[] = [];
  let total = 0;
  for (const group of groups.values()) {
    // Keep the familiar session/week columns stable across accounts and refreshes.
    group.labels.sort((a, b) => {
      const rank = (s: string) => (s === "5h" ? 0 : s === "Week" ? 1 : 2);
      return rank(a) - rank(b);
    });
    group.columns = Math.min(3, Math.max(1, group.labels.length));
    group.extended = group.labels.length > 3;
    items.push({ top: total, height: GROUP_HEIGHT, group });
    total += GROUP_HEIGHT;
    for (const account of group.accounts) {
      const height = group.extended
        ? Math.max(1, Math.ceil(account.windows.length / 3)) * 48
        : ROW_HEIGHT;
      items.push({ top: total, height, group, account });
      total += height;
    }
  }
  return { items, total };
}
function visibleItems(items: Item[], scrollTop: number, height: number) {
  let low = 0,
    high = items.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (items[mid]!.top + items[mid]!.height < scrollTop) low = mid + 1;
    else high = mid;
  }
  const start = Math.max(0, low - 2);
  let end = low;
  while (end < items.length && items[end]!.top < scrollTop + height) end++;
  return items.slice(start, Math.min(items.length, end + 2));
}
const AccountRow = memo(function AccountRow({
  item,
  now,
}: {
  item: Item;
  now: number;
}) {
  const a = item.account!;
  const stale = isStale(a, now);
  const state = stateText(a);
  const labels = item.group.extended
    ? a.windows.map((w) => w.label)
    : item.group.labels;
  return (
    <Tip
      side="bottom"
      align="start"
      content={
        <>
          <strong>{a.identity}</strong>
          <span>
            {providerName(a.provider)} · {a.plan} · {state}
          </span>
          <span>Observed {ageText(a.observedAt, now)}</span>
          {a.windows.map((w) => (
            <span key={w.label} className="pm-tip-row">
              <span>{w.label}</span>
              <span>
                {w.used === null ? "Unknown" : `${Math.round(w.used * 100)}%`} ·{" "}
                {w.resetAt === null
                  ? "Reset unknown"
                  : resetText(w.resetAt, now)}
              </span>
            </span>
          ))}
        </>
      }
    >
      <button
        className={`pm-row pm-grid ${stale ? "pm-stale" : ""} ${!a.enabled ? "pm-disabled" : ""}`}
        style={
          {
            height: item.height,
            "--pm-columns": item.group.columns,
          } as CSSProperties
        }
      >
        <span className="pm-account">
          <span className="pm-name">
            <span
              className={`pm-status-dot ${a.hasError || !a.enabled || a.status !== "ready" ? "pm-attention" : a.active ? "pm-running" : ""}`}
            />
            <span className="pm-name-text">{a.identity}</span>
          </span>
        </span>
        <span className="pm-quotas">
          {labels.length ? (
            labels.map((label) => (
              <QuotaCell
                key={label}
                account={a}
                quota={a.windows.find((w) => w.label === label)}
                label={label}
                now={now}
                showLabel={item.group.extended}
              />
            ))
          ) : (
            <span className="pm-no-quota">Quota not reported</span>
          )}
        </span>
      </button>
    </Tip>
  );
});

export function Monitor({
  snapshot,
  now,
  onRefresh,
  refreshing = false,
}: {
  onRefresh?: () => void;
  refreshing?: boolean;
  snapshot: Snapshot;
  now: number;
}) {
  const [collapsed, setCollapsed] = useState(
    () => preference("collapsed") === "true",
  );
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(LIST_HEIGHT);
  const scrollRef = useRef<HTMLDivElement>(null);
  const floating = useFloatingWindow(collapsed);
  const shelved = usePageShelved();
  const layout = useMemo(
    () => buildLayout(snapshot.accounts),
    [snapshot.accounts],
  );
  const ready = snapshot.accounts.filter(
    (a) => a.enabled && a.status === "ready" && !a.hasError,
  ).length;
  const staleCount = snapshot.accounts.filter((a) => isStale(a, now)).length;
  const active = snapshot.accounts.reduce((sum, a) => sum + a.active, 0);
  const visible = visibleItems(layout.items, scrollTop, viewportHeight);
  const checkedAt = clockText(snapshot.fetchedAt);
  // The last check always stays in the footer, even when a warning takes the lead.
  const freshness = [
    snapshot.error
      ? "Connection issue"
      : staleCount
        ? `${staleCount} old ${staleCount === 1 ? "reading" : "readings"}`
        : active
          ? `${active} running`
          : null,
    snapshot.fetchedAt === null
      ? snapshot.error
        ? "saved readings"
        : "Connecting…"
      : `Checked ${ageText(snapshot.fetchedAt, now)}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const pinnedGroup =
    [...visible].reverse().find((item) => item.top <= scrollTop)?.group ??
    visible[0]?.group;
  const nextHeading = visible.find(
    (item) => !item.account && item.top > scrollTop,
  );
  const headingOffset = nextHeading
    ? Math.min(0, nextHeading.top - scrollTop - GROUP_HEIGHT)
    : 0;
  useLayoutEffect(() => {
    const list = scrollRef.current;
    if (!list) return;
    const measure = () => {
      // Resize only changes the rendered range when another row can become visible.
      if (list.clientHeight)
        setViewportHeight(
          Math.ceil(list.clientHeight / ROW_HEIGHT) * ROW_HEIGHT,
        );
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(list);
    return () => observer?.disconnect();
  }, [collapsed]);
  useLayoutEffect(() => {
    const list = scrollRef.current;
    if (!list) return;
    const max = Math.max(
      0,
      layout.total - (list.clientHeight || viewportHeight),
    );
    if (scrollTop > max) {
      list.scrollTop = max;
      setScrollTop(max);
    }
  }, [layout.total, viewportHeight, scrollTop]);
  function resetScroll() {
    setScrollTop(0);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }
  function toggle() {
    resetScroll();
    setCollapsed(!collapsed);
    save("collapsed", String(!collapsed));
  }
  return (
    <Tooltip.Provider delayDuration={250} skipDelayDuration={400}>
      <aside
        ref={floating.rootRef}
        className={`pm-root pm-${floating.corner} ${collapsed ? "pm-collapsed" : ""} ${shelved ? "pm-shelved" : ""}`}
        style={floating.style}
        aria-label="Usage Window"
        aria-hidden={shelved || undefined}
      >
        <header
          className="pm-header"
          tabIndex={0}
          aria-label="Drag to move monitor"
          {...floating.dragProps}
          title={undefined}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("button")) return;
            floating.dragProps.onClick?.(event);
            if (!event.defaultPrevented) toggle();
          }}
          onKeyDown={(event) => {
            if (
              event.target === event.currentTarget &&
              (event.key === "Enter" || event.key === " ")
            ) {
              event.preventDefault();
              toggle();
            } else {
              floating.dragProps.onKeyDown?.(event);
            }
          }}
        >
          <Tip
            side="bottom"
            align="start"
            content={
              <>
                <strong>
                  {snapshot.error
                    ? "Account Pooler unreachable"
                    : snapshot.fetchedAt === null
                      ? "Connecting to Account Pooler"
                      : "Account Pooler connected"}
                </strong>
                <span>
                  {ready} of {snapshot.accounts.length} ready
                  {active ? ` · ${active} running` : ""}
                </span>
                <span className="pm-tip-hint">
                  Tap to {collapsed ? "expand" : "minimize"} · Drag to move
                </span>
              </>
            }
          >
            <div className="pm-title">
              <span
                className={`pm-signal ${snapshot.error ? "pm-attention" : ""}`}
              />
              <strong>Usage</strong>
              <span>
                {ready}/{snapshot.accounts.length} ready
              </span>
            </div>
          </Tip>
          <Tip content={collapsed ? "Expand" : "Minimize"}>
            <button
              className="pm-icon"
              aria-label={
                collapsed
                  ? "Expand account monitor"
                  : "Minimize account monitor"
              }
              onClick={toggle}
            >
              <Icon name={collapsed ? "restore" : "minimize"} />
            </button>
          </Tip>
        </header>
        {!collapsed && (
          <div className="pm-body">
            <div
              className="pm-list"
              ref={scrollRef}
              role="region"
              aria-label="Pooled account list"
              tabIndex={0}
              style={{
                height: Math.min(
                  LIST_HEIGHT,
                  Math.max(ROW_HEIGHT, layout.total),
                ),
              }}
              onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            >
              {!snapshot.accounts.length ? (
                <p className="pm-empty">
                  {snapshot.fetchedAt === null
                    ? snapshot.error
                      ? "Account Pooler is unavailable."
                      : "Loading pool…"
                    : "No pooled accounts configured."}
                </p>
              ) : (
                <>
                  {pinnedGroup && (
                    <div
                      className="pm-pinned"
                      aria-label="Current provider and quota columns"
                      style={{ transform: `translateY(${headingOffset}px)` }}
                    >
                      <GroupHeading group={pinnedGroup} />
                    </div>
                  )}
                  <div style={{ height: layout.total, position: "relative" }}>
                    {visible.map((item) => (
                      <div
                        key={
                          item.account?.id ?? `provider:${item.group.provider}`
                        }
                        style={{
                          position: "absolute",
                          top: item.top,
                          left: 0,
                          right: 0,
                          height: item.height,
                        }}
                      >
                        {item.account ? (
                          <AccountRow item={item} now={now} />
                        ) : (
                          item.group !== pinnedGroup && (
                            <GroupHeading group={item.group} />
                          )
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <footer className="pm-footer">
              <Tip
                align="start"
                content={
                  <>
                    <strong>
                      {snapshot.error
                        ? "Connection issue"
                        : `Pool checked ${ageText(snapshot.fetchedAt, now)}${checkedAt ? ` · ${checkedAt}` : ""}`}
                    </strong>
                    <span>
                      {snapshot.error ??
                        (staleCount
                          ? `${staleCount} ${staleCount === 1 ? "account has" : "accounts have"} readings older than 5 minutes.`
                          : "Account observations may be older than the pool check.")}
                    </span>
                    <span className="pm-tip-hint">
                      Cells show percent used and time until reset.
                    </span>
                  </>
                }
              >
                <span className="pm-freshness" role="status">
                  {freshness}
                </span>
              </Tip>
              <Tip content={refreshing ? "Refreshing…" : "Refresh readings"}>
                <button
                  className={`pm-icon ${refreshing ? "pm-spinning" : ""}`}
                  onClick={onRefresh}
                  disabled={refreshing || !onRefresh}
                  aria-label={refreshing ? "Refreshing" : "Refresh"}
                >
                  <Icon name="refresh" />
                </button>
              </Tip>
              <Tip content="Manage accounts / Sign in" align="end">
                <a
                  className="pm-icon"
                  href="/settings/plugins/account-pool"
                  aria-label="Manage accounts"
                >
                  <Icon name="accounts" />
                </a>
              </Tip>
            </footer>
          </div>
        )}
        {!collapsed &&
          (
            ["top-left", "top-right", "bottom-left", "bottom-right"] as const
          ).map((corner) => (
            <button
              key={corner}
              className={`pm-resize pm-resize-${corner}`}
              aria-label={`Resize monitor ${corner.replace("-", " ")}`}
              {...floating.resizeProps(corner)}
            />
          ))}
      </aside>
    </Tooltip.Provider>
  );
}
