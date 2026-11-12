/* 원랜디 소리 모듈 — 나랜디(NRD)의 합성 효과음·배경음 엔진을 옮긴 것.
 * 음원 파일 없이 WebAudio로 직접 만든다(원작 음원 아님).
 * app.js보다 먼저 불러온다. app.js는 window.ORDA 가 있으면 아래 함수를 부른다.
 *   ORDA.sfx(종류, 크기)      화면 조작음·처치음 등
 *   ORDA.atk(공격자, 대상, 내유닛?)  평타(피해가 들어갈 때)
 *   ORDA.cast(대상지정?)      스킬 시전
 * 배경음은 이 파일이 window.ORD_DEBUG_W(게임 월드)를 0.5초마다 읽어 스스로 고른다.
 * 설정: localStorage 'ord.vol'(0~1, 기존 소리 설정) · 'ord.bgm'('0'이면 배경음 끔)
 */
(() => {
  'use strict';
  // 새 화면 문구 번역(앱의 se()가 못 찾으면 여기서 찾는다): [en, ja, zh-Hans, zh-Hant]
  window.ORD_I18N_X = Object.assign(window.ORD_I18N_X || {}, {
    '배경음': ['Music', 'BGM', '背景音乐', '背景音樂'],
    '일시정지': ['Pause', '一時停止', '暂停', '暫停'],
  });

  const ls = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
  const vol = () => { const v = +ls('ord.vol', '0.6'); return isFinite(v) ? v : 0.6; };
  const bgmOn = () => ls('ord.bgm', '1') !== '0';

  let ctx = null, master, sfxBus, bgmBus, comp, noise;
  const last = new Map();
  let voices = 0;

  function applyVol() {
    if (!ctx) return;
    const v = vol();
    master.gain.value = v <= 0 ? 0 : Math.min(1.4, 0.4 + v);   // 60%(기본)에서 나랜디와 같은 크기
    sfxBus.gain.value = 0.8 * 0.9;                              // 나랜디 기본값 sfx .8
    bgmBus.gain.value = bgmOn() ? 0.45 * 0.5 : 0;               // 나랜디 기본값 bgm .45
  }
  function ac() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = window.AudioContext ?? window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.connect(ctx.destination);
    master = ctx.createGain(); master.connect(comp);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    bgmBus = ctx.createGain(); bgmBus.connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    applyVol();
    return ctx;
  }
  ['pointerdown', 'touchend', 'keydown'].forEach(ev => window.addEventListener(ev, () => { ac(); }, { passive: true }));

  // ── 소리 재료 ──
  function env(g, t, atk, peak, dur) {
    g.gain.setValueAtTime(1e-4, t);
    g.gain.exponentialRampToValueAtTime(peak, t + atk);
    g.gain.exponentialRampToValueAtTime(1e-4, t + atk + dur);
  }
  function nz(t, dur, type, f0, f1, peak, q = 1, bus = sfxBus) {          // 걸러 낸 잡음(휙·쾅)
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain(); env(g, t, 0.004, peak, dur);
    s.connect(f).connect(g).connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  function osc(t, dur, type, f0, f1, peak, atk = 0.004, bus = sfxBus) {    // 음높이가 미끄러지는 음
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); env(g, t, atk, peak, dur);
    o.connect(g).connect(bus); o.start(t); o.stop(t + atk + dur + 0.05);
  }
  function fm(t, dur, f, ratio, depth, peak, bus = sfxBus) {              // 종·금속성 음
    const c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    c.frequency.value = f; m.frequency.value = f * ratio;
    mg.gain.setValueAtTime(f * depth, t); mg.gain.exponentialRampToValueAtTime(1, t + dur);
    m.connect(mg).connect(c.frequency); env(g, t, 0.003, peak, dur);
    c.connect(g).connect(bus); c.start(t); m.start(t); c.stop(t + dur + 0.05); m.stop(t + dur + 0.05);
  }
  const drum = (t, f, v, bus = sfxBus) => { osc(t, 0.35, 'sine', f * 2, f, 0.7 * v, 0.003, bus); nz(t, 0.08, 'lowpass', 1200, 200, 0.3 * v, 1, bus); };
  const gong = (t, v, bus = sfxBus) => { fm(t, 2.2, 196, 1.41, 3, 0.5 * v, bus); fm(t, 1.6, 293, 2.01, 2, 0.25 * v, bus); };

  // 같은 소리가 너무 촘촘히 겹치지 않게 하는 최소 간격(ms)
  const GAP = { slash: 45, pierce: 45, magic: 60, siege: 70, hit: 35, kill: 50, area: 90, bolt: 70, chain: 120, stun: 120, buff: 200, select: 60, move: 80, click: 30, open: 60 };

  function sfx(kind, v = 1) {
    if (vol() <= 0 || document.hidden) return;
    const c = ac(); if (!c || c.state !== 'running') return;
    const now = performance.now(), gap = GAP[kind] ?? 0;
    if ((gap && now - (last.get(kind) ?? 0) < gap) || voices > 28) return;
    last.set(kind, now); voices++; setTimeout(() => voices--, 400);
    const t = c.currentTime + 0.005, r = () => 0.9 + Math.random() * 0.2;
    switch (kind) {
      case 'slash': nz(t, 0.12, 'bandpass', 4200 * r(), 900, 0.35 * v, 2.5); nz(t + 0.02, 0.05, 'highpass', 6000, 3000, 0.15 * v); break;
      case 'pierce': osc(t, 0.09, 'triangle', 1900 * r(), 700, 0.18 * v); nz(t, 0.06, 'highpass', 5000, 2500, 0.12 * v); break;
      case 'magic': osc(t, 0.25, 'sine', 880 * r(), 1320, 0.12 * v, 0.01); osc(t + 0.03, 0.22, 'sine', 1320 * r(), 1760, 0.08 * v, 0.01); break;
      case 'siege': nz(t, 0.25, 'lowpass', 900, 120, 0.35 * v); osc(t, 0.2, 'sine', 140, 50, 0.3 * v); break;
      case 'hit': osc(t, 0.08, 'sine', 180 * r(), 70, 0.35 * v); nz(t, 0.05, 'bandpass', 1800, 600, 0.25 * v, 1.2); break;
      case 'kill': nz(t, 0.18, 'lowpass', 1400, 200, 0.2 * v); osc(t, 0.12, 'square', 220, 90, 0.05 * v); break;
      case 'area': nz(t, 0.45, 'lowpass', 2400, 150, 0.45 * v); osc(t, 0.35, 'sine', 110, 40, 0.45 * v); break;
      case 'big': nz(t, 1.1, 'lowpass', 3000, 60, 0.6 * v); osc(t, 0.9, 'sine', 80, 28, 0.6 * v); nz(t + 0.05, 0.4, 'bandpass', 900, 200, 0.3 * v, 0.8); break;
      case 'bolt': osc(t, 0.16, 'sawtooth', 1400 * r(), 300, 0.1 * v); nz(t, 0.12, 'highpass', 3500, 1500, 0.2 * v); break;
      case 'buff': [523, 659, 784, 1046].forEach((f, i) => osc(t + i * 0.05, 0.18, 'triangle', f, f, 0.08 * v, 0.01)); break;
      case 'click': osc(t, 0.04, 'square', 900, 700, 0.06 * v); break;
      case 'select': osc(t, 0.06, 'triangle', 700, 1000, 0.08 * v); break;
      case 'move': osc(t, 0.05, 'triangle', 500, 400, 0.07 * v); osc(t + 0.05, 0.05, 'triangle', 650, 600, 0.06 * v); break;
      case 'open': nz(t, 0.12, 'bandpass', 1500, 3000, 0.08 * v, 1.5); break;
      case 'coin': [988, 1319].forEach((f, i) => fm(t + i * 0.07, 0.25, f, 2, 1.5, 0.1 * v)); break;
      case 'fail': osc(t, 0.25, 'sawtooth', 220, 110, 0.07 * v); break;
      case 'boss': drum(t, 70, 0.9 * v); drum(t + 0.28, 70, 0.9 * v); drum(t + 0.56, 55, 1.1 * v); gong(t + 0.6, 0.35 * v); break;
      case 'stage': drum(t, 80, 0.8 * v); drum(t + 0.18, 80, 0.6 * v); gong(t + 0.3, 0.3 * v); break;
      case 'win': [523, 659, 784, 1046, 1318].forEach((f, i) => osc(t + i * 0.12, 0.6, 'triangle', f, f, 0.12 * v, 0.01)); gong(t, 0.3 * v); break;
      case 'lose': [392, 349, 311, 262].forEach((f, i) => osc(t + i * 0.22, 0.5, 'sine', f, f * 0.98, 0.12 * v, 0.02)); break;
    }
  }

  // ── 평타: 공격 종류에 맞는 소리 + 타격음(나랜디와 같은 조합) ──
  function atk(a, _target, mine) {
    if (!a || !a.def) return;
    const type = String(a.atkType ?? a.def.ua1t ?? '').toLowerCase();
    const ranged = (+a.range || 0) > 300 || String(a.def.ua1m ?? '').length > 4;
    const kind = /magic|spell/.test(type) ? 'magic' : /siege/.test(type) ? 'siege' : ranged ? 'pierce' : 'slash';
    const v = mine === false ? 0.45 : 0.8;
    sfx(kind, v); sfx('hit', v * 0.75);
  }
  const cast = targeted => sfx(targeted ? 'bolt' : 'area', 0.55);

  // ── 배경음: 편(스토리 단계)마다 음계·빠르기가 다른 곡을 그때그때 만든다 ──
  const THEMES = {
    east:    { root: 62, scale: [0, 2, 4, 7, 9],          bpm: 112, prog: [0, 3, 4, 0, 0, 3, 1, 4], drum: [1, 0, 0, 1, 0, 0, 1, 0], lead: 'flute', bassPat: [1, 0, 0, 0, 1, 0, 1, 0], swing: 0.12 },
    grand:   { root: 60, scale: [0, 2, 4, 5, 7, 9, 11],   bpm: 118, prog: [0, 3, 4, 0, 5, 3, 4, 4], drum: [1, 0, 1, 0, 1, 0, 1, 1], lead: 'brass', bassPat: [1, 0, 0, 1, 1, 0, 1, 0] },
    desert:  { root: 60, scale: [0, 1, 4, 5, 7, 8, 10],   bpm: 104, prog: [0, 1, 0, 6, 0, 1, 5, 4], drum: [1, 0, 1, 0, 1, 1, 0, 0], lead: 'flute', bassPat: [1, 0, 1, 0, 1, 0, 0, 1], swing: 0.12 },
    sky:     { root: 65, scale: [0, 2, 4, 6, 7, 9, 11],   bpm: 96,  prog: [0, 1, 4, 0, 0, 1, 5, 4], drum: [1, 0, 0, 0, 1, 0, 0, 0], lead: 'flute', bassPat: [1, 0, 0, 0, 1, 0, 0, 0] },
    water:   { root: 57, scale: [0, 2, 3, 5, 7, 9, 10],   bpm: 122, prog: [0, 3, 6, 0, 0, 3, 4, 4], drum: [1, 0, 1, 1, 0, 1, 1, 0], lead: 'brass', bassPat: [1, 0, 1, 0, 1, 0, 1, 1] },
    thrill:  { root: 55, scale: [0, 2, 3, 6, 7, 8, 11],   bpm: 100, prog: [0, 0, 3, 4, 0, 0, 5, 4], drum: [1, 0, 0, 1, 1, 0, 0, 1], lead: 'koto',  bassPat: [1, 1, 0, 0, 1, 0, 0, 0] },
    war:     { root: 52, scale: [0, 2, 3, 5, 7, 8, 10],   bpm: 132, prog: [0, 0, 5, 5, 3, 3, 4, 4], drum: [1, 1, 0, 1, 1, 0, 1, 1], lead: 'brass', bassPat: [1, 0, 1, 1, 1, 0, 1, 0] },
    newworld:{ root: 59, scale: [0, 2, 3, 5, 7, 9, 10],   bpm: 126, prog: [0, 3, 6, 4, 0, 3, 4, 0], drum: [1, 0, 1, 0, 1, 1, 1, 0], lead: 'brass', bassPat: [1, 0, 1, 0, 1, 0, 1, 0] },
  };
  const ORDER = ['east', 'grand', 'desert', 'sky', 'water', 'thrill', 'war', 'newworld'];
  let theme = '', timer = 0, nextT = 0, step = 0, heat = 0, boss = false, phrases = [];
  const hz = n => 440 * 2 ** ((n - 69) / 12);
  function rng(seed) { let s = seed | 0 || 1; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; }
  function compose(key) {                      // 곡마다 정해진 가락(같은 편이면 늘 같은 곡)
    const th = THEMES[key], rnd = rng([...key].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
    const line = start => {
      const out = []; let deg = start, used = 0;
      while (used < 16) {
        const len = [1, 1, 2, 2, 2, 3, 4][Math.floor(rnd() * 7)];
        deg = Math.max(0, Math.min(th.scale.length * 2 + 1, deg + [-2, -1, -1, 0, 1, 1, 2, 3][Math.floor(rnd() * 8)]));
        out.push({ deg, len: Math.min(len, 16 - used) }); used += len;
      }
      out[out.length - 1].deg = start; return out;
    };
    const a = line(th.scale.length), b = line(th.scale.length + 2);
    const a2 = a.map((n, i) => i >= a.length - 2 ? { ...n, deg: Math.max(0, n.deg - 1 - i % 2) } : n);
    phrases = [a, a2, b, a];
  }
  function pluck(t, f, v, dur = 0.5) { osc(t, dur, 'triangle', f, f * 0.995, v, 0.002, bgmBus); osc(t, dur * 0.4, 'square', f * 2, f * 2, v * 0.15, 0.002, bgmBus); }
  function lead(kind, t, f, dur) {
    if (kind === 'koto') { pluck(t, f, 0.12, Math.max(0.4, dur)); return; }
    const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = kind === 'brass' ? 'sawtooth' : 'sine'; o.frequency.value = f;
    lfo.frequency.value = 5.2; lg.gain.value = f * (kind === 'flute' ? 0.014 : 0.006);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = kind === 'brass' ? 1800 : 5000;
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(1e-4, t);
    g.gain.exponentialRampToValueAtTime(kind === 'brass' ? 0.06 : 0.12, t + 0.05);
    g.gain.setValueAtTime(kind === 'brass' ? 0.05 : 0.1, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    o.connect(lp).connect(g).connect(bgmBus);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    if (kind === 'flute') nz(t, 0.08, 'bandpass', 2500, 3500, 0.02, 2, bgmBus);
  }
  function tick() {
    const c = ctx;
    if (!c || c.state !== 'running' || vol() <= 0 || !bgmOn() || document.hidden) { if (c) nextT = c.currentTime + 0.1; return; }
    const th = THEMES[theme] ?? THEMES.east;
    const beat = 60 / (th.bpm * (1 + heat * 0.12 + (boss ? 0.06 : 0))) / 2;
    if (nextT < c.currentTime) nextT = c.currentTime + 0.05;
    const note = d => th.root + 12 + th.scale[d % th.scale.length] + 12 * Math.floor(d / th.scale.length);
    while (nextT < c.currentTime + 0.3) {
      const bar = Math.floor(step / 8) % 8, s8 = step % 8, t = nextT + (th.swing && s8 % 2 ? beat * th.swing : 0);
      const deg = th.prog[bar], bassN = th.root - 12 + th.scale[deg % th.scale.length];
      if (s8 === 0) [0, 2, 4].forEach(k => {                                   // 화음 패드
        const n = th.root + th.scale[(deg + k) % th.scale.length] + (deg + k >= th.scale.length ? 12 : 0);
        osc(t, beat * 7.5, 'triangle', hz(n), hz(n), 0.025, 0.25, bgmBus);
      });
      if (th.bassPat[s8]) osc(t, beat * 1.6, 'sine', hz(bassN), hz(bassN), 0.16 + heat * 0.05, 0.005, bgmBus);
      if (th.drum[s8] || (heat > 0.6 && s8 % 2 === 0) || (boss && s8 % 4 === 2)) drum(t, s8 === 0 ? 62 : 92, (s8 === 0 ? 0.55 : 0.3) * (0.75 + heat * 0.6 + (boss ? 0.2 : 0)), bgmBus);
      if (s8 === 4 || (heat > 0.4 && s8 === 6)) nz(t, 0.05, 'highpass', 7000, 5000, 0.05 + heat * 0.05, 1, bgmBus);
      const half = Math.floor((step % 64) / 32), ph = phrases[Math.floor(step / 32) % phrases.length];
      if (ph && (half === 0 || bar >= 4 || boss)) {                            // 가락
        let pos = 0; const at = (step % 32) / 2;
        for (const n of ph) {
          if (Math.abs(pos - at) < 1e-6 && step % 2 === 0) { lead(boss ? 'brass' : th.lead, t, hz(note(n.deg)), n.len * beat * 2 * 0.95); break; }
          pos += n.len; if (pos > at) break;
        }
      }
      if (half === 1 && bar < 4 && s8 % 2 === 1 && Math.random() < 0.5) pluck(t, hz(note(2 + Math.floor(Math.random() * 4))), 0.06);
      nextT += beat; step++;
    }
  }
  function setTheme(key) {
    key = key || '';
    if (key === theme) return;
    theme = key; clearInterval(timer); step = 0;
    if (key) { compose(key); timer = setInterval(tick, 60); }
  }

  // ── 게임 상태를 읽어 배경음·알림음을 맞춘다 ──
  let lastLv = -1, ended = false;
  setInterval(() => {
    applyVol();
    const W = window.ORD_DEBUG_W;
    if (!W || document.body.classList.contains('launch')) return;
    const lv = +(W.G?.udg_Level ?? 0) || 0;
    if (W.victory || W.defeated) {
      if (!ended) { ended = true; setTheme(''); sfx(W.victory ? 'win' : 'lose'); }
      return;
    }
    ended = false;
    setTheme(ORDER[Math.floor(Math.max(0, lv - 1) / 7) % ORDER.length]);       // 7라운드마다 다음 곡
    const foes = +(W.G?.udg_P_Counter?.[1] ?? 0) || 0;
    heat = Math.max(0, Math.min(1, foes / 70));                                 // 적이 쌓일수록 빨라지고 북이 늘어난다
    boss = lv > 0 && lv % 10 === 0;
    if (lv !== lastLv) { if (lastLv >= 0 && lv > lastLv) sfx(boss ? 'boss' : 'stage', 0.8); lastLv = lv; }
  }, 500);

  window.ORDA = { sfx, atk, cast, setTheme, bgmOn, sync: applyVol, themes: THEMES };
})();
