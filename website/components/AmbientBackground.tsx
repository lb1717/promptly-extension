"use client";

import { useEffect, useRef } from "react";

type Node = { nx: number; ny: number };
type PixelNode = { x: number; y: number };
type Edge = { a: number; b: number; phase: number; speed: number; seed: number };

function buildGraph(
  w: number,
  h: number,
  cols: number,
  rows: number,
  rng: () => number
): { nodes: PixelNode[]; edges: Edge[] } {
  const cellW = w / cols;
  const cellH = h / rows;
  const nodes: PixelNode[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (rng() > 0.48) continue;
      const jitterX = (rng() - 0.5) * cellW * 0.75;
      const jitterY = (rng() - 0.5) * cellH * 0.75;
      nodes.push({
        x: col * cellW + cellW / 2 + jitterX,
        y: row * cellH + cellH / 2 + jitterY
      });
    }
  }

  if (nodes.length < 2) {
    nodes.push({ x: w * 0.25, y: h * 0.35 }, { x: w * 0.75, y: h * 0.65 });
  }

  const maxDist = Math.min(w, h) * 0.2;
  const edges: Edge[] = [];
  const seen = new Set<string>();
  const edgeKey = (i: number, j: number) => (i < j ? `${i}-${j}` : `${j}-${i}`);

  for (let i = 0; i < nodes.length; i++) {
    const cand: { j: number; d: number }[] = [];
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (d < maxDist) cand.push({ j, d });
    }
    cand.sort((a, b) => a.d - b.d);
    const cap = 2 + Math.floor(rng() * 4);
    for (const { j } of cand.slice(0, cap)) {
      const k = edgeKey(i, j);
      if (!seen.has(k)) {
        seen.add(k);
        edges.push({
          a: i,
          b: j,
          phase: rng() * Math.PI * 2,
          speed: 0.65 + rng() * 2.4,
          seed: rng() * 1000
        });
      }
    }
  }

  if (edges.length === 0 && nodes.length >= 2) {
    edges.push({ a: 0, b: 1, phase: 0, speed: 1.2, seed: 0.5 });
  }

  return { nodes, edges };
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, cols: number, rows: number) {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.045)";
  ctx.lineWidth = 1;
  for (let c = 0; c <= cols; c++) {
    const x = (c / cols) * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let r = 0; r <= rows; r++) {
    const y = (r / rows) * h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

/** Slow, soft pulses — long periods, small amplitude (no sharp strobing). */
function lineAlpha(t: number, e: Edge): number {
  const slow = 0.5 + 0.5 * Math.sin(t * 0.000055 * e.speed + e.phase);
  const shaped = Math.pow(slow, 2.4);
  const base = 0.09 + shaped * 0.18;
  const longFlash = 0.5 + 0.5 * Math.sin(t * 0.000095 + e.seed * 0.02);
  const flashLift = Math.pow(longFlash, 6) * 0.09;
  return Math.min(0.4, base + flashLift);
}

/** Fills its positioned parent. Graph is built once at first layout (normalized coords); resize only updates the canvas, not topology. */
export function AmbientBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!canvas.getContext("2d")) return;

    let cols = 10;
    let rows = 8;
    let nodes: Node[] = [];
    let edges: Edge[] = [];
    const rng = () => Math.random();

    function initGraphFromLayout(w: number, h: number) {
      const ww = Math.max(32, w);
      const hh = Math.max(32, h);
      cols = Math.max(7, Math.min(16, Math.floor(ww / 76)));
      rows = Math.max(6, Math.min(14, Math.floor(hh / 76)));
      const built = buildGraph(ww, hh, cols, rows, rng);
      nodes = built.nodes.map((n) => ({ nx: n.x / ww, ny: n.y / hh }));
      edges = built.edges;
    }

    function syncCanvasSize(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement): { w: number; h: number } {
      const w = Math.max(1, Math.floor(c.clientWidth));
      const h = Math.max(1, Math.floor(c.clientHeight));
      const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
      const bw = Math.floor(w * dpr);
      const bh = Math.floor(h * dpr);
      if (c.width !== bw || c.height !== bh) {
        c.width = bw;
        c.height = bh;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w, h };
    }

    const ctx0 = canvas.getContext("2d");
    if (!ctx0) return;
    const first = syncCanvasSize(ctx0, canvas);
    initGraphFromLayout(first.w, first.h);

    let roTimer: number | undefined;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(roTimer);
      roTimer = window.setTimeout(() => {
        const c = canvasRef.current;
        if (!c) return;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        syncCanvasSize(ctx, c);
      }, 500);
    });
    ro.observe(canvas);

    let resizeTimer: number | undefined;
    const onWinResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const c = canvasRef.current;
        if (!c) return;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        syncCanvasSize(ctx, c);
      }, 250);
    };
    window.addEventListener("resize", onWinResize);

    let t0 = performance.now();
    function frame(now: number) {
      const c = canvasRef.current;
      if (!c) return;
      const ctx2 = c.getContext("2d");
      if (!ctx2) return;

      const { w, h } = syncCanvasSize(ctx2, c);
      const t = now - t0;

      ctx2.fillStyle = "#000000";
      ctx2.fillRect(0, 0, w, h);

      drawGrid(ctx2, w, h, cols, rows);

      for (const e of edges) {
        const ax = nodes[e.a].nx * w;
        const ay = nodes[e.a].ny * h;
        const bx = nodes[e.b].nx * w;
        const by = nodes[e.b].ny * h;
        const alpha = lineAlpha(t, e);
        const lineW = 0.85 + alpha * 0.9;

        ctx2.strokeStyle = `rgba(139, 92, 246, ${alpha * 0.28})`;
        ctx2.lineWidth = lineW + 2.5;
        ctx2.lineCap = "round";
        ctx2.beginPath();
        ctx2.moveTo(ax, ay);
        ctx2.lineTo(bx, by);
        ctx2.stroke();

        ctx2.strokeStyle = `rgba(196, 181, 253, ${alpha * 0.65})`;
        ctx2.lineWidth = lineW;
        ctx2.beginPath();
        ctx2.moveTo(ax, ay);
        ctx2.lineTo(bx, by);
        ctx2.stroke();

        if (alpha > 0.34) {
          ctx2.strokeStyle = `rgba(233, 213, 255, ${(alpha - 0.28) * 0.45})`;
          ctx2.lineWidth = 1;
          ctx2.beginPath();
          ctx2.moveTo(ax, ay);
          ctx2.lineTo(bx, by);
          ctx2.stroke();
        }
      }

      for (const n of nodes) {
        const px = n.nx * w;
        const py = n.ny * h;
        ctx2.fillStyle = "rgba(167, 139, 250, 0.5)";
        ctx2.beginPath();
        ctx2.arc(px, py, 4.2, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.fillStyle = "rgba(245, 240, 255, 0.75)";
        ctx2.beginPath();
        ctx2.arc(px, py, 2, 0, Math.PI * 2);
        ctx2.fill();
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      ro.disconnect();
      window.clearTimeout(roTimer);
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", onWinResize);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-0 h-full w-full min-h-full"
      aria-hidden
    />
  );
}
