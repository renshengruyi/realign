import type { HM, ISODate } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function parseISO(date: ISODate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(date: ISODate, n: number): ISODate {
  const d = parseISO(date);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(date: ISODate): number {
  return parseISO(date).getDay();
}

/** Weeks start on Monday. */
export function weekStartOf(date: ISODate): ISODate {
  const wd = weekday(date);
  return addDays(date, wd === 0 ? -6 : 1 - wd);
}

export function weekDates(weekStart: ISODate): ISODate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function rangeDates(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * Night events (urges at 23:40 or 02:10) belong to the night that ends on the
 * next morning, so the morning check-in and the night log land on one date.
 */
export function nightDateOf(ts: number): ISODate {
  const d = new Date(ts);
  const date = toISODate(d);
  return d.getHours() >= 12 ? addDays(date, 1) : date;
}

export function hmToMin(hm: HM | undefined): number | undefined {
  if (!hm || !/^\d{1,2}:\d{2}$/.test(hm)) return undefined;
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

export function minToHM(min: number): HM {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function nowHM(now: Date = new Date()): HM {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function nowMin(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** Signed minutes from `target` to `actual` on a 24h clock, in (-720, 720]. */
export function clockDelta(actual: HM | undefined, target: HM | undefined): number | undefined {
  const a = hmToMin(actual);
  const t = hmToMin(target);
  if (a === undefined || t === undefined) return undefined;
  let d = a - t;
  if (d > 720) d -= 1440;
  if (d <= -720) d += 1440;
  return d;
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function weekdayLabel(date: ISODate): string {
  return WEEKDAYS[weekday(date)];
}

export function formatDate(date: ISODate, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const [y, m, d] = date.split('-').map(Number);
  const base = `${opts.year ? `${y}年` : ''}${m}月${d}日`;
  return opts.weekday ? `${base} ${weekdayLabel(date)}` : base;
}

export function shortDate(date: ISODate): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}`;
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

export function formatClockTime(ts: number): HM {
  return nowHM(new Date(ts));
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 13) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

export function ageFrom(birthYear: number | undefined, now: Date = new Date()): number | undefined {
  return birthYear ? now.getFullYear() - birthYear : undefined;
}
