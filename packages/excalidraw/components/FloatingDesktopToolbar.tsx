import clsx from "clsx";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { collapseDownIcon, DotsIcon, PlusIcon } from "./icons";
import { Island } from "./Island";
import Stack from "./Stack";

import "./FloatingDesktopToolbar.scss";

const STORAGE_KEY = "excalidraw-floating-toolbar-v1";

type Stored = { x: number; y: number; collapsed: boolean };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function readStored(): Partial<Stored> {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    return JSON.parse(raw) as Partial<Stored>;
  } catch {
    return {};
  }
}

function defaultPosition(): { x: number; y: number } {
  if (typeof window === "undefined") {
    return { x: 100, y: 72 };
  }
  const pad = 16;
  const approxWidth = 420;
  return {
    x: Math.round(Math.max(pad, (window.innerWidth - approxWidth) / 2)),
    y: 72,
  };
}

type FloatingDesktopToolbarProps = {
  children: React.ReactNode;
  zenModeEnabled: boolean;
};

/**
 * Draggable desktop shape toolbar with optional collapsed “ball” state.
 * Position and collapsed flag persist in localStorage.
 */
export const FloatingDesktopToolbar: React.FC<FloatingDesktopToolbarProps> = ({
  children,
  zenModeEnabled,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{
    originX: number;
    originY: number;
    pointerX: number;
    pointerY: number;
  } | null>(null);

  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    const s = readStored();
    if (typeof s.x === "number" && typeof s.y === "number") {
      return { x: s.x, y: s.y };
    }
    return defaultPosition();
  });

  const [collapsed, setCollapsed] = useState(() => {
    const s = readStored();
    return typeof s.collapsed === "boolean" ? s.collapsed : false;
  });

  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const payload: Stored = { ...pos, collapsed };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore quota / private mode
    }
  }, [pos, collapsed]);

  const clampToViewport = useCallback(() => {
    const el = rootRef.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const maxX = window.innerWidth - rect.width - margin;
    const maxY = window.innerHeight - rect.height - margin;
    setPos((p) => ({
      x: clamp(p.x, margin, Math.max(margin, maxX)),
      y: clamp(p.y, margin, Math.max(margin, maxY)),
    }));
  }, []);

  useEffect(() => {
    const onResize = () => clampToViewport();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampToViewport]);

  useEffect(() => {
    clampToViewport();
  }, [collapsed, clampToViewport]);

  useEffect(() => {
    if (!dragging) {
      return;
    }

    const onMove = (e: PointerEvent) => {
      const d = dragStartRef.current;
      const el = rootRef.current;
      if (!d || !el) {
        return;
      }
      const dx = e.clientX - d.pointerX;
      const dy = e.clientY - d.pointerY;
      const rect = el.getBoundingClientRect();
      const margin = 8;
      const maxX = window.innerWidth - rect.width - margin;
      const maxY = window.innerHeight - rect.height - margin;
      setPos({
        x: clamp(d.originX + dx, margin, Math.max(margin, maxX)),
        y: clamp(d.originY + dy, margin, Math.max(margin, maxY)),
      });
    };

    const onUp = () => {
      dragStartRef.current = null;
      setDragging(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging]);

  const onDragHandlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      dragStartRef.current = {
        originX: pos.x,
        originY: pos.y,
        pointerX: e.clientX,
        pointerY: e.clientY,
      };
      setDragging(true);
    },
    [pos.x, pos.y],
  );

  return (
    <div
      ref={rootRef}
      className={clsx("floating-desktop-toolbar", {
        "floating-desktop-toolbar--collapsed": collapsed,
        "floating-desktop-toolbar--zen": zenModeEnabled,
      })}
      style={{ left: pos.x, top: pos.y }}
    >
      {!collapsed && (
        <div className="floating-desktop-toolbar__inner">
          <Island padding={0} className="floating-desktop-toolbar__chrome">
            <button
              type="button"
              className="floating-desktop-toolbar__chrome-hit"
              aria-label="Drag toolbar — hover for more options"
              title="Drag — hover for options"
              onPointerDown={onDragHandlePointerDown}
            >
              <span
                className="floating-desktop-toolbar__chrome-pebble"
                aria-hidden={true}
              />
            </button>
            <div className="floating-desktop-toolbar__chrome-menu">
              <Stack.Col gap={1} align="center">
                <button
                  type="button"
                  className="floating-desktop-toolbar__icon-button"
                  aria-label="Drag toolbar"
                  title="Drag toolbar"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onDragHandlePointerDown(e);
                  }}
                >
                  {DotsIcon}
                </button>
                <button
                  type="button"
                  className="floating-desktop-toolbar__icon-button"
                  aria-label="Minimize toolbar"
                  title="Minimize toolbar"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCollapsed(true);
                  }}
                >
                  {collapseDownIcon}
                </button>
              </Stack.Col>
            </div>
          </Island>
          {children}
        </div>
      )}
      {collapsed && (
        <Island padding={1} className="floating-desktop-toolbar__ball">
          <Stack.Col gap={1} align="center">
            <button
              type="button"
              className="floating-desktop-toolbar__icon-button"
              aria-label="Drag toolbar"
              title="Drag toolbar"
              onPointerDown={onDragHandlePointerDown}
            >
              {DotsIcon}
            </button>
            <button
              type="button"
              className="floating-desktop-toolbar__icon-button floating-desktop-toolbar__expand"
              aria-label="Expand toolbar"
              title="Expand toolbar"
              onClick={() => setCollapsed(false)}
            >
              {PlusIcon}
            </button>
          </Stack.Col>
        </Island>
      )}
    </div>
  );
};
