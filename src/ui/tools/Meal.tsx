import { useEffect, useRef, useState } from 'preact/hooks';
import { formatDuration, nowHM } from '../../domain/dates';
import { guessMealType, MEAL_CUES, MEAL_LABEL } from '../../domain/defaults';
import type { Meal, MealType } from '../../domain/types';
import { newId } from '../../platform/localdb';
import { notify, today, updateDayList } from '../../platform/store';
import { play } from '../audio';
import { Field, Scale, Segmented, Switch } from '../components/controls';
import { Dial } from '../components/Dial';
import { Icon } from '../components/Icon';
import { ToolFrame } from '../components/Sheet';
import { useStopwatch } from '../hooks';
import { closeTool } from '../nav';
import { keepAwake, releaseAwake } from '../wakelock';

const TYPES: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: '早餐' },
  { value: 'lunch', label: '午餐' },
  { value: 'dinner', label: '晚餐' },
  { value: 'snack', label: '加餐' },
];

/** A pacing companion for eating slowly: counts up, nudges every minute. */
export function MealTool({ type: initialType }: { type?: MealType }) {
  const [type, setType] = useState<MealType>(initialType ?? guessMealType(nowHM()));
  const [phase, setPhase] = useState<'run' | 'done'>('run');
  const [startHM] = useState(nowHM());
  const [cueAt, setCueAt] = useState(0);
  const [meal, setMeal] = useState<Partial<Meal>>({});
  const sw = useStopwatch(true);
  const chimed = useRef(false);
  const target = (type === 'snack' ? 10 : 20) * 60;
  const cue = MEAL_CUES[cueAt % MEAL_CUES.length];

  useEffect(() => {
    keepAwake();
    return () => releaseAwake();
  }, []);

  useEffect(() => {
    if (phase !== 'run' || !sw.running) return;
    const idx = Math.floor(sw.elapsed / 60);
    if (idx > cueAt) {
      setCueAt(idx);
      play('tick');
    }
    if (!chimed.current && sw.elapsed >= target) {
      chimed.current = true;
      play('chime');
    }
  });

  function finish() {
    sw.pause();
    releaseAwake();
    setPhase('done');
  }

  async function save() {
    const minutes = Math.max(1, Math.round(sw.elapsed / 60));
    const m: Meal = {
      id: newId('m'),
      time: startHM,
      type,
      durationMin: minutes,
      slow: sw.elapsed >= target * 0.8,
      ...meal,
    };
    await updateDayList(today.value, 'meals', (l) => [...l, m].sort((a, b) => a.time.localeCompare(b.time)));
    notify(m.slow ? `${MEAL_LABEL[type]}吃了 ${minutes} 分钟，慢慢吃做到了` : `${MEAL_LABEL[type]}记好了，下次再慢一点`, 'success');
    closeTool();
  }

  return (
    <ToolFrame title="慢慢吃" onClose={() => (releaseAwake(), closeTool())}>
      {phase === 'run' ? (
        <div class="stack loose" style={{ justifyItems: 'center' }}>
          <Segmented label="餐次" options={TYPES} value={type} onChange={setType} />
          <Dial value={sw.elapsed / target} color="var(--c-food)">
            <span class="dial-time">{formatDuration(sw.elapsed)}</span>
            <span class="dial-sub">{sw.elapsed >= target ? '达到了，可以慢慢收尾' : `目标 ${target / 60} 分钟`}</span>
          </Dial>
          <p class="guide-line" aria-live="polite">
            {cue}
          </p>
          <div class="tool-actions">
            <button type="button" class="btn primary lg" onClick={finish}>
              <Icon name="check" />
              吃完了
            </button>
          </div>
        </div>
      ) : (
        <div class="stack loose">
          <p class="guide-line">
            吃了 {Math.max(1, Math.round(sw.elapsed / 60))} 分钟。{sw.elapsed >= target * 0.8 ? '节奏不错。' : '比目标快了一点，下次每口多嚼几下。'}
          </p>
          <Field label="吃了什么（可不填）">
            <input class="input" value={meal.foods ?? ''} onInput={(e) => setMeal({ ...meal, foods: (e.target as HTMLInputElement).value })} placeholder="例如：鸡蛋粥、青菜" aria-label="吃了什么" />
          </Field>
          <Switch checked={!!meal.protein} onChange={(v) => setMeal({ ...meal, protein: v })} label="有一份蛋白质" />
          <Field label="吃到几分饱">
            <Scale five label="饱腹感" value={meal.fullness} onChange={(v) => setMeal({ ...meal, fullness: v })} low="1 还饿" high="5 撑了" />
          </Field>
          <Field label="现在胃部不适几分">
            <Scale label="饭后胃部不适" value={meal.gutAfter} onChange={(v) => setMeal({ ...meal, gutAfter: v })} low="0 舒服" high="10 很难受" />
          </Field>
          <p class="xs muted">饭后 30 分钟内先别躺下。</p>
          <button type="button" class="btn primary lg block" onClick={save}>
            <Icon name="check" />
            保存
          </button>
        </div>
      )}
    </ToolFrame>
  );
}
