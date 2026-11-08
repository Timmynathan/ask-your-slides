"use client";

// Small, dependency-free charts for /admin. One series each, in PAU navy (a single hue needs no
// legend; the chart title names it). Columns are thin with 4px rounded tops on one baseline,
// hairline recessive gridlines, one y-axis, and a hover/focus readout per column (the values are
// also in the tables, so the tooltip never gates anything).
import { useState } from "react";

// The brand colour: PAU navy on light, the lighter PAU blue on dark (readable on both surfaces).
const NAVY = "var(--brand)";

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export function ColumnChart({
  points,
  format = (v) => String(v),
  label,
}: {
  points: { x: string; y: number; tip?: string }[];
  format?: (v: number) => string;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 180;
  const pad = { l: 44, r: 8, t: 10, b: 22 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = niceMax(Math.max(0, ...points.map((p) => p.y)));
  const band = iw / Math.max(points.length, 1);
  const bw = Math.max(2, Math.min(24, band - 2));
  const ticks = [0, max / 2, max];
  const every = Math.ceil(points.length / 8); // x labels: at most ~8
  const h = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={label} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => {
          const y = pad.t + ih - (t / max) * ih;
          return (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="currentColor" className="text-line" strokeWidth={1} />
              <text x={pad.l - 8} y={y + 4} textAnchor="end" className="fill-muted text-[11px]">
                {format(t)}
              </text>
            </g>
          );
        })}
        {points.map((p, i) => {
          const x = pad.l + i * band + (band - bw) / 2;
          const bh = (p.y / max) * ih;
          const y = pad.t + ih - bh;
          const r = Math.min(4, bw / 2, bh);
          return (
            <g key={p.x}>
              {bh > 0 && (
                <path
                  d={`M${x},${pad.t + ih} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${pad.t + ih} Z`}
                  fill={NAVY}
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
              {i % every === 0 && (
                <text x={pad.l + i * band + band / 2} y={H - 6} textAnchor="middle" className="fill-muted text-[10.5px]">
                  {p.x}
                </text>
              )}
              {/* Hit target: the whole band, taller than the mark. */}
              <rect
                x={pad.l + i * band}
                y={pad.t}
                width={band}
                height={ih}
                fill="transparent"
                tabIndex={0}
                aria-label={`${p.x}: ${format(p.y)}`}
                onPointerEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-lg bg-page px-2.5 py-1.5 text-xs shadow-md ring-1 ring-line"
          style={{ left: `${((pad.l + hover * band + band / 2) / W) * 100}%` }}
        >
          <span className="font-semibold text-ink">{format(h.y)}</span> <span className="text-muted">{h.tip ?? h.x}</span>
        </div>
      )}
    </div>
  );
}

/** Horizontal bars for a few categories, values at the tip (no tooltip needed). */
export function BarList({ rows, format = (v) => String(v) }: { rows: { label: string; n: number }[]; format?: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (rows.length === 0) return <p className="text-sm text-muted">Nothing yet.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 text-sm">
          <span className="truncate text-ink" title={r.label}>
            {r.label}
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3 rounded-r-[4px]" style={{ width: `${(r.n / max) * 85}%`, minWidth: r.n ? 3 : 0, background: NAVY }} />
            <span className="tabular-nums text-muted">{format(r.n)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
