import { addDays, clockDelta, diffDays, hmToMin, rangeDates, weekDates, weekStartOf, weekday } from './dates';
import type { DayDoc, ErpSession, Goal, ISODate, RhythmItem, SleepLog, Targets, WeekStats } from './types';
import { avg, clamp, sum } from './units';

export type DayMap = Record<ISODate, DayDoc>;

// ---------------------------------------------------------------- sleep

/** Estimated hours asleep: bed → wake, minus time to fall asleep. */
export function sleepHours(s: SleepLog | undefined): number | undefined {
  if (!s) return undefined;
  const bed = hmToMin(s.bedtime);
  const wake = hmToMin(s.wakeTime);
  if (bed === undefined || wake === undefined) return undefined;
  let span = wake - bed;
  if (span <= 0) span += 1440;
  if (span > 16 * 60) return undefined;
  const asleep = span - (s.latencyMin ?? 0);
  return asleep > 0 ? asleep / 60 : 0;
}

export function hasSleep(day: DayDoc | undefined): boolean {
  return !!day?.sleep?.loggedAt || day?.sleep?.refits !== undefined || !!day?.sleep?.wakeTime;
}

export function wakeOnTime(day: DayDoc | undefined, targets: Targets): boolean {
  const d = clockDelta(day?.sleep?.wakeTime, targets.wakeTime);
  return d !== undefined && Math.abs(d) <= 30;
}

/** Refits for a night: the logged number, else the night-urge log's count. */
export function nightRefits(day: DayDoc | undefined): number | undefined {
  if (day?.sleep?.refits !== undefined) return day.sleep.refits;
  const ups = day?.urges?.filter((u) => u.decision === 'got-up').length;
  return day?.urges?.length ? ups : undefined;
}

export function completedExposures(day: DayDoc | undefined): ErpSession[] {
  return (day?.erp ?? []).filter((s) => s.completed);
}

export function sessionPeak(s: ErpSession): number | undefined {
  return s.ratings.length ? Math.max(...s.ratings.map((r) => r.v)) : undefined;
}

// ---------------------------------------------------------------- daily seals

export type SealKey = 'sleep' | 'food' | 'move' | 'calm';

export interface SealPart {
  label: string;
  done: boolean;
}

export interface SealState {
  key: SealKey;
  char: string;
  label: string;
  progress: number; // 0–1
  done: boolean;
  parts: SealPart[];
}

export const SEAL_META: Record<SealKey, { char: string; label: string }> = {
  sleep: { char: '睡', label: '睡' },
  food: { char: '食', label: '食' },
  move: { char: '动', label: '动' },
  calm: { char: '静', label: '静' },
};

export function moveMinutes(day: DayDoc | undefined): number {
  const h = day?.habits;
  return sum([h?.exerciseMin, h?.walkMin, h?.postureMin]);
}

export function meditationMinutes(day: DayDoc | undefined): number {
  return sum([day?.habits?.meditateAmMin, day?.habits?.meditatePmMin]);
}

export function slowMeals(day: DayDoc | undefined): number {
  return (day?.meals ?? []).filter((m) => m.slow).length;
}

export function computeSeals(day: DayDoc | undefined, t: Targets): SealState[] {
  const refits = nightRefits(day);
  const sleepParts: SealPart[] = [
    { label: '按时起床', done: wakeOnTime(day, t) },
    { label: `守住上限 ${t.refitCap} 次`, done: hasSleep(day) && refits !== undefined && refits <= t.refitCap },
    { label: '做了训练', done: completedExposures(day).length > 0 || !!day?.nap?.done },
  ];

  const meals = day?.meals?.length ?? 0;
  const slow = slowMeals(day);
  const foodProgress =
    0.6 * clamp(meals / Math.max(1, t.mealsPerDay), 0, 1) + 0.4 * clamp(slow / Math.max(1, t.slowMealsPerDay), 0, 1);

  const moved = moveMinutes(day);
  const breaks = day?.stand?.breaks ?? 0;
  const moveProgress =
    0.75 * clamp(moved / Math.max(1, t.moveMin), 0, 1) + 0.25 * clamp(breaks / Math.max(1, t.standBreaks), 0, 1);

  const med = meditationMinutes(day);
  const journal = !!day?.habits?.journal;
  const calmProgress = 0.8 * clamp(med / Math.max(1, t.meditationMin), 0, 1) + 0.2 * (journal ? 1 : 0);

  const seal = (key: SealKey, progress: number, parts: SealPart[]): SealState => {
    const p = Math.round(progress * 1000) / 1000;
    return { key, ...SEAL_META[key], progress: p, done: p >= 0.999, parts };
  };

  return [
    seal('sleep', sleepParts.filter((p) => p.done).length / sleepParts.length, sleepParts),
    seal('food', foodProgress, [
      { label: `吃了 ${meals}/${t.mealsPerDay} 次`, done: meals >= t.mealsPerDay },
      { label: `细嚼慢咽 ${slow}/${t.slowMealsPerDay} 次`, done: slow >= t.slowMealsPerDay },
    ]),
    seal('move', moveProgress, [
      { label: `活动 ${moved}/${t.moveMin} 分钟`, done: moved >= t.moveMin },
      { label: `站起来 ${breaks}/${t.standBreaks} 次`, done: breaks >= t.standBreaks },
    ]),
    seal('calm', calmProgress, [
      { label: `冥想 ${med}/${t.meditationMin} 分钟`, done: med >= t.meditationMin },
      { label: '写了日记', done: journal },
    ]),
  ];
}

// ---------------------------------------------------------------- rhythm

export function rhythmForDate(items: RhythmItem[], date: ISODate): RhythmItem[] {
  const wd = weekday(date);
  return items
    .filter((i) => !i.days || i.days.length === 0 || i.days.includes(wd))
    .sort((a, b) => (hmToMin(a.time) ?? 0) - (hmToMin(b.time) ?? 0));
}

/** Whether a rhythm item is done, from what was logged; a manual check wins. */
export function rhythmDone(item: RhythmItem, day: DayDoc | undefined, items: RhythmItem[]): boolean {
  const manual = day?.checks?.[item.id];
  if (manual !== undefined) return manual;
  const h = day?.habits;
  switch (item.kind) {
    case 'wake':
      return !!day?.sleep?.wakeTime;
    case 'checkin-am':
      return !!day?.sleep?.loggedAt;
    case 'meditate-am':
      return (h?.meditateAmMin ?? 0) > 0;
    case 'meditate-pm':
      return (h?.meditatePmMin ?? 0) > 0;
    case 'meal': {
      const meals = day?.meals ?? [];
      if (item.mealType !== 'snack') return meals.some((m) => m.type === item.mealType);
      const snackItems = items.filter((i) => i.kind === 'meal' && i.mealType === 'snack');
      const index = snackItems.findIndex((i) => i.id === item.id);
      return meals.filter((m) => m.type === 'snack').length > index;
    }
    case 'walk':
      return (h?.walkMin ?? 0) > 0;
    case 'focus': {
      const focusItems = items.filter((i) => i.kind === 'focus');
      const index = focusItems.findIndex((i) => i.id === item.id);
      return (day?.stand?.focusBlocks ?? 0) > index;
    }
    case 'nap':
      return !!day?.nap?.done;
    case 'exposure':
      return completedExposures(day).length > 0;
    case 'exercise':
      return (h?.exerciseMin ?? 0) > 0;
    case 'posture':
      return (h?.postureMin ?? 0) > 0;
    case 'shutdown':
      return !!h?.shutdown;
    case 'screen-off':
      return !!h?.screenOff;
    case 'read':
      return (h?.readMin ?? 0) > 0;
    case 'checkin-pm':
      return !!day?.eveningAt;
    case 'tuina':
      return !!day?.tuina?.done;
    default:
      return false;
  }
}

export interface RhythmNow {
  current?: RhythmItem; // started within its window and not done
  next?: RhythmItem;
  overdue: RhythmItem[];
}

export function rhythmNow(items: RhythmItem[], day: DayDoc | undefined, minuteOfDay: number): RhythmNow {
  let current: RhythmItem | undefined;
  let next: RhythmItem | undefined;
  const overdue: RhythmItem[] = [];
  for (const item of items) {
    const start = hmToMin(item.time) ?? 0;
    const window = Math.max(item.durationMin ?? 0, 30);
    const done = rhythmDone(item, day, items);
    if (start > minuteOfDay) {
      if (!next) next = item;
      continue;
    }
    if (done) continue;
    if (minuteOfDay - start <= window) current = item;
    else if (item.kind !== 'bed' && item.kind !== 'wake') overdue.push(item);
  }
  return { current, next, overdue };
}

// ---------------------------------------------------------------- weekly

export function computeWeekStats(weekStart: ISODate, days: DayMap, t: Targets): WeekStats {
  const list = weekDates(weekStart).map((d) => days[d]).filter((d): d is DayDoc => !!d);
  const logged = list.filter((d) => Object.keys(d).some((k) => k !== 'date' && k !== 'updatedAt' && k !== 'brief'));
  const nights = list.filter((d) => hasSleep(d));
  const refits = nights.map((d) => nightRefits(d)).filter((n): n is number => n !== undefined);
  const sessions = list.flatMap((d) => completedExposures(d));
  const drops = sessions
    .filter((s) => s.ratings.length >= 2)
    .map((s) => s.ratings[0].v - s.ratings[s.ratings.length - 1].v);
  const gaps = sessions
    .filter((s) => s.predicted !== undefined && s.ratings.length)
    .map((s) => (s.predicted as number) - (sessionPeak(s) as number));
  const mealDays = list.filter((d) => (d.meals?.length ?? 0) > 0);
  const weights = list.filter((d) => d.weightKg).map((d) => d.weightKg as number);

  return {
    weekStart,
    days: logged.length,
    sleepHours: avg(nights.map((d) => sleepHours(d.sleep))),
    latencyMin: avg(nights.map((d) => d.sleep?.latencyMin)),
    refitsAvg: avg(refits),
    refitNights: refits.length,
    capKeptNights: refits.filter((n) => n <= t.refitCap).length,
    stuckButSlept: nights.filter((d) => d.sleep?.stuckButSlept).length,
    maxDiscomfortAvg: avg(nights.map((d) => d.sleep?.maxDiscomfort)),
    exposures: sessions.length,
    exposureDrop: avg(drops),
    predictionGap: avg(gaps),
    naps: list.filter((d) => d.nap?.done).length,
    napAdjustAvg: avg(list.filter((d) => d.nap?.done).map((d) => d.nap?.adjustments)),
    mealsAvg: avg(mealDays.map((d) => d.meals?.length)),
    slowMealsAvg: avg(mealDays.map((d) => slowMeals(d))),
    gutAvg: avg(list.map((d) => d.gut?.discomfort)),
    gutBadDays: list.filter((d) => (d.gut?.discomfort ?? 0) >= 4).length,
    energyAm: avg(list.map((d) => d.energy?.am)),
    energyPm: avg(list.map((d) => d.energy?.pm)),
    moodAvg: avg(list.map((d) => d.mood)),
    meditationMin: sum(list.map((d) => meditationMinutes(d))),
    moveMin: sum(list.map((d) => moveMinutes(d))),
    exerciseSessions: list.filter((d) => (d.habits?.exerciseMin ?? 0) >= 15).length,
    readMin: sum(list.map((d) => d.habits?.readMin)),
    standBreaks: sum(list.map((d) => d.stand?.breaks)),
    focusBlocks: sum(list.map((d) => d.stand?.focusBlocks)),
    wakeOnTime: list.filter((d) => wakeOnTime(d, t)).length,
    weightKg: weights.length ? weights[weights.length - 1] : undefined,
  };
}

export function programWeek(programStart: ISODate | undefined, date: ISODate): number | undefined {
  if (!programStart) return undefined;
  const d = diffDays(date, programStart);
  return d < 0 ? undefined : Math.floor(d / 7) + 1;
}

// ---------------------------------------------------------------- series & insights

export function series<T>(days: DayMap, from: ISODate, to: ISODate, pick: (d: DayDoc | undefined, date: ISODate) => T) {
  return rangeDates(from, to).map((date) => ({ date, value: pick(days[date], date) }));
}

export function latestWeight(days: DayMap, upTo?: ISODate): { date: ISODate; kg: number } | undefined {
  const dates = Object.keys(days)
    .filter((d) => days[d].weightKg && (!upTo || d <= upTo))
    .sort();
  const last = dates[dates.length - 1];
  return last ? { date: last, kg: days[last].weightKg as number } : undefined;
}

export interface Insight {
  id: string;
  title: string;
  detail: string;
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

/** Plain comparisons between groups of days; needs at least 3 days per group. */
export function computeInsights(days: DayMap, from: ISODate, to: ISODate, t: Targets): Insight[] {
  const dates = rangeDates(from, to);
  const out: Insight[] = [];

  const sleepEnergy = dates
    .map((d) => ({ h: sleepHours(days[d]?.sleep), e: days[d]?.energy?.am }))
    .filter((x): x is { h: number; e: number } => x.h !== undefined && x.e !== undefined);
  const well = sleepEnergy.filter((x) => x.h >= 6.5);
  const short = sleepEnergy.filter((x) => x.h < 6.5);
  if (well.length >= 3 && short.length >= 3) {
    out.push({
      id: 'sleep-energy',
      title: '睡够的早上更有精神',
      detail: `睡满 6.5 小时的 ${well.length} 天，起床精力平均 ${fmt(avg(well.map((x) => x.e))!)}；其余 ${short.length} 天是 ${fmt(avg(short.map((x) => x.e))!)}（满分 5）。`,
    });
  }

  const slowGut = dates
    .map((d) => ({ s: slowMeals(days[d]), g: days[d]?.gut?.discomfort, m: days[d]?.meals?.length ?? 0 }))
    .filter((x): x is { s: number; g: number; m: number } => x.g !== undefined && x.m > 0);
  const slowDays = slowGut.filter((x) => x.s >= 2);
  const fastDays = slowGut.filter((x) => x.s < 2);
  if (slowDays.length >= 3 && fastDays.length >= 3) {
    out.push({
      id: 'slow-gut',
      title: '慢慢吃和胃的关系',
      detail: `至少两餐细嚼慢咽的 ${slowDays.length} 天，胃部不适平均 ${fmt(avg(slowDays.map((x) => x.g))!)}；其余 ${fastDays.length} 天是 ${fmt(avg(fastDays.map((x) => x.g))!)}（0–10）。`,
    });
  }

  const sessions = dates.flatMap((d) => completedExposures(days[d]));
  const gaps = sessions
    .filter((s) => s.predicted !== undefined && s.ratings.length)
    .map((s) => (s.predicted as number) - (sessionPeak(s) as number));
  if (gaps.length >= 3) {
    const g = avg(gaps)!;
    out.push({
      id: 'prediction',
      title: g > 0 ? '担心比实际更大' : '预测和实际差不多',
      detail:
        g > 0
          ? `${gaps.length} 次暴露练习里，你预测的最高分平均比实际高 ${fmt(g)} 分。`
          : `${gaps.length} 次暴露练习里，预测和实际最高分平均只差 ${fmt(Math.abs(g))} 分。`,
    });
  }

  const nights = dates.map((d) => nightRefits(days[d])).filter((n): n is number => n !== undefined);
  if (nights.length >= 6) {
    const half = Math.floor(nights.length / 2);
    const first = avg(nights.slice(0, half))!;
    const last = avg(nights.slice(half))!;
    if (Math.abs(first - last) >= 0.5) {
      out.push({
        id: 'refit-trend',
        title: last < first ? '重铺变少了' : '重铺变多了',
        detail: `前 ${half} 晚平均 ${fmt(first)} 次，后 ${nights.length - half} 晚平均 ${fmt(last)} 次。上限是 ${t.refitCap} 次。`,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- milestones

export interface Milestone {
  id: string;
  glyph: string;
  title: string;
  date: ISODate;
  detail: string;
}

export function computeMilestones(days: DayMap, t: Targets): Milestone[] {
  const dates = Object.keys(days).sort();
  const out: Milestone[] = [];
  const add = (m: Milestone) => {
    if (!out.some((x) => x.id === m.id)) out.push(m);
  };
  let capRun = 0;
  let wakeRun = 0;
  let exposures = 0;
  let medDays = 0;
  let firstWeight: number | undefined;

  for (const date of dates) {
    const d = days[date];
    if (d.sleep?.stuckButSlept) add({ id: 'stuck-slept', glyph: '眠', title: '卡着也睡着了', date, detail: '被子明明卡着，没起来，然后睡着了。' });
    const r = nightRefits(d);
    if (hasSleep(d) && r === 0) add({ id: 'zero-refit', glyph: '安', title: '整晚没重铺', date, detail: '一次都没有下床重铺。' });
    capRun = hasSleep(d) && r !== undefined && r <= t.refitCap ? capRun + 1 : hasSleep(d) ? 0 : capRun;
    if (capRun >= 7) add({ id: 'cap-7', glyph: '守', title: '连续 7 晚守住上限', date, detail: `每晚起来不超过 ${t.refitCap} 次。` });
    wakeRun = wakeOnTime(d, t) ? wakeRun + 1 : hasSleep(d) ? 0 : wakeRun;
    if (wakeRun >= 7) add({ id: 'wake-7', glyph: '晨', title: '连续 7 天按时起床', date, detail: '生物钟在定下来。' });
    exposures += completedExposures(d).length;
    if (exposures >= 10) add({ id: 'exposure-10', glyph: '勇', title: '完成 10 次暴露练习', date, detail: '每一次都在给大脑新的证据。' });
    if (meditationMinutes(d) > 0) medDays += 1;
    if (medDays >= 7) add({ id: 'meditate-7', glyph: '静', title: '冥想满 7 天', date, detail: '不用连续，累计就算。' });
    if (d.weightKg) {
      if (firstWeight === undefined) firstWeight = d.weightKg;
      else if (d.weightKg - firstWeight >= 1) add({ id: 'weight-1', glyph: '长', title: '体重涨了 1 公斤', date, detail: '身体在把吃进去的留下来。' });
    }
  }
  return out;
}

// ---------------------------------------------------------------- goals

/** The current value of a long-term goal's metric, from recent logs. */
export function goalCurrent(goal: Goal, days: DayMap, today: ISODate, t: Targets): number | undefined {
  const last = (n: number) => rangeDates(addDays(today, -(n - 1)), today);
  switch (goal.metric) {
    case 'weightKg':
      return latestWeight(days, today)?.kg;
    case 'sleepHours':
      return avg(last(14).map((d) => sleepHours(days[d]?.sleep)));
    case 'refitsPerNight':
      return avg(last(14).map((d) => nightRefits(days[d])));
    case 'gutDaysPerWeek':
      return last(7).filter((d) => (days[d]?.gut?.discomfort ?? 0) >= 4).length;
    case 'exercisePerWeek':
      return computeWeekStats(weekStartOf(today), days, t).exerciseSessions;
    case 'meditationMin':
      return avg(last(7).map((d) => (days[d] ? meditationMinutes(days[d]) : undefined)));
    case 'focusBlocks':
      return avg(last(7).map((d) => days[d]?.stand?.focusBlocks));
    default:
      return undefined;
  }
}

/** 0–1 progress from baseline toward target (either direction). */
export function goalProgress(goal: Goal, current: number | undefined): number | undefined {
  if (current === undefined || goal.baseline === undefined || goal.baseline === goal.target) return undefined;
  return clamp((current - goal.baseline) / (goal.target - goal.baseline), 0, 1);
}

// ---------------------------------------------------------------- care signals

export interface CareSignal {
  id: string;
  level: 'watch' | 'see';
  text: string;
  dept?: string;
}

/** Patterns in the logs that are worth raising with a doctor. */
export function careSignals(days: DayMap, today: ISODate, heightCm: number | undefined, programStart: ISODate | undefined): CareSignal[] {
  const out: CareSignal[] = [];
  const w = latestWeight(days, today);
  const w4 = latestWeight(days, addDays(today, -28));
  if (w && heightCm) {
    const m = heightCm / 100;
    const b = w.kg / (m * m);
    if (b < 18.5) out.push({ id: 'bmi', level: 'see', text: `BMI ${Math.round(b * 10) / 10}，低于 18.5`, dept: '家医科' });
  }
  if (w && w4 && w4.date !== w.date && w4.kg - w.kg >= 1) {
    out.push({ id: 'weight-drop', level: 'see', text: `4 周内体重少了 ${Math.round((w4.kg - w.kg) * 10) / 10} kg`, dept: '家医科' });
  }
  const last14 = rangeDates(addDays(today, -13), today);
  const gutBad = last14.filter((d) => (days[d]?.gut?.discomfort ?? 0) >= 4).length;
  if (gutBad >= 5) out.push({ id: 'gut', level: 'see', text: `近两周有 ${gutBad} 天胃部不适 ≥4 分`, dept: '胃肠肝胆科' });
  const noct = avg(last14.map((d) => days[d]?.sleep?.nocturia));
  if (noct !== undefined && noct >= 2) out.push({ id: 'nocturia', level: 'see', text: `近两周平均每晚起夜 ${Math.round(noct * 10) / 10} 次`, dept: '泌尿科' });
  const week = programWeek(programStart, today);
  if (week !== undefined && week >= 4) {
    const first = avg(rangeDates(addDays(today, -27), addDays(today, -14)).map((d) => nightRefits(days[d])));
    const recent = avg(last14.map((d) => nightRefits(days[d])));
    if (first !== undefined && recent !== undefined && recent >= first) {
      out.push({ id: 'erp', level: 'watch', text: `练习第 ${week} 周，夜里起来的次数还没有下降`, dept: '身心科 / 精神科' });
    } else if (recent === undefined) {
      out.push({ id: 'erp-nodata', level: 'watch', text: `练习已到第 ${week} 周，最近两周没有睡眠记录，看不出变化`, dept: '身心科 / 精神科' });
    }
  }
  return out;
}
