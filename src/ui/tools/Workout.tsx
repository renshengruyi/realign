import { useEffect, useState } from 'preact/hooks';
import { formatDuration } from '../../domain/dates';
import { EXERCISES, MOVEMENT_NOTES, ROUTINES } from '../../domain/defaults';
import { dayOf, notify, patchDay, today } from '../../platform/store';
import { play } from '../audio';
import { Dial } from '../components/Dial';
import { Icon } from '../components/Icon';
import { ToolFrame } from '../components/Sheet';
import { useStopwatch, useTick } from '../hooks';
import { closeTool } from '../nav';
import { keepAwake, releaseAwake } from '../wakelock';

interface Slot {
  step: number;
  set: number;
  side?: '左' | '右';
}

export function WorkoutTool({ routine: routineId }: { routine?: string }) {
  const routine = ROUTINES.find((r) => r.id === routineId) ?? ROUTINES[0];
  const slots: Slot[] = routine.steps.flatMap((s, step) =>
    Array.from({ length: s.sets }, (_, set) => (s.perSide && s.holdSec ? [{ step, set, side: '左' as const }, { step, set, side: '右' as const }] : [{ step, set }])).flat(),
  );
  const [i, setI] = useState(-1); // -1: intro
  const [mode, setMode] = useState<'work' | 'rest' | 'done'>('work');
  const [holdStart, setHoldStart] = useState<number | null>(null);
  const [restStart, setRestStart] = useState<number | null>(null);
  const total = useStopwatch();
  useTick(holdStart !== null || restStart !== null, 200);

  const slot = slots[i];
  const step = slot ? routine.steps[slot.step] : undefined;
  const ex = step ? EXERCISES[step.exerciseId] : undefined;
  const hold = step?.holdSec ?? ex?.holdSec;
  const holdLeft = holdStart !== null && hold ? Math.max(0, hold - (Date.now() - holdStart) / 1000) : hold ?? 0;
  const restLen = step?.restSec ?? 30;
  const restLeft = restStart !== null ? Math.max(0, restLen - (Date.now() - restStart) / 1000) : restLen;

  useEffect(() => () => releaseAwake(), []);

  useEffect(() => {
    if (mode === 'work' && holdStart !== null && holdLeft <= 0) {
      setHoldStart(null);
      play('chime');
      next();
    }
    if (mode === 'rest' && restStart !== null && restLeft <= 0) {
      setRestStart(null);
      play('tick');
      setMode('work');
    }
  });

  function begin() {
    keepAwake();
    total.start();
    setI(0);
    setMode('work');
  }

  function next() {
    if (i >= slots.length - 1) {
      void finish();
      return;
    }
    const nextSlot = slots[i + 1];
    setI(i + 1);
    // no rest between the two sides of one hold
    if (slot && nextSlot.step === slot.step && nextSlot.set === slot.set) {
      setMode('work');
      return;
    }
    setMode('rest');
    setRestStart(Date.now());
  }

  async function finish() {
    total.pause();
    releaseAwake();
    setMode('done');
    play('done');
    const minutes = Math.max(1, Math.round(total.elapsed / 60));
    const field = routine.kind === 'posture' ? 'postureMin' : 'exerciseMin';
    const cur = dayOf(today.value)?.habits?.[field] ?? 0;
    await patchDay(today.value, { habits: { [field]: cur + minutes, exerciseKind: routine.title } });
    notify(`${routine.title}完成，记了 ${minutes} 分钟`, 'success');
  }

  return (
    <ToolFrame title={routine.title} onClose={() => (releaseAwake(), closeTool())}>
      {i === -1 ? (
        <div class="stack loose">
          <p class="small soft">{routine.subtitle}</p>
          <ol class="list">
            {routine.steps.map((s) => (
              <li class="list-row" key={s.exerciseId + s.sets}>
                <span class="grow">{EXERCISES[s.exerciseId].name}</span>
                <span class="small muted">
                  {s.sets} 组 × {s.reps ?? `${s.holdSec} 秒${s.perSide ? '/侧' : ''}`}
                </span>
              </li>
            ))}
          </ol>
          <ul class="stack tight xs muted" style={{ paddingLeft: '16px' }}>
            {MOVEMENT_NOTES.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <button type="button" class="btn primary lg block" onClick={begin}>
            <Icon name="play" />
            开始
          </button>
        </div>
      ) : mode === 'done' ? (
        <div class="stack loose" style={{ justifyItems: 'center', paddingTop: '8vh' }}>
          <p class="guide-line">完成了，用时 {formatDuration(total.elapsed)}。喝点水，慢慢走一走。</p>
          <button type="button" class="btn primary lg" onClick={closeTool}>
            好
          </button>
        </div>
      ) : ex && step && slot ? (
        <div class="stack loose">
          <div class="steps-dots" aria-hidden="true">
            {routine.steps.map((_, k) => (
              <i key={k} class={k <= slot.step ? 'on' : ''} />
            ))}
          </div>
          {mode === 'rest' ? (
            <div class="stack loose" style={{ justifyItems: 'center' }}>
              <Dial value={1 - restLeft / restLen} color="var(--c-move)">
                <span class="dial-time">{Math.ceil(restLeft)}</span>
                <span class="dial-sub">休息一下，下一个：{ex.name}</span>
              </Dial>
              <button type="button" class="btn" onClick={() => (setRestStart(null), setMode('work'))}>
                <Icon name="next" />
                跳过休息
              </button>
            </div>
          ) : (
            <div class="exercise-card">
              <p class="eyebrow">
                第 {slot.step + 1}/{routine.steps.length} 个动作 · 第 {slot.set + 1}/{step.sets} 组{slot.side ? ` · ${slot.side}侧` : ''}
              </p>
              <h3>{ex.name}</h3>
              <p style={{ fontWeight: 700 }}>{step.reps ?? `保持 ${hold} 秒${step.perSide && !slot.side ? '，每侧' : ''}`}</p>
              <ol>
                {ex.cues.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ol>
              {hold ? (
                holdStart === null ? (
                  <button type="button" class="btn primary lg block" onClick={() => (setHoldStart(Date.now()), play('tick'))}>
                    <Icon name="play" />
                    开始计时 {hold} 秒
                  </button>
                ) : (
                  <Dial value={1 - holdLeft / hold} color="var(--c-move)">
                    <span class="dial-time">{Math.ceil(holdLeft)}</span>
                    <span class="dial-sub">保持住，正常呼吸</span>
                  </Dial>
                )
              ) : (
                <button type="button" class="btn primary lg block" onClick={next}>
                  <Icon name="check" />
                  完成这一组
                </button>
              )}
            </div>
          )}
          <div class="row between small muted">
            <span>已用时 {formatDuration(total.elapsed)}</span>
            <button type="button" class="btn sm ghost" onClick={() => void finish()}>
              提前结束
            </button>
          </div>
        </div>
      ) : null}
    </ToolFrame>
  );
}
