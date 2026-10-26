// A stand-in for the claude.ai viewer runtime, injected before the app loads.
// db: in-memory documents with the platform's merge and query rules.
// sample: canned answers chosen by what the prompt asks for, streamed in chunks.
(() => {
  const seed = window.__SEED__ || {};
  const docs = {};
  for (const [path, body] of Object.entries(seed)) docs[path] = JSON.parse(JSON.stringify(body));
  window.__DB__ = docs;
  window.__CALLS__ = { samples: [], downloads: [], uploads: [] };

  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const merge = (a, b) => {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k], v) : clone(v);
    return out;
  };
  const tick = () => new Promise((r) => setTimeout(r, 5));
  const docSubs = new Map();
  const qSubs = new Set();
  const snap = (path) => {
    const body = docs[path];
    return { id: path.split('/').pop(), exists: !!body, data: () => (body ? clone(body) : undefined), metadata: { fromCache: false, hasPendingWrites: false } };
  };
  const run = (coll, spec) => {
    const pre = coll + '/';
    let list = Object.keys(docs).filter((p) => p.startsWith(pre) && !p.slice(pre.length).includes('/')).sort();
    list = list.filter((p) =>
      spec.filters.every((f) => {
        const v = docs[p][f.field];
        switch (f.op) {
          case '==': return v === f.value;
          case '>=': return v !== undefined && v >= f.value;
          case '<=': return v !== undefined && v <= f.value;
          case '>': return v !== undefined && v > f.value;
          case '<': return v !== undefined && v < f.value;
          default: return true;
        }
      }),
    );
    const out = list.map(snap);
    return { docs: out, size: out.length, empty: !out.length };
  };
  const notify = (path) => {
    (docSubs.get(path) || new Set()).forEach((fn) => fn(snap(path)));
    const coll = path.split('/').slice(0, -1).join('/');
    qSubs.forEach((s) => s.coll === coll && s.next(run(s.coll, s.spec)));
  };
  const docRef = (path) => ({
    id: path.split('/').pop(),
    path,
    async get() { await tick(); return snap(path); },
    async set(d) { await tick(); docs[path] = clone(d); notify(path); },
    async update(d) {
      await tick();
      if (!docs[path]) throw { code: 'invalid_argument', message: 'missing ' + path };
      docs[path] = merge(docs[path], d);
      notify(path);
    },
    async delete() { await tick(); delete docs[path]; notify(path); },
    onSnapshot(next) {
      if (!docSubs.has(path)) docSubs.set(path, new Set());
      docSubs.get(path).add(next);
      setTimeout(() => next(snap(path)), 10);
      return () => docSubs.get(path).delete(next);
    },
  });
  const queryRef = (coll, spec) => ({
    where: (field, op, value) => queryRef(coll, { ...spec, filters: [...spec.filters, { field, op, value }] }),
    orderBy: () => queryRef(coll, spec),
    limit: () => queryRef(coll, spec),
    async get() { await tick(); return run(coll, spec); },
    onSnapshot(next) {
      const s = { coll, spec, next };
      qSubs.add(s);
      setTimeout(() => next(run(coll, spec)), 10);
      return () => qSubs.delete(s);
    },
  });
  const db = Object.freeze({
    doc: docRef,
    collection: (path) => ({ ...queryRef(path, { filters: [] }), path, doc: (id) => docRef(`${path}/${id || Math.random().toString(36).slice(2)}`) }),
  });

  // ---------------------------------------------------------------- AI
  const BRIEF = {
    headline: '今晚守住上限，午睡一次都不调',
    focus: [
      { title: '13:15 午睡训练 20 分钟，衣服皱着也不调', why: '最近三次午睡平均调整 2 次' },
      { title: '晚餐 19:00 前吃完，慢慢吃 20 分钟', why: '晚餐晚的那几天胃部不适更高' },
      { title: '冲动来了先等 5 分钟再决定', why: '上周有 4 晚超过了上限' },
    ],
    note: '昨晚卡着也睡着了一次，这是最重要的进展。',
    caution: '',
  };
  const REVIEW = {
    summary: '这周记录了 6 天，守住上限 4 晚，暴露练习的结束分数普遍比开始低 2–3 分。午睡还是会起来调衣服。',
    wins: ['卡着也睡着了 1 晚', '暴露练习做了 6 次，每次都练满'],
    struggles: ['累的晚上起来重铺 3–4 次', '晚餐常常拖到 20:30 以后'],
    insights: ['晚餐 20 点以后的 3 天，第二天胃部不适平均高 2 分'],
    erp: { decision: 'advance', rationale: '上限守住 4/6 晚，暴露练习结束分数在下降，可以把上限降到 1 次。' },
    nextWeek: {
      title: '第 2 周 · 上限降到 1 次',
      phase: '阶段二：白天结构化暴露',
      focus: '晚上最多起来 1 次，开始练“故意铺不好就躺下”。',
      rules: [
        { scene: 'night', text: '冲动来了先躺着不动 5 分钟，观察它' },
        { scene: 'night', text: '一晚最多起来重铺 1 次；之后就留在床上，允许它卡着' },
        { scene: 'day', text: '暴露练习从触发清单 40–60 分的情境开始' },
        { scene: 'day', text: '每周两次“故意铺不好就躺下”，每次 15 分钟' },
        { scene: 'base', text: '晚餐 19:00 前吃完' },
      ],
      targets: { refitCap: 1, exposurePerWeek: 7 },
      tasks: ['周三前预约家医科抽血', '买一条薄的纯棉被套'],
    },
    changes: ['晚上上限 2 次 → 1 次', '加入“故意铺不好”练习'],
    memories: [{ text: '晚餐晚于 20 点，第二天胃更不舒服', category: '饮食' }],
    referral: '',
  };
  const REPORT = {
    date: '2026-10-20',
    place: '测试诊所',
    title: '血液检查',
    results: [
      { name: '血红蛋白 Hb', value: 12.6, unit: 'g/dL', low: 13.5, high: 17.5, flag: 'L' },
      { name: '空腹血糖', value: 88, unit: 'mg/dL', low: 70, high: 99, flag: 'N' },
      { name: 'TSH', value: 1.9, unit: 'μIU/mL', low: 0.4, high: 4.0, flag: 'N' },
    ],
    notes: '第二页有一部分反光，没有识别。',
  };

  function respond(prompt, opts) {
    if (prompt.includes('请写今天的简报')) return JSON.stringify(BRIEF);
    if (prompt.includes('把用户的一句话变成健康记录')) {
      const date = (prompt.match(/今天是 (\d{4}-\d{2}-\d{2})/) || [])[1];
      return JSON.stringify({ date, summary: '昨晚起来重铺 3 次，午饭吃得慢', patch: { sleep: { refits: 3, maxDiscomfort: 7 }, meals: [{ time: '12:30', type: 'lunch', slow: true }] }, unsure: [] });
    }
    if (prompt.includes('并给出下一周的计划')) return JSON.stringify(REVIEW);
    if (prompt.includes('体检或化验报告')) return JSON.stringify(REPORT);
    if (prompt.includes('用通俗的话解释')) return '**血红蛋白偏低**：12.6，比参考下限低一点，可能和体重偏轻、吃得少有关。\n- 空腹血糖、TSH 都在正常范围。\n- 下次看医生可以问：要不要查铁蛋白和维生素 B12？\n\n以医生的解读为准。';
    return '看了你最近两周的记录：守住上限的晚上，第二天精力明显更好。\n\n今晚可以这样做：\n1. 冲动来了先等 5 分钟\n2. 到了上限就留在床上\n3. 记下最难受时的分数\n\n```actions\n[{"type":"memory","text":"累的晚上冲动更强","category":"睡眠"},{"type":"task","text":"本周三前预约家医科"}]\n```';
  }

  async function sample(input, opts = {}) {
    const prompt = typeof input === 'string' ? input : input.map((t) => t.content).join('\n');
    window.__CALLS__.samples.push({ kind: kindOf(prompt), modelTier: opts.modelTier, images: opts.images ? [].concat(opts.images).length : 0, tools: (opts.tools || []).map((t) => t.name), cache: opts.cache, bytes: prompt.length });
    if (opts.tools && prompt.includes('更早')) await opts.tools[0].execute({ from: '2026-09-01', to: '2026-09-10' }, { signal: new AbortController().signal });
    const text = respond(prompt, opts);
    if (opts.onText) {
      let acc = '';
      for (let i = 0; i < text.length; i += 12) {
        await new Promise((r) => setTimeout(r, 15));
        if (opts.signal && opts.signal.aborted) throw { code: 'cancelled', message: 'aborted', text: acc };
        const delta = text.slice(i, i + 12);
        acc += delta;
        opts.onText({ text: acc, delta });
      }
    } else await new Promise((r) => setTimeout(r, 120));
    return { text, truncated: false, modelTierApplied: opts.modelTier || 'default' };
  }
  function kindOf(p) {
    if (p.includes('请写今天的简报')) return 'brief';
    if (p.includes('把用户的一句话变成健康记录')) return 'quicklog';
    if (p.includes('并给出下一周的计划')) return 'review';
    if (p.includes('体检或化验报告')) return 'report';
    if (p.includes('用通俗的话解释')) return 'explain';
    return 'chat';
  }
  sample.json = async (input, opts) => JSON.parse((await sample(input, opts)).text);
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 20000000, mediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] }, tools: { maxCount: 8 } });

  const assets = Object.freeze({
    async upload(blob) {
      const id = Array.from({ length: 32 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
      window.__CALLS__.uploads.push({ id, type: blob.type, size: blob.size });
      return { id, url: '/_blob/' + id, sizeBytes: blob.size, contentType: blob.type };
    },
    async delete() { return { deleted: true }; },
  });
  const downloads = Object.freeze({
    async save(req) {
      window.__CALLS__.downloads.push({ filename: req.filename, size: String(req.data).length });
      return { status: 'saved' };
    },
  });

  const caps = { db, sample, assets, downloads };
  window.claude = Object.freeze({ use: (name) => new Promise((r) => setTimeout(() => r(caps[name] || null), 20)) });
})();
