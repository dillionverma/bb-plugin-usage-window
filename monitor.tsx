import {
  memo,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
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
function Icon({ name }: { name: "minimize" | "restore" | "close" }) {
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
  return (
    <span
      className={`pm-cell pm-${tone}`}
      title={`${label} · ${value === null ? "Usage unknown" : `${value}% used`} · ${resetLabel}${isStale(account, now) ? " · Old reading" : ""}`}
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
        <span className="pm-percent">{value === null ? "—" : `${value}%`}</span>
        <span className="pm-reset" aria-label={resetLabel}>
          {quota?.resetAt == null
            ? "—"
            : reset === "Awaiting update"
              ? "Pending"
              : reset}
        </span>
        <span className="pm-track">
          <span
            style={{ transform: `scaleX(${value === null ? 0 : value / 100})` }}
          />
        </span>
      </span>
    </span>
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
      <span className="pm-provider-name">
        {providerName(group.provider)} <small>{group.accounts.length}</small>
      </span>
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
    <button
      className={`pm-row pm-grid ${stale ? "pm-stale" : ""} ${!a.enabled ? "pm-disabled" : ""}`}
      style={
        {
          height: item.height,
          "--pm-columns": item.group.columns,
        } as CSSProperties
      }
      title={`${a.identity} · ${a.plan} · ${state} · Observed ${ageText(a.observedAt, now)}${a.windows.map((w) => `\n${w.label}: ${w.used === null ? "Unknown" : `${Math.round(w.used * 100)}% used`} · ${resetText(w.resetAt, now)}`).join("")}`}
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
        title="Drag to move · Arrow keys to nudge"
        {...floating.dragProps}
      >
        <div className="pm-title">
          <span
            className={`pm-signal ${snapshot.error ? "pm-attention" : ""}`}
          />
          <strong>Pool</strong>
          <span>
            {ready}/{snapshot.accounts.length} ready
          </span>
        </div>
        <button
          className="pm-icon"
          aria-label={
            collapsed ? "Expand account monitor" : "Minimize account monitor"
          }
          title={collapsed ? "Expand" : "Minimize"}
          onClick={toggle}
        >
          <Icon name={collapsed ? "restore" : "minimize"} />
        </button>
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
              height: Math.min(LIST_HEIGHT, Math.max(ROW_HEIGHT, layout.total)),
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
          <div className="pm-actions">
            <button onClick={onRefresh} disabled={refreshing || !onRefresh}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <a href="/settings/plugins/account-pool">
              Manage accounts / Sign in
            </a>
          </div>
          <footer className="pm-footer">
            <span
              className="pm-freshness"
              role="status"
              title={
                snapshot.error ??
                `Pool checked ${ageText(snapshot.fetchedAt, now)}. Account observations may be older.`
              }
            >
              {snapshot.error
                ? "Connection issue · saved readings"
                : staleCount
                  ? `${staleCount} old ${staleCount === 1 ? "reading" : "readings"}`
                  : snapshot.fetchedAt === null
                    ? "Connecting…"
                    : `${active ? `${active} running · ` : ""}Checked ${ageText(snapshot.fetchedAt, now)}`}
            </span>
            <span className="pm-legend">Used · resets in</span>
          </footer>
        </div>
      )}
      {!collapsed &&
        (["top-left", "top-right", "bottom-left", "bottom-right"] as const).map(
          (corner) => (
            <button
              key={corner}
              className={`pm-resize pm-resize-${corner}`}
              aria-label={`Resize monitor ${corner.replace("-", " ")}`}
              {...floating.resizeProps(corner)}
            />
          ),
        )}
    </aside>
  );
}
