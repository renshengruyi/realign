import { useEffect, useRef, useState } from 'preact/hooks';
import { describePatch, parseReply, statsLine } from '../../domain/ai';
import { addDays, formatClockTime, formatDate, weekStartOf } from '../../domain/dates';
import { SCENE_LABEL } from '../../domain/defaults';
import { computeWeekStats } from '../../domain/metrics';
import type { ChatThread, MemoryCategory, MemoryItem, ProposedAction, Review } from '../../domain/types';
import { MEMORY_CATEGORIES } from '../../domain/types';
import { aiReady } from '../../platform/ai-client';
import { activePlan, aiBlocked, allDays, chats, memory, plans, reviews, targets, today } from '../../platform/store';
import {
  activeThreadId,
  addMemory,
  adoptProposal,
  chatError,
  currentThread,
  deleteThread,
  newThread,
  removeMemory,
  resolveAction,
  resolveReviewMemory,
  reviewBusy,
  reviewError,
  runReview,
  saveReflection,
  sendChat,
  stopChat,
  streaming,
  updateMemory,
} from '../coach';
import { Callout, Empty, Thinking } from '../components/controls';
import { Icon } from '../components/Icon';
import { Markdown } from '../components/Markdown';
import { TopBar } from '../components/TopBar';
import { coachDraft, coachView, go, openSheet, reviewWeekHint } from '../nav';
import { removePlanTask, togglePlanTask, addPlanTask } from '../planning';

const VIEWS = [
  { id: 'chat', label: '对话', icon: 'coach' },
  { id: 'plan', label: '本周计划', icon: 'flag' },
  { id: 'review', label: '每周复盘', icon: 'history' },
  { id: 'memory', label: '记忆', icon: 'memory' },
] as const;

export function CoachScreen() {
  const view = coachView.value;
  return (
    <div class="page">
      <TopBar title="教练" />
      <div class="coach-tabs" role="tablist" aria-label="教练">
        {VIEWS.map((v) => (
          <button type="button" role="tab" key={v.id} class="chip" aria-selected={view === v.id} aria-pressed={view === v.id} onClick={() => (coachView.value = v.id)}>
            <Icon name={v.icon} size={16} />
            {v.label}
          </button>
        ))}
      </div>
      {view === 'chat' ? <ChatView /> : view === 'plan' ? <PlanView /> : view === 'review' ? <ReviewView /> : <MemoryView />}
    </div>
  );
}

function AiUnavailable() {
  return (
    <Callout tone="warn">
      {aiBlocked.value
        ? '这个页面还没获准使用 Claude。在页面的权限菜单里允许后，刷新一下就能用。'
        : 'AI 教练要在 claude.ai 里打开这个页面才能用。记录、练习和趋势在哪里都能用。'}
    </Callout>
  );
}

// ---------------------------------------------------------------- chat

const SUGGESTIONS = [
  '看看我最近的记录，最该先改哪一件事？',
  '帮我排一下在台湾看医生、做检查的顺序',
  '昨晚又起来重铺了好几次，今晚怎么办？',
  '我想增重又怕胃不舒服，帮我排一天的加餐',
  '白天没精神，工作节奏怎么安排比较好？',
];

function ChatView() {
  const thread = currentThread();
  const s = streaming.value;
  const [text, setText] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const ready = aiReady();

  useEffect(() => {
    if (coachDraft.value) {
      setText(coachDraft.value);
      coachDraft.value = '';
      boxRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [thread?.messages.length, s?.text.length]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    void sendChat(t);
  };

  const live = s && (!thread || s.threadId === thread.id || activeThreadId.value === s.threadId) ? parseReply(s.text).display : null;

  return (
    <div class="stack loose">
      {!ready ? <AiUnavailable /> : null}
      <div class="row between">
        <span class="small muted grow ellipsis">{thread ? thread.title : '新对话'}</span>
        <div class="row" style={{ flex: 'none' }}>
          {chats.value.length ? (
            <button type="button" class="btn sm ghost" aria-expanded={showHistory} onClick={() => setShowHistory(!showHistory)}>
              <Icon name="history" />
              历史
            </button>
          ) : null}
          <button type="button" class="btn sm" onClick={() => (newThread(), setShowHistory(false))}>
            <Icon name="plus" />
            新对话
          </button>
        </div>
      </div>
      {showHistory ? (
        <ul class="card list" aria-label="历史对话">
          {chats.value.map((c) => (
            <li key={c.id} class="list-row" style={{ padding: '8px 0' }}>
              <button
                type="button"
                class="grow"
                style={{ border: 0, background: 'none', textAlign: 'left', color: 'inherit', padding: 0 }}
                onClick={() => {
                  activeThreadId.value = c.id;
                  setShowHistory(false);
                }}
              >
                <span style={{ fontWeight: c.id === thread?.id ? 700 : 500 }}>{c.title}</span>
                <span class="xs muted" style={{ display: 'block' }}>
                  {formatDate(new Date(c.updatedAt).toISOString().slice(0, 10))} · {c.messages.length} 条
                </span>
              </button>
              <button type="button" class="icon-btn" aria-label={`删除对话 ${c.title}`} onClick={() => void deleteThread(c.id)}>
                <Icon name="trash" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div class="chat" aria-live="polite">
        {!thread?.messages.length && !live ? (
          <div class="stack">
            <div class="card flat stack tight">
              <p style={{ fontWeight: 700 }}>我会读你的记录、本周计划和记忆再回答。</p>
              <p class="small soft">聊到值得记住的事，或者要改计划、补记录，我会在回答下面列出来，你点确认才会生效。</p>
            </div>
            {ready ? (
              <div class="suggestions">
                {SUGGESTIONS.map((q) => (
                  <button type="button" key={q} onClick={() => (setText(''), void sendChat(q))}>
                    {q}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {thread?.messages.map((m, i) => (
          <div key={i} class={`msg ${m.role}`}>
            <div class="bubble">{m.role === 'assistant' ? <Markdown text={m.content} /> : m.content}</div>
            {m.actions?.length ? (
              <div class="stack tight">
                {m.actions.map((a) => (
                  <ActionChip key={a.id} action={a} thread={thread} index={i} />
                ))}
              </div>
            ) : null}
            <span class="meta">
              {formatClockTime(m.at)}
              {m.error ? ` · ${m.error}` : ''}
            </span>
          </div>
        ))}
        {s ? (
          <div class="msg assistant">
            <div class="bubble">{live ? <Markdown text={live} /> : <Thinking label="正在读你的记录" />}</div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
      {chatError.value ? <p class="small" style={{ color: 'var(--critical)' }}>{chatError.value}</p> : null}

      <form
        class="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label class="sr-only" for="coach-input">
          给教练发消息
        </label>
        <textarea
          id="coach-input"
          ref={boxRef}
          rows={1}
          value={text}
          disabled={!ready}
          placeholder={ready ? '问教练，或者说说今天怎么样' : 'AI 教练暂不可用'}
          onInput={(e) => {
            const el = e.target as HTMLTextAreaElement;
            setText(el.value);
            el.style.height = 'auto';
            el.style.height = `${Math.min(160, el.scrollHeight)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        {s ? (
          <button type="button" class="btn sm" onClick={stopChat} aria-label="停止">
            <Icon name="stop" />
          </button>
        ) : (
          <button type="submit" class="btn primary sm" disabled={!ready || !text.trim()} aria-label="发送">
            <Icon name="send" />
          </button>
        )}
      </form>
    </div>
  );
}

function ActionChip({ action, thread, index }: { action: ProposedAction; thread: ChatThread; index: number }) {
  const [busy, setBusy] = useState(false);
  const label =
    action.type === 'memory'
      ? `记住（${action.category}）：${action.text}`
      : action.type === 'task'
        ? `加到本周计划：${action.text}`
        : `记录到 ${formatDate(action.date)}：${describePatch(action.patch).join('、') || action.summary}`;
  const icon = action.type === 'memory' ? 'memory' : action.type === 'task' ? 'flag' : 'pen';
  const act = async (accept: boolean) => {
    setBusy(true);
    try {
      await resolveAction(thread, index, action, accept);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="action-chip">
      <Icon name={icon} />
      <span class="grow">{label}</span>
      {action.state === 'accepted' ? (
        <span class="pill good">已确认</span>
      ) : action.state === 'dismissed' ? (
        <span class="pill">不用了</span>
      ) : (
        <span class="row">
          <button type="button" class="btn sm primary" disabled={busy} onClick={() => act(true)}>
            确认
          </button>
          <button type="button" class="btn sm ghost" disabled={busy} onClick={() => act(false)}>
            不用
          </button>
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- plan

function PlanView() {
  const plan = activePlan.value;
  const t = targets.value;
  const [draft, setDraft] = useState('');
  const scenes = Array.from(new Set(plan.rules.map((r) => r.scene)));
  const history = plans.value.filter((p) => p.id !== plan.id).sort((a, b) => b.createdAt - a.createdAt);
  const [open, setOpen] = useState<string | null>(null);
  const tgt: [string, string][] = [
    ['每晚最多起来', `${t.refitCap} 次`],
    ['冲动先等', `${t.urgeDelayMin} 分钟`],
    ['暴露练习', `每周 ${t.exposurePerWeek} 次 × ${t.exposureMin} 分钟`],
    ['午睡训练', `${t.napMin} 分钟`],
    ['起床 / 上床', `${t.wakeTime} / ${t.bedTime}`],
    ['每天吃', `${t.mealsPerDay} 次，慢 ${t.slowMealsPerDay} 次`],
    ['冥想', `每天 ${t.meditationMin} 分钟`],
    ['活动', `每天 ${t.moveMin} 分钟`],
    ['力量训练', `每周 ${t.exercisePerWeek} 次`],
    ['坐站', `坐 ${t.sitMin} / 站 ${t.standMin} 分钟`],
  ];
  return (
    <div class="stack loose">
      <section class="card pad-lg stack">
        <div class="plan-head">
          <p class="eyebrow">
            {plan.phase} · {formatDate(plan.weekStart)} 起
          </p>
          <h2>{plan.title}</h2>
          <p class="soft">{plan.focus}</p>
          <div class="row wrap">
            <span class="pill">{{ template: '起步模板', review: '来自每周复盘', user: '自己改过', seed: '初始计划' }[plan.source]}</span>
          </div>
        </div>
        {plan.changes?.length ? (
          <Callout icon="refresh">
            <p style={{ fontWeight: 700 }}>和上一周相比</p>
            <ul style={{ paddingLeft: '16px' }}>
              {plan.changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </Callout>
        ) : null}
        {scenes.map((sc) => (
          <div key={sc} class="stack tight">
            <p class="small" style={{ fontWeight: 700 }}>
              {SCENE_LABEL[sc] ?? sc}
            </p>
            <ul class="stack tight" style={{ paddingLeft: '18px' }}>
              {plan.rules
                .filter((r) => r.scene === sc)
                .map((r, i) => (
                  <li key={i} class="small">
                    {r.text}
                  </li>
                ))}
            </ul>
          </div>
        ))}
        <div class="target-grid">
          {tgt.map(([k, v]) => (
            <div class="t" key={k}>
              <span>{k}</span>
              <b>{v}</b>
            </div>
          ))}
        </div>
        <div class="btn-row">
          <button type="button" class="btn" onClick={() => openSheet('plan-edit')}>
            <Icon name="edit" />
            修改计划
          </button>
          <button type="button" class="btn ghost" onClick={() => (coachView.value = 'review')}>
            <Icon name="history" />
            每周复盘
          </button>
        </div>
      </section>

      <section class="card stack">
        <div class="section-head">
          <h2>本周任务</h2>
          <span class="small muted">
            {plan.tasks.filter((x) => x.done).length}/{plan.tasks.length}
          </span>
        </div>
        {plan.tasks.length ? (
          <ul class="list">
            {plan.tasks.map((x) => (
              <li class="list-row" key={x.id}>
                <button type="button" class="check-btn" aria-pressed={x.done} aria-label={x.done ? '标记未完成' : '标记完成'} onClick={() => void togglePlanTask(x.id)}>
                  <Icon name="check" />
                </button>
                <span class="grow" style={x.done ? { color: 'var(--ink-3)', textDecoration: 'line-through' } : undefined}>
                  {x.text}
                </span>
                <button type="button" class="icon-btn" aria-label="删除任务" onClick={() => void removePlanTask(x.id)}>
                  <Icon name="x" size={18} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p class="small muted">还没有任务。比如：预约家医科、买一个弹力带。</p>
        )}
        <form
          class="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            void addPlanTask(draft.trim());
            setDraft('');
          }}
        >
          <input class="input" value={draft} placeholder="加一个本周任务" aria-label="新任务" onInput={(e) => setDraft((e.target as HTMLInputElement).value)} />
          <button type="submit" class="btn" disabled={!draft.trim()}>
            添加
          </button>
        </form>
      </section>

      <section class="card stack">
        <div class="section-head">
          <h2>记忆和计划怎么运作</h2>
        </div>
        <ol class="layers">
          <li>
            <span>
              <b>每天的记录</b>：打卡、练习、吃饭、运动，原样保存，是一切判断的依据。
            </span>
          </li>
          <li>
            <span>
              <b>记忆卡</b>：长期有用的事实和偏好（比如“咖啡会让胃更难受”）。教练提议，你确认才会写入，随时可以改。
            </span>
          </li>
          <li>
            <span>
              <b>每周复盘</b>：把一周的记录压成几句话和下周的调整。复盘越多，教练看得越远，又不用每次读完所有记录。
            </span>
          </li>
          <li>
            <span>
              <b>计划</b>：长期目标 → 阶段 → 本周规则和任务 → 今日节奏。每次复盘生成新版本，旧版本留在下面可以回看。
            </span>
          </li>
        </ol>
        <button type="button" class="btn sm ghost" style={{ justifySelf: 'start' }} onClick={() => go('record')}>
          <Icon name="target" />
          看长期目标
        </button>
      </section>

      {history.length ? (
        <section class="card stack">
          <div class="section-head">
            <h2>计划历史</h2>
          </div>
          <div>
            {history.map((p) => (
              <div class="history-item" key={p.id}>
                <button type="button" class="row between" style={{ border: 0, background: 'none', padding: 0, color: 'inherit', textAlign: 'left', width: '100%' }} aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? null : p.id)}>
                  <span>
                    <b>{p.title}</b>
                    <span class="xs muted" style={{ display: 'block' }}>
                      {formatDate(p.weekStart)} 起 · {p.phase}
                    </span>
                  </span>
                  <Icon name={open === p.id ? 'chev-d' : 'chev-r'} size={18} />
                </button>
                {open === p.id ? (
                  <ul class="stack tight small soft" style={{ paddingLeft: '18px', marginTop: '6px' }}>
                    {p.rules.map((r, i) => (
                      <li key={i}>
                        [{SCENE_LABEL[r.scene] ?? r.scene}] {r.text}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- review

function ReviewView() {
  const thisWeek = weekStartOf(today.value);
  const lastWeek = addDays(thisWeek, -7);
  const [week, setWeek] = useState(() => {
    const hint = reviewWeekHint.value;
    reviewWeekHint.value = null;
    if (hint === thisWeek || hint === lastWeek) return hint;
    return reviews.value.some((r) => r.weekStart === lastWeek) ? thisWeek : lastWeek;
  });
  const review = reviews.value.find((r) => r.weekStart === week);
  const stats = computeWeekStats(week, allDays.value, targets.value);
  const ready = aiReady();
  const past = reviews.value.filter((r) => r.weekStart !== week);
  return (
    <div class="stack loose">
      {!ready ? <AiUnavailable /> : null}
      <div class="range-row" role="group" aria-label="复盘哪一周">
        <button type="button" class="chip" aria-pressed={week === lastWeek} onClick={() => setWeek(lastWeek)}>
          上周 {formatDate(lastWeek)}–{formatDate(addDays(lastWeek, 6))}
        </button>
        <button type="button" class="chip" aria-pressed={week === thisWeek} onClick={() => setWeek(thisWeek)}>
          本周到今天
        </button>
      </div>
      {review ? (
        <ReviewCard review={review} />
      ) : (
        <section class="card stack">
          <div class="section-head">
            <h2>
              {formatDate(week)}–{formatDate(addDays(week, 6))}
            </h2>
            <span class="small muted">有记录 {stats.days}/7 天</span>
          </div>
          <p class="small soft">{statsLine(stats)}</p>
          {stats.days < 3 ? <Callout>这一周记录不多，复盘会以“先把记录做起来”为主。</Callout> : null}
          {ready ? (
            <button type="button" class="btn primary" style={{ justifySelf: 'start' }} disabled={reviewBusy.value} onClick={() => void runReview(week)}>
              {reviewBusy.value ? <span class="spinner" /> : <Icon name="sparkle" />}
              {reviewBusy.value ? '正在复盘，大约一两分钟' : '开始复盘'}
            </button>
          ) : null}
          {reviewError.value ? <p class="small" style={{ color: 'var(--critical)' }}>{reviewError.value}</p> : null}
        </section>
      )}
      {past.length ? (
        <section class="card stack">
          <div class="section-head">
            <h2>以前的复盘</h2>
          </div>
          {past.map((r) => (
            <button type="button" key={r.id} class="history-item" style={{ border: 0, background: 'none', textAlign: 'left', color: 'inherit', padding: '10px 0' }} onClick={() => setWeek(r.weekStart)}>
              <b>
                {formatDate(r.weekStart)}–{formatDate(r.weekEnd)}
              </b>
              <span class="small soft">{r.summary}</span>
            </button>
          ))}
        </section>
      ) : null}
    </div>
  );
}

const DECISION = { advance: '前进一步', hold: '保持', 'step-back': '退一步' } as const;

function ReviewCard({ review }: { review: Review }) {
  const [reflection, setReflection] = useState(review.reflection ?? '');
  const [busy, setBusy] = useState(false);
  const adopted = !!review.nextPlanId;
  const prop = review.proposal;
  const list = (title: string, items: string[]) =>
    items.length ? (
      <div class="stack tight">
        <p class="small" style={{ fontWeight: 700 }}>
          {title}
        </p>
        <ul class="stack tight small" style={{ paddingLeft: '18px' }}>
          {items.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
    ) : null;
  return (
    <section class="card pad-lg stack">
      <p class="eyebrow">
        {formatDate(review.weekStart)}–{formatDate(review.weekEnd)} 复盘
      </p>
      <p class="display" style={{ fontSize: 'var(--t-lg)', lineHeight: 1.6 }}>
        {review.summary}
      </p>
      {review.referral ? <Callout tone="warn">{review.referral}</Callout> : null}
      {list('做得好的', review.wins)}
      {list('卡住的地方', review.struggles)}
      {list('从数据里看到的', review.insights)}
      {review.erp ? (
        <p class="small">
          <b>ERP：{DECISION[review.erp.decision]}</b> · {review.erp.rationale}
        </p>
      ) : null}
      {prop ? (
        <div class="card flat stack">
          <p class="eyebrow">下周计划提议</p>
          <p style={{ fontWeight: 700 }}>{prop.title}</p>
          <p class="small soft">{prop.focus}</p>
          {review.changes?.length ? list('改了什么', review.changes) : null}
          <ul class="stack tight small" style={{ paddingLeft: '18px' }}>
            {prop.rules.map((r, i) => (
              <li key={i}>
                [{SCENE_LABEL[r.scene] ?? r.scene}] {r.text}
              </li>
            ))}
          </ul>
          {prop.tasks.length ? list('任务', prop.tasks) : null}
          {adopted ? (
            <span class="pill good" style={{ justifySelf: 'start' }}>
              <Icon name="check" />
              已采用
            </span>
          ) : (
            <div class="btn-row">
              <button
                type="button"
                class="btn primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await adoptProposal(review);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Icon name="check" />
                采用为本周计划
              </button>
            </div>
          )}
        </div>
      ) : null}
      {review.memories?.length ? (
        <div class="stack tight">
          <p class="small" style={{ fontWeight: 700 }}>
            值得记住的
          </p>
          {review.memories.map((m, i) => (
            <div class="action-chip" key={i}>
              <Icon name="memory" />
              <span class="grow">
                （{m.category}）{m.text}
              </span>
              {m.state === 'accepted' ? (
                <span class="pill good">已记住</span>
              ) : m.state === 'dismissed' ? (
                <span class="pill">不用了</span>
              ) : (
                <span class="row">
                  <button type="button" class="btn sm primary" onClick={() => void resolveReviewMemory(review, i, true)}>
                    记住
                  </button>
                  <button type="button" class="btn sm ghost" onClick={() => void resolveReviewMemory(review, i, false)}>
                    不用
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      ) : null}
      <div class="stack tight">
        <p class="small" style={{ fontWeight: 700 }}>
          我自己的话
        </p>
        <textarea class="textarea" rows={3} value={reflection} placeholder="这一周你自己怎么看？" aria-label="我自己的话" onInput={(e) => setReflection((e.target as HTMLTextAreaElement).value)} />
        <button type="button" class="btn sm" style={{ justifySelf: 'start' }} disabled={reflection === (review.reflection ?? '')} onClick={() => void saveReflection(review, reflection)}>
          保存
        </button>
      </div>
      <button type="button" class="btn sm ghost" style={{ justifySelf: 'start' }} disabled={reviewBusy.value || !aiReady()} onClick={() => void runReview(review.weekStart)}>
        <Icon name="refresh" />
        重新复盘
      </button>
    </section>
  );
}

// ---------------------------------------------------------------- memory

function MemoryView() {
  const [filter, setFilter] = useState<MemoryCategory | 'all'>('all');
  const [text, setText] = useState('');
  const [cat, setCat] = useState<MemoryCategory>('生活');
  const all = memory.value.filter((m) => !m.archived);
  const counts = MEMORY_CATEGORIES.map((c) => [c, all.filter((m) => m.category === c).length] as const).filter(([, n]) => n > 0);
  const list = all
    .filter((m) => filter === 'all' || m.category === filter)
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt - a.createdAt);
  return (
    <div class="stack loose">
      <section class="card stack">
        <p class="small soft">教练记得的事。对话和复盘时都会用上。置顶的最优先；不对的可以直接改或删。</p>
        <form
          class="stack tight"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            void addMemory(text, cat);
            setText('');
          }}
        >
          <textarea class="textarea" rows={2} value={text} placeholder="例如：午睡穿紧身 T 恤更难受" aria-label="新的记忆" onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
          <div class="row wrap">
            <select class="select" style={{ width: 'auto' }} value={cat} aria-label="类别" onChange={(e) => setCat((e.target as HTMLSelectElement).value as MemoryCategory)}>
              {MEMORY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button type="submit" class="btn" disabled={!text.trim()}>
              <Icon name="plus" />
              记住
            </button>
          </div>
        </form>
      </section>
      {all.length ? (
        <>
          <div class="range-row" role="group" aria-label="按类别看">
            <button type="button" class="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
              全部 {all.length}
            </button>
            {counts.map(([c, n]) => (
              <button type="button" class="chip" key={c} aria-pressed={filter === c} onClick={() => setFilter(c)}>
                {c} {n}
              </button>
            ))}
          </div>
          <section class="card">
            {list.map((m) => (
              <MemoryRow key={m.id} m={m} />
            ))}
          </section>
        </>
      ) : (
        <div class="card">
          <Empty icon="memory" title="还没有记忆">
            你可以自己写，也可以在对话和复盘里让教练提议。
          </Empty>
        </div>
      )}
    </div>
  );
}

function MemoryRow({ m }: { m: MemoryItem }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.text);
  const [confirm, setConfirm] = useState(false);
  return (
    <div class="memory-card">
      <div class="stack tight">
        {editing ? (
          <textarea class="textarea" rows={2} value={text} aria-label="编辑记忆" onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
        ) : (
          <p>
            {m.pinned ? <Icon name="pin" size={14} /> : null} {m.text}
          </p>
        )}
        <span class="xs muted">
          {m.category} · {{ user: '你写的', ai: '教练提议', seed: '初始资料' }[m.source]} · {formatDate(new Date(m.createdAt).toISOString().slice(0, 10))}
        </span>
      </div>
      <div class="row">
        {editing ? (
          <button
            type="button"
            class="btn sm primary"
            onClick={async () => {
              await updateMemory(m.id, { text: text.trim() || m.text });
              setEditing(false);
            }}
          >
            保存
          </button>
        ) : (
          <>
            <button type="button" class="icon-btn" aria-label={m.pinned ? '取消置顶' : '置顶'} aria-pressed={!!m.pinned} onClick={() => void updateMemory(m.id, { pinned: !m.pinned })}>
              <Icon name="pin" />
            </button>
            <button type="button" class="icon-btn" aria-label="编辑" onClick={() => setEditing(true)}>
              <Icon name="edit" />
            </button>
            {confirm ? (
              <button type="button" class="btn sm danger" onClick={() => void removeMemory(m.id)}>
                删除
              </button>
            ) : (
              <button type="button" class="icon-btn" aria-label="删除" onClick={() => setConfirm(true)}>
                <Icon name="trash" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
