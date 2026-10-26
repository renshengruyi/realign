// The coach's moving parts: chat turns, the actions it proposes, weekly reviews
// that turn into next week's plan, and the memory it keeps.
import { signal } from '@preact/signals';
import { ACTIONS_SPEC, COACH_RULES, daysTable, parseReply, reviewPrompt, statsLine } from '../domain/ai';
import { addDays, formatDate, weekStartOf } from '../domain/dates';
import { DEFAULT_TARGETS } from '../domain/defaults';
import { computeWeekStats } from '../domain/metrics';
import type {
  ChatMsg,
  ChatThread,
  ISODate,
  MemoryCategory,
  MemoryItem,
  Plan,
  PlanProposal,
  PlanRule,
  ProposedAction,
  Review,
  Targets,
} from '../domain/types';
import { MEMORY_CATEGORIES } from '../domain/types';
import { aiLimits, activePlan, allDays, chats, deleteDocument, mergeDocument, notify, reviews, setDocument, targets, today } from '../platform/store';
import { aiMessage, askJson, askText, currentContext, isCancel } from '../platform/ai-client';
import type { SampleTool } from '../platform/claude';
import { newId } from '../platform/localdb';
import { applyLogPatch } from './logs';
import { addPlanTask, adoptPlan } from './planning';

// ---------------------------------------------------------------- chat

export const activeThreadId = signal<string | null>(null);
export const streaming = signal<{ threadId: string; text: string } | null>(null);
export const chatError = signal('');
let controller: AbortController | null = null;

const MAX_THREAD_BYTES = 180_000;

export function currentThread(): ChatThread | undefined {
  const id = activeThreadId.value;
  if (id?.startsWith('new-')) return undefined;
  return (id ? chats.value.find((c) => c.id === id) : undefined) ?? chats.value[0];
}

export function newThread() {
  activeThreadId.value = `new-${Date.now()}`;
}

function titleFrom(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 18 ? `${t.slice(0, 18)}…` : t;
}

async function saveThread(thread: ChatThread, isNew: boolean) {
  const body = thread as unknown as Record<string, unknown>;
  if (isNew) await setDocument(`chats/${thread.id}`, body);
  else await mergeDocument(`chats/${thread.id}`, { messages: thread.messages, updatedAt: thread.updatedAt, title: thread.title });
}

function readTools(): SampleTool[] | undefined {
  if (!aiLimits.value?.tools) return undefined;
  return [
    {
      name: 'get_days',
      description: '查询用户某个日期范围的逐日记录（睡眠、重铺、暴露练习、饮食、胃、精力、冥想、运动、体重）。返回每天一行的文字。范围最多 60 天。只在上下文里最近 14 天不够用时调用。',
      inputSchema: {
        type: 'object',
        properties: { from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' } },
        required: ['from', 'to'],
      },
      execute(input) {
        const from = String(input.from ?? '');
        let to = String(input.to ?? '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error('日期格式应为 YYYY-MM-DD');
        if (to < from) throw new Error('to 不能早于 from');
        if (addDays(from, 59) < to) to = addDays(from, 59);
        return daysTable(allDays.value, from, to);
      },
    },
  ];
}

export async function sendChat(text: string) {
  const content = text.trim();
  if (!content || streaming.value) return;
  chatError.value = '';
  const existing = currentThread();
  const isNew = !existing;
  let thread: ChatThread =
    existing
      ? { ...existing, messages: [...existing.messages] }
      : { id: newId('chat'), title: titleFrom(content), createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
  if (JSON.stringify(thread).length > MAX_THREAD_BYTES) {
    thread = { id: newId('chat'), title: titleFrom(content), createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
    notify('这段对话太长了，已开新对话。之前的内容教练会通过记忆和复盘记得。');
  }
  const userMsg: ChatMsg = { role: 'user', content, at: Date.now() };
  thread.messages.push(userMsg);
  thread.updatedAt = Date.now();
  activeThreadId.value = thread.id;
  await saveThread(thread, isNew || thread.messages.length === 1);

  const history = thread.messages.slice(-16).map((m) => ({ role: m.role, content: m.content || '（空）' }));
  const preamble = `${COACH_RULES}\n\n${ACTIONS_SPEC}\n\n${currentContext()}\n\n（以上是背景资料，不用复述。下面是对话。）`;
  controller = new AbortController();
  streaming.value = { threadId: thread.id, text: '' };
  try {
    const res = await askText([{ role: 'user', content: preamble }, ...history], {
      signal: controller.signal,
      cache: false,
      tools: readTools(),
      onText: ({ text: t }) => {
        streaming.value = { threadId: thread.id, text: t };
      },
    });
    const { display, actions } = parseReply(res?.text ?? '');
    thread.messages.push({ role: 'assistant', content: display, at: Date.now(), actions: actions.length ? actions : undefined });
  } catch (e) {
    const partial = (e as { text?: string })?.text;
    if (isCancel(e)) {
      if (partial) thread.messages.push({ role: 'assistant', content: parseReply(partial).display, at: Date.now(), error: '已停止' });
    } else {
      chatError.value = aiMessage(e);
      if (partial) thread.messages.push({ role: 'assistant', content: parseReply(partial).display, at: Date.now(), error: '回答中断了' });
    }
  } finally {
    streaming.value = null;
    controller = null;
  }
  thread.updatedAt = Date.now();
  await saveThread(thread, false);
}

export function stopChat() {
  controller?.abort();
}

export async function resolveAction(thread: ChatThread, msgIndex: number, action: ProposedAction, accept: boolean) {
  if (accept) {
    if (action.type === 'memory') await addMemory(action.text, action.category, 'ai');
    else if (action.type === 'task') await addPlanTask(action.text);
    else if (action.type === 'log') await applyLogPatch(action.date, action.patch);
    notify(action.type === 'memory' ? '记住了' : action.type === 'task' ? '已加到本周计划' : '已记录', 'success');
  }
  const messages = thread.messages.map((m, i) =>
    i === msgIndex ? { ...m, actions: m.actions?.map((a) => (a.id === action.id ? { ...a, state: accept ? ('accepted' as const) : ('dismissed' as const) } : a)) } : m,
  );
  await mergeDocument(`chats/${thread.id}`, { messages });
}

export async function deleteThread(id: string) {
  await deleteDocument(`chats/${id}`);
  if (activeThreadId.value === id) activeThreadId.value = null;
}

// ---------------------------------------------------------------- memory

export async function addMemory(text: string, category: MemoryCategory, source: MemoryItem['source'] = 'user') {
  const item: MemoryItem = { id: newId('mem'), text: text.trim(), category, source, createdAt: Date.now() };
  await setDocument(`memory/${item.id}`, item as unknown as Record<string, unknown>);
}

export async function updateMemory(id: string, patch: Partial<MemoryItem>) {
  await mergeDocument(`memory/${id}`, { ...patch, updatedAt: Date.now() });
}

export async function removeMemory(id: string) {
  await deleteDocument(`memory/${id}`);
}

// ---------------------------------------------------------------- weekly review

export const reviewBusy = signal(false);
export const reviewError = signal('');

interface RawReview {
  summary?: unknown;
  wins?: unknown;
  struggles?: unknown;
  insights?: unknown;
  erp?: { decision?: unknown; rationale?: unknown };
  nextWeek?: { title?: unknown; phase?: unknown; focus?: unknown; rules?: unknown; targets?: unknown; tasks?: unknown };
  changes?: unknown;
  memories?: unknown;
  referral?: unknown;
}

const strs = (v: unknown, max = 6) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, max) : []);
const SCENES = ['night', 'nap', 'day', 'base', 'body', 'mind'];
const TARGET_KEYS = Object.keys(DEFAULT_TARGETS) as (keyof Targets)[];

export function cleanProposal(raw: RawReview['nextWeek'], fallback: Plan): PlanProposal {
  const rules: PlanRule[] = (Array.isArray(raw?.rules) ? raw!.rules : [])
    .map((r) => r as { scene?: unknown; text?: unknown })
    .filter((r) => r && typeof r.text === 'string' && r.text.trim())
    .map((r) => ({ scene: (SCENES.includes(String(r.scene)) ? r.scene : 'base') as PlanRule['scene'], text: String(r.text).trim() }));
  const t: Partial<Targets> = {};
  if (raw?.targets && typeof raw.targets === 'object') {
    for (const [k, v] of Object.entries(raw.targets as Record<string, unknown>)) {
      if (!TARGET_KEYS.includes(k as keyof Targets)) continue;
      if (k === 'wakeTime' || k === 'bedTime') {
        if (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v)) (t as Record<string, unknown>)[k] = v;
      } else if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 600) (t as Record<string, unknown>)[k] = v;
    }
  }
  return {
    title: String(raw?.title ?? '').trim() || fallback.title,
    phase: String(raw?.phase ?? '').trim() || fallback.phase,
    focus: String(raw?.focus ?? '').trim() || fallback.focus,
    rules: rules.length ? rules : fallback.rules,
    targets: t,
    tasks: strs(raw?.tasks, 8),
  };
}

/** Reviews the week starting `weekStart` and stores the review. */
export async function runReview(weekStart: ISODate) {
  if (reviewBusy.value) return;
  reviewBusy.value = true;
  reviewError.value = '';
  const weekEnd = addDays(weekStart, 6);
  const stats = computeWeekStats(weekStart, allDays.value, targets.value);
  const label = `${formatDate(weekStart)}–${formatDate(weekEnd)}`;
  const prev = reviews.value.find((r) => r.weekStart < weekStart);
  try {
    const raw = await askJson<RawReview>(
      reviewPrompt(currentContext(21), label, statsLine(stats), daysTable(allDays.value, weekStart, weekEnd < today.value ? weekEnd : today.value), prev),
      { modelTier: 'complex', cache: false },
    );
    const plan = activePlan.value;
    const decision = String(raw?.erp?.decision ?? '');
    const review: Review = {
      id: weekStart,
      weekStart,
      weekEnd,
      createdAt: Date.now(),
      stats,
      summary: String(raw?.summary ?? '').trim() || '这一周的记录还不多。',
      wins: strs(raw?.wins),
      struggles: strs(raw?.struggles),
      insights: strs(raw?.insights),
      erp:
        decision === 'advance' || decision === 'hold' || decision === 'step-back'
          ? { decision, rationale: String(raw?.erp?.rationale ?? '').trim() }
          : undefined,
      changes: strs(raw?.changes, 8),
      referral: String(raw?.referral ?? '').trim() || undefined,
      proposal: cleanProposal(raw?.nextWeek, plan),
      memories: (Array.isArray(raw?.memories) ? raw!.memories : [])
        .map((m) => m as { text?: unknown; category?: unknown })
        .filter((m) => m && typeof m.text === 'string' && m.text.trim())
        .slice(0, 5)
        .map((m) => ({
          text: String(m.text).trim(),
          category: ((MEMORY_CATEGORIES as readonly string[]).includes(String(m.category)) ? m.category : '生活') as MemoryCategory,
          state: 'pending' as const,
        })),
    };
    await setDocument(`reviews/${review.id}`, review as unknown as Record<string, unknown>);
  } catch (e) {
    if (!isCancel(e)) reviewError.value = aiMessage(e);
  } finally {
    reviewBusy.value = false;
  }
}

/** Turns a review's proposal into the active plan. */
export async function adoptProposal(review: Review) {
  const prop = review.proposal;
  if (!prop) return;
  const current = activePlan.value;
  const weekStart = addDays(review.weekStart, 7) <= today.value ? weekStartOf(today.value) : addDays(review.weekStart, 7);
  const plan: Plan = {
    id: `${weekStart}-${newId()}`,
    weekStart,
    title: prop.title,
    phase: prop.phase,
    focus: prop.focus,
    rules: prop.rules,
    targets: { ...DEFAULT_TARGETS, ...current.targets, ...prop.targets },
    tasks: prop.tasks.map((text) => ({ id: newId('k'), text, done: false })),
    rationale: review.summary,
    changes: review.changes,
    source: 'review',
    status: 'active',
    createdAt: Date.now(),
  };
  await adoptPlan(plan);
  await mergeDocument(`reviews/${review.id}`, { nextPlanId: plan.id });
  notify('新计划已生效', 'success');
}

export async function resolveReviewMemory(review: Review, index: number, accept: boolean) {
  const m = review.memories?.[index];
  if (!m) return;
  if (accept) await addMemory(m.text, m.category, 'ai');
  const memories = review.memories!.map((x, i) => (i === index ? { ...x, state: accept ? ('accepted' as const) : ('dismissed' as const) } : x));
  await mergeDocument(`reviews/${review.id}`, { memories });
}

export async function saveReflection(review: Review, text: string) {
  await mergeDocument(`reviews/${review.id}`, { reflection: text });
}
