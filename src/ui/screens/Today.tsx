import { useEffect, useMemo, useState } from 'preact/hooks';
import { describePatch, quickLogPrompt, sanitizePatch } from '../../domain/ai';
import { addDays, formatDate, greeting, hmToMin, minToHM, nowHM, nowMin, rangeDates, weekday, weekStartOf } from '../../domain/dates';
import {
  computeSeals,
  computeWeekStats,
  latestWeight,
  moveMinutes,
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
  loaded,
  mergeDocument,
  notify,
  patchDay,
  plans,
  profile,
  reviews,
  rhythm,
  settings,
  targets,
  today,
  updateDayList,
} from '../../platform/store';
import { actionsFor } from '../actions';
import { briefBusy, briefError, generateBrief } from '../brief';
import { Sparkline } from '../components/charts';
import { Callout, Thinking } from '../components/controls';
import { Icon } from '../components/Icon';
import { Seal } from '../components/Seal';
import { TopBar } from '../components/TopBar';
import { applyLogPatch } from '../logs';
import { askCoach, coachView, go, openSheet, openTool, reviewWeekHint } from '../nav';
import { planLabel } from '../planning';

export function TodayScreen() {
  const date = today.value;
  const day = days.value[date];
  const t = targets.value;
  const seals = computeSeals(day, t);
  const minute = nowMin(new Date(clock.value));
  const items = rhythmForDate(rhythm.value, date);
  const bedMin = hmToMin(t.bedTime) ?? 23 * 60;
  const night = minute >= bedMin - 30 || minute < 5 * 60;
  const [showAll, setShowAll] = useState(false);

  // From half an hour before bed: only what the night needs. No clock, no lists.
  if (night && !showAll) {
    const pmDone = !!day?.eveningAt;
    return (
      <div class="page">
        <TopBar />
        <header class="hero">
          <h1 class="hero-title">{minute < 5 * 60 ? '夜里' : '该准备睡了'}</h1>
          <p class="small soft">今晚只做一件事：照规则来，睡得怎样都可以。</p>
        </header>
        <NightCard />
        <div class="btn-row">
          {!pmDone && minute >= 18 * 60 ? (
            <button type="button" class="btn sm" onClick={() => openSheet('checkin-pm')}>
              <Icon name="pen" />
              晚间打卡
            </button>
          ) : null}
          <button type="button" class="btn sm ghost" onClick={() => setShowAll(true)}>
            看全部
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="page wide">
      <TopBar>
        <button type="button" class="icon-btn" aria-label="一句话记录" onClick={() => document.getElementById('quick-log')?.focus()}>
          <Icon name="pen" />
        </button>
      </TopBar>
      <Hero day={day} />
      {loaded.value && !settings.value.introDone ? <IntroCard /> : null}
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
  return (
    <header class="hero">
      <p class="eyebrow">{formatDate(today.value, { weekday: true })}</p>
      <h1 class="hero-title">{greeting(new Date(clock.value))}</h1>
      <div class="row wrap">
        <button type="button" class="pill primary" onClick={() => askCoachPlan()}>
          <Icon name="flag" />
          {planLabel(plan, plans.value)}
        </button>
        {plan.tasks.length ? (
          <button type="button" class="pill" onClick={() => askCoachPlan()}>
            <Icon name="list" />
            本周任务 {plan.tasks.filter((x) => x.done).length}/{plan.tasks.length}
          </button>
        ) : null}
      </div>
      <Glance day={day} />
    </header>
  );
}

/** Three numbers that answer "how am I doing" before any scrolling. */
function Glance({ day }: { day: DayDoc | undefined }) {
  const all = allDays.value;
  const date = today.value;
  const h = sleepHours(day?.sleep);
  const r = nightRefits(day);
  const gutToday = day?.gut?.discomfort;
  const gutYesterday = all[addDays(date, -1)]?.gut?.discomfort;
  const last7 = rangeDates(addDays(date, -6), date);
  const energy = avg(last7.flatMap((d) => [all[d]?.energy?.am, all[d]?.energy?.pm]));
  const logged = !!day?.sleep?.loggedAt;
  return (
    <div class="glance" role="group" aria-label="现在的状态">
      <button type="button" onClick={() => (logged ? go('trends') : openSheet('checkin-am'))}>
        <span class="g-label">
          <Icon name="moon" size={13} />
          昨晚
        </span>
        <span class="g-value">
          {logged ? (
            <>
              {h !== undefined ? `${round1(h)} 时` : '—'}
              <small> · 重铺 {r ?? 0}</small>
            </>
          ) : (
            <small>还没打卡</small>
          )}
        </span>
        {day?.sleep?.stuckButSlept ? <span class="g-note">卡着也睡着了</span> : null}
      </button>
      <button type="button" onClick={() => go('trends')}>
        <span class="g-label">
          <Icon name="drop" size={13} />
          胃 · {gutToday !== undefined ? '今天' : '昨天'}
        </span>
        <span class="g-value">
          {gutToday ?? gutYesterday ?? '—'}
          {gutToday !== undefined || gutYesterday !== undefined ? <small>/10</small> : null}
        </span>
      </button>
      <button type="button" onClick={() => go('trends')}>
        <span class="g-label">
          <Icon name="lightning" size={13} />
          精力 · 近 7 天
        </span>
        <span class="g-value">
          {energy !== undefined ? round1(energy) : '—'}
          {energy !== undefined ? <small>/5</small> : null}
        </span>
      </button>
    </div>
  );
}

function askCoachPlan() {
  coachView.value = 'plan';
  go('coach');
}

// ---------------------------------------------------------------- first run

function IntroCard() {
  const steps: [string, string][] = [
    ['sun', '每天两次打卡：早上记昨晚，晚上记今天，各一分钟。'],
    ['moon', '夜里冲动来了，打开「今晚」点「冲动来了」，先等 5 分钟再决定。'],
    ['pen', '懒得点表格时，在「一句话记录」里直接说，比如“午饭吃了 25 分钟，有点胀”。'],
    ['practice', '「练习」里有暴露练习、午睡训练、冥想、慢慢吃和跟练。'],
    ['coach', '「教练」读过你的资料和记录。每周日一起复盘，定下周的计划。'],
  ];
  return (
    <section class="card intro" aria-label="开始使用">
      <div class="section-head">
        <h2>从这里开始</h2>
      </div>
      <ul class="stack" style={{ listStyle: 'none', marginTop: '10px' }}>
        {steps.map(([icon, text]) => (
          <li key={icon} class="row" style={{ alignItems: 'flex-start' }}>
            <Icon name={icon} size={18} />
            <span class="small">{text}</span>
          </li>
        ))}
      </ul>
      <p class="xs muted" style={{ marginTop: '10px' }}>
        印章看的是你做没做，不看结果好不好。漏了一天也没关系，第二天接着来。
      </p>
      <div class="btn-row" style={{ marginTop: '12px' }}>
        <button type="button" class="btn primary sm" onClick={() => void mergeDocument('settings/main', { introDone: true })}>
          知道了
        </button>
        <button type="button" class="btn sm ghost" onClick={() => askCoachPlan()}>
          先看本周计划
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- seals

const SEEN_KEY = 'realign:seals-seen';

/** Seals completed elsewhere (in a tool, on another tab) stamp on the next look. */
function useFreshSeals(date: string, seals: SealState[]): Set<string> {
  const done = seals.filter((s) => s.done).map((s) => s.key);
  const fresh = useMemo(() => {
    let seen: string[] = [];
    try {
      const raw = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as { date?: string; keys?: string[] };
      seen = raw.date === date ? raw.keys ?? [] : [];
    } catch {
      /* no storage: just don't replay */
    }
    return new Set(done.filter((k) => !seen.includes(k)));
  }, [date, done.join()]);
  useEffect(() => {
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify({ date, keys: done }));
    } catch {
      /* ignore */
    }
  }, [date, done.join()]);
  return fresh;
}

function SealsCard({ seals }: { seals: SealState[] }) {
  const fresh = useFreshSeals(today.value, seals);
  const done = seals.filter((s) => s.done).length;
  return (
    <section class="card" style={{ order: 1 }} aria-label="今日四印">
      <div class="section-head">
        <h2>今日四印</h2>
        <span class="small muted">{done ? `已盖 ${done} 枚` : '看你做没做，不看结果'}</span>
      </div>
      <div class="seals" style={{ marginTop: '14px' }}>
        {seals.map((s) => (
          <button
            type="button"
            class="seal-btn"
            key={s.key}
            onClick={() => openSheet('seal', { key: s.key })}
            aria-label={`${s.char}：${s.parts.map((p) => `${p.label}${p.done ? '，已完成' : ''}`).join('；')}`}
          >
            <Seal state={s} stamp={fresh.has(s.key)} />
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
  const { current, next } = rhythmNow(items, day, minute);
  const item = current ?? next;
  return (
    <section class="card now-card" style={{ order: 2 }} aria-label="此刻">
      <div class="section-head">
        <h2>{current ? '此刻' : '接下来'}</h2>
      </div>
      {item ? (
        <div class="stack" style={{ marginTop: '10px' }}>
          <div class="row">
            <span class="now-time num">{item.time}</span>
            <div class="grow">
              <p class="now-title">{item.title}</p>
              {item.durationMin || (!current && next) ? (
                <p class="small muted">
                  {[item.durationMin ? `${item.durationMin} 分钟` : '', !current && next ? untilText(hmToMin(item.time)! - minute) : ''].filter(Boolean).join(' · ')}
                </p>
              ) : null}
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
  return m ? `${h} 小时 ${m} 分钟后` : `${h} 小时后`;
}

function NightCard() {
  const t = targets.value;
  const ups = dayOf(nightDate())?.urges?.filter((u) => u.decision === 'got-up').length ?? 0;
  return (
    <section class="card night-card" style={{ order: 2 }} aria-label="今晚">
      <div class="section-head">
        <h2>今晚</h2>
        <span class="small muted num">
          已重铺 {ups}/{t.refitCap} 次
        </span>
      </div>
      <ul class="stack tight small soft" style={{ marginTop: '10px', paddingLeft: '18px' }}>
        <li>冲动来了，先躺着不动 {t.urgeDelayMin} 分钟，观察它。</li>
        <li>一晚最多重铺 {t.refitCap} 次，之后留在床上，让它卡着。</li>
        <li>睡不着超过 20 分钟：去别的房间坐坐，回来直接躺下，不碰床铺。</li>
      </ul>
      <div class="btn-row" style={{ marginTop: '14px' }}>
        <button type="button" class="btn primary lg" onClick={() => openTool('night')}>
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

/** Sunday evening reviews this week; Monday reviews last week, if it has logs. */
function dueReviewWeek(minute: number): string | null {
  const date = today.value;
  const wd = weekday(date);
  const week = wd === 0 && minute >= 17 * 60 ? weekStartOf(date) : wd === 1 ? addDays(weekStartOf(date), -7) : null;
  if (!week || reviews.value.some((r) => r.weekStart === week)) return null;
  return computeWeekStats(week, allDays.value, targets.value).days > 0 ? week : null;
}

function CheckinCards({ day, minute }: { day: DayDoc | undefined; minute: number }) {
  const amDone = !!day?.sleep?.loggedAt;
  const pmDone = !!day?.eveningAt;
  const showAm = !amDone && minute >= 4 * 60 && minute < 14 * 60;
  const showPm = !pmDone && minute >= 18 * 60;
  const reviewWeek = dueReviewWeek(minute);
  if (!showAm && !showPm && !reviewWeek) return null;
  return (
    <section class="stack" style={{ order: 3 }} aria-label="打卡">
      {reviewWeek ? (
        <button
          type="button"
          class="checkin"
          onClick={() => {
            reviewWeekHint.value = reviewWeek;
            coachView.value = 'review';
            go('coach');
          }}
        >
          <span class="checkin-icon" data-k="review">
            <Icon name="history" />
          </span>
          <span class="grow">
            <b>每周复盘</b>
            <span class="small muted">看看 {formatDate(reviewWeek)} 起这一周，一起定下周的计划</span>
          </span>
          <Icon name="chev-r" />
        </button>
      ) : null}
      {showAm ? (
        <button type="button" class="checkin" onClick={() => openSheet('checkin-am')}>
          <span class="checkin-icon" data-k="am">
            <Icon name="sun" />
          </span>
          <span class="grow">
            <b>晨间打卡</b>
            <span class="small muted">一分钟，记下昨晚：几点睡、重铺几次、多难受</span>
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
            <span class="small muted">精力、胃、心情，日记可写可不写</span>
          </span>
          <Icon name="chev-r" />
        </button>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- timeline

function TimelineCard({ items, day, minute }: { items: RhythmItem[]; day: DayDoc | undefined; minute: number }) {
  const [expanded, setExpanded] = useState(false);
  const { current } = rhythmNow(items, day, minute);
  const toggle = (item: RhythmItem, done: boolean) => void patchDay(today.value, { checks: { [item.id]: !done } });
  const start = (i: RhythmItem) => hmToMin(i.time) ?? 0;
  const past = items.filter((i) => start(i) <= minute && i.id !== current?.id);
  const upcoming = items.filter((i) => start(i) > minute);
  const pastDone = past.filter((i) => rhythmDone(i, day, items)).length;

  const row = (item: RhythmItem, cls = '') => {
    const done = rhythmDone(item, day, items);
    const isCurrent = current?.id === item.id;
    const acts = actionsFor(item);
    return (
      <li key={item.id} class={`tl-item${done ? ' done' : ''}${isCurrent ? ' current' : ''}${cls}`}>
        <span class="tl-time">{item.time}</span>
        <span class="tl-node" />
        <button type="button" class="tl-main" onClick={() => (acts[0] ? acts[0].run() : toggle(item, done))}>
          <p class="t">{item.title}</p>
          {item.durationMin || (isCurrent && item.note) ? (
            <p class="n">{[item.durationMin ? `${item.durationMin} 分钟` : '', isCurrent ? item.note : ''].filter(Boolean).join(' · ')}</p>
          ) : null}
        </button>
        <button type="button" class="check-btn" aria-pressed={done} aria-label={`${item.title}${done ? '已完成' : '标记完成'}`} onClick={() => toggle(item, done)}>
          <Icon name="check" />
        </button>
      </li>
    );
  };
  const nowRow = (
    <li class="tl-now" key="now" aria-label={`现在 ${minToHM(minute)}`}>
      <span>{minToHM(minute)}</span>
    </li>
  );
  const foldRow = (key: string, text: string) => (
    <li key={key} class="tl-fold">
      <button type="button" onClick={() => setExpanded(true)}>
        {text}
        <Icon name="chev-d" size={16} />
      </button>
    </li>
  );

  let rows;
  if (expanded) {
    rows = [];
    let placed = false;
    for (const item of items) {
      if (!placed && start(item) > minute) {
        rows.push(nowRow);
        placed = true;
      }
      rows.push(row(item, start(item) <= minute && item.id !== current?.id ? ' past' : ''));
    }
    if (!placed) rows.push(nowRow);
  } else {
    rows = [
      past.length ? foldRow('past', `已过去 ${past.length} 项${pastDone ? ` · 做了 ${pastDone} 项` : ''}`) : null,
      current ? row(current) : null,
      nowRow,
      ...upcoming.slice(0, 2).map((i) => row(i)),
      upcoming.length > 2 ? foldRow('more', `之后还有 ${upcoming.length - 2} 项`) : null,
    ];
  }

  return (
    <section class="card" style={{ order: 8 }} id="timeline" aria-label="今日节奏">
      <div class="section-head">
        <h2>今日节奏</h2>
        <div class="row">
          {expanded ? (
            <button type="button" class="link" onClick={() => setExpanded(false)}>
              收起
            </button>
          ) : null}
          <button type="button" class="link" onClick={() => openSheet('rhythm')}>
            编辑作息
          </button>
        </div>
      </div>
      <ol class="timeline" style={{ marginTop: '10px' }}>
        {rows}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------- brief

function BriefCard({ day }: { day: DayDoc | undefined }) {
  const brief = day?.brief;
  const ready = aiReady();
  if (!ready && !brief) return null;
  // regenerate only when something was logged after the brief was written
  const stale = !!brief && (day?.updatedAt ?? 0) > brief.generatedAt + 3000;
  const top3 = day?.top3 ?? [];
  const addToTop3 = (title: string) => void updateDayList(today.value, 'top3', (l) => [...l, { id: newId('t'), text: title, done: false }].slice(0, 3));
  return (
    <section class="card brief" style={{ order: 4 }} aria-label="教练的今日简报">
      <div class="section-head">
        <h2 class="row">
          <Icon name="sparkle" size={18} />
          今日简报
        </h2>
        {ready && stale ? (
          <button type="button" class="btn sm ghost" disabled={briefBusy.value} onClick={() => generateBrief()}>
            <Icon name="refresh" />
            按新记录更新
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
              {brief.focus.map((f, i) => {
                const added = top3.some((x) => x.text === f.title);
                return (
                  <li key={i}>
                    <b>{f.title}</b>
                    {f.why ? <span class="small muted">{f.why}</span> : null}
                    {added ? (
                      <span class="xs muted">已在今天三件事里</span>
                    ) : top3.length < 3 ? (
                      <button type="button" class="link-btn" onClick={() => addToTop3(f.title)}>
                        <Icon name="plus" size={14} />
                        加到今天三件事
                      </button>
                    ) : null}
                  </li>
                );
              })}
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
          <p class="small soft">教练读完你最近的记录和本周计划，告诉你今天最该做的三件事。晨间打卡后会自动生成。</p>
          <button type="button" class="btn" style={{ justifySelf: 'start' }} onClick={() => generateBrief()}>
            <Icon name="sparkle" />
            现在生成
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
          placeholder="如：昨晚 12 点睡，重铺 3 次"
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
              <span class="pill wrap" key={x}>
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
  const strength7 = last7.filter((d) => (all[d]?.habits?.exerciseMin ?? 0) >= 15).length;
  const move7 = last7.reduce((a, d) => a + moveMinutes(all[d]), 0);
  const w = latestWeight(all);
  const w4 = latestWeight(all, addDays(date, -28));
  const b = bmi(w?.kg, profile.value.heightCm);
  const weightSeries = rangeDates(addDays(date, -55), date)
    .map((d) => all[d]?.weightKg)
    .filter((v): v is number => v !== undefined);
  const weighedThisWeek = !!w && w.date >= addDays(date, -6);

  const tiles = [
    {
      key: 'sleep',
      label: '睡眠',
      icon: 'moon',
      value: sleep7 !== undefined ? `${round1(sleep7)}` : '—',
      unit: sleep7 !== undefined ? '小时' : '',
      sub: sleep7 !== undefined ? '每晚平均' : '还没有记录',
      spark: last14.map((d) => sleepHours(all[d]?.sleep)),
      color: 'var(--c-sleep)',
    },
    {
      key: 'refit',
      label: '重铺',
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
    },
    {
      key: 'gut',
      label: '胃部不适',
      icon: 'drop',
      value: gut7 !== undefined ? `${round1(gut7)}` : '—',
      unit: gut7 !== undefined ? '/10' : '',
      sub: gut7 !== undefined ? (gutBad ? `有 ${gutBad} 天 ≥4` : '都在 4 分以下') : '晚间打卡时记',
      spark: last14.map((d) => all[d]?.gut?.discomfort),
      color: 'var(--c-food)',
    },
    {
      key: 'energy',
      label: '白天精力',
      icon: 'lightning',
      value: energyPm !== undefined || energyAm !== undefined ? `${round1(avg([energyAm, energyPm])!)}` : '—',
      unit: energyPm !== undefined || energyAm !== undefined ? '/5' : '',
      sub:
        energyAm !== undefined || energyPm !== undefined
          ? `早上 ${energyAm !== undefined ? round1(energyAm) : '—'} · 下午 ${energyPm !== undefined ? round1(energyPm) : '—'}`
          : '打卡时记',
      spark: last14.map((d) => avg([all[d]?.energy?.am, all[d]?.energy?.pm])),
      color: 'var(--c-calm)',
    },
    {
      key: 'exercise',
      label: '力量训练',
      icon: 'dumbbell',
      value: `${strength7}`,
      unit: ` 次`,
      sub: `目标每周 ${t.exercisePerWeek} 次 · 活动 ${move7} 分钟`,
      spark: last14.map((d) => moveMinutes(all[d]) || undefined),
      color: 'var(--c-move)',
    },
  ];

  return (
    <section class="stack" style={{ order: 9 }} aria-label="身体状态">
      <div class="section-head">
        <h2>
          身体状态 <span class="small muted" style={{ fontFamily: 'var(--font-body)', fontWeight: 400 }}>近 7 天</span>
        </h2>
        <button type="button" class="link" onClick={() => go('trends')}>
          看趋势
        </button>
      </div>
      <div class="tiles">
        {tiles.map((tile) => (
          <button type="button" class="tile" key={tile.key} onClick={() => go('trends')}>
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
      {weighedThisWeek ? null : (
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
