// Made-up test data for screenshots and flows. Not anyone's real records.
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (date, n) => {
  const [y, m, d] = date.split('-').map(Number);
  return iso(new Date(y, m - 1, d + n, 12));
};

export function buildFixture(today) {
  const docs = {};
  const start = addDays(today, -17);
  docs['profile/main'] = {
    weightUnit: 'jin',
    birthYear: 1990,
    sex: 'male',
    heightCm: 170,
    goalWeightKg: 58,
    programStart: addDays(today, -21),
    onboarded: true,
    conditions: [
      { id: 'c1', name: '胃食道逆流', note: '吃太晚会更明显', status: 'active' },
      { id: 'c2', name: '腰背酸痛', status: 'watch' },
      { id: 'c3', name: '睡前接触敏感', note: '被子碰到肩膀会想调整', status: 'active' },
    ],
  };
  for (let i = 0; i < 17; i++) {
    const date = addDays(start, i);
    const good = i % 3 !== 1;
    const late = i % 4 === 2;
    const day = {
      date,
      sleep: {
        bedtime: late ? '00:20' : '23:20',
        wakeTime: i % 5 === 3 ? '08:10' : '07:30',
        latencyMin: good ? 22 : 75,
        refits: good ? (i > 10 ? 0 : 1) : 3,
        maxDiscomfort: good ? 4 : 7,
        stuckButSlept: i === 12 || i === 15,
        nocturia: i % 4 === 0 ? 2 : 1,
        quality: good ? 4 : 2,
        loggedAt: 1,
      },
      energy: { am: good ? 4 : 2, pm: good ? 3 : 2 },
      mood: good ? 4 : 3,
      gut: { discomfort: late ? 6 : good ? 2 : 4, symptoms: late ? ['反流', '口苦'] : [] },
      meals: [
        { id: `${date}a`, time: '08:05', type: 'breakfast', slow: true, durationMin: 22, fullness: 3 },
        { id: `${date}b`, time: '10:40', type: 'snack', slow: false },
        { id: `${date}c`, time: '12:40', type: 'lunch', slow: good, durationMin: good ? 24 : 12, fullness: 3 },
        ...(i % 2 ? [{ id: `${date}d`, time: '15:30', type: 'snack', slow: true }] : []),
        { id: `${date}e`, time: late ? '20:40' : '18:50', type: 'dinner', slow: !late, durationMin: late ? 10 : 21, gutAfter: late ? 5 : 2 },
      ],
      habits: {
        meditateAmMin: good ? 10 : 0,
        meditatePmMin: i % 2 ? 10 : 0,
        exerciseMin: i % 3 === 0 ? 30 : 0,
        postureMin: good ? 10 : 0,
        walkMin: 15,
        readMin: i % 2 ? 20 : 0,
        journal: good,
        social: i % 4 === 1,
      },
      stand: { breaks: good ? 5 : 2, focusBlocks: good ? 4 : 2 },
      nap: i % 2 === 0 ? { done: true, adjustments: i > 9 ? 0 : 2, maxDiscomfort: 5, slept: i > 9 ? 'light' : 'no' } : undefined,
      erp:
        i % 3 !== 2
          ? [
              {
                id: `e${i}`,
                kind: 'exposure',
                triggerId: 't2',
                triggerText: '被子搭在肩膀上',
                startedAt: 0,
                durationSec: 900,
                plannedMin: 15,
                predicted: 8,
                ratings: [
                  { t: 0, v: 6 + (i % 2) },
                  { t: 150, v: 6 },
                  { t: 300, v: 5 },
                  { t: 450, v: 4 },
                  { t: 600, v: 4 },
                  { t: 750, v: 3 },
                  { t: 900, v: Math.max(1, 4 - Math.floor(i / 6)) },
                ],
                moved: i < 6 ? 1 : 0,
                completed: true,
              },
            ]
          : [],
      weightKg: i % 7 === 0 ? 51.5 + i * 0.06 : undefined,
      tuina: i % 7 === 5 ? { done: true, areas: ['肩颈', '腰'], feeling: 4 } : undefined,
      journal: { win: '午睡一次都没调', hard: '晚上累的时候很想重铺', tomorrow: '晚餐早点吃' },
      eveningAt: 1,
    };
    docs[`days/${date}`] = JSON.parse(JSON.stringify(day));
  }
  const weekStart = addDays(today, -((new Date(today).getDay() + 6) % 7));
  docs['plans/p1'] = {
    id: 'p1',
    weekStart,
    title: '迁移到睡前',
    phase: '阶段二：白天结构化暴露',
    focus: '晚上最多起来 1 次；每周两次“故意铺不好就躺下”。',
    rules: [
      { scene: 'night', text: '冲动来了先躺着不动 5 分钟，观察它' },
      { scene: 'night', text: '一晚最多起来重铺 1 次；之后就留在床上，允许它卡着' },
      { scene: 'nap', text: '穿着衣服躺 20 分钟，一次都不调整' },
      { scene: 'day', text: '暴露练习从 40–60 分的情境开始，每天 15 分钟' },
      { scene: 'base', text: '固定起床时间；晚餐 19:00 前吃完' },
    ],
    targets: { refitCap: 1 },
    tasks: [
      { id: 'k1', text: '预约家医科抽血', done: true },
      { id: 'k2', text: '给触发清单打完分', done: false },
    ],
    source: 'review',
    status: 'active',
    createdAt: 1,
    changes: ['上限 2 次 → 1 次'],
  };
  docs['meta/state'] = { activePlanId: 'p1', schema: 1 };
  const mem = [
    ['累的晚上冲动更强，规则不变', '睡眠'],
    ['晚餐晚于 20 点，第二天胃更不舒服', '饮食'],
    ['喜欢先看数据再决定', '偏好'],
    ['周末会去推拿', '生活'],
    ['担心长期睡不好会留下损伤；给事实，不反复保证', '心理'],
  ];
  mem.forEach(([text, category], i) => {
    docs[`memory/m${i}`] = { id: `m${i}`, text, category, source: i === 0 ? 'ai' : 'seed', createdAt: 1_700_000_000_000 + i, pinned: i === 1 };
  });
  docs['erp/hierarchy'] = {
    items: [
      { id: 't1', text: '短袖躺床上，肚子侧面贴床单', score: 4, status: 'done', count: 6 },
      { id: 't2', text: '被子搭在肩膀上', score: 5, status: 'practicing', count: 9 },
      { id: 't3', text: '穿长袖盖厚被', score: 7, status: 'todo' },
      { id: 't4', text: '午睡穿新 T 恤', score: 6, status: 'todo' },
    ],
  };
  docs['erp/rituals'] = {
    items: [
      { id: 'a1', text: '下床重铺被子再躺', status: 'reducing' },
      { id: 'a2', text: '起来调整上衣', status: 'active' },
      { id: 'a3', text: '心里默念“还行吧”', status: 'active' },
    ],
  };
  docs['goals/main'] = {
    items: [
      { id: 'g1', title: '体重回到 58 公斤', metric: 'weightKg', baseline: 51.5, target: 58, unit: 'kg', status: 'active' },
      { id: 'g2', title: '每晚睡满 7 小时', metric: 'sleepHours', baseline: 5.5, target: 7, unit: '小时', status: 'active' },
      { id: 'g3', title: '不再下床重铺', metric: 'refitsPerNight', baseline: 5, target: 0, unit: '次', lowerIsBetter: true, status: 'active' },
      { id: 'g4', title: '每周力量训练 3 次', metric: 'exercisePerWeek', baseline: 0, target: 3, unit: '次', status: 'active' },
    ],
  };
  docs['checkups/ck1'] = {
    id: 'ck1',
    date: addDays(today, -6),
    title: '血液检查',
    place: '测试诊所',
    dept: '家医科',
    results: [
      { name: '血红蛋白 Hb', value: 12.9, unit: 'g/dL', low: 13.5, high: 17.5, flag: 'L' },
      { name: '空腹血糖', value: 86, unit: 'mg/dL', low: 70, high: 99, flag: 'N' },
      { name: '铁蛋白', value: 18, unit: 'ng/mL', low: 30, high: 400, flag: 'L' },
    ],
    files: [],
    createdAt: 1,
  };
  return docs;
}
