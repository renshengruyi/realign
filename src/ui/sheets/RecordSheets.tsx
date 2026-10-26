import { useState } from 'preact/hooks';
import { explainLabsPrompt, reportPrompt } from '../../domain/ai';
import { formatDate } from '../../domain/dates';
import type { CheckItem, CheckupFile, CheckupRecord, Condition, Goal, GoalMetric, LabResult, Profile } from '../../domain/types';
import { kgTo, round1, toKg, unitLabel } from '../../domain/units';
import { aiMessage, aiReady, askJson, askText, currentContext, isCancel } from '../../platform/ai-client';
import { newId } from '../../platform/localdb';
import {
  aiLimits,
  assets,
  checkplan,
  checkups,
  deleteDocument,
  goals,
  mergeDocument,
  notify,
  profile,
  setDocument,
  today,
} from '../../platform/store';
import { Callout, Field, Segmented, TextArea, Thinking } from '../components/controls';
import { Icon } from '../components/Icon';
import { Markdown } from '../components/Markdown';
import { Sheet } from '../components/Sheet';
import { closeSheet, openSheet, type Spec } from '../nav';

export function RecordSheets({ spec }: { spec: Spec }) {
  const p = (spec.props ?? {}) as Record<string, unknown>;
  switch (spec.kind) {
    case 'profile':
      return <ProfileSheet />;
    case 'goals':
      return <GoalsSheet />;
    case 'check-item':
      return <CheckItemSheet id={p.id as string | undefined} />;
    case 'checkup':
      return <CheckupSheet id={p.id as string | undefined} />;
    case 'checkup-view':
      return <CheckupView id={p.id as string} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------- profile

function ProfileSheet() {
  const [p, setP] = useState<Profile>(() => ({ ...profile.value, conditions: profile.value.conditions.map((c) => ({ ...c })) }));
  const unit = p.weightUnit;
  const [goalW, setGoalW] = useState(p.goalWeightKg ? String(round1(kgTo(unit, p.goalWeightKg))) : '');
  const [draft, setDraft] = useState('');
  const set = (patch: Partial<Profile>) => setP((x) => ({ ...x, ...patch }));
  const setCond = (id: string, patch: Partial<Condition>) => set({ conditions: p.conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)) });

  async function save() {
    const gw = Number(goalW);
    await setDocument('profile/main', {
      ...p,
      goalWeightKg: goalW && Number.isFinite(gw) && gw > 0 ? round1(toKg(unit, gw)) : undefined,
      conditions: p.conditions.filter((c) => c.name.trim()),
      onboarded: true,
      updatedAt: Date.now(),
    } as unknown as Record<string, unknown>);
    closeSheet();
    notify('资料已保存', 'success');
  }

  const numInput = (label: string, value: number | undefined, onChange: (v: number | undefined) => void, placeholder?: string) => (
    <input
      class="input"
      inputMode="numeric"
      aria-label={label}
      placeholder={placeholder}
      value={value ?? ''}
      onInput={(e) => {
        const raw = (e.target as HTMLInputElement).value;
        const n = Number(raw);
        onChange(raw === '' || !Number.isFinite(n) ? undefined : n);
      }}
    />
  );

  return (
    <Sheet
      title="个人资料"
      onClose={closeSheet}
      footer={
        <button type="button" class="btn primary" onClick={save}>
          <Icon name="check" />
          保存
        </button>
      }
    >
      <div class="row wrap" style={{ gap: '12px', alignItems: 'flex-start' }}>
        <Field label="出生年份">{numInput('出生年份', p.birthYear, (v) => set({ birthYear: v }), '1990')}</Field>
        <Field label="身高（cm）">{numInput('身高', p.heightCm, (v) => set({ heightCm: v }), '170')}</Field>
      </div>
      <Field label="性别">
        <Segmented
          label="性别"
          options={[
            { value: 'male', label: '男' },
            { value: 'female', label: '女' },
            { value: 'other', label: '不填' },
          ]}
          value={p.sex}
          onChange={(v) => set({ sex: v })}
        />
      </Field>
      <Field label={`目标体重（${unitLabel(unit)}）`}>
        <input class="input" inputMode="decimal" value={goalW} onInput={(e) => setGoalW((e.target as HTMLInputElement).value)} aria-label="目标体重" />
      </Field>
      <Field label="开始练习的日期" hint="用来计算 ERP 练习到第几周">
        <input class="input" type="date" value={p.programStart ?? ''} onInput={(e) => set({ programStart: (e.target as HTMLInputElement).value || undefined })} aria-label="开始练习的日期" />
      </Field>
      <div class="stack">
        <p class="small" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>
          身体状况
        </p>
        {p.conditions.map((c) => (
          <div key={c.id} class="stack tight" style={{ paddingBottom: '8px', borderBottom: '1px solid var(--line)' }}>
            <div class="row">
              <input class="input grow" value={c.name} aria-label="状况" onInput={(e) => setCond(c.id, { name: (e.target as HTMLInputElement).value })} />
              <button type="button" class="icon-btn" aria-label="删除" onClick={() => set({ conditions: p.conditions.filter((x) => x.id !== c.id) })}>
                <Icon name="trash" />
              </button>
            </div>
            <input class="input" value={c.note ?? ''} placeholder="备注（可不填）" aria-label="备注" onInput={(e) => setCond(c.id, { note: (e.target as HTMLInputElement).value || undefined })} />
            <Segmented
              label="状态"
              options={[
                { value: 'active', label: '在处理' },
                { value: 'watch', label: '观察' },
                { value: 'resolved', label: '已好转' },
              ]}
              value={c.status}
              onChange={(v) => setCond(c.id, { status: v })}
            />
          </div>
        ))}
        <form
          class="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            set({ conditions: [...p.conditions, { id: newId('c'), name: draft.trim(), status: 'active' }] });
            setDraft('');
          }}
        >
          <input class="input" placeholder="加一项，例如：过敏性鼻炎" value={draft} onInput={(e) => setDraft((e.target as HTMLInputElement).value)} aria-label="新状况" />
          <button type="submit" class="btn" disabled={!draft.trim()}>
            添加
          </button>
        </form>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- goals

const METRICS: { value: GoalMetric; label: string; unit: string; lowerIsBetter?: boolean }[] = [
  { value: 'weightKg', label: '体重', unit: 'kg' },
  { value: 'sleepHours', label: '每晚睡眠（14 天平均）', unit: '小时' },
  { value: 'refitsPerNight', label: '每晚起来重铺（14 天平均）', unit: '次', lowerIsBetter: true },
  { value: 'gutDaysPerWeek', label: '胃部不适 ≥4 分的天数（7 天）', unit: '天', lowerIsBetter: true },
  { value: 'exercisePerWeek', label: '每周力量训练', unit: '次' },
  { value: 'meditationMin', label: '每天冥想（7 天平均）', unit: '分钟' },
  { value: 'focusBlocks', label: '每天专注段数（7 天平均）', unit: '段' },
  { value: 'custom', label: '其他（手动）', unit: '' },
];

function GoalsSheet() {
  const unit = profile.value.weightUnit;
  const [list, setList] = useState<Goal[]>(() => goals.value.map((g) => ({ ...g })));
  const upd = (id: string, patch: Partial<Goal>) => setList((l) => l.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const shown = (g: Goal, v: number | undefined) => (v === undefined ? '' : g.metric === 'weightKg' ? String(round1(kgTo(unit, v))) : String(v));
  const parse = (g: Goal, raw: string) => {
    const n = Number(raw);
    if (raw === '' || !Number.isFinite(n)) return undefined;
    return g.metric === 'weightKg' ? round1(toKg(unit, n)) : n;
  };

  async function save() {
    await setDocument('goals/main', { items: list.filter((g) => g.title.trim()) });
    closeSheet();
    notify('目标已保存', 'success');
  }

  return (
    <Sheet
      title="长期目标"
      onClose={closeSheet}
      footer={
        <button type="button" class="btn primary" onClick={save}>
          <Icon name="check" />
          保存
        </button>
      }
    >
      <p class="small soft">目标值会和记录自动比对。起点填你刚开始时的样子，进度条从起点走向目标。</p>
      {list.map((g) => (
        <div key={g.id} class="stack tight" style={{ paddingBottom: '12px', borderBottom: '1px solid var(--line)' }}>
          <div class="row">
            <input class="input grow" value={g.title} aria-label="目标名称" onInput={(e) => upd(g.id, { title: (e.target as HTMLInputElement).value })} />
            <button type="button" class="icon-btn" aria-label="删除" onClick={() => setList((l) => l.filter((x) => x.id !== g.id))}>
              <Icon name="trash" />
            </button>
          </div>
          <select
            class="select"
            aria-label="跟踪的指标"
            value={g.metric}
            onChange={(e) => {
              const m = METRICS.find((x) => x.value === (e.target as HTMLSelectElement).value)!;
              upd(g.id, { metric: m.value, unit: m.unit, lowerIsBetter: m.lowerIsBetter });
            }}
          >
            {METRICS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <div class="row">
            <input class="input" inputMode="decimal" placeholder="起点" aria-label="起点" value={shown(g, g.baseline)} onInput={(e) => upd(g.id, { baseline: parse(g, (e.target as HTMLInputElement).value) })} />
            <Icon name="arrow-r" />
            <input class="input" inputMode="decimal" placeholder="目标" aria-label="目标" value={shown(g, g.target)} onInput={(e) => upd(g.id, { target: parse(g, (e.target as HTMLInputElement).value) ?? 0 })} />
            <span class="small muted" style={{ minWidth: '36px' }}>
              {g.metric === 'weightKg' ? unitLabel(unit) : g.unit}
            </span>
          </div>
          <Segmented
            label="状态"
            options={[
              { value: 'active', label: '进行中' },
              { value: 'done', label: '达成' },
              { value: 'paused', label: '暂停' },
            ]}
            value={g.status}
            onChange={(v) => upd(g.id, { status: v })}
          />
        </div>
      ))}
      <button type="button" class="btn" style={{ justifySelf: 'start' }} onClick={() => setList((l) => [...l, { id: newId('goal'), title: '新目标', metric: 'sleepHours', unit: '小时', target: 7, status: 'active' }])}>
        <Icon name="plus" />
        加一个目标
      </button>
    </Sheet>
  );
}

// ---------------------------------------------------------------- check plan item

function CheckItemSheet({ id }: { id?: string }) {
  const existing = checkplan.value.find((x) => x.id === id);
  const [item, setItem] = useState<CheckItem>(
    () => existing ?? { id: newId('c'), title: '', dept: '', why: '', priority: 'medium', status: 'todo', items: [] },
  );
  const [lines, setLines] = useState((existing?.items ?? []).join('\n'));
  const set = (p: Partial<CheckItem>) => setItem((x) => ({ ...x, ...p }));

  async function save() {
    const next: CheckItem = { ...item, items: lines.split('\n').map((x) => x.trim()).filter(Boolean) };
    const list = existing ? checkplan.value.map((x) => (x.id === item.id ? next : x)) : [...checkplan.value, next];
    await setDocument('health/checkplan', { items: list });
    closeSheet();
  }

  async function remove() {
    await setDocument('health/checkplan', { items: checkplan.value.filter((x) => x.id !== item.id) });
    closeSheet();
  }

  return (
    <Sheet
      title={existing ? '编辑检查项目' : '加一个检查项目'}
      onClose={closeSheet}
      footer={
        <>
          {existing ? (
            <button type="button" class="btn danger" onClick={remove}>
              删除
            </button>
          ) : null}
          <button type="button" class="btn primary" disabled={!item.title.trim()} onClick={save}>
            <Icon name="check" />
            保存
          </button>
        </>
      }
    >
      <Field label="项目">
        <input class="input" value={item.title} onInput={(e) => set({ title: (e.target as HTMLInputElement).value })} aria-label="项目" />
      </Field>
      <Field label="科别">
        <input class="input" value={item.dept} onInput={(e) => set({ dept: (e.target as HTMLInputElement).value })} aria-label="科别" placeholder="例如：家医科" />
      </Field>
      <Field label="为什么要做">
        <TextArea label="原因" rows={2} value={item.why} onInput={(v) => set({ why: v })} />
      </Field>
      <Field label="要查的内容（一行一项）">
        <TextArea label="检查内容" rows={4} value={lines} onInput={setLines} />
      </Field>
      <Field label="优先级">
        <Segmented
          label="优先级"
          options={[
            { value: 'high', label: '优先' },
            { value: 'medium', label: '尽快' },
            { value: 'low', label: '有空' },
          ]}
          value={item.priority}
          onChange={(v) => set({ priority: v })}
        />
      </Field>
      <Field label="预约或完成的日期">
        <input class="input" type="date" value={item.date ?? ''} onInput={(e) => set({ date: (e.target as HTMLInputElement).value || undefined })} aria-label="日期" />
      </Field>
      <Field label="备注">
        <TextArea label="备注" rows={2} value={item.note} onInput={(v) => set({ note: v || undefined })} placeholder="例如：XX 医院家医科，周三上午诊" />
      </Field>
    </Sheet>
  );
}

// ---------------------------------------------------------------- checkup records

function flagFor(r: LabResult): LabResult['flag'] {
  const v = typeof r.value === 'number' ? r.value : Number(r.value);
  if (!Number.isFinite(v)) return r.flag ?? '';
  if (r.low !== undefined && v < r.low) return 'L';
  if (r.high !== undefined && v > r.high) return 'H';
  if (r.low !== undefined || r.high !== undefined) return 'N';
  return r.flag ?? '';
}

function CheckupSheet({ id }: { id?: string }) {
  const existing = checkups.value.find((x) => x.id === id);
  const [rec, setRec] = useState<CheckupRecord>(
    () => existing ?? { id: newId('ck'), date: today.value, title: '', results: [], files: [], createdAt: Date.now() },
  );
  const [blobs, setBlobs] = useState<{ assetId: string; file: File }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [reading, setReading] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const set = (p: Partial<CheckupRecord>) => setRec((x) => ({ ...x, ...p }));
  const setRow = (i: number, p: Partial<LabResult>) => set({ results: rec.results.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  const canUpload = !!assets.value;
  const canRead = aiReady() && !!aiLimits.value?.images;

  async function onFiles(e: Event) {
    const files = Array.from((e.target as HTMLInputElement).files ?? []);
    (e.target as HTMLInputElement).value = '';
    if (!files.length || !assets.value) return;
    setUploading(true);
    setErr('');
    try {
      const added: CheckupFile[] = [];
      const kept: { assetId: string; file: File }[] = [];
      for (const f of files) {
        const res = await assets.value.upload(f);
        added.push({ assetId: res.id, name: f.name, type: res.contentType });
        if (f.type.startsWith('image/')) kept.push({ assetId: res.id, file: f });
      }
      set({ files: [...rec.files, ...added] });
      setBlobs((b) => [...b, ...kept]);
    } catch (e2) {
      const code = (e2 as { code?: string })?.code;
      setErr(code === 'too_large' ? '文件太大了（上限 20 MB）。' : code === 'unsupported_type' ? '只支持图片和 PDF。' : '上传失败，再试一次。');
    } finally {
      setUploading(false);
    }
  }

  async function readWithAi() {
    const images = blobs.map((b) => b.file).filter((f) => aiLimits.value?.images?.mediaTypes.includes(f.type));
    if (!images.length) {
      setErr('请先上传报告的照片或截图（PDF 需要先截图）。');
      return;
    }
    setReading(true);
    setErr('');
    try {
      const max = aiLimits.value?.images?.maxCount ?? 5;
      const r = await askJson<{ date?: string; place?: string; title?: string; results?: unknown[]; notes?: string }>(reportPrompt(), {
        images: images.slice(0, max),
        cache: false,
      });
      const rows: LabResult[] = (Array.isArray(r?.results) ? r.results : [])
        .map((x) => x as Record<string, unknown>)
        .filter((x) => x && typeof x.name === 'string')
        .map((x) => {
          const num = typeof x.value === 'number' ? x.value : Number(x.value);
          const row: LabResult = {
            name: String(x.name),
            value: Number.isFinite(num) && String(x.value).trim() !== '' ? num : String(x.value ?? ''),
            unit: x.unit ? String(x.unit) : undefined,
            low: typeof x.low === 'number' ? x.low : undefined,
            high: typeof x.high === 'number' ? x.high : undefined,
            flag: x.flag === 'H' || x.flag === 'L' || x.flag === 'N' ? x.flag : '',
          };
          return { ...row, flag: flagFor(row) };
        });
      set({
        results: [...rec.results, ...rows],
        date: rec.date === today.value && typeof r?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : rec.date,
        place: rec.place || (r?.place ? String(r.place) : undefined),
        title: rec.title || (r?.title ? String(r.title) : ''),
      });
      if (r?.notes) setNote(String(r.notes));
      if (!rows.length) setErr('没有识别出数值。照片清楚一点、拍正一点再试。');
    } catch (e2) {
      if (!isCancel(e2)) setErr(aiMessage(e2));
    } finally {
      setReading(false);
    }
  }

  async function save() {
    const clean = { ...rec, title: rec.title.trim() || '检查记录', results: rec.results.filter((r) => r.name.trim()).map((r) => ({ ...r, flag: flagFor(r) })) };
    await setDocument(`checkups/${clean.id}`, clean as unknown as Record<string, unknown>);
    closeSheet();
    notify('检查记录已保存', 'success');
  }

  return (
    <Sheet
      title={existing ? '编辑检查记录' : '添加检查记录'}
      onClose={closeSheet}
      footer={
        <button type="button" class="btn primary" onClick={save}>
          <Icon name="check" />
          保存
        </button>
      }
    >
      <div class="row wrap" style={{ gap: '12px', alignItems: 'flex-start' }}>
        <Field label="日期">
          <input class="input" type="date" value={rec.date} onInput={(e) => set({ date: (e.target as HTMLInputElement).value })} aria-label="日期" />
        </Field>
        <Field label="名称">
          <input class="input" value={rec.title} placeholder="例如：抽血检查" onInput={(e) => set({ title: (e.target as HTMLInputElement).value })} aria-label="名称" />
        </Field>
      </div>
      <div class="row wrap" style={{ gap: '12px', alignItems: 'flex-start' }}>
        <Field label="医院 / 诊所">
          <input class="input" value={rec.place ?? ''} onInput={(e) => set({ place: (e.target as HTMLInputElement).value || undefined })} aria-label="医院" />
        </Field>
        <Field label="科别">
          <input class="input" value={rec.dept ?? ''} onInput={(e) => set({ dept: (e.target as HTMLInputElement).value || undefined })} aria-label="科别" />
        </Field>
      </div>
      <div class="stack">
        <p class="small" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>
          报告照片
        </p>
        {rec.files.length ? (
          <div class="thumbs">
            {rec.files.map((f) =>
              f.type.startsWith('image/') ? (
                <span key={f.assetId}>
                  <img src={`/_blob/${f.assetId}`} alt={f.name} />
                </span>
              ) : (
                <span key={f.assetId}>
                  <Icon name="file" />
                  PDF
                </span>
              ),
            )}
          </div>
        ) : null}
        {canUpload ? (
          <div class="btn-row">
            <label class="btn">
              {uploading ? <span class="spinner" /> : <Icon name="image" />}
              上传照片或 PDF
              <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" multiple hidden onChange={onFiles} />
            </label>
            {canRead ? (
              <button type="button" class="btn primary" disabled={reading || !blobs.length} onClick={readWithAi}>
                {reading ? <span class="spinner" /> : <Icon name="sparkle" />}
                用 AI 识别数值
              </button>
            ) : null}
          </div>
        ) : (
          <p class="xs muted">在 claude.ai 里打开时可以上传照片。现在也可以在下面手动填。</p>
        )}
        {reading ? <Thinking label="正在读报告，可能要一分钟" /> : null}
        {note ? <Callout>{note}</Callout> : null}
        {err ? <p class="small" style={{ color: 'var(--critical)' }}>{err}</p> : null}
      </div>
      <div class="stack tight">
        <p class="small" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>
          检查数值 {rec.results.length ? `（${rec.results.length} 项，识别结果请核对一遍）` : ''}
        </p>
        {rec.results.map((r, i) => (
          <div key={i} class="stack tight" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <div class="row">
              <input class="input grow" value={r.name} placeholder="项目" aria-label="项目" onInput={(e) => setRow(i, { name: (e.target as HTMLInputElement).value })} />
              <button type="button" class="icon-btn" aria-label="删除这一项" onClick={() => set({ results: rec.results.filter((_, j) => j !== i) })}>
                <Icon name="trash" />
              </button>
            </div>
            <div class="row">
              <input
                class="input"
                value={String(r.value ?? '')}
                placeholder="数值"
                aria-label="数值"
                onInput={(e) => {
                  const raw = (e.target as HTMLInputElement).value;
                  const n = Number(raw);
                  setRow(i, { value: raw.trim() !== '' && Number.isFinite(n) ? n : raw });
                }}
              />
              <input class="input" value={r.unit ?? ''} placeholder="单位" aria-label="单位" onInput={(e) => setRow(i, { unit: (e.target as HTMLInputElement).value || undefined })} />
            </div>
            <div class="row">
              <input class="input" inputMode="decimal" value={r.low ?? ''} placeholder="参考下限" aria-label="参考下限" onInput={(e) => setRow(i, { low: numOrUndef((e.target as HTMLInputElement).value) })} />
              <input class="input" inputMode="decimal" value={r.high ?? ''} placeholder="参考上限" aria-label="参考上限" onInput={(e) => setRow(i, { high: numOrUndef((e.target as HTMLInputElement).value) })} />
            </div>
          </div>
        ))}
        <button type="button" class="btn sm" style={{ justifySelf: 'start' }} onClick={() => set({ results: [...rec.results, { name: '', value: '' }] })}>
          <Icon name="plus" />
          加一项
        </button>
      </div>
    </Sheet>
  );
}

function numOrUndef(raw: string): number | undefined {
  const n = Number(raw);
  return raw.trim() === '' || !Number.isFinite(n) ? undefined : n;
}

function CheckupView({ id }: { id: string }) {
  const rec = checkups.value.find((x) => x.id === id);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  if (!rec) return null;

  async function explain() {
    if (!rec) return;
    setBusy(true);
    setErr('');
    setText('');
    try {
      const r = await askText(explainLabsPrompt(currentContext(), rec), { cache: false, onText: ({ text: t }) => setText(t) });
      await mergeDocument(`checkups/${rec.id}`, { summary: r?.text ?? '', summaryFor: JSON.stringify(rec.results) });
    } catch (e) {
      if (!isCancel(e)) setErr(aiMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const summary = text || rec.summary;
  // a second reading of unchanged results adds nothing; offer it only after an edit
  const outdated = !!rec.summary && rec.summaryFor !== undefined && rec.summaryFor !== JSON.stringify(rec.results);

  return (
    <Sheet
      title={rec.title}
      onClose={closeSheet}
      footer={
        <>
          {confirmDel ? (
            <button
              type="button"
              class="btn danger"
              onClick={async () => {
                await deleteDocument(`checkups/${rec.id}`);
                closeSheet();
              }}
            >
              确认删除
            </button>
          ) : (
            <button type="button" class="btn ghost" onClick={() => setConfirmDel(true)}>
              删除
            </button>
          )}
          <button type="button" class="btn" onClick={() => openSheet('checkup', { id: rec.id })}>
            <Icon name="edit" />
            编辑
          </button>
        </>
      }
    >
      <p class="small soft">
        {formatDate(rec.date, { year: true })}
        {rec.place ? ` · ${rec.place}` : ''}
        {rec.dept ? ` · ${rec.dept}` : ''}
      </p>
      {rec.files.length ? (
        <div class="thumbs">
          {rec.files.map((f) =>
            f.type.startsWith('image/') ? (
              <span key={f.assetId}>
                <img src={`/_blob/${f.assetId}`} alt={f.name} />
              </span>
            ) : (
              <span key={f.assetId}>
                <Icon name="file" />
                PDF
              </span>
            ),
          )}
        </div>
      ) : null}
      {rec.results.length ? (
        <div class="table-wrap">
          <table class="data-table lab-table">
            <thead>
              <tr>
                <th>项目</th>
                <th>结果</th>
                <th>参考范围</th>
              </tr>
            </thead>
            <tbody>
              {rec.results.map((r, i) => (
                <tr key={i}>
                  <td>{r.name}</td>
                  <td class={`flag-${r.flag ?? ''}`}>
                    {String(r.value)} {r.unit ?? ''} {r.flag === 'H' ? '↑' : r.flag === 'L' ? '↓' : ''}
                  </td>
                  <td>{r.low !== undefined || r.high !== undefined ? `${r.low ?? ''}–${r.high ?? ''}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p class="small muted">还没有填数值。</p>
      )}
      {aiReady() && rec.results.length ? (
        <div class="stack">
          {!summary || outdated ? (
            <button type="button" class="btn" style={{ justifySelf: 'start' }} disabled={busy} onClick={explain}>
              {busy ? <span class="spinner" /> : <Icon name="sparkle" />}
              {outdated ? '数值改过了，重新解读' : '用 AI 解读这份结果'}
            </button>
          ) : null}
          {busy && !text ? <Thinking label="正在看结果" /> : null}
          {summary ? (
            <div class="card flat small" style={{ lineHeight: 1.7 }}>
              <Markdown text={summary} />
            </div>
          ) : null}
          {err ? <p class="small" style={{ color: 'var(--critical)' }}>{err}</p> : null}
        </div>
      ) : null}
    </Sheet>
  );
}
