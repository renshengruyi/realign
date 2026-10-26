import { useState } from 'preact/hooks';
import { addDays, formatDate, nowHM } from '../../domain/dates';
import { GUT_TIPS, guessMealType, MEAL_LABEL, MOVEMENT_NOTES, ROUTINES } from '../../domain/defaults';
import { computeSeals, latestWeight, type SealKey } from '../../domain/metrics';
import type { Habits, Meal, MealType, TodoItem } from '../../domain/types';
import { bmi, kgTo, round1, toKg, unitLabel } from '../../domain/units';
import { newId } from '../../platform/localdb';
import { allDays, dayOf, notify, patchDay, profile, targets, today, updateDayList } from '../../platform/store';
import { Field, Scale, Segmented, Stepper, Switch, TextArea, TimeInput } from '../components/controls';
import { Icon } from '../components/Icon';
import { Seal } from '../components/Seal';
import { Sheet } from '../components/Sheet';
import { closeSheet, openSheet, openTool } from '../nav';
import { startSitStand } from '../sitstand';

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: '早餐' },
  { value: 'lunch', label: '午餐' },
  { value: 'dinner', label: '晚餐' },
  { value: 'snack', label: '加餐' },
];


export function MealSheet({ type, meal: initial, date: forDate }: { type?: MealType; meal?: Meal; date?: string }) {
  const date = forDate ?? today.value;
  const [m, setM] = useState<Meal>(
    () =>
      initial ?? {
        id: newId('m'),
        time: nowHM(),
        type: type ?? guessMealType(nowHM()),
        slow: false,
      },
  );
  const set = (p: Partial<Meal>) => setM((x) => ({ ...x, ...p }));
  async function save() {
    await updateDayList(date, 'meals', (list) => {
      const rest = list.filter((x) => x.id !== m.id);
      return [...rest, m].sort((a, b) => a.time.localeCompare(b.time));
    });
    closeSheet();
    notify(`${MEAL_LABEL[m.type]}记好了`, 'success');
  }
  async function remove() {
    await updateDayList(date, 'meals', (list) => list.filter((x) => x.id !== m.id));
    closeSheet();
  }
  return (
    <Sheet
      title={initial ? '编辑这一餐' : '记一餐'}
      onClose={closeSheet}
      footer={
        <>
          {initial ? (
            <button type="button" class="btn danger" onClick={remove}>
              删除
            </button>
          ) : null}
          <button type="button" class="btn primary" onClick={save}>
            <Icon name="check" />
            保存
          </button>
        </>
      }
    >
      <div class="row wrap" style={{ gap: '16px' }}>
        <Field label="时间">
          <TimeInput label="吃饭时间" value={m.time} onChange={(v) => set({ time: v })} id="meal-time" />
        </Field>
        <Field label="吃了多久（分钟）">
          <Stepper label="用餐时长" value={m.durationMin} onChange={(v) => set({ durationMin: v, slow: v >= 20 || m.slow })} step={5} max={90} />
        </Field>
      </div>
      <Field label="哪一餐">
        <Segmented label="餐次" options={MEAL_TYPES} value={m.type} onChange={(v) => set({ type: v })} />
      </Field>
      <Field label="吃了什么（可不填）">
        <input class="input" value={m.foods ?? ''} onInput={(e) => set({ foods: (e.target as HTMLInputElement).value })} placeholder="例如：稀饭、蒸蛋、青菜" aria-label="吃了什么" />
      </Field>
      <div class="stack tight">
        <Switch checked={!!m.slow} onChange={(v) => set({ slow: v })} label="细嚼慢咽了" sub="放下筷子再嚼，主餐 20 分钟以上" />
        <Switch checked={!!m.protein} onChange={(v) => set({ protein: v })} label="有一份蛋白质" sub="蛋、豆腐、鱼、肉、奶或豆浆" />
      </div>
      <Field label="吃到几分饱">
        <Scale five label="饱腹感" value={m.fullness} onChange={(v) => set({ fullness: v })} low="1 还饿" high="5 撑了" />
      </Field>
      <Field label="饭后胃部不适几分">
        <Scale label="饭后胃部不适" value={m.gutAfter} onChange={(v) => set({ gutAfter: v })} low="0 舒服" high="10 很难受" />
      </Field>
    </Sheet>
  );
}

type MoveKind = 'walk' | 'exercise' | 'posture' | 'read' | 'meditateAm' | 'meditatePm';

const MOVE_META: Record<MoveKind, { title: string; field: keyof Habits; unit: string }> = {
  walk: { title: '记散步', field: 'walkMin', unit: '分钟' },
  exercise: { title: '记运动', field: 'exerciseMin', unit: '分钟' },
  posture: { title: '记体态练习', field: 'postureMin', unit: '分钟' },
  read: { title: '记阅读', field: 'readMin', unit: '分钟' },
  meditateAm: { title: '记晨间冥想', field: 'meditateAmMin', unit: '分钟' },
  meditatePm: { title: '记睡前冥想', field: 'meditatePmMin', unit: '分钟' },
};

export function MoveSheet({ kind, minutes }: { kind: MoveKind; minutes?: number }) {
  const meta = MOVE_META[kind];
  const date = today.value;
  const cur = (dayOf(date)?.habits?.[meta.field] as number | undefined) ?? 0;
  const [min, setMin] = useState<number>(minutes ?? 15);
  const [sun, setSun] = useState(false);
  async function save() {
    const habits: Habits = { [meta.field]: cur + min } as Habits;
    if (kind === 'walk' && sun) habits.sunlight = true;
    await patchDay(date, { habits });
    closeSheet();
    notify(`${meta.title.replace('记', '')} ${min} 分钟，记好了`, 'success');
  }
  return (
    <Sheet
      title={meta.title}
      onClose={closeSheet}
      footer={
        <button type="button" class="btn primary" onClick={save}>
          <Icon name="check" />
          保存
        </button>
      }
    >
      <Field label="多少分钟" hint={cur ? `今天已经记了 ${cur} 分钟，这次会加上去` : undefined}>
        <Stepper label="分钟" value={min} onChange={setMin} step={5} min={5} max={240} suffix="分钟" />
      </Field>
      {kind === 'walk' ? <Switch checked={sun} onChange={setSun} label="在户外晒到了太阳" sub="早上的自然光帮生物钟定时" /> : null}
    </Sheet>
  );
}

export function WeightSheet() {
  const unit = profile.value.weightUnit;
  const last = latestWeight(allDays.value);
  const [v, setV] = useState(last ? String(round1(kgTo(unit, last.kg))) : '');
  const [date, setDate] = useState(today.value);
  const n = Number(v);
  const valid = v !== '' && Number.isFinite(n) && n > 20 && n < 400;
  const kg = valid ? round1(toKg(unit, n)) : undefined;
  const b = bmi(kg, profile.value.heightCm);
  async function save() {
    if (!kg) return;
    await patchDay(date, { weightKg: kg });
    closeSheet();
    notify('体重记好了', 'success');
  }
  return (
    <Sheet
      title="记体重"
      onClose={closeSheet}
      footer={
        <button type="button" class="btn primary" disabled={!valid} onClick={save}>
          <Icon name="check" />
          保存
        </button>
      }
    >
      <p class="small soft">每周固定一天，早上起床、上完厕所、吃饭前称一次就够。天天称容易被正常波动带着走。</p>
      <Field label={`体重（${unitLabel(unit)}${unit === 'jin' ? '，1 斤 = 500 克' : ''}）`}>
        <input class="input" inputMode="decimal" value={v} onInput={(e) => setV((e.target as HTMLInputElement).value)} aria-label="体重" />
      </Field>
      {kg ? (
        <p class="small soft">
          = {kg} kg{b ? `，BMI ${round1(b)}` : ''}
        </p>
      ) : null}
      <Field label="日期">
        <Segmented
          label="日期"
          options={[
            { value: today.value, label: '今天' },
            { value: addDays(today.value, -1), label: '昨天' },
          ]}
          value={date}
          onChange={setDate}
        />
      </Field>
    </Sheet>
  );
}

const TUINA_AREAS = ['肩颈', '上背', '腰', '腹部', '腿', '全身'];

export function TuinaSheet() {
  const date = today.value;
  const cur = dayOf(date)?.tuina;
  const [areas, setAreas] = useState<string[]>(cur?.areas ?? []);
  const [feeling, setFeeling] = useState<number | undefined>(cur?.feeling);
  const [note, setNote] = useState(cur?.note ?? '');
  async function save() {
    await patchDay(date, { tuina: { done: true, areas, feeling, note: note || undefined } });
    closeSheet();
    notify('推拿记好了。今晚睡得怎样，明早打卡时会一起看。', 'success');
  }
  return (
    <Sheet
      title="记录推拿"
      onClose={closeSheet}
      footer={
        <button type="button" class="btn primary" onClick={save}>
          <Icon name="check" />
          保存
        </button>
      }
    >
      <Field label="推了哪些部位">
        <div class="seg" role="group" aria-label="部位">
          {TUINA_AREAS.map((a) => (
            <button type="button" key={a} aria-pressed={areas.includes(a)} onClick={() => setAreas(areas.includes(a) ? areas.filter((x) => x !== a) : [...areas, a])}>
              {a}
            </button>
          ))}
        </div>
      </Field>
      <Field label="推完之后身体感觉">
        <Scale five label="推拿后感觉" value={feeling} onChange={setFeeling} low="1 不舒服" high="5 很放松" />
      </Field>
      <Field label="备注（可不填）">
        <TextArea label="推拿备注" value={note} onInput={setNote} rows={2} placeholder="例如：右边腰比较紧" />
      </Field>
    </Sheet>
  );
}

export function SealSheet({ k }: { k: SealKey }) {
  const date = today.value;
  const seal = computeSeals(dayOf(date), targets.value).find((s) => s.key === k)!;
  const actions: Record<SealKey, { label: string; icon: string; run: () => void }[]> = {
    sleep: [
      { label: '晨间打卡', icon: 'sun', run: () => openSheet('checkin-am') },
      { label: '白天暴露练习', icon: 'play', run: () => openTool('exposure') },
      { label: '午睡训练', icon: 'bed', run: () => openTool('nap') },
    ],
    food: [
      { label: '开始吃饭计时', icon: 'timer', run: () => openTool('meal', { type: guessMealType(nowHM()) }) },
      { label: '补记一餐', icon: 'plus', run: () => openSheet('meal') },
    ],
    move: [
      { label: '体态 10 分钟', icon: 'play', run: () => openTool('workout', { routine: 'posture' }) },
      { label: '力量训练', icon: 'dumbbell', run: () => openSheet('routines') },
      { label: '记散步', icon: 'walk', run: () => openSheet('move', { kind: 'walk', minutes: 20 }) },
      { label: '开始坐站节拍', icon: 'timer', run: () => (closeSheet(), startSitStand()) },
    ],
    calm: [
      { label: '晨间冥想', icon: 'sun', run: () => openTool('meditate', { practice: 'am-anchor', slot: 'am' }) },
      { label: '睡前冥想', icon: 'moon', run: () => openTool('meditate', { practice: 'pm-open', slot: 'pm' }) },
      { label: '写三行日记', icon: 'pen', run: () => openSheet('checkin-pm') },
    ],
  };
  const notes: Record<SealKey, string> = {
    sleep: '这一枚看的是你做没做，不看睡得好不好：按时起床、守住上限、做一次训练。',
    food: '少量多餐、慢慢吃，比一次吃很多更护胃，也更容易长肉。',
    move: '先体态和轻力量，加上散步。坐 30 分钟就站起来动一动。',
    calm: '早晚各十分钟。睡前那次练的是“让它在”，不是练睡着。',
  };
  return (
    <Sheet title={`「${seal.char}」这一枚`} onClose={closeSheet}>
      <div class="row" style={{ gap: '16px' }}>
        <div style={{ width: '72px' }}>
          <Seal state={seal} animate={false} />
        </div>
        <ul class="stack tight grow" style={{ listStyle: 'none' }}>
          {seal.parts.map((p) => (
            <li class="row" key={p.label}>
              <span class="check-btn" aria-hidden="true" style={p.done ? { background: 'var(--ink-3)', borderColor: 'var(--ink-3)', color: 'var(--bg)', width: '24px', height: '24px' } : { width: '24px', height: '24px' }}>
                <Icon name="check" size={14} />
              </span>
              <span class={p.done ? 'muted' : ''}>{p.label}</span>
            </li>
          ))}
        </ul>
      </div>
      <p class="small soft">{notes[k]}</p>
      {k === 'food' ? (
        <ul class="stack tight small soft" style={{ paddingLeft: '18px' }}>
          {GUT_TIPS.slice(0, 3).map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : null}
      <div class="btn-row">
        {actions[k].map((a, i) => (
          <button type="button" key={a.label} class={`btn${i === 0 ? ' primary' : ''}`} onClick={a.run}>
            <Icon name={a.icon} />
            {a.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

export function ShutdownSheet() {
  const date = today.value;
  const tomorrow = addDays(date, 1);
  const existing = dayOf(tomorrow)?.top3 ?? [];
  const [items, setItems] = useState<string[]>(() => {
    const base = existing.map((x) => x.text);
    while (base.length < 3) base.push('');
    return base.slice(0, 3);
  });
  const [worries, setWorries] = useState(dayOf(date)?.journal?.worries ?? '');
  async function save() {
    const list: TodoItem[] = items
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => existing.find((x) => x.text === text) ?? { id: newId('t'), text, done: false });
    await patchDay(tomorrow, { top3: list });
    await patchDay(date, { habits: { shutdown: true }, journal: { worries: worries || undefined } });
    closeSheet();
    notify('收工了。明天的事已经写好，今晚可以放下了。', 'success');
  }
  return (
    <Sheet
      title="收工仪式"
      onClose={closeSheet}
      footer={
        <button type="button" class="btn primary" onClick={save}>
          <Icon name="check" />
          收工
        </button>
      }
    >
      <p class="small soft">
        白天用脑太多会带到床上。花五分钟把今天收个尾：写下明天最重要的三件事，还在脑子里转的事写进停车场，明天再处理。然后合上电脑。
      </p>
      <Field label={`明天（${formatDate(tomorrow, { weekday: true })}）的三件事`}>
        <div class="stack tight">
          {items.map((v, i) => (
            <input
              key={i}
              class="input"
              value={v}
              placeholder={['最重要的一件', '第二件', '第三件（可空着）'][i]}
              aria-label={`明天第 ${i + 1} 件事`}
              onInput={(e) => setItems(items.map((x, j) => (j === i ? (e.target as HTMLInputElement).value : x)))}
            />
          ))}
        </div>
      </Field>
      <Field label="担心停车场" hint="写下来，不用现在解决">
        <TextArea label="担心停车场" value={worries} onInput={setWorries} rows={3} placeholder="例如：那封邮件明早再回" />
      </Field>
    </Sheet>
  );
}

export function RoutinesSheet() {
  return (
    <Sheet title="选一个跟练" onClose={closeSheet}>
      <div class="stack">
        {ROUTINES.map((r) => (
          <button type="button" key={r.id} class="practice-card" data-k="move" onClick={() => openTool('workout', { routine: r.id })}>
            <span class="pc-icon">
              <Icon name={r.kind === 'posture' ? 'stand' : 'dumbbell'} />
            </span>
            <b>{r.title}</b>
            <span class="pc-sub">
              {r.subtitle} · {r.steps.length} 个动作
            </span>
          </button>
        ))}
        <button type="button" class="practice-card" data-k="move" onClick={() => openSheet('move', { kind: 'walk', minutes: 20 })}>
          <span class="pc-icon">
            <Icon name="walk" />
          </span>
          <b>散步</b>
          <span class="pc-sub">出门走 20–30 分钟，回来记一下</span>
        </button>
      </div>
      <ul class="stack tight xs muted" style={{ paddingLeft: '16px' }}>
        {MOVEMENT_NOTES.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </Sheet>
  );
}
