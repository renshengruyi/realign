// Applying a structured log (from the one-line logger or a coach proposal) to a day.
import type { DayDoc, Habits } from '../domain/types';
import { newId } from '../platform/localdb';
import { dayOf, patchDay, updateDayList } from '../platform/store';

// minutes add to what is already logged that day
const ADDITIVE: (keyof Habits)[] = ['meditateAmMin', 'meditatePmMin', 'exerciseMin', 'walkMin', 'postureMin', 'readMin'];

export async function applyLogPatch(date: string, patch: Partial<DayDoc>) {
  const { meals, habits, ...rest } = patch;
  const cur = dayOf(date);
  const body: Partial<DayDoc> = { ...rest };
  if (habits) {
    const h: Habits = { ...habits };
    for (const k of ADDITIVE) {
      const v = h[k];
      if (typeof v === 'number') (h as Record<string, unknown>)[k] = ((cur?.habits?.[k] as number | undefined) ?? 0) + v;
    }
    body.habits = h;
  }
  if (body.sleep) body.sleep = { ...body.sleep, loggedAt: cur?.sleep?.loggedAt ?? Date.now() };
  if (Object.keys(body).length) await patchDay(date, body);
  if (meals?.length) await updateDayList(date, 'meals', (list) => [...list, ...meals.map((m) => ({ ...m, id: newId('m') }))]);
}

