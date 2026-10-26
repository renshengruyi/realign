import { signal } from '@preact/signals';
import { briefPrompt } from '../domain/ai';
import type { Brief } from '../domain/types';
import { aiMessage, aiReady, askJson, currentContext, isCancel } from '../platform/ai-client';
import { patchDay, today } from '../platform/store';

export const briefBusy = signal(false);
export const briefError = signal('');

type Raw = { headline?: unknown; focus?: unknown; note?: unknown; caution?: unknown };

export function cleanBrief(r: Raw): Brief {
  const focus = (Array.isArray(r.focus) ? r.focus : [])
    .slice(0, 3)
    .map((f: { title?: unknown; why?: unknown }) => ({ title: String(f?.title ?? '').trim(), why: f?.why ? String(f.why).trim() : undefined }))
    .filter((f) => f.title);
  return {
    headline: String(r.headline ?? '').trim() || '今天照着计划走就好',
    focus,
    note: r.note ? String(r.note).trim() : undefined,
    caution: r.caution ? String(r.caution).trim() : undefined,
    generatedAt: Date.now(),
  };
}

export async function generateBrief() {
  if (!aiReady() || briefBusy.value) return;
  briefBusy.value = true;
  briefError.value = '';
  const date = today.value;
  try {
    const raw = await askJson<Raw>(briefPrompt(currentContext()), { cache: false });
    await patchDay(date, { brief: cleanBrief(raw ?? {}) });
  } catch (e) {
    if (!isCancel(e)) briefError.value = aiMessage(e);
  } finally {
    briefBusy.value = false;
  }
}
