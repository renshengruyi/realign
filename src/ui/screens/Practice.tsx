import { PRACTICES, ROUTINES, SCENE_LABEL } from '../../domain/defaults';
import { activePlan, rituals, targets, triggers } from '../../platform/store';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';
import { openSheet, openTool } from '../nav';
import { startSitStand } from '../sitstand';

interface Card {
  key: 'sleep' | 'food' | 'move' | 'calm';
  icon: string;
  title: string;
  sub: string;
  run: () => void;
}

export function PracticeScreen() {
  const t = targets.value;
  const plan = activePlan.value;
  const groups: { title: string; note: string; cards: Card[] }[] = [
    {
      title: '睡眠训练',
      note: '目标不是让不适感消失，而是不处理它，也能照样睡着。',
      cards: [
        { key: 'sleep', icon: 'play', title: '白天暴露练习', sub: `${t.exposureMin} 分钟 · 每 2–3 分钟打一次分`, run: () => openTool('exposure') },
        { key: 'sleep', icon: 'bed', title: '午睡训练', sub: `${t.napMin} 分钟 · 一次都不调`, run: () => openTool('nap') },
        { key: 'sleep', icon: 'moon', title: '夜间冲动计时', sub: `先等 ${t.urgeDelayMin} 分钟 · 记下重铺几次`, run: () => openTool('night') },
        { key: 'sleep', icon: 'refresh', title: '故意铺不好', sub: '针对“必须铺对”这一点', run: () => openTool('exposure', { kind: 'imperfect-bed' }) },
      ],
    },
    {
      title: '安静下来',
      note: '早晚各十分钟。睡前那次练的是“让它在”。',
      cards: PRACTICES.map((p) => ({
        key: 'calm' as const,
        icon: p.slot === 'pm' ? 'moon' : p.slot === 'am' ? 'sun' : 'wave',
        title: p.title,
        sub: p.subtitle,
        run: () => openTool('meditate', { practice: p.id, slot: p.slot === 'any' ? undefined : p.slot }),
      })),
    },
    {
      title: '身体',
      note: '先体态和轻力量，配合吃够，才能把体重养回来。',
      cards: [
        ...ROUTINES.map((r) => ({
          key: 'move' as const,
          icon: r.kind === 'posture' ? 'stand' : 'dumbbell',
          title: r.title,
          sub: r.subtitle,
          run: () => openTool('workout', { routine: r.id }),
        })),
        { key: 'move', icon: 'timer', title: '坐站节拍', sub: `坐 ${t.sitMin} 分钟，站 ${t.standMin} 分钟`, run: () => startSitStand() },
        { key: 'food', icon: 'meal', title: '慢慢吃', sub: '吃饭计时，每分钟提醒一次', run: () => openTool('meal') },
      ],
    },
    {
      title: '收尾',
      note: '把白天的事停在纸上，别带到床上。',
      cards: [{ key: 'calm', icon: 'pen', title: '收工仪式', sub: '写下明天三件事，担心先放进暂存区', run: () => openSheet('shutdown') }],
    },
  ];

  const sorted = [...triggers.value].sort((a, b) => (a.score ?? 999) - (b.score ?? 999));

  return (
    <div class="page wide">
      <TopBar title="练习" />
      <section class="card stack" aria-label="本周规则">
        <div class="section-head">
          <h2>本周规则</h2>
          <span class="small muted">{plan.title}</span>
        </div>
        <ul class="rules">
          {plan.rules.map((r, i) => (
            <li key={i}>
              <span class="scene">{SCENE_LABEL[r.scene] ?? r.scene}</span>
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      </section>

      {groups.map((g) => (
        <section class="practice-group" key={g.title} aria-label={g.title}>
          <div class="section-head">
            <h2>{g.title}</h2>
          </div>
          <p class="small muted">{g.note}</p>
          <div class="practice-grid">
            {g.cards.map((c) => (
              <button type="button" class="practice-card" data-k={c.key} key={c.title} onClick={c.run}>
                <span class="pc-icon">
                  <Icon name={c.icon} />
                </span>
                <b>{c.title}</b>
                <span class="pc-sub">{c.sub}</span>
              </button>
            ))}
          </div>
        </section>
      ))}

      <section class="card stack" aria-label="触发清单和处理动作">
        <div class="section-head">
          <h2>触发清单</h2>
          <button type="button" class="link" onClick={() => openSheet('hierarchy')}>
            编辑
          </button>
        </div>
        <p class="small muted">会引发这种感觉的情境，各打一个 0–10 的难受分。暴露练习从 4–6 分的开始，慢慢往上。</p>
        {sorted.length ? (
          <ul class="list">
            {sorted.map((x) => (
              <li class="list-row" key={x.id}>
                <span class="num" style={{ width: '36px', fontWeight: 700 }}>
                  {x.score ?? '—'}
                </span>
                <span class="grow">{x.text}</span>
                <span class={`pill${x.status === 'done' ? ' good' : x.status === 'practicing' ? ' primary' : ''}`}>
                  {x.status === 'done' ? '已适应' : x.status === 'practicing' ? `练习中${x.count ? ` ${x.count} 次` : ''}` : '未开始'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <button type="button" class="btn" style={{ justifySelf: 'start' }} onClick={() => openSheet('hierarchy')}>
            <Icon name="plus" />
            填写触发清单
          </button>
        )}
        <hr class="divider" />
        <div class="section-head">
          <h3 style={{ fontSize: 'var(--t-md)' }}>我的处理动作</h3>
        </div>
        <p class="small muted">所有会做的动作，越细越好，包括心里默念“没事”。这些都是要慢慢放下的。</p>
        {rituals.value.length ? (
          <ul class="list">
            {rituals.value.map((r) => (
              <li class="list-row" key={r.id}>
                <span class="grow">{r.text}</span>
                <span class={`pill${r.status === 'dropped' ? ' good' : r.status === 'reducing' ? ' primary' : ''}`}>
                  {r.status === 'dropped' ? '已放下' : r.status === 'reducing' ? '在减少' : '还在做'}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
