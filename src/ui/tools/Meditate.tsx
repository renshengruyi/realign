import { useEffect, useState } from 'preact/hooks';
import { formatDuration } from '../../domain/dates';
import { PRACTICES, type Practice } from '../../domain/defaults';
import { dayOf, notify, patchDay, today } from '../../platform/store';
import { play } from '../audio';
import { Icon } from '../components/Icon';
import { ToolFrame } from '../components/Sheet';
import { useStopwatch } from '../hooks';
import { closeTool } from '../nav';
import { keepAwake, releaseAwake } from '../wakelock';

function breathAt(p: Practice, sec: number): { label: string; size: number } {
  const b = p.breath!;
  const parts = [
    { label: '吸', len: b.inhale, from: 0.42, to: 0.92 },
    { label: '停', len: b.hold ?? 0, from: 0.92, to: 0.92 },
    { label: '呼', len: b.exhale, from: 0.92, to: 0.42 },
    { label: '停', len: b.holdOut ?? 0, from: 0.42, to: 0.42 },
  ].filter((x) => x.len > 0);
  const cycle = parts.reduce((a, x) => a + x.len, 0);
  let t = sec % cycle;
  for (const part of parts) {
    if (t < part.len) {
      const k = t / part.len;
      const ease = 0.5 - Math.cos(Math.PI * k) / 2;
      return { label: part.label, size: part.from + (part.to - part.from) * ease };
    }
    t -= part.len;
  }
  return { label: '', size: 0.42 };
}

export function MeditateTool({ practice: initialId, slot }: { practice?: string; slot?: 'am' | 'pm' }) {
  const [practice, setPractice] = useState<Practice | null>(() => PRACTICES.find((p) => p.id === initialId) ?? null);
  const [phase, setPhase] = useState<'pick' | 'run' | 'done'>(practice ? 'run' : 'pick');
  const sw = useStopwatch();
  const total = (practice?.minutes ?? 10) * 60;

  useEffect(() => {
    if (phase === 'run' && practice && !sw.started) {
      play('bell');
      keepAwake();
      sw.start();
    }
  }, [phase, practice]);

  useEffect(() => {
    if (phase === 'run' && sw.elapsed >= total) void complete(total);
  });
  useEffect(() => () => releaseAwake(), []);

  async function complete(sec: number) {
    if (phase !== 'run') return;
    setPhase('done');
    sw.pause();
    releaseAwake();
    play('bell');
    const minutes = Math.max(1, Math.round(sec / 60));
    const which = practice?.slot === 'any' ? (slot ?? (new Date().getHours() < 15 ? 'am' : 'pm')) : (practice?.slot ?? slot ?? 'am');
    const field = which === 'am' ? 'meditateAmMin' : 'meditatePmMin';
    const cur = dayOf(today.value)?.habits?.[field] ?? 0;
    await patchDay(today.value, { habits: { [field]: cur + minutes } });
    notify(`冥想 ${minutes} 分钟，记好了`, 'success');
  }

  const line = practice ? [...practice.lines].reverse().find((l) => l.at <= sw.elapsed)?.text : '';
  const breath = practice?.breath ? breathAt(practice, sw.elapsed) : null;

  return (
    <ToolFrame title={practice?.title ?? '冥想与呼吸'} onClose={() => (releaseAwake(), closeTool())}>
      {phase === 'pick' ? (
        <div class="stack">
          {PRACTICES.map((p) => (
            <button
              type="button"
              key={p.id}
              class="practice-card"
              data-k="calm"
              onClick={() => {
                setPractice(p);
                setPhase('run');
              }}
            >
              <span class="pc-icon">
                <Icon name={p.slot === 'pm' ? 'moon' : p.slot === 'am' ? 'sun' : 'wave'} />
              </span>
              <b>{p.title}</b>
              <span class="pc-sub">{p.subtitle}</span>
            </button>
          ))}
        </div>
      ) : null}
      {phase === 'run' && practice ? (
        <div class="stack loose" style={{ justifyItems: 'center' }}>
          {breath ? (
            <div class="breath" aria-hidden="true">
              <span class="ring" />
              <span class="orb" style={{ width: `${breath.size * 100}%`, height: `${breath.size * 100}%`, transition: 'width 0.25s linear, height 0.25s linear' }} />
              <span class="breath-label">{breath.label}</span>
            </div>
          ) : (
            <div class="breath" aria-hidden="true">
              <span class="ring" />
              <span class="orb" style={{ width: '62%', height: '62%', opacity: 0.55 }} />
            </div>
          )}
          <p class="dial-time" style={{ fontSize: 'var(--t-3xl)' }}>
            {formatDuration(total - sw.elapsed)}
          </p>
          <p class="guide-line" aria-live="polite">
            {line}
          </p>
          <div class="tool-actions">
            {sw.running ? (
              <button type="button" class="btn" onClick={sw.pause}>
                <Icon name="pause" />
                暂停
              </button>
            ) : (
              <button type="button" class="btn" onClick={sw.resume}>
                <Icon name="play" />
                继续
              </button>
            )}
            <button type="button" class="btn ghost" onClick={() => complete(sw.elapsed)}>
              <Icon name="stop" />
              结束并记录
            </button>
          </div>
        </div>
      ) : null}
      {phase === 'done' ? (
        <div class="stack loose" style={{ justifyItems: 'center', paddingTop: '8vh' }}>
          <p class="guide-line">练完了。{practice?.slot === 'pm' ? '今晚睡得怎样都可以。' : '带着这份清醒开始今天。'}</p>
          <button type="button" class="btn primary lg" onClick={closeTool}>
            好
          </button>
        </div>
      ) : null}
    </ToolFrame>
  );
}
