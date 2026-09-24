// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { experimental_scanPublicSdkOnly } from "@get-bb/plugin-sdk/testing";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("registers one persistent overlay and stops polling while hidden or unmounted", async () => {
  vi.useFakeTimers();
  const loaded = await loadPluginApp(() => import("./app"));
  expect(loaded.appOverlays).toHaveLength(1);
  let count = 0;
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const view = renderSlot(
    loaded.appOverlays[0]!,
    {},
    {
      rpc: {
        refresh: () => {
          count++;
          return { accounts: [], fetchedAt: Date.now(), error: null };
        },
        snapshot: () => {
          count++;
          return { accounts: [], fetchedAt: Date.now(), error: null };
        },
      },
    },
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(count).toBe(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(count).toBe(2);
  hidden.mockReturnValue(true);
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(90000);
  });
  expect(count).toBe(2);
  hidden.mockReturnValue(false);
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(count).toBe(3);
  view.lifecycle.unmount();
  await vi.advanceTimersByTimeAsync(90000);
  expect(count).toBe(3);
});
it("uses only public SDK surfaces", async () => {
  const report = await experimental_scanPublicSdkOnly(process.cwd(), {
    allow: [
      /^@testing-library\/react$/,
      /^vitest$/,
      /^react$/,
      /^@radix-ui\/react-tooltip$/,
    ],
  });
  expect(report.violations).toEqual([]);
  expect(report.privateDependencies).toEqual([]);
});
