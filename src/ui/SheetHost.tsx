import type { SealKey } from '../domain/metrics';
import type { Meal, MealType } from '../domain/types';
import type { Spec } from './nav';
import { EveningCheckin, MorningCheckin } from './sheets/Checkins';
import { HierarchySheet } from './sheets/Erp';
import { MealSheet, MoveSheet, RoutinesSheet, SealSheet, ShutdownSheet, TuinaSheet, WeightSheet } from './sheets/Logs';
import { PlanEditSheet } from './sheets/PlanSheets';
import { RecordSheets } from './sheets/RecordSheets';
import { RhythmSheet } from './sheets/Rhythm';
import { SitStandSheet } from './tools/SitStand';

export function SheetHost({ spec }: { spec: Spec }) {
  const p = (spec.props ?? {}) as Record<string, unknown>;
  switch (spec.kind) {
    case 'checkin-am':
      return <MorningCheckin />;
    case 'checkin-pm':
      return <EveningCheckin />;
    case 'meal':
      return <MealSheet type={p.type as MealType | undefined} meal={p.meal as Meal | undefined} date={p.date as string | undefined} />;
    case 'move':
      return <MoveSheet kind={p.kind as never} minutes={p.minutes as number | undefined} />;
    case 'weight':
      return <WeightSheet />;
    case 'tuina':
      return <TuinaSheet />;
    case 'seal':
      return <SealSheet k={p.key as SealKey} />;
    case 'shutdown':
      return <ShutdownSheet />;
    case 'routines':
      return <RoutinesSheet />;
    case 'rhythm':
      return <RhythmSheet />;
    case 'hierarchy':
      return <HierarchySheet />;
    case 'sitstand':
      return <SitStandSheet />;
    case 'plan-edit':
      return <PlanEditSheet />;
    default:
      return <RecordSheets spec={spec} />;
  }
}
