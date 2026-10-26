// Writes to the active weekly plan. Until something changes it, the active plan
// is the built-in template and lives only in memory; the first edit stores it.
import type { Plan, Targets } from '../domain/types';
import { newId } from '../platform/localdb';
import { activePlan, mergeDocument, plans, setDocument } from '../platform/store';

export async function ensureActivePlan(): Promise<Plan> {
  const p = activePlan.value;
  if (plans.value.some((x) => x.id === p.id)) return p;
  const stored: Plan = { ...p, createdAt: p.createdAt || Date.now() };
  await setDocument(`plans/${stored.id}`, stored as unknown as Record<string, unknown>);
  await mergeDocument('meta/state', { activePlanId: stored.id, schema: 1 });
  return stored;
}

export async function updateActivePlan(patch: Partial<Plan>) {
  const p = await ensureActivePlan();
  await mergeDocument(`plans/${p.id}`, patch as Record<string, unknown>);
}

export async function setTargets(partial: Partial<Targets>) {
  const p = await ensureActivePlan();
  await mergeDocument(`plans/${p.id}`, { targets: partial });
}

export async function addPlanTask(text: string) {
  const p = await ensureActivePlan();
  await mergeDocument(`plans/${p.id}`, { tasks: [...p.tasks, { id: newId('k'), text, done: false }] });
}

export async function togglePlanTask(id: string) {
  const p = await ensureActivePlan();
  await mergeDocument(`plans/${p.id}`, { tasks: p.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) });
}

export async function removePlanTask(id: string) {
  const p = await ensureActivePlan();
  await mergeDocument(`plans/${p.id}`, { tasks: p.tasks.filter((t) => t.id !== id) });
}

/** Makes `plan` the active one and archives the plan it replaces. */
export async function adoptPlan(plan: Plan) {
  const old = activePlan.value;
  const id = plans.value.some((x) => x.id === plan.id) ? `${plan.weekStart}-${newId()}` : plan.id;
  if (plans.value.some((x) => x.id === old.id) && old.id !== id) {
    await mergeDocument(`plans/${old.id}`, { status: 'archived' });
  }
  await setDocument(`plans/${id}`, { ...plan, id, status: 'active' } as unknown as Record<string, unknown>);
  await mergeDocument('meta/state', { activePlanId: id, schema: 1 });
}
