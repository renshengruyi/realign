// The sit–stand rhythm: sit and focus for N minutes, then stand and move for M.
// It keeps running while the app is open on any tab, and survives a reload.
import { effect, signal } from '@preact/signals';
import { dayOf, notify, patchDay, targets, today } from '../platform/store';
import { play } from './audio';

export interface SitStandState {
  phase: 'sit' | 'stand';
  phaseStartedAt: number;
  sitMin: number;
  standMin: number;
  pausedAt?: number;
}

const KEY = 'realign:sitstand';

function load(): SitStandState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SitStandState) : null;
  } catch {
    return null;
  }
}

function save(s: SitStandState | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the rhythm still runs for this visit */
  }
}

export const sitstand = signal<SitStandState | null>(load());
export const sitstandTick = signal(0);

function set(s: SitStandState | null) {
  sitstand.value = s;
  save(s);
}

export function startSitStand(opts: { sitMin?: number; standMin?: number } = {}) {
  set({
    phase: 'sit',
    phaseStartedAt: Date.now(),
    sitMin: opts.sitMin ?? targets.value.sitMin,
    standMin: opts.standMin ?? targets.value.standMin,
  });
  notify(`开始专注 ${opts.sitMin ?? targets.value.sitMin} 分钟，到点提醒你站起来。`, 'success');
}

export function stopSitStand() {
  set(null);
}

export function pauseSitStand() {
  const s = sitstand.value;
  if (s && !s.pausedAt) set({ ...s, pausedAt: Date.now() });
}

export function resumeSitStand() {
  const s = sitstand.value;
  if (s?.pausedAt) set({ ...s, phaseStartedAt: s.phaseStartedAt + (Date.now() - s.pausedAt), pausedAt: undefined });
}

export function remainingSec(s: SitStandState, now = Date.now()): number {
  const len = (s.phase === 'sit' ? s.sitMin : s.standMin) * 60;
  const elapsed = ((s.pausedAt ?? now) - s.phaseStartedAt) / 1000;
  return Math.max(0, len - elapsed);
}

function bump(field: 'breaks' | 'focusBlocks') {
  const date = today.value;
  const cur = dayOf(date)?.stand?.[field] ?? 0;
  void patchDay(date, { stand: { [field]: cur + 1 } });
}

/** Moves to the next phase; `completed` counts the phase that just ended. */
export function advance(completed = true) {
  const s = sitstand.value;
  if (!s) return;
  if (completed) bump(s.phase === 'sit' ? 'focusBlocks' : 'breaks');
  const next: SitStandState = { ...s, phase: s.phase === 'sit' ? 'stand' : 'sit', phaseStartedAt: Date.now(), pausedAt: undefined };
  set(next);
  play('chime');
  notify(
    next.phase === 'stand'
      ? `站起来 ${s.standMin} 分钟：走一走、倒杯水，做几次收下巴。`
      : `可以坐下了，开始下一段 ${s.sitMin} 分钟专注。`,
    'success',
  );
}

let timer: ReturnType<typeof setInterval> | undefined;

effect(() => {
  const s = sitstand.value;
  if (timer) clearInterval(timer);
  timer = undefined;
  if (!s || s.pausedAt) return;
  timer = setInterval(() => {
    const cur = sitstand.value;
    if (!cur || cur.pausedAt) return;
    sitstandTick.value += 1;
    const len = (cur.phase === 'sit' ? cur.sitMin : cur.standMin) * 60;
    const over = (Date.now() - cur.phaseStartedAt) / 1000 - len;
    if (over >= 0 && over < 20 * 60) advance(true);
    else if (over >= 20 * 60) {
      // the app was away for a long time: don't pretend phases happened
      set({ ...cur, pausedAt: cur.phaseStartedAt + len * 1000 });
      notify('坐站节拍已暂停：离开太久了。回来后点一下继续。');
    }
  }, 1000);
});
