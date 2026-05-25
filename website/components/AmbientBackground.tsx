"use client";

import { useEffect, useState } from "react";

const TARGET_CELL = 76;

type AmbientBackgroundProps = {
  /** Kept for compatibility; canvas animation was removed in favor of a static grid. */
  variant?: "canvas" | "static";
};

function computeSquareCellSize(viewportWidth: number, viewportHeight: number): number {
  if (viewportWidth <= 0) {
    return TARGET_CELL;
  }

  const idealCols = Math.max(1, Math.round(viewportWidth / TARGET_CELL));
  const minCols = Math.max(1, idealCols - 2);
  const maxCols = Math.max(minCols, idealCols + 2);

  let bestCell = viewportWidth / idealCols;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let cols = minCols; cols <= maxCols; cols += 1) {
    const cell = viewportWidth / cols;
    const rows = viewportHeight / cell;
    const rowRemainder = Math.abs(rows - Math.round(rows));
    const sizeDelta = Math.abs(cell - TARGET_CELL) / TARGET_CELL;
    const score = rowRemainder * 1.25 + sizeDelta;

    if (score < bestScore) {
      bestScore = score;
      bestCell = cell;
    }
  }

  return bestCell;
}

function readViewportSize() {
  return {
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight
  };
}

/** Subtle page grid — cell size snaps so columns fit the viewport width edge-to-edge. */
export function AmbientBackground({ variant: _variant = "canvas" }: AmbientBackgroundProps) {
  const [cellSize, setCellSize] = useState(TARGET_CELL);

  useEffect(() => {
    let frame = 0;

    const syncGrid = () => {
      const { width, height } = readViewportSize();
      setCellSize(computeSquareCellSize(width, height));
    };

    const scheduleSync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(syncGrid);
    };

    syncGrid();
    window.addEventListener("resize", scheduleSync);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleSync);
    };
  }, []);

  const size = `${cellSize}px ${cellSize}px`;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 min-h-full bg-page"
      style={{
        backgroundImage: `
          linear-gradient(to right, rgba(17, 17, 17, 0.06) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(17, 17, 17, 0.06) 1px, transparent 1px)
        `,
        backgroundSize: size
      }}
      aria-hidden
    />
  );
}
