// App state: one signal per stored document or collection, kept live by
// subscriptions, plus the write helpers every screen uses. Writes to one
// document run one at a time, as the platform requires.
import { batch, computed, signal } from '@preact/signals';
import { addDays, todayISO, weekStartOf } from '../domain/dates';
import { CHECKUP_CATALOG, DEFAULT_RHYTHM, DEFAULT_SETTINGS, DEFAULT_TARGETS, templatePlan } from '../domain/defaults';
import type {
  ChatThread,
  CheckItem,
  CheckupRecord,
  DayDoc,
  Goal,
  ISODate,
  MemoryItem,
  MetaState,
  Plan,
  Profile,
  Review,
  RhythmItem,
  Ritual,
  Settings,
  Targets,
  Trigger,
} from '../domain/types';
import {
  errorCode,
  useCapability,
  type Assets,
  type DbError,
  type DbLike,
  type Downloads,
  type QueryRef,
  type SampleFn,
  type SampleLimits,
  type Unsub,
} from './claude';
import { createLocalDb, deepMerge, isPlainObject } from './localdb';

export type Mode = 'loading' | 'cloud' | 'local';

export interface Notice {
  id: number;
  tone: 'info' | 'error' | 'success';
  text: string;
}

const WINDOW_DAYS = 120;

export const mode = signal<Mode>('loading');
export const loaded = signal(false);
export const notices = signal<Notice[]>([]);

export const profile = signal<Profile>({ weightUnit: 'jin', conditions: [] });
export const profileExists = signal(false);
export const settings = signal<Settings>(DEFAULT_SETTINGS);
export const rhythm = signal<RhythmItem[]>(DEFAULT_RHYTHM);
export const meta = signal<MetaState>({ schema: 1 });
export const goals = signal<Goal[]>([]);
export const checkplan = signal<CheckItem[]>(CHECKUP_CATALOG);
export const triggers = signal<Trigger[]>([]);
export const rituals = signal<Ritual[]>([]);
export const plans = signal<Plan[]>([]);
export const memory = signal<MemoryItem[]>([]);
export const reviews = signal<Review[]>([]);
export const checkups = signal<CheckupRecord[]>([]);
export const chats = signal<ChatThread[]>([]);
export const days = signal<Record<ISODate, DayDoc>>({});
export const olderDays = signal<Record<ISODate, DayDoc>>({});

export const ai = signal<SampleFn | null>(null);
export const aiLimits = signal<SampleLimits | null>(null);
export const aiBlocked = signal(false);
export const assets = signal<Assets | null>(null);
export const downloads = signal<Downloads | null>(null);

/** Ticks every 30 s so "now" views stay current. */
export const clock = signal(Date.now());
export const today = computed(() => todayISO(new Date(clock.value)));

export const allDays = computed(() => ({ ...olderDays.value, ...days.value }));

export const activePlan = computed<Plan>(() => {
  const list = plans.value;
  const byId = meta.value.activePlanId ? list.find((p) => p.id === meta.value.activePlanId) : undefined;
  if (byId) return byId;
  const active = list.filter((p) => p.status === 'active').sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  return active[0] ?? templatePlan(weekStartOf(today.value), 0);
});

export const targets = computed<Targets>(() => ({ ...DEFAULT_TARGETS, ...activePlan.value.targets }));

let db: DbLike | null = null;
let noticeSeq = 0;

export function notify(text: string, tone: Notice['tone'] = 'info') {
  const n = { id: ++noticeSeq, tone, text };
  notices.value = [...notices.value, n].slice(-3);
  setTimeout(() => {
    notices.value = notices.value.filter((x) => x.id !== n.id);
  }, tone === 'error' ? 6000 : 3200);
}

// ---------------------------------------------------------------- writes

const queues = new Map<string, Promise<unknown>>();
const known = new Map<string, boolean>();

function enqueue<T>(path: string, op: () => Promise<T>): Promise<T> {
  const prev = queues.get(path) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(op);
  queues.set(path, next);
  next.finally(() => {
    if (queues.get(path) === next) queues.delete(path);
  });
  return next;
}

/** Drop undefined values so bodies stay plain JSON. */
export function clean<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clean) as T;
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = clean(x);
    return out as T;
  }
  return v;
}

const WRITE_MESSAGES: Record<string, string> = {
  quota_exceeded: '存储空间满了。可以在「档案 · 数据」导出备份后清理旧记录。',
  invalid_argument: '这条数据没能保存，格式有问题。',
  resource_exhausted: '操作太快了，稍等几秒再试。',
  revoked: '访问权限变了，请重新打开页面。',
  not_granted: '当前环境不能保存数据。',
  capability_disabled: '当前环境不能保存数据。',
};

async function withRetry(op: () => Promise<void>) {
  try {
    await op();
  } catch (e) {
    if (errorCode(e) !== 'unavailable') throw e;
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 700));
    await op();
  }
}

function report(e: unknown) {
  const code = errorCode(e);
  notify(WRITE_MESSAGES[code] ?? '网络不稳定，刚才的修改没保存上，请再试一次。', 'error');
  console.error('[realign] write failed', e);
}

function requireDb(): DbLike {
  if (!db) throw { code: 'not_granted', message: 'store not ready' };
  return db;
}

export function setDocument(path: string, data: Record<string, unknown>): Promise<void> {
  return enqueue(path, async () => {
    await withRetry(() => requireDb().doc(path).set(clean(data)));
    known.set(path, true);
  }).catch((e) => {
    report(e);
    throw e;
  });
}

export function mergeDocument(path: string, patch: Record<string, unknown>): Promise<void> {
  return enqueue(path, async () => {
    const ref = requireDb().doc(path);
    let exists = known.get(path);
    if (exists === undefined) exists = (await ref.get()).exists;
    const body = clean(patch);
    await withRetry(() => (exists ? ref.update(body) : ref.set(body)));
    known.set(path, true);
  }).catch((e) => {
    report(e);
    throw e;
  });
}

export function deleteDocument(path: string): Promise<void> {
  return enqueue(path, async () => {
    await withRetry(() => requireDb().doc(path).delete());
    known.set(path, false);
  }).catch((e) => {
    report(e);
    throw e;
  });
}

export function dayOf(date: ISODate): DayDoc | undefined {
  return days.value[date] ?? olderDays.value[date];
}

/** Merge into a day's document (nested objects merge, lists replace). */
export function patchDay(date: ISODate, patch: Partial<DayDoc>): Promise<void> {
  const body = { ...clean(patch), date, updatedAt: Date.now() } as Record<string, unknown>;
  const current = dayOf(date) ?? { date };
  const merged = deepMerge(current as unknown as Record<string, unknown>, body) as unknown as DayDoc;
  if (date >= addDays(today.value, -WINDOW_DAYS)) days.value = { ...days.value, [date]: merged };
  else olderDays.value = { ...olderDays.value, [date]: merged };
  return mergeDocument(`days/${date}`, body).catch(() => refetchDay(date));
}

type ListKey = 'meals' | 'erp' | 'urges' | 'top3';

export function updateDayList<K extends ListKey>(
  date: ISODate,
  key: K,
  fn: (list: NonNullable<DayDoc[K]>) => NonNullable<DayDoc[K]>,
): Promise<void> {
  const current = (dayOf(date)?.[key] ?? []) as NonNullable<DayDoc[K]>;
  return patchDay(date, { [key]: fn(current) } as Partial<DayDoc>);
}

async function refetchDay(date: ISODate) {
  try {
    const s = await requireDb().doc(`days/${date}`).get();
    const next = { ...days.value };
    if (s.exists) next[date] = s.data() as unknown as DayDoc;
    else delete next[date];
    days.value = next;
  } catch {
    /* the live subscription will correct it */
  }
}

export async function loadDays(from: ISODate, to: ISODate): Promise<void> {
  if (!db) return;
  try {
    const snap = await db.collection('days').where('date', '>=', from).where('date', '<=', to).get();
    const next = { ...olderDays.value };
    snap.docs.forEach((d) => {
      const body = d.data() as unknown as DayDoc | undefined;
      if (body) next[body.date ?? d.id] = body;
    });
    olderDays.value = next;
  } catch (e) {
    console.error('[realign] load days failed', e);
  }
}

export async function fetchAll(collection: string): Promise<Record<string, unknown>[]> {
  if (!db) return [];
  const snap = await db.collection(collection).get();
  return snap.docs.map((d) => ({ __id: d.id, ...(d.data() ?? {}) }));
}

// ---------------------------------------------------------------- subscriptions

let pending = 0;
let pendingTimer: ReturnType<typeof setTimeout> | undefined;

function markOnce() {
  let done = false;
  pending += 1;
  return () => {
    if (done) return;
    done = true;
    pending -= 1;
    if (pending <= 0) loaded.value = true;
  };
}

function onSubError(label: string, resubscribe: () => void) {
  let attempts = 0;
  return (e: DbError) => {
    console.error(`[realign] subscription ${label} ended`, e);
    if (e.code === 'revoked') {
      notify('访问权限变了，请重新打开页面。', 'error');
      return;
    }
    if (e.code === 'unavailable' && attempts < 3) {
      attempts += 1;
      setTimeout(resubscribe, 1500 * attempts);
    }
  };
}

function subDoc<T>(path: string, apply: (data: T | undefined) => void): Unsub {
  const done = markOnce();
  let unsub: Unsub = () => {};
  const start = () => {
    unsub = requireDb()
      .doc(path)
      .onSnapshot(
        (s) => {
          known.set(path, s.exists);
          apply(s.exists ? (s.data() as T) : undefined);
          done();
        },
        onSubError(path, start),
      );
  };
  start();
  return () => unsub();
}

function subQuery<T>(label: string, build: () => QueryRef, apply: (docs: { id: string; data: T }[]) => void): Unsub {
  const done = markOnce();
  let unsub: Unsub = () => {};
  const start = () => {
    unsub = build().onSnapshot(
      (s) => {
        const list = s.docs.filter((d) => d.exists).map((d) => ({ id: d.id, data: d.data() as T }));
        list.forEach((d) => known.set(`${label}/${d.id}`, true));
        apply(list);
        done();
      },
      onSubError(label, start),
    );
  };
  start();
  return () => unsub();
}

const listOf = <T>(data: { items?: T[] } | undefined, fallback: T[]): T[] =>
  Array.isArray(data?.items) ? (data?.items as T[]) : fallback;

function subscribeAll() {
  const from = addDays(todayISO(), -WINDOW_DAYS);
  subDoc<Profile>('profile/main', (d) => {
    batch(() => {
      profileExists.value = !!d;
      profile.value = { weightUnit: 'jin', conditions: [], ...(d ?? {}) };
    });
  });
  subDoc<Settings>('settings/main', (d) => (settings.value = { ...DEFAULT_SETTINGS, ...(d ?? {}) }));
  subDoc<{ items: RhythmItem[] }>('settings/rhythm', (d) => (rhythm.value = listOf(d, DEFAULT_RHYTHM)));
  subDoc<MetaState>('meta/state', (d) => (meta.value = { schema: 1, ...(d ?? {}) }));
  subDoc<{ items: Goal[] }>('goals/main', (d) => (goals.value = listOf(d, [])));
  subDoc<{ items: CheckItem[] }>('health/checkplan', (d) => (checkplan.value = listOf(d, CHECKUP_CATALOG)));
  subDoc<{ items: Trigger[] }>('erp/hierarchy', (d) => (triggers.value = listOf(d, [])));
  subDoc<{ items: Ritual[] }>('erp/rituals', (d) => (rituals.value = listOf(d, [])));

  subQuery<DayDoc>('days', () => requireDb().collection('days').where('date', '>=', from), (list) => {
    const next: Record<ISODate, DayDoc> = {};
    list.forEach(({ id, data }) => (next[data.date ?? id] = data));
    days.value = next;
  });
  subQuery<Plan>('plans', () => requireDb().collection('plans'), (list) => (plans.value = list.map((d) => ({ ...d.data, id: d.id }))));
  subQuery<MemoryItem>('memory', () => requireDb().collection('memory'), (list) => {
    memory.value = list.map((d) => ({ ...d.data, id: d.id })).sort((a, b) => b.createdAt - a.createdAt);
  });
  subQuery<Review>('reviews', () => requireDb().collection('reviews'), (list) => {
    reviews.value = list.map((d) => ({ ...d.data, id: d.id })).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  });
  subQuery<CheckupRecord>('checkups', () => requireDb().collection('checkups'), (list) => {
    checkups.value = list.map((d) => ({ ...d.data, id: d.id })).sort((a, b) => b.date.localeCompare(a.date));
  });
  subQuery<ChatThread>('chats', () => requireDb().collection('chats'), (list) => {
    chats.value = list.map((d) => ({ ...d.data, id: d.id })).sort((a, b) => b.updatedAt - a.updatedAt);
  });
}

// ---------------------------------------------------------------- boot

export async function initStore(): Promise<void> {
  setInterval(() => (clock.value = Date.now()), 30_000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) clock.value = Date.now();
  });

  const cloud = await useCapability<DbLike>('db');
  db = cloud ?? createLocalDb();
  mode.value = cloud ? 'cloud' : 'local';
  pendingTimer = setTimeout(() => (loaded.value = true), 8000);
  subscribeAll();

  const [sample, assetNs, downloadNs] = await Promise.all([
    useCapability<SampleFn>('sample'),
    useCapability<Assets>('assets'),
    useCapability<Downloads>('downloads'),
  ]);
  ai.value = sample;
  assets.value = assetNs;
  downloads.value = downloadNs;
  if (sample) {
    aiLimits.value = await sample.limits().catch(() => null);
  }
}

export function stopLoadingTimer() {
  if (pendingTimer) clearTimeout(pendingTimer);
}
