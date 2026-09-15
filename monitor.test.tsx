// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { Monitor } from "./monitor";
import type { Account, Snapshot } from "./model";
const now = Date.now();
function makeAccounts(count: number): Account[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i),
    provider: i % 2 ? "claude" : "codex",
    label: `Account ${i}`,
    identity: `test-${i}@example.com`,
    plan: "Pro",
    status: "ready",
    enabled: true,
    active: 0,
    observedAt: now,
    retryAt: null,
    hasError: false,
    windows: [{ label: "Week", used: 0.25, resetAt: now + 3600000 }],
  }));
}
const accounts = makeAccounts(200);
const snapshot: Snapshot = { accounts, fetchedAt: now, error: null };
afterEach(() => {
  cleanup();
  localStorage.clear();
});

it.each([20, 200, 2000])(
  "keeps %i accounts accessible with bounded DOM rows",
  (count) => {
    const view = render(
      <Monitor
        snapshot={{ ...snapshot, accounts: makeAccounts(count) }}
        now={now}
      />,
    );
    expect(
      view.container.querySelectorAll(".pm-row").length,
    ).toBeLessThanOrEqual(12);
    expect(view.getByText("test-0@example.com")).toBeTruthy();
    fireEvent.scroll(view.getByLabelText("Pooled account list"), {
      target: { scrollTop: count * 36 + 48 - 288 },
    });
    expect(view.getByText(`test-${count - 1}@example.com`)).toBeTruthy();
    expect(
      view.container.querySelectorAll(".pm-row").length,
    ).toBeLessThanOrEqual(12);
  },
);
it("keeps only window controls and uses usage even with an old Left preference", () => {
  localStorage.setItem("pool-monitor:display", "left");
  const view = render(<Monitor snapshot={snapshot} now={now} />);
  expect(view.queryByLabelText("Search accounts")).toBeNull();
  expect(view.queryByLabelText("Find pooled accounts")).toBeNull();
  expect(view.queryByLabelText("Quota display")).toBeNull();
  expect(view.queryByRole("button", { name: "Left" })).toBeNull();
  expect(
    view
      .getByRole("meter", { name: "Account 0 Week used" })
      .getAttribute("aria-valuenow"),
  ).toBe("25");
  expect(view.queryByLabelText("Move monitor to next corner")).toBeNull();
  fireEvent.click(view.getByText("test-0@example.com"));
  expect(view.getAllByText("test-0@example.com")).toHaveLength(1);
  expect(
    view.getByText("test-0@example.com").closest("button")!.title,
  ).toContain("Observed");
  expect(view.queryByLabelText("Account details")).toBeNull();
});
it("preserves corner and collapsed mode and restores the start of a scrolled list", () => {
  const view = render(<Monitor snapshot={snapshot} now={now} />);
  fireEvent.scroll(view.getByLabelText("Pooled account list"), {
    target: { scrollTop: 8000 },
  });

  fireEvent.click(view.getByLabelText("Minimize account monitor"));
  expect(view.getByText("200/200 ready")).toBeTruthy();
  view.unmount();
  const next = render(<Monitor snapshot={snapshot} now={now} />);
  expect(next.getByLabelText("Usage Window").className).toContain(
    "pm-bottom-right",
  );
  expect(next.queryByLabelText("Pooled account list")).toBeNull();
  fireEvent.click(next.getByLabelText("Expand account monitor"));
  expect(next.getByText("test-0@example.com")).toBeTruthy();
});
it("shows every Claude/Codex limit with its matching reset and account without opening details", () => {
  const claude = {
    ...accounts[0]!,
    provider: "claude",
    windows: [
      { label: "5h", used: 0.2, resetAt: now + 110 * 60000 },
      { label: "Week", used: 0.34, resetAt: now + 68 * 3600000 },
      { label: "Fable week", used: 0, resetAt: now + 69 * 3600000 },
    ],
  };
  const codex = {
    ...accounts[1]!,
    provider: "codex",
    windows: [
      { label: "5h", used: 0.15, resetAt: now + 70 * 60000 },
      { label: "Week", used: 0.67, resetAt: now + 80 * 3600000 },
    ],
  };
  const view = render(
    <Monitor snapshot={{ ...snapshot, accounts: [claude, codex] }} now={now} />,
  );
  expect(view.getAllByRole("meter")).toHaveLength(5);
  const row = within(view.getByText("test-0@example.com").closest("button")!);
  expect(
    row
      .getByRole("meter", { name: "Account 0 5h used" })
      .getAttribute("aria-valuenow"),
  ).toBe("20");
  expect(
    row
      .getByRole("meter", { name: "Account 0 Fable week used" })
      .getAttribute("aria-valuenow"),
  ).toBe("0");
  expect(row.getByText("1h 50m")).toBeTruthy();
  expect(row.getByText("2d 20h")).toBeTruthy();
  expect(row.getByText("2d 21h")).toBeTruthy();
  expect(view.queryByLabelText("Account details")).toBeNull();
});
it("keeps extra limits visible beyond three, and distinguishes unknown and elapsed readings", () => {
  const account = {
    ...accounts[0]!,
    observedAt: now - 6 * 60000,
    windows: [
      { label: "5h", used: 0.2, resetAt: now + 3600000 },
      { label: "Week", used: null, resetAt: null },
      { label: "Opus week", used: 0.98, resetAt: now - 1 },
      { label: "Fable week", used: 0.4, resetAt: now + 7200000 },
      { label: "Sonnet week", used: 0.3, resetAt: now + 10800000 },
    ],
  };
  const view = render(
    <Monitor snapshot={{ ...snapshot, accounts: [account] }} now={now} />,
  );
  expect(view.getAllByRole("meter")).toHaveLength(5);
  const unknown = view.getByRole("meter", { name: "Account 0 Week used" });
  expect(unknown.getAttribute("aria-valuenow")).toBeNull();
  expect(unknown.getAttribute("aria-valuetext")).toBe("Usage unknown");
  expect(view.getByText("Pending").getAttribute("aria-label")).toBe(
    "Awaiting update",
  );
  expect(view.getByText("1 old reading")).toBeTruthy();
  fireEvent.click(view.getByText("test-0@example.com"));
  const tooltip = view.getByText("test-0@example.com").closest("button")!.title;
  expect(tooltip).toContain("Awaiting update");
  expect(tooltip).toContain("Reset unknown");
  expect(view.queryByLabelText("Account details")).toBeNull();
});
it("clamps a scrolled list when accounts disappear on refresh", () => {
  const view = render(<Monitor snapshot={snapshot} now={now} />);
  fireEvent.scroll(view.getByLabelText("Pooled account list"), {
    target: { scrollTop: 8500 },
  });
  view.rerender(
    <Monitor
      snapshot={{ ...snapshot, accounts: accounts.slice(0, 2) }}
      now={now}
    />,
  );
  expect(view.getByText("test-0@example.com")).toBeTruthy();
  expect(view.getByText("test-1@example.com")).toBeTruthy();
});

it("keeps provider and quota labels pinned while scrolling between groups", () => {
  const view = render(<Monitor snapshot={snapshot} now={now} />);
  const list = view.getByLabelText("Pooled account list");
  const heading = () =>
    within(view.getByLabelText("Current provider and quota columns"));
  fireEvent.scroll(list, { target: { scrollTop: 3000 } });
  expect(heading().getByText("Codex")).toBeTruthy();
  expect(heading().getByText("Weekly")).toBeTruthy();
  fireEvent.scroll(list, { target: { scrollTop: 6000 } });
  expect(heading().getByText("Claude")).toBeTruthy();
  expect(heading().getByText("Weekly")).toBeTruthy();
});
