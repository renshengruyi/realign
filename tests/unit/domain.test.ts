import { describe, expect, it } from 'vitest';
import { buildContext, daysTable, parseReply, sanitizePatch } from '../../src/domain/ai';
import { addDays, clockDelta, nightDateOf, rangeDates, weekStartOf } from '../../src/domain/dates';
import { DEFAULT_RHYTHM, DEFAULT_TARGETS, templatePlan } from '../../src/domain/defaults';
import {
  careSignals,
  computeInsights,
  computeMilestones,
  computeSeals,
  computeWeekStats,
  nightRefits,
  rhythmDone,
  rhythmNow,
  sleepHours,
  type DayMap,
} from '../../src/domain/metrics';
import type { DayDoc } from '../../src/domain/types';
import { bmi, healthyWeightRange, kgTo, toKg } from '../../src/domain/units';

describe('dates', () => {
  it('starts weeks on Monday', () => {
    expect(weekStartOf('2026-10-26')).toBe('2026-10-26'); // Monday
    expect(weekStartOf('2026-11-01')).toBe('2026-10-26'); // Sunday
    expect(weekStartOf('2026-10-27')).toBe('2026-10-26');
  });

  it('attributes late-evening events to the next morning', () => {
    expect(nightDateOf(new Date(2026, 9, 26, 23, 40).getTime())).toBe('2026-10-27');
    expect(nightDateOf(new Date(2026, 9, 27, 2, 10).getTime())).toBe('2026-10-27');
  });

  it('measures clock differences across midnight', () => {
    expect(clockDelta('07:10', '07:30')).toBe(-20);
    expect(clockDelta('00:20', '23:50')).toBe(30);
  });

  it('builds inclusive ranges', () => {
    expect(rangeDates('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });
});

describe('units', () => {
  it('converts jin at 500 g', () => {
    expect(toKg('jin', 105)).toBe(52.5);
    expect(kgTo('jin', 52.5)).toBe(105);
  });

  it('computes BMI and the healthy range', () => {
    expect(bmi(52.5, 173)!).toBeCloseTo(17.54, 2);
    const [lo, hi] = healthyWeightRange(173);
    expect(lo).toBeCloseTo(55.4, 1);
    expect(hi).toBeCloseTo(71.8, 1);
  });
});

describe('sleep', () => {
  it('estimates hours across midnight minus latency', () => {
    expect(sleepHours({ bedtime: '23:30', wakeTime: '07:00', latencyMin: 30 })).toBe(7);
    expect(sleepHours({ bedtime: '01:00', wakeTime: '06:30' })).toBe(5.5);
    expect(sleepHours({ bedtime: '23:00' })).toBeUndefined();
  });

  it('falls back to the night log for refits', () => {
    const d: DayDoc = { date: '2026-10-27', urges: [
      { id: 'a', at: 1, decision: 'got-up' },
      { id: 'b', at: 2, decision: 'stayed' },
      { id: 'c', at: 3, decision: 'got-up' },
    ] };
    expect(nightRefits(d)).toBe(2);
    expect(nightRefits({ ...d, sleep: { refits: 1 } })).toBe(1);
  });
});

describe('seals', () => {
  it('scores each area of the day', () => {
    const t = DEFAULT_TARGETS;
    const day: DayDoc = {
      date: '2026-10-26',
      sleep: { wakeTime: '07:35', refits: 1, loggedAt: 1 },
      nap: { done: true },
      meals: Array.from({ length: 5 }, (_, i) => ({ id: String(i), time: '08:00', type: 'snack' as const, slow: i < 3 })),
      habits: { meditateAmMin: 10, meditatePmMin: 10, journal: true, exerciseMin: 30 },
      stand: { breaks: 6 },
    };
    const seals = computeSeals(day, t);
    expect(seals.map((s) => s.done)).toEqual([true, true, true, true]);
    const empty = computeSeals({ date: '2026-10-26' }, t);
    expect(empty.every((s) => s.progress === 0)).toBe(true);
  });

  it('does not stamp sleep when the cap was broken', () => {
    const s = computeSeals({ date: 'x', sleep: { wakeTime: '07:30', refits: 4, loggedAt: 1 }, nap: { done: true } }, DEFAULT_TARGETS)[0];
    expect(s.done).toBe(false);
    expect(s.parts[1].done).toBe(false);
  });
});

describe('rhythm', () => {
  it('derives done states from logs and respects manual checks', () => {
    const items = DEFAULT_RHYTHM;
    const lunch = items.find((i) => i.id === 'r-lunch')!;
    const snack2 = items.find((i) => i.id === 'r-snack-pm')!;
    const day: DayDoc = { date: 'x', meals: [{ id: '1', time: '12:30', type: 'lunch' }, { id: '2', time: '10:30', type: 'snack' }] };
    expect(rhythmDone(lunch, day, items)).toBe(true);
    expect(rhythmDone(snack2, day, items)).toBe(false); // only one snack so far
    expect(rhythmDone(snack2, { ...day, checks: { 'r-snack-pm': true } }, items)).toBe(true);
  });

  it('finds the current and next item', () => {
    const items = DEFAULT_RHYTHM;
    const now = rhythmNow(items, undefined, 13 * 60 + 20);
    expect(now.current?.id).toBe('r-nap');
    expect(now.next?.id).toBe('r-focus-pm');
  });
});

function sampleDays(n: number, end = '2026-10-25'): DayMap {
  const out: DayMap = {};
  rangeDates(addDays(end, -(n - 1)), end).forEach((date, i) => {
    const good = i % 2 === 0;
    out[date] = {
      date,
      sleep: { bedtime: '23:30', wakeTime: good ? '07:30' : '06:30', latencyMin: good ? 20 : 60, refits: good ? 1 : 3, maxDiscomfort: good ? 4 : 7, loggedAt: 1 },
      energy: { am: good ? 4 : 2, pm: good ? 3 : 2 },
      gut: { discomfort: good ? 2 : 5 },
      meals: Array.from({ length: 4 }, (_, k) => ({ id: `${date}${k}`, time: '08:00', type: 'snack' as const, slow: good ? k < 3 : k < 1 })),
      habits: { meditatePmMin: good ? 10 : 0 },
      erp: [
        { id: `e${i}`, kind: 'exposure', startedAt: 0, durationSec: 900, plannedMin: 15, predicted: 8, ratings: [{ t: 0, v: 6 }, { t: 150, v: 5 }, { t: 900, v: 3 }], completed: true },
      ],
      weightKg: i === 0 ? 52.5 : i === n - 1 ? 53.6 : undefined,
    };
  });
  return out;
}

describe('weekly stats and insights', () => {
  const days = sampleDays(14);

  it('summarises a week', () => {
    const s = computeWeekStats('2026-10-19', days, DEFAULT_TARGETS);
    expect(s.days).toBe(7);
    expect(s.exposures).toBe(7);
    expect(s.refitNights).toBe(7);
    expect(s.capKeptNights).toBe(3); // days 8, 10, 12 of the sample are the good nights
    expect(s.predictionGap).toBeCloseTo(2);
    expect(s.weightKg).toBe(53.6);
  });

  it('compares groups of days', () => {
    const ids = computeInsights(days, '2026-10-12', '2026-10-25', DEFAULT_TARGETS).map((x) => x.id);
    expect(ids).toContain('sleep-energy');
    expect(ids).toContain('slow-gut');
    expect(ids).toContain('prediction');
  });

  it('awards milestones once', () => {
    const ms = computeMilestones(days, DEFAULT_TARGETS);
    expect(ms.filter((m) => m.id === 'exposure-10')).toHaveLength(1);
    expect(ms.some((m) => m.id === 'weight-1')).toBe(true);
  });

  it('raises care signals', () => {
    const sig = careSignals(days, '2026-10-25', 173, '2026-09-21').map((s) => s.id);
    expect(sig).toContain('bmi');
    expect(sig).toContain('gut');
  });
});

describe('ai helpers', () => {
  it('splits replies from proposed actions', () => {
    const reply = '可以先把晚餐提前。\n```actions\n[{"type":"memory","text":"咖啡后胃更难受","category":"饮食"},{"type":"task","text":"预约家医科"},{"type":"log","date":"2026-10-26","summary":"重铺 3 次","patch":{"sleep":{"refits":3},"evil":1}}]\n```';
    const { display, actions } = parseReply(reply);
    expect(display).toBe('可以先把晚餐提前。');
    expect(actions.map((a) => a.type)).toEqual(['memory', 'task', 'log']);
    const log = actions[2];
    expect(log.type === 'log' && log.patch).toEqual({ sleep: { refits: 3 } });
  });

  it('hides a half-streamed actions block', () => {
    expect(parseReply('好的。\n```actions\n[{"type":').display).toBe('好的。');
  });

  it('rejects out-of-range values', () => {
    expect(sanitizePatch({ sleep: { refits: -1, maxDiscomfort: 11, bedtime: '7:05' }, mood: 9, weightKg: 52.5 })).toEqual({ sleep: { bedtime: '07:05' }, weightKg: 52.5 });
  });

  it('builds a bounded context', () => {
    const ctx = buildContext({
      today: '2026-10-26',
      nowHM: '09:00',
      profile: { weightUnit: 'jin', conditions: [{ id: 'c', name: '慢性胃炎', status: 'active' }], birthYear: 1996, heightCm: 173 },
      plan: templatePlan('2026-10-26', 0),
      targets: DEFAULT_TARGETS,
      goals: [],
      memory: [],
      days: sampleDays(30),
      reviews: [],
      checkplan: [],
      checkups: [],
      triggers: [],
      rituals: [],
      latestWeightKg: 52.5,
    });
    expect(ctx).toContain('慢性胃炎');
    expect(ctx).toContain('BMI 17.5');
    expect(ctx.split('\n').filter((l) => /^\d+\/\d+ 周/.test(l))).toHaveLength(14);
    expect(ctx.length).toBeLessThan(12000);
  });

  it('collapses runs of empty days', () => {
    const t = daysTable({ '2026-10-26': { date: '2026-10-26', weightKg: 52.5 } }, '2026-10-13', '2026-10-26');
    expect(t.split('\n')).toEqual(['10/13–10/25｜无记录（13 天）', '10/26 周一｜体重52.5kg']);
  });
});
