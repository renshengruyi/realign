import { useState } from 'preact/hooks';
import { formatDate, hmToMin, nowHM, nowMin, weekday } from '../../domain/dates';
import { GUT_SYMPTOMS } from '../../domain/defaults';
import { sleepHours } from '../../domain/metrics';
import type { GutLog, Journal, SleepLog } from '../../domain/types';
import { round1, toKg, unitLabel } from '../../domain/units';
import { aiReady } from '../../platform/ai-client';
import { dayOf, notify, patchDay, profile, settings, targets, today } from '../../platform/store';
import { generateBrief } from '../brief';
import { Chips, Field, Scale, Segmented, Stepper, Switch, TextArea, TimeInput } from '../components/controls';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { closeSheet } from '../nav';

const LATENCY = [
  { value: 10, label: '15 分钟内' },
  { value: 22, label: '15–30 分钟' },
  { value: 45, label: '半小时到 1 小时' },
  { value: 90, label: '1–2 小时' },
  { value: 150, label: '2 小时以上' },
];

export function MorningCheckin() {
  const date = today.value;
  const day = dayOf(date);
  const t = targets.value;
  const nightUps = day?.urges?.filter((u) => u.decision === 'got-up').length;
  const now = nowMin();
  const [s, setS] = useState<SleepLog>(() => ({
    bedtime: t.bedTime,
    wakeTime: now >= 4 * 60 && now <= 12 * 60 ? nowHM() : t.wakeTime,
    refits: nightUps ?? 0,
    nocturia: 0,
    ...(day?.sleep ?? {}),
  }));
  const [energy, setEnergy] = useState<number | undefined>(day?.energy?.am);
  const set = (patch: Partial<SleepLog>) => setS((x) => ({ ...x, ...patch }));
  const hours = sleepHours(s);

  async function save() {
    const first = !day?.sleep?.loggedAt;
    await patchDay(date, { sleep: { ...s, loggedAt: day?.sleep?.loggedAt ?? Date.now() }, energy: energy ? { am: energy } : undefined });
    closeSheet();
    notify(s.stuckButSlept ? '记下了。卡着也睡着了，这才是真正的进展。' : '晨间打卡完成', 'success');
    if (first && aiReady() && !dayOf(date)?.brief) void generateBrief();
  }

  return (
    <Sheet
      title="晨间打卡"
      onClose={closeSheet}
      footer={
        <>
          <button type="button" class="btn ghost" onClick={closeSheet}>
            取消
          </button>
          <button type="button" class="btn primary" onClick={save}>
            <Icon name="check" />
            保存
          </button>
        </>
      }
    >
      <p class="small soft">
        记的是昨晚（{formatDate(date)} 早上醒来的这一晚）。大概就行，不用精确。
        {hours !== undefined ? ` 估算睡了约 ${round1(hours)} 小时。` : ''}
      </p>
      <div class="row wrap" style={{ gap: '16px' }}>
        <Field label="几点上床">
          <TimeInput label="上床时间" value={s.bedtime} onChange={(v) => set({ bedtime: v })} id="ci-bed" />
        </Field>
        <Field label="几点起床">
          <TimeInput label="起床时间" value={s.wakeTime} onChange={(v) => set({ wakeTime: v })} id="ci-wake" />
        </Field>
      </div>
      <Field label="大概多久睡着">
        <Segmented label="入睡用时" options={LATENCY} value={nearest(s.latencyMin)} onChange={(v) => set({ latencyMin: v })} />
      </Field>
      <Field label="起来重铺或调整了几次" hint={nightUps !== undefined ? `夜里计时记了 ${nightUps} 次` : '下床铺被子、起来调衣服都算'}>
        <Stepper label="重铺次数" value={s.refits} onChange={(v) => set({ refits: v })} max={30} suffix="次" />
      </Field>
      <Field label="夜里最难受的时候几分">
        <Scale label="最高不适分" value={s.maxDiscomfort} onChange={(v) => set({ maxDiscomfort: v })} low="0 没感觉" high="10 难受到极点" />
      </Field>
      <div class="stack tight">
        <Switch checked={!!s.stuckButSlept} onChange={(v) => set({ stuckButSlept: v })} label="卡着也睡着了" sub="被子明明还卡着，没有起来，然后睡着了" />
        <Switch checked={!!s.leftBed} onChange={(v) => set({ leftBed: v })} label="用了 20 分钟离床规则" sub="较劲太久，去别的房间待了一会" />
        <Switch checked={!!s.tired} onChange={(v) => set({ tired: v })} label="昨天很累" />
      </div>
      <Field label="起夜几次">
        <Stepper label="起夜次数" value={s.nocturia} onChange={(v) => set({ nocturia: v })} max={10} suffix="次" />
      </Field>
      <Field label="睡得怎样">
        <Scale five label="睡眠质量" value={s.quality} onChange={(v) => set({ quality: v })} low="1 很差" high="5 很好" />
      </Field>
      <Field label="起床时的精力">
        <Scale five label="起床精力" value={energy} onChange={setEnergy} low="1 很累" high="5 很足" />
      </Field>
      <Field label="备注（可不填）">
        <TextArea label="备注" value={s.note} onInput={(v) => set({ note: v })} rows={2} placeholder="例如：换了薄被、睡前看了手机" />
      </Field>
    </Sheet>
  );
}

function nearest(min: number | undefined): number | undefined {
  if (min === undefined) return undefined;
  return LATENCY.reduce((a, b) => (Math.abs(b.value - min) < Math.abs(a.value - min) ? b : a)).value;
}

export function EveningCheckin() {
  const date = today.value;
  const day = dayOf(date);
  const unit = profile.value.weightUnit;
  const isWeighDay = weekday(date) === settings.value.weighDay;
  const [pm, setPm] = useState<number | undefined>(day?.energy?.pm);
  const [gut, setGut] = useState<GutLog>(day?.gut ?? {});
  const [mood, setMood] = useState<number | undefined>(day?.mood);
  const [social, setSocial] = useState<boolean>(!!day?.habits?.social);
  const [socialNote, setSocialNote] = useState(day?.habits?.socialNote ?? '');
  const [j, setJ] = useState<Journal>(day?.journal ?? {});
  const [weight, setWeight] = useState('');

  async function save() {
    const wrote = !!(j.win?.trim() || j.hard?.trim() || j.tomorrow?.trim());
    const w = Number(weight);
    await patchDay(date, {
      energy: pm ? { pm } : undefined,
      gut,
      mood,
      habits: { social, socialNote: socialNote || undefined, journal: wrote || day?.habits?.journal },
      journal: j,
      eveningAt: Date.now(),
      weightKg: weight && Number.isFinite(w) && w > 0 ? round1(toKg(unit, w)) : undefined,
    });
    closeSheet();
    notify('晚间打卡完成。今天辛苦了。', 'success');
  }

  const late = (hmToMin(nowHM()) ?? 0) > (hmToMin(targets.value.bedTime) ?? 1380) - 60;

  return (
    <Sheet
      title="晚间打卡"
      onClose={closeSheet}
      footer={
        <>
          <button type="button" class="btn ghost" onClick={closeSheet}>
            取消
          </button>
          <button type="button" class="btn primary" onClick={save}>
            <Icon name="check" />
            保存
          </button>
        </>
      }
    >
      <Field label="下午的精力">
        <Scale five label="下午精力" value={pm} onChange={setPm} low="1 很累" high="5 很足" />
      </Field>
      <Field label="今天胃部不适几分">
        <Scale label="胃部不适" value={gut.discomfort} onChange={(v) => setGut({ ...gut, discomfort: v })} low="0 很舒服" high="10 很难受" />
      </Field>
      <Field label="有这些情况吗">
        <Chips label="胃部症状" options={GUT_SYMPTOMS} values={gut.symptoms ?? []} onChange={(v) => setGut({ ...gut, symptoms: v })} />
      </Field>
      <Field label="今天的心情">
        <Scale five label="心情" value={mood} onChange={setMood} low="1 很低落" high="5 很好" />
      </Field>
      <div class="stack tight">
        <Switch checked={social} onChange={setSocial} label="今天和人有真正的交流" sub="见面、电话、认真聊天都算，工作消息不算" />
        {social ? (
          <input class="input" placeholder="和谁？（可不填）" value={socialNote} onInput={(e) => setSocialNote((e.target as HTMLInputElement).value)} aria-label="和谁交流" />
        ) : null}
      </div>
      <div class="stack">
        <p class="label small" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>
          三行日记
        </p>
        <TextArea label="今天做到的一件事" rows={2} value={j.win} onInput={(v) => setJ({ ...j, win: v })} placeholder="今天做到的一件事，再小也算" />
        <TextArea label="今天难的地方" rows={2} value={j.hard} onInput={(v) => setJ({ ...j, hard: v })} placeholder="今天难的地方" />
        <TextArea label="明天想做好的一件事" rows={2} value={j.tomorrow} onInput={(v) => setJ({ ...j, tomorrow: v })} placeholder="明天想做好的一件事" />
      </div>
      {isWeighDay && !day?.weightKg ? (
        <Field label={`今天是称重日（${unitLabel(unit)}）`} hint="早上起床、上完厕所、吃饭前称最准；晚上称也可以，备注一下">
          <input class="input" inputMode="decimal" placeholder={unit === 'jin' ? '例如 105' : '例如 52.5'} value={weight} onInput={(e) => setWeight((e.target as HTMLInputElement).value)} aria-label="体重" />
        </Field>
      ) : null}
      {late ? <p class="xs muted">快到上床时间了。打完卡就把手机放远一点。</p> : null}
    </Sheet>
  );
}
