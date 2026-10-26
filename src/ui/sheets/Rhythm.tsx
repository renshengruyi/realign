import { useState } from 'preact/hooks';
import { hmToMin } from '../../domain/dates';
import { DEFAULT_RHYTHM, MEAL_LABEL, RHYTHM_KIND_LABEL } from '../../domain/defaults';
import type { MealType, RhythmItem, RhythmKind } from '../../domain/types';
import { newId } from '../../platform/localdb';
import { notify, rhythm, setDocument, targets } from '../../platform/store';
import { Field, Segmented, Stepper } from '../components/controls';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { closeSheet } from '../nav';
import { setTargets } from '../planning';

const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

function daysLabel(days?: number[]): string {
  if (!days || days.length === 0 || days.length === 7) return '每天';
  const s = [...days].sort().join(',');
  if (s === '1,2,3,4,5') return '工作日';
  if (s === '0,6') return '周末';
  return days
    .slice()
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((d) => `周${DAY_NAMES[d]}`)
    .join('、');
}

export function RhythmSheet() {
  const [items, setItems] = useState<RhythmItem[]>(() => rhythm.value.map((x) => ({ ...x })));
  const [open, setOpen] = useState<string | null>(null);
  const update = (id: string, patch: Partial<RhythmItem>) => setItems((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const sorted = [...items].sort((a, b) => (hmToMin(a.time) ?? 0) - (hmToMin(b.time) ?? 0));

  async function save() {
    const clean = sorted.filter((x) => x.title.trim() && hmToMin(x.time) !== undefined);
    await setDocument('settings/rhythm', { items: clean });
    const wake = clean.find((x) => x.kind === 'wake')?.time;
    const bed = clean.find((x) => x.kind === 'bed')?.time;
    const t = targets.value;
    const patch: Record<string, string> = {};
    if (wake && wake !== t.wakeTime) patch.wakeTime = wake;
    if (bed && bed !== t.bedTime) patch.bedTime = bed;
    if (Object.keys(patch).length) await setTargets(patch);
    closeSheet();
    notify('作息已更新', 'success');
  }

  function add() {
    const item: RhythmItem = { id: newId('r'), time: '12:00', title: '新的一项', kind: 'custom' };
    setItems((l) => [...l, item]);
    setOpen(item.id);
  }

  return (
    <Sheet
      title="编辑作息"
      onClose={closeSheet}
      footer={
        <>
          <button type="button" class="btn ghost" onClick={() => setItems(DEFAULT_RHYTHM.map((x) => ({ ...x })))}>
            恢复默认
          </button>
          <button type="button" class="btn primary" onClick={save}>
            <Icon name="check" />
            保存
          </button>
        </>
      }
    >
      <p class="small soft">改成你真实的一天。起床和上床时间会同步到本周计划，「按时起床」以它为准。</p>
      <ul class="list">
        {sorted.map((item) => (
          <li key={item.id}>
            <div class="list-row" style={{ gap: '8px' }}>
              <input
                class="input time"
                style={{ minWidth: '136px', width: '136px' }}
                type="time"
                value={item.time}
                aria-label={`${item.title}的时间`}
                onInput={(e) => update(item.id, { time: (e.target as HTMLInputElement).value })}
              />
              <input class="input grow" value={item.title} aria-label="名称" onInput={(e) => update(item.id, { title: (e.target as HTMLInputElement).value })} />
              <button type="button" class="icon-btn" aria-label="更多设置" aria-expanded={open === item.id} onClick={() => setOpen(open === item.id ? null : item.id)}>
                <Icon name={open === item.id ? 'chev-d' : 'dots'} />
              </button>
            </div>
            {open === item.id ? (
              <div class="stack" style={{ padding: '4px 0 16px' }}>
                <Field label="类型">
                  <select
                    class="select"
                    value={item.kind}
                    onChange={(e) => update(item.id, { kind: (e.target as HTMLSelectElement).value as RhythmKind })}
                    aria-label="类型"
                  >
                    {Object.entries(RHYTHM_KIND_LABEL).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
                {item.kind === 'meal' ? (
                  <Field label="哪一餐">
                    <Segmented
                      label="餐次"
                      options={(Object.keys(MEAL_LABEL) as MealType[]).map((k) => ({ value: k, label: MEAL_LABEL[k] }))}
                      value={item.mealType}
                      onChange={(v) => update(item.id, { mealType: v })}
                    />
                  </Field>
                ) : null}
                <Field label={`哪几天：${daysLabel(item.days)}`}>
                  <div class="seg" role="group" aria-label="星期">
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                      const on = !item.days || item.days.length === 0 || item.days.includes(d);
                      return (
                        <button
                          type="button"
                          key={d}
                          aria-pressed={on}
                          onClick={() => {
                            const cur = !item.days || item.days.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : item.days;
                            const next = on ? cur.filter((x) => x !== d) : [...cur, d];
                            update(item.id, { days: next.length === 7 ? undefined : next });
                          }}
                        >
                          {DAY_NAMES[d]}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <Field label="时长（分钟，可不填）">
                  <Stepper label="时长" value={item.durationMin} onChange={(v) => update(item.id, { durationMin: v || undefined })} step={5} max={180} />
                </Field>
                <button type="button" class="btn danger sm" style={{ justifySelf: 'start' }} onClick={() => setItems((l) => l.filter((x) => x.id !== item.id))}>
                  <Icon name="trash" />
                  删除这一项
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <button type="button" class="btn" style={{ justifySelf: 'start' }} onClick={add}>
        <Icon name="plus" />
        加一项
      </button>
    </Sheet>
  );
}
