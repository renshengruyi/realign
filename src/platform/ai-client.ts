// Calls to Claude through the page's `sample` capability, with the viewer-facing
// message for each failure code. Nothing here retries on its own.
import { buildContext } from '../domain/ai';
import { nowHM } from '../domain/dates';
import { latestWeight } from '../domain/metrics';
import { errorCode, type SampleInput, type SampleOptions } from './claude';
import {
  activePlan,
  ai,
  aiBlocked,
  allDays,
  checkplan,
  checkups,
  goals,
  memory,
  profile,
  reviews,
  rituals,
  targets,
  today,
  triggers,
} from './store';

const MESSAGES: Record<string, string> = {
  not_granted: '还没允许这个页面使用 Claude。可以在页面右上角的权限菜单里打开。',
  sampling_disabled: '这个账号现在不能使用 Claude。',
  not_declared: '这个页面没有开启 AI 功能。',
  capability_disabled: '当前环境不能使用 AI。',
  capability_removed: '当前 App 版本不支持这个功能，更新后再试。',
  rate_limited: '用得有点频繁，过一会儿再试。',
  session_expired: '登录过期了，请重新登录 claude.ai。',
  refused: '这个问题没有得到回答，换个说法试试。',
  empty_completion: '没有得到回答，换个说法试试。',
  invalid_json: '回答的格式不对，再试一次。',
  prompt_too_large: '内容太长了，删减一些再试。',
  image_rejected: '图片识别不了，换一张清楚一点的。',
  images_unavailable: '当前环境不能发送图片。',
  tools_unavailable: '当前环境不支持查询更多记录。',
  unavailable_here: 'AI 只在 claude.ai 里打开这个页面时可用。',
  upstream_error: '连接中断了，再试一次。',
};

const PERMANENT = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed']);

export function aiMessage(e: unknown): string {
  return MESSAGES[errorCode(e)] ?? MESSAGES.upstream_error;
}

export function isCancel(e: unknown): boolean {
  return errorCode(e) === 'cancelled';
}

function fail(e: unknown): never {
  if (PERMANENT.has(errorCode(e))) aiBlocked.value = true;
  throw e;
}

export async function askText(input: SampleInput, opts?: SampleOptions) {
  const s = ai.value;
  if (!s) throw { code: 'unavailable_here', message: 'sample unavailable' };
  try {
    return await s(input, opts);
  } catch (e) {
    fail(e);
  }
}

export async function askJson<T>(input: SampleInput, opts?: SampleOptions): Promise<T> {
  const s = ai.value;
  if (!s) throw { code: 'unavailable_here', message: 'sample unavailable' };
  try {
    return await s.json<T>(input, opts);
  } catch (e) {
    fail(e);
  }
}

export function aiReady(): boolean {
  return !!ai.value && !aiBlocked.value;
}

export function currentContext(days = 14): string {
  return buildContext(
    {
      today: today.value,
      nowHM: nowHM(),
      profile: profile.value,
      plan: activePlan.value,
      targets: targets.value,
      goals: goals.value,
      memory: memory.value,
      days: allDays.value,
      reviews: reviews.value,
      checkplan: checkplan.value,
      checkups: checkups.value,
      triggers: triggers.value,
      rituals: rituals.value,
      latestWeightKg: latestWeight(allDays.value)?.kg,
    },
    { days },
  );
}
