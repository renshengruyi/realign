# 回正 Realign

A personal health tracker and coach that runs as a [claude.ai Artifact](https://claude.ai). It is built for one person's long-term recovery: sleep (including ERP practice for a sensory "not-right" feeling at bedtime), eating for a sensitive stomach and weight gain, posture and strength, calm, and the checkups that go with them. Every time it opens it shows where things stand today and what to do next.

The interface is in Simplified Chinese.

## What it does

| Area | What's there |
| --- | --- |
| 今天 Today | Four daily seals (睡 食 动 静) that fill as the day's targets are met; what's due now; the day's rhythm as a timeline; one-minute morning and evening check-ins; a one-line logger that turns a sentence into structured records; an AI brief for the day; today's three things; a seven-day status panel |
| 练习 Practice | Guided ERP exposure with ratings every 2.5 minutes and a prediction-vs-actual summary; nap training; a near-black night screen that runs the "wait 5 minutes before acting" rule and counts get-ups; morning and bedtime meditations with a breathing pacer; an eat-slowly meal timer; posture and strength follow-alongs; a sit–stand rhythm; an evening wrap-up |
| 趋势 Trends | Seal calendar, sleep, get-ups against the nightly cap, exposure start→end per session, weight against the healthy BMI band, stomach, energy and mood, movement, meditation, week-by-week table, plain-language comparisons and milestones. Every chart has a table view |
| 档案 Record | Profile and conditions, long-term goals with progress, a prioritized checkup plan with signals from the logs that are worth raising with a doctor, lab records (photo → AI extraction → flagged values → AI explanation), massage log, settings, full JSON backup and restore |
| 教练 Coach | Chat grounded in the person's data, plan and memory; proposed memories, plan tasks and log entries that only apply after confirmation; weekly reviews that propose next week's plan; plan history; editable memory cards |

## Memory and planning

- **Daily records** are kept as they were logged, one document per day.
- **Memory cards** hold durable facts and preferences. The coach proposes them; the person confirms, edits, pins or deletes them.
- **Weekly reviews** compress a week into a few sentences and a proposed plan, so the coach can see months back without rereading every day.
- **Plans** go from long-term goals to a phase, to this week's rules, targets and tasks, to today's rhythm. Each adopted review creates a new plan version; old ones stay in the history.

Every AI call sends the coach's standing rules, a compact text picture of the profile, memory, active plan, the last two weeks of logs and recent reviews. Chat can also call a read-only `get_days` tool for older records.

## How it runs

- Preact with signals, built by Vite into one self-contained HTML file (`artifact/realign.html`).
- Platform capabilities, reached through `window.claude.use(...)`:
  - `db` for all records. The published page declares owner-only read and write rules, so a shared link never exposes the data.
  - `sample` for the coach (no API key in the page or the repository).
  - `assets` for report photos and PDFs, `downloads` for backups.
- Outside a claude.ai viewer the page falls back to a localStorage store with the same API, marked 本机模式, and the AI features hide themselves.

## Develop

```sh
npm install
npm run dev        # local mode in the browser
npm test           # unit tests (vitest)
npm run build      # typecheck, bundle, write artifact/realign.html
npm run e2e        # end-to-end flows and screenshots against a mocked claude.ai runtime
```

The end-to-end run uses made-up data from `tests/e2e/fixture.mjs`; screenshots land in `tests/e2e/out/`.

## Privacy

No personal data lives in this repository. Everything a person logs is stored in the artifact's own database under owner-only rules.

## Not medical advice

The app helps with self-tracking and habit practice. It does not diagnose or prescribe, and the coach is instructed to point to a doctor when the logs show warning signs.
