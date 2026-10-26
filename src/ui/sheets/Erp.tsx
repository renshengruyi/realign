import { useState } from 'preact/hooks';
import type { Ritual, Trigger } from '../../domain/types';
import { newId } from '../../platform/localdb';
import { notify, rituals, setDocument, triggers } from '../../platform/store';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { closeSheet } from '../nav';

export function HierarchySheet() {
  const [list, setList] = useState<Trigger[]>(() => triggers.value.map((x) => ({ ...x })));
  const [acts, setActs] = useState<Ritual[]>(() => rituals.value.map((x) => ({ ...x })));
  const [draft, setDraft] = useState('');
  const [draftAct, setDraftAct] = useState('');
  const upd = (id: string, p: Partial<Trigger>) => setList((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const updAct = (id: string, p: Partial<Ritual>) => setActs((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));

  async function save() {
    await setDocument('erp/hierarchy', { items: list.filter((x) => x.text.trim()) });
    await setDocument('erp/rituals', { items: acts.filter((x) => x.text.trim()) });
    closeSheet();
    notify('清单已保存', 'success');
  }

  return (
    <Sheet
      title="触发清单与处理动作"
      onClose={closeSheet}
      footer={
        <button type="button" class="btn primary" onClick={save}>
          <Icon name="check" />
          保存
        </button>
      }
    >
      <div class="stack">
        <p class="small soft">把会引发不适感的接触情境都写下来，各打一个 0–10 的难受分。这是后面暴露练习的地图。</p>
        <ul class="list">
          {list.map((x) => (
            <li key={x.id} class="stack tight" style={{ padding: '10px 0' }}>
              <div class="row">
                <input class="input grow" value={x.text} aria-label="情境" onInput={(e) => upd(x.id, { text: (e.target as HTMLInputElement).value })} />
                <input
                  class="input"
                  style={{ width: '76px' }}
                  inputMode="numeric"
                  placeholder="分数"
                  aria-label="难受分"
                  value={x.score ?? ''}
                  onInput={(e) => {
                    const v = Number((e.target as HTMLInputElement).value);
                    upd(x.id, { score: (e.target as HTMLInputElement).value === '' || !Number.isFinite(v) ? undefined : Math.max(0, Math.min(10, Math.round(v))) });
                  }}
                />
                <button type="button" class="icon-btn" aria-label="删除" onClick={() => setList((l) => l.filter((y) => y.id !== x.id))}>
                  <Icon name="trash" />
                </button>
              </div>
              <div class="seg" role="group" aria-label="状态">
                {(
                  [
                    ['todo', '未开始'],
                    ['practicing', '练习中'],
                    ['done', '已适应'],
                  ] as const
                ).map(([v, l]) => (
                  <button type="button" key={v} aria-pressed={x.status === v} onClick={() => upd(x.id, { status: v })}>
                    {l}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <form
          class="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            setList((l) => [...l, { id: newId('g'), text: draft.trim(), status: 'todo' }]);
            setDraft('');
          }}
        >
          <input class="input" placeholder="再加一个情境，例如：穿新买的 T 恤午睡" value={draft} onInput={(e) => setDraft((e.target as HTMLInputElement).value)} aria-label="新情境" />
          <button type="submit" class="btn" disabled={!draft.trim()}>
            添加
          </button>
        </form>
      </div>
      <hr class="divider" />
      <div class="stack">
        <p class="small soft">你会做的所有处理动作，越细越好。标出哪些在减少、哪些已经放下了。</p>
        <ul class="list">
          {acts.map((x) => (
            <li key={x.id} class="stack tight" style={{ padding: '10px 0' }}>
              <div class="row">
                <input class="input grow" value={x.text} aria-label="动作" onInput={(e) => updAct(x.id, { text: (e.target as HTMLInputElement).value })} />
                <button type="button" class="icon-btn" aria-label="删除" onClick={() => setActs((l) => l.filter((y) => y.id !== x.id))}>
                  <Icon name="trash" />
                </button>
              </div>
              <div class="seg" role="group" aria-label="状态">
                {(
                  [
                    ['active', '还在做'],
                    ['reducing', '在减少'],
                    ['dropped', '已放下'],
                  ] as const
                ).map(([v, l]) => (
                  <button type="button" key={v} aria-pressed={x.status === v} onClick={() => updAct(x.id, { status: v })}>
                    {l}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <form
          class="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draftAct.trim()) return;
            setActs((l) => [...l, { id: newId('a'), text: draftAct.trim(), status: 'active' }]);
            setDraftAct('');
          }}
        >
          <input class="input" placeholder="例如：心里默念“没事”" value={draftAct} onInput={(e) => setDraftAct((e.target as HTMLInputElement).value)} aria-label="新动作" />
          <button type="submit" class="btn" disabled={!draftAct.trim()}>
            添加
          </button>
        </form>
      </div>
    </Sheet>
  );
}
