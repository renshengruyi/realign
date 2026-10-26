import { useRef, useState } from 'preact/hooks';
import { addDays, ageFrom, formatDate, shortDate } from '../../domain/dates';
import { careSignals, goalCurrent, goalProgress, latestWeight, nightRefits, sleepHours } from '../../domain/metrics';
import type { CheckItem } from '../../domain/types';
import { bmi, bmiBand, kgTo, round1, unitLabel } from '../../domain/units';
import {
  allDays,
  checkplan,
  checkups,
  goals,
  mergeDocument,
  mode,
  notify,
  profile,
  settings,
  targets,
  today,
} from '../../platform/store';
import { Callout, Empty, Segmented, Switch } from '../components/controls';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';
import { exportBackup, parseBackup, restoreBackup, type Backup } from '../data';
import { openSheet } from '../nav';

const STATUS: { value: CheckItem['status']; label: string }[] = [
  { value: 'todo', label: '未安排' },
  { value: 'booked', label: '已预约' },
  { value: 'done', label: '已完成' },
  { value: 'skipped', label: '暂不做' },
];

const PRIORITY = { high: '优先', medium: '尽快', low: '有空' } as const;

export function RecordScreen() {
  return (
    <div class="page wide">
      <TopBar title="档案" />
      <div class="trend-grid">
        <ProfileCard />
        <GoalsCard />
        <CheckPlanCard />
        <CheckupsCard />
        <TuinaCard />
        <SettingsCard />
      </div>
    </div>
  );
}

function ProfileCard() {
  const p = profile.value;
  const unit = p.weightUnit;
  const w = latestWeight(allDays.value);
  const b = bmi(w?.kg, p.heightCm);
  const band = b ? bmiBand(b) : undefined;
  const age = ageFrom(p.birthYear);
  const pos = b ? Math.min(100, Math.max(0, ((b - 14) / (33 - 14)) * 100)) : undefined;
  return (
    <section class="card stack" aria-label="个人资料">
      <div class="section-head">
        <h2>我</h2>
        <button type="button" class="link" onClick={() => openSheet('profile')}>
          编辑
        </button>
      </div>
      <p class="soft">
        {[age ? `${age} 岁` : '', p.sex === 'male' ? '男' : p.sex === 'female' ? '女' : '', p.heightCm ? `${p.heightCm} cm` : '', w ? `${round1(kgTo(unit, w.kg))} ${unitLabel(unit)}（${shortDate(w.date)}）` : ''].filter(Boolean).join(' · ') ||
          '还没填基本资料'}
      </p>
      {b && band && pos !== undefined ? (
        <div class="stack tight">
          <div class="row between small">
            <span>
              BMI <b class="num">{round1(b)}</b>
            </span>
            <span class={`pill ${band.tone === 'ok' ? 'good' : band.tone === 'low' ? 'primary' : 'warn'}`}>{band.label}</span>
          </div>
          <div class="bmi-wrap">
            <div class="bmi-bar" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
            <span class="bmi-marker" style={{ left: `${pos}%` }} />
          </div>
          <div class="row between xs muted num">
            <span>14</span>
            <span>18.5</span>
            <span>24</span>
            <span>27</span>
            <span>33</span>
          </div>
          {p.goalWeightKg ? (
            <p class="xs muted">
              目标 {round1(kgTo(unit, p.goalWeightKg))} {unitLabel(unit)}
              {w ? `，还差 ${round1(kgTo(unit, p.goalWeightKg - w.kg))} ${unitLabel(unit)}` : ''}
            </p>
          ) : null}
        </div>
      ) : null}
      {p.conditions.length ? (
        <ul class="list">
          {p.conditions.map((c) => (
            <li key={c.id} class="list-row">
              <span class={`dot`} style={{ color: c.status === 'active' ? 'var(--warning-mark)' : c.status === 'watch' ? 'var(--ink-3)' : 'var(--good)' }} />
              <span class="grow">
                <span>{c.name}</span>
                {c.note ? <span class="xs muted" style={{ display: 'block' }}>{c.note}</span> : null}
              </span>
              <span class="xs muted">{c.status === 'active' ? '在处理' : c.status === 'watch' ? '观察' : '已好转'}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function GoalsCard() {
  const list = goals.value.filter((g) => g.status !== 'paused');
  const all = allDays.value;
  const unit = profile.value.weightUnit;
  return (
    <section class="card stack" aria-label="长期目标">
      <div class="section-head">
        <h2>长期目标</h2>
        <button type="button" class="link" onClick={() => openSheet('goals')}>
          编辑
        </button>
      </div>
      {list.length ? (
        <ul class="list">
          {list.map((g) => {
            const cur = goalCurrent(g, all, today.value, targets.value);
            const prog = goalProgress(g, cur);
            const show = (v: number | undefined) =>
              v === undefined ? '—' : g.metric === 'weightKg' ? `${round1(kgTo(unit, v))}` : `${round1(v)}`;
            const u = g.metric === 'weightKg' ? unitLabel(unit) : g.unit;
            return (
              <li key={g.id} class="stack tight" style={{ padding: '10px 0' }}>
                <div class="row between">
                  <span style={{ fontWeight: 600 }}>{g.title}</span>
                  <span class="small soft num">
                    {show(g.baseline)} → <b>{show(cur)}</b> → {show(g.target)} {u}
                  </span>
                </div>
                <div class="progress">
                  <i style={{ width: `${(prog ?? 0) * 100}%`, background: g.status === 'done' ? 'var(--good)' : 'var(--primary)' }} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty icon="target" title="还没有长期目标">
          比如：体重回到 60 公斤、每晚睡满 7 小时、不再下床重铺。
        </Empty>
      )}
    </section>
  );
}

function CheckPlanCard() {
  const items = checkplan.value;
  const signals = careSignals(allDays.value, today.value, profile.value.heightCm, profile.value.programStart);
  const setStatus = (id: string, status: CheckItem['status']) =>
    void mergeDocument('health/checkplan', { items: items.map((x) => (x.id === id ? { ...x, status } : x)) });
  const order = { high: 0, medium: 1, low: 2 };
  const sorted = [...items].sort((a, b) => Number(a.status === 'done' || a.status === 'skipped') - Number(b.status === 'done' || b.status === 'skipped') || order[a.priority] - order[b.priority]);
  return (
    <section class="card stack span-2" aria-label="体检计划">
      <div class="section-head">
        <h2>体检计划</h2>
        <span class="small muted">
          已完成 {items.filter((x) => x.status === 'done').length}/{items.filter((x) => x.status !== 'skipped').length}
        </span>
      </div>
      {signals.length ? (
        <Callout tone="warn">
          <p style={{ fontWeight: 700 }}>记录里有值得和医生说的情况</p>
          <ul class="stack tight" style={{ paddingLeft: '16px', marginTop: '4px' }}>
            {signals.map((s) => (
              <li key={s.id}>
                {s.text}
                {s.dept ? <span class="muted">（{s.dept}）</span> : null}
              </li>
            ))}
          </ul>
        </Callout>
      ) : null}
      <p class="small soft">
        在台湾，一般先挂家医科说明整体情况，抽血和尿检通常可以当天做；需要时医生会转胃肠科、泌尿科或复健科。看诊时打开这一页，照着清单说就好。
      </p>
      <div>
        {sorted.map((item) => (
          <div class="check-item" key={item.id}>
            <div class="row between wrap">
              <span class="row">
                <b>{item.title}</b>
                <span class="pill">{item.dept}</span>
                <span class={`pill ${item.priority === 'high' ? 'bad' : item.priority === 'medium' ? 'warn' : ''}`}>{PRIORITY[item.priority]}</span>
              </span>
              <button type="button" class="icon-btn" aria-label={`编辑${item.title}`} onClick={() => openSheet('check-item', { id: item.id })}>
                <Icon name="edit" />
              </button>
            </div>
            <p class="small soft">{item.why}</p>
            {item.items?.length ? (
              <ul>
                {item.items.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            ) : null}
            <Segmented quiet label={`${item.title}的状态`} options={STATUS} value={item.status} onChange={(v) => setStatus(item.id, v)} />
            {item.date || item.note ? (
              <p class="xs muted">
                {item.date ? `${item.status === 'done' ? '完成于' : '预约在'} ${formatDate(item.date)}` : ''}
                {item.note ? ` · ${item.note}` : ''}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function CheckupsCard() {
  const list = checkups.value;
  return (
    <section class="card stack" aria-label="检查记录">
      <div class="section-head">
        <h2>检查记录</h2>
        <button type="button" class="link" onClick={() => openSheet('checkup')}>
          添加
        </button>
      </div>
      {list.length ? (
        <ul class="list">
          {list.map((r) => {
            const flagged = r.results.filter((x) => x.flag === 'H' || x.flag === 'L').length;
            return (
              <li key={r.id}>
                <button type="button" class="list-row" style={{ width: '100%', border: 0, background: 'none', textAlign: 'left', color: 'inherit' }} onClick={() => openSheet('checkup-view', { id: r.id })}>
                  <Icon name="file" />
                  <span class="grow">
                    <span style={{ fontWeight: 600 }}>{r.title}</span>
                    <span class="xs muted" style={{ display: 'block' }}>
                      {formatDate(r.date, { year: true })}
                      {r.place ? ` · ${r.place}` : ''} · {r.results.length} 项
                    </span>
                  </span>
                  {flagged ? <span class="pill bad">{flagged} 项异常</span> : r.results.length ? <span class="pill good">无异常标记</span> : null}
                  <Icon name="chev-r" size={18} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty icon="steth" title="还没有检查记录">
          做完体检后，拍下报告上传，AI 可以帮你把数值整理出来。
        </Empty>
      )}
    </section>
  );
}

function TuinaCard() {
  const all = allDays.value;
  const sessions = Object.keys(all)
    .filter((d) => all[d].tuina?.done)
    .sort()
    .reverse()
    .slice(0, 6);
  return (
    <section class="card stack" aria-label="推拿记录">
      <div class="section-head">
        <h2>推拿记录</h2>
        <button type="button" class="link" onClick={() => openSheet('tuina')}>
          记录今天
        </button>
      </div>
      {sessions.length ? (
        <ul class="list">
          {sessions.map((d) => {
            const tu = all[d].tuina!;
            const next = all[addDays(d, 1)];
            const h = sleepHours(next?.sleep);
            const r = nightRefits(next);
            return (
              <li key={d} class="stack tight" style={{ padding: '10px 0' }}>
                <div class="row between">
                  <b>{formatDate(d, { weekday: true })}</b>
                  {tu.feeling ? <span class="small soft">推完感觉 {tu.feeling}/5</span> : null}
                </div>
                <span class="small soft">{(tu.areas ?? []).join('、') || '—'}</span>
                <span class="xs muted">
                  当晚：{h !== undefined ? `睡了约 ${round1(h)} 小时` : '没有睡眠记录'}
                  {r !== undefined ? `，起来 ${r} 次` : ''}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty icon="hand" title="还没有推拿记录">
          每次推拿后记一下部位和感觉，看看推拿的晚上睡得怎样。
        </Empty>
      )}
    </section>
  );
}

function SettingsCard() {
  const s = settings.value;
  const p = profile.value;
  const [json, setJson] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Backup | null>(null);
  const [progress, setProgress] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Record<string, unknown>) => void mergeDocument('settings/main', patch);

  async function doExport() {
    setBusy(true);
    try {
      setJson(await exportBackup());
    } catch {
      notify('导出失败，再试一次。', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      setPending(parseBackup(await f.text()));
    } catch (err) {
      notify(err instanceof Error ? err.message : '读不了这个文件', 'error');
    }
    (e.target as HTMLInputElement).value = '';
  }

  async function doRestore() {
    if (!pending) return;
    setBusy(true);
    try {
      await restoreBackup(pending, (d, t) => setProgress(`${d}/${t}`));
      notify('恢复完成', 'success');
      setPending(null);
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  return (
    <section class="card stack span-2" aria-label="设置">
      <div class="section-head">
        <h2>设置与数据</h2>
      </div>
      <div class="settings-list">
        <Switch checked={s.reminders} onChange={(v) => set({ reminders: v })} label="页面打开时，到点提醒" sub="按「今日节奏」提醒，页面关闭时不会提醒" />
        <Switch checked={s.sound} onChange={(v) => set({ sound: v })} label="提示音" sub="计时结束、到点提醒时的轻柔铃声" />
        <Switch checked={s.duskFilter} onChange={(v) => set({ duskFilter: v })} label="睡前暖光" sub="上床前一小时起，屏幕变暖、变暗一点" />
      </div>
      <div class="row wrap" style={{ gap: '20px' }}>
        <div class="stack tight">
          <span class="small soft">体重单位</span>
          <Segmented
            label="体重单位"
            options={[
              { value: 'jin', label: '斤（500 克）' },
              { value: 'kg', label: '公斤' },
            ]}
            value={p.weightUnit}
            onChange={(v) => void mergeDocument('profile/main', { weightUnit: v })}
          />
        </div>
        <div class="stack tight">
          <span class="small soft">每周称重日</span>
          <Segmented
            label="称重日"
            options={[1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: d, label: '日一二三四五六'[d] }))}
            value={s.weighDay}
            onChange={(v) => set({ weighDay: v })}
          />
        </div>
      </div>
      <hr class="divider" />
      <div class="stack tight">
        <p class="small soft">
          {mode.value === 'cloud'
            ? '数据存在这个页面自己的私有数据库里，只有你能读写；分享链接给别人，他们也看不到你的记录。'
            : '现在是本机模式：数据只存在这个浏览器里。在 claude.ai 里打开这个页面，数据才会保存到你的账号。'}
        </p>
        <div class="btn-row">
          <button type="button" class="btn" disabled={busy} onClick={doExport}>
            <Icon name="download" />
            导出全部数据
          </button>
          <button type="button" class="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" />
            从备份恢复
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
        </div>
        {pending ? (
          <Callout tone="warn">
            <p>
              备份来自 {pending.exportedAt.slice(0, 10)}，共 {Object.keys(pending.docs).length} 条记录。恢复会覆盖同一天、同一条的现有记录，其他记录不动。
            </p>
            <div class="btn-row" style={{ marginTop: '8px' }}>
              <button type="button" class="btn primary sm" disabled={busy} onClick={doRestore}>
                {busy ? `恢复中 ${progress}` : '恢复'}
              </button>
              <button type="button" class="btn sm ghost" disabled={busy} onClick={() => setPending(null)}>
                取消
              </button>
            </div>
          </Callout>
        ) : null}
        {json ? (
          <div class="stack tight">
            <p class="small soft">这里不能直接下载，复制下面的内容存成 .json 文件即可：</p>
            <textarea class="textarea" rows={6} readOnly value={json} aria-label="备份内容" onFocus={(e) => (e.target as HTMLTextAreaElement).select()} />
            <button
              type="button"
              class="btn sm"
              style={{ justifySelf: 'start' }}
              onClick={() =>
                navigator.clipboard?.writeText(json).then(
                  () => notify('已复制', 'success'),
                  () => notify('复制不了，请手动全选复制', 'error'),
                )
              }
            >
              <Icon name="file" />
              复制
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
