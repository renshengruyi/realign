// Everything the app tells Claude: the coach's standing rules, a compact text
// picture of the person's data, and parsers for what comes back.
import { addDays, ageFrom, formatDate, rangeDates, shortDate, weekdayLabel } from './dates';
import { MEAL_LABEL, SCENE_LABEL } from './defaults';
import {
  completedExposures,
  meditationMinutes,
  moveMinutes,
  nightRefits,
  sessionPeak,
  sleepHours,
  slowMeals,
  type DayMap,
} from './metrics';
import type {
  CheckItem,
  CheckupRecord,
  DayDoc,
  Goal,
  ISODate,
  MemoryCategory,
  MemoryItem,
  Plan,
  Profile,
  ProposedAction,
  Review,
  Ritual,
  Targets,
  Trigger,
  WeekStats,
} from './types';
import { MEMORY_CATEGORIES } from './types';
import { bmi, round1 } from './units';

export const COACH_RULES = `你是「回正」健康管理应用里的教练。用户把你当作 ERP（暴露与反应阻止）/ CBT 治疗师和健康管家，也清楚你不能替代面对面的医生和持证治疗师。

说话方式
- 简体中文，口语、直接、温暖，不说教，不堆术语。
- 先回答，再给 1–3 个具体可做的建议。能引用记录里的数字就引用。
- 一般 80–200 字；用户要详细时再展开。可以用简短的列表。

原则
- ERP：目标不是让不适感消失，而是不做仪式也能照常生活、照样睡着。“卡着也睡着了”才是真正的进展，运气好的晚上不算。
- 不给反复的安慰保证。用户一再追问“会不会有事”“是不是没救了”这类问题时，温和地指出这可能是在寻求确认，把注意力带回行为和计划。
- 不建议靠换被子、衣服、铺法或环境去躲开那个感觉。选舒服的材质可以，但为了让感觉“对”而反复换东西、找“正确”的东西，是换了形式的回避；这类念头可以写进触发清单，变成练习素材。
- 用词统一：夜里下床重新铺被子、调整衣服叫“重铺”；睡不着超过 20 分钟离开床叫“离床”。
- 睡眠：固定起床时间；躺 20 分钟还在较劲就离床；白天补觉不超过 20 分钟；床头不看时间。
- 饮食：照顾胃、帮助增重。少量多餐、细嚼慢咽、七分饱；晚餐离上床 3 小时以上；饭后不立刻平躺。
- 运动：先体态和轻力量，循序渐进，痛就停。
- 不做诊断、不开药。出现这些情况，明确建议尽快就医：体重持续下降、黑便或吐血、吞咽困难、持续或剧烈腹痛、尿血或排尿困难、发烧、胸痛、严重失眠影响安全。情绪低落到有伤害自己的念头时，建议立刻联系身边的人，并拨打台湾安心专线 1925。
- 只根据记录下结论。数据不够就直说，并说清楚要记什么。

记录里的“重铺”指夜里下床重新铺被子或调整衣服的次数；“不适”和触发清单的难受分都是 0–10 分；“精力”“心情”是 1–5 分。`;

export const ACTIONS_SPEC = `如果对话里出现：值得长期记住的事实或偏好、应该加进本周计划的任务、或者用户口头报告了可以记下来的数据，就在回复最后附一个代码块（没有就不附）：
\`\`\`actions
[{"type":"memory","text":"喝咖啡后胃更不舒服","category":"饮食"},
 {"type":"task","text":"本周三前预约家医科抽血"},
 {"type":"log","date":"YYYY-MM-DD","summary":"昨晚起来重铺 3 次","patch":{"sleep":{"refits":3}}}]
\`\`\`
category 只能是：${MEMORY_CATEGORIES.join('、')}。log 的 patch 只用这些字段：sleep{bedtime,latencyMin,refits,maxDiscomfort,stuckButSlept,nocturia,wakeTime,quality}、nap{done,adjustments,maxDiscomfort,slept}、energy{am,pm}、mood、gut{discomfort,symptoms}、habits{meditateAmMin,meditatePmMin,exerciseMin,walkMin,postureMin,readMin,social}、weightKg。时间用 "HH:MM"。用户会逐条确认，不会自动生效。`;

export interface ContextInput {
  today: ISODate;
  nowHM: string;
  profile: Profile;
  plan: Plan;
  targets: Targets;
  goals: Goal[];
  memory: MemoryItem[];
  days: DayMap;
  reviews: Review[];
  checkplan: CheckItem[];
  checkups: CheckupRecord[];
  triggers: Trigger[];
  rituals: Ritual[];
  latestWeightKg?: number;
}

const n1 = (v: number | undefined) => (v === undefined ? '' : String(round1(v)));

export function dayLine(date: ISODate, d: DayDoc | undefined): string {
  const head = `${shortDate(date)} ${weekdayLabel(date)}`;
  if (!d) return `${head}｜无记录`;
  const parts: string[] = [];
  const s = d.sleep;
  if (s) {
    const bits = [
      s.bedtime || s.wakeTime ? `${s.bedtime ?? '?'}→${s.wakeTime ?? '?'}` : '',
      s.latencyMin !== undefined ? `入睡${s.latencyMin}分` : '',
      sleepHours(s) !== undefined ? `约${n1(sleepHours(s))}时` : '',
      nightRefits(d) !== undefined ? `重铺${nightRefits(d)}` : '',
      s.maxDiscomfort !== undefined ? `不适${s.maxDiscomfort}` : '',
      s.stuckButSlept ? '卡着也睡着' : '',
      s.leftBed ? '用了离床规则' : '',
      s.nocturia ? `起夜${s.nocturia}` : '',
      s.quality ? `质量${s.quality}` : '',
      s.tired ? '累' : '',
    ].filter(Boolean);
    if (bits.length) parts.push(`睡 ${bits.join(' ')}`);
  } else if (d.urges?.length) {
    parts.push(`睡 夜间冲动${d.urges.length}次 起来${nightRefits(d)}`);
  }
  if (d.nap?.done) {
    parts.push(
      `午睡 调${d.nap.adjustments ?? '?'} 不适${d.nap.maxDiscomfort ?? '?'} ${d.nap.slept === 'yes' ? '睡着' : d.nap.slept === 'light' ? '浅睡' : '没睡着'}`,
    );
  }
  for (const e of completedExposures(d)) {
    const first = e.ratings[0]?.v;
    const last = e.ratings[e.ratings.length - 1]?.v;
    parts.push(
      `暴露${e.kind === 'imperfect-bed' ? '(铺不好)' : ''} ${first ?? '?'}→${last ?? '?'} 峰值${sessionPeak(e) ?? '?'}${e.predicted !== undefined ? ` 预测${e.predicted}` : ''}${e.moved ? ` 动了${e.moved}次` : ''}`,
    );
  }
  if (d.meals?.length) {
    const late = d.meals.filter((m) => m.type === 'dinner').map((m) => m.time)[0];
    parts.push(`吃${d.meals.length}次 慢${slowMeals(d)}${late ? ` 晚餐${late}` : ''}`);
  }
  if (d.gut) parts.push(`胃${d.gut.discomfort ?? '?'}${d.gut.symptoms?.length ? ' ' + d.gut.symptoms.join('/') : ''}`);
  if (d.energy) parts.push(`精力${d.energy.am ?? '?'}/${d.energy.pm ?? '?'}`);
  if (d.mood) parts.push(`心情${d.mood}`);
  const med = meditationMinutes(d);
  const move = moveMinutes(d);
  const hb = [med ? `冥想${med}分` : '', move ? `活动${move}分` : '', d.stand?.breaks ? `站${d.stand.breaks}次` : '', d.habits?.readMin ? `阅读${d.habits.readMin}分` : '', d.habits?.social ? '有社交' : ''].filter(Boolean);
  if (hb.length) parts.push(hb.join(' '));
  if (d.weightKg) parts.push(`体重${n1(d.weightKg)}kg`);
  if (d.tuina?.done) parts.push('推拿');
  if (d.journal?.hard) parts.push(`难处：${d.journal.hard.slice(0, 40)}`);
  if (d.sleep?.note) parts.push(`备注：${d.sleep.note.slice(0, 40)}`);
  return parts.length ? `${head}｜${parts.join('｜')}` : `${head}｜无记录`;
}

/** One line per day; a run of days with nothing logged becomes one line. */
export function daysTable(days: DayMap, from: ISODate, to: ISODate): string {
  const lines: string[] = [];
  let gap: ISODate[] = [];
  const flush = () => {
    if (!gap.length) return;
    lines.push(gap.length === 1 ? dayLine(gap[0], undefined) : `${shortDate(gap[0])}–${shortDate(gap[gap.length - 1])}｜无记录（${gap.length} 天）`);
    gap = [];
  };
  for (const d of rangeDates(from, to)) {
    const line = dayLine(d, days[d]);
    if (line.endsWith('｜无记录')) gap.push(d);
    else {
      flush();
      lines.push(line);
    }
  }
  flush();
  return lines.join('\n');
}

export function statsLine(s: WeekStats): string {
  const items = [
    `有记录 ${s.days}/7 天`,
    s.sleepHours !== undefined ? `睡眠约 ${n1(s.sleepHours)} 小时` : '',
    s.latencyMin !== undefined ? `入睡 ${Math.round(s.latencyMin)} 分钟` : '',
    s.refitsAvg !== undefined ? `每晚重铺 ${n1(s.refitsAvg)} 次（守住上限 ${s.capKeptNights}/${s.refitNights} 晚）` : '',
    s.stuckButSlept ? `卡着也睡着 ${s.stuckButSlept} 晚` : '',
    `暴露练习 ${s.exposures} 次${s.predictionGap !== undefined ? `，预测平均高估 ${n1(s.predictionGap)} 分` : ''}`,
    `午睡训练 ${s.naps} 次`,
    s.mealsAvg !== undefined ? `每天吃 ${n1(s.mealsAvg)} 次、细嚼慢咽 ${n1(s.slowMealsAvg)} 次` : '',
    s.gutAvg !== undefined ? `胃部不适 ${n1(s.gutAvg)}（≥4 分 ${s.gutBadDays} 天）` : '',
    s.energyAm !== undefined || s.energyPm !== undefined ? `精力 早${n1(s.energyAm)}/午${n1(s.energyPm)}` : '',
    `冥想 ${s.meditationMin} 分钟`,
    `活动 ${s.moveMin} 分钟、力量训练 ${s.exerciseSessions} 次`,
    `按时起床 ${s.wakeOnTime} 天`,
    s.weightKg ? `体重 ${n1(s.weightKg)} kg` : '',
  ].filter(Boolean);
  return items.join('；');
}

export function planText(plan: Plan, t: Targets): string {
  const rules = plan.rules.map((r) => `- [${SCENE_LABEL[r.scene] ?? r.scene}] ${r.text}`).join('\n');
  const tasks = plan.tasks.length ? plan.tasks.map((x) => `- [${x.done ? 'x' : ' '}] ${x.text}`).join('\n') : '（无）';
  return `${plan.title}（${plan.phase}，${formatDate(plan.weekStart)} 起）
本周重点：${plan.focus}
规则：
${rules}
目标：起床 ${t.wakeTime}、上床 ${t.bedTime}；每晚最多重铺 ${t.refitCap} 次；暴露练习每周 ${t.exposurePerWeek} 次、每次 ${t.exposureMin} 分钟；午睡训练 ${t.napMin} 分钟；每天吃 ${t.mealsPerDay} 次、细嚼慢咽 ${t.slowMealsPerDay} 次；冥想 ${t.meditationMin} 分钟；活动 ${t.moveMin} 分钟；力量训练每周 ${t.exercisePerWeek} 次；坐 ${t.sitMin} 分钟站 ${t.standMin} 分钟；专注 ${t.focusBlocks} 段。
任务：
${tasks}`;
}

export function profileText(p: Profile, latestWeightKg?: number, today?: ISODate): string {
  const age = ageFrom(p.birthYear, today ? new Date(today) : undefined);
  const b = bmi(latestWeightKg, p.heightCm);
  const basics = [
    age ? `${age} 岁` : '',
    p.sex === 'male' ? '男' : p.sex === 'female' ? '女' : '',
    p.heightCm ? `身高 ${p.heightCm} cm` : '',
    latestWeightKg ? `最近体重 ${n1(latestWeightKg)} kg` : '',
    b ? `BMI ${n1(b)}` : '',
    p.goalWeightKg ? `目标体重 ${n1(p.goalWeightKg)} kg` : '',
  ].filter(Boolean);
  const conds = p.conditions.filter((c) => c.status !== 'resolved').map((c) => `${c.name}${c.note ? `（${c.note}）` : ''}`);
  return `${basics.join('，')}${conds.length ? `\n身体状况：${conds.join('；')}` : ''}`;
}

export function buildContext(c: ContextInput, opts: { days?: number } = {}): string {
  const span = opts.days ?? 14;
  const from = addDays(c.today, -(span - 1));
  const mem = c.memory
    .filter((m) => !m.archived)
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt - a.createdAt)
    .slice(0, 60)
    .map((m) => `- [${m.category}] ${m.text}`)
    .join('\n');
  const reviews = c.reviews
    .slice(0, 3)
    .map((r) => `- ${formatDate(r.weekStart)} 那周：${r.summary}`)
    .join('\n');
  const goals = c.goals
    .filter((g) => g.status === 'active')
    .map((g) => `- ${g.title}：${g.baseline ?? '?'} → ${g.target} ${g.unit}`)
    .join('\n');
  const checks = c.checkplan
    .map((i) => `- ${i.dept}「${i.title}」：${{ todo: '未安排', booked: `已预约${i.date ? ' ' + i.date : ''}`, done: `已完成${i.date ? ' ' + i.date : ''}`, skipped: '暂不做' }[i.status]}`)
    .join('\n');
  const labs = c.checkups
    .slice(0, 2)
    .map((r) => {
      const flagged = r.results.filter((x) => x.flag === 'H' || x.flag === 'L').map((x) => `${x.name} ${x.value}${x.unit ?? ''}(${x.flag})`);
      return `- ${r.date} ${r.title}${flagged.length ? `：异常 ${flagged.join('、')}` : '：无异常标记'}`;
    })
    .join('\n');
  const trig = c.triggers
    .slice()
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    .map((t) => `- ${t.text}${t.score !== undefined ? ` ${t.score} 分` : ''}${t.status === 'done' ? '（已适应）' : t.status === 'practicing' ? '（练习中）' : ''}`)
    .join('\n');
  const rit = c.rituals.map((r) => `- ${r.text}（${{ active: '还在做', reducing: '在减少', dropped: '已放下' }[r.status]}）`).join('\n');

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `今天是 ${formatDate(c.today, { weekday: true, year: true })}，现在 ${c.nowHM}（当地时间 ${tz}）。

【用户】
${profileText(c.profile, c.latestWeightKg, c.today)}

【长期记忆】
${mem || '（还没有）'}

【长期目标】
${goals || '（还没有）'}

【本周计划】
${planText(c.plan, c.targets)}

【触发清单（0–10 难受分）】
${trig || '（还没填）'}

【处理动作清单】
${rit || '（还没填）'}

【最近 ${span} 天记录】
${daysTable(c.days, from, c.today)}

【最近的每周复盘】
${reviews || '（还没有）'}

【体检安排】
${checks || '（无）'}
${labs ? `\n【最近的检查结果】\n${labs}` : ''}`;
}

// ---------------------------------------------------------------- chat actions

const ACTIONS_RE = /```actions\s*([\s\S]*?)(```|$)/;

/** Splits a reply into the text to show and the proposed actions it carries. */
export function parseReply(text: string): { display: string; actions: ProposedAction[] } {
  const m = text.match(ACTIONS_RE);
  if (!m) return { display: text.trim(), actions: [] };
  const display = text.slice(0, m.index).trim();
  if (m[2] !== '```') return { display, actions: [] }; // still streaming
  let raw: unknown;
  try {
    raw = JSON.parse(m[1]);
  } catch {
    return { display, actions: [] };
  }
  const list = Array.isArray(raw) ? raw : [];
  const actions: ProposedAction[] = [];
  list.forEach((a, i) => {
    if (!a || typeof a !== 'object') return;
    const o = a as Record<string, unknown>;
    const id = `a${Date.now().toString(36)}${i}`;
    if (o.type === 'memory' && typeof o.text === 'string') {
      const category = (MEMORY_CATEGORIES as readonly string[]).includes(o.category as string)
        ? (o.category as MemoryCategory)
        : '生活';
      actions.push({ id, type: 'memory', text: o.text.slice(0, 300), category, state: 'pending' });
    } else if (o.type === 'task' && typeof o.text === 'string') {
      actions.push({ id, type: 'task', text: o.text.slice(0, 200), state: 'pending' });
    } else if (o.type === 'log' && typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date)) {
      const patch = sanitizePatch(o.patch);
      if (Object.keys(patch).length) {
        actions.push({ id, type: 'log', date: o.date, summary: String(o.summary ?? '记录'), patch, state: 'pending' });
      }
    }
  });
  return { display, actions };
}

const num = (v: unknown, lo: number, hi: number): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi ? n : undefined;
};
const hm = (v: unknown): string | undefined => (typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v) ? v.padStart(5, '0') : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);

function pick(o: unknown, fields: Record<string, (v: unknown) => unknown>): Record<string, unknown> | undefined {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, f] of Object.entries(fields)) {
    const v = f((o as Record<string, unknown>)[k]);
    if (v !== undefined) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Keeps only known day fields with sane values. */
export function sanitizePatch(raw: unknown): Partial<DayDoc> {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const sleep = pick(r.sleep, {
    bedtime: hm,
    wakeTime: hm,
    latencyMin: (v) => num(v, 0, 600),
    refits: (v) => num(v, 0, 50),
    maxDiscomfort: (v) => num(v, 0, 10),
    stuckButSlept: bool,
    leftBed: bool,
    nocturia: (v) => num(v, 0, 20),
    wakeups: (v) => num(v, 0, 20),
    quality: (v) => num(v, 1, 5),
    tired: bool,
  });
  if (sleep) out.sleep = sleep;
  const nap = pick(r.nap, {
    done: bool,
    adjustments: (v) => num(v, 0, 50),
    maxDiscomfort: (v) => num(v, 0, 10),
    durationMin: (v) => num(v, 0, 240),
    slept: (v) => (v === 'no' || v === 'light' || v === 'yes' ? v : undefined),
  });
  if (nap) out.nap = nap;
  const energy = pick(r.energy, { am: (v) => num(v, 1, 5), pm: (v) => num(v, 1, 5) });
  if (energy) out.energy = energy;
  const mood = num(r.mood, 1, 5);
  if (mood !== undefined) out.mood = mood;
  const gut = pick(r.gut, {
    discomfort: (v) => num(v, 0, 10),
    symptoms: (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 8) : undefined),
  });
  if (gut) out.gut = gut;
  const habits = pick(r.habits, {
    meditateAmMin: (v) => num(v, 0, 300),
    meditatePmMin: (v) => num(v, 0, 300),
    exerciseMin: (v) => num(v, 0, 600),
    walkMin: (v) => num(v, 0, 600),
    postureMin: (v) => num(v, 0, 300),
    readMin: (v) => num(v, 0, 900),
    social: bool,
    journal: bool,
  });
  if (habits) out.habits = habits;
  const w = num(r.weightKg, 25, 250);
  if (w !== undefined) out.weightKg = w;
  if (Array.isArray(r.meals)) {
    const meals = r.meals
      .map((m) =>
        pick(m, {
          time: hm,
          type: (v) => (v === 'breakfast' || v === 'lunch' || v === 'dinner' || v === 'snack' ? v : undefined),
          slow: bool,
          fullness: (v) => num(v, 1, 5),
          gutAfter: (v) => num(v, 0, 10),
          foods: (v) => (typeof v === 'string' ? v.slice(0, 120) : undefined),
          durationMin: (v) => num(v, 0, 180),
        }),
      )
      .filter((m): m is Record<string, unknown> => !!m && !!m.type && !!m.time);
    if (meals.length) out.meals = meals;
  }
  return out as Partial<DayDoc>;
}

export function describePatch(p: Partial<DayDoc>): string[] {
  const out: string[] = [];
  const s = p.sleep;
  if (s) {
    if (s.bedtime) out.push(`上床 ${s.bedtime}`);
    if (s.wakeTime) out.push(`起床 ${s.wakeTime}`);
    if (s.latencyMin !== undefined) out.push(`入睡 ${s.latencyMin} 分钟`);
    if (s.refits !== undefined) out.push(`重铺 ${s.refits} 次`);
    if (s.maxDiscomfort !== undefined) out.push(`最高不适 ${s.maxDiscomfort}`);
    if (s.stuckButSlept) out.push('卡着也睡着了');
    if (s.nocturia !== undefined) out.push(`起夜 ${s.nocturia} 次`);
    if (s.quality !== undefined) out.push(`睡眠质量 ${s.quality}`);
  }
  if (p.nap) out.push(`午睡训练${p.nap.adjustments !== undefined ? `，调整 ${p.nap.adjustments} 次` : ''}`);
  if (p.energy?.am) out.push(`早上精力 ${p.energy.am}`);
  if (p.energy?.pm) out.push(`下午精力 ${p.energy.pm}`);
  if (p.mood) out.push(`心情 ${p.mood}`);
  if (p.gut?.discomfort !== undefined) out.push(`胃部不适 ${p.gut.discomfort}`);
  if (p.gut?.symptoms?.length) out.push(p.gut.symptoms.join('、'));
  const h = p.habits;
  if (h?.meditateAmMin) out.push(`晨间冥想 ${h.meditateAmMin} 分钟`);
  if (h?.meditatePmMin) out.push(`睡前冥想 ${h.meditatePmMin} 分钟`);
  if (h?.exerciseMin) out.push(`运动 ${h.exerciseMin} 分钟`);
  if (h?.walkMin) out.push(`散步 ${h.walkMin} 分钟`);
  if (h?.postureMin) out.push(`体态 ${h.postureMin} 分钟`);
  if (h?.readMin) out.push(`阅读 ${h.readMin} 分钟`);
  if (h?.social) out.push('和人有交流');
  if (p.weightKg) out.push(`体重 ${round1(p.weightKg)} kg`);
  p.meals?.forEach((m) => out.push(`${m.time} ${MEAL_LABEL[m.type]}${m.slow ? '（慢慢吃）' : ''}${m.foods ? `：${m.foods}` : ''}`));
  return out;
}

// ---------------------------------------------------------------- one-shot prompts

export function briefPrompt(context: string): string {
  return `${COACH_RULES}

${context}

请写今天的简报。只回复一个 JSON 对象，不要别的文字：
{"headline":"一句话，20 字以内，说今天最该记住的事","focus":[{"title":"今天要做的一件事（具体到动作）","why":"一句话原因，引用数据更好"}],"note":"一句鼓励或提醒，30 字以内","caution":"如果记录里有需要就医或要注意的信号就写一句，没有就空字符串"}
focus 最多 3 条，按重要性排。依据昨晚的睡眠、本周计划和最近的趋势来选，不要泛泛而谈。`;
}

export function reviewPrompt(context: string, weekLabel: string, stats: string, table: string, prev?: Review): string {
  return `${COACH_RULES}

${context}

现在做「${weekLabel}」的每周复盘，并给出下一周的计划。
本周统计：${stats}
本周逐日：
${table}
${prev ? `上一次复盘的结论：${prev.summary}` : ''}

ERP 进阶参考：守住上限的晚上 ≥5 晚、暴露练习完成 ≥5 次且结束分数比开始低，可以前进一步（上限减 1，或从触发清单里选更难的情境，或加入“故意铺不好就躺下”）；不要用换被子、换衣服来降低难度；记录太少就先保持，把重点放在记录；明显变糟就退一步。连续几周完全没有松动，或焦虑明显加重，要在 referral 里建议面对面评估（身心科 / 精神科，或做 ERP 的临床心理师）。

只回复一个 JSON 对象，不要别的文字：
{"summary":"2–3 句总评","wins":["做得好的地方"],"struggles":["卡住的地方"],"insights":["从数据里看到的规律，没有就空数组"],"erp":{"decision":"advance|hold|step-back","rationale":"一句话"},"nextWeek":{"title":"这一周的主题，8 个字以内，不写第几周，例如：上限降到 1 次","phase":"阶段名，用大白话","focus":"一句话重点","rules":[{"scene":"night|nap|day|base|body|mind","text":"具体规则"}],"targets":{"refitCap":1,"exposurePerWeek":7,"mealsPerDay":5,"slowMealsPerDay":3,"meditationMin":20,"moveMin":30,"exercisePerWeek":3,"focusBlocks":4},"tasks":["本周要完成的具体任务"]},"changes":["和本周相比改了什么"],"memories":[{"text":"值得长期记住的新发现","category":"睡眠"}],"referral":"需要就医或面对面评估就写一句，否则空字符串"}
rules 要完整列出下一周的所有规则（不是只写变化），沿用的规则照抄。targets 只写要改的项。`;
}

export function quickLogPrompt(sentence: string, today: ISODate, nowHM: string): string {
  return `把用户的一句话变成健康记录。今天是 ${today}（${weekdayLabel(today)}），现在 ${nowHM}。
“昨晚”的睡眠记在今天的日期上（睡眠属于那一晚结束的早上）。拿不准的字段就不要填。

用户说：${sentence}

只回复一个 JSON 对象：
{"date":"YYYY-MM-DD","summary":"一句话复述","patch":{...},"unsure":["没听懂或需要确认的地方"]}
patch 可用字段：sleep{bedtime,wakeTime,latencyMin,refits,maxDiscomfort,stuckButSlept,nocturia,quality,tired}、nap{done,adjustments,maxDiscomfort,slept(no|light|yes)}、meals[{time,type(breakfast|lunch|dinner|snack),slow,fullness(1–5),gutAfter(0–10),foods}]、energy{am,pm}（1–5）、mood（1–5）、gut{discomfort(0–10),symptoms[反流|烧心|口苦|胀气|胃痛|恶心]}、habits{meditateAmMin,meditatePmMin,exerciseMin,walkMin,postureMin,readMin,social}、weightKg。
体重如果用“斤”，换算成公斤（1 斤 = 0.5 公斤）。时间用 "HH:MM" 24 小时制。`;
}

export function reportPrompt(): string {
  return `这些图片是一份体检或化验报告。把能看清的检查项目整理出来。
只回复一个 JSON 对象，不要别的文字：
{"date":"YYYY-MM-DD 或空字符串","place":"机构名或空字符串","title":"例如 血液检查","results":[{"name":"项目名（保留原文，常见缩写可加中文）","value":"数值或文字","unit":"单位","low":参考下限或null,"high":参考上限或null,"flag":"H|L|N|空字符串"}],"notes":"看不清或需要注意的地方"}
数值是数字时 value 写数字。不要猜看不清的值。`;
}

export function explainLabsPrompt(context: string, record: CheckupRecord): string {
  const rows = record.results
    .map((r) => `- ${r.name}: ${r.value}${r.unit ? ' ' + r.unit : ''}${r.low !== undefined || r.high !== undefined ? `（参考 ${r.low ?? ''}–${r.high ?? ''}）` : ''}${r.flag ? ` [${r.flag}]` : ''}`)
    .join('\n');
  return `${COACH_RULES}

${context}

用户的检查结果（${record.date} ${record.title}${record.place ? '，' + record.place : ''}）：
${rows}

用通俗的话解释：哪些正常、哪些偏高或偏低、可能和用户的哪些情况有关、下次看医生时可以问什么。不要下诊断，结尾提醒以医生解读为准。控制在 300 字以内。`;
}
