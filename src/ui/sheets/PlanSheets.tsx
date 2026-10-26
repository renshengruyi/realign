import { useState } from 'preact/hooks';
import { SCENE_LABEL } from '../../domain/defaults';
import type { Plan, PlanRule, Targets } from '../../domain/types';
import { activePlan, notify, targets } from '../../platform/store';
import { Field, Stepper, TimeInput } from '../components/controls';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { closeSheet } from '../nav';
import { updateActivePlan } from '../planning';

const NUMERIC: { key: keyof Targets; label: string; step?: number; max?: number }[] = [
  { key: 'refitCap', label: '每晚最多起来重铺（次）', max: 10 },
  { key: 'urgeDelayMin', label: '冲动来了先等（分钟）', max: 30 },
  { key: 'exposurePerWeek', label: '暴露练习（次/周）', max: 14 },
  { key: 'exposureMin', label: '每次暴露（分钟）', step: 5, max: 60 },
  { key: 'napMin', label: '午睡训练（分钟）', step: 5, max: 40 },
  { key: 'mealsPerDay', label: '每天吃几次', max: 8 },
  { key: 'slowMealsPerDay', label: '其中细嚼慢咽几次', max: 8 },
  { key: 'meditationMin', label: '每天冥想（分钟）', step: 5, max: 120 },
  { key: 'moveMin', label: '每天活动（分钟）', step: 5, max: 180 },
  { key: 'exercisePerWeek', label: '力量训练（次/周）', max: 7 },
  { key: 'standBreaks', label: '每天站起来（次）', max: 20 },
  { key: 'focusBlocks', label: '每天专注（段）', max: 12 },
  { key: 'sitMin', label: '每段坐（分钟）', step: 5, max: 90 },
  { key: 'standMin', label: '每次站（分钟）', step: 5, max: 30 },
];

export function PlanEditSheet() {
  const plan = activePlan.value;
  const [p, setP] = useState<Plan>(() => ({ ...plan, rules: plan.rules.map((r) => ({ ...r })) }));
  const [t, setT] = useState<Targets>(() => ({ ...targets.value }));
  const setRule = (i: number, patch: Partial<PlanRule>) => setP((x) => ({ ...x, rules: x.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  async function save() {
    await updateActivePlan({
      title: p.title,
      phase: p.phase,
      focus: p.focus,
      rules: p.rules.filter((r) => r.text.trim()),
      targets: t,
      source: plan.source === 'template' ? 'user' : plan.source,
    });
    closeSheet();
    notify('计划已更新', 'success');
  }

  return (
    <Sheet
      title="修改本周计划"
      onClose={closeSheet}
      footer={
        <button type="button" class="btn primary" onClick={save}>
          <Icon name="check" />
          保存
        </button>
      }
    >
      <Field label="标题">
        <input class="input" value={p.title} onInput={(e) => setP({ ...p, title: (e.target as HTMLInputElement).value })} aria-label="标题" />
      </Field>
      <Field label="阶段">
        <input class="input" value={p.phase} onInput={(e) => setP({ ...p, phase: (e.target as HTMLInputElement).value })} aria-label="阶段" />
      </Field>
      <Field label="本周重点">
        <textarea class="textarea" rows={2} value={p.focus} onInput={(e) => setP({ ...p, focus: (e.target as HTMLTextAreaElement).value })} aria-label="本周重点" />
      </Field>
      <div class="stack">
        <p class="small" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>
          规则
        </p>
        {p.rules.map((r, i) => (
          <div key={i} class="stack tight" style={{ paddingBottom: '10px', borderBottom: '1px solid var(--line)' }}>
            <div class="row">
              <select class="select" style={{ width: 'auto' }} value={r.scene} aria-label="场景" onChange={(e) => setRule(i, { scene: (e.target as HTMLSelectElement).value as PlanRule['scene'] })}>
                {Object.entries(SCENE_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
              <span class="grow" />
              <button type="button" class="icon-btn" aria-label="删除规则" onClick={() => setP({ ...p, rules: p.rules.filter((_, j) => j !== i) })}>
                <Icon name="trash" />
              </button>
            </div>
            <textarea class="textarea" rows={2} value={r.text} aria-label="规则内容" onInput={(e) => setRule(i, { text: (e.target as HTMLTextAreaElement).value })} />
          </div>
        ))}
        <button type="button" class="btn sm" style={{ justifySelf: 'start' }} onClick={() => setP({ ...p, rules: [...p.rules, { scene: 'night', text: '' }] })}>
          <Icon name="plus" />
          加一条规则
        </button>
      </div>
      <div class="row wrap" style={{ gap: '16px' }}>
        <Field label="起床时间">
          <TimeInput label="起床时间" value={t.wakeTime} onChange={(v) => setT({ ...t, wakeTime: v })} />
        </Field>
        <Field label="上床时间">
          <TimeInput label="上床时间" value={t.bedTime} onChange={(v) => setT({ ...t, bedTime: v })} />
        </Field>
      </div>
      <div class="stack">
        {NUMERIC.map((n) => (
          <div class="row between" key={n.key}>
            <span class="small">{n.label}</span>
            <Stepper label={n.label} value={t[n.key] as number} onChange={(v) => setT({ ...t, [n.key]: v })} step={n.step ?? 1} max={n.max ?? 99} />
          </div>
        ))}
      </div>
    </Sheet>
  );
}
