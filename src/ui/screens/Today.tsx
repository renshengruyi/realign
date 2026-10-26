import { useState } from 'preact/hooks';
import { describePatch, quickLogPrompt, sanitizePatch } from '../../domain/ai';
import { addDays, formatDate, greeting, hmToMin, minToHM, nowHM, nowMin, rangeDates, weekStartOf } from '../../domain/dates';
import { RHYTHM_KIND_LABEL } from '../../domain/defaults';
import {
  computeSeals,
  computeWeekStats,
  latestWeight,
  nightRefits,
  rhythmDone,
  rhythmForDate,
  rhythmNow,
  sleepHours,
  type SealState,
} from '../../domain/metrics';
import type { DayDoc, RhythmItem, TodoItem } from '../../domain/types';
import { avg, bmi, kgTo, round1, unitLabel } from '../../domain/units';
import { aiMessage, aiReady, askJson, isCancel } from '../../platform/ai-client';
import { newId } from '../../platform/localdb';
import {
  activePlan,
  allDays,
  clock,
  dayOf,
  days,
  notify,
  patchDay,
  profile,
  rhythm,
  targets,
  today,
  updateDayList,
} from '../../platform/store';
import { actionsFor } from '../actions';
import { applyLogPatch } from '../logs';
import { briefBusy, briefError, generateBrief } from '../brief';
import { Sparkline } from '../components/charts';
import { Callout, Thinking } from '../components/controls';
import { Icon } from '../components/Icon';
import { Seal } from '../components/Seal';
import { TopBar } from '../components/TopBar';
import { askCoach, coachView, go, openSheet, openTool } from '../nav';

export function TodayScreen() {
  const date = today.value;
  const day = days.value[date];
  const t = targets.value;
  const seals = computeSeals(day, t);
  const minute = nowMin(new Date(clock.value));
  const items = rhythmForDate(rhythm.value, date);
  const bedMin = hmToMin(t.bedTime) ?? 23 * 60;
  const night = minute >= bedMin - 30 || minute < 5 * 60;

  return (
    <div class="page wide">
      <TopBar>
        <button type="button" class="icon-btn" aria-label="一句话记录" onClick={() => document.getElementById('quick-log')?.focus()}>
          <Icon name="pen" />
        </button>
      </TopBar>
      <Hero day={day} />
      <div class="today-grid">
        <div class="today-col">
          <SealsCard seals={seals} />
          {night ? <NightCard /> : <NowCard items={items} day={day} minute={minute} />}
          <CheckinCards day={day} minute={minute} />
          <TimelineCard items={items} day={day} minute={minute} />
        </div>
        <div class="today-col">
          <BriefCard day={day} />
          <QuickLog />
          <Top3Card day={day} />
          <StatusTiles />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- hero

function Hero({ day }: { day: DayDoc | undefined }) {
  const plan = activePlan.value;
  const s = day?.sleep;
  const h = sleepHours(s);
  const r = nightRefits(day);
  const bits = [
    h !== undefined ? `睡了约 ${round1(h)} 小时` : '',
    r !== undefined ? `起来重铺 ${r} 次` : '',
    s?.maxDiscomfort !== undefined ? `最高不适 ${s.maxDiscomfort}` : '',
    s?.stuckButSlept ? '卡着也睡着了' : '',
  ].filter(Boolean);
  return (
    <header class="hero">
      <p class="eyebrow">{formatDate(today.value, { weekday: true })}</p>
      <h1 class="hero-title">{greeting(new Date(clock.value))}</h1>
      <div class="row wrap">
        <button type="button" class="pill primary" onClick={() => askCoachPlan()}>
          <Icon name="flag" />
          {plan.title}
        </button>
        {bits.length ? (
          <span class="pill">
            <Icon name="moon" />
            昨晚 {bits.join(' · ')}
          </span>
        ) : null}
      </div>
    </header>
  );
}

function askCoachPlan() {
  coachView.value = 'plan';
  go('coach');
}

// ---------------------------------------------------------------- seals

function SealsCard({ seals }: { seals: SealState[] }) {
  const done = seals.filter((s) => s.done).length;
  return (
    <section class="card" style={{ order: 1 }} aria-label="今日四印">
      <div class="section-head">
        <h2>今日四印</h2>
        <span class="small muted">{done ? `已盖 ${done} 枚` : '做完一项，盖一枚章'}</span>
      </div>
      <div class="seals" style={{ marginTop: '14px' }}>
        {seals.map((s) => (
          <button type="button" class="seal-btn" key={s.key} onClick={() => openSheet('seal', { key: s.key })} aria-label={`${s.char}：${s.parts.map((p) => `${p.label}${p.done ? '，已完成' : ''}`).join('；')}`}>
            <Seal state={s} />
            <span class="seal-label">
              {s.parts.filter((p) => p.done).length}/{s.parts.length}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- now

function NowCard({ items, day, minute }: { items: RhythmItem[]; day: DayDoc | undefined; minute: number }) {
  const { current, next, overdue } = rhythmNow(items, day, minute);
  const item = current ?? next;
  return (
    <section class="card now-card" style={{ order: 2 }} aria-label="此刻">
      <div class="section-head">
        <h2>{current ? '此刻' : '接下来'}</h2>
        {overdue.length ? <span class="small muted">前面有 {overdue.length} 项还没打勾</span> : null}
      </div>
      {item ? (
        <div class="stack" style={{ marginTop: '10px' }}>
          <div class="row">
            <span class="now-time num">{item.time}</span>
            <div class="grow">
              <p class="now-title">{item.title}</p>
              <p class="small muted">
                {RHYTHM_KIND_LABEL[item.kind]}
                {item.durationMin ? ` · ${item.durationMin} 分钟` : ''}
                {!current && next ? ` · ${untilText(hmToMin(item.time)! - minute)}` : ''}
              </p>
            </div>
          </div>
          {item.note ? <p class="small soft">{item.note}</p> : null}
          <div class="btn-row">
            {actionsFor(item).map((a, i) => (
              <button type="button" key={a.label} class={`btn${i === 0 ? ' primary' : ''}`} onClick={a.run}>
                <Icon name={a.icon} />
                {a.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p class="soft" style={{ marginTop: '8px' }}>
          今天的节奏都走完了。
        </p>
      )}
    </section>
  );
}

function untilText(min: number): string {
  if (min < 60) return `${min} 分钟后`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} 小时 ${m} 分后` : `${h} 小时后`;
}

function NightCard() {
  const t = targets.value;
  const night = dayOf(nightDate())?.urges?.filter((u) => u.decision === 'got-up').length ?? 0;
  return (
    <section class="card night-card" style={{ order: 2 }} aria-label="今晚">
      <div class="section-head">
        <h2>今晚</h2>
        <span class="small muted num">
          已起来 {night}/{t.refitCap} 次
        </span>
      </div>
      <ul class="stack tight small soft" style={{ marginTop: '10px', paddingLeft: '18px' }}>
        <li>冲动来了，先躺着不动 {t.urgeDelayMin} 分钟，观察它。</li>
        <li>一晚最多起来 {t.refitCap} 次，之后就留在床上，允许它卡着。</li>
        <li>较劲 20 分钟以上就去别的房间，有困意再回来。</li>
      </ul>
      <div class="btn-row" style={{ marginTop: '12px' }}>
        <button type="button" class="btn primary" onClick={() => openTool('night')}>
          <Icon name="moon" />
          冲动来了
        </button>
        <button type="button" class="btn" onClick={() => openTool('meditate', { practice: 'pm-open', slot: 'pm' })}>
          <Icon name="play" />
          睡前冥想
        </button>
      </div>
    </section>
  );
}

function nightDate(): string {
  const d = new Date(clock.value);
  return d.getHours() >= 12 ? addDays(today.value, 1) : today.value;
}

// ---------------------------------------------------------------- check-ins

function CheckinCards({ day, minute }: { day: DayDoc | undefined; minute: number }) {
  const amDone = !!day?.sleep?.loggedAt;
  const pmDone = !!day?.eveningAt;
  const showAm = !amDone && minute >= 4 * 60;
  const showPm = !pmDone && minute >= 18 * 60;
  if (!showAm && !showPm) return null;
  return (
    <section class="stack" style={{ order: 3 }} aria-label="打卡">
      {showAm ? (
        <button type="button" class="checkin" onClick={() => openSheet('checkin-am')}>
          <span class="checkin-icon" data-k="am">
            <Icon name="sun" />
          </span>
          <span class="grow">
            <b>晨间打卡</b>
            <span class="small muted">一分钟，记下昨晚：几点睡、起来几次、多难受</span>
          </span>
          <Icon name="chev-r" />
        </button>
      ) : null}
      {showPm ? (
        <button type="button" class="checkin" onClick={() => openSheet('checkin-pm')}>
          <span class="checkin-icon" data-k="pm">
            <Icon name="moon" />
          </span>
          <span class="grow">
            <b>晚间打卡</b>
            <span class="small muted">精力、胃、心情，加三行日记</span>
          </span>
          <Icon name="chev-r" />
        </button>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- timeline

function TimelineCard({ items, day, minute }: { items: RhythmItem[]; day: DayDoc | undefined; minute: number }) {
  const { current } = rhythmNow(items, day, minute);
  const nowIndex = items.findIndex((i) => (hmToMin(i.time) ?? 0) > minute);
  const toggle = (item: RhythmItem, done: boolean) => {
    void patchDay(today.value, { checks: { [item.id]: !done } });
  };
  return (
    <section class="card" style={{ order: 8 }} id="timeline" aria-label="今日节奏">
      <div class="section-head">
        <h2>今日节奏</h2>
        <button type="button" class="link" onClick={() => openSheet('rhythm')}>
          编辑作息
        </button>
      </div>
      <ol class="timeline" style={{ marginTop: '10px' }}>
        {timelineRows(items, day, minute, current?.id, nowIndex, toggle)}
      </ol>
    </section>
  );
}

function timelineRows(
  items: RhythmItem[],
  day: DayDoc | undefined,
  minute: number,
  currentId: string | undefined,
  nowIndex: number,
  toggle: (item: RhythmItem, done: boolean) => void,
) {
  const rows = [];
  const nowRow = (
    <li class="tl-now" key="now" aria-label={`现在 ${minToHM(minute)}`}>
      <span>{minToHM(minute)}</span>
    </li>
  );
  items.forEach((item, i) => {
    if (i === nowIndex) rows.push(nowRow);
    const done = rhythmDone(item, day, items);
    const isCurrent = currentId === item.id;
    const acts = actionsFor(item);
    rows.push(
      <li key={item.id} class={`tl-item${done ? ' done' : ''}${isCurrent ? ' current' : ''}`}>
        <span class="tl-time">{item.time}</span>
        <span class="tl-node" />
        <button type="button" class="tl-main" onClick={() => (acts[0] ? acts[0].run() : toggle(item, done))}>
          <p class="t">{item.title}</p>
          {item.durationMin || (isCurrent && item.note) ? (
            <p class="n">{[item.durationMin ? `${item.durationMin} 分钟` : '', isCurrent ? item.note : ''].filter(Boolean).join(' · ')}</p>
          ) : null}
        </button>
        <button
          type="button"
          class="check-btn"
          aria-pressed={done}
          aria-label={`${item.title}${done ? '已完成' : '标记完成'}`}
          onClick={() => toggle(item, done)}
        >
          <Icon name="check" />
        </button>
      </li>,
    );
  });
  if (nowIndex === -1) rows.push(nowRow);
  return rows;
}

// ---------------------------------------------------------------- brief

function BriefCard({ day }: { day: DayDoc | undefined }) {
  const brief = day?.brief;
  const ready = aiReady();
  if (!ready && !brief) return null;
  return (
    <section class="card brief" style={{ order: 4 }} aria-label="教练的今日简报">
      <div class="section-head">
        <h2 class="row">
          <Icon name="sparkle" size={18} />
          今日简报
        </h2>
        {ready && brief ? (
          <button type="button" class="icon-btn" aria-label="重新生成简报" disabled={briefBusy.value} onClick={() => generateBrief()}>
            <Icon name="refresh" />
          </button>
        ) : null}
      </div>
      {briefBusy.value ? (
        <div style={{ marginTop: '10px' }}>
          <Thinking label="正在读你的记录" />
        </div>
      ) : brief ? (
        <div class="stack" style={{ marginTop: '8px' }}>
          <p class="brief-head display">{brief.headline}</p>
          {brief.focus.length ? (
            <ol class="brief-list">
              {brief.focus.map((f, i) => (
                <li key={i}>
                  <b>{f.title}</b>
                  {f.why ? <span class="small muted">{f.why}</span> : null}
                </li>
              ))}
            </ol>
          ) : null}
          {brief.note ? <p class="small soft">{brief.note}</p> : null}
          {brief.caution ? <Callout tone="warn">{brief.caution}</Callout> : null}
          <button type="button" class="btn sm ghost" style={{ justifySelf: 'start' }} onClick={() => askCoach('关于今天的简报，我想问：')}>
            <Icon name="coach" />
            问教练
          </button>
        </div>
      ) : (
        <div class="stack" style={{ marginTop: '8px' }}>
          <p class="small soft">教练读完你最近的记录和本周计划，告诉你今天最该做的三件事。</p>
          <button type="button" class="btn" style={{ justifySelf: 'start' }} onClick={() => generateBrief()}>
            <Icon name="sparkle" />
            生成今日简报
          </button>
        </div>
      )}
      {briefError.value ? <p class="small" style={{ color: 'var(--critical)', marginTop: '8px' }}>{briefError.value}</p> : null}
    </section>
  );
}

// ---------------------------------------------------------------- quick log

interface Parsed {
  date: string;
  summary: string;
  patch: Partial<DayDoc>;
  unsure: string[];
}

function QuickLog() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [err, setErr] = useState('');
  if (!aiReady()) return null;

  async function submit(e: Event) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setErr('');
    setParsed(null);
    try {
      const r = await askJson<{ date?: string; summary?: string; patch?: unknown; unsure?: unknown }>(quickLogPrompt(text.trim(), today.value, nowHM()), {
        modelTier: 'quick',
        cache: false,
      });
      const patch = sanitizePatch(r?.patch);
      const date = typeof r?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : today.value;
      if (!Object.keys(patch).length) {
        setErr('没听出要记什么。可以说得具体一点，比如“午饭吃了 25 分钟，有点胀”。');
        return;
      }
      setParsed({
        date,
        summary: String(r?.summary ?? ''),
        patch,
        unsure: Array.isArray(r?.unsure) ? r.unsure.map(String).slice(0, 3) : [],
      });
    } catch (e2) {
      if (!isCancel(e2)) setErr(aiMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!parsed) return;
    await applyLogPatch(parsed.date, parsed.patch);
    notify('记好了', 'success');
    setParsed(null);
    setText('');
  }

  return (
    <section class="card" style={{ order: 5 }} aria-label="一句话记录">
      <form class="quick-log" onSubmit={submit}>
        <label class="sr-only" for="quick-log">
          一句话记录
        </label>
        <input
          id="quick-log"
          class="input"
          placeholder="一句话记录：昨晚 12 点睡，起来铺了 3 次"
          value={text}
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
          enterKeyHint="send"
        />
        <button type="submit" class="btn primary" disabled={busy || !text.trim()} aria-label="识别">
          {busy ? <span class="spinner" /> : <Icon name="send" />}
        </button>
      </form>
      {err ? <p class="small" style={{ color: 'var(--critical)', marginTop: '8px' }}>{err}</p> : null}
      {parsed ? (
        <div class="stack" style={{ marginTop: '12px' }}>
          <p class="small soft">
            记到 {formatDate(parsed.date, { weekday: true })}
            {parsed.summary ? `：${parsed.summary}` : ''}
          </p>
          <div class="row wrap">
            {describePatch(parsed.patch).map((x) => (
              <span class="pill" key={x}>
                {x}
              </span>
            ))}
          </div>
          {parsed.unsure.length ? <p class="xs muted">不确定：{parsed.unsure.join('；')}</p> : null}
          <div class="btn-row">
            <button type="button" class="btn primary sm" onClick={save}>
              <Icon name="check" />
              保存
            </button>
            <button type="button" class="btn sm ghost" onClick={() => setParsed(null)}>
              不对，重说
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- top 3

function Top3Card({ day }: { day: DayDoc | undefined }) {
  const items = day?.top3 ?? [];
  const [draft, setDraft] = useState('');
  const date = today.value;
  const update = (fn: (l: TodoItem[]) => TodoItem[]) => void updateDayList(date, 'top3', fn);
  const add = (e: Event) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    update((l) => [...l, { id: newId('t'), text, done: false }].slice(0, 3));
    setDraft('');
  };
  const done = items.filter((i) => i.done).length;
  return (
    <section class="card" style={{ order: 6 }} aria-label="今天三件事">
      <div class="section-head">
        <h2>今天三件事</h2>
        <span class="small muted num">{items.length ? `完成 ${done}/${items.length}` : '不求多，做完就好'}</span>
      </div>
      <ul class="list" style={{ marginTop: '6px' }}>
        {items.map((it) => (
          <li key={it.id} class="list-row">
            <button
              type="button"
              class="check-btn"
              aria-pressed={it.done}
              aria-label={it.done ? '标记未完成' : '标记完成'}
              onClick={() => update((l) => l.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))}
            >
              <Icon name="check" />
            </button>
            <p class="grow" style={it.done ? { color: 'var(--ink-3)', textDecoration: 'line-through' } : undefined}>
              {it.text}
            </p>
            <button type="button" class="icon-btn" aria-label="删除" onClick={() => update((l) => l.filter((x) => x.id !== it.id))}>
              <Icon name="x" size={18} />
            </button>
          </li>
        ))}
      </ul>
      {items.length < 3 ? (
        <form class="row" style={{ marginTop: '8px' }} onSubmit={add}>
          <input
            class="input"
            placeholder={items.length ? '再加一件' : '今天最重要的一件事'}
            value={draft}
            onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
            aria-label="添加一件事"
          />
          <button type="submit" class="btn" disabled={!draft.trim()}>
            添加
          </button>
        </form>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- status tiles

function StatusTiles() {
  const date = today.value;
  const all = allDays.value;
  const t = targets.value;
  const unit = profile.value.weightUnit;
  const last14 = rangeDates(addDays(date, -13), date);
  const last7 = last14.slice(7);
  const sleep7 = avg(last7.map((d) => sleepHours(all[d]?.sleep)));
  const refit7 = avg(last7.map((d) => nightRefits(all[d])));
  const gut7 = avg(last7.map((d) => all[d]?.gut?.discomfort));
  const gutBad = last7.filter((d) => (all[d]?.gut?.discomfort ?? 0) >= 4).length;
  const energyAm = avg(last7.map((d) => all[d]?.energy?.am));
  const energyPm = avg(last7.map((d) => all[d]?.energy?.pm));
  const week = computeWeekStats(weekStartOf(date), all, t);
  const w = latestWeight(all);
  const w4 = latestWeight(all, addDays(date, -28));
  const b = bmi(w?.kg, profile.value.heightCm);
  const weightSeries = rangeDates(addDays(date, -55), date)
    .map((d) => all[d]?.weightKg)
    .filter((v): v is number => v !== undefined);

  const tiles = [
    {
      key: 'sleep',
      label: '睡眠',
      icon: 'moon',
      value: sleep7 !== undefined ? `${round1(sleep7)}` : '—',
      unit: sleep7 !== undefined ? '小时' : '',
      sub: sleep7 !== undefined ? '近 7 晚平均' : '还没有记录',
      spark: last14.map((d) => sleepHours(all[d]?.sleep)),
      color: 'var(--c-sleep)',
    },
    {
      key: 'refit',
      label: '起来重铺',
      icon: 'bed',
      value: refit7 !== undefined ? `${round1(refit7)}` : '—',
      unit: refit7 !== undefined ? '次/晚' : '',
      sub: `上限 ${t.refitCap} 次`,
      spark: last14.map((d) => nightRefits(all[d])),
      color: 'var(--c-sleep)',
    },
    {
      key: 'weight',
      label: '体重',
      icon: 'scale',
      value: w ? `${round1(kgTo(unit, w.kg))}` : '—',
      unit: w ? unitLabel(unit) : '',
      sub: w
        ? [b ? `BMI ${round1(b)}` : '', w4 && w4.date !== w.date ? `4 周 ${signed(kgTo(unit, w.kg - w4.kg))}` : ''].filter(Boolean).join(' · ') || '每周称一次就够'
        : '每周称一次就够',
      spark: weightSeries,
      color: 'var(--c-food)',
      action: () => openSheet('weight'),
    },
    {
      key: 'gut',
      label: '胃部不适',
      icon: 'drop',
      value: gut7 !== undefined ? `${round1(gut7)}` : '—',
      unit: gut7 !== undefined ? '/10' : '',
      sub: gut7 !== undefined ? `≥4 分 ${gutBad} 天` : '晚间打卡时记',
      spark: last14.map((d) => all[d]?.gut?.discomfort),
      color: 'var(--c-food)',
    },
    {
      key: 'energy',
      label: '白天精力',
      icon: 'lightning',
      value: energyPm !== undefined || energyAm !== undefined ? `${round1(avg([energyAm, energyPm])!)}` : '—',
      unit: energyPm !== undefined || energyAm !== undefined ? '/5' : '',
      sub: energyAm !== undefined || energyPm !== undefined ? `早 ${energyAm !== undefined ? round1(energyAm) : '—'} · 午 ${energyPm !== undefined ? round1(energyPm) : '—'}` : '打卡时记',
      spark: last14.map((d) => avg([all[d]?.energy?.am, all[d]?.energy?.pm])),
      color: 'var(--c-calm)',
    },
    {
      key: 'exercise',
      label: '力量训练',
      icon: 'dumbbell',
      value: `${week.exerciseSessions}`,
      unit: `/${t.exercisePerWeek} 次`,
      sub: `本周活动 ${week.moveMin} 分钟`,
      spark: last14.map((d) => {
        const h = all[d]?.habits;
        return (h?.exerciseMin ?? 0) + (h?.walkMin ?? 0) + (h?.postureMin ?? 0) || undefined;
      }),
      color: 'var(--c-move)',
    },
  ];

  return (
    <section class="stack" style={{ order: 9 }} aria-label="身体状态">
      <div class="section-head">
        <h2>身体状态</h2>
        <button type="button" class="link" onClick={() => go('trends')}>
          看趋势
        </button>
      </div>
      <div class="tiles">
        {tiles.map((tile) => (
          <button type="button" class="tile" key={tile.key} onClick={tile.action ?? (() => go('trends'))}>
            <span class="label">
              <Icon name={tile.icon} size={14} />
              {tile.label}
            </span>
            <span class="value">
              {tile.value}
              {tile.unit ? <small>{tile.unit}</small> : null}
            </span>
            <span class="sub">{tile.sub}</span>
            <Sparkline values={tile.spark} color={tile.color} />
          </button>
        ))}
      </div>
      {w ? null : (
        <button type="button" class="btn sm" style={{ justifySelf: 'start' }} onClick={() => openSheet('weight')}>
          <Icon name="scale" />
          记一次体重
        </button>
      )}
    </section>
  );
}

function signed(v: number): string {
  const r = round1(v);
  return r > 0 ? `+${r}` : `${r}`;
}
