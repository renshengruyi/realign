// A small document store with the same surface as the platform `db`, kept in
// localStorage. Used when the page runs outside a claude.ai viewer, so the app
// still works (on this one browser) and behaves the same way in tests.
import type { CollRef, DbLike, DocRef, DocSnap, QueryRef, QuerySnap, Unsub } from './claude';

type Body = Record<string, unknown>;
type Filter = { field: string; op: string; value: unknown };
type Spec = { filters: Filter[]; order?: { field: string; dir: 'asc' | 'desc' }; limit?: number };

const KEY = 'realign:local-db:v1';

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export function isPlainObject(v: unknown): v is Body {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Nested objects merge; arrays and scalars replace (the platform's update rule). */
export function deepMerge(base: Body, patch: Body): Body {
  const out: Body = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k] as Body, v) : clone(v);
  }
  return out;
}

function segments(path: string): string[] {
  const parts = path.split('/');
  if (parts.some((p) => !p || p === '.' || p === '..' || !/^[A-Za-z0-9_\-.~:@+]+$/.test(p))) {
    throw new TypeError(`bad path: ${path}`);
  }
  return parts;
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return (a as number) < (b as number) ? -1 : 1;
}

function matches(body: Body, f: Filter): boolean {
  const v = body[f.field];
  switch (f.op) {
    case '==':
      return v === f.value;
    case '!=':
      return v !== f.value;
    case '<':
      return v !== undefined && (v as number) < (f.value as number);
    case '<=':
      return v !== undefined && (v as number) <= (f.value as number);
    case '>':
      return v !== undefined && (v as number) > (f.value as number);
    case '>=':
      return v !== undefined && (v as number) >= (f.value as number);
    case 'in':
      return Array.isArray(f.value) && f.value.includes(v);
    case 'not-in':
      return Array.isArray(f.value) && !f.value.includes(v);
    case 'array-contains':
      return Array.isArray(v) && v.includes(f.value);
    default:
      return false;
  }
}

export function createLocalDb(storage: Storage | null = safeStorage()): DbLike {
  let docs: Record<string, Body> = load();
  const docSubs = new Map<string, Set<(s: DocSnap) => void>>();
  const querySubs = new Set<{ coll: string; spec: Spec; next: (s: QuerySnap) => void }>();

  function load(): Record<string, Body> {
    try {
      const raw = storage?.getItem(KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function persist() {
    try {
      storage?.setItem(KEY, JSON.stringify(docs));
    } catch {
      /* storage full or blocked: keep the in-memory copy */
    }
  }

  const snap = (path: string): DocSnap => {
    const body = docs[path];
    const id = path.split('/').pop() as string;
    return {
      id,
      exists: !!body,
      data: () => (body ? clone(body) : undefined),
      metadata: { fromCache: false, hasPendingWrites: false },
    };
  };

  function run(coll: string, spec: Spec): QuerySnap {
    const prefix = coll + '/';
    let list = Object.keys(docs)
      .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
      .sort()
      .map((p) => ({ p, body: docs[p] }));
    list = list.filter(({ body }) => spec.filters.every((f) => matches(body, f)));
    if (spec.order) {
      const { field, dir } = spec.order;
      list.sort((a, b) => compare(a.body[field], b.body[field]) * (dir === 'desc' ? -1 : 1));
    }
    if (spec.limit) list = list.slice(0, spec.limit);
    const out = list.map(({ p }) => snap(p));
    return { docs: out, size: out.length, empty: out.length === 0 };
  }

  function notify(path: string) {
    docSubs.get(path)?.forEach((fn) => fn(snap(path)));
    const coll = path.split('/').slice(0, -1).join('/');
    querySubs.forEach((s) => {
      if (s.coll === coll) s.next(run(s.coll, s.spec));
    });
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key !== KEY) return;
      const before = docs;
      docs = load();
      const changed = new Set([...Object.keys(before), ...Object.keys(docs)]);
      changed.forEach((p) => {
        if (JSON.stringify(before[p]) !== JSON.stringify(docs[p])) notify(p);
      });
    });
  }

  function docRef(path: string): DocRef {
    if (segments(path).length % 2 !== 0) throw new TypeError(`not a document path: ${path}`);
    return {
      id: path.split('/').pop() as string,
      path,
      async get() {
        return snap(path);
      },
      async set(data) {
        docs[path] = clone(data);
        persist();
        notify(path);
      },
      async update(data) {
        if (!docs[path]) throw { code: 'invalid_argument', message: `document does not exist: ${path}` };
        docs[path] = deepMerge(docs[path], data);
        persist();
        notify(path);
      },
      async delete() {
        delete docs[path];
        persist();
        notify(path);
      },
      onSnapshot(next) {
        let set = docSubs.get(path);
        if (!set) docSubs.set(path, (set = new Set()));
        set.add(next);
        setTimeout(() => set?.has(next) && next(snap(path)), 0);
        return () => set?.delete(next);
      },
    };
  }

  function queryRef(coll: string, spec: Spec): QueryRef {
    return {
      where: (field, op, value) => queryRef(coll, { ...spec, filters: [...spec.filters, { field, op, value }] }),
      orderBy: (field, dir = 'asc') => queryRef(coll, { ...spec, order: { field, dir } }),
      limit: (n) => queryRef(coll, { ...spec, limit: n }),
      async get() {
        return run(coll, spec);
      },
      onSnapshot(next): Unsub {
        const sub = { coll, spec, next };
        querySubs.add(sub);
        setTimeout(() => querySubs.has(sub) && next(run(coll, spec)), 0);
        return () => querySubs.delete(sub);
      },
    };
  }

  function collRef(path: string): CollRef {
    if (segments(path).length % 2 !== 1) throw new TypeError(`not a collection path: ${path}`);
    return {
      ...queryRef(path, { filters: [] }),
      path,
      doc: (id?: string) => docRef(`${path}/${id ?? newId()}`),
      async add(data) {
        const ref = docRef(`${path}/${newId()}`);
        await ref.set(data);
        return ref;
      },
    };
  }

  return { doc: docRef, collection: collRef };
}

export function newId(prefix = ''): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now().toString(36)}${rand}`;
}

function safeStorage(): Storage | null {
  try {
    const s = globalThis.localStorage;
    const probe = '__realign_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}
