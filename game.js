/* 小人国 · 等距城市建造 —— 128 × 128 大地图版 */
(function () {
  'use strict';

  /* ================= 常量与数据 ================= */
  const N = 128;                        // 地图边长（格）
  const TW = 64, TH = 32;               // 菱形瓦片尺寸
  const W2 = TW / 2, H2 = TH / 2;
  const LOGIC_DT = 0.2;                 // 逻辑步长（秒）
  const HOUSE_CAP = { 1: 4, 2: 8, 3: 12 };
  const POLLUTERS = ['factory', 'power'];
  const LOD_NEAR = 0.55;                // 缩放 >= 该值时逐格绘制，否则绘制地面贴图
  const ZOOM_MIN = 0.12, ZOOM_MAX = 2.6;
  const GROUND_SCALE = 0.5;             // 地面贴图分辨率
  const SLOTS = 8;                      // 存档槽数量
  const SAVE_VER = 4;
  const SAVE_KEY = 'iso-city-v1';       // 旧版单存档键，仅用于迁移
  const slotKey = (n) => 'iso-city-slot-' + n;

  const BUILD = {
    road:       { cat: 'roads', name: '道路', icon: '🛣️', cost: 20, hint: '双车道小路，住宅必须紧挨道路才会有人入住' },
    avenue:     { cat: 'roads', name: '大道', icon: '🛤️', cost: 60, hint: '四车道大道，路边住宅幸福度 +2（最多 +8）' },
    ramp:       { cat: 'roads', name: '匝道', icon: '↗️', cost: 80, hint: '把高架接回地面，必须挨着高架建' },
    elevated:   { cat: 'roads', name: '高架', icon: '🌉', cost: 120, hint: '立体跨过道路、水面与树木，可与地面道路立体交叉' },

    house:      { cat: 'basic', name: '住宅', icon: '🏠', cost: 150, hint: '容纳 4 / 8 / 12 人，住满后自动升级' },
    shop:       { cat: 'basic', name: '商店', icon: '🏪', cost: 300, hint: '持续收入 +1.2/秒' },
    factory:    { cat: 'basic', name: '工厂', icon: '🏭', cost: 450, hint: '收入 +1.8/秒，但会污染周边' },
    power:      { cat: 'basic', name: '电站', icon: '⚡', cost: 600, hint: '供电 +25，稍有污染' },
    park:       { cat: 'basic', name: '公园', icon: '🌳', cost: 120, hint: '提升附近住宅的幸福度' },
    tree:       { cat: 'basic', name: '树木', icon: '🌲', cost: 30, hint: '装饰用，少量幸福度' },
    del:        { cat: 'basic', name: '拆除', icon: '🧨', cost: 0, hint: '退还 50% 建造费用' },

    rail:       { cat: 'transit', name: '轨道', icon: '🚇', cost: 60, hint: '轨道线，车站必须接在轨道上' },
    station:    { cat: 'transit', name: '车站', icon: '🚉', cost: 400, hint: '要挨着轨道；提升周边幸福度并带来客流收入' },
    hub:        { cat: 'transit', name: '换乘枢纽', icon: '🔀', cost: 1200, hint: '至少接两段轨道；幸福度与客流收入更高' },
    port:       { cat: 'transit', name: '港口', icon: '⚓', cost: 1800, hint: '必须建在水边，收入 +4.0/秒' },
    airport:    { cat: 'transit', name: '机场', icon: '✈️', cost: 4000, hint: '需要道路接入，收入高但噪音污染大' },

    hospital:   { cat: 'civic', name: '医院', icon: '🏥', cost: 900, hint: '大范围提升住宅幸福度，耗电 4' },
    school:     { cat: 'civic', name: '学校', icon: '🏫', cost: 600, hint: '提升幸福度，并加快住宅升级与人口增长' },
    fire:       { cat: 'civic', name: '消防局', icon: '🚒', cost: 450, hint: '提升住宅幸福度，耗电 2' },
    police:     { cat: 'civic', name: '警局', icon: '🚓', cost: 450, hint: '提升住宅幸福度，耗电 2' },

    tower:      { cat: 'landmark', name: '高塔', icon: '🗼', cost: 3000, hint: '地标：全城幸福度 +4' },
    stadium:    { cat: 'landmark', name: '体育场', icon: '🏟️', cost: 2600, hint: '地标：全城幸福度 +3，收入 +6.0/秒' },
    skyscraper: { cat: 'landmark', name: '摩天楼', icon: '🏢', cost: 2200, hint: '高收入写字楼 +5.5/秒，耗电 14' },

    office:     { cat: 'industry', name: '写字楼', icon: '🏬', cost: 1000, hint: '收入 +3.2/秒，耗电 6' },
    logistics:  { cat: 'industry', name: '物流园', icon: '📦', cost: 700, hint: '收入 +2.4/秒，有轻微污染' },
  };

  const CATS = [
    { id: 'basic', name: '基础' },
    { id: 'roads', name: '道路' },
    { id: 'transit', name: '交通' },
    { id: 'civic', name: '市政' },
    { id: 'landmark', name: '地标' },
    { id: 'industry', name: '产业' },
  ];
  const CAT_TOOLS = {
    basic: ['house', 'shop', 'factory', 'power', 'park', 'tree', 'del'],
    roads: ['road', 'avenue', 'ramp', 'elevated'],
    transit: ['rail', 'station', 'hub', 'port', 'airport'],
    civic: ['hospital', 'school', 'fire', 'police'],
    landmark: ['tower', 'stadium', 'skyscraper'],
    industry: ['office', 'logistics'],
  };
  const SURFACE_ROADS = ['road', 'avenue', 'ramp'];
  const LIFT = 24;                      // 高架路面相对地面的高度

  // 每类建筑的耗电 / 供电 / 基础收入
  const SPEC = {
    shop:       { power: 3, income: 1.2 },
    factory:    { power: 5, income: 1.8 },
    power:      { supply: 25 },
    station:    { power: 3, income: 1.6 },
    hub:        { power: 6, income: 3.2 },
    port:       { power: 5, income: 4.0 },
    airport:    { power: 10, income: 7.0 },
    hospital:   { power: 4 },
    school:     { power: 3 },
    fire:       { power: 2 },
    police:     { power: 2 },
    tower:      { power: 2, income: 1.5 },
    stadium:    { power: 4, income: 6.0 },
    skyscraper: { power: 14, income: 5.5 },
    office:     { power: 6, income: 3.2 },
    logistics:  { power: 3, income: 2.4 },
  };

  /* ================= DOM ================= */
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const elMoney = $('v-money'), elIncome = $('v-income'), elPop = $('v-pop');
  const elHappy = $('v-happy'), elHappyLabel = $('v-happylabel');
  const elPower = $('v-power'), elPowerLabel = $('v-powerlabel');
  const elDay = $('v-day'), elSpeed = $('v-speed');
  const catsEl = $('cats'), dockEl = $('tools'), toolInfoEl = $('toolinfo');
  const hintEl = $('cursorhint'), toastEl = $('toast'), helpEl = $('help');
  const savesEl = $('saves'), saveListEl = $('savelist'), saveModeEl = $('savemode');

  /* ================= 状态 ================= */
  const state = {
    money: 4000,
    pop: 0,
    happiness: 70,
    income: 3.5,
    noRoadHouses: 0,
    powerSupply: 0,
    powerDemand: 0,
    powerRatio: 1,
    day: 1,
    paused: false,
    tool: 'road',
    cat: 'basic',
    slot: 1,
    terrain: new Uint8Array(N * N),   // 0 草地 / 1 水域
    gcol: new Array(N * N).fill('#5d9a52'),
    cells: new Array(N * N).fill(null),
    upper: new Array(N * N).fill(null),  // 高架层：'elevated' / 'ramp'
  };
  const view = { x: 0, y: 0, zoom: 1, cw: 0, ch: 0, dpr: 1 };
  const pointer = { x: 0, y: 0, tx: -1, ty: -1, inside: false };
  let simTime = 0;
  let nowSec = 0;

  /* ================= 小工具 ================= */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const idx = (i, j) => j * N + i;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashTile(i, j) {
    let h = i * 374761393 + j * 668265263;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  }

  /* ================= 地图生成 ================= */
  function genMap(seed) {
    const rng = mulberry32(seed);
    const terrain = new Uint8Array(N * N);
    const lakes = 6 + Math.floor(rng() * 5);
    const centers = [];
    for (let k = 0; k < lakes; k++) {
      centers.push([
        12 + rng() * (N - 24),
        12 + rng() * (N - 24),
        3.5 + rng() * 7.5,
      ]);
    }
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        for (let c = 0; c < centers.length; c++) {
          const [lx, ly, r] = centers[c];
          if (Math.hypot(i - lx, j - ly) + (rng() - 0.5) * 1.6 < r) { terrain[idx(i, j)] = 1; break; }
        }
      }
    }
    for (let i = 0; i < N; i++) {          // 边缘不放水，保证可建造
      terrain[idx(i, 0)] = 0; terrain[idx(i, N - 1)] = 0;
      terrain[idx(0, i)] = 0; terrain[idx(N - 1, i)] = 0;
    }
    for (let j = 1; j < N - 1; j++) {      // 树木
      for (let i = 1; i < N - 1; i++) {
        const k = idx(i, j);
        if (terrain[k]) continue;
        if (Math.abs(i - (N - 1) / 2) < 7 && Math.abs(j - (N - 1) / 2) < 7) continue;
        if (rng() < 0.07) terrain[k] = 2;
      }
    }
    state.terrain = terrain;
    rebuildGcol();
    groundDirty = true;
  }

  function rebuildGcol() {
    state.gcol = new Array(N * N);
    for (let k = 0; k < N * N; k++) {
      const t = hashTile(k % N, (k / N) | 0);
      state.gcol[k] = 'hsl(' + Math.round(96 + t * 14) + ',' +
        Math.round(26 + t * 10) + '%,' + Math.round(31 + t * 7) + '%)';
    }
  }

  function newGame(seed) {
    genMap(seed === undefined ? Math.floor(Math.random() * 1e9) : seed);
    state.cells = new Array(N * N).fill(null);
    state.upper = new Array(N * N).fill(null);
    for (let k = 0; k < N * N; k++) {
      if (state.terrain[k] === 2) {
        state.cells[k] = { type: 'tree', lvl: 1, pop: 0, free: true };
        state.terrain[k] = 0;
      }
    }
    state.money = 4000;
    state.pop = 0;
    state.happiness = 70;
    state.income = 3.5;
    state.noRoadHouses = 0;
    state.powerSupply = 0;
    state.powerDemand = 0;
    state.powerRatio = 1;
    simTime = 0;
    state.day = 1;
    if (!BUILD[state.tool] || state.tool === 'del') state.tool = 'road';
    state.cat = BUILD[state.tool].cat;
    fitView();
    setCategory(state.cat, true);
    selectTool(state.tool, true);
    persist();
  }

  /* ================= 查询 ================= */
  const inMap = (i, j) => i >= 0 && j >= 0 && i < N && j < N;
  function cellAt(i, j) { return inMap(i, j) ? state.cells[idx(i, j)] : null; }
  function upperAt(i, j) { return inMap(i, j) ? state.upper[idx(i, j)] : null; }
  function isStreet(i, j) {
    const c = cellAt(i, j);
    return !!c && SURFACE_ROADS.indexOf(c.type) >= 0;
  }
  function isAvenue(i, j) { const c = cellAt(i, j); return !!c && c.type === 'avenue'; }
  function isRamp(i, j) { const c = cellAt(i, j); return !!c && c.type === 'ramp'; }
  function isStation(i, j) {
    const c = cellAt(i, j);
    return !!c && (c.type === 'station' || c.type === 'hub');
  }
  function isRail(i, j) {
    const c = cellAt(i, j);
    return !!c && (c.type === 'rail' || c.type === 'station' || c.type === 'hub');
  }
  function isWater(i, j) { return inMap(i, j) && state.terrain[idx(i, j)] === 1; }
  function hasRoad(i, j) {
    return isStreet(i - 1, j) || isStreet(i + 1, j) || isStreet(i, j - 1) || isStreet(i, j + 1);
  }
  function hasAccess(i, j) {
    return hasRoad(i, j) || isStation(i - 1, j) || isStation(i + 1, j) ||
      isStation(i, j - 1) || isStation(i, j + 1);
  }
  function neighbors(i, j) {
    return [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]];
  }
  function nearWater(i, j) {
    const n = neighbors(i, j);
    for (let k = 0; k < n.length; k++) if (isWater(n[k][0], n[k][1])) return true;
    return false;
  }
  function countNear(i, j, types, r) {
    const list = typeof types === 'string' ? [types] : types;
    const r2 = r * r;
    let n = 0;
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (!di && !dj) continue;
        if (di * di + dj * dj > r2) continue;
        const a = i + di, b = j + dj;
        if (!inMap(a, b)) continue;
        const c = state.cells[idx(a, b)];
        if (c && list.indexOf(c.type) >= 0) n++;
      }
    }
    return n;
  }

  function canPlace(i, j, tool) {
    if (!inMap(i, j)) return { ok: false, why: '超出地图' };
    const k = idx(i, j);
    const c = state.cells[k];
    const up = state.upper[k];
    if (tool === 'del') return (c || up) ? { ok: true } : { ok: false, why: '这里没有东西', soft: true };

    if (tool === 'elevated') {
      if (up) return { ok: false, why: '这里已经有一层高架了', soft: true };
      if (c && !isStreet(i, j) && c.type !== 'tree') {
        return { ok: false, why: '高架只能跨过道路、水面、树木或空地', soft: true };
      }
      if (isRamp(i, j)) return { ok: false, why: '匝道上不能再叠高架', soft: true };
      if (state.money < BUILD[tool].cost) return { ok: false, why: '资金不足' };
      return { ok: true };
    }
    if (tool === 'ramp') {
      if (up) return { ok: false, why: '这里已经有一层高架了', soft: true };
      if (c && !isStreet(i, j)) return { ok: false, why: '这里已经有建筑了', soft: true };
      const nb = neighbors(i, j);
      let ok = false;
      for (let x = 0; x < nb.length; x++) if (upperAt(nb[x][0], nb[x][1]) === 'elevated') ok = true;
      if (!ok) return { ok: false, why: '匝道要挨着高架建', soft: true };
      if (state.money < BUILD[tool].cost) return { ok: false, why: '资金不足' };
      return { ok: true };
    }

    if (SURFACE_ROADS.indexOf(tool) < 0 && up) {
      return { ok: false, why: '高架桥下不能建造', soft: true };
    }
    if (state.terrain[k] === 1) return { ok: false, why: '不能填湖造陆', soft: true };
    if (c) {
      if (c.type === 'tree' && tool !== 'tree') { /* 可以砍树建造 */ }
      else if (SURFACE_ROADS.indexOf(c.type) >= 0 && SURFACE_ROADS.indexOf(tool) >= 0) {
        if (c.type === tool) return { ok: false, why: '已经是这种道路了', soft: true };
      } else if (c.type === 'tree' && tool === 'tree') return { ok: false, why: '已经有树了', soft: true };
      else return { ok: false, why: '这里已经有建筑了', soft: true };
    }
    if (tool === 'station') {
      let ok = false;
      const n = neighbors(i, j);
      for (let x = 0; x < n.length; x++) if (isRail(n[x][0], n[x][1])) ok = true;
      if (!ok) return { ok: false, why: '车站要挨着轨道建', soft: true };
    } else if (tool === 'hub') {
      let n = 0;
      const nb = neighbors(i, j);
      for (let x = 0; x < nb.length; x++) if (isRail(nb[x][0], nb[x][1])) n++;
      if (n < 2) return { ok: false, why: '换乘枢纽至少要接两段轨道', soft: true };
    } else if (tool === 'port') {
      if (!nearWater(i, j)) return { ok: false, why: '港口必须建在水边', soft: true };
    } else if (tool === 'airport') {
      if (!hasRoad(i, j)) return { ok: false, why: '机场需要紧挨道路接入', soft: true };
    }
    if (state.money < BUILD[tool].cost) return { ok: false, why: '资金不足' };
    return { ok: true };
  }

  /* ================= 建造 / 拆除 ================= */
  function place(i, j) {
    const v = canPlace(i, j, state.tool);
    if (!v.ok) {
      if (v.why === '资金不足') toast('资金不足，等收入涨一涨吧');
      return false;
    }
    const k = idx(i, j);
    if (state.tool === 'del') {
      if (state.upper[k]) {                 // 先拆高架层，再拆地面
        state.money += Math.round(BUILD.elevated.cost * 0.5);
        state.upper[k] = null;
        return true;
      }
      const c = state.cells[k];
      if (!c) return false;
      if (!c.free) state.money += Math.round((BUILD[c.type] ? BUILD[c.type].cost : 0) * 0.5);
      state.cells[k] = null;
      return true;
    }
    if (state.tool === 'elevated') {
      state.money -= BUILD.elevated.cost;
      state.upper[k] = 'elevated';
      return true;
    }
    state.money -= BUILD[state.tool].cost;
    state.cells[k] = state.tool === 'house'
      ? { type: 'house', lvl: 1, pop: 0, up: 0, bt: nowSec }
      : { type: state.tool, bt: nowSec };
    if (state.tool === 'house' && !hasAccess(i, j)) {
      toast('住宅要挨着道路（或车站）才会有人入住', 2400);
    }
    return true;
  }

  /* ================= 模拟 ================= */
  function logic(dt) {
    simTime += dt;
    state.day = 1 + Math.floor(simTime / 8);

    let supply = 0, demand = 0, baseIncome = 0, towers = 0, stadiums = 0;
    const houses = [];
    for (let k = 0; k < N * N; k++) {
      const c = state.cells[k];
      if (!c) continue;
      if (c.type === 'house') {
        houses.push([k % N, (k / N) | 0, c]);
        demand += c.lvl;
        continue;
      }
      const sp = SPEC[c.type];
      if (!sp) continue;
      demand += sp.power || 0;
      supply += sp.supply || 0;
      baseIncome += sp.income || 0;
      if (c.type === 'tower') towers++;
      else if (c.type === 'stadium') stadiums++;
    }
    const ratio = demand > 0 ? Math.min(1, supply / demand) : 1;
    state.powerSupply = supply;
    state.powerDemand = demand;
    state.powerRatio = ratio;

    // 收入
    const income = 3.5 + state.pop * 0.04 + baseIncome * ratio;
    state.money += income * dt;
    state.income = income;

    // 幸福度
    let target = 70 + towers * 4 + stadiums * 3;
    if (houses.length) {
      let sum = 0;
      for (let n = 0; n < houses.length; n++) {
        const i = houses[n][0], j = houses[n][1];
        let v = 0;
        v += Math.min(15, 3 * countNear(i, j, 'park', 3));
        v += Math.min(5, 0.6 * countNear(i, j, 'tree', 2));
        v -= Math.min(20, 2.5 * countNear(i, j, POLLUTERS, 3));
        v -= Math.min(12, 3 * countNear(i, j, 'airport', 4));
        v -= Math.min(6, 1.2 * countNear(i, j, 'logistics', 3));
        v += Math.min(10, 2.5 * countNear(i, j, 'hospital', 5));
        v += Math.min(8, 2 * countNear(i, j, 'school', 4));
        v += Math.min(6, 1.5 * countNear(i, j, ['fire', 'police'], 4));
        v += Math.min(8, 2 * countNear(i, j, 'avenue', 1));
        v += Math.min(10, 2.5 * countNear(i, j, 'station', 4));
        v += Math.min(16, 4 * countNear(i, j, 'hub', 5));
        v += Math.min(8, 1 * countNear(i, j, ['stadium', 'skyscraper'], 6));
        sum += v;
      }
      target = clamp(target + sum / houses.length - (1 - ratio) * 18, 0, 100);
    }
    state.happiness += (target - state.happiness) * Math.min(1, dt * 0.9);
    state.happiness = clamp(state.happiness, 0, 100);

    // 人口
    const hf = clamp((state.happiness - 35) / 60, 0.05, 1);
    let pop = 0, noRoad = 0;
    for (let n = 0; n < houses.length; n++) {
      const i = houses[n][0], j = houses[n][1], c = houses[n][2];
      const cap = HOUSE_CAP[c.lvl];
      const boost = 1 + Math.min(0.6, 0.3 * countNear(i, j, 'school', 4));
      if (hasAccess(i, j)) {
        if (c.pop < cap) {
          c.pop = Math.min(cap, c.pop + dt * 0.9 * hf * boost * (0.35 + 0.65 * ratio));
          c.up = 0;
        } else if (c.lvl < 3 && state.happiness >= 58 && ratio > 0.6) {
          c.up += dt * boost;
          if (c.up >= 14) { c.lvl++; c.up = 0; }
        } else {
          c.up = Math.max(0, c.up - dt * 0.5);
        }
      } else if (c.pop > 0) {
        c.pop = Math.max(0, c.pop - dt * 0.6);   // 断路后居民逐渐搬走
        noRoad++;
      } else {
        noRoad++;
      }
      pop += c.pop;
    }
    state.pop = pop;
    state.noRoadHouses = noRoad;
  }

  /* ================= 存档 ================= */
  function encodeTerrain(t) {
    let out = '', last = t[0], n = 1;
    for (let k = 1; k < t.length; k++) {
      if (t[k] === last) { n++; continue; }
      out += last + ':' + n + ',';
      last = t[k]; n = 1;
    }
    return out + last + ':' + n;
  }

  function decodeTerrain(str, size) {
    const out = new Uint8Array(size * size);
    let p = 0;
    const parts = String(str).split(',');
    for (let n = 0; n < parts.length; n++) {
      const kv = parts[n].split(':');
      const val = Number(kv[0]), cnt = Number(kv[1]);
      if (!Number.isInteger(val) || !Number.isInteger(cnt) || val < 0 || val > 2 || cnt <= 0) return null;
      for (let k = 0; k < cnt; k++) {
        if (p >= out.length) return null;
        out[p++] = val;
      }
    }
    return p === out.length ? out : null;
  }

  function encodeIndices(arr) {
    const runs = [];
    let start = -1;
    for (let k = 0; k <= arr.length; k++) {
      const on = k < arr.length && !!arr[k];
      if (on && start < 0) start = k;
      else if (!on && start >= 0) { runs.push(start + ':' + (k - start)); start = -1; }
    }
    return runs.join(',');
  }

  function decodeIndices(str, size) {
    const out = new Array(size * size).fill(null);
    if (!str) return out;
    const parts = String(str).split(',');
    for (let n = 0; n < parts.length; n++) {
      const kv = parts[n].split(':');
      const start = Number(kv[0]), cnt = Number(kv[1]);
      if (!Number.isInteger(start) || !Number.isInteger(cnt) || start < 0 || cnt <= 0) return null;
      if (start + cnt > out.length) return null;
      for (let k = 0; k < cnt; k++) out[start + k] = 'elevated';
    }
    return out;
  }

  function snapshot() {
    const cells = [];
    for (let k = 0; k < N * N; k++) {
      const c = state.cells[k];
      if (!c) continue;
      cells.push([k, c.type, c.lvl || 1, Math.round((c.pop || 0) * 100) / 100, c.free ? 1 : 0]);
    }
    return {
      v: SAVE_VER,
      size: N,
      money: Math.round(state.money),
      happiness: state.happiness,
      pop: Math.round(state.pop),
      simTime: simTime,
      day: state.day,
      tool: state.tool,
      cat: state.cat,
      terrain: encodeTerrain(state.terrain),
      cells: cells,
      upper: encodeIndices(state.upper),
      cam: [view.x, view.y, view.zoom],
      savedAt: Date.now(),
    };
  }

  function applySave(d) {
    if (!d || typeof d !== 'object') return false;
    let oldSize, oldTerrain;
    if (d.v === 1) {
      oldSize = 24;
      oldTerrain = Array.isArray(d.terrain) && d.terrain.length === 24 * 24 ? d.terrain : null;
    } else if (d.v === 2 || d.v === 3 || d.v === 4) {
      oldSize = Number(d.size);
      if (!Number.isInteger(oldSize) || oldSize < 1 || oldSize > N) return false;
      if (d.v >= 3) {
        oldTerrain = decodeTerrain(d.terrain, oldSize);
      } else {
        oldTerrain = Array.isArray(d.terrain) && d.terrain.length === oldSize * oldSize ? d.terrain : null;
      }
    } else {
      return false;
    }
    if (!oldTerrain) return false;

    const offset = Math.floor((N - oldSize) / 2);
    if (oldSize < N) {
      genMap(Math.floor(Math.random() * 1e9));
      state.cells = new Array(N * N).fill(null);
      state.upper = new Array(N * N).fill(null);
      for (let k = 0; k < N * N; k++) {
        if (state.terrain[k] === 2) {
          state.cells[k] = { type: 'tree', lvl: 1, pop: 0, free: true };
          state.terrain[k] = 0;
        }
      }
    } else {
      state.terrain = new Uint8Array(N * N);
      state.cells = new Array(N * N).fill(null);
      state.upper = new Array(N * N).fill(null);
    }
    for (let j = 0; j < oldSize; j++) {
      for (let i = 0; i < oldSize; i++) {
        const k = idx(i + offset, j + offset);
        state.terrain[k] = oldTerrain[j * oldSize + i];
        state.cells[k] = null;
      }
    }
    for (let k = 0; k < N * N; k++) {
      if (state.terrain[k] === 2) {
        state.cells[k] = { type: 'tree', lvl: 1, pop: 0, free: true };
        state.terrain[k] = 0;
      }
    }
    const arr = Array.isArray(d.cells) ? d.cells : [];
    for (let n = 0; n < arr.length; n++) {
      const e = arr[n];
      if (!e || e.length < 2) continue;
      const k = e[0], type = e[1];
      if (!Number.isInteger(k) || k < 0 || k >= oldSize * oldSize) continue;
      if (!BUILD[type] || type === 'del') continue;
      const i = k % oldSize, j = Math.floor(k / oldSize);
      state.cells[idx(i + offset, j + offset)] =
        { type: type, lvl: e[2] || 1, pop: e[3] || 0, up: 0, free: !!e[4] };
    }
    const oldUpper = d.v >= 4 ? decodeIndices(d.upper, oldSize) : new Array(oldSize * oldSize).fill(null);
    if (!oldUpper) return false;
    for (let n = 0; n < oldSize * oldSize; n++) {
      if (!oldUpper[n]) continue;
      const i = n % oldSize, j = Math.floor(n / oldSize);
      state.upper[idx(i + offset, j + offset)] = oldUpper[n];
    }
    rebuildGcol();
    groundDirty = true;

    state.money = typeof d.money === 'number' ? d.money : 4000;
    state.happiness = typeof d.happiness === 'number' ? d.happiness : 70;
    simTime = typeof d.simTime === 'number' ? d.simTime : 0;
    state.day = d.day || 1;
    state.pop = typeof d.pop === 'number' ? d.pop : 0;
    if (d.tool && BUILD[d.tool]) {
      state.tool = d.tool;
      state.cat = BUILD[d.tool].cat;
    }
    if (d.cat && CAT_TOOLS[d.cat]) state.cat = d.cat;
    if (Array.isArray(d.cam) && d.cam.length === 3) {
      view.zoom = clamp(Number(d.cam[2]) || 1, ZOOM_MIN, ZOOM_MAX);
      view.x = Number(d.cam[0]) || 0;
      view.y = (Number(d.cam[1]) || 0) + offset * TH;
    } else {
      fitView();
    }
    setCategory(state.cat, true);
    selectTool(state.tool, true);
    return true;
  }

  const store = {
    api: false,
    async init() {
      try {
        const r = await fetch('/api/health', { cache: 'no-store' });
        if (r.ok) {
          const d = await r.json();
          this.api = !!(d && d.ok);
        }
      } catch (e) {
        this.api = false;
      }
      return this.api;
    },
    async list() {
      if (this.api) {
        try {
          const r = await fetch('/api/saves', { cache: 'no-store' });
          if (r.ok) return await r.json();
        } catch (e) { /* 回退到浏览器存档 */ }
        return [];
      }
      const out = [];
      for (let s = 1; s <= SLOTS; s++) {
        try {
          const raw = localStorage.getItem(slotKey(s));
          if (!raw) continue;
          out.push(Object.assign({ slot: s }, metaOf(JSON.parse(raw))));
        } catch (e) { /* 忽略损坏的存档 */ }
      }
      return out;
    },
    async read(slot) {
      if (this.api) {
        try {
          const r = await fetch('/api/save/' + slot, { cache: 'no-store' });
          if (r.ok) return await r.json();
        } catch (e) { /* 回退 */ }
        return null;
      }
      try {
        const raw = localStorage.getItem(slotKey(slot));
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },
    async write(slot, data) {
      if (this.api) {
        try {
          const r = await fetch('/api/save/' + slot, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
          return r.ok;
        } catch (e) {
          return false;
        }
      }
      try {
        localStorage.setItem(slotKey(slot), JSON.stringify(data));
        return true;
      } catch (e) {
        return false;
      }
    },
    async remove(slot) {
      if (this.api) {
        try {
          const r = await fetch('/api/save/' + slot, { method: 'DELETE' });
          return r.ok;
        } catch (e) {
          return false;
        }
      }
      try {
        localStorage.removeItem(slotKey(slot));
        return true;
      } catch (e) {
        return false;
      }
    },
  };

  function metaOf(d) {
    if (!d || typeof d !== 'object') return { meta: '（无法读取）', savedAt: 0 };
    const money = Math.round(Number(d.money) || 0);
    const pop = Math.round(Number(d.pop) || 0);
    const day = Number(d.day) || 1;
    const savedAt = Number(d.savedAt) || 0;
    return {
      day: day,
      money: money,
      pop: pop,
      savedAt: savedAt,
      meta: '第 ' + day + ' 天 · ¥' + money.toLocaleString('zh-CN') + ' · ' + pop + ' 人' +
        (savedAt ? ' · ' + new Date(savedAt).toLocaleString('zh-CN', { hour12: false }) : ''),
    };
  }

  async function persist(slot) {
    const s = slot || state.slot || 1;
    const ok = await store.write(s, snapshot());
    if (!ok) toast('保存失败：没有可写入的存档位置', 2600);
    return ok;
  }

  /* ================= 相机 ================= */
  function fitView() {
    if (!view.cw) return;
    view.zoom = clamp(
      Math.min(view.cw / (N * TW * 1.02), view.ch / (N * TH * 1.35)),
      ZOOM_MIN, 1.45
    );
    view.x = 0;
    view.y = (N - 1) * H2;
  }
  function toWorld(sx, sy) {
    return {
      x: (sx - view.cw / 2) / view.zoom + view.x,
      y: (sy - view.ch / 2) / view.zoom + view.y,
    };
  }
  function toTile(wx, wy) {
    const u = wx / W2, v = wy / H2;
    return { i: Math.round((u + v) / 2), j: Math.round((v - u) / 2) };
  }
  function tileFloat(wx, wy) {
    const u = wx / W2, v = wy / H2;
    return { i: (u + v) / 2, j: (v - u) / 2 };
  }

  /* ================= 绘图基元 ================= */
  function diamond(cx, cy, w2, h2) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - h2);
    ctx.lineTo(cx + w2, cy);
    ctx.lineTo(cx, cy + h2);
    ctx.lineTo(cx - w2, cy);
    ctx.closePath();
  }

  function quad(pts, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let n = 1; n < pts.length; n++) ctx.lineTo(pts[n][0], pts[n][1]);
    ctx.closePath();
    ctx.fill();
  }

  function prism(cx, cy, w2, h2, h, cTop, cLeft, cRight) {
    ctx.fillStyle = cLeft;
    ctx.beginPath();
    ctx.moveTo(cx - w2, cy);
    ctx.lineTo(cx, cy + h2);
    ctx.lineTo(cx, cy + h2 - h);
    ctx.lineTo(cx - w2, cy - h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = cRight;
    ctx.beginPath();
    ctx.moveTo(cx + w2, cy);
    ctx.lineTo(cx, cy + h2);
    ctx.lineTo(cx, cy + h2 - h);
    ctx.lineTo(cx + w2, cy - h);
    ctx.closePath();
    ctx.fill();
    diamond(cx, cy - h, w2, h2);
    ctx.fillStyle = cTop;
    ctx.fill();
  }

  // u 沿墙面底边（0 → 1），v 为墙高比例（0 底部 → 1 檐口）
  function faceWin(cx, cy, w2, h2, wh, side, u0, u1, v0, v1, color) {
    const ox = side === 'L' ? cx - w2 : cx + w2;
    const ex = side === 'L' ? w2 : -w2;
    const P = (u, v) => [ox + ex * u, cy + h2 * u - wh * v];
    quad([P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], color);
  }

  function shadow(cx, cy, w2, h2) {
    ctx.fillStyle = 'rgba(8,20,12,.22)';
    ctx.beginPath();
    ctx.ellipse(cx + 3, cy + 2, w2, h2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function roof(cx, cyTop, w2, h2, rh, cL, cR) {
    const ay = cyTop - rh;
    quad([[cx - w2, cyTop], [cx, cyTop + h2], [cx, ay]], cL);
    quad([[cx + w2, cyTop], [cx, cyTop + h2], [cx, ay]], cR);
    ctx.strokeStyle = 'rgba(255,255,255,.16)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - w2, cyTop);
    ctx.lineTo(cx, ay);
    ctx.lineTo(cx + w2, cyTop);
    ctx.stroke();
  }

  function bolt(x, y, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s * 0.62, y - s * 0.05);
    ctx.lineTo(x + s * 0.12, y - s * 0.05);
    ctx.lineTo(x + s * 0.35, y + s);
    ctx.lineTo(x - s * 0.6, y + s * 0.05);
    ctx.lineTo(x - s * 0.08, y + s * 0.05);
    ctx.closePath();
    ctx.fill();
  }

  function warnIcon(x, y, s) {
    ctx.fillStyle = 'rgba(255,182,64,.96)';
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s, y + s * 0.78);
    ctx.lineTo(x - s, y + s * 0.78);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(48,32,10,.92)';
    ctx.fillRect(x - 0.75, y - s * 0.42, 1.5, s * 0.62);
    ctx.fillRect(x - 0.75, y + s * 0.36, 1.5, 1.6);
  }

  function smoke(x, y, phase) {
    for (let s = 0; s < 3; s++) {
      const p = (nowSec * 0.42 + phase + s * 0.33) % 1;
      ctx.globalAlpha = 0.3 * (1 - p);
      ctx.fillStyle = '#d7e2ef';
      ctx.beginPath();
      ctx.arc(x + Math.sin(p * 5 + phase * 6) * 5, y - p * 26, 2.5 + p * 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ================= 建筑绘制 ================= */
  function drawHouse(cx, cy, cell, i, j) {
    const lvl = cell.lvl || 1;
    const w2 = W2 * (0.56 + 0.045 * lvl);
    const h2 = H2 * (0.56 + 0.045 * lvl);
    const wh = 9 + lvl * 5;
    shadow(cx, cy, w2 * 1.05, h2 * 1.2);
    prism(cx, cy, w2, h2, wh, '#f3e7d2', '#d3c1a3', '#b6a184');

    const lit = state.powerRatio > 0.6 && (cell.pop || 0) > 0.2;
    const wc = lit ? 'rgba(255,226,150,.92)' : 'rgba(120,150,180,.55)';
    faceWin(cx, cy, w2, h2, wh, 'L', 0.16, 0.36, 0.30, 0.68, wc);
    faceWin(cx, cy, w2, h2, wh, 'L', 0.60, 0.80, 0.30, 0.68, wc);
    faceWin(cx, cy, w2, h2, wh, 'R', 0.20, 0.40, 0.30, 0.68, wc);
    faceWin(cx, cy, w2, h2, wh, 'R', 0.64, 0.84, 0.30, 0.68, wc);

    const rh = 8 + lvl * 3.5;
    const cL = lvl >= 3 ? '#c9723f' : lvl === 2 ? '#bf5a45' : '#a8523e';
    const cR = lvl >= 3 ? '#a85c31' : lvl === 2 ? '#9c4534' : '#8a3f2f';
    roof(cx, cy - wh, w2 * 1.16, h2 * 1.16, rh, cL, cR);

    if (i !== undefined && !hasAccess(i, j)) {
      warnIcon(cx, cy - wh - rh - 13, 5.5);
    } else if ((cell.pop || 0) > 0.2 && state.powerRatio <= 0.6) {
      bolt(cx, cy - wh - rh - 16, 5.5, 'rgba(255,120,120,.9)');
    }
  }

  function drawShop(cx, cy) {
    const w2 = W2 * 0.66, h2 = H2 * 0.66, wh = 13;
    shadow(cx, cy, w2 * 1.05, h2 * 1.2);
    prism(cx, cy, w2, h2, wh, '#efe7d8', '#cfc2ac', '#ada08a');
    for (let s = 0; s < 5; s++) {
      const u0 = 0.06 + s * 0.18, u1 = Math.min(0.96, u0 + 0.1);
      faceWin(cx, cy, w2, h2, wh, 'L', u0, u1, 0.52, 0.86, s % 2 ? '#f2f4f7' : '#d95b52');
      faceWin(cx, cy, w2, h2, wh, 'R', u0, u1, 0.52, 0.86, s % 2 ? '#e3e7ec' : '#c64f46');
    }
    faceWin(cx, cy, w2, h2, wh, 'R', 0.28, 0.60, 0.02, 0.44, 'rgba(150,205,235,.75)');
    faceWin(cx, cy, w2, h2, wh, 'L', 0.44, 0.74, 0.02, 0.44, 'rgba(140,195,225,.55)');
    prism(cx, cy - wh, 11, 5.5, 7, '#ffd166', '#d9a93b', '#b98c28');
    ctx.fillStyle = '#7c5a0e';
    ctx.beginPath();
    ctx.arc(cx, cy - wh - 12, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFactory(cx, cy) {
    const w2 = W2 * 0.72, h2 = H2 * 0.72, wh = 12;
    shadow(cx, cy, w2 * 1.05, h2 * 1.2);
    prism(cx, cy, w2, h2, wh, '#98a1ac', '#767f8a', '#5c646d');
    faceWin(cx, cy, w2, h2, wh, 'L', 0.06, 0.94, 0.16, 0.3, 'rgba(255,255,255,.10)');
    faceWin(cx, cy, w2, h2, wh, 'R', 0.06, 0.94, 0.16, 0.3, 'rgba(255,255,255,.07)');
    for (let s = 0; s < 3; s++) {
      faceWin(cx, cy, w2, h2, wh, 'R', 0.1 + s * 0.29, 0.1 + s * 0.29 + 0.17, 0.4, 0.72, 'rgba(180,220,250,.5)');
    }
    const chx = cx - 7, chy = cy - wh + 2;
    const chx2 = cx + 9, chy2 = cy - wh - 3;
    prism(chx, chy, 5, 2.6, 13, '#626a73', '#4a5158', '#3b4147');
    prism(chx2, chy2, 4, 2.1, 10, '#626a73', '#4a5158', '#3b4147');
    smoke(chx, chy - 13, 0);
    smoke(chx2, chy2 - 10, 0.5);
  }

  function drawPower(cx, cy) {
    const w2 = W2 * 0.7, h2 = H2 * 0.7, wh = 10;
    shadow(cx, cy, w2 * 1.05, h2 * 1.2);
    prism(cx, cy, w2, h2, wh, '#5e6f88', '#455467', '#313d4c');
    faceWin(cx, cy, w2, h2, wh, 'L', 0.02, 0.98, 0.28, 0.5, '#f2c14a');
    faceWin(cx, cy, w2, h2, wh, 'R', 0.02, 0.98, 0.28, 0.5, '#d9a832');
    prism(cx + 2, cy - wh - 4, 12, 6, 10, '#7d8ca3', '#5d6a7d', '#46515f');
    const p = 0.7 + 0.3 * Math.sin(nowSec * 3);
    bolt(cx + 2, cy - wh - 26, 8, 'rgba(255,226,110,' + p.toFixed(2) + ')');
    smoke(cx + 2, cy - wh - 20, 0.2);
  }

  function miniTree(x, y, r, ph) {
    const sway = Math.sin(nowSec * 1.3 + ph) * 1.2;
    ctx.fillStyle = '#6b4a2c';
    ctx.fillRect(x - 1.2, y - 3, 2.4, 7);
    ctx.fillStyle = '#2f7a3b';
    ctx.beginPath();
    ctx.arc(x + sway * 0.2, y - 5, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3f9b4c';
    ctx.beginPath();
    ctx.arc(x + sway * 0.3 - r * 0.25, y - 6.5, r * 0.72, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPark(cx, cy) {
    diamond(cx, cy, W2 * 0.88, H2 * 0.88);
    ctx.fillStyle = '#6fb75e';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = '#d8c79b';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(cx - W2 * 0.55, cy + H2 * 0.25);
    ctx.lineTo(cx + W2 * 0.35, cy - H2 * 0.3);
    ctx.stroke();
    miniTree(cx - 10, cy + 1, 7, 0);
    miniTree(cx + 12, cy + 4, 6, 1.7);
    miniTree(cx + 2, cy + 8, 5, 3.1);
  }

  function drawTree(cx, cy, cell, i, j) {
    const h = hashTile(i, j);
    const s = 0.85 + h * 0.3;
    const sway = Math.sin(nowSec * 1.1 + h * 6.3) * 1.6;
    shadow(cx, cy, W2 * 0.38, H2 * 0.42);
    ctx.fillStyle = '#6d4a2b';
    ctx.fillRect(cx - 2, cy - 18 * s, 4, 18 * s);
    const layers = [
      [cy - 16 * s, 16.5 * s, '#3a9248'],
      [cy - 23 * s, 15 * s, '#2f7d3c'],
      [cy - 30 * s, 13 * s, '#286b34'],
    ];
    for (let n = 0; n < layers.length; n++) {
      const y0 = layers[n][0], r = layers[n][1], col = layers[n][2];
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(cx + sway, y0 - 13 * s);
      ctx.lineTo(cx + r, y0 + 2);
      ctx.lineTo(cx - r, y0 + 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  function roadWidth(type) {
    return type === 'avenue' ? 15 : type === 'ramp' ? 10 : 9;
  }

  function drawRoadSeg(cx, cy, nx, ny, type) {
    const dx = nx - cx, dy = ny - cy;
    const len = Math.hypot(dx, dy) || 1;
    const px = (-dy / len), py = (dx / len);
    const w = roadWidth(type);
    const base = type === 'avenue' ? '#3d434f' : type === 'ramp' ? '#4a5260' : '#474d59';
    quad([
      [cx + px * w, cy + py * w],
      [nx + px * w, ny + py * w],
      [nx - px * w, ny - py * w],
      [cx - px * w, cy - py * w],
    ], base);

    if (type === 'avenue') {
      ctx.strokeStyle = 'rgba(255,214,120,.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.16)';
      ctx.setLineDash([4, 5]);
      for (let s = -1; s <= 1; s += 2) {
        ctx.beginPath();
        ctx.moveTo(cx + px * 7 * s, cy + py * 7 * s);
        ctx.lineTo(nx + px * 7 * s, ny + py * 7 * s);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = type === 'ramp' ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.10)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash(type === 'ramp' ? [5, 4] : []);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawRoad(cx, cy, cell, i, j) {
    const type = cell.type;
    const links = [
      [i - 1, j, -1, -1],
      [i, j - 1, 1, -1],
      [i, j + 1, -1, 1],
      [i + 1, j, 1, 1],
    ];
    let any = false;
    for (let n = 0; n < links.length; n++) {
      const ni = links[n][0], nj = links[n][1];
      if (!isStreet(ni, nj)) continue;
      any = true;
      drawRoadSeg(cx, cy, cx + links[n][2] * W2 / 2, cy + links[n][3] * H2 / 2,
        type === 'ramp' ? 'ramp' : type);
    }
    if (!any) {
      ctx.fillStyle = type === 'avenue' ? '#3d434f' : '#474d59';
      ctx.beginPath();
      ctx.ellipse(cx, cy, type === 'avenue' ? 14 : 11, type === 'avenue' ? 7.5 : 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* --- 立体高架 --- */
  const DIRS = [
    { di: -1, dj: 0, ux: -1, uy: -1 },
    { di: 0, dj: -1, ux: 1, uy: -1 },
    { di: 0, dj: 1, ux: -1, uy: 1 },
    { di: 1, dj: 0, ux: 1, uy: 1 },
  ];

  function deckShadow(cx, cy, nx, ny, w) {
    const dx = nx - cx, dy = ny - cy;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len, py = dx / len;
    quad([
      [cx + px * w + 5, cy + py * w + 9],
      [nx + px * w + 5, ny + py * w + 9],
      [nx - px * w + 5, ny - py * w + 9],
      [cx - px * w + 5, cy - py * w + 9],
    ], 'rgba(6,14,10,.20)');
  }

  function deckSeg(cx, cy, nx, ny, w, color) {
    const dx = nx - cx, dy = ny - cy;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len, py = dx / len;
    quad([
      [cx + px * w, cy + py * w],
      [nx + px * w, ny + py * w],
      [nx - px * w, ny - py * w],
      [cx - px * w, cy - py * w],
    ], color);
  }

  function drawElevated(cx, cy, i, j) {
    const y = cy - LIFT;
    const w = 10;

    // 桥墩 + 地面投影
    ctx.fillStyle = 'rgba(6,14,10,.22)';
    ctx.beginPath();
    ctx.ellipse(cx + 3, cy + 3, 9, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    if ((i + j) % 2 === 0) {
      ctx.fillStyle = '#5d6672';
      ctx.fillRect(cx - 3, y + 1, 6, LIFT);
      ctx.fillStyle = 'rgba(255,255,255,.10)';
      ctx.fillRect(cx - 3, y + 1, 1.8, LIFT);
    }

    const segs = [];
    for (let n = 0; n < DIRS.length; n++) {
      const d = DIRS[n];
      if (!upperAt(i + d.di, j + d.dj) && !isRamp(i + d.di, j + d.dj)) continue;
      segs.push(d);
    }

    for (let n = 0; n < segs.length; n++) {
      const d = segs[n];
      deckShadow(cx, y, cx + d.ux * W2 / 2, y + d.uy * H2 / 2, w + 1);
    }
    for (let n = 0; n < segs.length; n++) {
      const d = segs[n];
      const mx = cx + d.ux * W2 / 2;
      const my = y + d.uy * H2 / 2;
      deckSeg(cx, y, mx, my, w, '#6e7783');
      // 护栏
      ctx.strokeStyle = 'rgba(226,236,248,.55)';
      ctx.lineWidth = 1.5;
      for (let s = -1; s <= 1; s += 2) {
        const dx = mx - cx, dy = my - y;
        const len = Math.hypot(dx, dy) || 1;
        const px = -dy / len * w * s, py = dx / len * w * s;
        ctx.beginPath();
        ctx.moveTo(cx + px, y + py);
        ctx.lineTo(mx + px, my + py);
        ctx.stroke();
      }
      // 中心标线
      ctx.strokeStyle = 'rgba(255,222,132,.55)';
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.lineTo(mx, my);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (!segs.length) {
      ctx.fillStyle = '#6e7783';
      ctx.beginPath();
      ctx.ellipse(cx, y, 12, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawRamp(cx, cy, cell, i, j) {
    let up = null;
    for (let n = 0; n < DIRS.length; n++) {
      const d = DIRS[n];
      if (upperAt(i + d.di, j + d.dj)) { up = d; break; }
    }

    for (let n = 0; n < DIRS.length; n++) {
      const d = DIRS[n];
      if (up && d.di === up.di && d.dj === up.dj) continue;
      if (!isStreet(i + d.di, j + d.dj)) continue;
      drawRoadSeg(cx, cy, cx + d.ux * W2 / 2, cy + d.uy * H2 / 2, 'road');
    }

    if (!up) {
      drawRoadSeg(cx, cy, cx + W2 / 2, cy - H2 / 2, 'road');
      return;
    }

    const ax = cx - up.ux * W2 / 2;
    const ay = cy - up.uy * H2 / 2;
    const bx = cx + up.ux * W2 / 2;
    const by = cy + up.uy * H2 / 2 - LIFT;
    deckShadow(ax, ay, bx, by, 9);
    deckSeg(ax, ay, bx, by, 9, '#5f6975');
    ctx.strokeStyle = 'rgba(255,255,255,.32)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(214,228,244,.5)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(bx + up.ux * 2, by + up.uy * 2);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  /* --- 轨道交通 --- */
  const RAIL_LINKS = [[0, -1, 1, -1], [0, 1, -1, 1], [1, 0, 1, 1], [-1, 0, -1, -1]];

  function railLink(cx, cy, nx, ny) {
    const dx = nx - cx, dy = ny - cy;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len, py = dx / len;
    quad([
      [cx + px * 12, cy + py * 12],
      [nx + px * 12, ny + py * 12],
      [nx - px * 12, ny - py * 12],
      [cx - px * 12, cy - py * 12],
    ], '#6a6357');
    ctx.strokeStyle = '#cbd4de';
    ctx.lineWidth = 2;
    for (let s = 0; s < 2; s++) {
      const off = s ? 4.5 : -4.5;
      ctx.beginPath();
      ctx.moveTo(cx + px * off, cy + py * off);
      ctx.lineTo(nx + px * off, ny + py * off);
      ctx.stroke();
    }
  }

  function drawRail(cx, cy, cell, i, j) {
    diamond(cx, cy, W2 * 0.92, H2 * 0.92);
    ctx.fillStyle = '#71695c';
    ctx.fill();
    let any = false;
    for (let n = 0; n < RAIL_LINKS.length; n++) {
      const ni = i + RAIL_LINKS[n][0], nj = j + RAIL_LINKS[n][1];
      if (!isRail(ni, nj)) continue;
      any = true;
      railLink(cx, cy, cx + RAIL_LINKS[n][2] * W2 / 2, cy + RAIL_LINKS[n][3] * H2 / 2);
    }
    if (!any) railLink(cx - W2 * 0.5, cy - H2 * 0.5, cx + W2 * 0.5, cy + H2 * 0.5);
  }

  function railPass(cx, cy, i, j) {
    for (let n = 0; n < RAIL_LINKS.length; n++) {
      const ni = i + RAIL_LINKS[n][0], nj = j + RAIL_LINKS[n][1];
      if (!isRail(ni, nj)) continue;
      railLink(cx, cy, cx + RAIL_LINKS[n][2] * W2 / 2, cy + RAIL_LINKS[n][3] * H2 / 2);
    }
  }

  function drawStation(cx, cy, cell, i, j) {
    railPass(cx, cy, i, j);
    const w2 = W2 * 0.7, h2 = H2 * 0.7, wh = 16;
    shadow(cx, cy, w2 * 1.1, h2 * 1.2);
    prism(cx, cy, w2, h2, wh, '#eef3f8', '#ccd6e2', '#a9b6c6');
    faceWin(cx, cy, w2, h2, wh, 'L', 0.08, 0.92, 0.5, 0.88, 'rgba(120,190,235,.85)');
    faceWin(cx, cy, w2, h2, wh, 'R', 0.08, 0.92, 0.5, 0.88, 'rgba(100,170,220,.8)');
    prism(cx, cy - wh, w2 * 1.04, h2 * 1.04, 6, '#39a08a', '#2a7c6a', '#1f5f52');
    ctx.fillStyle = '#1b6e8c';
    ctx.fillRect(cx - 7, cy - wh - 25, 14, 9);
    ctx.fillStyle = '#dff3fb';
    ctx.fillRect(cx - 5, cy - wh - 23, 10, 2);
    ctx.fillRect(cx - 5, cy - wh - 20, 7, 2);
  }

  function drawHub(cx, cy, cell, i, j) {
    railPass(cx, cy, i, j);
    const w2 = W2 * 0.84, h2 = H2 * 0.84, wh = 24;
    shadow(cx, cy, w2 * 1.1, h2 * 1.25);
    prism(cx, cy, w2, h2, wh, '#dfe8f2', '#b9c7d8', '#93a5ba');
    for (let s = 0; s < 3; s++) {
      faceWin(cx, cy, w2, h2, wh, 'L', 0.08, 0.92, 0.12 + s * 0.26, 0.12 + s * 0.26 + 0.14, 'rgba(130,195,235,.8)');
      faceWin(cx, cy, w2, h2, wh, 'R', 0.08, 0.92, 0.12 + s * 0.26, 0.12 + s * 0.26 + 0.14, 'rgba(110,175,220,.8)');
    }
    prism(cx, cy - wh, w2 * 1.08, h2 * 1.08, 7, '#f0a04b', '#c47c30', '#9c5f22');
    prism(cx, cy - wh - 7, w2 * 0.55, h2 * 0.55, 12, '#7fd0e8', '#4fa5c4', '#377f9c');
    ctx.fillStyle = '#123c4c';
    ctx.fillRect(cx - 6, cy - wh - 26, 12, 8);
    ctx.fillStyle = '#a8e6fa';
    ctx.fillRect(cx - 4, cy - wh - 24, 8, 2);
  }

  function drawPort(cx, cy, cell, i, j) {
    const w2 = W2 * 0.8, h2 = H2 * 0.8;
    shadow(cx, cy, w2 * 1.05, h2 * 1.15);
    diamond(cx, cy, w2, h2);
    ctx.fillStyle = '#2a6c92';
    ctx.fill();
    prism(cx, cy, w2 * 0.86, h2 * 0.86, 7, '#c2a075', '#a3825a', '#836745');
    const cols = ['#d3614f', '#4a86c5', '#e0a94a', '#5aa06b'];
    for (let n = 0; n < 4; n++) {
      ctx.fillStyle = cols[n];
      ctx.fillRect(cx - 19 + (n % 2) * 20, cy - 15 - ((n / 2) | 0) * 9, 16, 8);
    }
    ctx.strokeStyle = '#e2b24a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx + 15, cy - 3);
    ctx.lineTo(cx + 15, cy - 36);
    ctx.lineTo(cx - 4, cy - 43);
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy - 43);
    ctx.lineTo(cx - 4, cy - 30);
    ctx.stroke();
    ctx.fillStyle = '#8d6a3f';
    ctx.fillRect(cx - 7, cy - 30, 6, 5);
  }

  function drawAirport(cx, cy) {
    const w2 = W2 * 0.96, h2 = H2 * 0.96;
    diamond(cx, cy, w2, h2);
    ctx.fillStyle = '#4b5a6b';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 7]);
    ctx.beginPath();
    ctx.moveTo(cx - w2 * 0.72, cy + h2 * 0.36);
    ctx.lineTo(cx + w2 * 0.72, cy - h2 * 0.36);
    ctx.stroke();
    ctx.setLineDash([]);
    shadow(cx - 4, cy - 2, 16, 9);
    prism(cx - 5, cy - 2, 15, 7.5, 11, '#dbe5f0', '#b8c6d6', '#94a5b8');
    faceWin(cx - 5, cy - 2, 15, 7.5, 11, 'R', 0.1, 0.9, 0.3, 0.7, 'rgba(150,200,235,.8)');
    ctx.fillStyle = '#d9e3ee';
    ctx.fillRect(cx + 14, cy - 34, 5, 32);
    ctx.fillStyle = '#8fb8da';
    ctx.fillRect(cx + 11.5, cy - 41, 10, 8);
    ctx.fillStyle = 'rgba(255,120,120,' + (0.5 + 0.5 * Math.sin(nowSec * 4)).toFixed(2) + ')';
    ctx.fillRect(cx + 15.5, cy - 43, 2, 2);
  }

  /* --- 市政 --- */
  function drawHospital(cx, cy) {
    const w2 = W2 * 0.78, h2 = H2 * 0.78, wh = 24;
    shadow(cx, cy, w2 * 1.05, h2 * 1.2);
    prism(cx, cy, w2, h2, wh, '#f7f9fc', '#d6dee8', '#b4bfcd');
    for (let s = 0; s < 3; s++) {
      faceWin(cx, cy, w2, h2, wh, 'L', 0.08, 0.92, 0.1 + s * 0.28, 0.1 + s * 0.28 + 0.14, 'rgba(140,180,215,.7)');
      faceWin(cx, cy, w2, h2, wh, 'R', 0.08, 0.92, 0.1 + s * 0.28, 0.1 + s * 0.28 + 0.14, 'rgba(120,165,205,.7)');
    }
    prism(cx, cy - wh, w2 * 0.42, h2 * 0.42, 6, '#e8eef6', '#c6d1de', '#a6b3c3');
    ctx.fillStyle = '#d1493f';
    ctx.fillRect(cx - 3, cy - wh - 22, 6, 16);
    ctx.fillRect(cx - 8, cy - wh - 17, 16, 6);
  }

  function drawSchool(cx, cy) {
    const w2 = W2 * 0.8, h2 = H2 * 0.8, wh = 17;
    shadow(cx, cy, w2 * 1.05, h2 * 1.2);
    prism(cx, cy, w2, h2, wh, '#f0e3c8', '#d2c2a2', '#b3a284');
    for (let s = 0; s < 3; s++) {
      faceWin(cx, cy, w2, h2, wh, 'L', 0.08 + s * 0.3, 0.08 + s * 0.3 + 0.2, 0.32, 0.68, 'rgba(120,170,210,.75)');
      faceWin(cx, cy, w2, h2, wh, 'R', 0.08 + s * 0.3, 0.08 + s * 0.3 + 0.2, 0.32, 0.68, 'rgba(105,155,200,.7)');
    }
    roof(cx, cy - wh, w2 * 1.08, h2 * 1.08, 9, '#b0483c', '#8d382f');
    ctx.strokeStyle = '#dfe7f2';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx + 14, cy - wh - 6);
    ctx.lineTo(cx + 14, cy - wh - 30);
    ctx.stroke();
    ctx.fillStyle = '#e0554a';
    ctx.fillRect(cx + 15, cy - wh - 30, 11, 7);
  }

  function drawFire(cx, cy) {
    const w2 = W2 * 0.76, h2 = H2 * 0.76, wh = 15;
    shadow(cx, cy, w2 * 1.05, h2 * 1.2);
    prism(cx, cy, w2, h2, wh, '#e2dcd6', '#c86456', '#9d4b40');
    faceWin(cx, cy, w2, h2, wh, 'R', 0.14, 0.86, 0.06, 0.62, '#7d2b25');
    faceWin(cx, cy, w2, h2, wh, 'L', 0.2, 0.8, 0.34, 0.72, 'rgba(180,215,240,.65)');
    prism(cx, cy - wh, w2 * 0.9, h2 * 0.9, 5, '#f1f4f8', '#cfd7e1', '#aeb8c5');
    ctx.fillStyle = '#ff6b5b';
    ctx.beginPath();
    ctx.arc(cx, cy - wh - 10, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPolice(cx, cy) {
    const w2 = W2 * 0.76, h2 = H2 * 0.76, wh = 16;
    shadow(cx, cy, w2 * 1.05, h2 * 1.2);
    prism(cx, cy, w2, h2, wh, '#e6ecf4', '#4d81b8', '#35608f');
    faceWin(cx, cy, w2, h2, wh, 'L', 0.05, 0.95, 0.42, 0.52, 'rgba(255,255,255,.75)');
    faceWin(cx, cy, w2, h2, wh, 'R', 0.05, 0.95, 0.42, 0.52, 'rgba(255,255,255,.6)');
    faceWin(cx, cy, w2, h2, wh, 'R', 0.3, 0.7, 0.06, 0.34, 'rgba(160,210,240,.8)');
    const p = 0.4 + 0.6 * Math.abs(Math.sin(nowSec * 2.4));
    ctx.fillStyle = 'rgba(90,180,255,' + p.toFixed(2) + ')';
    ctx.fillRect(cx - 4, cy - wh - 6, 8, 3);
  }

  /* --- 地标 --- */
  function drawTower(cx, cy) {
    shadow(cx, cy, 16, 9);
    prism(cx, cy, W2 * 0.28, H2 * 0.28, 48, '#dfe7f2', '#b6c2d2', '#93a1b5');
    for (let s = 0; s < 3; s++) {
      faceWin(cx, cy, W2 * 0.28, H2 * 0.28, 48, 'L', 0.1, 0.9, 0.15 + s * 0.26, 0.15 + s * 0.26 + 0.08, 'rgba(130,190,230,.7)');
    }
    prism(cx, cy - 48, W2 * 0.44, H2 * 0.44, 10, '#9ad8ee', '#5fb0cd', '#4287a3');
    ctx.strokeStyle = '#eaf1fa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 58);
    ctx.lineTo(cx, cy - 82);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,120,120,' + (0.4 + 0.6 * Math.sin(nowSec * 2)).toFixed(2) + ')';
    ctx.beginPath();
    ctx.arc(cx, cy - 84, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawStadium(cx, cy) {
    shadow(cx, cy, W2 * 0.92, H2 * 0.92);
    ctx.fillStyle = '#c2ccd8';
    ctx.beginPath();
    ctx.ellipse(cx, cy, W2 * 0.95, H2 * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9aa6b4';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 3, W2 * 0.8, H2 * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5aa05c';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 4, W2 * 0.55, H2 * 0.52, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - W2 * 0.4, cy - 4);
    ctx.lineTo(cx + W2 * 0.4, cy - 4);
    ctx.stroke();
    ctx.fillStyle = '#e2e8f0';
    for (let n = 0; n < 4; n++) {
      const a = Math.PI * (0.2 + n * 0.2);
      ctx.fillRect(cx + Math.cos(a) * W2 * 0.86 - 2, cy + Math.sin(a) * H2 * 0.86 - 14, 4, 14);
    }
  }

  function drawSkyscraper(cx, cy) {
    const w2 = W2 * 0.5, h2 = H2 * 0.5, wh = 62;
    shadow(cx, cy, w2 * 1.2, h2 * 1.3);
    prism(cx, cy, w2, h2, wh, '#5c86b8', '#3c5f8c', '#2b4568');
    for (let s = 0; s < 7; s++) {
      const v0 = 0.08 + s * 0.125, v1 = v0 + 0.075;
      const lit = (s + ((cx | 0) % 2)) % 3 === 0;
      faceWin(cx, cy, w2, h2, wh, 'L', 0.08, 0.92, v0, v1, lit ? 'rgba(255,226,150,.7)' : 'rgba(160,205,240,.55)');
      faceWin(cx, cy, w2, h2, wh, 'R', 0.08, 0.92, v0, v1, lit ? 'rgba(240,208,130,.6)' : 'rgba(140,185,225,.5)');
    }
    prism(cx, cy - wh, w2 * 0.5, h2 * 0.5, 8, '#7fa9d4', '#5a85ad', '#436a8d');
    ctx.strokeStyle = '#dbe6f2';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx, cy - wh - 8);
    ctx.lineTo(cx, cy - wh - 20);
    ctx.stroke();
  }

  function drawOffice(cx, cy) {
    const w2 = W2 * 0.66, h2 = H2 * 0.66, wh = 34;
    shadow(cx, cy, w2 * 1.08, h2 * 1.2);
    prism(cx, cy, w2, h2, wh, '#a9c9e2', '#6f9cc4', '#537c9f');
    for (let s = 0; s < 5; s++) {
      const v0 = 0.1 + s * 0.17, v1 = v0 + 0.1;
      faceWin(cx, cy, w2, h2, wh, 'L', 0.06, 0.94, v0, v1, 'rgba(175,220,250,.6)');
      faceWin(cx, cy, w2, h2, wh, 'R', 0.06, 0.94, v0, v1, 'rgba(155,200,235,.55)');
    }
    prism(cx, cy - wh, w2 * 0.55, h2 * 0.55, 6, '#cbd9e6', '#a4b5c6', '#8697a8');
  }

  function drawLogistics(cx, cy) {
    const w2 = W2 * 0.84, h2 = H2 * 0.84, wh = 11;
    shadow(cx, cy, w2 * 1.05, h2 * 1.15);
    prism(cx, cy, w2, h2, wh, '#c6ced8', '#9ea9b5', '#7f8b98');
    for (let s = 0; s < 4; s++) {
      faceWin(cx, cy, w2, h2, wh, 'L', 0.08 + s * 0.23, 0.08 + s * 0.23 + 0.16, 0.1, 0.9, 'rgba(255,255,255,.09)');
    }
    faceWin(cx, cy, w2, h2, wh, 'R', 0.2, 0.8, 0.05, 0.6, '#6e7a87');
    const cols = ['#d3614f', '#4a86c5', '#e0a94a'];
    for (let n = 0; n < 3; n++) {
      ctx.fillStyle = cols[n];
      ctx.fillRect(cx - 16 + n * 11, cy - 22 - (n % 2) * 8, 9, 7);
    }
  }

  const DRAWERS = {
    house: drawHouse,
    shop: drawShop,
    factory: drawFactory,
    power: drawPower,
    park: drawPark,
    tree: drawTree,
    rail: drawRail,
    station: drawStation,
    hub: drawHub,
    port: drawPort,
    airport: drawAirport,
    hospital: drawHospital,
    school: drawSchool,
    fire: drawFire,
    police: drawPolice,
    tower: drawTower,
    stadium: drawStadium,
    skyscraper: drawSkyscraper,
    office: drawOffice,
    logistics: drawLogistics,
  };

  const SIMPLE_COLOR = {
    road: '#4b5360', avenue: '#3d434f', ramp: '#4a5260', elevated: '#78828f',
    rail: '#5d5a51', house: '#e3d3b4', shop: '#e8deca', factory: '#8e97a2',
    power: '#5e6f88', park: '#6fb75e', tree: '#2f7d3c', station: '#8fc4dd', hub: '#e8a04c',
    port: '#b99a6d', airport: '#59687a', hospital: '#f1f5fa', school: '#e0c8a0',
    fire: '#c65b4c', police: '#4079b8', tower: '#cfd8e4', stadium: '#8fbf86',
    skyscraper: '#4a6fa5', office: '#5c86b8', logistics: '#b6bfc9',
  };

  function drawSimple(cx, cy, cell) {
    ctx.fillStyle = SIMPLE_COLOR[cell.type] || '#888';
    diamond(cx, cy, W2 * 0.58, H2 * 0.58);
    ctx.fill();
  }

  function drawBuilding(cx, cy, cell, i, j) {
    let scale = 1;
    if (cell.bt) {
      const age = nowSec - cell.bt;
      if (age >= 0 && age < 0.28) {
        const p = age / 0.28;
        scale = 0.55 + 0.45 * (1 - Math.pow(1 - p, 3));
      } else if (age >= 0.28) {
        cell.bt = 0;
      }
    }
    if (scale !== 1) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);
    }
    const fn = DRAWERS[cell.type];
    if (fn) fn(cx, cy, cell, i, j);
    if (scale !== 1) ctx.restore();
  }

  /* ================= 地面贴图 ================= */
  let groundTex = null;
  let groundDirty = true;

  function buildGroundTex() {
    const S = GROUND_SCALE;
    const c = document.createElement('canvas');
    c.width = Math.ceil(N * TW * S);
    c.height = Math.ceil(N * TH * S);
    const g = c.getContext('2d');
    g.setTransform(S, 0, 0, S, N * W2 * S, H2 * S);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = idx(i, j);
        const cx = (i - j) * W2, cy = (i + j) * H2;
        g.beginPath();
        g.moveTo(cx, cy - H2);
        g.lineTo(cx + W2, cy);
        g.lineTo(cx, cy + H2);
        g.lineTo(cx - W2, cy);
        g.closePath();
        g.fillStyle = state.terrain[k] === 1 ? '#2a6c92' : state.gcol[k];
        g.fill();
        g.strokeStyle = 'rgba(18,36,20,.10)';
        g.lineWidth = 2 / S;
        g.stroke();
      }
    }
    groundTex = { canvas: c, x: -N * W2, y: -H2, w: N * TW, h: N * TH };
    groundDirty = false;
  }

  function drawGroundTex() {
    if (groundDirty || !groundTex) buildGroundTex();
    ctx.drawImage(groundTex.canvas, groundTex.x, groundTex.y, groundTex.w, groundTex.h);
  }

  /* ================= 渲染 ================= */
  function drawHover(cx, cy, i, j) {
    const v = canPlace(i, j, state.tool);
    if (v.soft && !v.ok) return;
    const isDel = state.tool === 'del';
    diamond(cx, cy, W2, H2);
    ctx.fillStyle = v.ok
      ? (isDel ? 'rgba(255,160,80,.18)' : 'rgba(120,220,160,.18)')
      : 'rgba(255,110,110,.16)';
    ctx.fill();
    ctx.strokeStyle = v.ok
      ? (isDel ? 'rgba(255,190,120,.9)' : 'rgba(150,255,190,.85)')
      : 'rgba(255,140,140,.8)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    if (v.ok && !isDel) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      if (state.tool === 'elevated') {
        ctx.fillStyle = '#8b95a2';
        diamond(cx, cy - LIFT, W2 * 0.5, H2 * 0.5);
        ctx.fill();
        ctx.fillStyle = '#5d6672';
        ctx.fillRect(cx - 2.5, cy - LIFT, 5, LIFT);
      } else if (state.tool === 'ramp') {
        drawRamp(cx, cy, { type: 'ramp' }, i, j);
      } else if (state.tool === 'avenue' || state.tool === 'road') {
        drawRoad(cx, cy, { type: state.tool }, i, j);
      } else {
        const ghost = state.tool === 'house'
          ? { type: 'house', lvl: 1, pop: 0 }
          : { type: state.tool };
        drawBuilding(cx, cy, ghost, i, j);
      }
      ctx.restore();
    }
  }

  function drawTile(i, j, detailed) {
    const k = idx(i, j);
    const cx = (i - j) * W2;
    const cy = (i + j) * H2;

    if (detailed) {
      if (state.terrain[k] === 1) {
        diamond(cx, cy, W2, H2);
        ctx.fillStyle = '#2a6c92';
        ctx.fill();
        const ph = Math.sin(nowSec * 1.4 + i * 0.9 + j * 1.7);
        ctx.strokeStyle = 'rgba(160,225,255,' + (0.08 + 0.1 * (ph * 0.5 + 0.5)).toFixed(3) + ')';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx - 14, cy - 1 + ph * 1.5);
        ctx.lineTo(cx + 14, cy - 1 + ph * 1.5);
        ctx.stroke();
      } else {
        diamond(cx, cy, W2, H2);
        ctx.fillStyle = state.gcol[k];
        ctx.fill();
        ctx.strokeStyle = 'rgba(20,40,20,.10)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    const cell = state.cells[k];
    if (cell) {
      if (!detailed) drawSimple(cx, cy, cell);
      else if (SURFACE_ROADS.indexOf(cell.type) >= 0) drawRoad(cx, cy, cell, i, j);
      else drawBuilding(cx, cy, cell, i, j);
    }
    if (detailed && state.upper[k]) drawElevated(cx, cy, i, j);
    else if (!detailed && state.upper[k]) {
      ctx.fillStyle = SIMPLE_COLOR.elevated;
      diamond(cx, cy - LIFT, W2 * 0.5, H2 * 0.5);
      ctx.fill();
    }

    if (pointer.tx === i && pointer.ty === j) drawHover(cx, cy, i, j);
  }

  function visibleRange() {
    const halfW = view.cw / 2 / view.zoom, halfH = view.ch / 2 / view.zoom;
    const x0 = view.x - halfW - TW, x1 = view.x + halfW + TW;
    const y0 = view.y - halfH - TH * 2, y1 = view.y + halfH + TH * 10;
    const a = tileFloat(x0, y0), b = tileFloat(x1, y0);
    const c = tileFloat(x0, y1), d = tileFloat(x1, y1);
    let iMin = Math.floor(Math.min(a.i, b.i, c.i, d.i)) - 1;
    let iMax = Math.ceil(Math.max(a.i, b.i, c.i, d.i)) + 1;
    let jMin = Math.floor(Math.min(a.j, b.j, c.j, d.j)) - 1;
    let jMax = Math.ceil(Math.max(a.j, b.j, c.j, d.j)) + 1;
    iMin = clamp(iMin, 0, N - 1); iMax = clamp(iMax, 0, N - 1);
    jMin = clamp(jMin, 0, N - 1); jMax = clamp(jMax, 0, N - 1);
    return { iMin, iMax, jMin, jMax, s0: iMin + jMin, s1: iMax + jMax };
  }

  function draw(t) {
    nowSec = t;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.cw, view.ch);

    const bg = ctx.createLinearGradient(0, 0, 0, view.ch);
    bg.addColorStop(0, '#0b1424');
    bg.addColorStop(1, '#152a42');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, view.cw, view.ch);

    ctx.save();
    ctx.translate(view.cw / 2, view.ch / 2);
    ctx.scale(view.zoom, view.zoom);
    ctx.translate(-view.x, -view.y);

    const detailed = view.zoom >= LOD_NEAR;
    if (!detailed) drawGroundTex();

    const r = visibleRange();
    for (let s = r.s0; s <= r.s1; s++) {
      const a = Math.max(r.iMin, s - r.jMax);
      const b = Math.min(r.iMax, s - r.jMin);
      for (let i = a; i <= b; i++) drawTile(i, s - i, detailed);
    }
    ctx.restore();
  }

  /* ================= 交互 ================= */
  let drag = null;
  let lastHintKey = '';

  function paintAt(sx, sy) {
    const w = toWorld(sx, sy);
    const t = toTile(w.x, w.y);
    if (!inMap(t.i, t.j)) return;
    const k = idx(t.i, t.j);
    if (drag) {
      if (drag.lastK === k) return;
      drag.lastK = k;
    }
    place(t.i, t.j);
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 2 || e.button === 1) {
      drag = { mode: 'pan', x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true;
    if (e.pointerType === 'touch') {
      drag = { mode: 'touch', sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY };
      return;
    }
    drag = { mode: 'paint', lastK: -1 };
    paintAt(e.clientX, e.clientY);
  });

  canvas.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true;
    hintEl.style.left = (e.clientX + 18) + 'px';
    hintEl.style.top = (e.clientY + 16) + 'px';
    if (!drag) return;
    if (drag.mode === 'pan') {
      view.x -= (e.clientX - drag.x) / view.zoom;
      view.y -= (e.clientY - drag.y) / view.zoom;
      drag.x = e.clientX; drag.y = e.clientY;
    } else if (drag.mode === 'touch') {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 9) {
        drag = { mode: 'pan', x: e.clientX, y: e.clientY };
      }
    } else if (drag.mode === 'paint') {
      paintAt(e.clientX, e.clientY);
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    if (drag && drag.mode === 'touch') {
      paintAt(e.clientX, e.clientY);
    }
    drag = null;
  });

  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('pointerleave', () => { pointer.inside = false; });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const before = toWorld(e.clientX, e.clientY);
    view.zoom = clamp(view.zoom * Math.pow(1.0016, -e.deltaY), ZOOM_MIN, ZOOM_MAX);
    view.x = before.x - (e.clientX - view.cw / 2) / view.zoom;
    view.y = before.y - (e.clientY - view.ch / 2) / view.zoom;
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); togglePause(); return; }
    if (e.key === 'Escape') {
      helpEl.classList.remove('open');
      savesEl.classList.remove('open');
      return;
    }
    if (e.key === 'x' || e.key === 'X') { setCategory('basic'); selectTool('del'); return; }
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9) {
      const tools = CAT_TOOLS[state.cat];
      if (tools && tools[n - 1]) selectTool(tools[n - 1]);
    }
  });

  /* ================= UI ================= */
  function buildCats() {
    catsEl.innerHTML = '';
    CATS.forEach((cat) => {
      const btn = document.createElement('button');
      btn.className = 'tab';
      btn.dataset.cat = cat.id;
      btn.textContent = cat.name;
      btn.addEventListener('click', () => setCategory(cat.id));
      catsEl.appendChild(btn);
    });
  }

  function buildToolbar() {
    dockEl.innerHTML = '';
    const tools = CAT_TOOLS[state.cat] || [];
    tools.forEach((t, n) => {
      const d = BUILD[t];
      const btn = document.createElement('button');
      btn.className = 'tool';
      btn.dataset.tool = t;
      const key = t === 'del' ? 'X' : String(n + 1);
      btn.title = d.hint + '（快捷键 ' + key + '）';
      btn.innerHTML = '<span class="ico">' + d.icon + '</span>' +
        '<span class="nm">' + d.name + '</span>' +
        '<span class="cost">' + (d.cost ? '¥' + d.cost : '—') + '</span>';
      btn.addEventListener('click', () => selectTool(t));
      dockEl.appendChild(btn);
    });
  }

  function setCategory(cat, silent) {
    if (!CAT_TOOLS[cat]) return;
    state.cat = cat;
    const tabs = catsEl.querySelectorAll('.tab');
    for (let n = 0; n < tabs.length; n++) {
      tabs[n].classList.toggle('sel', tabs[n].dataset.cat === cat);
    }
    buildToolbar();
    const tools = CAT_TOOLS[cat];
    const keep = tools.indexOf(state.tool) >= 0 ? state.tool : tools[0];
    selectTool(keep, silent);
  }

  function selectTool(t, silent) {
    if (!BUILD[t]) return;
    if (BUILD[t].cat !== state.cat) {
      state.cat = BUILD[t].cat;
      const tabs = catsEl.querySelectorAll('.tab');
      for (let n = 0; n < tabs.length; n++) {
        tabs[n].classList.toggle('sel', tabs[n].dataset.cat === state.cat);
      }
      buildToolbar();
    }
    state.tool = t;
    const btns = dockEl.querySelectorAll('.tool');
    for (let n = 0; n < btns.length; n++) {
      btns[n].classList.toggle('sel', btns[n].dataset.tool === t);
    }
    const d = BUILD[t];
    toolInfoEl.textContent = d.name + (d.cost ? ' · ¥' + d.cost : '') + ' · ' + d.hint;
    if (!silent) lastHintKey = '';
  }

  function togglePause() {
    state.paused = !state.paused;
    $('btn-pause').textContent = state.paused ? '▶' : '⏸';
    updateHUD();
  }

  let toastTimer = 0;
  function toast(msg, ms, ok) {
    toastEl.textContent = msg;
    toastEl.classList.toggle('ok', !!ok);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms || 2200);
  }

  function updateHUD() {
    const money = Math.round(state.money);
    elMoney.textContent = '¥' + money.toLocaleString('zh-CN');
    elMoney.className = 'v' + (money <= 0 ? ' bad' : '');
    elIncome.textContent = '+' + state.income.toFixed(1) + '/秒';

    elPop.textContent = Math.round(state.pop).toLocaleString('zh-CN');

    const hp = Math.round(state.happiness);
    elHappy.textContent = hp;
    elHappy.className = 'v ' + (hp >= 65 ? 'good' : hp >= 45 ? 'warn' : 'bad');
    elHappyLabel.textContent = hp >= 80 ? '非常满意' : hp >= 65 ? '满意' : hp >= 45 ? '一般' : hp >= 25 ? '不满' : '愤怒';

    elPower.textContent = Math.round(state.powerDemand) + ' / ' + Math.round(state.powerSupply);
    elPower.className = 'v ' + (state.powerDemand > state.powerSupply ? 'bad' : 'good');
    elPowerLabel.textContent = state.powerDemand > state.powerSupply ? '供电不足' : '电力充裕';

    elDay.textContent = '第 ' + state.day + ' 天';
    elSpeed.textContent = state.paused ? '已暂停' : '进行中';

    const btns = dockEl.querySelectorAll('.tool');
    for (let n = 0; n < btns.length; n++) {
      const d = BUILD[btns[n].dataset.tool];
      btns[n].classList.toggle('poor', d.cost > 0 && state.money < d.cost);
    }
  }

  function updateHover() {
    if (!pointer.inside) {
      pointer.tx = pointer.ty = -1;
      hintEl.style.opacity = 0;
      lastHintKey = '';
      return;
    }
    const w = toWorld(pointer.x, pointer.y);
    const t = toTile(w.x, w.y);
    pointer.tx = t.i; pointer.ty = t.j;
    if (!inMap(t.i, t.j)) {
      hintEl.style.opacity = 0;
      lastHintKey = '';
      return;
    }
    const v = canPlace(t.i, t.j, state.tool);
    const key = state.tool + '|' + v.ok + '|' + v.why;
    if (key !== lastHintKey) {
      lastHintKey = key;
      hintEl.textContent = v.ok
        ? (state.tool === 'del' ? '拆除' : BUILD[state.tool].name + '  ¥' + BUILD[state.tool].cost)
        : v.why;
      hintEl.style.color = v.ok ? '#bfe3ff' : '#ff9c9c';
    }
    hintEl.style.opacity = 1;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    const cw = Math.floor(w * dpr), ch = Math.floor(h * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    view.dpr = dpr;
    view.cw = w;
    view.ch = h;
  }

  /* ================= 存档界面 ================= */
  async function renderSaves() {
    saveModeEl.textContent = store.api
      ? '本地文件存档：每个存档一个 JSON 文件（saves 目录）'
      : '浏览器存档：直接打开 index.html 时使用 localStorage；用 start-game.cmd 启动可写入本地文件';
    const list = await store.list();
    const bySlot = {};
    for (let n = 0; n < list.length; n++) bySlot[list[n].slot] = list[n];
    saveListEl.innerHTML = '';
    for (let s = 1; s <= SLOTS; s++) {
      const m = bySlot[s];
      const row = document.createElement('div');
      row.className = 'slot' + (s === state.slot ? ' cur' : '');
      const info = document.createElement('div');
      info.className = 'sinfo';
      info.innerHTML = '<div class="sno">存档 ' + s + (s === state.slot ? '（当前）' : '') + '</div>' +
        '<div class="smeta">' + (m ? (m.meta || metaOf(m).meta) : '空') + '</div>';
      row.appendChild(info);
      const acts = document.createElement('div');
      acts.className = 'sacts';
      acts.appendChild(makeBtn('保存', async () => {
        state.slot = s;
        const ok = await persist(s);
        if (ok) toast('已保存到存档 ' + s, 1800, true);
        renderSaves();
      }));
      acts.appendChild(makeBtn('读取', async () => {
        const d = await store.read(s);
        if (!d) { toast('存档 ' + s + ' 是空的'); return; }
        if (!applySave(d)) { toast('存档 ' + s + ' 无法读取'); return; }
        state.slot = s;
        toast('已读取存档 ' + s, 1800, true);
        updateHUD();
        renderSaves();
      }));
      acts.appendChild(makeBtn('删除', async () => {
        if (!m) return;
        if (!window.confirm('删除存档 ' + s + '？')) return;
        await store.remove(s);
        toast('已删除存档 ' + s, 1600, true);
        renderSaves();
      }));
      row.appendChild(acts);
      saveListEl.appendChild(row);
    }
  }

  function makeBtn(text, onClick) {
    const b = document.createElement('button');
    b.className = 'sbtn';
    b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
  }

  async function openSaves() {
    savesEl.classList.add('open');
    await renderSaves();
  }

  function exportSave() {
    const data = JSON.stringify(snapshot());
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'city-day' + state.day + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('已导出存档文件', 1800, true);
  }

  async function importSave(file) {
    let d;
    try {
      d = JSON.parse(await file.text());
    } catch (e) {
      toast('这不是有效的存档文件');
      return;
    }
    if (!applySave(d)) {
      toast('存档格式不支持');
      return;
    }
    await persist();
    updateHUD();
    toast('已导入存档', 1800, true);
    renderSaves();
  }

  /* ================= 主循环 ================= */
  let lastFrame = 0;
  let logicAcc = 0;
  let hudAcc = 0;
  let lastNudge = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    if (!lastFrame) lastFrame = now;
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;

    resize();
    if (!state.paused) {
      logicAcc += dt;
      let guard = 0;
      while (logicAcc >= LOGIC_DT && guard++ < 8) {
        logic(LOGIC_DT);
        logicAcc -= LOGIC_DT;
      }
      if (state.noRoadHouses > 0 && now / 1000 - lastNudge > 18) {
        lastNudge = now / 1000;
        toast('有 ' + state.noRoadHouses + ' 栋住宅没接通道路，铺一段路或建个车站吧', 2600);
      }
    }
    updateHover();
    draw(now / 1000);

    hudAcc += dt;
    if (hudAcc >= 0.15) {
      hudAcc = 0;
      updateHUD();
    }
  }

  /* ================= 启动 ================= */
  function readLegacy() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  async function boot() {
    resize();
    buildCats();
    setCategory('roads', true);
    selectTool('road', true);
    updateHUD();

    await store.init();

    const list = await store.list();
    list.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    let restored = false;
    for (let n = 0; n < list.length && !restored; n++) {
      const d = await store.read(list[n].slot);
      if (d && applySave(d)) {
        state.slot = list[n].slot;
        restored = true;
      }
    }
    if (!restored) {
      const legacy = readLegacy();
      if (legacy && applySave(legacy)) {
        restored = true;
        state.slot = 1;
        await persist(1);
        try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
      }
    }
    if (!restored) newGame();

    setCategory(state.cat, true);
    selectTool(state.tool || 'road', true);
    updateHUD();
    requestAnimationFrame(frame);

    if (!restored) {
      setTimeout(() => toast('提示：先铺几条道路，再在路边建住宅', 4200), 600);
    }
  }

  $('btn-pause').addEventListener('click', togglePause);
  $('btn-help').addEventListener('click', () => helpEl.classList.add('open'));
  $('help-close').addEventListener('click', () => helpEl.classList.remove('open'));
  helpEl.addEventListener('click', (e) => { if (e.target === helpEl) helpEl.classList.remove('open'); });

  $('btn-save').addEventListener('click', () => { openSaves(); });
  $('saves-close').addEventListener('click', () => savesEl.classList.remove('open'));
  savesEl.addEventListener('click', (e) => { if (e.target === savesEl) savesEl.classList.remove('open'); });
  $('btn-export').addEventListener('click', exportSave);
  $('btn-import').addEventListener('click', () => $('importfile').click());
  $('importfile').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) await importSave(f);
    e.target.value = '';
  });

  $('btn-new').addEventListener('click', async () => {
    if (!window.confirm('换一张新地图？当前城市会被清空（其他存档不受影响）。')) return;
    newGame();
    toast('新地图已生成，开始建造吧！', 2600);
  });

  setInterval(() => { persist(); }, 6000);
  window.addEventListener('beforeunload', () => { persist(); });

  // 调试 / 试玩接口
  window.CITY = {
    state: state,
    view: view,
    place: function (i, j, tool) {
      if (tool) selectTool(tool);
      return place(i, j);
    },
    newGame: newGame,
    save: persist,
    load: async function (slot) { const d = await store.read(slot); return d ? applySave(d) : false; },
    snapshot: snapshot,
    applySave: applySave,
    fitView: fitView,
    selectTool: selectTool,
    setCategory: setCategory,
  buildGroundTex: buildGroundTex,
    stats: function () {
      const counts = {};
      let total = 0, elevated = 0;
      for (let k = 0; k < N * N; k++) {
        const c = state.cells[k];
        if (!c) continue;
        counts[c.type] = (counts[c.type] || 0) + 1;
        total++;
      }
      for (let k = 0; k < N * N; k++) if (state.upper[k]) elevated++;
      return {
        money: Math.round(state.money),
        pop: state.pop,
        happiness: state.happiness,
        day: state.day,
        power: [state.powerDemand, state.powerSupply],
        total: total,
        elevated: elevated,
        counts: counts,
      };
    },
  };

  boot();
})();
