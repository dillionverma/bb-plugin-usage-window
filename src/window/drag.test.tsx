// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { Monitor } from "./monitor";
const snapshot = { accounts: [], fetchedAt: 1, error: null };
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("drags with capture, saves the position,", () => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    }),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const view = render(<Monitor snapshot={snapshot} now={1} />);
  const panel = view.getByLabelText("Usage Window");
  vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
    left: 600,
    top: 300,
    width: 352,
    height: 200,
  } as DOMRect);
  const grip = view.getByLabelText("Drag to move monitor");
  grip.setPointerCapture = vi.fn();
  grip.releasePointerCapture = vi.fn();
  fireEvent.pointerDown(view.getByText("Usage"), {
    button: 0,
    clientX: 620,
    clientY: 320,
  });
  fireEvent.pointerMove(grip, { clientX: 220, clientY: 120 });
  expect(localStorage.getItem("pool-monitor:position")).toBeNull();
  expect(panel.style.left).toBe("");
  expect(frames).toHaveLength(1);
  frames[0]!(0);
  expect(panel.style.transform).toBe("translate3d(-400px, -200px, 0)");
  fireEvent.pointerUp(grip);
  fireEvent.click(grip);
  expect(panel.style.transform).toBe("");
  expect(view.getByLabelText("Pooled account list")).toBeTruthy();
  expect(panel.style.left).toBe("200px");
  expect(panel.style.top).toBe("100px");
  fireEvent.pointerMove(grip, { clientX: 400, clientY: 400 });
  expect(panel.style.left).toBe("200px");
  view.unmount();
  const next = render(<Monitor snapshot={snapshot} now={1} />);
  expect(next.getByLabelText("Usage Window").style.left).toBe("200px");
});
it("keeps saved positions visible after viewport shrink and supports keyboard movement", () => {
  localStorage.setItem("pool-monitor:position", '{"x":900,"y":600}');
  const view = render(<Monitor snapshot={snapshot} now={1} />);
  const panel = view.getByLabelText("Usage Window");
  vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
    left: 10,
    top: 20,
    width: 352,
    height: 200,
  } as DOMRect);
  vi.stubGlobal("innerWidth", 400);
  vi.stubGlobal("innerHeight", 300);
  fireEvent(window, new Event("resize"));
  expect(panel.style.left).toBe("40px");
  expect(panel.style.top).toBe("92px");
  fireEvent.keyDown(view.getByLabelText("Drag to move monitor"), {
    key: "ArrowLeft",
    shiftKey: true,
  });
  expect(panel.style.left).toBe("8px");
});
it("ignores malformed saved positions and sizes", () => {
  localStorage.setItem("pool-monitor:position", '{"x":"bad","y":4}');
  localStorage.setItem("pool-monitor:size", '{"width":-2,"height":"bad"}');
  const view = render(<Monitor snapshot={snapshot} now={1} />);
  expect(view.getByLabelText("Usage Window").style.left).toBe("");
  expect(view.getByLabelText("Usage Window").style.width).toBe("");
  expect(view.getByLabelText("Usage Window").style.height).toBe("");
});

it("toggles from header taps and preserves the icon button without double toggling", () => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  const view = render(<Monitor snapshot={snapshot} now={1} />);
  const header = view.getByLabelText("Drag to move monitor");
  header.setPointerCapture = vi.fn();
  header.releasePointerCapture = vi.fn();
  fireEvent.pointerDown(view.getByText("Usage"), {
    button: 0,
    clientX: 620,
    clientY: 320,
  });
  fireEvent.pointerMove(header, { clientX: 622, clientY: 321 });
  fireEvent.pointerUp(header);
  fireEvent.click(view.getByText("Usage"));
  expect(view.queryByLabelText("Pooled account list")).toBeNull();
  expect(localStorage.getItem("pool-monitor:position")).toBeNull();
  fireEvent.click(header);
  expect(view.getByLabelText("Pooled account list")).toBeTruthy();
  vi.mocked(header.setPointerCapture).mockClear();
  const minimize = view.getByLabelText("Minimize account monitor");
  fireEvent.pointerDown(minimize, { button: 0 });
  expect(header.setPointerCapture).not.toHaveBeenCalled();
  fireEvent.click(minimize);
  expect(view.queryByLabelText("Pooled account list")).toBeNull();
  fireEvent.click(view.getByLabelText("Expand account monitor"));
  expect(view.getByLabelText("Pooled account list")).toBeTruthy();
  fireEvent.keyDown(header, { key: "Enter" });
  expect(view.queryByLabelText("Pooled account list")).toBeNull();
  fireEvent.keyDown(header, { key: " " });
  expect(view.getByLabelText("Pooled account list")).toBeTruthy();
});

it("resizes once per frame from a fixed top-left and persists on release", () => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    }),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const view = render(<Monitor snapshot={snapshot} now={1} />);
  const panel = view.getByLabelText("Usage Window");
  const measure = vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
    left: 100,
    top: 120,
    width: 440,
    height: 260,
  } as DOMRect);
  const resize = view.getByLabelText("Resize monitor bottom right");
  resize.setPointerCapture = vi.fn();
  resize.releasePointerCapture = vi.fn();
  fireEvent.pointerDown(resize, { button: 0, clientX: 540, clientY: 380 });
  expect(resize.setPointerCapture).toHaveBeenCalledOnce();
  expect(panel.style.left).toBe("100px");
  expect(panel.style.top).toBe("120px");
  expect(panel.style.right).toBe("auto");
  expect(panel.style.bottom).toBe("auto");
  fireEvent.pointerMove(resize, { clientX: 590, clientY: 400 });
  fireEvent.pointerMove(resize, { clientX: 640, clientY: 460 });
  expect(measure).toHaveBeenCalledOnce();
  expect(frames).toHaveLength(1);
  expect(panel.style.width).toBe("440px");
  expect(localStorage.getItem("pool-monitor:size")).toBeNull();
  expect(localStorage.getItem("pool-monitor:position")).toBeNull();
  frames[0]!(0);
  expect(panel.style.width).toBe("540px");
  expect(panel.style.height).toBe("340px");
  expect(panel.style.left).toBe("100px");
  fireEvent.pointerUp(resize);
  expect(resize.releasePointerCapture).toHaveBeenCalledOnce();
  expect(panel.hasAttribute("data-resizing")).toBe(false);
  expect(JSON.parse(localStorage.getItem("pool-monitor:size")!)).toEqual({
    width: 540,
    height: 340,
  });
  expect(JSON.parse(localStorage.getItem("pool-monitor:position")!)).toEqual({
    x: 100,
    y: 120,
  });
  view.unmount();
  const next = render(<Monitor snapshot={snapshot} now={1} />);
  const restored = next.getByLabelText("Usage Window");
  expect(restored.style.width).toBe("540px");
  expect(restored.style.height).toBe("340px");
  fireEvent.click(next.getByLabelText("Minimize account monitor"));
  expect(restored.style.width).toBe("");
  expect(restored.style.height).toBe("");
  expect(next.queryByLabelText("Resize monitor bottom right")).toBeNull();
  fireEvent.click(next.getByLabelText("Expand account monitor"));
  expect(restored.style.width).toBe("540px");
  expect(restored.style.height).toBe("340px");
});

it("constrains resizing, supports keyboard resizing, and fits small viewports", () => {
  const view = render(<Monitor snapshot={snapshot} now={1} />);
  const panel = view.getByLabelText("Usage Window");
  const measure = vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
    left: 100,
    top: 120,
    width: 330,
    height: 190,
  } as DOMRect);
  const resize = view.getByLabelText("Resize monitor bottom right");
  fireEvent.keyDown(resize, { key: "ArrowLeft", shiftKey: true });
  expect(panel.style.width).toBe("320px");
  expect(panel.style.left).toBe("100px");
  measure.mockReturnValue({
    left: 100,
    top: 120,
    width: 320,
    height: 190,
  } as DOMRect);
  fireEvent.keyDown(resize, { key: "ArrowUp", shiftKey: true });
  expect(panel.style.height).toBe("180px");
  measure.mockReturnValue({
    left: 100,
    top: 120,
    width: 320,
    height: 180,
  } as DOMRect);
  fireEvent.keyDown(resize, { key: "ArrowRight" });
  expect(panel.style.width).toBe("330px");
  vi.stubGlobal("innerWidth", 300);
  vi.stubGlobal("innerHeight", 160);
  fireEvent(window, new Event("resize"));
  expect(panel.style.width).toBe("284px");
  expect(panel.style.height).toBe("144px");
  expect(panel.style.left).toBe("8px");
  expect(panel.style.top).toBe("8px");
});

it("commits the last resize even before its frame runs and cancels frames on unmount", () => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 42),
  );
  const cancelFrame = vi.fn();
  vi.stubGlobal("cancelAnimationFrame", cancelFrame);
  const view = render(<Monitor snapshot={snapshot} now={1} />);
  const panel = view.getByLabelText("Usage Window");
  vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
    left: 8,
    top: 8,
    width: 440,
    height: 260,
  } as DOMRect);
  const resize = view.getByLabelText("Resize monitor bottom right");
  resize.setPointerCapture = vi.fn();
  resize.releasePointerCapture = vi.fn();
  fireEvent.pointerDown(resize, { button: 0, clientX: 448, clientY: 268 });
  fireEvent.pointerMove(resize, { clientX: 1, clientY: 1 });
  fireEvent.pointerUp(resize);
  expect(cancelFrame).toHaveBeenCalledWith(42);
  expect(panel.style.width).toBe("320px");
  expect(panel.style.height).toBe("180px");
  cancelFrame.mockClear();
  fireEvent.pointerDown(resize, { button: 0, clientX: 448, clientY: 268 });
  fireEvent.pointerMove(resize, { clientX: 550, clientY: 350 });
  view.unmount();
  expect(cancelFrame).toHaveBeenCalledWith(42);
});

it.each(["pointerUp", "pointerCancel", "lostPointerCapture"] as const)(
  "restores the actual size after a resize roundtrip ending with %s",
  (ending) => {
    vi.stubGlobal("PointerEvent", MouseEvent);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((cb: FrameRequestCallback) => {
        frames.push(cb);
        return frames.length;
      }),
    );
    const cancelFrame = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancelFrame);
    localStorage.setItem("pool-monitor:position", '{"x":100,"y":120}');
    localStorage.setItem("pool-monitor:size", '{"width":440,"height":260}');
    const view = render(<Monitor snapshot={snapshot} now={1} />);
    const panel = view.getByLabelText("Usage Window");
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
      left: 100,
      top: 120,
      width: 440,
      height: 260,
    } as DOMRect);
    const resize = view.getByLabelText("Resize monitor bottom right");
    resize.setPointerCapture = vi.fn();
    resize.releasePointerCapture = vi.fn();
    fireEvent.pointerDown(resize, { button: 0, clientX: 540, clientY: 380 });
    fireEvent.pointerMove(resize, { clientX: 640, clientY: 460 });
    frames[0]!(0);
    expect(panel.style.width).toBe("540px");
    expect(panel.style.height).toBe("340px");
    fireEvent.pointerMove(resize, { clientX: 540, clientY: 380 });
    fireEvent[ending](resize);
    expect(cancelFrame).toHaveBeenCalledWith(2);
    expect(panel.style.width).toBe("440px");
    expect(panel.style.height).toBe("260px");
    expect(panel.style.left).toBe("100px");
    expect(panel.style.top).toBe("120px");
    expect(panel.hasAttribute("data-resizing")).toBe(false);
    expect(JSON.parse(localStorage.getItem("pool-monitor:size")!)).toEqual({
      width: 440,
      height: 260,
    });
    fireEvent.pointerMove(resize, { clientX: 900, clientY: 600 });
    expect(frames).toHaveLength(2);
    // Grabbing and releasing without moving should also preserve the same size.
    fireEvent.pointerDown(resize, { button: 0, clientX: 540, clientY: 380 });
    fireEvent.pointerUp(resize);
    expect(panel.style.width).toBe("440px");
    expect(panel.style.height).toBe("260px");
  },
);

it.each([
  ["top left", 250, 250, 350, 250],
  ["top right", 200, 250, 250, 250],
  ["bottom left", 250, 200, 350, 150],
  ["bottom right", 200, 200, 250, 150],
])(
  "resizes %s while keeping its opposite corner fixed",
  (corner, x, y, dx, dy) => {
    vi.stubGlobal("PointerEvent", MouseEvent);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const view = render(<Monitor snapshot={snapshot} now={1} />);
    const panel = view.getByLabelText("Usage Window");
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
      left: 200,
      top: 200,
      width: 440,
      height: 260,
    } as DOMRect);
    const grip = view.getByLabelText(`Resize monitor ${corner}`);
    grip.setPointerCapture = vi.fn();
    grip.releasePointerCapture = vi.fn();
    fireEvent.pointerDown(grip, { button: 0, clientX: 300, clientY: 200 });
    fireEvent.pointerMove(grip, { clientX: dx, clientY: dy });
    fireEvent.pointerUp(grip);
    expect(panel.style.left).toBe(`${x}px`);
    expect(panel.style.top).toBe(`${y}px`);
    expect(panel.style.width).toBe("390px");
    expect(panel.style.height).toBe("210px");
  },
);
