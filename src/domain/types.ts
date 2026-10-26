// Data model for everything the app stores. One document per day keeps a day's
// logs together; small singleton documents hold profile, settings and lists.

export type ISODate = string; // "2026-10-26", local calendar date
export type HM = string; // "07:30", local wall-clock time

export type WeightUnit = 'jin' | 'kg';

export interface Condition {
  id: string;
  name: string;
  note?: string;
  status: 'active' | 'watch' | 'resolved';
}

export interface Profile {
  name?: string;
  birthYear?: number;
  sex?: 'male' | 'female' | 'other';
  heightCm?: number;
  goalWeightKg?: number;
  weightUnit: WeightUnit;
  conditions: Condition[];
  programStart?: ISODate;
  onboarded?: boolean;
  updatedAt?: number;
}

export interface Targets {
  mealsPerDay: number;
  slowMealsPerDay: number;
  meditationMin: number;
  moveMin: number;
  standBreaks: number;
  exposurePerWeek: number;
  exercisePerWeek: number;
  focusBlocks: number;
  readingMin: number;
  refitCap: number; // most times per night getting up to re-make the bed
  urgeDelayMin: number; // wait this long before acting on an urge
  napMin: number;
  exposureMin: number;
  sitMin: number;
  standMin: number;
  wakeTime: HM;
  bedTime: HM;
}

export type RhythmKind =
  | 'wake'
  | 'checkin-am'
  | 'meditate-am'
  | 'meal'
  | 'walk'
  | 'focus'
  | 'nap'
  | 'exposure'
  | 'exercise'
  | 'posture'
  | 'shutdown'
  | 'screen-off'
  | 'read'
  | 'meditate-pm'
  | 'checkin-pm'
  | 'bed'
  | 'tuina'
  | 'custom';

export interface RhythmItem {
  id: string;
  time: HM;
  title: string;
  kind: RhythmKind;
  /** 0 = Sunday … 6 = Saturday; absent means every day */
  days?: number[];
  durationMin?: number;
  mealType?: MealType;
  note?: string;
}

export interface Settings {
  sound: boolean;
  reminders: boolean;
  duskFilter: boolean; // warm, dimmer screen in the last hour before bed
  weighDay: number; // 0–6, the weekday to step on the scale
  introDone?: boolean;
  updatedAt?: number;
}

export interface SleepLog {
  bedtime?: HM;
  latencyMin?: number;
  refits?: number; // got up to re-make the bed / re-adjust clothes
  maxDiscomfort?: number; // 0–10
  stuckButSlept?: boolean; // fell asleep while it still felt wrong: the real win
  leftBed?: boolean; // used the 20-minute rule
  wakeups?: number;
  nocturia?: number;
  wakeTime?: HM;
  quality?: number; // 1–5
  tired?: boolean;
  note?: string;
  loggedAt?: number;
}

export interface NapLog {
  done: boolean;
  durationMin?: number;
  adjustments?: number;
  maxDiscomfort?: number;
  slept?: 'no' | 'light' | 'yes';
  note?: string;
  at?: number;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface Meal {
  id: string;
  time: HM;
  type: MealType;
  durationMin?: number;
  slow?: boolean;
  fullness?: number; // 1 still hungry … 3 just right … 5 stuffed
  gutAfter?: number; // 0–10
  protein?: boolean;
  foods?: string;
  note?: string;
}

export interface Rating {
  t: number; // seconds from start
  v: number; // 0–10
}

export interface ErpSession {
  id: string;
  kind: 'exposure' | 'imperfect-bed';
  triggerId?: string;
  triggerText?: string;
  startedAt: number;
  durationSec: number;
  plannedMin: number;
  predicted?: number;
  fear?: string;
  ratings: Rating[];
  moved?: number;
  outcome?: string;
  learned?: string;
  completed: boolean;
}

export interface UrgeEvent {
  id: string;
  at: number;
  startScore?: number;
  endScore?: number;
  decision: 'stayed' | 'got-up' | 'left-room';
  delaySec?: number;
}

export interface GutLog {
  discomfort?: number; // 0–10
  symptoms?: string[];
  note?: string;
}

export interface Habits {
  meditateAmMin?: number;
  meditatePmMin?: number;
  exerciseMin?: number;
  exerciseKind?: string;
  postureMin?: number;
  walkMin?: number;
  readMin?: number;
  journal?: boolean;
  social?: boolean;
  socialNote?: string;
  sunlight?: boolean;
  screenOff?: boolean;
  shutdown?: boolean;
}

export interface ThoughtRecord {
  situation?: string;
  thought?: string;
  feeling?: string;
  intensity?: number;
  evidenceFor?: string;
  evidenceAgainst?: string;
  alternative?: string;
}

export interface Journal {
  win?: string;
  hard?: string;
  tomorrow?: string;
  free?: string;
  worries?: string;
  thought?: ThoughtRecord;
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Brief {
  headline: string;
  focus: { title: string; why?: string }[];
  note?: string;
  caution?: string;
  generatedAt: number;
}

export interface TuinaLog {
  done: boolean;
  areas?: string[];
  feeling?: number; // 1–5
  note?: string;
}

export interface DayDoc {
  date: ISODate;
  sleep?: SleepLog; // the night that ended on this date's morning
  nap?: NapLog;
  meals?: Meal[];
  erp?: ErpSession[];
  urges?: UrgeEvent[]; // night urges of the night that ends on this date
  energy?: { am?: number; pm?: number };
  mood?: number;
  gut?: GutLog;
  habits?: Habits;
  stand?: { breaks?: number; focusBlocks?: number };
  weightKg?: number;
  screenMin?: number;
  journal?: Journal;
  top3?: TodoItem[];
  checks?: Record<string, boolean>;
  brief?: Brief;
  tuina?: TuinaLog;
  eveningAt?: number;
  updatedAt?: number;
}

export type PlanScene = 'night' | 'nap' | 'day' | 'base' | 'body' | 'mind';

export interface PlanRule {
  scene: PlanScene;
  text: string;
}

export interface Plan {
  id: string;
  weekStart: ISODate;
  title: string;
  phase: string;
  focus: string;
  rules: PlanRule[];
  targets: Targets;
  tasks: TodoItem[];
  rationale?: string;
  changes?: string[];
  source: 'template' | 'review' | 'user' | 'seed';
  status: 'active' | 'archived';
  createdAt: number;
}

export type GoalMetric =
  | 'weightKg'
  | 'sleepHours'
  | 'refitsPerNight'
  | 'gutDaysPerWeek'
  | 'exercisePerWeek'
  | 'focusBlocks'
  | 'meditationMin'
  | 'custom';

export interface Goal {
  id: string;
  title: string;
  metric: GoalMetric;
  baseline?: number;
  target: number;
  unit: string;
  lowerIsBetter?: boolean;
  status: 'active' | 'done' | 'paused';
  note?: string;
}

export const MEMORY_CATEGORIES = ['身体', '睡眠', '饮食', '运动', '心理', '医疗', '生活', '偏好'] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export interface MemoryItem {
  id: string;
  text: string;
  category: MemoryCategory;
  source: 'user' | 'ai' | 'seed';
  createdAt: number;
  updatedAt?: number;
  pinned?: boolean;
  archived?: boolean;
}

export interface WeekStats {
  weekStart: ISODate;
  days: number; // days with any log
  sleepHours?: number;
  latencyMin?: number;
  refitsAvg?: number;
  refitNights?: number;
  capKeptNights?: number;
  stuckButSlept: number;
  maxDiscomfortAvg?: number;
  exposures: number;
  exposureDrop?: number; // average start→end drop
  predictionGap?: number; // predicted peak minus actual peak
  naps: number;
  napAdjustAvg?: number;
  mealsAvg?: number;
  slowMealsAvg?: number;
  gutAvg?: number;
  gutBadDays: number;
  energyAm?: number;
  energyPm?: number;
  moodAvg?: number;
  meditationMin: number;
  moveMin: number;
  exerciseSessions: number;
  readMin: number;
  standBreaks: number;
  focusBlocks: number;
  wakeOnTime: number;
  weightKg?: number;
}

export interface Review {
  id: string; // = weekStart
  weekStart: ISODate;
  weekEnd: ISODate;
  createdAt: number;
  stats: WeekStats;
  summary: string;
  wins: string[];
  struggles: string[];
  insights: string[];
  erp?: { decision: 'advance' | 'hold' | 'step-back'; rationale: string };
  changes?: string[];
  referral?: string;
  reflection?: string;
  nextPlanId?: string;
  proposal?: PlanProposal;
  memories?: { text: string; category: MemoryCategory; state?: 'pending' | 'accepted' | 'dismissed' }[];
}

export interface PlanProposal {
  title: string;
  phase: string;
  focus: string;
  rules: PlanRule[];
  targets: Partial<Targets>;
  tasks: string[];
}

export interface CheckItem {
  id: string;
  title: string;
  dept: string;
  why: string;
  items?: string[];
  priority: 'high' | 'medium' | 'low';
  status: 'todo' | 'booked' | 'done' | 'skipped';
  date?: ISODate;
  intervalMonths?: number;
  note?: string;
}

export interface LabResult {
  name: string;
  value: number | string;
  unit?: string;
  low?: number;
  high?: number;
  flag?: 'H' | 'L' | 'N' | '';
}

export interface CheckupFile {
  assetId: string;
  name: string;
  type: string;
}

export interface CheckupRecord {
  id: string;
  date: ISODate;
  title: string;
  place?: string;
  dept?: string;
  results: LabResult[];
  files: CheckupFile[];
  summary?: string;
  createdAt: number;
}

export interface Trigger {
  id: string;
  text: string;
  score?: number; // 0–100
  status: 'todo' | 'practicing' | 'done';
  count?: number;
  lastAt?: number;
}

export interface Ritual {
  id: string;
  text: string;
  status: 'active' | 'reducing' | 'dropped';
}

export type ActionState = 'pending' | 'accepted' | 'dismissed';

export type ProposedAction =
  | { id: string; type: 'memory'; text: string; category: MemoryCategory; state?: ActionState }
  | { id: string; type: 'task'; text: string; state?: ActionState }
  | { id: string; type: 'log'; date: ISODate; summary: string; patch: Partial<DayDoc>; state?: ActionState };

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  at: number;
  actions?: ProposedAction[];
  error?: string;
}

export interface ChatThread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMsg[];
}

export interface MetaState {
  activePlanId?: string;
  schema: number;
  createdAt?: number;
}
