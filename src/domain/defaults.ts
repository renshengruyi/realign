import type { CheckItem, MealType, Plan, RhythmItem, Settings, Targets } from './types';

export const DEFAULT_TARGETS: Targets = {
  mealsPerDay: 5,
  slowMealsPerDay: 3,
  meditationMin: 20,
  moveMin: 30,
  standBreaks: 6,
  exposurePerWeek: 7,
  exercisePerWeek: 3,
  focusBlocks: 4,
  readingMin: 20,
  refitCap: 2,
  urgeDelayMin: 5,
  napMin: 20,
  exposureMin: 15,
  sitMin: 30,
  standMin: 10,
  wakeTime: '07:30',
  bedTime: '23:00',
};

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  reminders: true,
  duskFilter: true,
  weighDay: 1,
};

export const DEFAULT_RHYTHM: RhythmItem[] = [
  { id: 'r-wake', time: '07:30', title: '起床，拉开窗帘', kind: 'wake', note: '固定起床时间比固定上床时间更重要，周末差不超过 1 小时' },
  { id: 'r-am-check', time: '07:40', title: '晨间打卡', kind: 'checkin-am', durationMin: 1 },
  { id: 'r-am-med', time: '07:45', title: '晨间冥想', kind: 'meditate-am', durationMin: 10 },
  { id: 'r-breakfast', time: '08:00', title: '早餐 · 细嚼慢咽', kind: 'meal', mealType: 'breakfast', durationMin: 20 },
  { id: 'r-walk', time: '08:30', title: '晨光散步', kind: 'walk', durationMin: 15, note: '早上的自然光帮生物钟定时' },
  { id: 'r-focus-am', time: '09:00', title: '上午专注', kind: 'focus', note: '坐 30 分钟，站起来 10 分钟' },
  { id: 'r-snack-am', time: '10:30', title: '加餐', kind: 'meal', mealType: 'snack' },
  { id: 'r-lunch', time: '12:30', title: '午餐 · 细嚼慢咽', kind: 'meal', mealType: 'lunch', durationMin: 20 },
  { id: 'r-nap', time: '13:30', title: '午睡训练', kind: 'nap', durationMin: 20, note: '饭后 30 分钟以上再躺下' },
  { id: 'r-focus-pm', time: '14:00', title: '下午专注', kind: 'focus' },
  { id: 'r-snack-pm', time: '15:30', title: '加餐', kind: 'meal', mealType: 'snack' },
  { id: 'r-exposure', time: '16:30', title: '白天暴露练习', kind: 'exposure', durationMin: 15 },
  { id: 'r-exercise', time: '17:30', title: '运动 / 体态', kind: 'exercise', durationMin: 30 },
  { id: 'r-dinner', time: '19:00', title: '晚餐 · 离睡前 3 小时以上', kind: 'meal', mealType: 'dinner', durationMin: 20 },
  { id: 'r-shutdown', time: '21:00', title: '收工仪式', kind: 'shutdown', durationMin: 10, note: '写下明天三件事，把担心停在纸上' },
  { id: 'r-pm-check', time: '21:15', title: '晚间打卡', kind: 'checkin-pm', durationMin: 2 },
  { id: 'r-screen', time: '21:30', title: '放下手机，换成阅读', kind: 'screen-off' },
  { id: 'r-pm-med', time: '22:30', title: '睡前冥想', kind: 'meditate-pm', durationMin: 10 },
  { id: 'r-bed', time: '23:00', title: '有困意再上床', kind: 'bed' },
];

export const RHYTHM_KIND_LABEL: Record<RhythmItem['kind'], string> = {
  wake: '起床',
  'checkin-am': '晨间打卡',
  'meditate-am': '晨间冥想',
  meal: '吃饭',
  walk: '散步',
  focus: '专注',
  nap: '午睡训练',
  exposure: '暴露练习',
  exercise: '运动',
  posture: '体态',
  shutdown: '收工',
  'screen-off': '放下手机',
  read: '阅读',
  'meditate-pm': '睡前冥想',
  'checkin-pm': '晚间打卡',
  bed: '上床',
  tuina: '推拿',
  custom: '其他',
};

export function templatePlan(weekStart: string, now = Date.now()): Plan {
  return {
    id: weekStart,
    weekStart,
    title: '摸底与反应阻止',
    phase: '阶段一：摸底与第一轮反应阻止',
    focus: '先把记录做起来：晚上守住上限，午睡一次都不调。',
    rules: [
      { scene: 'night', text: '冲动来了先躺着不动 5 分钟，观察它：在哪、多大、是压力、温度还是边界感，每分钟心里打一个分' },
      { scene: 'night', text: '一晚最多重铺 2 次；第三次冲动来了就留在床上，让它卡着' },
      { scene: 'night', text: '睡不着超过 20 分钟：去别的房间坐坐，有困意再回来；回来直接躺下，不整理床铺' },
      { scene: 'nap', text: '穿着衣服躺 20 分钟，一次都不调整；睡不睡着都算完成' },
      { scene: 'day', text: '每天固定时间穿睡衣躺 15 分钟，把被子搭在最敏感的位置；不动、不调、不转移注意力，每 2–3 分钟打一次分' },
      { scene: 'day', text: '练完写一句：我预测会怎样？实际怎样？' },
      { scene: 'base', text: '固定起床时间，周末差不超过 1 小时；白天补觉不超过 20 分钟；床头不放能看时间的东西' },
    ],
    targets: { ...DEFAULT_TARGETS },
    tasks: [],
    source: 'template',
    status: 'active',
    createdAt: now,
  };
}

export const SCENE_LABEL: Record<string, string> = {
  night: '晚上',
  nap: '午睡',
  day: '白天练习',
  base: '睡眠基础',
  body: '身体',
  mind: '心理',
};

// ---------------------------------------------------------------- exposure

export const EXPOSURE_PROMPTS = [
  '用中性的词描述它：压力、温度、边界、面积。',
  '不调整，也不赶走它。让它在。',
  '有调整的冲动？注意到冲动本身，不行动。',
  '不需要等它消失。你在练的是：它在，我也可以。',
  '呼吸放慢一点，让注意力也照顾到呼吸和周围的声音。',
  '心里说“还行吧”去确认，也是一种处理。注意到就好，不用确认。',
  '不跟脑子里的话辩论。“这样我肯定睡不着”只是一个想法。',
];

export const IMPERFECT_BED_STEPS = [
  '故意把被子铺得有一点不对：一角卷起，或者肩膀那里多压一点。',
  '躺下，不修正。感觉“不对”的地方，就让它不对。',
  '每 2–3 分钟打一次分，像白天练习一样。',
  '时间到了再起来，起来时也不顺手整理。',
];

export const NIGHT_RULE_HINTS = [
  '这 5 分钟不是硬撑，是观察：它在哪、多大、是什么感觉。',
  '起来与否由你决定，但先等完这 5 分钟。',
  '睡不着超过 20 分钟？去别的房间坐坐，有困意再回来，回来直接躺下，不整理床铺。',
];

// ---------------------------------------------------------------- eating

export const MEAL_LABEL: Record<string, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
};

/** The meal a time of day most likely is. */
export function guessMealType(hm: string): MealType {
  const h = Number(hm.slice(0, 2));
  if (h >= 5 && h < 10) return 'breakfast';
  if (h >= 11 && h < 14) return 'lunch';
  if (h >= 17 && h < 21) return 'dinner';
  return 'snack';
}

export const MEAL_CUES = [
  '放下筷子，把这一口嚼到变糊再咽。',
  '吃到一半停一下：现在几分饱？',
  '这一餐有蛋白质吗？蛋、豆腐、鱼、鸡肉、奶或豆浆。',
  '肩膀放松，慢慢呼一口气，再夹下一口。',
  '七分饱就可以停，留一点余地给胃。',
];

export const GUT_TIPS = [
  '每口嚼到食物变糊再咽，一餐至少 20 分钟。',
  '少量多餐：三餐之间加两次点心，比一次吃很多更护胃，也更容易增重。',
  '饭后 30 分钟内不平躺；晚餐离上床 3 小时以上。',
  '观察自己对油炸、酒、浓咖啡、很辣的食物哪样最敏感，先减那一样。',
  '每餐有一份蛋白质，大约一个手掌大小。',
];

export const GUT_SYMPTOMS = ['反流', '烧心', '口苦', '胀气', '胃痛', '恶心'];

// ---------------------------------------------------------------- movement

export interface Exercise {
  id: string;
  name: string;
  cues: string[];
  holdSec?: number;
  caution?: string;
}

export interface RoutineStep {
  exerciseId: string;
  sets: number;
  reps?: string;
  holdSec?: number;
  perSide?: boolean;
  restSec: number;
}

export interface Routine {
  id: string;
  title: string;
  subtitle: string;
  minutes: number;
  kind: 'posture' | 'strength';
  steps: RoutineStep[];
}

export const EXERCISES: Record<string, Exercise> = {
  'chin-tuck': {
    id: 'chin-tuck',
    name: '收下巴',
    cues: ['背靠墙或坐直，眼睛平视前方', '下巴水平向后收，像做出双下巴', '后颈拉长，停 5 秒再放松'],
  },
  'wall-angel': {
    id: 'wall-angel',
    name: '靠墙天使',
    cues: ['后脑、上背、臀部贴墙，脚离墙一小步', '手臂摆成 W 贴墙，慢慢上滑成 Y，再滑回', '腰不要拱离墙太多，感觉上背在夹紧'],
  },
  'cat-camel': {
    id: 'cat-camel',
    name: '猫驼式',
    cues: ['四点跪姿，手在肩下、膝在髋下', '吸气抬头塌腰，呼气低头拱背', '只在不痛的范围里慢慢动'],
  },
  'bird-dog': {
    id: 'bird-dog',
    name: '鸟狗式',
    cues: ['四点跪姿，腹部轻轻收紧', '同时伸出对侧的手和腿，与地面平行', '停 5 秒，骨盆保持水平，再换边'],
  },
  'glute-bridge': {
    id: 'glute-bridge',
    name: '臀桥',
    cues: ['仰卧屈膝，脚跟靠近臀部', '臀部发力抬起，肩、髋、膝成一条线', '顶端停 2 秒，再慢慢放下'],
  },
  'side-plank-knee': {
    id: 'side-plank-knee',
    name: '屈膝侧桥',
    cues: ['侧躺，前臂在肩膀正下方，膝盖弯曲', '抬起臀部，头到膝成一条线', '保持住，正常呼吸，再换边'],
    holdSec: 20,
  },
  'thoracic-ext': {
    id: 'thoracic-ext',
    name: '胸椎伸展',
    cues: ['坐在有靠背的椅子上，双手轻扶后脑', '以椅背上缘为支点，上背向后伸展', '呼气时伸，吸气时回正'],
  },
  'dead-bug': {
    id: 'dead-bug',
    name: '死虫',
    cues: ['仰卧，手指向天花板，髋和膝弯成 90°', '腰贴地，慢慢伸出对侧的手和腿', '回到起点再换边，全程不憋气'],
  },
  'box-squat': {
    id: 'box-squat',
    name: '椅子深蹲',
    cues: ['站在椅子前，脚与肩同宽', '臀部向后坐，轻碰椅面就站起', '膝盖和脚尖同一个方向'],
  },
  'incline-pushup': {
    id: 'incline-pushup',
    name: '上斜俯卧撑',
    cues: ['双手撑在桌边或墙上，身体成一直线', '胸口靠近桌边，再推回来', '腹部收紧，不塌腰'],
  },
  'door-row': {
    id: 'door-row',
    name: '门框划船',
    cues: ['抓住门框两侧（或用弹力带），身体微微后倾', '肩胛骨向后夹，把胸口拉向门框', '慢慢放回'],
  },
  'split-squat': {
    id: 'split-squat',
    name: '扶墙分腿蹲',
    cues: ['一脚在前一脚在后，手扶墙保持平衡', '后膝向下接近地面，再站起', '前膝不往内扣'],
  },
  'prone-ytw': {
    id: 'prone-ytw',
    name: '俯卧 Y-T-W',
    cues: ['趴在床上或垫子上，额头垫一条毛巾', '手臂依次摆成 Y、T、W，抬离地面', '用上背发力，肩膀不耸'],
  },
  'farmer-carry': {
    id: 'farmer-carry',
    name: '农夫走',
    cues: ['两手各提一桶水或一个购物袋', '挺胸慢走，肩膀下沉', '身体不左右摇晃'],
    holdSec: 30,
  },
};

export const ROUTINES: Routine[] = [
  {
    id: 'posture',
    title: '体态 10 分钟',
    subtitle: '每天做，针对脖子前倾和腰背',
    minutes: 10,
    kind: 'posture',
    steps: [
      { exerciseId: 'chin-tuck', sets: 1, reps: '10 次 × 5 秒', restSec: 15 },
      { exerciseId: 'wall-angel', sets: 1, reps: '10 次', restSec: 15 },
      { exerciseId: 'cat-camel', sets: 1, reps: '10 次', restSec: 15 },
      { exerciseId: 'bird-dog', sets: 1, reps: '每侧 6 次', perSide: true, restSec: 15 },
      { exerciseId: 'glute-bridge', sets: 1, reps: '12 次', restSec: 15 },
      { exerciseId: 'side-plank-knee', sets: 2, holdSec: 20, perSide: true, restSec: 15 },
    ],
  },
  {
    id: 'strength-a',
    title: '力量 A',
    subtitle: '全身，约 30 分钟，一周两到三次',
    minutes: 30,
    kind: 'strength',
    steps: [
      { exerciseId: 'box-squat', sets: 3, reps: '10 次', restSec: 60 },
      { exerciseId: 'incline-pushup', sets: 3, reps: '8–12 次', restSec: 60 },
      { exerciseId: 'door-row', sets: 3, reps: '12 次', restSec: 60 },
      { exerciseId: 'glute-bridge', sets: 3, reps: '12 次', restSec: 45 },
      { exerciseId: 'dead-bug', sets: 2, reps: '每侧 8 次', perSide: true, restSec: 45 },
      { exerciseId: 'farmer-carry', sets: 3, holdSec: 30, restSec: 45 },
    ],
  },
  {
    id: 'strength-b',
    title: '力量 B',
    subtitle: '全身，约 30 分钟，和 A 交替',
    minutes: 30,
    kind: 'strength',
    steps: [
      { exerciseId: 'split-squat', sets: 3, reps: '每侧 8 次', perSide: true, restSec: 60 },
      { exerciseId: 'prone-ytw', sets: 2, reps: '每个字母 8 次', restSec: 45 },
      { exerciseId: 'incline-pushup', sets: 3, reps: '10 次', restSec: 60 },
      { exerciseId: 'door-row', sets: 3, reps: '12 次', restSec: 60 },
      { exerciseId: 'side-plank-knee', sets: 2, holdSec: 20, perSide: true, restSec: 30 },
      { exerciseId: 'bird-dog', sets: 2, reps: '每侧 6 次', perSide: true, restSec: 30 },
    ],
  },
];

export const MOVEMENT_NOTES = [
  '动作放慢，全程正常呼吸。出现刺痛、麻木或往腿上放射的痛，就停下。',
  '脊柱左右不对称，加大负重之前，先请复健科看一次。',
  '想长肉，靠力量训练加上吃够；只做有氧会更难。',
];

// ---------------------------------------------------------------- calm

export interface GuideLine {
  at: number; // seconds from start
  text: string;
}

export interface Practice {
  id: string;
  title: string;
  subtitle: string;
  minutes: number;
  slot: 'am' | 'pm' | 'any';
  breath?: { inhale: number; hold?: number; exhale: number; holdOut?: number };
  lines: GuideLine[];
}

export const PRACTICES: Practice[] = [
  {
    id: 'am-anchor',
    title: '晨间 · 呼吸锚定',
    subtitle: '10 分钟，坐着做，开启一天',
    minutes: 10,
    slot: 'am',
    lines: [
      { at: 0, text: '坐好，双脚踩地，背自然挺直。闭上眼，或把目光放低。' },
      { at: 30, text: '注意空气进出鼻孔，或者腹部的起伏。不需要控制呼吸。' },
      { at: 120, text: '走神很正常。发现自己在想事情，心里说一声“想”，再回到呼吸。' },
      { at: 300, text: '把注意力放大到整个身体：坐着的重量、脚底、双手。' },
      { at: 450, text: '想一想今天最重要的一件事，只想一件。' },
      { at: 540, text: '慢慢睁开眼，带着这份清醒开始今天。' },
    ],
  },
  {
    id: 'pm-open',
    title: '睡前 · 开阔觉察',
    subtitle: '10 分钟，练“让它在”，不是练睡着',
    minutes: 10,
    slot: 'pm',
    breath: { inhale: 4, exhale: 6 },
    lines: [
      { at: 0, text: '躺下或靠坐。不用把姿势调到完美，就用现在的样子。' },
      { at: 40, text: '先听声音：远的、近的，来了又走。' },
      { at: 150, text: '注意呼吸，让呼气比吸气长一点：吸 4 秒，呼 6 秒。' },
      { at: 270, text: '把注意力打开到整个身体。接触感出现时，用中性的词说一声：压力、温度、边界。' },
      { at: 390, text: '不推开它，也不去调整。让它和声音、呼吸一起待在这里。' },
      { at: 500, text: '冒出“这样睡不着”的念头，就说一声“有个想法”，再回到呼吸。' },
      { at: 570, text: '就这样待着。今晚睡得怎样都可以。' },
    ],
  },
  {
    id: 'breath-46',
    title: '4-6 呼吸',
    subtitle: '5 分钟，吸 4 秒、呼 6 秒，让身体慢下来',
    minutes: 5,
    slot: 'any',
    breath: { inhale: 4, exhale: 6 },
    lines: [
      { at: 0, text: '跟着圆圈：变大时吸气，变小时呼气。' },
      { at: 150, text: '呼气时肩膀往下放。' },
    ],
  },
  {
    id: 'box',
    title: '方块呼吸',
    subtitle: '4 分钟，吸 4、停 4、呼 4、停 4，紧张时用',
    minutes: 4,
    slot: 'any',
    breath: { inhale: 4, hold: 4, exhale: 4, holdOut: 4 },
    lines: [{ at: 0, text: '吸气 4 秒，停 4 秒，呼气 4 秒，再停 4 秒。' }],
  },
  {
    id: 'sigh',
    title: '生理叹息',
    subtitle: '1 分钟，两次吸气、一次长呼气，快速降下紧张',
    minutes: 1,
    slot: 'any',
    breath: { inhale: 3, hold: 1, exhale: 6 },
    lines: [{ at: 0, text: '鼻子吸一口，再补吸一小口，然后用嘴慢慢长长地呼出去。' }],
  },
];

// ---------------------------------------------------------------- checkups

export const CHECKUP_CATALOG: CheckItem[] = [
  {
    id: 'c-blood',
    title: '基础抽血 + 尿检',
    dept: '家医科',
    priority: 'high',
    status: 'todo',
    intervalMonths: 12,
    why: '看贫血、血糖、甲状腺、肝肾功能和营养状况',
    items: [
      '血常规 CBC',
      '空腹血糖、糖化血红蛋白 HbA1c',
      '甲状腺 TSH、FT4',
      '肝功能、肾功能',
      '血脂',
      '白蛋白、电解质',
      '铁蛋白、维生素 B12、维生素 D',
      '尿液常规',
    ],
  },
  {
    id: 'c-gi',
    title: '胃肠评估',
    dept: '胃肠肝胆科',
    priority: 'medium',
    status: 'todo',
    why: '长期胃部不适、反流，或体重下降时评估',
    items: ['幽门螺旋杆菌检测', '由医生判断是否需要胃镜'],
  },
  {
    id: 'c-uro',
    title: '排尿评估',
    dept: '泌尿科',
    priority: 'medium',
    status: 'todo',
    why: '尿急尿频或夜尿多时找原因',
    items: ['尿液分析', '泌尿系超音波与残尿量', '尿流速检查'],
  },
  {
    id: 'c-spine',
    title: '脊柱与体态评估',
    dept: '复健科',
    priority: 'medium',
    status: 'todo',
    why: '体态不正、腰背不适时，确定训练怎么做才安全',
    items: ['体态与肌力评估', '由医生决定是否拍脊柱 X 光'],
  },
  {
    id: 'c-mind',
    title: '强迫与睡眠评估',
    dept: '身心科 / 精神科',
    priority: 'medium',
    status: 'todo',
    why: '自己练了几周还是没松动，就去面对面评估，会快很多',
    items: ['强迫症状评估', '睡眠评估', '讨论 ERP 治疗或药物选项'],
  },
  {
    id: 'c-dental',
    title: '洗牙检查',
    dept: '牙科',
    priority: 'low',
    status: 'todo',
    intervalMonths: 6,
    why: '健保每半年可洗一次牙，顺便检查牙周',
  },
];

export const CRISIS_LINES = [
  { name: '安心专线（24 小时）', number: '1925' },
  { name: '生命线', number: '1995' },
  { name: '张老师', number: '1980' },
];
