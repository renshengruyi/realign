import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { formatDuration } from '../../domain/dates';
import { EXPOSURE_PROMPTS, IMPERFECT_BED_STEPS } from '../../domain/defaults';
import type { ErpSession, Rating, Trigger } from '../../domain/types';
import { newId } from '../../platform/localdb';
import { activePlan, mergeDocument, notify, targets, today, triggers, updateDayList } from '../../platform/store';
import { play } from '../audio';
import { CurveChart } from '../components/charts';
import { Field, Scale, Segmented, TextArea } from '../components/controls';
import { Dial } from '../components/Dial';
import { Icon } from '../components/Icon';
import { ToolFrame } from '../components/Sheet';
import { useStopwatch } from '../hooks';
import { closeTool } from '../nav';
import { keepAwake, releaseAwake } from '../wakelock';

const RATE_EVERY = 150; // seconds between ratings

export function ExposureTool({ kind: initialKind }: { kind?: ErpSession['kind'] }) {
  const t = targets.value;
  const list = triggers.value;
  const [phase, setPhase] = useState<'setup' | 'run' | 'done'>('setup');
  const [kind, setKind] = useState<ErpSession['kind']>(initialKind ?? 'exposure');
  const [minutes, setMinutes] = useState<number>(t.exposureMin);
  const [trigger, setTrigger] = useState<Trigger | null>(() => pickTrigger(list));
  const [customText, setCustomText] = useState('');
  const [predicted, setPredicted] = useState<number | undefined>();
  const [fear, setFear] = useState('');
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [moved, setMoved] = useState(0);
  const [asking, setAsking] = useState(false);
  const [outcome, setOutcome] = useState('');
  const [learned, setLearned] = useState('');
  const [confirmExit, setConfirmExit] = useState(false);
  const sw = useStopwatch();
  const startedAt = useRef(0);
  const total = minutes * 60;
  const remaining = Math.max(0, total - sw.elapsed);
  const nextRateAt = ratings.length * RATE_EVERY;

  useEffect(() => {
    if (phase !== 'run' || !sw.running || asking) return;
    if (sw.elapsed >= total) {
      sw.pause();
      setAsking(true);
      play('done');
      return;
    }
    if (ratings.length > 0 && sw.elapsed >= nextRateAt) {
      setAsking(true);
      play('tick');
    }
  });

  useEffect(() => () => releaseAwake(), []);

  const prompt = useMemo(() => EXPOSURE_PROMPTS[Math.floor(sw.elapsed / 45) % EXPOSURE_PROMPTS.length], [Math.floor(sw.elapsed / 45)]);

  function start() {
    setPhase('run');
    startedAt.current = Date.now();
    setAsking(true); // the first rating, before the clock starts
    keepAwake();
    play('bell');
  }

  function rate(v: number) {
    const tSec = Math.round(Math.min(sw.elapsed, total));
    setRatings((r) => [...r, { t: tSec, v }]);
    setAsking(false);
    if (!sw.started) sw.start();
    if (sw.elapsed >= total) finish([...ratings, { t: tSec, v }]);
  }

  function finish(final = ratings) {
    sw.pause();
    releaseAwake();
    setRatings(final);
    setAsking(false);
    setPhase('done');
  }

  async function save() {
    const session: ErpSession = {
      id: newId('e'),
      kind,
      triggerId: trigger?.id,
      triggerText: trigger?.text ?? (customText.trim() || undefined),
      startedAt: startedAt.current,
      durationSec: Math.round(Math.min(sw.elapsed, total)),
      plannedMin: minutes,
      predicted,
      fear: fear.trim() || undefined,
      ratings,
      moved,
      outcome: outcome.trim() || undefined,
      learned: learned.trim() || undefined,
      completed: sw.elapsed >= total * 0.8,
    };
    await updateDayList(today.value, 'erp', (l) => [...l, session]);
    if (trigger) {
      const items = triggers.value.map((x) =>
        x.id === trigger.id ? { ...x, count: (x.count ?? 0) + 1, lastAt: Date.now(), status: x.status === 'todo' ? ('practicing' as const) : x.status } : x,
      );
      await mergeDocument('erp/hierarchy', { items });
    }
    notify(session.completed ? '这一次练完了。每一次都在给大脑新的证据。' : '记下了。没练完也算数，下次接着来。', 'success');
    closeTool();
  }

  const close = () => {
    if (phase === 'run') setConfirmExit(true);
    else closeTool();
  };

  const peak = ratings.length ? Math.max(...ratings.map((r) => r.v)) : undefined;
  const first = ratings[0]?.v;
  const last = ratings[ratings.length - 1]?.v;
  const dayRules = activePlan.value.rules.filter((r) => r.scene === 'day').map((r) => r.text);

  return (
    <ToolFrame title={kind === 'imperfect-bed' ? '故意铺不好' : '白天暴露练习'} onClose={close}>
      {phase === 'setup' ? (
        <div class="stack loose">
          <Segmented
            label="练习类型"
            options={[
              { value: 'exposure', label: '白天暴露' },
              { value: 'imperfect-bed', label: '故意铺不好' },
            ]}
            value={kind}
            onChange={setKind}
          />
          {kind === 'exposure' ? (
            <div class="callout">
              <Icon name="info" />
              <div class="stack tight">
                {(dayRules.length ? dayRules : ['穿睡衣躺下，把被子搭在最敏感的位置。不动、不调、不转移注意力。']).map((r) => (
                  <p key={r}>{r}</p>
                ))}
              </div>
            </div>
          ) : (
            <ol class="stack tight small soft" style={{ paddingLeft: '18px' }}>
              {IMPERFECT_BED_STEPS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          )}
          <Field label="这次练哪个情境">
            {list.length ? (
              <div class="seg" role="group" aria-label="情境">
                {[...list]
                  .sort((a, b) => (a.score ?? 999) - (b.score ?? 999))
                  .map((x) => (
                    <button type="button" key={x.id} aria-pressed={trigger?.id === x.id} onClick={() => setTrigger(trigger?.id === x.id ? null : x)}>
                      {x.text}
                      {x.score !== undefined ? <span class="xs" style={{ opacity: 0.7 }}>{x.score}</span> : null}
                    </button>
                  ))}
              </div>
            ) : null}
            {!trigger ? (
              <input class="input" placeholder="例如：被子搭在肩膀上" value={customText} onInput={(e) => setCustomText((e.target as HTMLInputElement).value)} aria-label="情境" />
            ) : null}
          </Field>
          <Field label="练多久">
            <Segmented
              label="分钟"
              options={[10, 15, 20, 30].map((m) => ({ value: m, label: `${m} 分钟` }))}
              value={minutes}
              onChange={setMinutes}
            />
          </Field>
          <Field label="你预测最高会到几分？" hint="练完会对比预测和实际，这一步很关键">
            <Scale label="预测最高分" value={predicted} onChange={setPredicted} low="0 没感觉" high="10 难受到极点" />
          </Field>
          <Field label="你担心会发生什么？（可不填）">
            <TextArea label="担心会发生什么" rows={2} value={fear} onInput={setFear} placeholder="例如：会越来越难受，一直停不下来" />
          </Field>
          <button type="button" class="btn primary lg block" onClick={start}>
            <Icon name="play" />
            开始
          </button>
        </div>
      ) : null}

      {phase === 'run' ? (
        <div class="stack loose" style={{ justifyItems: 'center' }}>
          <Dial value={sw.elapsed / total} color="var(--c-sleep)">
            <span class="dial-time">{formatDuration(remaining)}</span>
            <span class="dial-sub">
              {sw.started ? `已打分 ${ratings.length} 次${sw.paused && !asking ? ' · 已暂停' : ''}` : '先打第一个分'}
            </span>
          </Dial>
          {asking ? (
            <div class="rate-pad" style={{ width: '100%' }}>
              <p style={{ fontWeight: 700 }}>{ratings.length === 0 ? '开始前，现在几分？' : sw.elapsed >= total ? '时间到。最后打一个分' : '现在几分？'}</p>
              <Scale label="当前不适分" value={undefined} onChange={rate} low="0 没感觉" high="10 难受到极点" />
            </div>
          ) : (
            <p class="guide-line">{prompt}</p>
          )}
          <div class="tool-actions">
            <button type="button" class="btn" onClick={() => setMoved((m) => m + 1)}>
              <Icon name="hand" />
              我动了一下{moved ? `（${moved}）` : ''}
            </button>
            {sw.started && !asking ? (
              sw.running ? (
                <button type="button" class="btn" onClick={sw.pause}>
                  <Icon name="pause" />
                  暂停
                </button>
              ) : (
                <button type="button" class="btn" onClick={sw.resume}>
                  <Icon name="play" />
                  继续
                </button>
              )
            ) : null}
            <button type="button" class="btn ghost" onClick={() => finish()}>
              <Icon name="stop" />
              结束
            </button>
          </div>
          <p class="xs muted center">动了也照实点一下。记下来比假装没动更有用。</p>
        </div>
      ) : null}

      {phase === 'done' ? (
        <div class="stack loose">
          <div class="stack tight center">
            <p class="eyebrow">这一次</p>
            <h3 class="display" style={{ fontSize: 'var(--t-2xl)' }}>
              {first !== undefined && last !== undefined ? `${first} → ${last}` : '练习结束'}
            </h3>
            <p class="small soft">
              {[
                peak !== undefined ? `最高 ${peak} 分` : '',
                predicted !== undefined && peak !== undefined
                  ? predicted > peak
                    ? `比你预测的低 ${predicted - peak} 分`
                    : predicted === peak
                      ? '和你预测的一样'
                      : `比预测高 ${peak - predicted} 分，记下来也是证据`
                  : '',
                `练了 ${Math.max(1, Math.round(Math.min(sw.elapsed, total) / 60))} 分钟`,
                moved ? `动了 ${moved} 次` : '一次没动',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          {ratings.length >= 2 ? <CurveChart ratings={ratings} minutes={minutes} color="var(--c-sleep)" /> : null}
          <Field label="实际怎样？（可不填）">
            <div class="seg" role="group" aria-label="和预想比">
              {['比想的轻', '差不多', '比想的难'].map((c) => (
                <button type="button" key={c} aria-pressed={outcome === c} onClick={() => setOutcome(outcome === c ? '' : c)}>
                  {c}
                </button>
              ))}
            </div>
            <TextArea label="实际怎样" rows={2} value={['比想的轻', '差不多', '比想的难'].includes(outcome) ? '' : outcome} onInput={setOutcome} placeholder={fear ? `你担心：${fear}` : '或者写一句：一开始很想调，十分钟后没那么在意了'} />
          </Field>
          <Field label="学到了什么？（可不填）">
            <TextArea label="学到了什么" rows={2} value={learned} onInput={setLearned} placeholder="例如：不处理它，也没有发生什么坏事" />
          </Field>
          <button type="button" class="btn primary lg block" onClick={save}>
            <Icon name="check" />
            保存这次练习
          </button>
        </div>
      ) : null}

      {confirmExit ? (
        <div class="rate-pad" style={{ position: 'fixed', left: '16px', right: '16px', bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', width: 'auto', maxWidth: '520px', margin: '0 auto', zIndex: 70 }}>
          <p style={{ fontWeight: 700 }}>现在结束这次练习？</p>
          <p class="small soft">已经打的分会保存。</p>
          <div class="btn-row">
            <button type="button" class="btn primary" onClick={() => (setConfirmExit(false), finish())}>
              结束并保存
            </button>
            <button type="button" class="btn" onClick={() => setConfirmExit(false)}>
              继续练
            </button>
            <button type="button" class="btn ghost" onClick={() => (releaseAwake(), closeTool())}>
              不保存
            </button>
          </div>
        </div>
      ) : null}
    </ToolFrame>
  );
}

function pickTrigger(list: Trigger[]): Trigger | null {
  const practicing = list.filter((x) => x.status === 'practicing').sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  if (practicing[0]) return practicing[0];
  const todo = list.filter((x) => x.status === 'todo').sort((a, b) => (a.score ?? 999) - (b.score ?? 999));
  return todo[0] ?? null;
}
