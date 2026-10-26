import { useEffect, useState } from 'preact/hooks';
import { nightDateOf } from '../../domain/dates';
import { NIGHT_RULE_HINTS } from '../../domain/defaults';
import type { UrgeEvent } from '../../domain/types';
import { newId } from '../../platform/localdb';
import { dayOf, targets, updateDayList } from '../../platform/store';
import { play } from '../audio';

import { Dial } from '../components/Dial';
import { Icon } from '../components/Icon';
import { ToolFrame } from '../components/Sheet';
import { useStopwatch } from '../hooks';
import { closeTool } from '../nav';
import { keepAwake, releaseAwake } from '../wakelock';

/**
 * The night screen: nearly black, no clock, big targets. It runs the
 * "wait before you act" delay and counts the times you got up.
 */
export function NightTool() {
  const t = targets.value;
  const date = nightDateOf(Date.now());
  const ups = dayOf(date)?.urges?.filter((u) => u.decision === 'got-up').length ?? 0;
  const [phase, setPhase] = useState<'idle' | 'wait' | 'decide' | 'after'>('idle');
  const [startScore, setStartScore] = useState<number | undefined>();
  const [endScore, setEndScore] = useState<number | undefined>();
  const [last, setLast] = useState<UrgeEvent['decision'] | null>(null);
  const sw = useStopwatch();
  const total = t.urgeDelayMin * 60;
  const capReached = ups >= t.refitCap;

  useEffect(() => {
    if (phase === 'wait' && sw.elapsed >= total) {
      play('night', { force: true });
      releaseAwake();
      setPhase('decide');
    }
  });
  useEffect(() => () => releaseAwake(), []);

  async function decide(decision: UrgeEvent['decision']) {
    const ev: UrgeEvent = { id: newId('u'), at: Date.now(), startScore, endScore, decision, delaySec: Math.round(sw.elapsed) };
    await updateDayList(date, 'urges', (l) => [...l, ev]);
    setLast(decision);
    setPhase('after');
    sw.reset();
    setStartScore(undefined);
    setEndScore(undefined);
  }

  const hint = NIGHT_RULE_HINTS[Math.floor(sw.elapsed / 100) % NIGHT_RULE_HINTS.length];

  return (
    <ToolFrame title="夜里" night onClose={() => (releaseAwake(), closeTool())}>
      <div class="stack loose" style={{ justifyItems: 'center', paddingTop: '4vh' }}>
        {phase === 'idle' || phase === 'after' ? (
          <>
            <p class="center" style={{ fontSize: 'var(--t-sm)' }}>
              今晚已重铺 {ups}/{t.refitCap} 次
            </p>
            {phase === 'after' ? (
              <p class="guide-line" style={{ color: '#9a6240' }}>
                {last === 'stayed'
                  ? '你留在了床上。让它卡着，睡不睡得着都可以。'
                  : last === 'left-room'
                    ? '去别的房间坐一会，灯调暗。有困意再回来，回来直接躺下，不整理床铺。'
                    : capReached
                      ? '记下了。今晚的上限到了，下次冲动来了就留在床上。'
                      : '记下了。铺完就躺下，不再检查。'}
              </p>
            ) : (
              <p class="guide-line" style={{ color: '#9a6240' }}>
                冲动来了，先别动。
              </p>
            )}
            <button
              type="button"
              class="btn primary lg"
              style={{ width: 'min(72vw, 280px)', height: 'min(72vw, 280px)', borderRadius: '50%', fontSize: 'var(--t-xl)' }}
              onClick={() => {
                keepAwake();
                sw.start();
                setPhase('wait');
              }}
            >
              冲动来了
            </button>
            <p class="small center">按下后，躺着不动等 {t.urgeDelayMin} 分钟，再决定起不起来。</p>
          </>
        ) : null}

        {phase === 'wait' ? (
          <>
            <Dial value={sw.elapsed / total} color="#5a3420" width={3}>
              <span class="dial-sub" style={{ fontSize: 'var(--t-md)' }}>
                还剩 {Math.max(1, Math.ceil((total - sw.elapsed) / 60))} 分钟
              </span>
            </Dial>
            <p class="guide-line" style={{ color: '#9a6240' }}>
              {hint}
            </p>
            {startScore === undefined ? (
              <div class="card stack" style={{ width: '100%' }}>
                <p class="small">现在几分？（可跳过）</p>
                <NightScale value={startScore} onChange={setStartScore} />
              </div>
            ) : null}
            <button type="button" class="btn ghost" onClick={() => setPhase('decide')}>
              不等了
            </button>
          </>
        ) : null}

        {phase === 'decide' ? (
          <>
            <p class="guide-line" style={{ color: '#9a6240' }}>
              {t.urgeDelayMin} 分钟到了。现在怎么做？
            </p>
            <div class="card stack" style={{ width: '100%' }}>
              <p class="small">现在几分？（可跳过）</p>
              <NightScale value={endScore} onChange={setEndScore} />
            </div>
            <div class="stack" style={{ width: '100%' }}>
              <button type="button" class="btn primary lg block" onClick={() => decide('stayed')}>
                <Icon name="bed" />
                留在床上，让它卡着
              </button>
              <button type="button" class="btn lg block" onClick={() => decide('left-room')}>
                <Icon name="walk" />
                去别的房间待一会
              </button>
              <button type="button" class="btn lg block" onClick={() => decide('got-up')}>
                {capReached ? `上限到了，仍然起来（第 ${ups + 1} 次）` : `起来重铺（第 ${ups + 1} 次）`}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </ToolFrame>
  );
}

/** Six big targets (0, 2 … 10) that are easy to hit half asleep in the dark. */
function NightScale({ value, onChange }: { value: number | undefined; onChange: (v: number) => void }) {
  return (
    <div class="scale night-scale" role="group" aria-label="现在的不适分">
      {[0, 2, 4, 6, 8, 10].map((n) => (
        <button type="button" key={n} aria-pressed={value === n} aria-label={`现在的不适分 ${n}`} onClick={() => onChange(n)}>
          {n}
        </button>
      ))}
    </div>
  );
}
