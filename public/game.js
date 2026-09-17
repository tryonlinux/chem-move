(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad2 = (n) => String(n).padStart(2, '0');
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const listJoin = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}` : a[0]);

  const PREFIX = 'chemmove:v1:';
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(PREFIX + k);
        return v == null ? d : JSON.parse(v);
      } catch { return d; }
    },
    set(k, v) {
      try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch { /* storage unavailable */ }
    },
    del(k) {
      try { localStorage.removeItem(PREFIX + k); } catch { /* storage unavailable */ }
    },
  };

  function seedFrom(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h | 0;
  }

  // mulberry32, with its state exposed so a game in progress can be saved and resumed.
  function makeRng(state) {
    const rng = () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.state = () => state;
    return rng;
  }
  const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const pick = (rng, arr) => arr[randInt(rng, 0, arr.length - 1)];

  // ---------------------------------------------------------------------------
  // Chemistry
  // ---------------------------------------------------------------------------
  // symbol: [atomic number, name, tile tint]. "_" is a blank tile.
  const BLANK = '_';
  const ELEMENTS = {
    _: [0, 'Blank', ''],
    H: [1, 'Hydrogen', '#9fb3cc'],
    C: [6, 'Carbon', '#6b7280'],
    N: [7, 'Nitrogen', '#3b82f6'],
    O: [8, 'Oxygen', '#ef4444'],
    F: [9, 'Fluorine', '#84cc16'],
    Na: [11, 'Sodium', '#a855f7'],
    Mg: [12, 'Magnesium', '#14b8a6'],
    Al: [13, 'Aluminium', '#94a3b8'],
    Si: [14, 'Silicon', '#d4a373'],
    P: [15, 'Phosphorus', '#f97316'],
    S: [16, 'Sulfur', '#eab308'],
    Cl: [17, 'Chlorine', '#22c55e'],
    K: [19, 'Potassium', '#8b5cf6'],
    Ca: [20, 'Calcium', '#0f766e'],
    Fe: [26, 'Iron', '#c2410c'],
    Zn: [30, 'Zinc', '#64748b'],
    I: [53, 'Iodine', '#7e22ce'],
  };

  // [id, common name, emoji, formula, fact]. Ids are saved with games: never rename one.
  const COMPOUNDS = [
    ['salt', 'Table salt', '🧂', 'NaCl', 'Sodium chloride. Seasoning, preserving and de-icing since ancient times.'],
    ['hydrogen', 'Hydrogen', '🎈', 'H₂', 'The lightest gas there is. The Sun is mostly hydrogen.'],
    ['oxygen', 'Oxygen', '🫁', 'O₂', 'About 21% of every breath you take.'],
    ['nitrogen', 'Nitrogen', '❄️', 'N₂', 'About 78% of the air. As a liquid it boils at −196 °C.'],
    ['chlorine', 'Chlorine', '🏊', 'Cl₂', 'A yellow-green gas used to disinfect drinking water.'],
    ['monoxide', 'Carbon monoxide', '🚨', 'CO', 'Colourless, odourless and toxic. The reason homes have CO alarms.'],
    ['stomach', 'Stomach acid', '🍽️', 'HCl', 'Hydrochloric acid. Your stomach makes it to digest food.'],
    ['quicklime', 'Quicklime', '🔥', 'CaO', 'Calcium oxide. Gets fiercely hot when mixed with water.'],
    ['magnesia', 'Magnesia', '🧱', 'MgO', 'Magnesium oxide. Lines furnaces and settles upset stomachs.'],
    ['iodine', 'Iodine', '🩹', 'I₂', 'Gives off purple vapour; dissolved, it is a brown antiseptic.'],
    ['zincoxide', 'Zinc oxide', '🧴', 'ZnO', 'The white stuff in mineral sunscreen.'],
    ['fluoride', 'Fluoride', '🪥', 'NaF', 'Sodium fluoride. Added to toothpaste to fight cavities.'],

    ['water', 'Water', '💧', 'H₂O', 'The only common substance found naturally as solid, liquid and gas.'],
    ['dryice', 'Dry ice', '🧊', 'CO₂', 'Solid carbon dioxide. It skips the liquid stage and turns straight to fog.'],
    ['ozone', 'Ozone', '🌍', 'O₃', 'High in the sky, a layer of it blocks ultraviolet light.'],
    ['laughing', 'Laughing gas', '😂', 'N₂O', 'Nitrous oxide. Dentists use it to take the edge off.'],
    ['rottenegg', 'Rotten-egg gas', '🥚', 'H₂S', 'Hydrogen sulfide. You can smell it at under one part per billion.'],
    ['so2', 'Sulfur dioxide', '🌋', 'SO₂', 'Volcanoes puff it out; winemakers add a pinch as a preservative.'],
    ['smog', 'Smog gas', '🏙️', 'NO₂', 'Nitrogen dioxide. The brown tint in city smog.'],
    ['prussic', 'Prussic acid', '🍑', 'HCN', 'Hydrogen cyanide. Smells of bitter almonds and is deadly.'],
    ['lye', 'Lye', '🧼', 'NaOH', 'Sodium hydroxide. Turns fat into soap and unclogs drains.'],
    ['causticpotash', 'Caustic potash', '🫧', 'KOH', 'Potassium hydroxide. Makes soft and liquid soaps.'],
    ['quartz', 'Quartz', '🏖️', 'SiO₂', 'Silicon dioxide: sand, glass and quartz crystals.'],
    ['roadsalt', 'Road salt', '🛣️', 'CaCl₂', 'Calcium chloride. Melts ice even at −30 °C.'],
    ['bleach', 'Bleach', '🧺', 'NaClO', 'Sodium hypochlorite, the active part of household bleach.'],
    ['foolsgold', "Fool's gold", '🪙', 'FeS₂', 'Pyrite. Shiny, brassy and worthless to a prospector.'],
    ['fluorite', 'Fluorite', '🔮', 'CaF₂', 'The mineral that gave fluorescence its name.'],

    ['ammonia', 'Ammonia', '🌱', 'NH₃', 'Made by the million tonnes to fertilise the crops that feed the world.'],
    ['peroxide', 'Peroxide', '🫧', 'H₂O₂', 'Hydrogen peroxide. Bleaches hair and fizzes on cuts.'],
    ['acetylene', 'Acetylene', '👨‍🏭', 'C₂H₂', 'Burns hot enough to cut steel in a welding torch.'],
    ['formaldehyde', 'Formaldehyde', '🫙', 'CH₂O', 'Preserves specimens in biology labs.'],
    ['phosphine', 'Phosphine', '🐟', 'PH₃', 'A toxic gas that smells of garlic or rotting fish.'],
    ['whitephos', 'White phosphorus', '✨', 'P₄', 'Glows in the dark and bursts into flame in air.'],
    ['so3', 'Sulfur trioxide', '☁️', 'SO₃', 'Add water and you get sulfuric acid. The culprit in acid rain.'],

    ['methane', 'Methane', '🐄', 'CH₄', 'Natural gas. Cows burp out a lot of it.'],
    ['chalk', 'Chalk', '🖍️', 'CaCO₃', 'Calcium carbonate: chalk, limestone, marble and seashells.'],
    ['nitric', 'Nitric acid', '⚗️', 'HNO₃', 'A strong acid. Turns skin yellow on contact.'],
    ['rust', 'Rust', '🔩', 'Fe₂O₃', 'Iron oxide. Also the red pigment of Mars.'],
    ['sapphire', 'Sapphire', '💎', 'Al₂O₃', 'Aluminium oxide. Add a trace of chromium and it is a ruby.'],
    ['chloroform', 'Chloroform', '😴', 'CHCl₃', 'An early surgical anaesthetic, long since retired.'],
    ['formic', 'Formic acid', '🐜', 'HCOOH', 'The sting in an ant bite. Its name comes from the Latin for ant.'],
    ['slakedlime', 'Slaked lime', '🪣', 'Ca(OH)₂', 'Calcium hydroxide. Hardens into limestone in old mortar.'],
    ['saltpeter', 'Saltpeter', '🍖', 'KNO₃', 'Potassium nitrate. Cures ham and feeds crops.'],
    ['milkmag', 'Milk of magnesia', '🥛', 'Mg(OH)₂', 'Magnesium hydroxide. A classic antacid.'],

    ['ethylene', 'Ethylene', '🍌', 'C₂H₄', 'A plant hormone that makes fruit ripen.'],
    ['bakingsoda', 'Baking soda', '🧁', 'NaHCO₃', 'Sodium bicarbonate. Releases CO₂ to make cakes rise.'],
    ['methanol', 'Wood alcohol', '🪵', 'CH₃OH', 'Methanol. Once distilled from wood, and poisonous to drink.'],
    ['carbonic', 'Carbonic acid', '🥤', 'H₂CO₃', 'Forms when CO₂ dissolves in water. The tang in fizzy drinks.'],
    ['hydrazine', 'Hydrazine', '🚀', 'N₂H₄', 'Fuel for spacecraft thrusters.'],
    ['washingsoda', 'Washing soda', '👕', 'Na₂CO₃', 'Sodium carbonate. Softens water for laundry.'],
    ['potash', 'Potash', '🌳', 'K₂CO₃', 'Potassium carbonate, once made by soaking wood ashes in pots.'],
    ['epsom', 'Epsom salt', '🛁', 'MgSO₄', 'Magnesium sulfate. Bath salts for sore muscles.'],
    ['salammoniac', 'Sal ammoniac', '🍬', 'NH₄Cl', 'Ammonium chloride. Salty liquorice gets its bite from it.'],

    ['sulfuric', 'Battery acid', '🔋', 'H₂SO₄', 'Sulfuric acid, the most produced industrial chemical on Earth.'],
    ['methylamine', 'Methylamine', '🦑', 'CH₃NH₂', 'Smells fishy. Used to make dyes and medicines.'],
    ['acetaldehyde', 'Acetaldehyde', '🤕', 'CH₃CHO', 'What your liver turns alcohol into. A big part of a hangover.'],
    ['sf6', 'Deep-voice gas', '🎤', 'SF₆', 'Sulfur hexafluoride. So dense it makes your voice drop.'],
    ['lodestone', 'Lodestone', '🧲', 'Fe₃O₄', 'Magnetite. Naturally magnetic; the first compasses used it.'],
    ['saltcake', 'Salt cake', '📄', 'Na₂SO₄', 'Sodium sulfate. Used by the tonne to make paper and detergent.'],

    ['ethane', 'Ethane', '⛽', 'C₂H₆', 'The second-biggest part of natural gas.'],
    ['vinegar', 'Vinegar', '🥗', 'CH₃COOH', 'Acetic acid gives vinegar its sour bite.'],
    ['cola', 'Cola acid', '🥫', 'H₃PO₄', 'Phosphoric acid. Gives cola its tang.'],
    ['urea', 'Urea', '🚽', 'CO(NH₂)₂', 'The first natural compound made in a lab, in 1828.'],
    ['brimstone', 'Brimstone', '😈', 'S₈', 'Sulfur. Its atoms link up in crown-shaped rings of eight.'],

    ['ethanol', 'Alcohol', '🍺', 'C₂H₅OH', 'Ethanol. Yeast makes it from sugar.'],
    ['propylene', 'Propylene', '🥣', 'C₃H₆', 'Propene. Turned into the plastic of yoghurt pots.'],
    ['ammoniumnitrate', 'Ammonium nitrate', '🌾', 'NH₄NO₃', 'A common fertiliser that feeds crops worldwide.'],

    ['acetone', 'Acetone', '💅', '(CH₃)₂CO', 'Nail polish remover.'],
    ['antifreeze', 'Antifreeze', '🚗', 'C₂H₄(OH)₂', 'Ethylene glycol. Keeps car engines from freezing.'],
    ['glycine', 'Glycine', '🧬', 'NH₂CH₂COOH', 'The simplest amino acid.'],
  ];

  // Where long names may break in narrow headers ("|" becomes a soft hyphen).
  const BREAKS = [
    'Formal|dehyde', 'Acet|aldehyde', 'Acetyl|ene', 'Chloro|form', 'Methyl|amine', 'Hydra|zine', 'Phos|phine',
    'Propyl|ene', 'Ethyl|ene', 'Anti|freeze', 'Quick|lime', 'Lode|stone', 'Brim|stone', 'Salt|peter', 'Per|oxide',
    'Fluor|ide', 'Fluor|ite', 'Hydro|gen', 'Nitro|gen', 'Mag|nesia', 'Mon|oxide', 'Di|oxide', 'Tri|oxide',
    'Sap|phire', 'Am|monia', 'Am|moniac', 'Am|monium', 'Carbon|ic', 'Phos|phorus', 'Sul|fur', 'Sul|furic', 'Ni|trate',
  ].map((w) => [w.replace('|', ''), w.replace('|', '\u00ad')]);
  const breakable = (name) => name.replace(/[A-Za-z]+/g, (w) => {
    const hit = BREAKS.find(([plain]) => plain.toLowerCase() === w.toLowerCase());
    return hit ? w.slice(0, hit[1].indexOf('\u00ad')) + '\u00ad' + w.slice(hit[1].indexOf('\u00ad')) : w;
  });

  const SUBS = '₀₁₂₃₄₅₆₇₈₉';
  function parseFormula(f) {
    const stack = [{}];
    let i = 0;
    const count = () => {
      let s = '';
      while (i < f.length && SUBS.includes(f[i])) s += SUBS.indexOf(f[i++]);
      return s ? Number(s) : 1;
    };
    const add = (into, el, k) => { into[el] = (into[el] || 0) + k; };
    while (i < f.length) {
      if (f[i] === '(') {
        stack.push({});
        i++;
      } else if (f[i] === ')') {
        i++;
        const inner = stack.pop();
        const k = count();
        for (const [el, c] of Object.entries(inner)) add(stack[stack.length - 1], el, c * k);
      } else {
        const m = f.slice(i).match(/^[A-Z][a-z]?/);
        if (!m || !ELEMENTS[m[0]]) throw new Error(`Bad formula ${f}`);
        i += m[0].length;
        add(stack[stack.length - 1], m[0], count());
      }
    }
    return stack[0];
  }

  const MOLS = COMPOUNDS.map(([id, name, emoji, formula, fact]) => {
    const atoms = parseFormula(formula);
    const size = Object.values(atoms).reduce((a, b) => a + b, 0);
    return { id, name, label: breakable(name), emoji, formula, fact, atoms, size, value: 5 * size };
  });
  const MOL = Object.fromEntries(MOLS.map((m) => [m.id, m]));

  // ---------------------------------------------------------------------------
  // Rules
  // ---------------------------------------------------------------------------
  const MIN_N = 3;
  const MAX_N = 10;
  const DAILY_N = 5;
  const SHUFFLES = 3;
  const HINT_COST = 2;
  const swapBudget = (n) => 10 + 6 * n;
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const LOG_EMOJI = { 0: '⬜', 1: '🟩', 2: '🟨', 3: '🟧', h: '💡', s: '🔀' };

  // Compounds a board of size n asks for: big enough to fill most of a line.
  const sizeRange = (n) => [Math.max(2, Math.ceil(n * 0.6)), n];
  const molsFor = (n) => {
    const [lo, hi] = sizeRange(n);
    return MOLS.filter((m) => m.size >= lo && m.size <= hi);
  };

  // Tiles are drawn in proportion to how often each element appears in this
  // size's compounds. Blanks make up the share of a line the average compound
  // leaves empty.
  const pools = {};
  function poolFor(n) {
    if (pools[n]) return pools[n];
    const mols = molsFor(n);
    const weights = {};
    for (const m of mols) {
      for (const [el, c] of Object.entries(m.atoms)) weights[el] = (weights[el] || 0) + c + 1 / m.size;
    }
    const atoms = Object.values(weights).reduce((a, b) => a + b, 0);
    const avg = mols.reduce((s, m) => s + m.size, 0) / mols.length;
    weights[BLANK] = (atoms * (n - avg)) / avg;
    const els = Object.keys(weights).sort();
    let total = 0;
    const cum = els.map((el) => (total += weights[el]));
    pools[n] = { els, cum, total };
    return pools[n];
  }
  function randomAtom(rng, n) {
    const { els, cum, total } = poolFor(n);
    const x = rng() * total;
    return els[cum.findIndex((c) => x < c)];
  }

  // Game ids: "d:2026-09-16" for a daily, "c:K3F9QZ:6" for a coded game.
  function dateKey(d = new Date()) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  const dailyId = () => `d:${dateKey()}`;
  const customId = (code, n) => `c:${code}:${n}`;
  function parseId(id) {
    const [kind, a, b] = String(id).split(':');
    if (kind === 'd' && /^\d{4}-\d{2}-\d{2}$/.test(a)) return { daily: true, date: a, n: DAILY_N };
    const n = Number(b);
    if (kind === 'c' && /^[A-Z0-9]{4,8}$/.test(a) && Number.isInteger(n) && n >= MIN_N && n <= MAX_N) {
      return { daily: false, code: a, n };
    }
    return null;
  }
  const shareCode = (p) => `${p.code}-${p.n}`;
  function parseCode(raw) {
    const m = String(raw).toUpperCase().replace(/\s+/g, '').match(/^([A-Z0-9]{4,8})-(\d{1,2})$/);
    if (!m) return null;
    const id = customId(m[1], Number(m[2]));
    return parseId(id) ? id : null;
  }
  function randomCode() {
    const bytes = new Uint32Array(6);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
  }
  function prettyDate(key, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
  }
  const SITE = 'https://chemmove.tryonlinux.com/';
  // Shareable link; falls back to the live site when opened from a file.
  function gameUrl(id) {
    const p = parseId(id);
    const base = location.protocol.startsWith('http') ? new URL('./', location.href).href : SITE;
    return p.daily ? base : `${base}?g=${shareCode(p)}`;
  }
  function gameTitle(id) {
    const p = parseId(id);
    return p.daily ? 'Daily experiment' : `Game ${shareCode(p)}`;
  }
  function gameSub(id) {
    const p = parseId(id);
    return p.daily ? `${prettyDate(p.date)} · ${p.n}×${p.n}` : `${p.n}×${p.n} random board`;
  }

  // Lines are keyed "r0".."r{n-1}" and "c0".."c{n-1}".
  const lineKeys = (n) => [...range(n).map((i) => `r${i}`), ...range(n).map((i) => `c${i}`)];
  const lineCells = (n, key) => {
    const i = Number(key.slice(1));
    return key[0] === 'r' ? range(n).map((c) => i * n + c) : range(n).map((r) => r * n + i);
  };
  const targetOf = (g, key) => (key[0] === 'r' ? g.rows : g.cols)[Number(key.slice(1))];
  function setTarget(g, key, t) {
    (key[0] === 'r' ? g.rows : g.cols)[Number(key.slice(1))] = t;
  }
  // A line makes its compound when its atoms are exactly the formula's: blanks fill the rest.
  function lineHas(g, key, m) {
    const have = {};
    let atoms = 0;
    for (const idx of lineCells(g.n, key)) {
      const el = g.v[idx];
      if (el === BLANK) continue;
      if (!m.atoms[el]) return false;
      have[el] = (have[el] || 0) + 1;
      atoms += 1;
    }
    return atoms === m.size && Object.entries(m.atoms).every(([el, c]) => have[el] === c);
  }
  const solvedLines = (g) => lineKeys(g.n).filter((k) => lineHas(g, k, MOL[targetOf(g, k)]));
  const lineName = (key) => `${key[0] === 'r' ? 'row' : 'column'} ${Number(key.slice(1)) + 1}`;

  function neighbours(n, i) {
    const r = Math.floor(i / n);
    const c = i % n;
    const out = [];
    if (r > 0) out.push(i - n);
    if (r < n - 1) out.push(i + n);
    if (c > 0) out.push(i - 1);
    if (c < n - 1) out.push(i + 1);
    return out;
  }
  const isAdjacent = (n, a, b) => neighbours(n, a).includes(b);

  // Cheapest way to build compound m in one line by sliding tiles straight
  // into it along the crossing lines. A slide only touches its own crossing
  // line, so any mix of slides at different positions is valid; a DP over
  // positions (keyed by the atoms still missing) finds the cheapest mix.
  // Every position must end up holding a needed atom or a blank.
  // Returns null if no mix works, and cost 0 if the line already has it.
  function planFor(g, key, m) {
    const n = g.n;
    const i = Number(key.slice(1));
    const cell = key[0] === 'r' ? (line, pos) => line * n + pos : (line, pos) => pos * n + line;
    const els = Object.keys(m.atoms);
    const start = els.map((el) => m.atoms[el]);
    let states = new Map([[start.join(), { need: start, cost: 0, prev: null }]]);
    for (let pos = 0; pos < n; pos++) {
      const next = new Map();
      for (const st of states.values()) {
        for (let j = 0; j < n; j++) {
          const at = g.v[cell(j, pos)];
          const k = els.indexOf(at);
          if (at !== BLANK && (k < 0 || !st.need[k])) continue;
          // Pulling in a blank only helps if the tile already here is in the way.
          if (at === BLANK && j !== i && g.v[cell(i, pos)] === BLANK) continue;
          const need = st.need.slice();
          if (k >= 0) need[k] -= 1;
          const cost = st.cost + Math.abs(j - i);
          const id = need.join();
          const cur = next.get(id);
          if (!cur || cost < cur.cost) next.set(id, { need, cost, prev: st, pos, from: j });
        }
      }
      states = next;
    }
    const end = states.get(start.map(() => 0).join());
    if (!end) return null;
    const steps = [];
    for (let st = end; st.prev; st = st.prev) {
      if (st.from === i) continue;
      const dir = Math.sign(st.from - i);
      for (let k = st.from; k !== i; k -= dir) steps.push([cell(k, st.pos), cell(k - dir, st.pos)]);
    }
    return { key, steps, cost: end.cost };
  }

  // A compound the line can actually build from the board it was dealt with,
  // that it doesn't already contain, and (where possible) that no other line
  // is already asking for.
  function reachableTarget(g, key, rng, strict = false) {
    const n = g.n;
    const taken = new Set(lineKeys(n).filter((k) => k !== key).map((k) => targetOf(g, k)));
    const options = [];
    const stuck = [];
    for (const m of molsFor(n)) {
      const plan = planFor(g, key, m);
      if (plan && !plan.cost) continue;
      (plan ? options : stuck).push({ m, cost: plan ? plan.cost : Infinity, fresh: !taken.has(m.id) });
    }
    const prefer = (list) => (list.some((o) => o.fresh) ? list.filter((o) => o.fresh) : list);
    if (options.length) {
      const pool = prefer(options);
      const near = pool.filter((o) => o.cost <= n + 1);
      if (near.length) return pick(rng, near).m.id;
      pool.sort((a, b) => a.cost - b.cost || (a.m.id < b.m.id ? -1 : 1));
      return pick(rng, pool.slice(0, 3)).m.id;
    }
    if (strict) return null;
    // Nothing is reachable from here: the target becomes solvable once
    // another line refreshes or the player shuffles.
    if (stuck.length) return pick(rng, prefer(stuck)).m.id;
    return pick(rng, molsFor(n)).id;
  }

  // Every dealt target must be buildable from the board, so redeal the rare
  // (mostly 3×3) boards where some line has nothing within reach.
  const DEAL_TRIES = 50;
  function deal(g, rng) {
    for (let t = 1; ; t++) {
      const strict = t < DEAL_TRIES;
      g.v = range(g.n * g.n).map(() => randomAtom(rng, g.n));
      g.rows = [];
      g.cols = [];
      for (let i = 0; i < g.n; i++) g.rows[i] = reachableTarget(g, `r${i}`, rng, strict);
      for (let i = 0; i < g.n; i++) g.cols[i] = reachableTarget(g, `c${i}`, rng, strict);
      if ([...g.rows, ...g.cols].every(Boolean)) return;
    }
  }

  function newGame(id) {
    const { n } = parseId(id);
    const rng = makeRng(seedFrom(`chemmove:${id}`));
    const g = {
      id, n, v: [], rows: [], cols: [], rng: 0,
      score: 0, lines: 0, swaps: swapBudget(n), used: 0,
      shuffles: SHUFFLES, hints: 0, best: 0, log: '', made: {},
      done: false, recorded: false, plan: null,
    };
    deal(g, rng);
    g.rng = rng.state();
    return g;
  }

  function validGame(g, id) {
    const p = parseId(id);
    return g && g.id === id && g.n === p.n && Array.isArray(g.v) && g.v.length === g.n * g.n
      && g.v.every((s) => ELEMENTS[s])
      && Array.isArray(g.rows) && g.rows.length === g.n && Array.isArray(g.cols) && g.cols.length === g.n
      && [...g.rows, ...g.cols].every((t) => MOL[t])
      && Number.isFinite(g.swaps) && Number.isFinite(g.score) && g.made && typeof g.made === 'object'
      && (!g.plan || (Array.isArray(g.plan.steps) && g.plan.steps.length > 0 && typeof g.plan.key === 'string'));
  }

  // Swap two tiles and resolve every completed line, including chains set off
  // by the replacement atoms.
  function applySwap(g, a, b) {
    const rng = makeRng(g.rng);
    [g.v[a], g.v[b]] = [g.v[b], g.v[a]];
    const swapped = g.v.slice();
    const steps = [];
    const made = [];
    const fresh = new Set();
    let solved = solvedLines(g);
    while (solved.length && steps.length < 12) {
      steps.push(solved);
      for (const key of solved) {
        made.push(targetOf(g, key));
        for (const idx of lineCells(g.n, key)) {
          g.v[idx] = randomAtom(rng, g.n);
          fresh.add(idx);
        }
      }
      for (const key of solved) setTarget(g, key, reachableTarget(g, key, rng));
      solved = solvedLines(g);
    }
    const count = made.length;
    const points = made.reduce((s, id) => s + MOL[id].value, 0) * count;
    g.rng = rng.state();
    g.swaps -= 1;
    g.used += 1;
    g.score += points;
    g.lines += count;
    g.best = Math.max(g.best, count);
    g.log += String(Math.min(count, 3));
    for (const id of made) g.made[id] = (g.made[id] || 0) + 1;
    if (g.swaps <= 0) g.done = true;
    return { swapped, steps, made, count, points, fresh };
  }

  const samePair = (p, a, b) => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a);

  // A full route to a completed line: the best single swap if one exists
  // (preferring combos), otherwise the shortest slide plan over all lines.
  function findHint(g) {
    const n = g.n;
    let best = null;
    for (let a = 0; a < n * n; a++) {
      for (const b of [a % n < n - 1 ? a + 1 : -1, a + n < n * n ? a + n : -1]) {
        if (b < 0 || g.v[a] === g.v[b]) continue;
        [g.v[a], g.v[b]] = [g.v[b], g.v[a]];
        const solved = solvedLines(g);
        [g.v[a], g.v[b]] = [g.v[b], g.v[a]];
        if (solved.length > (best ? best.count : 0)) best = { key: solved[0], steps: [[a, b]], count: solved.length };
      }
    }
    if (best) return best;
    for (const key of lineKeys(n)) {
      const plan = planFor(g, key, MOL[targetOf(g, key)]);
      if (plan && plan.cost && (!best || plan.cost < best.steps.length)) best = { key, steps: plan.steps, count: 1 };
    }
    return best;
  }

  // Test hook: node can load this file with a stub window to check the rules.
  if (typeof window.__chemmoveTest === 'function') {
    window.__chemmoveTest({ MOLS, MOL, ELEMENTS, BLANK, sizeRange, molsFor, newGame, applySwap, findHint, planFor, solvedLines, lineKeys, targetOf });
    return;
  }

  // ---------------------------------------------------------------------------
  // State & persistence
  // ---------------------------------------------------------------------------
  const DEFAULT_SETTINGS = { colors: true, moves: true, sound: false };
  const settings = { ...DEFAULT_SETTINGS, ...store.get('settings', {}) };

  let game = null;
  let selected = null;
  let focusIdx = 0;
  let busy = false;
  let epoch = 0; // bumped whenever a different board loads, so stale timers bail out
  let lastFinish = {};
  let newSize = clamp(Number(store.get('lastSize', 6)) || 6, MIN_N, MAX_N);

  function save() {
    store.set(`game:${game.id}`, game);
    store.set('current', game.id);
    const recent = store.get('games', []).filter((x) => x !== game.id);
    recent.unshift(game.id);
    // Keep the 12 newest games, plus today's daily however many games came after it.
    const keep = recent.slice(0, 12);
    if (recent.includes(dailyId()) && !keep.includes(dailyId())) keep.push(dailyId());
    recent.filter((old) => !keep.includes(old)).forEach((old) => store.del(`game:${old}`));
    store.set('games', keep);
  }

  function loadGame(id) {
    const saved = store.get(`game:${id}`, null);
    game = validGame(saved, id) ? saved : newGame(id);
    // Rounds saved as over before their result was recorded (older versions).
    if (game.done && !game.recorded) lastFinish = recordResult(game);
    epoch += 1;
    disarmRestart();
    selected = null;
    focusIdx = 0;
    busy = false;
    const p = parseId(id);
    const search = p.daily ? '' : `?g=${shareCode(p)}`;
    if (location.search !== search) {
      try { history.replaceState(null, '', search || location.pathname); } catch { /* file:// pages can't rewrite the URL */ }
    }
    save();
    buildBoard();
    say(defaultMsg());
    render();
  }

  function restartGame() {
    store.del(`game:${game.id}`);
    loadGame(game.id);
    say('Fresh start. Same board as before.');
  }

  // The lab notebook counts every compound ever made, across all games.
  function noteMade(ids) {
    const book = store.get('notebook', {});
    const firsts = ids.filter((id) => !book[id]);
    for (const id of ids) book[id] = (book[id] || 0) + 1;
    store.set('notebook', book);
    return [...new Set(firsts)];
  }

  function recordResult(g) {
    if (g.recorded) return {};
    g.recorded = true;
    const p = parseId(g.id);
    const out = {};

    const daily = store.get('daily', {});
    if (p.daily) {
      if (daily[p.date]) {
        out.replay = daily[p.date].score;
      } else {
        daily[p.date] = { score: g.score, lines: g.lines, best: g.best, log: g.log };
        store.set('daily', daily);
      }
    }

    const bests = store.get('bests', {});
    const prev = bests[g.n];
    if (g.score > 0 && (prev == null || g.score > prev)) {
      bests[g.n] = g.score;
      store.set('bests', bests);
      out.newBest = prev != null;
    }

    const rounds = store.get('rounds', []);
    rounds.unshift({ id: g.id, n: g.n, score: g.score, lines: g.lines, best: g.best, at: Date.now(), replay: out.replay != null });
    store.set('rounds', rounds.slice(0, 40));
    return out;
  }

  function dailyStats() {
    const daily = store.get('daily', {});
    const days = Object.keys(daily).sort();
    const scores = days.map((d) => daily[d].score);
    const dayNum = (key) => {
      const [y, m, d] = key.split('-').map(Number);
      return Math.round(Date.UTC(y, m - 1, d) / 86400000);
    };
    let bestStreak = 0;
    let run = 0;
    days.forEach((d, i) => {
      run = i && dayNum(d) - dayNum(days[i - 1]) === 1 ? run + 1 : 1;
      bestStreak = Math.max(bestStreak, run);
    });
    // The current streak survives until today's puzzle is missed, not just unplayed.
    const today = dayNum(dateKey());
    const last = days.length ? dayNum(days[days.length - 1]) : null;
    const current = last != null && today - last <= 1 ? run : 0;
    return {
      played: days.length,
      streak: current,
      bestStreak,
      best: scores.length ? Math.max(...scores) : 0,
      avg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
    };
  }

  function untilTomorrow() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const mins = Math.max(1, Math.ceil((next - now) / 60000));
    const h = Math.floor(mins / 60);
    return h ? `${h}h ${pad2(mins % 60)}m` : `${mins}m`;
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  const el = {
    board: $('#board'),
    stage: $('#stage'),
    tiles: $('#tiles'),
    colHeads: $('#colHeads'),
    rowHeads: $('#rowHeads'),
    float: $('#float'),
    hudTitle: $('#hudTitle'),
    hudSub: $('#hudSub'),
    hudScore: $('#hudScore'),
    hudLines: $('#hudLines'),
    hudSwaps: $('#hudSwaps'),
    hintBtn: $('#hintBtn'),
    shuffleBtn: $('#shuffleBtn'),
    shuffleLeft: $('#shuffleLeft'),
    restartBtn: $('#restartBtn'),
    restartLbl: $('#restartLbl'),
    msg: $('#msg'),
    doneBar: $('#doneBar'),
    doneTitle: $('#doneTitle'),
    doneSub: $('#doneSub'),
    footGame: $('#footGame'),
    toast: $('#toast'),
  };

  const tileEls = () => el.tiles.children;
  const headEl = (key) => (key[0] === 'r' ? el.rowHeads : el.colHeads).children[Number(key.slice(1))];

  function span(cls) {
    const s = document.createElement('span');
    s.className = cls;
    return s;
  }

  function headCell(kind, i) {
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'hdr';
    d.dataset.key = `${kind}${i}`;
    d.append(span('hdr-e'), span('hdr-n'));
    return d;
  }

  function buildBoard() {
    const n = game.n;
    el.board.style.setProperty('--n', String(n));
    el.colHeads.replaceChildren(...range(n).map((i) => headCell('c', i)));
    el.rowHeads.replaceChildren(...range(n).map((i) => headCell('r', i)));
    el.tiles.replaceChildren(...range(n * n).map((i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tile';
      b.dataset.i = String(i);
      b.append(span('z'), span('sym'));
      return b;
    }));
    layout();
  }

  const sideBySide = matchMedia('(max-height: 540px) and (orientation: landscape)');
  const ROW_HEAD = 1.9; // row-target width, in cells
  const COL_HEAD = 1.3; // column-target height, in cells

  function layout() {
    const n = game.n;
    const gap = n >= 8 ? 3 : 5;
    const stageW = Math.min(el.stage.clientWidth - 16, 700);
    const top = el.stage.getBoundingClientRect().top + window.scrollY;
    // Leave room under the board for the buttons unless they sit beside it.
    const below = sideBySide.matches ? 28 : 120;
    const room = Math.min(Math.max(window.innerHeight - top - below, sideBySide.matches ? 170 : 300), 700);
    const fit = Math.min((stageW - n * gap) / (n + ROW_HEAD), (room - n * gap) / (n + COL_HEAD));
    const cell = clamp(Math.floor(fit), sideBySide.matches ? 22 : 26, 80);
    el.board.style.setProperty('--gap', `${gap}px`);
    el.board.style.setProperty('--cell', `${cell}px`);
    el.board.style.setProperty('--rhw', `${Math.round(cell * ROW_HEAD)}px`);
    el.board.style.setProperty('--chh', `${Math.round(cell * COL_HEAD)}px`);
    el.board.style.setProperty('--font', `${clamp(cell * 0.4, 11, 30).toFixed(1)}px`);
    el.board.style.setProperty('--name', `${clamp(cell * 0.2, 8.5, 13.5).toFixed(1)}px`);
    el.board.classList.toggle('tight', cell < 42);
  }

  function renderHeads(rows = game.rows, cols = game.cols) {
    const paint = (container, targets, kind) => {
      Array.from(container.children).forEach((d, i) => {
        const key = `${kind}${i}`;
        const m = MOL[targets[i]];
        d.className = 'hdr';
        if (selected != null && (kind === 'r' ? Math.floor(selected / game.n) : selected % game.n) === i) d.classList.add('focus');
        if (game.plan && game.plan.key === key) d.classList.add('goal');
        if (m.name.length > 11) d.classList.add('long');
        const [emoji, name] = d.children;
        emoji.textContent = m.emoji;
        name.textContent = m.label;
        d.title = m.name;
        d.setAttribute('aria-label', `${lineName(key)} target: ${m.name}`);
      });
    };
    paint(el.rowHeads, rows, 'r');
    paint(el.colHeads, cols, 'c');
  }

  function renderTiles(values = game.v) {
    const n = game.n;
    const can = selected != null && settings.moves && !game.done ? neighbours(n, selected) : [];
    Array.from(tileEls()).forEach((b, i) => {
      const sym = values[i];
      const [z, name, tint] = ELEMENTS[sym];
      const blank = sym === BLANK;
      b.firstChild.textContent = blank ? '' : String(z);
      b.lastChild.textContent = blank ? '' : sym;
      let cls = 'tile';
      if (blank) cls += ' blank';
      else if (settings.colors) cls += ' tinted';
      if (sym.length > 1) cls += ' two';
      if (selected === i) cls += ' selected';
      if (can.includes(i)) cls += ' can-swap';
      if (game.plan && game.plan.steps[0].includes(i)) cls += ' hint';
      b.className = cls;
      b.style.setProperty('--tint', tint);
      b.tabIndex = i === focusIdx ? 0 : -1;
      b.disabled = game.done;
      b.setAttribute('aria-pressed', String(selected === i));
      b.setAttribute('aria-label', `Row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}: ${blank ? 'blank' : `${name}, ${sym}`}${selected === i ? ', selected' : ''}`);
    });
  }

  let shownScore = null;
  function renderHud() {
    const p = parseId(game.id);
    el.hudTitle.textContent = gameTitle(game.id);
    el.hudSub.textContent = gameSub(game.id);
    el.footGame.textContent = p.daily ? `Daily ${prettyDate(p.date, { month: 'short', day: 'numeric', year: 'numeric' })}` : `Game ${shareCode(p)}`;
    if (shownScore !== null && game.score > shownScore) bump(el.hudScore);
    shownScore = game.score;
    el.hudScore.textContent = String(game.score);
    el.hudLines.textContent = String(game.lines);
    el.hudSwaps.textContent = String(game.swaps);
    el.hudSwaps.classList.toggle('low', game.swaps <= 5);

    el.hintBtn.disabled = game.done || busy || (!game.plan && game.swaps <= HINT_COST);
    el.shuffleBtn.disabled = game.done || busy || game.shuffles <= 0;
    el.shuffleLeft.textContent = `${game.shuffles} left`;
    el.board.classList.toggle('done', game.done);

    el.doneBar.hidden = !game.done;
    if (game.done) {
      el.doneTitle.textContent = p.daily ? 'Daily experiment complete' : 'Out of swaps';
      el.doneSub.textContent = `${game.score} points · ${plural(game.lines, 'compound')}${p.daily ? ` · next daily in ${untilTomorrow()}` : ''}`;
    }
  }

  function render() {
    renderHeads();
    renderTiles();
    renderHud();
    if (!el.msg.textContent) say(defaultMsg());
  }

  function defaultMsg() {
    if (game.done) return 'Round over. Start a new game any time.';
    if (selected != null) return 'Now tap a neighbouring atom to swap.';
    if (game.plan) return `Hint: swap the glowing atoms. ${plural(game.plan.steps.length, 'swap')} to make ${MOL[targetOf(game, game.plan.key)].name} in ${lineName(game.plan.key)}.`;
    return game.used
      ? 'Tap an atom, then a neighbour to swap.'
      : 'Fill each row and column with exactly its compound\'s atoms, blanks for the rest. Tap a name for a clue.';
  }

  function say(text) {
    el.msg.textContent = text;
  }

  function restartAnim(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  function bump(node) {
    restartAnim(node, 'bump');
  }

  function focusTile(i) {
    focusIdx = i;
    Array.from(tileEls()).forEach((b, j) => { b.tabIndex = j === i ? 0 : -1; });
    tileEls()[i]?.focus({ preventScroll: true });
  }

  function slide(a, b) {
    if (reducedMotion()) return;
    const n = game.n;
    const step = parseFloat(getComputedStyle(el.board).getPropertyValue('--cell')) + parseFloat(getComputedStyle(el.board).getPropertyValue('--gap'));
    const move = (to, from) => {
      const t = tileEls()[to];
      t.style.setProperty('--dx', `${((from % n) - (to % n)) * step}px`);
      t.style.setProperty('--dy', `${(Math.floor(from / n) - Math.floor(to / n)) * step}px`);
      restartAnim(t, 'slide');
    };
    move(a, b);
    move(b, a);
  }

  function markLines(keys) {
    for (const key of keys) {
      for (const idx of lineCells(game.n, key)) restartAnim(tileEls()[idx], 'hit');
      restartAnim(headEl(key), 'hit');
    }
  }

  function floatScore(res) {
    el.float.replaceChildren();
    const big = document.createElement('strong');
    big.textContent = `+${res.points}`;
    const tag = document.createElement('span');
    if (res.count > 1) tag.textContent = res.steps.length > 1 ? `Chain reaction ×${res.count}` : `Combo ×${res.count}`;
    else tag.textContent = `${MOL[res.made[0]].emoji} ${MOL[res.made[0]].name}`;
    el.float.append(big, tag);
    restartAnim(el.float, 'show');
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  function select(i) {
    selected = i;
    renderTiles();
    renderHeads();
    say(defaultMsg());
    if (i != null) sound('pick');
  }

  function onTile(i) {
    if (busy || game.done) return;
    focusIdx = i;
    if (selected === null) select(i);
    else if (selected === i) select(null);
    else if (isAdjacent(game.n, selected, i)) doSwap(selected, i);
    else select(i);
    focusTile(i);
  }

  function doSwap(a, b) {
    if (busy || game.done) return;
    const rows = game.rows.slice();
    const cols = game.cols.slice();
    const plan = game.plan;
    const followed = plan && samePair(plan.steps[0], a, b);
    const goal = plan && MOL[targetOf(game, plan.key)];
    const res = applySwap(game, a, b);
    const firsts = res.count ? noteMade(res.made) : [];
    selected = null;
    let planMsg = '';
    if (plan && !followed) {
      game.plan = null;
      planMsg = ' Hint cancelled.';
    } else if (plan) {
      plan.steps.shift();
      const solvedGoal = res.steps.flat().includes(plan.key);
      if (solvedGoal || !plan.steps.length) {
        game.plan = null;
      } else if (res.count) {
        // Another line completed on the way and new atoms arrived: re-plan for free.
        const again = planFor(game, plan.key, goal);
        game.plan = again && again.cost ? { key: plan.key, steps: again.steps, count: 1 } : null;
        planMsg = game.plan ? ` Hint updated: ${plural(again.steps.length, 'swap')} to go.` : ' The board changed, so the hint ended.';
      } else {
        planMsg = ` Hint: ${plural(plan.steps.length, 'more swap')} to make ${goal.name}.`;
      }
    }
    if (game.done) {
      game.plan = null;
      // Record now: the finish dialog waits on animations the player may never see.
      lastFinish = recordResult(game);
    }
    save();

    if (!res.count) {
      renderTiles();
      renderHeads();
      renderHud();
      slide(a, b);
      sound('swap');
      say(game.done ? 'Out of swaps!' : planMsg.trim() || `No reaction yet. ${plural(game.swaps, 'swap')} left.`);
      if (game.done) finishRound();
      return;
    }

    busy = true;
    renderTiles(res.swapped);
    renderHeads(rows, cols);
    renderHud();
    slide(a, b);
    sound('swap');

    const quick = reducedMotion();
    const mine = epoch;
    setTimeout(() => {
      if (mine !== epoch) return;
      markLines(res.steps[0]);
      floatScore(res);
      restartAnim(el.tiles, 'shake');
      sound('solve', res.count);
      setTimeout(() => {
        if (mine !== epoch) return;
        busy = false;
        renderTiles();
        renderHeads();
        renderHud();
        res.fresh.forEach((idx) => restartAnim(tileEls()[idx], 'fresh'));
        res.steps.flat().forEach((key) => restartAnim(headEl(key), 'fresh'));
        const first = res.steps[0].length;
        const names = res.made.slice(0, first).map((id) => MOL[id].name);
        const where = first === 1 ? ` in ${lineName(res.steps[0][0])}` : '';
        const chain = res.steps.length > 1 ? ` Chain reaction: ${listJoin(res.made.slice(first).map((id) => MOL[id].name))} too.` : '';
        say(`Made ${listJoin(names)}${where}! +${res.points}.${chain}${game.done ? ' Out of swaps!' : planMsg}`);
        if (firsts.length) toast(`📓 New in your lab notebook: ${listJoin(firsts.map((id) => `${MOL[id].emoji} ${MOL[id].name}`))}`);
        if (el.tiles.contains(document.activeElement)) focusTile(focusIdx);
        if (game.done) finishRound();
      }, quick ? 0 : 520);
    }, quick ? 0 : 170);
  }

  function useHint() {
    if (busy || game.done) return;
    if (game.plan) {
      say(`Hint: ${plural(game.plan.steps.length, 'swap')} left to make ${MOL[targetOf(game, game.plan.key)].name}. Follow the glowing atoms.`);
      return;
    }
    if (game.swaps <= HINT_COST) return;
    const found = findHint(game);
    if (!found) {
      say('No compound can be made from here. Try a shuffle. That hint was free.');
      return;
    }
    game.swaps -= HINT_COST;
    game.hints += 1;
    game.log += 'h';
    game.plan = found;
    selected = null;
    save();
    renderTiles();
    renderHeads();
    renderHud();
    sound('pick');
    const len = found.steps.length;
    const name = MOL[targetOf(game, found.key)].name;
    const room = len > game.swaps ? ` You only have ${plural(game.swaps, 'swap')} left, though.` : '';
    say(len === 1
      ? `Hint: swap the glowing atoms to make ${found.count > 1 ? plural(found.count, 'compound') : `${name} in ${lineName(found.key)}`}.`
      : `Hint: ${len} swaps make ${name} in ${lineName(found.key)}. Swap the glowing atoms, and the next pair will light up.${room}`);
  }

  function useShuffle() {
    if (busy || game.done || game.shuffles <= 0) return;
    const rng = makeRng(game.rng);
    deal(game, rng);
    game.rng = rng.state();
    game.shuffles -= 1;
    game.log += 's';
    selected = null;
    game.plan = null;
    save();
    render();
    Array.from(tileEls()).forEach((t) => restartAnim(t, 'fresh'));
    sound('shuffle');
    say(`New board dealt. ${game.shuffles ? `${plural(game.shuffles, 'shuffle')} left.` : 'That was your last shuffle.'}`);
  }

  let restartArmed = 0;
  function disarmRestart() {
    clearTimeout(restartArmed);
    restartArmed = 0;
    el.restartLbl.textContent = 'Restart';
    el.restartBtn.classList.remove('armed');
  }

  function onRestart() {
    if (busy) return;
    if (!game.used && !game.hints && game.shuffles === SHUFFLES) {
      restartGame();
      return;
    }
    if (restartArmed) {
      restartGame();
      return;
    }
    el.restartLbl.textContent = 'Tap to confirm';
    el.restartBtn.classList.add('armed');
    restartArmed = setTimeout(disarmRestart, 3000);
  }

  // Formulas stay hidden until you've made the compound once; then the notebook remembers it.
  function showCompound(key) {
    const m = MOL[targetOf(game, key)];
    const count = store.get('notebook', {})[m.id];
    const what = count
      ? `${m.formula}, made ${plural(count, 'time')}`
      : `${plural(m.size, 'atom')}, ${m.value} pts`;
    toast(`${m.emoji} ${m.name} (${what}). ${m.fact}${count ? '' : ' Make it once to learn its formula.'}`, 5500);
  }

  function finishRound() {
    const res = lastFinish;
    renderHud();
    const mine = epoch;
    setTimeout(() => {
      if (mine !== epoch) return;
      sound('finish');
      open('finish');
      if (res.newBest || (parseId(game.id).daily && res.replay == null && game.score > 0)) confetti(res.newBest ? 140 : 80);
    }, reducedMotion() ? 0 : 650);
  }

  function emojiRows() {
    const chars = Array.from(game.log, (c) => LOG_EMOJI[c] || '');
    const rows = [];
    for (let i = 0; i < chars.length; i += 10) rows.push(chars.slice(i, i + 10).join(''));
    return rows.join('\n');
  }

  function shareText() {
    const p = parseId(game.id);
    const head = p.daily
      ? `ChemMove Daily · ${prettyDate(p.date, { month: 'short', day: 'numeric', year: 'numeric' })}`
      : `ChemMove ${p.n}×${p.n} · game ${shareCode(p)}`;
    const line = `${game.score} pts · ${plural(game.lines, 'compound')} · best swap ×${game.best || 0}`;
    const made = Object.keys(game.made).map((id) => MOL[id].emoji).join('');
    return `${head}\n${line}\n${emojiRows()}${made ? `\n${made}` : ''}\n${gameUrl(game.id)}`;
  }

  function madeChips(counts) {
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || MOL[b[0]].size - MOL[a[0]].size)
      .map(([id, c]) => `<span class="chip">${esc(MOL[id].emoji)} ${esc(MOL[id].name)}${c > 1 ? ` <b>×${c}</b>` : ''}</span>`)
      .join('');
  }

  function fillFinish(res = {}) {
    const p = parseId(game.id);
    $('#finTitle').textContent = p.daily ? 'Daily experiment complete' : 'Round complete';
    $('#finScore').textContent = String(game.score);
    const bits = [plural(game.lines, 'compound'), `best swap ×${game.best || 0}`];
    if (game.hints) bits.push(plural(game.hints, 'hint'));
    $('#finLine').textContent = bits.join(' · ');
    const badge = $('#finBadge');
    const best = store.get('bests', {})[game.n];
    if (res.newBest) badge.textContent = `New best for ${game.n}×${game.n}!`;
    else if (res.replay != null) badge.textContent = `Replay. Your first result today (${res.replay}) is the one that counts.`;
    else if (best != null && best > game.score) badge.textContent = `Your best on ${game.n}×${game.n} is ${best}.`;
    else badge.textContent = '';
    badge.hidden = !badge.textContent;
    $('#finMade').innerHTML = madeChips(game.made);
    $('#finEmoji').textContent = emojiRows();
    $('#finNext').textContent = p.daily ? `Next daily experiment in ${untilTomorrow()}.` : `Share code ${shareCode(p)} to challenge a friend on this board.`;
  }

  // ---------------------------------------------------------------------------
  // Dialogs
  // ---------------------------------------------------------------------------
  function open(name) {
    const dlg = $(`#dlg-${name}`);
    if (name === 'stats') fillStats();
    if (name === 'new') fillNew();
    if (name === 'settings') fillSettings();
    if (name === 'finish') fillFinish(lastFinish);
    $$('dialog[open]').forEach((d) => d !== dlg && d.close());
    if (!dlg.open) dlg.showModal();
  }

  function fillStats() {
    const s = dailyStats();
    const tiles = [
      ['Dailies played', s.played],
      ['Current streak', s.streak],
      ['Best streak', s.bestStreak],
      ['Best daily', s.best],
    ];
    $('#statGrid').innerHTML = tiles.map(([k, v]) => `<div class="stat"><strong>${esc(v)}</strong><span>${esc(k)}</span></div>`).join('');
    const today = store.get('daily', {})[dateKey()];
    $('#statNext').textContent = today
      ? `Today's score: ${today.score}. Next daily in ${untilTomorrow()}.${s.played > 1 ? ` Average ${s.avg}.` : ''}`
      : `Today's daily is waiting.${s.played ? ` Average daily score ${s.avg}.` : ''}`;

    const book = store.get('notebook', {});
    const found = MOLS.filter((m) => book[m.id]).length;
    $('#bookCount').textContent = `${found} / ${MOLS.length}`;
    $('#notebook').innerHTML = MOLS.slice().sort((a, b) => a.size - b.size).map((m) => (book[m.id]
      ? `<div class="entry"><span class="e-emoji">${esc(m.emoji)}</span><span class="e-body"><strong>${esc(m.name)}</strong><span class="muted">${esc(m.formula)}</span></span><b class="e-count">×${esc(book[m.id])}</b></div>`
      : `<div class="entry locked"><span class="e-emoji">❔</span><span class="e-body"><strong>Undiscovered</strong><span class="muted">${esc(plural(m.size, 'atom'))}</span></span></div>`)).join('');

    const bests = store.get('bests', {});
    $('#sizeBests').innerHTML = range(MAX_N - MIN_N + 1).map((k) => {
      const n = k + MIN_N;
      const b = bests[n];
      return `<div class="size-best${b == null ? ' none' : ''}"><span>${n}×${n}</span><strong>${b == null ? '—' : esc(b)}</strong></div>`;
    }).join('');

    const rounds = store.get('rounds', []);
    $('#recentRounds').innerHTML = rounds.length ? `
      <div class="table-scroll"><table class="rounds">
        <thead><tr><th>When</th><th>Game</th><th class="num">Made</th><th class="num">Score</th></tr></thead>
        <tbody>${rounds.slice(0, 15).map((r) => {
          const p = parseId(r.id);
          const when = new Date(r.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          const name = p ? (p.daily ? `Daily ${r.replay ? '(replay)' : ''}` : `${shareCode(p)}`) : '?';
          return `<tr><td>${esc(when)}</td><td>${esc(name)} <span class="muted">${r.n}×${r.n}</span></td><td class="num">${esc(r.lines)}</td><td class="num"><b>${esc(r.score)}</b></td></tr>`;
        }).join('')}</tbody>
      </table></div>` : '<p class="empty">No finished rounds yet.</p>';
  }

  function fillNew() {
    const d = store.get('daily', {})[dateKey()];
    const saved = store.get(`game:${dailyId()}`, null);
    $('#dailyStatus').textContent = d
      ? `Done today: ${d.score} points. Replays don't count.`
      : saved && saved.used
        ? `In progress: ${saved.score} points, ${plural(saved.swaps, 'swap')} left.`
        : `Same ${DAILY_N}×${DAILY_N} board for everyone today.`;
    $('#playDaily').textContent = saved && saved.used && !saved.done ? 'Resume daily' : 'Play daily';
    const [lo, hi] = sizeRange(newSize);
    $('#sizeValue').textContent = `${newSize}×${newSize}`;
    $('#sizeInfo').textContent = `Compounds of ${lo === hi ? lo : `${lo}–${hi}`} atoms, ${swapBudget(newSize)} swaps.`;
    $('#sizeDown').disabled = newSize <= MIN_N;
    $('#sizeUp').disabled = newSize >= MAX_N;
    const p = parseId(game.id);
    $('#currentGameInfo').textContent = p.daily
      ? `Daily experiment for ${prettyDate(p.date)}.`
      : `Code ${shareCode(p)}. Anyone with the link gets this board.`;
  }

  function fillSettings() {
    $$('[data-setting]').forEach((input) => { input.checked = !!settings[input.dataset.setting]; });
  }

  // ---------------------------------------------------------------------------
  // Toast, confetti, sound
  // ---------------------------------------------------------------------------
  let toastTimer = 0;
  function toast(msg, ms = 2800) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), ms);
  }

  function confetti(count) {
    if (reducedMotion()) return;
    const layer = document.createElement('div');
    layer.className = 'confetti';
    const bits = ['⚛️', '🧪', '💧', '✨', '⚗️'];
    const colors = ['#0e8f7e', '#3b82f6', '#ef4444', '#f5c542', '#a855f7'];
    for (let i = 0; i < count; i++) {
      const s = document.createElement('span');
      // Mostly confetti, with the odd bit of glassware.
      if (i % 6 === 0) {
        s.className = 'bit';
        s.textContent = bits[(i / 6) % bits.length];
      } else {
        s.style.setProperty('background', colors[i % colors.length]);
      }
      s.style.setProperty('left', `${Math.random() * 100}%`);
      s.style.setProperty('--x', `${(Math.random() - 0.5) * 240}px`);
      s.style.setProperty('--r', `${(Math.random() - 0.5) * 1080}deg`);
      s.style.setProperty('--d', `${1.6 + Math.random() * 1.6}s`);
      s.style.setProperty('animation-delay', `${Math.random() * 0.4}s`);
      layer.append(s);
    }
    document.body.append(layer);
    setTimeout(() => layer.remove(), 4000);
  }

  let audio = null;
  function tone(freq, start, dur, type = 'sine', vol = 0.05) {
    const t = audio.currentTime + start;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  function sound(kind, count = 1) {
    if (!settings.sound) return;
    try {
      audio = audio || new AudioContext();
      if (audio.state === 'suspended') audio.resume();
      if (kind === 'pick') tone(660, 0, 0.06, 'triangle', 0.03);
      else if (kind === 'swap') tone(420, 0, 0.08, 'triangle', 0.04);
      else if (kind === 'shuffle') [300, 380, 460].forEach((f, i) => tone(f, i * 0.04, 0.08, 'triangle', 0.03));
      else if (kind === 'solve') {
        // A fizz of bubbles, then the chime.
        [900, 1200, 1000, 1400].forEach((f, i) => tone(f, i * 0.025, 0.04, 'sine', 0.02));
        [523, 659, 784, 1047, 1319].slice(0, 2 + Math.min(count, 3)).forEach((f, i) => tone(f, 0.1 + i * 0.07, 0.22));
      } else if (kind === 'finish') [392, 523, 659, 784].forEach((f, i) => tone(f, i * 0.11, 0.35, 'sine', 0.05));
    } catch { /* audio unavailable */ }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.className = 'offscreen';
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { /* unsupported */ }
      ta.remove();
      return ok;
    }
  }

  async function share() {
    const text = shareText();
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return; // the player closed the share sheet
      }
    }
    toast((await copyText(text)) ? 'Result copied to clipboard.' : 'Could not copy. Try again.');
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------
  let drag = null;
  let swallowClick = false;

  el.tiles.addEventListener('pointerdown', (e) => {
    swallowClick = false;
    const t = e.target.closest('.tile');
    if (!t || e.button > 0 || busy || game.done) return;
    drag = { i: Number(t.dataset.i), x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  el.tiles.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!e.buttons) {
      // Released outside the window, so pointerup never reached us.
      drag = null;
      return;
    }
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    const cell = parseFloat(getComputedStyle(el.board).getPropertyValue('--cell'));
    if (Math.hypot(dx, dy) < cell * 0.4) return;
    const n = game.n;
    const from = drag.i;
    drag = null;
    let to;
    if (Math.abs(dx) > Math.abs(dy)) to = dx > 0 ? (from % n < n - 1 ? from + 1 : -1) : (from % n > 0 ? from - 1 : -1);
    else to = dy > 0 ? from + n : from - n;
    if (to < 0 || to >= n * n) return;
    swallowClick = true;
    focusIdx = to;
    doSwap(from, to);
  });
  const endDrag = () => {
    drag = null;
    // A swipe's own click (if the browser sends one) fires right after pointerup.
    if (swallowClick) setTimeout(() => { swallowClick = false; }, 0);
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  el.tiles.addEventListener('click', (e) => {
    if (swallowClick) {
      swallowClick = false;
      return;
    }
    const t = e.target.closest('.tile');
    if (t) onTile(Number(t.dataset.i));
  });

  el.tiles.addEventListener('keydown', (e) => {
    const t = e.target.closest('.tile');
    if (!t) return;
    const n = game.n;
    const i = Number(t.dataset.i);
    if (e.key === 'Escape' && selected != null) {
      e.preventDefault();
      select(null);
      return;
    }
    const moves = {
      ArrowLeft: i % n ? i - 1 : -1,
      ArrowRight: i % n < n - 1 ? i + 1 : -1,
      ArrowUp: i - n,
      ArrowDown: i + n,
      Home: i - (i % n),
      End: i - (i % n) + n - 1,
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    const to = moves[e.key];
    if (to >= 0 && to < n * n) focusTile(to);
  });

  el.board.addEventListener('click', (e) => {
    const h = e.target.closest('.hdr');
    if (h) showCompound(h.dataset.key);
  });

  el.tiles.addEventListener('animationend', (e) => {
    if (e.target === el.tiles) el.tiles.classList.remove('shake');
    else e.target.closest('.tile')?.classList.remove('slide', 'hit', 'fresh');
  });
  el.board.addEventListener('animationend', (e) => {
    e.target.closest('.hdr')?.classList.remove('hit', 'fresh');
  });
  el.hudScore.addEventListener('animationend', () => el.hudScore.classList.remove('bump'));

  el.hintBtn.addEventListener('click', useHint);
  el.shuffleBtn.addEventListener('click', useShuffle);
  el.restartBtn.addEventListener('click', onRestart);

  $$('[data-open]').forEach((b) => b.addEventListener('click', () => open(b.dataset.open)));
  $$('dialog').forEach((dlg) => {
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
    });
  });

  $('#playDaily').addEventListener('click', () => {
    $('#dlg-new').close();
    loadGame(dailyId());
  });
  const setNewSize = (n) => {
    newSize = clamp(n, MIN_N, MAX_N);
    store.set('lastSize', newSize);
    fillNew();
  };
  $('#sizeDown').addEventListener('click', () => setNewSize(newSize - 1));
  $('#sizeUp').addEventListener('click', () => setNewSize(newSize + 1));
  $('#playRandom').addEventListener('click', () => {
    $('#dlg-new').close();
    loadGame(customId(randomCode(), newSize));
    toast(`New game ${shareCode(parseId(game.id))}. Share the link to challenge a friend.`);
  });
  $('#codeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#codeInput');
    const id = parseCode(input.value);
    if (!id) {
      toast(`Codes look like K3F9QZ-6: letters and digits, a dash, then the grid size (${MIN_N}–${MAX_N}).`);
      input.focus();
      return;
    }
    input.value = '';
    $('#dlg-new').close();
    loadGame(id);
  });
  $('#copyLink').addEventListener('click', async () => {
    toast((await copyText(gameUrl(game.id))) ? 'Game link copied.' : 'Could not copy the link.');
  });
  $('#shareBtn').addEventListener('click', share);

  $$('[data-setting]').forEach((input) => {
    input.addEventListener('change', () => {
      settings[input.dataset.setting] = input.checked;
      store.set('settings', settings);
      renderTiles();
      renderHeads();
      if (input.dataset.setting === 'sound' && input.checked) sound('solve', 1);
    });
  });

  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(layout);
  });

  // A tab left open overnight rolls over to the new daily on return.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const p = parseId(game.id);
    if (p.daily && p.date !== dateKey() && (game.done || !game.used) && !$('dialog[open]')) {
      loadGame(dailyId());
      toast('A new daily experiment is ready.');
    }
  });

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  function startId() {
    const q = new URLSearchParams(location.search).get('g');
    if (q) {
      const id = parseCode(q);
      if (id) return id;
      setTimeout(() => toast("That game code isn't valid, so here's today's daily."), 300);
      return dailyId();
    }
    // Resume an unfinished coded game; otherwise go to today's daily.
    const current = store.get('current', null);
    const p = current && parseId(current);
    if (p && !p.daily) {
      const saved = store.get(`game:${current}`, null);
      if (validGame(saved, current) && !saved.done) return current;
    }
    return dailyId();
  }

  loadGame(startId());

  if (!store.get('seenHelp', false)) {
    store.set('seenHelp', true);
    open('help');
  }
})();
