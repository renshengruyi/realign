import type { ErpSession, MealType } from '../domain/types';
import type { Spec } from './nav';
import { ExposureTool } from './tools/Exposure';
import { MealTool } from './tools/Meal';
import { MeditateTool } from './tools/Meditate';
import { NapTool } from './tools/Nap';
import { NightTool } from './tools/Night';
import { WorkoutTool } from './tools/Workout';

export function ToolHost({ spec }: { spec: Spec }) {
  const p = (spec.props ?? {}) as Record<string, unknown>;
  switch (spec.kind) {
    case 'exposure':
      return <ExposureTool kind={p.kind as ErpSession['kind'] | undefined} />;
    case 'nap':
      return <NapTool />;
    case 'night':
      return <NightTool />;
    case 'meditate':
      return <MeditateTool practice={p.practice as string | undefined} slot={p.slot as 'am' | 'pm' | undefined} />;
    case 'meal':
      return <MealTool type={p.type as MealType | undefined} />;
    case 'workout':
      return <WorkoutTool routine={p.routine as string | undefined} />;
    default:
      return null;
  }
}
