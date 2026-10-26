import { signal } from '@preact/signals';

export type Tab = 'today' | 'practice' | 'trends' | 'record' | 'coach';

export const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: '今天', icon: 'today' },
  { id: 'practice', label: '练习', icon: 'practice' },
  { id: 'trends', label: '趋势', icon: 'trends' },
  { id: 'record', label: '档案', icon: 'record' },
  { id: 'coach', label: '教练', icon: 'coach' },
];

function initialTab(): Tab {
  try {
    const h = location.hash.replace('#', '');
    if (TABS.some((t) => t.id === h)) return h as Tab;
  } catch {
    /* no location in tests */
  }
  return 'today';
}

export const tab = signal<Tab>(initialTab());

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const t = initialTab();
    if (t !== tab.value) tab.value = t;
  });
}

export function go(t: Tab) {
  tab.value = t;
  try {
    history.replaceState(null, '', `#${t}`);
  } catch {
    /* sandboxed */
  }
  window.scrollTo({ top: 0 });
}

export interface Spec {
  kind: string;
  props?: Record<string, unknown>;
}

/** A bottom sheet (forms, editors). */
export const sheet = signal<Spec | null>(null);
/** A full-screen tool (timers, guided sessions). */
export const tool = signal<Spec | null>(null);

export function openSheet(kind: string, props?: Record<string, unknown>) {
  sheet.value = { kind, props };
}

export function closeSheet() {
  sheet.value = null;
}

export function openTool(kind: string, props?: Record<string, unknown>) {
  sheet.value = null;
  tool.value = { kind, props };
}

export function closeTool() {
  tool.value = null;
}

/** Text to drop into the coach's input when switching to the coach tab. */
export const coachDraft = signal('');
export const coachView = signal<'chat' | 'plan' | 'review' | 'memory'>('chat');

export function askCoach(text: string) {
  coachDraft.value = text;
  coachView.value = 'chat';
  go('coach');
}
