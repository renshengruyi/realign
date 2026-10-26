import { describe, expect, it } from 'vitest';
import { createLocalDb, deepMerge } from '../../src/platform/localdb';

describe('deepMerge', () => {
  it('merges objects and replaces arrays', () => {
    expect(deepMerge({ a: { b: 1, c: 2 }, l: [1, 2] }, { a: { c: 3 }, l: [9] })).toEqual({ a: { b: 1, c: 3 }, l: [9] });
  });
});

describe('local db', () => {
  it('follows the platform document rules', async () => {
    const db = createLocalDb(null);
    expect(() => db.doc('days')).toThrow(TypeError);
    expect(() => db.collection('days/x')).toThrow(TypeError);
    await expect(db.doc('days/2026-10-26').update({ a: 1 })).rejects.toMatchObject({ code: 'invalid_argument' });
    await db.doc('days/2026-10-26').set({ date: '2026-10-26', sleep: { refits: 2 } });
    await db.doc('days/2026-10-26').update({ sleep: { maxDiscomfort: 6 } });
    const snap = await db.doc('days/2026-10-26').get();
    expect(snap.data()).toEqual({ date: '2026-10-26', sleep: { refits: 2, maxDiscomfort: 6 } });
  });

  it('filters, orders and streams queries', async () => {
    const db = createLocalDb(null);
    for (const d of ['2026-10-20', '2026-10-24', '2026-10-26']) await db.doc(`days/${d}`).set({ date: d });
    const q = await db.collection('days').where('date', '>=', '2026-10-24').orderBy('date', 'desc').get();
    expect(q.docs.map((d) => d.id)).toEqual(['2026-10-26', '2026-10-24']);
    const seen: number[] = [];
    const unsub = db.collection('days').onSnapshot((s) => seen.push(s.size));
    await new Promise((r) => setTimeout(r, 5));
    await db.doc('days/2026-10-27').set({ date: '2026-10-27' });
    unsub();
    expect(seen).toEqual([3, 4]);
  });
});
