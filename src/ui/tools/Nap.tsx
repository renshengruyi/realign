import { useEffect, useState } from 'preact/hooks';
import { formatDuration } from '../../domain/dates';
import type { NapLog } from '../../domain/types';
import { activePlan, notify, patchDay, targets, today } from '../../platform/store';
import { play } from '../audio';
import { Field, Scale, Segmented, Stepper, Switch, TextArea } from '../components/controls';
import { Dial } from '../components/Dial';
import { Icon } from '../components/Icon';
import { ToolFrame } from '../components/Sheet';
import { useStopwatch } from '../hooks';
import { closeTool } from '../nav';
import { keepAwake, releaseAwake } from '../wakelock';

export function NapTool() {
  const t = targets.value;
  const [phase, setPhase] = useState<'setup' | 'run' | 'done'>('setup');
  const [minutes, setMinutes] = useState(t.napMin);
  const [awake, setAwake] = useState(true);
  const [log, setLog] = useState<NapLog>({ done: true, adjustments: 0 });
  const sw = useStopwatch();
  const total = minutes * 60;

  useEffect(() => {
    if (phase === 'run' && sw.elapsed >= total) {
      play('chime');
      releaseAwake();
      setPhase('done');
    }
  });
  useEffect(() => () => releaseAwake(), []);

  const rule = activePlan.value.rules.find((r) => r.scene === 'nap')?.text ?? '穿着衣服躺下，一次都不调整；睡不睡着都算完成。';

  async function save() {
    await patchDay(today.value, { nap: { ...log, durationMin: Math.round(Math.min(sw.elapsed, total) / 60), at: Date.now() } });
    notify(log.adjustments ? '记下了。下次试试一次都不调。' : '一次都没调，这就是这次训练的目标。', 'success');
    closeTool();
  }

  return (
    <ToolFrame title="午睡训练" onClose={() => (releaseAwake(), closeTool())}>
      {phase === 'setup' ? (
        <div class="stack loose">
          <p class="guide-line">{rule}</p>
          <p class="small soft center">这段时间不是为了睡着，是练“让它在”。以前运气不好的下午，现在变成一次有意的练习。</p>
          <Field label="躺多久">
            <Segmented label="分钟" options={[15, 20, 25].map((m) => ({ value: m, label: `${m} 分钟` }))} value={minutes} onChange={setMinutes} />
          </Field>
          <Switch checked={awake} onChange={setAwake} label="保持屏幕常亮" sub="到点会响铃；关掉的话请另外设个闹钟" />
          <button
            type="button"
            class="btn primary lg block"
            onClick={() => {
              if (awake) keepAwake();
              play('bell');
              sw.start();
              setPhase('run');
            }}
          >
            <Icon name="play" />
            躺下，开始
          </button>
        </div>
      ) : null}
      {phase === 'run' ? (
        <div class="stack loose" style={{ justifyItems: 'center' }}>
          <Dial value={sw.elapsed / total} color="var(--c-sleep)">
            <span class="dial-time">{formatDuration(total - sw.elapsed)}</span>
            <span class="dial-sub">衣服怎么皱着就怎么皱着</span>
          </Dial>
          <p class="guide-line">冲动来了，注意到它，不行动。</p>
          <button type="button" class="btn ghost" onClick={() => (releaseAwake(), setPhase('done'))}>
            <Icon name="stop" />
            提前结束
          </button>
        </div>
      ) : null}
      {phase === 'done' ? (
        <div class="stack loose">
          <p class="guide-line">午睡训练完成。照实记一下就好。</p>
          <Field label="起来调整了几次">
            <Stepper label="调整次数" value={log.adjustments} onChange={(v) => setLog({ ...log, adjustments: v })} max={30} suffix="次" />
          </Field>
          <Field label="最难受的时候几分">
            <Scale label="最高不适分" value={log.maxDiscomfort} onChange={(v) => setLog({ ...log, maxDiscomfort: v })} low="0 没感觉" high="10 难受到极点" />
          </Field>
          <Field label="睡着了吗">
            <Segmented
              label="是否睡着"
              options={[
                { value: 'no', label: '没睡着' },
                { value: 'light', label: '迷糊了一下' },
                { value: 'yes', label: '睡着了' },
              ]}
              value={log.slept}
              onChange={(v) => setLog({ ...log, slept: v })}
            />
          </Field>
          <Field label="备注（可不填）">
            <TextArea label="备注" rows={2} value={log.note} onInput={(v) => setLog({ ...log, note: v })} />
          </Field>
          <button type="button" class="btn primary lg block" onClick={save}>
            <Icon name="check" />
            保存
          </button>
        </div>
      ) : null}
    </ToolFrame>
  );
}
