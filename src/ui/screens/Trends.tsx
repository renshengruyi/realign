import { useEffect, useState } from 'preact/hooks';
import { addDays, formatDate, rangeDates, shortDate, weekStartOf } from '../../domain/dates';
import {
  completedExposures,
  computeInsights,
  computeMilestones,
  computeSeals,
  computeWeekStats,
  meditationMinutes,
  moveMinutes,
  nightRefits,
  sessionPeak,
  sleepHours,
} from '../../domain/metrics';
import { avg, healthyWeightRange, kgTo, round1, unitLabel } from '../../domain/units';
import { allDays, loadDays, profile, targets, today } from '../../platform/store';
import { ChartCard, ColumnChart, LineChart, SealGrid, SessionChart, type Bell } from '../components/charts';
import { Empty } from '../components/controls';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';
import { openSheet } from '../nav';

type Range = 14 | 56 | 365;

const RANGES: { value: Range; label: string }[] = [
  { value: 14, label: '近 2 周' },
  { value: 56, label: '近 8 周' },
  { value: 365, label: '近一年' },
];

const n1 = (v: number | undefined) => (v === undefined ? '—' : String(round1(v)));

export function TrendsScreen() {
  const [range, setRange] = useState<Range>(14);
  const to = today.value;
  const from = addDays(to, -(range - 1));
  useEffect(() => {
    if (range > 120) void loadDays(from, addDays(to, -120));
  }, [range]);

  const all = allDays.value;
  const t = targets.value;
  const unit = profile.value.weightUnit;
  const dates = rangeDates(from, to);
  const logged = dates.filter((d) => all[d]);
  const firstLogged = logged[0];
  // trim leading empty days so a new user doesn't see a mostly blank axis
  const view = firstLogged && range > 14 ? rangeDates(firstLogged < from ? from : firstLogged, to) : dates;

  const insights = computeInsights(all, from, to, t);
  const milestones = computeMilestones(all, t);

  const sleep = view.map((d) => ({ date: d, v: sleepHours(all[d]?.sleep) }));
  const refits = view.map((d) => ({ date: d, v: nightRefits(all[d]) }));
  const sessions: Bell[] = view.flatMap((d) =>
    completedExposures(all[d]).map((s) => ({
      id: s.id,
      date: d,
      a: s.ratings[0]?.v,
      b: s.ratings[s.ratings.length - 1]?.v,
      peak: sessionPeak(s),
      predicted: s.predicted,
    })),
  );
  const weights = view.map((d) => ({ date: d, v: all[d]?.weightKg !== undefined ? round1(kgTo(unit, all[d].weightKg as number)) : undefined }));
  const hasWeight = weights.some((w) => w.v !== undefined);
  const band = profile.value.heightCm ? healthyWeightRange(profile.value.heightCm).map((kg) => round1(kgTo(unit, kg))) : undefined;
  const gut = view.map((d) => ({ date: d, v: all[d]?.gut?.discomfort }));
  const energyAm = view.map((d) => ({ date: d, v: all[d]?.energy?.am }));
  const energyPm = view.map((d) => ({ date: d, v: all[d]?.energy?.pm }));
  const mood = view.map((d) => ({ date: d, v: all[d]?.mood }));
  const move = view.map((d) => ({ date: d, v: all[d] ? moveMinutes(all[d]) || undefined : undefined }));
  const med = view.map((d) => ({ date: d, v: all[d] ? meditationMinutes(all[d]) || undefined : undefined }));
  const sealRows = (['sleep', 'food', 'move', 'calm'] as const).map((k, i) => ({
    key: k,
    char: '睡食动静'[i],
    color: `var(--c-${k})`,
    values: view.slice(-28).map((d) => (all[d] ? computeSeals(all[d], t)[i].progress : undefined)),
  }));

  const weeks = Array.from(new Set(view.map((d) => weekStartOf(d)))).sort().reverse().slice(0, 12);
  const weekRows = weeks.map((w) => computeWeekStats(w, all, t));

  const has = (pts: { v?: number }[]) => pts.some((p) => p.v !== undefined);

  return (
    <div class="page wide">
      <TopBar title="趋势" />
      <div class="range-row" role="group" aria-label="时间范围">
        {RANGES.map((r) => (
          <button type="button" key={r.value} class="chip" aria-pressed={range === r.value} onClick={() => setRange(r.value)}>
            {r.label}
          </button>
        ))}
        <span class="small muted">
          {formatDate(view[0])} – {formatDate(to)} · 有记录 {logged.length} 天
        </span>
      </div>

      {logged.length === 0 ? (
        <div class="card">
          <Empty icon="trends" title="还没有可以画的数据">
            做几天晨间和晚间打卡，这里就会出现睡眠、体重、胃和精力的变化。
          </Empty>
        </div>
      ) : null}

      {insights.length || milestones.length ? (
        <div class="trend-grid">
          {insights.length ? (
            <section class="card stack" aria-label="发现">
              <div class="section-head">
                <h2>从记录里看到的</h2>
              </div>
              {insights.map((x) => (
                <div class="insight" key={x.id}>
                  <b>{x.title}</b>
                  <span class="small soft">{x.detail}</span>
                </div>
              ))}
              <p class="xs muted">这些是同一段时间里的对比，天数少的时候只能当线索看。</p>
            </section>
          ) : null}
          {milestones.length ? (
            <section class="card stack" aria-label="里程碑">
              <div class="section-head">
                <h2>里程碑</h2>
                <span class="small muted">{milestones.length} 枚</span>
              </div>
              <ul class="milestones">
                {milestones.map((m) => (
                  <li key={m.id}>
                    <span class="milestone-seal" aria-hidden="true">
                      {m.glyph}
                    </span>
                    <span class="stack tight">
                      <b>{m.title}</b>
                      <span class="xs muted">
                        {formatDate(m.date)} · {m.detail}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      {logged.length ? (
        <div class="trend-grid">
          <section class="card stack span-2" aria-label="印谱">
            <div class="section-head">
              <h2>印谱</h2>
              <span class="small muted">最近 {Math.min(28, view.length)} 天的四枚章</span>
            </div>
            <SealGrid dates={view.slice(-28)} rows={sealRows} />
          </section>

          <ChartCard
            title="睡了多久"
            sub={`估算，上床到起床减去入睡时间 · 平均 ${n1(avg(sleep.map((x) => x.v)))} 小时`}
            table={{ head: ['日期', '小时', '上床', '起床', '入睡（分钟）'], rows: view.filter((d) => sleepHours(all[d]?.sleep) !== undefined).reverse().map((d) => [shortDate(d), n1(sleepHours(all[d]?.sleep)), all[d]?.sleep?.bedtime ?? '—', all[d]?.sleep?.wakeTime ?? '—', all[d]?.sleep?.latencyMin ?? '—']) }}
          >
            {has(sleep) ? <ColumnChart data={sleep} color="var(--c-sleep)" label="睡眠" unit="小时" target={7} targetLabel="7 小时" yMax={9} /> : <NoData />}
          </ChartCard>

          <ChartCard
            title="夜里起来重铺"
            sub={`上限 ${t.refitCap} 次 · 平均 ${n1(avg(refits.map((x) => x.v)))} 次/晚`}
            table={{ head: ['日期', '次数', '最高不适', '卡着也睡着'], rows: view.filter((d) => nightRefits(all[d]) !== undefined).reverse().map((d) => [shortDate(d), nightRefits(all[d]) ?? '—', all[d]?.sleep?.maxDiscomfort ?? '—', all[d]?.sleep?.stuckButSlept ? '是' : '']) }}
          >
            {has(refits) ? <ColumnChart data={refits} color="var(--c-sleep)" label="重铺" unit="次" target={t.refitCap} targetLabel={`上限 ${t.refitCap}`} format={(v) => String(Math.round(v))} /> : <NoData />}
          </ChartCard>

          <ChartCard
            title="暴露练习：开始 → 结束"
            sub="空心是开始分，实心是结束分，短横是你预测的最高分"
            table={{ head: ['日期', '开始', '最高', '结束', '预测'], rows: sessions.slice().reverse().map((s) => [shortDate(s.date), s.a ?? '—', s.peak ?? '—', s.b ?? '—', s.predicted ?? '—']) }}
          >
            {sessions.length ? <SessionChart items={sessions} color="var(--c-sleep)" /> : <NoData text="做完第一次暴露练习，这里会出现开始和结束的分数。" />}
          </ChartCard>

          <ChartCard
            title={`体重（${unitLabel(unit)}）`}
            sub={band ? `绿色带是 BMI 18.5–24 对应的体重：${band[0]}–${band[1]} ${unitLabel(unit)}` : '在档案里填身高，可以看到健康体重范围'}
            table={{ head: ['日期', `体重（${unitLabel(unit)}）`], rows: weights.filter((w) => w.v !== undefined).reverse().map((w) => [shortDate(w.date), w.v as number]) }}
          >
            {hasWeight ? (
              <LineChart
                label="体重"
                series={[{ name: '体重', color: 'var(--c-food)', data: weights }]}
                unit={unitLabel(unit)}
                band={band ? { lo: band[0], hi: band[1], label: '健康范围' } : undefined}
                connectGaps
              />
            ) : (
              <div class="stack" style={{ justifyItems: 'start' }}>
                <NoData text="每周称一次，这里会画出变化。" />
                <button type="button" class="btn sm" onClick={() => openSheet('weight')}>
                  <Icon name="scale" />
                  记一次体重
                </button>
              </div>
            )}
          </ChartCard>

          <ChartCard
            title="胃部不适"
            sub={`0–10 分 · 平均 ${n1(avg(gut.map((x) => x.v)))}`}
            table={{ head: ['日期', '不适', '症状'], rows: view.filter((d) => all[d]?.gut).reverse().map((d) => [shortDate(d), all[d]?.gut?.discomfort ?? '—', (all[d]?.gut?.symptoms ?? []).join('、')]) }}
          >
            {has(gut) ? <ColumnChart data={gut} color="var(--c-food)" label="胃部不适" unit="分" yMax={10} format={(v) => String(Math.round(v))} /> : <NoData />}
          </ChartCard>

          <ChartCard
            title="精力和心情"
            sub="1–5 分"
            legend={[
              { label: '起床精力', color: 'var(--s1)', line: true },
              { label: '下午精力', color: 'var(--s2)', line: true },
              { label: '心情', color: 'var(--s3)', line: true },
            ]}
            table={{ head: ['日期', '起床精力', '下午精力', '心情'], rows: view.filter((d) => all[d]?.energy || all[d]?.mood).reverse().map((d) => [shortDate(d), all[d]?.energy?.am ?? '—', all[d]?.energy?.pm ?? '—', all[d]?.mood ?? '—']) }}
          >
            {has(energyAm) || has(energyPm) || has(mood) ? (
              <LineChart
                label="精力和心情"
                unit="分"
                yMin={1}
                yMax={5}
                series={[
                  { name: '起床精力', color: 'var(--s1)', data: energyAm },
                  { name: '下午精力', color: 'var(--s2)', data: energyPm },
                  { name: '心情', color: 'var(--s3)', data: mood },
                ]}
              />
            ) : (
              <NoData />
            )}
          </ChartCard>

          <ChartCard
            title="活动"
            sub={`运动、体态和散步，分钟 · 目标每天 ${t.moveMin} 分钟`}
            table={{ head: ['日期', '活动（分钟）'], rows: move.filter((m) => m.v !== undefined).reverse().map((m) => [shortDate(m.date), m.v as number]) }}
          >
            {has(move) ? <ColumnChart data={move} color="var(--c-move)" label="活动" unit="分钟" target={t.moveMin} format={(v) => String(Math.round(v))} /> : <NoData />}
          </ChartCard>

          <ChartCard
            title="冥想"
            sub={`早晚合计，分钟 · 目标每天 ${t.meditationMin} 分钟`}
            table={{ head: ['日期', '冥想（分钟）'], rows: med.filter((m) => m.v !== undefined).reverse().map((m) => [shortDate(m.date), m.v as number]) }}
          >
            {has(med) ? <ColumnChart data={med} color="var(--c-calm)" label="冥想" unit="分钟" target={t.meditationMin} format={(v) => String(Math.round(v))} /> : <NoData />}
          </ChartCard>

          <section class="card stack span-2" aria-label="每周对比">
            <div class="section-head">
              <h2>每周对比</h2>
            </div>
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>那一周</th>
                    <th>有记录</th>
                    <th>睡眠（时）</th>
                    <th>重铺（次/晚）</th>
                    <th>守住上限</th>
                    <th>暴露练习</th>
                    <th>胃部不适</th>
                    <th>精力（早/午）</th>
                    <th>力量训练</th>
                    <th>冥想（分）</th>
                  </tr>
                </thead>
                <tbody>
                  {weekRows.map((w) => (
                    <tr key={w.weekStart}>
                      <td>{shortDate(w.weekStart)} 起</td>
                      <td>{w.days} 天</td>
                      <td>{n1(w.sleepHours)}</td>
                      <td>{n1(w.refitsAvg)}</td>
                      <td>{w.refitNights ? `${w.capKeptNights}/${w.refitNights}` : '—'}</td>
                      <td>{w.exposures}</td>
                      <td>{n1(w.gutAvg)}</td>
                      <td>
                        {n1(w.energyAm)}/{n1(w.energyPm)}
                      </td>
                      <td>{w.exerciseSessions}</td>
                      <td>{w.meditationMin}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function NoData({ text = '这段时间还没有记录。' }: { text?: string }) {
  return <p class="small muted" style={{ padding: '24px 0' }}>{text}</p>;
}
