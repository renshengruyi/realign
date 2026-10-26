// End-to-end run against the built page with a mocked claude.ai runtime.
// Usage: npm run build && npm run e2e   (screenshots land in tests/e2e/out)
import { mkdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';
import { buildFixture } from './fixture.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const OUT = 'tests/e2e/out';
const TODAY = '2026-10-26';
const ONLY = process.argv[2]; // optional: run one group
mkdirSync(OUT, { recursive: true });

const html = readFileSync('dist/index.html');
const png = makePng(16, 16);

function makePng(w, h) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  const raw = Buffer.alloc((w * 3 + 1) * h, 0xdd);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/_blob/')) {
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end(png);
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
});
await new Promise((r) => server.listen(4179, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:4179/';
const browser = await chromium.launch();

let failures = 0;
const check = (cond, msg) => {
  console.log(cond ? 'ok  ' : 'FAIL', msg);
  if (!cond) failures += 1;
};

async function open({ device = 'm', scheme = 'light', hash = '', seed = true, time = '13:05' } = {}) {
  const ctx = await browser.newContext({
    viewport: device === 'm' ? { width: 390, height: 844 } : { width: 1366, height: 900 },
    deviceScaleFactor: device === 'm' ? 2 : 1,
    colorScheme: scheme,
    timezoneId: 'Asia/Taipei',
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_(TUNNEL|NAME|CONNECTION|INTERNET|PROXY)/.test(m.text())) errors.push(m.text());
  });
  await page.clock.install({ time: new Date(`${TODAY}T${time}:00+08:00`) });
  await page.addInitScript((fx) => {
    window.__SEED__ = fx;
  }, seed ? buildFixture(TODAY) : {});
  await page.addInitScript({ path: 'tests/e2e/mock-claude.js' });
  await page.goto(BASE + (hash ? `#${hash}` : ''));
  await page.waitForSelector('.topbar', { timeout: 15000 });
  await page.waitForTimeout(500);
  return { ctx, page, errors };
}

const shot = async (page, name) => {
  // overlays are fixed to the viewport, so capture just the viewport while one is open
  const overlay = await page.locator('.tool, .sheet').count();
  if (overlay) await page.waitForTimeout(350); // let the entrance animation finish
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: overlay === 0 });
};
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const db = (page, path) => page.evaluate((p) => window.__DB__[p], path);
const calls = (page) => page.evaluate(() => window.__CALLS__);

async function finish(t, label) {
  check(t.errors.length === 0, `${label}: no page errors${t.errors.length ? ' — ' + t.errors.join(' | ') : ''}`);
  await t.ctx.close();
}

// ---------------------------------------------------------------- screens
if (!ONLY || ONLY === 'screens') {
  const configs = [
    ['m', 'light'],
    ['m', 'dark'],
    ['d', 'light'],
    ['d', 'dark'],
  ];
  for (const hash of ['today', 'practice', 'trends', 'record', 'coach']) {
    for (const [device, scheme] of configs) {
      if ((hash === 'practice' || hash === 'coach') && device === 'd' && scheme === 'light') continue;
      const t = await open({ device, scheme, hash });
      await shot(t.page, `${hash}-${device}-${scheme}`);
      check((await overflow(t.page)) <= 0, `${hash} ${device}/${scheme}: no horizontal overflow`);
      await finish(t, `${hash} ${device}/${scheme}`);
    }
  }
  const empty = await open({ seed: false, hash: 'trends' });
  await shot(empty.page, 'trends-empty-m-light');
  await finish(empty, 'trends empty');
}

// ---------------------------------------------------------------- morning check-in, brief, quick log
if (!ONLY || ONLY === 'today') {
  const t = await open({ time: '07:50' });
  const { page } = t;
  await page.locator('.checkin').first().click();
  await page.waitForSelector('.sheet');
  await shot(page, 'sheet-checkin-am-m-light');
  await page.getByRole('button', { name: '重铺次数增加' }).click();
  await page.getByRole('button', { name: '重铺次数增加' }).click();
  await page.getByRole('button', { name: '最高不适分 6' }).click();
  await page.locator('label.switch', { hasText: '卡着也睡着了' }).click();
  await page.getByRole('button', { name: '睡眠质量 3' }).click();
  await page.locator('.sheet-foot .btn.primary').click();
  await page.waitForTimeout(300);
  const day = await db(page, `days/${TODAY}`);
  check(day?.sleep?.refits === 2 && day?.sleep?.stuckButSlept === true && day?.sleep?.maxDiscomfort === 6, 'morning check-in saved');
  await page.waitForSelector('.brief-head', { timeout: 8000 });
  check((await page.locator('.brief-list li').count()) === 3, 'daily brief generated after check-in');
  const seal = await page.locator('.seal[data-k="sleep"] + .seal-label, .seal-btn').first().textContent();
  check(!!seal, 'seals render');

  await page.fill('#quick-log', '昨晚起来铺了3次，午饭吃得很慢');
  await page.locator('.quick-log button[type=submit]').click();
  await page.waitForSelector('text=记到', { timeout: 5000 });
  await shot(page, 'quicklog-preview-m-light');
  await page.locator('section[aria-label="一句话记录"]').getByRole('button', { name: '保存' }).click();
  await page.waitForTimeout(300);
  const d2 = await db(page, `days/${TODAY}`);
  check(d2?.sleep?.refits === 3 && d2?.meals?.some((m) => m.type === 'lunch' && m.slow), 'quick log applied (refits replaced, lunch appended)');
  const c = await calls(page);
  check(c.samples.some((s) => s.kind === 'quicklog' && s.modelTier === 'quick'), 'quick log uses the quick tier');

  await page.locator('.seal-btn').nth(1).click();
  await page.waitForSelector('.sheet');
  await shot(page, 'sheet-seal-m-light');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '编辑作息' }).click();
  await page.waitForSelector('.sheet');
  await shot(page, 'sheet-rhythm-m-light');
  await page.keyboard.press('Escape');
  await finish(t, 'today flows');
}

// ---------------------------------------------------------------- exposure session
if (!ONLY || ONLY === 'exposure') {
  const t = await open({ hash: 'practice', time: '16:30' });
  const { page } = t;
  await page.getByRole('button', { name: /白天暴露练习/ }).first().click();
  await page.waitForSelector('.tool');
  await page.getByRole('button', { name: '预测最高分 8' }).click();
  await shot(page, 'tool-exposure-setup-m-light');
  await page.getByRole('button', { name: '开始', exact: true }).click();
  await page.getByRole('button', { name: '当前不适分 6' }).click();
  await page.clock.fastForward(60_000);
  await page.waitForTimeout(400);
  await shot(page, 'tool-exposure-run-m-light');
  await page.clock.fastForward(91_000);
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '当前不适分 5' }).click();
  await page.clock.fastForward(15 * 60_000);
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '当前不适分 3' }).click();
  await page.waitForSelector('text=保存这次练习');
  await page.locator('textarea[aria-label="实际怎样"]').fill('前五分钟很想调，后来没那么在意');
  await shot(page, 'tool-exposure-done-m-light');
  await page.getByRole('button', { name: /保存这次练习/ }).click();
  await page.waitForTimeout(300);
  const day = await db(page, `days/${TODAY}`);
  const s = day?.erp?.[day.erp.length - 1];
  check(s && s.completed && s.ratings.length === 3 && s.predicted === 8 && s.ratings[2].v === 3, 'exposure session saved with ratings and prediction');
  const h = await db(page, 'erp/hierarchy');
  check(h.items.find((x) => x.id === 't2')?.count === 10, 'trigger practice count updated');
  await finish(t, 'exposure');
}

// ---------------------------------------------------------------- night urge
if (!ONLY || ONLY === 'night') {
  const t = await open({ time: '23:40', scheme: 'dark' });
  const { page } = t;
  await shot(page, 'today-night-m-dark');
  await page.getByRole('button', { name: '冲动来了' }).first().click();
  await page.waitForSelector('.tool.night');
  await page.locator('.tool.night .btn.primary.lg').click();
  await page.getByRole('button', { name: '现在的不适分 7' }).click();
  await shot(page, 'tool-night-wait-m-dark');
  await page.clock.fastForward(5 * 60_000 + 1000);
  await page.waitForTimeout(400);
  await shot(page, 'tool-night-decide-m-dark');
  await page.getByRole('button', { name: /留在床上/ }).click();
  await page.waitForTimeout(300);
  const day = await db(page, 'days/2026-10-27');
  check(day?.urges?.length === 1 && day.urges[0].decision === 'stayed' && day.urges[0].startScore === 7, 'night urge logged on the next morning');
  await finish(t, 'night');
}

// ---------------------------------------------------------------- other tools
if (!ONLY || ONLY === 'tools') {
  const t = await open({ hash: 'practice', time: '12:30' });
  const { page } = t;
  await page.getByRole('button', { name: /睡前 · 开阔觉察/ }).click();
  await page.waitForTimeout(300);
  await page.clock.fastForward(5 * 60_000);
  await page.waitForTimeout(300);
  await shot(page, 'tool-meditate-m-light');
  await page.getByRole('button', { name: /结束并记录/ }).click();
  await page.waitForTimeout(300);
  let day = await db(page, `days/${TODAY}`);
  check(day?.habits?.meditatePmMin === 5, 'meditation minutes logged');
  await page.getByRole('button', { name: '好', exact: true }).click();

  await page.getByRole('button', { name: /慢慢吃/ }).click();
  await page.clock.fastForward(21 * 60_000);
  await page.waitForTimeout(300);
  await shot(page, 'tool-meal-m-light');
  await page.getByRole('button', { name: /吃完了/ }).click();
  await page.getByRole('button', { name: '饱腹感 3' }).click();
  await page.getByRole('button', { name: /^保存$/ }).click();
  await page.waitForSelector('.tool', { state: 'detached' });
  await page.waitForTimeout(200);
  day = await db(page, `days/${TODAY}`);
  check(day?.meals?.some((m) => m.slow && m.type === 'lunch' && m.durationMin >= 20 && m.fullness === 3), 'meal coach saved a slow lunch');

  await page.getByRole('button', { name: /体态 10 分钟/ }).click();
  await page.getByRole('button', { name: '开始', exact: true }).click();
  await shot(page, 'tool-workout-m-light');
  await page.getByRole('button', { name: /完成这一组/ }).click();
  await page.waitForTimeout(200);
  await shot(page, 'tool-workout-rest-m-light');
  await page.getByRole('button', { name: /提前结束/ }).click();
  await page.waitForTimeout(300);
  day = await db(page, `days/${TODAY}`);
  check((day?.habits?.postureMin ?? 0) >= 1, 'workout minutes logged');
  await page.getByRole('button', { name: '好', exact: true }).click();

  await page.getByRole('button', { name: /坐站节拍/ }).click();
  await page.waitForSelector('.fab-pill');
  await page.clock.fastForward(30 * 60_000 + 2000);
  await page.waitForTimeout(1200);
  day = await db(page, `days/${TODAY}`);
  check((day?.stand?.focusBlocks ?? 0) >= 1, 'sit-stand counted a focus block');
  await shot(page, 'sitstand-pill-m-light');
  await finish(t, 'tools');
}

// ---------------------------------------------------------------- coach
if (!ONLY || ONLY === 'coach') {
  const t = await open({ hash: 'coach' });
  const { page } = t;
  await page.locator('.suggestions button').first().click();
  await page.waitForSelector('.action-chip', { timeout: 10000 });
  await page.waitForTimeout(300);
  await shot(page, 'coach-chat-m-light');
  const c = await calls(page);
  const chat = c.samples.find((s) => s.kind === 'chat');
  check(chat && chat.tools.includes('get_days') && chat.cache === false, 'chat sends context with the read tool and no cache');
  await page.locator('.action-chip').first().getByRole('button', { name: '确认' }).click();
  await page.waitForTimeout(300);
  const mems = await page.evaluate(() => Object.keys(window.__DB__).filter((k) => k.startsWith('memory/')).length);
  check(mems === 6, 'accepted memory saved');
  await page.locator('.action-chip').nth(1).getByRole('button', { name: '确认' }).click();
  await page.waitForTimeout(300);
  const plan = await db(page, 'plans/p1');
  check(plan.tasks.some((x) => x.text === '本周三前预约家医科'), 'accepted task added to the plan');

  await page.fill('#coach-input', '帮我看看更早的记录');
  await page.locator('.composer button[type=submit]').click();
  await page.waitForTimeout(2500);
  const threads = await page.evaluate(() => Object.entries(window.__DB__).filter(([k]) => k.startsWith('chats/')).map(([, v]) => v.messages.length));
  check(threads.length === 1 && threads[0] === 4, 'conversation stored as one thread');

  await page.getByRole('tab', { name: /每周复盘/ }).click();
  await shot(page, 'coach-review-before-m-light');
  await page.getByRole('button', { name: /开始复盘/ }).click();
  await page.waitForSelector('text=下周计划提议', { timeout: 10000 });
  await shot(page, 'coach-review-m-light');
  const rc = (await calls(page)).samples.find((s) => s.kind === 'review');
  check(rc?.modelTier === 'complex', 'review uses the complex tier');
  await page.getByRole('button', { name: /采用为本周计划/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole('tab', { name: /本周计划/ }).click();
  await page.waitForTimeout(200);
  check(await page.locator('text=第 2 周 · 上限降到 1 次').first().isVisible(), 'adopted plan is active');
  const meta = await db(page, 'meta/state');
  const newPlan = await db(page, `plans/${meta.activePlanId}`);
  check(newPlan?.targets?.refitCap === 1 && (await db(page, 'plans/p1')).status === 'archived', 'old plan archived, new targets applied');
  await shot(page, 'coach-plan-m-light');
  await page.getByRole('tab', { name: /记忆/ }).click();
  await shot(page, 'coach-memory-m-light');
  await finish(t, 'coach');
}

// ---------------------------------------------------------------- record
if (!ONLY || ONLY === 'record') {
  const t = await open({ hash: 'record' });
  const { page } = t;
  await page.locator('section[aria-label="检查记录"] .link').click();
  await page.waitForSelector('.sheet');
  await page.locator('.sheet input[type=file]').setInputFiles({ name: 'report.png', mimeType: 'image/png', buffer: png });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /用 AI 识别数值/ }).click();
  await page.waitForSelector('input[aria-label="项目"]', { timeout: 8000 });
  await page.waitForTimeout(200);
  await shot(page, 'sheet-checkup-m-light');
  const rc = (await calls(page)).samples.find((s) => s.kind === 'report');
  check(rc?.images === 1, 'report photo sent to AI');
  await page.locator('.sheet-foot .btn.primary').click();
  await page.waitForTimeout(300);
  const recs = await page.evaluate(() => Object.entries(window.__DB__).filter(([k]) => k.startsWith('checkups/')).map(([, v]) => v));
  const added = recs.find((r) => r.id !== 'ck1');
  check(added && added.results.length === 3 && added.results[0].flag === 'L' && added.files.length === 1, 'checkup record saved with flags and file');
  await page.locator('section[aria-label="检查记录"] .list-row').first().click();
  await page.getByRole('button', { name: /用 AI 解读/ }).click();
  await page.waitForTimeout(1500);
  await shot(page, 'sheet-checkup-view-m-light');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /导出全部数据/ }).click();
  await page.waitForTimeout(500);
  const dl = (await calls(page)).downloads;
  check(dl.length === 1 && /realign-backup-\d{4}-\d{2}-\d{2}\.json/.test(dl[0].filename), 'backup offered as a download');
  await finish(t, 'record');
}

// ---------------------------------------------------------------- forms
if (!ONLY || ONLY === 'forms') {
  const t = await open({ time: '21:20' });
  const { page } = t;
  // evening check-in
  await page.locator('.checkin', { hasText: '晚间打卡' }).click();
  await page.waitForSelector('.sheet');
  await page.getByRole('button', { name: '下午精力 2' }).click();
  await page.getByRole('button', { name: '胃部不适 4' }).click();
  await page.locator('.sheet').getByRole('button', { name: '反流' }).click();
  await page.getByRole('button', { name: '心情 3' }).click();
  await page.locator('textarea[aria-label="今天做到的一件事"]').fill('午睡没有调衣服');
  await page.waitForTimeout(350);
  await shot(page, 'sheet-checkin-pm-m-light');
  await page.locator('.sheet-foot .btn.primary').click();
  await page.waitForSelector('.sheet', { state: 'detached' });
  let day = await db(page, `days/${TODAY}`);
  check(day?.energy?.pm === 2 && day?.gut?.discomfort === 4 && day?.gut?.symptoms?.includes('反流') && day?.habits?.journal === true && day?.eveningAt, 'evening check-in saved');

  // wrap-up writes tomorrow's three things
  await page.goto(BASE + '#today');
  await page.waitForSelector('.topbar');
  await page.evaluate(() => {
    document.querySelector('#timeline')?.scrollIntoView();
  });
  await page.locator('.tl-main', { hasText: '收工仪式' }).click();
  await page.waitForSelector('.sheet');
  await page.locator('input[aria-label="明天第 1 件事"]').fill('预约家医科');
  await page.locator('input[aria-label="明天第 2 件事"]').fill('买薄被套');
  await page.locator('textarea[aria-label="担心停车场"]').fill('工作邮件明早再回');
  await page.locator('.sheet-foot .btn.primary').click();
  await page.waitForSelector('.sheet', { state: 'detached' });
  const tomorrow = await db(page, 'days/2026-10-27');
  day = await db(page, `days/${TODAY}`);
  check(tomorrow?.top3?.length === 2 && day?.habits?.shutdown === true && day?.journal?.worries, 'wrap-up saved tomorrow\'s three things');

  // weight in 斤
  await page.waitForSelector('.tile');
  await page.locator('.tile', { hasText: '体重' }).click();
  await page.waitForSelector('.sheet');
  await page.locator('input[aria-label="体重"]').fill('106');
  await page.locator('.sheet-foot .btn.primary').click();
  await page.waitForSelector('.sheet', { state: 'detached' });
  day = await db(page, `days/${TODAY}`);
  check(day?.weightKg === 53, 'weight in 斤 stored as kg');

  // profile
  await page.goto(BASE + '#record');
  await page.waitForSelector('.topbar');
  await page.locator('section[aria-label="个人资料"] .link').click();
  await page.waitForSelector('.sheet');
  await page.locator('input[aria-label="身高"]').fill('172');
  await page.locator('input[aria-label="新状况"]').fill('偶尔偏头痛');
  await page.locator('.sheet form button[type=submit]').click();
  await page.locator('.sheet-foot .btn.primary').click();
  await page.waitForSelector('.sheet', { state: 'detached' });
  const prof = await db(page, 'profile/main');
  check(prof.heightCm === 172 && prof.conditions.length === 4 && prof.goalWeightKg === 58, 'profile saved, goal weight kept');

  // plan edit
  await page.goto(BASE + '#coach');
  await page.waitForSelector('.topbar');
  await page.getByRole('tab', { name: /本周计划/ }).click();
  await page.getByRole('button', { name: /修改计划/ }).click();
  await page.waitForSelector('.sheet');
  await page.getByRole('button', { name: '每天冥想（分钟）增加' }).click();
  await page.locator('.sheet-foot .btn.primary').click();
  await page.waitForSelector('.sheet', { state: 'detached' });
  const plan = await db(page, 'plans/p1');
  check(plan.targets.meditationMin === 25 && plan.targets.refitCap === 1, 'plan targets edited');

  // trigger list
  await page.goto(BASE + '#practice');
  await page.waitForSelector('.topbar');
  await page.locator('section[aria-label="触发清单和处理动作"] .link').click();
  await page.waitForSelector('.sheet');
  await page.locator('input[aria-label="新情境"]').fill('穿高领毛衣');
  await page.locator('.sheet form').first().locator('button[type=submit]').click();
  await page.locator('.sheet-foot .btn.primary').click();
  await page.waitForSelector('.sheet', { state: 'detached' });
  const h = await db(page, 'erp/hierarchy');
  check(h.items.length === 5 && h.items.some((x) => x.text === '穿高领毛衣'), 'trigger list saved');
  await finish(t, 'forms');
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
