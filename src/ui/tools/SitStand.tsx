import { useState } from 'preact/hooks';
import { formatDuration } from '../../domain/dates';
import { dayOf, today } from '../../platform/store';
import { Field, Segmented } from '../components/controls';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { closeSheet, openSheet } from '../nav';
import {
  advance,
  pauseSitStand,
  remainingSec,
  resumeSitStand,
  sitstand,
  sitstandTick,
  startSitStand,
  stopSitStand,
} from '../sitstand';

export function SitStandPill() {
  const s = sitstand.value;
  void sitstandTick.value;
  if (!s) return null;
  const left = remainingSec(s);
  const len = (s.phase === 'sit' ? s.sitMin : s.standMin) * 60;
  const r = 12;
  const c = 2 * Math.PI * r;
  return (
    <button type="button" class="fab-pill" onClick={() => openSheet('sitstand')} aria-label={`坐站节拍：${s.phase === 'sit' ? '专注' : '站起来'}，还剩 ${Math.ceil(left / 60)} 分钟`}>
      <span>{s.pausedAt ? '已暂停' : s.phase === 'sit' ? '专注中' : '站起来'}</span>
      <span class="num">{formatDuration(left)}</span>
      <svg class="ring" viewBox="0 0 30 30" aria-hidden="true">
        <circle cx="15" cy="15" r={r} fill="none" stroke="currentColor" stroke-opacity="0.25" stroke-width="3" />
        <circle
          cx="15"
          cy="15"
          r={r}
          fill="none"
          stroke={s.phase === 'sit' ? 'var(--c-sleep)' : 'var(--c-move)'}
          stroke-width="3"
          stroke-linecap="round"
          stroke-dasharray={c}
          stroke-dashoffset={c * (left / len)}
          transform="rotate(-90 15 15)"
        />
      </svg>
    </button>
  );
}

export function SitStandSheet() {
  const s = sitstand.value;
  void sitstandTick.value;
  const [sitMin, setSitMin] = useState(s?.sitMin ?? 30);
  const [standMin, setStandMin] = useState(s?.standMin ?? 10);
  const stand = dayOf(today.value)?.stand;
  return (
    <Sheet title="坐站节拍" onClose={closeSheet}>
      <p class="small soft">坐着专注一段，站起来动一段。站的时候走一走、倒杯水、做几次收下巴，别在原地刷手机。</p>
      <p class="small">
        今天完成专注 <b>{stand?.focusBlocks ?? 0}</b> 段，站起来 <b>{stand?.breaks ?? 0}</b> 次。
      </p>
      {s ? (
        <div class="card flat stack">
          <p style={{ fontWeight: 700 }}>
            {s.phase === 'sit' ? '专注中' : '站起来'} · 还剩 <span class="num">{formatDuration(remainingSec(s))}</span>
            {s.pausedAt ? '（已暂停）' : ''}
          </p>
          <div class="btn-row">
            {s.pausedAt ? (
              <button type="button" class="btn primary" onClick={resumeSitStand}>
                <Icon name="play" />
                继续
              </button>
            ) : (
              <button type="button" class="btn" onClick={pauseSitStand}>
                <Icon name="pause" />
                暂停
              </button>
            )}
            <button type="button" class="btn" onClick={() => advance(false)}>
              <Icon name="next" />
              {s.phase === 'sit' ? '现在就站起来' : '现在就坐下'}
            </button>
            <button type="button" class="btn ghost" onClick={() => (stopSitStand(), closeSheet())}>
              <Icon name="stop" />
              结束
            </button>
          </div>
        </div>
      ) : null}
      <Field label="坐多久">
        <Segmented label="坐的分钟" options={[25, 30, 45, 60].map((m) => ({ value: m, label: `${m} 分钟` }))} value={sitMin} onChange={setSitMin} />
      </Field>
      <Field label="站多久">
        <Segmented label="站的分钟" options={[5, 10, 15, 20].map((m) => ({ value: m, label: `${m} 分钟` }))} value={standMin} onChange={setStandMin} />
      </Field>
      <button type="button" class="btn primary" style={{ justifySelf: 'start' }} onClick={() => (startSitStand({ sitMin, standMin }), closeSheet())}>
        <Icon name="play" />
        {s ? '按新设置重新开始' : '开始'}
      </button>
    </Sheet>
  );
}
