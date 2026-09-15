import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
} from "react";

type Position = { x: number; y: number };
type Size = { width: number; height: number };
type Corner = "bottom-right" | "top-right" | "top-left" | "bottom-left";
const corners: Corner[] = [
  "bottom-right",
  "top-right",
  "top-left",
  "bottom-left",
];
const GAP = 8;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 180;

function readPreference(key: string) {
  try {
    return localStorage.getItem(`pool-monitor:${key}`);
  } catch {
    return null;
  }
}
function savePreference(key: string, value: unknown) {
  try {
    localStorage.setItem(
      `pool-monitor:${key}`,
      typeof value === "string" ? value : JSON.stringify(value),
    );
  } catch {
    /* Storage may be unavailable. */
  }
}
function readPosition(): Position | null {
  try {
    const value = JSON.parse(readPreference("position") ?? "null");
    return value && Number.isFinite(value.x) && Number.isFinite(value.y)
      ? { x: value.x, y: value.y }
      : null;
  } catch {
    return null;
  }
}
function readSize(): Size | null {
  try {
    const value = JSON.parse(readPreference("size") ?? "null");
    return value &&
      Number.isFinite(value.width) &&
      value.width > 0 &&
      Number.isFinite(value.height) &&
      value.height > 0
      ? { width: value.width, height: value.height }
      : null;
  } catch {
    return null;
  }
}
function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}
function fitSize(size: Size, point: Position = { x: GAP, y: GAP }): Size {
  const maxWidth = Math.max(1, window.innerWidth - point.x - GAP);
  const maxHeight = Math.max(1, window.innerHeight - point.y - GAP);
  return {
    width: clamp(size.width, Math.min(MIN_WIDTH, maxWidth), maxWidth),
    height: clamp(size.height, Math.min(MIN_HEIGHT, maxHeight), maxHeight),
  };
}
function fitPosition(point: Position, size: Size): Position {
  return {
    x: clamp(point.x, GAP, Math.max(GAP, window.innerWidth - size.width - GAP)),
    y: clamp(
      point.y,
      GAP,
      Math.max(GAP, window.innerHeight - size.height - GAP),
    ),
  };
}
function resizeGeometry(
  position: Position,
  size: Size,
  corner: Corner,
  dx: number,
  dy: number,
) {
  const left = corner.includes("left"),
    top = corner.includes("top");
  const right = position.x + size.width,
    bottom = position.y + size.height;
  const maxWidth = left ? right - GAP : window.innerWidth - position.x - GAP;
  const maxHeight = top ? bottom - GAP : window.innerHeight - position.y - GAP;
  const width = clamp(
    size.width + (left ? -dx : dx),
    Math.min(MIN_WIDTH, maxWidth),
    maxWidth,
  );
  const height = clamp(
    size.height + (top ? -dy : dy),
    Math.min(MIN_HEIGHT, maxHeight),
    maxHeight,
  );
  return {
    size: { width, height },
    position: {
      x: left ? right - width : position.x,
      y: top ? bottom - height : position.y,
    },
  };
}
const directions: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};
type Interaction = {
  kind: "drag" | "resize";
  corner?: Corner;
  id: number;
  startPointer: Position;
  startPosition: Position;
  startSize: Size;
  nextPosition: Position;
  nextSize: Size;
  maxX: number;
  maxY: number;
};

/** Pointer frames update the element directly; React and storage update only on release. */
export function useFloatingWindow(collapsed: boolean) {
  const rootRef = useRef<HTMLElement>(null);
  const [corner] = useState<Corner>(
    () =>
      corners.find((value) => value === readPreference("corner")) ??
      "bottom-right",
  );
  const [position, setPosition] = useState<Position | null>(readPosition);
  const [size, setSize] = useState<Size | null>(readSize);
  const latest = useRef({ position, size, collapsed });
  latest.current = { position, size, collapsed };
  const interaction = useRef<Interaction | null>(null);
  const frame = useRef<number | null>(null);

  function commitPosition(next: Position) {
    setPosition(next);
    savePreference("position", next);
  }
  function commitSize(next: Size) {
    setSize(next);
    savePreference("size", next);
  }
  function clearFrame() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }
  function paint() {
    const current = interaction.current;
    const root = rootRef.current;
    if (!current || !root) return;
    if (current.kind === "drag") {
      root.style.transform = `translate3d(${current.nextPosition.x - current.startPosition.x}px, ${current.nextPosition.y - current.startPosition.y}px, 0)`;
    } else {
      root.style.left = `${current.nextPosition.x}px`;
      root.style.top = `${current.nextPosition.y}px`;
      root.style.width = `${current.nextSize.width}px`;
      root.style.height = `${current.nextSize.height}px`;
    }
  }
  function schedulePaint() {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      paint();
    });
  }
  function finish() {
    const current = interaction.current;
    if (!current) return;
    clearFrame();
    interaction.current = null;
    const root = rootRef.current;
    if (!root) return;
    root.style.transform = "";
    root.style.willChange = "";
    root.removeAttribute("data-dragging");
    root.removeAttribute("data-resizing");
    if (current.kind === "resize") {
      const nextSize = fitSize(current.nextSize);
      const nextPosition = fitPosition(current.nextPosition, nextSize);
      // The last painted frame may differ even when the final React style equals
      // its original value. Apply the committed geometry before updating state.
      Object.assign(root.style, {
        left: `${nextPosition.x}px`,
        top: `${nextPosition.y}px`,
        right: "auto",
        bottom: "auto",
        width: latest.current.collapsed ? "" : `${nextSize.width}px`,
        height: latest.current.collapsed ? "" : `${nextSize.height}px`,
      });
      commitSize(nextSize);
      commitPosition(nextPosition);
    } else {
      commitPosition(fitPosition(current.nextPosition, current.startSize));
    }
  }
  function keepVisible() {
    const root = rootRef.current;
    if (!root || interaction.current) return;
    const current = latest.current;
    const nextSize = current.size ? fitSize(current.size) : null;
    if (
      nextSize &&
      (nextSize.width !== current.size?.width ||
        nextSize.height !== current.size?.height)
    )
      commitSize(nextSize);
    const rect = root.getBoundingClientRect();
    // A corner can also become invalid after a large resize or a smaller viewport.
    // Ignore missing geometry (for example, a temporarily hidden host surface).
    if (!current.position && (!rect.width || !rect.height)) return;
    const point = current.position ?? { x: rect.left, y: rect.top };
    const visibleSize =
      !current.collapsed && nextSize
        ? nextSize
        : { width: rect.width, height: rect.height };
    const next = fitPosition(point, visibleSize);
    if (next.x !== point.x || next.y !== point.y) commitPosition(next);
  }
  useLayoutEffect(() => {
    keepVisible();
    window.addEventListener("resize", keepVisible);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(keepVisible);
    if (rootRef.current) observer?.observe(rootRef.current);
    return () => {
      window.removeEventListener("resize", keepVisible);
      observer?.disconnect();
      clearFrame();
      interaction.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    finish();
    keepVisible();
  }, [collapsed, corner]);

  const dragProps: HTMLAttributes<HTMLElement> = {
    tabIndex: 0,
    title: "Drag to move · Arrow keys to nudge",
    onPointerDown(event) {
      if (
        event.button !== 0 ||
        interaction.current ||
        (event.target as HTMLElement).closest("button, input, select, a")
      )
        return;
      const root = rootRef.current;
      if (!root) return;
      event.preventDefault();
      const rect = root.getBoundingClientRect();
      event.currentTarget.setPointerCapture(event.pointerId);
      interaction.current = {
        kind: "drag",
        id: event.pointerId,
        startPointer: { x: event.clientX, y: event.clientY },
        startPosition: { x: rect.left, y: rect.top },
        startSize: { width: rect.width, height: rect.height },
        nextPosition: { x: rect.left, y: rect.top },
        nextSize: { width: rect.width, height: rect.height },
        maxX: Math.max(GAP, window.innerWidth - rect.width - GAP),
        maxY: Math.max(GAP, window.innerHeight - rect.height - GAP),
      };
      root.style.willChange = "transform";
      root.setAttribute("data-dragging", "true");
    },
    onPointerMove(event) {
      const current = interaction.current;
      if (!current || current.kind !== "drag" || current.id !== event.pointerId)
        return;
      current.nextPosition = {
        x: clamp(
          current.startPosition.x + event.clientX - current.startPointer.x,
          GAP,
          current.maxX,
        ),
        y: clamp(
          current.startPosition.y + event.clientY - current.startPointer.y,
          GAP,
          current.maxY,
        ),
      };
      schedulePaint();
    },
    onPointerUp(event) {
      if (
        interaction.current?.kind !== "drag" ||
        interaction.current.id !== event.pointerId
      )
        return;
      finish();
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: finish,
    onLostPointerCapture: finish,
    onKeyDown(event) {
      if (event.target !== event.currentTarget || interaction.current) return;
      const delta = directions[event.key];
      const root = rootRef.current;
      if (!delta || !root) return;
      event.preventDefault();
      const rect = root.getBoundingClientRect();
      const step = event.shiftKey ? 40 : 10;
      commitPosition(
        fitPosition(
          { x: rect.left + delta[0] * step, y: rect.top + delta[1] * step },
          rect,
        ),
      );
    },
  };
  const resizeProps = (
    resizeCorner: Corner,
  ): HTMLAttributes<HTMLButtonElement> => ({
    title: "Drag to resize · Arrow keys to resize",
    onPointerDown(event) {
      if (event.button !== 0 || interaction.current || collapsed) return;
      const root = rootRef.current;
      if (!root) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = root.getBoundingClientRect();
      const startSize = fitSize(rect);
      const startPosition = fitPosition(
        { x: rect.left, y: rect.top },
        startSize,
      );
      event.currentTarget.setPointerCapture(event.pointerId);
      // Fix the top-left before changing size, including when CSS anchored the panel to a corner.
      Object.assign(root.style, {
        left: `${startPosition.x}px`,
        top: `${startPosition.y}px`,
        right: "auto",
        bottom: "auto",
        width: `${startSize.width}px`,
        height: `${startSize.height}px`,
      });
      interaction.current = {
        kind: "resize",
        corner: resizeCorner,
        id: event.pointerId,
        startPointer: { x: event.clientX, y: event.clientY },
        startPosition,
        startSize,
        nextPosition: startPosition,
        nextSize: startSize,
        maxX: Math.max(1, window.innerWidth - startPosition.x - GAP),
        maxY: Math.max(1, window.innerHeight - startPosition.y - GAP),
      };
      root.setAttribute("data-resizing", "true");
    },
    onPointerMove(event) {
      const current = interaction.current;
      if (
        !current ||
        current.kind !== "resize" ||
        current.id !== event.pointerId
      )
        return;
      const next = resizeGeometry(
        current.startPosition,
        current.startSize,
        resizeCorner,
        event.clientX - current.startPointer.x,
        event.clientY - current.startPointer.y,
      );
      current.nextSize = next.size;
      current.nextPosition = next.position;
      schedulePaint();
    },
    onPointerUp(event) {
      if (
        interaction.current?.kind !== "resize" ||
        interaction.current.id !== event.pointerId
      )
        return;
      finish();
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: finish,
    onLostPointerCapture: finish,
    onKeyDown(event) {
      if (interaction.current || collapsed) return;
      const delta = directions[event.key];
      const root = rootRef.current;
      if (!delta || !root) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = root.getBoundingClientRect();
      const step = event.shiftKey ? 40 : 10;
      const currentSize = fitSize(rect);
      const next = resizeGeometry(
        { x: rect.left, y: rect.top },
        currentSize,
        resizeCorner,
        delta[0] * step,
        delta[1] * step,
      );
      commitSize(next.size);
      commitPosition(next.position);
    },
  });

  const style: CSSProperties = {
    ...(position
      ? { left: position.x, top: position.y, right: "auto", bottom: "auto" }
      : {}),
    ...(!collapsed && size ? { width: size.width, height: size.height } : {}),
  };
  return { rootRef, style, corner, dragProps, resizeProps };
}
