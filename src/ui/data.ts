// Full backup and restore of everything the app stores, as one JSON file.
import { todayISO } from '../domain/dates';
import { downloads, fetchAll, notify, setDocument } from '../platform/store';

const SINGLETONS = ['profile/main', 'settings/main', 'settings/rhythm', 'meta/state', 'goals/main', 'health/checkplan', 'erp/hierarchy', 'erp/rituals'];
const COLLECTIONS = ['days', 'plans', 'memory', 'reviews', 'checkups', 'chats'];

export interface Backup {
  app: 'realign';
  version: 1;
  exportedAt: string;
  docs: Record<string, Record<string, unknown>>;
}

export async function buildBackup(): Promise<Backup> {
  const docs: Backup['docs'] = {};
  for (const path of SINGLETONS) {
    const [col, id] = path.split('/');
    const list = await fetchAll(col);
    const hit = list.find((d) => d.__id === id);
    if (hit) {
      const { __id, ...body } = hit;
      void __id;
      docs[path] = body;
    }
  }
  for (const col of COLLECTIONS) {
    const list = await fetchAll(col);
    for (const d of list) {
      const { __id, ...body } = d;
      docs[`${col}/${__id as string}`] = body;
    }
  }
  return { app: 'realign', version: 1, exportedAt: new Date().toISOString(), docs };
}

export async function exportBackup(): Promise<string | null> {
  const backup = await buildBackup();
  const json = JSON.stringify(backup, null, 1);
  const dl = downloads.value;
  if (dl) {
    try {
      await dl.save({ filename: `realign-backup-${todayISO()}.json`, data: json });
      notify('备份已导出', 'success');
      return null;
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'declined') return null;
    }
  }
  return json; // the caller shows it for copying
}

export function parseBackup(text: string): Backup {
  const data = JSON.parse(text) as Backup;
  if (data?.app !== 'realign' || typeof data.docs !== 'object') throw new Error('这不是回正的备份文件');
  for (const path of Object.keys(data.docs)) {
    const parts = path.split('/');
    if (parts.length !== 2 || ![...SINGLETONS.map((s) => s.split('/')[0]), ...COLLECTIONS].includes(parts[0])) {
      throw new Error(`备份里有不认识的记录：${path}`);
    }
  }
  return data;
}

export async function restoreBackup(b: Backup, onProgress: (done: number, total: number) => void) {
  const entries = Object.entries(b.docs);
  let done = 0;
  for (const [path, body] of entries) {
    await setDocument(path, body);
    done += 1;
    onProgress(done, entries.length);
  }
}
