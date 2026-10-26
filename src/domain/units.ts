import type { WeightUnit } from './types';

// 1 斤 = 500 g (the mainland unit). Taiwan's 台斤 is 600 g; the app labels its unit.
export const JIN_PER_KG = 2;

export function kgTo(unit: WeightUnit, kg: number): number {
  return unit === 'jin' ? kg * JIN_PER_KG : kg;
}

export function toKg(unit: WeightUnit, value: number): number {
  return unit === 'jin' ? value / JIN_PER_KG : value;
}

export function unitLabel(unit: WeightUnit): string {
  return unit === 'jin' ? '斤' : 'kg';
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function formatWeight(kg: number | undefined, unit: WeightUnit): string {
  if (kg === undefined) return '—';
  return `${round1(kgTo(unit, kg))} ${unitLabel(unit)}`;
}

export function bmi(kg: number | undefined, heightCm: number | undefined): number | undefined {
  if (!kg || !heightCm) return undefined;
  const m = heightCm / 100;
  return kg / (m * m);
}

/** Taiwan Health Promotion Administration adult bands. */
export function bmiBand(value: number): { label: string; tone: 'low' | 'ok' | 'high' } {
  if (value < 18.5) return { label: '过轻', tone: 'low' };
  if (value < 24) return { label: '正常', tone: 'ok' };
  if (value < 27) return { label: '过重', tone: 'high' };
  return { label: '肥胖', tone: 'high' };
}

/** Weight range for the normal BMI band at a given height, in kg. */
export function healthyWeightRange(heightCm: number): [number, number] {
  const m = heightCm / 100;
  return [18.5 * m * m, 24 * m * m];
}

export function formatHours(h: number | undefined): string {
  if (h === undefined || Number.isNaN(h)) return '—';
  return `${round1(h)}`;
}

export function avg(values: (number | undefined | null)[]): number | undefined {
  const v = values.filter((x): x is number => typeof x === 'number' && !Number.isNaN(x));
  if (!v.length) return undefined;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

export function sum(values: (number | undefined | null)[]): number {
  return values.reduce<number>((a, b) => a + (typeof b === 'number' && !Number.isNaN(b) ? b : 0), 0);
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
