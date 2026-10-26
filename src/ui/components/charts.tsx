import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { shortDate, weekdayLabel } from '../../domain/dates';
import { Icon } from './Icon';

export interface Point {
  date: string;
  v?: number;
}

export function useWidth<T extends HTMLElement>(fallback = 320) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(Math.max(160, Math.floor(el.getBoundingClientRect().width)));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Clean tick values from 0 (or min) to a round max. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (max <= min) max = min + 1;
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 1000; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

const fmt = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toString() : (Math.round(v * 10) / 10).toString());

/** Column with a 4px rounded data-end and a square base. */
function columnPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

interface Tip {
  x: number;
  y: number;
  date: string;
  rows: { label: string; value: string; color: string }[];
}

function Tooltip({ tip, width }: { tip: Tip | null; width: number }) {
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x - 70, 0), width - 150);
  return (
    <div class="chart-tip" style={{ left: `${left}px`, top: `${Math.max(0, tip.y - 70)}px` }}>
      <span class="tip-date">
        {shortDate(tip.date)} {weekdayLabel(tip.date)}
      </span>
      {tip.rows.map((r) => (
        <span class="tip-row" key={r.label}>
          <i class="key" style={{ background: r.color }} />
          <b>{r.value}</b>
          <span class="muted">{r.label}</span>
        </span>
      ))}
    </div>
  );
}

const PAD = { l: 30, r: 10, t: 10, b: 22 };

function xLabels(data: Point[], plotW: number) {
  const every = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(plotW / 48))));
  const last = data.length - 1;
  return data.map((d, i) => {
    if (i === last) return shortDate(d.date);
    if (i % every !== 0 || last - i < Math.max(2, every * 0.75)) return '';
    return shortDate(d.date);
  });
}

export function ColumnChart({
  data,
  color,
  label,
  unit,
  target,
  targetLabel,
  height = 160,
  yMax,
  format = fmt,
}: {
  data: Point[];
  color: string;
  label: string;
  unit: string;
  target?: number;
  targetLabel?: string;
  height?: number;
  yMax?: number;
  format?: (v: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const values = data.map((d) => d.v).filter((v): v is number => v !== undefined);
  const max = Math.max(yMax ?? 0, target ?? 0, ...values, 1);
  const ticks = niceTicks(0, max, 4);
  const top = ticks[ticks.length - 1];
  const plotW = width - PAD.l - PAD.r;
  const plotH = height - PAD.t - PAD.b;
  const band = plotW / Math.max(1, data.length);
  const bw = Math.min(24, Math.max(3, band * 0.62));
  const y = (v: number) => PAD.t + plotH - (v / top) * plotH;
  const labels = xLabels(data, plotW);
  return (
    <div class="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={`${label}柱状图`}>
        <g class="grid">
          {ticks.map((t) => (
            <line key={t} x1={PAD.l} x2={width - PAD.r} y1={y(t)} y2={y(t)} />
          ))}
        </g>
        <g class="axis">
          {ticks.map((t) => (
            <text key={t} x={PAD.l - 6} y={y(t) + 4} text-anchor="end">
              {fmt(t)}
            </text>
          ))}
          {labels.map((l, i) =>
            l ? (
              <text key={i} x={PAD.l + band * i + band / 2} y={height - 6} text-anchor="middle">
                {l}
              </text>
            ) : null,
          )}
        </g>
        {data.map((d, i) => {
          if (d.v === undefined) return null;
          const x = PAD.l + band * i + (band - bw) / 2;
          const active = tip?.date === d.date;
          if (d.v <= 0) {
            return <rect key={d.date} x={x} y={PAD.t + plotH - 3} width={bw} height={3} rx={1.5} fill={color} opacity={0.35} />;
          }
          const h = Math.max(2, (d.v / top) * plotH);
          return <path key={d.date} d={columnPath(x, PAD.t + plotH - h, bw, h)} fill={color} opacity={tip && !active ? 0.55 : 1} />;
        })}
        {target !== undefined ? (
          <g>
            <line x1={PAD.l} x2={width - PAD.r} y1={y(target)} y2={y(target)} stroke="var(--ink-2)" stroke-width="1" />
            <text class="axis halo" x={width - PAD.r} y={y(target) - 5} text-anchor="end">
              {targetLabel ?? `目标 ${format(target)}`}
            </text>
          </g>
        ) : null}
        <line class="baseline" x1={PAD.l} x2={width - PAD.r} y1={PAD.t + plotH} y2={PAD.t + plotH} />
        {data.map((d, i) => (
          <rect
            key={`h${d.date}`}
            class="hit"
            x={PAD.l + band * i}
            y={PAD.t}
            width={band}
            height={plotH}
            tabIndex={d.v === undefined ? -1 : 0}
            onPointerEnter={() => d.v !== undefined && setTip({ x: PAD.l + band * i + band / 2, y: y(d.v), date: d.date, rows: [{ label, value: `${format(d.v)} ${unit}`, color }] })}
            onFocus={() => d.v !== undefined && setTip({ x: PAD.l + band * i + band / 2, y: y(d.v), date: d.date, rows: [{ label, value: `${format(d.v)} ${unit}`, color }] })}
            onPointerLeave={() => setTip(null)}
            onBlur={() => setTip(null)}
          />
        ))}
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  );
}

export interface Series {
  name: string;
  color: string;
  data: Point[];
}

export function LineChart({
  series,
  unit,
  height = 170,
  yMin,
  yMax,
  band,
  format = fmt,
  label,
  connectGaps,
}: {
  series: Series[];
  unit: string;
  height?: number;
  yMin?: number;
  yMax?: number;
  band?: { lo: number; hi: number; label: string };
  format?: (v: number) => string;
  label: string;
  connectGaps?: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const dates = series[0]?.data.map((d) => d.date) ?? [];
  const all = series.flatMap((s) => s.data.map((d) => d.v)).filter((v): v is number => v !== undefined);
  let ticks: number[];
  if (yMin !== undefined && yMax !== undefined) {
    // a bounded scale (1–5, 0–10): show it whole, one tick per step when small
    const step = yMax - yMin <= 6 ? 1 : yMax - yMin <= 12 ? 2 : (yMax - yMin) / 4;
    ticks = [];
    for (let v = yMin; v <= yMax + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  } else {
    let lo0 = Math.min(...(all.length ? all : [0]));
    let hi0 = Math.max(...(all.length ? all : [1]));
    if (band) {
      // reach only for the band edge nearest the data, so the data keeps the room
      if (hi0 < band.lo) hi0 = band.lo;
      else if (lo0 > band.hi) lo0 = band.hi;
    }
    const pad = Math.max((hi0 - lo0) * 0.15, 1);
    ticks = niceTicks(yMin ?? lo0 - pad, (yMax ?? hi0) + pad, 4);
  }
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const plotW = width - PAD.l - PAD.r;
  const plotH = height - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (dates.length <= 1 ? plotW / 2 : (i / (dates.length - 1)) * plotW);
  const y = (v: number) => PAD.t + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const labels = xLabels(series[0]?.data ?? [], plotW);

  const pathFor = (s: Series) => {
    let d = '';
    let pen = false;
    s.data.forEach((p, i) => {
      if (p.v === undefined) {
        if (!connectGaps) pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const onMove = (e: PointerEvent) => {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round(((px - PAD.l) / Math.max(1, plotW)) * (dates.length - 1));
    setHover(Math.min(dates.length - 1, Math.max(0, i)));
  };

  const tip: Tip | null =
    hover === null
      ? null
      : {
          x: x(hover),
          y: PAD.t + 40,
          date: dates[hover],
          rows: series
            .filter((s) => s.data[hover]?.v !== undefined)
            .map((s) => ({ label: s.name, value: `${format(s.data[hover].v as number)} ${unit}`, color: s.color })),
        };

  return (
    <div class="chart" ref={ref}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${label}折线图`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {band && band.hi > lo && band.lo < hi ? (
          <g>
            <rect
              x={PAD.l}
              width={plotW}
              y={y(Math.min(hi, band.hi))}
              height={Math.max(0, y(Math.max(lo, band.lo)) - y(Math.min(hi, band.hi)))}
              fill="var(--good)"
              opacity="0.1"
            />
            <line x1={PAD.l} x2={width - PAD.r} y1={y(Math.max(lo, band.lo))} y2={y(Math.max(lo, band.lo))} stroke="var(--good)" stroke-width="1" opacity="0.6" />
          </g>
        ) : null}
        <g class="grid">
          {ticks.map((t) => (
            <line key={t} x1={PAD.l} x2={width - PAD.r} y1={y(t)} y2={y(t)} />
          ))}
        </g>
        <g class="axis">
          {ticks.map((t) => (
            <text key={t} x={PAD.l - 6} y={y(t) + 4} text-anchor="end">
              {fmt(t)}
            </text>
          ))}
          {labels.map((l, i) =>
            l ? (
              <text key={i} x={x(i)} y={height - 6} text-anchor="middle">
                {l}
              </text>
            ) : null,
          )}
          {band && band.hi > lo && band.lo < hi ? (
            <text class="halo" x={width - PAD.r} y={y(Math.max(lo, band.lo)) - 5} text-anchor="end">
              {band.label} {fmt(band.lo)}+
            </text>
          ) : null}
        </g>
        {series.map((s) => (
          <path key={s.name} d={pathFor(s)} fill="none" stroke={s.color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        ))}
        {series.map((s) =>
          s.data.map((p, i) => {
            if (p.v === undefined) return null;
            const isolated = connectGaps || (s.data[i - 1]?.v === undefined && s.data[i + 1]?.v === undefined) || i === lastIndex(s.data);
            if (!isolated && hover !== i) return null;
            return <circle key={`${s.name}${i}`} cx={x(i)} cy={y(p.v)} r="4" fill={s.color} stroke="var(--surface)" stroke-width="2" />;
          }),
        )}
        {hover !== null ? <line class="crosshair" x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + plotH} /> : null}
        <rect class="hit" x={PAD.l} y={PAD.t} width={plotW} height={plotH} />
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  );
}

function lastIndex(data: Point[]): number {
  for (let i = data.length - 1; i >= 0; i--) if (data[i].v !== undefined) return i;
  return -1;
}

export interface Bell {
  id: string;
  date: string;
  a?: number; // start
  b?: number; // end
  peak?: number;
  predicted?: number;
}

/** One vertical start→end dumbbell per exposure session, 0–10. */
export function SessionChart({ items, color, height = 170 }: { items: Bell[]; color: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const ticks = [0, 2, 4, 6, 8, 10];
  const plotW = width - PAD.l - PAD.r;
  const plotH = height - PAD.t - PAD.b;
  const band = plotW / Math.max(1, items.length);
  const y = (v: number) => PAD.t + plotH - (v / 10) * plotH;
  const labels = xLabels(items.map((i) => ({ date: i.date })), plotW);
  return (
    <div class="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label="暴露练习开始与结束分数">
        <g class="grid">
          {ticks.map((t) => (
            <line key={t} x1={PAD.l} x2={width - PAD.r} y1={y(t)} y2={y(t)} />
          ))}
        </g>
        <g class="axis">
          {ticks.map((t) => (
            <text key={t} x={PAD.l - 6} y={y(t) + 4} text-anchor="end">
              {t}
            </text>
          ))}
          {labels.map((l, i) =>
            l ? (
              <text key={i} x={PAD.l + band * i + band / 2} y={height - 6} text-anchor="middle">
                {l}
              </text>
            ) : null,
          )}
        </g>
        {items.map((s, i) => {
          const cx = PAD.l + band * i + band / 2;
          const rows = [
            s.a !== undefined ? { label: '开始', value: `${s.a}`, color } : null,
            s.peak !== undefined ? { label: '最高', value: `${s.peak}`, color } : null,
            s.b !== undefined ? { label: '结束', value: `${s.b}`, color } : null,
            s.predicted !== undefined ? { label: '预测最高', value: `${s.predicted}`, color: 'var(--ink-3)' } : null,
          ].filter(Boolean) as Tip['rows'];
          const show = () => setTip({ x: cx, y: y(s.peak ?? s.a ?? 5), date: s.date, rows });
          return (
            <g key={s.id}>
              {s.a !== undefined && s.b !== undefined ? <line x1={cx} x2={cx} y1={y(s.a)} y2={y(s.b)} stroke={color} stroke-width="2" /> : null}
              {s.predicted !== undefined ? (
                <line x1={cx - 6} x2={cx + 6} y1={y(s.predicted)} y2={y(s.predicted)} stroke="var(--ink-3)" stroke-width="2" stroke-linecap="round" />
              ) : null}
              {s.a !== undefined ? <circle cx={cx} cy={y(s.a)} r="4" fill="var(--surface)" stroke={color} stroke-width="2" /> : null}
              {s.b !== undefined ? <circle cx={cx} cy={y(s.b)} r="4.5" fill={color} stroke="var(--surface)" stroke-width="2" /> : null}
              <rect
                class="hit"
                x={cx - band / 2}
                y={PAD.t}
                width={band}
                height={plotH}
                tabIndex={0}
                onPointerEnter={show}
                onFocus={show}
                onPointerLeave={() => setTip(null)}
                onBlur={() => setTip(null)}
              />
            </g>
          );
        })}
        <line class="baseline" x1={PAD.l} x2={width - PAD.r} y1={PAD.t + plotH} y2={PAD.t + plotH} />
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  );
}

/** One session's ratings over time. */
export function CurveChart({ ratings, minutes, color, height = 150 }: { ratings: { t: number; v: number }[]; minutes: number; color: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const plotW = width - PAD.l - PAD.r;
  const plotH = height - PAD.t - PAD.b;
  const maxT = Math.max(minutes * 60, ...ratings.map((r) => r.t), 60);
  const x = (t: number) => PAD.l + (t / maxT) * plotW;
  const y = (v: number) => PAD.t + plotH - (v / 10) * plotH;
  const d = ratings.map((r, i) => `${i ? 'L' : 'M'}${x(r.t).toFixed(1)},${y(r.v).toFixed(1)}`).join('');
  const area = ratings.length ? `${d}L${x(ratings[ratings.length - 1].t)},${y(0)}L${x(ratings[0].t)},${y(0)}Z` : '';
  const ticksT = niceTicks(0, maxT / 60, 4);
  return (
    <div class="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label="这次练习的不适分变化">
        <g class="grid">
          {[0, 5, 10].map((t) => (
            <line key={t} x1={PAD.l} x2={width - PAD.r} y1={y(t)} y2={y(t)} />
          ))}
        </g>
        <g class="axis">
          {[0, 5, 10].map((t) => (
            <text key={t} x={PAD.l - 6} y={y(t) + 4} text-anchor="end">
              {t}
            </text>
          ))}
          {ticksT
            .filter((m) => m * 60 <= maxT)
            .map((m) => (
              <text key={m} x={x(m * 60)} y={height - 6} text-anchor="middle">
                {m}分
              </text>
            ))}
        </g>
        {area ? <path d={area} fill={color} opacity="0.1" /> : null}
        {d ? <path d={d} fill="none" stroke={color} stroke-width="2" stroke-linejoin="round" /> : null}
        {ratings.map((r, i) => (
          <circle key={i} cx={x(r.t)} cy={y(r.v)} r="4" fill={color} stroke="var(--surface)" stroke-width="2" />
        ))}
        {ratings.length ? (
          <text class="axis" x={x(ratings[ratings.length - 1].t) + 8} y={y(ratings[ratings.length - 1].v) + 4}>
            {ratings[ratings.length - 1].v}
          </text>
        ) : null}
      </svg>
    </div>
  );
}

export function Sparkline({ values, color, height = 28 }: { values: (number | undefined)[]; color: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>(120);
  const nums = values.filter((v): v is number => v !== undefined);
  if (nums.length < 2) return <div ref={ref} style={{ height: `${height}px` }} />;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const pad = 4;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => pad + (height - pad * 2) * (1 - (hi === lo ? 0.5 : (v - lo) / (hi - lo)));
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v === undefined) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  const li = values.length - 1 - [...values].reverse().findIndex((v) => v !== undefined);
  return (
    <div ref={ref}>
      <svg class="spark" width={width} height={height} aria-hidden="true">
        <path d={d} fill="none" stroke="var(--ink-3)" stroke-width="1.5" stroke-linejoin="round" />
        <circle cx={x(li)} cy={y(values[li] as number)} r="3.5" fill={color} stroke="var(--surface)" stroke-width="2" />
      </svg>
    </div>
  );
}

/** The 印谱: one row per area, one cell per day, ink by progress. */
export function SealGrid({
  dates,
  rows,
}: {
  dates: string[];
  rows: { key: string; char: string; color: string; values: (number | undefined)[] }[];
}) {
  const [tip, setTip] = useState<{ i: number; r: number } | null>(null);
  return (
    <div class="sealgrid" role="table" aria-label="每日印章" style={{ '--n': dates.length } as Record<string, number>}>
      <div class="sg-row sg-head" role="row">
        <span role="columnheader" />
        {dates.map((d, i) => (
          <span role="columnheader" key={d} class="sg-day">
            {i === 0 || d.endsWith('-01') || i === dates.length - 1 || weekdayLabel(d) === '周一' ? shortDate(d) : ''}
          </span>
        ))}
      </div>
      {rows.map((row, r) => (
        <div class="sg-row" role="row" key={row.key}>
          <span role="rowheader" class="sg-char display">
            {row.char}
          </span>
          {row.values.map((v, i) => (
            <span
              role="cell"
              key={i}
              tabIndex={0}
              class={`sg-cell${v !== undefined && v >= 0.999 ? ' full' : ''}`}
              style={{ '--c': row.color, '--p': v === undefined ? 0 : Math.max(0.12, v) } as Record<string, string | number>}
              aria-label={`${dates[i]} ${row.char} ${v === undefined ? '无记录' : `${Math.round(v * 100)}%`}`}
              onPointerEnter={() => setTip({ i, r })}
              onPointerLeave={() => setTip(null)}
              onFocus={() => setTip({ i, r })}
              onBlur={() => setTip(null)}
            />
          ))}
        </div>
      ))}
      <p class="xs muted" style={{ minHeight: '1.4em' }}>
        {tip ? `${shortDate(dates[tip.i])} ${weekdayLabel(dates[tip.i])} · ${rows[tip.r].char}：${rows[tip.r].values[tip.i] === undefined ? '无记录' : `完成 ${Math.round((rows[tip.r].values[tip.i] as number) * 100)}%`}` : '颜色越深，那天这一项完成得越多；实心是完成了。'}
      </p>
    </div>
  );
}

export function ChartCard({
  title,
  sub,
  legend,
  table,
  children,
}: {
  title: string;
  sub?: string;
  legend?: { label: string; color: string; line?: boolean }[];
  table?: { head: string[]; rows: (string | number)[][] };
  children: ComponentChildren;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section class="card stack" aria-label={title}>
      <div class="section-head">
        <div class="stack tight">
          <h3 style={{ fontSize: 'var(--t-md)' }}>{title}</h3>
          {sub ? <p class="xs muted">{sub}</p> : null}
        </div>
        {table ? (
          <button type="button" class="btn sm ghost" aria-pressed={showTable} onClick={() => setShowTable(!showTable)}>
            <Icon name={showTable ? 'trends' : 'list'} />
            {showTable ? '图表' : '表格'}
          </button>
        ) : null}
      </div>
      {legend && legend.length > 1 ? (
        <div class="legend">
          {legend.map((l) => (
            <span class="sw" key={l.label}>
              <i class={l.line ? 'line' : ''} style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      ) : null}
      {showTable && table ? (
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                {table.head.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}
