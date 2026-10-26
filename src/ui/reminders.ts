// While the app is open: a gentle nudge when a rhythm item comes due, and the
// warm, dimmer screen in the last stretch before bed.
import { effect } from '@preact/signals';
import { hmToMin, nowMin } from '../domain/dates';
import { rhythmDone, rhythmForDate } from '../domain/metrics';
import { clock, days, loaded, notify, rhythm, settings, targets, today } from '../platform/store';
import { play } from './audio';

const fired = new Set<string>();

function check() {
  if (!loaded.value || !settings.value.reminders) return;
  const date = today.value;
  const minute = nowMin(new Date(clock.value));
  const items = rhythmForDate(rhythm.value, date);
  const day = days.value[date];
  for (const item of items) {
    const at = hmToMin(item.time);
    if (at === undefined) continue;
    const key = `${date}:${item.id}`;
    if (fired.has(key)) continue;
    // due within the last 2 minutes, so a sleeping tab doesn't replay a backlog
    if (minute >= at && minute - at <= 2) {
      fired.add(key);
      if (rhythmDone(item, day, items)) continue;
      notify(`${item.time} ${item.title}`);
      play('chime');
    } else if (minute - at > 2) {
      fired.add(key);
    }
  }
}

function dusk() {
  const on = settings.value.duskFilter;
  const minute = nowMin(new Date(clock.value));
  const bed = hmToMin(targets.value.bedTime) ?? 23 * 60;
  const start = bed - 60;
  const inWindow = start < 0 ? minute >= start + 1440 || minute < bed : minute >= start || minute < 5 * 60;
  document.documentElement.classList.toggle('dusk', on && inWindow);
}

export function startReminders() {
  effect(() => {
    void clock.value;
    check();
    dusk();
  });
}
