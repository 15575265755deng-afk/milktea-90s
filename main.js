(function () {
  'use strict';

  // ---------- constants ----------
  var LW = 390, LH = 844;          // logical design size
  var MAX_LIVES = 3;
  var BOIL_TIME = 2.8, POT_SERVINGS = 5;
  var CHOP_TIME = 1.1, LEMON_SERVINGS = 4;
  var TUTORIAL_SEC = 45, TUTORIAL_ORDERS = 5;
  var DIFF_RAMP = 210;
  var FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Noto Sans SC",sans-serif';
  var C = {
    wood: '#7a5134', woodDark: '#4a3020', woodLight: '#a8774f',
    cream: '#f8efdc', creamDeep: '#efe1c3', paper: '#fbf5e8',
    sage: '#8fa676', sageDark: '#6f8a5a', sageLight: '#c9d6b5',
    caramel: '#c98a4b', coral: '#d9685a', coralDark: '#b9503f',
    ink: '#4a3324', inkSoft: '#7a5a42', gold: '#e3b04b'
  };
  var SIZES = ['大杯', '中杯'];
  var TEAS = ['红茶', '绿茶', '奶茶', '柠檬水'];
  var TOPS = ['珍珠', '椰果', '布丁'];
  var TEA_COLOR = { '红茶': '#a5492c', '绿茶': '#a9b56a', '奶茶': '#d6ae82', '柠檬水': '#e8d56a' };
  var KINDS = ['fox', 'raccoon', 'deer', 'rabbit', 'bear'];
  // visible fraction above the counter, draw width
  var KIND_META = {
    fox: { vis: 0.78, w: 132 }, raccoon: { vis: 0.80, w: 140 }, deer: { vis: 0.74, w: 128 },
    rabbit: { vis: 0.70, w: 120 }, bear: { vis: 0.82, w: 140 }
  };
  var SLOT_X = [72, 195, 318];
  var COUNTER_Y = 420;
  var debug = /debug/.test(String(location.search || ''));

  // ---------- canvas ----------
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var dpr = 1, scale = 1, offX = 0, offY = 0, vw = 0, vh = 0, cTop = 0, cLeft = 0;
  function resize() {
    var r = canvas.getBoundingClientRect();
    cTop = r.top || 0; cLeft = r.left || 0;
    vw = r.width || window.innerWidth; vh = r.height || window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    scale = Math.min(vw / LW, vh / LH);
    offX = (vw - LW * scale) / 2; offY = (vh - LH * scale) / 2;
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 200); });
  resize();
  setTimeout(resize, 300);

  // ---------- images ----------
  var IMG = {}, loaded = 0, toLoad = ['bg'].concat(KINDS);
  toLoad.forEach(function (n) {
    var im = new Image();
    im.onload = function () { loaded++; };
    im.onerror = function () { loaded++; };
    im.src = (window.MT_IMAGES && window.MT_IMAGES[n]) || ('./images/' + n + '.webp');
    IMG[n] = im;
  });
  function imgReady(n) { return IMG[n] && IMG[n].complete && IMG[n].naturalWidth > 0; }

  // ---------- xhs bridge (feature detected) ----------
  function mini() { return window.xhs && window.xhs.miniTool; }
  function readBuildVersion(o) { var e = o && o.miniToolEnv; return Number(e && e.buildVersion) || 0; }
  var buildVersionCache = null;
  function getBuildVersion() {
    if (buildVersionCache !== null) return Promise.resolve(buildVersionCache);
    var x = window.xhs;
    var v = readBuildVersion(x && x.launchOptions);
    if (v) { buildVersionCache = v; return Promise.resolve(v); }
    var m = mini();
    if (!m || typeof m.getLaunchOptions !== 'function') { buildVersionCache = 0; return Promise.resolve(0); }
    return Promise.resolve().then(function () { return m.getLaunchOptions(); })
      .then(function (lo) { buildVersionCache = readBuildVersion(lo); return buildVersionCache; })
      .catch(function () { buildVersionCache = 0; return 0; });
  }
  function atLeast(bv, min) { return Math.floor(bv / 1000) >= min; }

  function setLocalData(key, data) {
    var s;
    try { s = JSON.stringify(data); } catch (e) { return Promise.resolve(false); }
    return getBuildVersion().then(function (bv) {
      var m = mini();
      if (atLeast(bv, 9460) && m && typeof m.setStorage === 'function') {
        return Promise.resolve().then(function () { return m.setStorage({ key: key, data: s }); })
          .then(function () { return true; }).catch(function () { return false; });
      }
      try { window.localStorage.setItem(key, s); return true; } catch (e) { return false; }
    });
  }
  function getLocalData(key) {
    return getBuildVersion().then(function (bv) {
      var m = mini();
      if (atLeast(bv, 9460) && m && typeof m.getStorage === 'function') {
        return Promise.resolve().then(function () { return m.getStorage({ key: key }); })
          .then(function (r) { return r && r.data ? JSON.parse(r.data) : null; }).catch(function () { return null; });
      }
      try { var s = window.localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; }
    });
  }
  function vibrate() {
    getBuildVersion().then(function (bv) {
      var m = mini();
      if (atLeast(bv, 9500) && m && typeof m.vibrateShort === 'function') {
        Promise.resolve().then(function () { return m.vibrateShort({ type: 'medium' }); }).catch(function () {});
      } else if (!m && navigator.vibrate) {
        try { navigator.vibrate(30); } catch (e) {}
      }
    });
  }

  // ---------- audio (WebAudio synth, no files) ----------
  var actx = null, muted = false;
  function audio() {
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { actx = new AC(); } catch (e) { return null; }
    }
    if (actx.state === 'suspended' && actx.resume) actx.resume();
    return actx;
  }
  function tone(freq, dur, type, vol, delay, slideTo) {
    if (muted) return;
    var a = audio(); if (!a) return;
    var t0 = a.currentTime + (delay || 0);
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  var sfx = {
    tap: function () { tone(660, 0.07, 'triangle', 0.12); },
    pour: function () { tone(320, 0.22, 'sine', 0.08, 0, 520); },
    drop: function () { tone(880, 0.06, 'sine', 0.1); tone(1180, 0.05, 'sine', 0.06, 0.05); },
    serve: function () { tone(784, 0.1, 'triangle', 0.14); tone(1046, 0.16, 'triangle', 0.14, 0.08); },
    coin: function () { tone(1318, 0.07, 'square', 0.05, 0.12); tone(1760, 0.1, 'square', 0.05, 0.18); },
    wrong: function () { tone(180, 0.22, 'sawtooth', 0.08, 0, 120); },
    angry: function () { tone(260, 0.18, 'square', 0.06, 0, 180); },
    trash: function () { tone(400, 0.15, 'sine', 0.08, 0, 160); },
    end: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.12, i * 0.12); }); },
    warn: function () { tone(988, 0.25, 'sine', 0.13); tone(1319, 0.35, 'sine', 0.11, 0.14); },
    boil: function () { tone(280, 0.12, 'sine', 0.08); tone(360, 0.2, 'sine', 0.06, 0.08); },
    boilDone: function () { tone(784, 0.1, 'sine', 0.12); tone(1175, 0.16, 'sine', 0.12, 0.1); },
    chop: function () { tone(900, 0.05, 'square', 0.07); tone(700, 0.05, 'square', 0.05, 0.07); tone(850, 0.06, 'square', 0.06, 0.14); },
    chopDone: function () { tone(1046, 0.12, 'triangle', 0.12); },
    start: function () { tone(523, 0.1, 'triangle', 0.12); tone(784, 0.16, 'triangle', 0.12, 0.1); }
  };

  // ---------- helpers ----------
  function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function easeOutBack(t) { var c = 1.7; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; }
  function font(sz, bold) { return (bold ? 'bold ' : '') + sz + 'px ' + FONT; }
  function text(s, x, y, sz, color, align, bold) {
    ctx.font = font(sz, bold !== false); ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y);
  }
  function fitText(s, x, y, maxW, sz, color, bold) {
    var size = sz; ctx.font = font(size, bold);
    while (size > 9 && ctx.measureText(s).width > maxW) { size -= 0.5; ctx.font = font(size, bold); }
    text(s, x, y, size, color, 'center', bold);
  }
  function shadowOn(b, oy) { ctx.shadowColor = 'rgba(60,35,15,0.28)'; ctx.shadowBlur = b; ctx.shadowOffsetY = oy || 0; }
  function shadowOff() { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }

  // ---------- background ----------
  function drawBg(c) {
    var g = c || ctx;
    if (imgReady('bg')) {
      var im = IMG.bg, k = LH / im.naturalHeight, w = im.naturalWidth * k;
      g.drawImage(im, (LW - w) / 2, 0, w, LH);
    } else { g.fillStyle = '#d9c3a0'; g.fillRect(0, 0, LW, LH); }
  }
  function drawCounterFront() { // re-draw counter part of bg over customers
    if (!imgReady('bg')) { ctx.fillStyle = C.wood; ctx.fillRect(0, COUNTER_Y, LW, LH - COUNTER_Y); return; }
    var im = IMG.bg, k = LH / im.naturalHeight, w = im.naturalWidth * k;
    var sy = COUNTER_Y / k;
    ctx.drawImage(im, 0, sy, im.naturalWidth, im.naturalHeight - sy, (LW - w) / 2, COUNTER_Y, w, LH - COUNTER_Y);
  }

  // ---------- icon drawing ----------
  function drawIcon(type, x, y, s) {
    ctx.save(); ctx.translate(x, y);
    var k = s / 24;
    ctx.scale(k, k);
    if (type === '大杯' || type === '中杯') {
      var h = type === '大杯' ? 22 : 16, top = 12 - h;
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.strokeStyle = '#8b6a4f'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-7, top); ctx.lineTo(7, top); ctx.lineTo(5, 12); ctx.lineTo(-5, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#d6ae82'; ctx.beginPath(); ctx.moveTo(-6.3, top + 4); ctx.lineTo(6.3, top + 4); ctx.lineTo(4.8, 11); ctx.lineTo(-4.8, 11); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c98a4b'; ctx.fillRect(-8, top - 2, 16, 2.5);
    } else if (type === '柠檬水') {
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.strokeStyle = '#8b6a4f'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-7, -7); ctx.lineTo(7, -7); ctx.lineTo(5.5, 10); ctx.lineTo(-5.5, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e8d56a'; ctx.beginPath(); ctx.moveTo(-6, -3); ctx.lineTo(6, -3); ctx.lineTo(5, 9); ctx.lineTo(-5, 9); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f3e27a'; ctx.beginPath(); ctx.arc(7, -6, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#d2b84a'; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = 'rgba(180,140,40,0.5)'; ctx.beginPath(); ctx.moveTo(5, -6); ctx.lineTo(9, -6); ctx.moveTo(7, -8); ctx.lineTo(7, -4); ctx.stroke();
    } else if (type === '柠檬') {
      ctx.fillStyle = '#f3e27a'; ctx.beginPath(); ctx.ellipse ? ctx.ellipse(0, 1, 10, 8, -0.4, 0, Math.PI * 2) : ctx.arc(0, 1, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#c9b04a'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = '#6f8a5a'; ctx.beginPath(); ctx.ellipse ? ctx.ellipse(-2, -8, 3, 5, -0.5, 0, Math.PI * 2) : ctx.arc(-2, -8, 3, 0, Math.PI * 2); ctx.fill();
    } else if (type === 'life' || type === 'lifeOff') {
      var full = type === 'life';
      ctx.fillStyle = full ? '#fffaf0' : 'rgba(255,250,240,0.35)';
      ctx.strokeStyle = full ? '#8b6a4f' : 'rgba(139,106,79,0.55)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(8, -4); ctx.quadraticCurveTo(9, 8, 0, 10); ctx.quadraticCurveTo(-9, 8, -8, -4); ctx.closePath();
      ctx.fill(); ctx.stroke();
      if (full) {
        ctx.fillStyle = '#d9685a';
        ctx.beginPath(); ctx.moveTo(-6.5, -1); ctx.lineTo(6.5, -1); ctx.quadraticCurveTo(7, 6, 0, 7.5); ctx.quadraticCurveTo(-7, 6, -6.5, -1); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(-5, 1, 2, 4);
      }
      ctx.fillStyle = full ? '#fffaf0' : 'rgba(255,250,240,0.4)';
      ctx.fillRect(-11, -7, 22, 3.2);
    } else if (TEA_COLOR[type]) {
      ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = '#8b6a4f'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(9, 0, 4.5, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-10, -6); ctx.lineTo(10, -6); ctx.quadraticCurveTo(10, 10, 0, 10); ctx.quadraticCurveTo(-10, 10, -10, -6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = TEA_COLOR[type]; ctx.beginPath(); ctx.ellipse ? ctx.ellipse(0, -5, 8.5, 2.6, 0, 0, Math.PI * 2) : ctx.arc(0, -5, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(140,110,80,0.35)'; ctx.fillRect(-11, 11, 22, 2);
    } else if (type === '珍珠') {
      var pts = [[-7, 4], [0, 5], [7, 4], [-4, -2], [4, -2], [0, -8], [-8, -4], [8, -4]];
      pts.forEach(function (p) {
        ctx.fillStyle = '#2b1d16'; ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(p[0] - 1.3, p[1] - 1.3, 1.1, 0, Math.PI * 2); ctx.fill();
      });
    } else if (type === '椰果') {
      [[-6, 3], [5, 4], [0, -5], [-8, -5], [8, -4]].forEach(function (p, i) {
        ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(i * 0.4);
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#c8cfd4'; ctx.lineWidth = 1;
        ctx.fillRect(-4, -4, 8, 8); ctx.strokeRect(-4, -4, 8, 8);
        ctx.fillStyle = 'rgba(200,215,225,0.6)'; ctx.fillRect(-4, 1, 8, 3);
        ctx.restore();
      });
    } else if (type === '布丁') {
      ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = '#c9b49a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse ? ctx.ellipse(0, 8, 12, 3.5, 0, 0, Math.PI * 2) : ctx.arc(0, 8, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f0c35a'; ctx.beginPath(); ctx.moveTo(-8, 7); ctx.lineTo(-6, -4); ctx.lineTo(6, -4); ctx.lineTo(8, 7); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8a4a1f'; ctx.beginPath(); ctx.moveTo(-6.4, -1); ctx.lineTo(-6, -5); ctx.quadraticCurveTo(0, -8, 6, -5); ctx.lineTo(6.4, -1); ctx.quadraticCurveTo(0, 1, -6.4, -1); ctx.fill();
    } else if (type === 'trash') {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-9, -7); ctx.lineTo(9, -7); ctx.moveTo(-3, -10); ctx.lineTo(3, -10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-7, -4); ctx.lineTo(-5.5, 10); ctx.lineTo(5.5, 10); ctx.lineTo(7, -4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-2, -1); ctx.lineTo(-2, 7); ctx.moveTo(2, -1); ctx.lineTo(2, 7); ctx.stroke();
    } else if (type === 'clock') {
      ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = C.ink; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -6); ctx.moveTo(0, 0); ctx.lineTo(4.5, 2.5); ctx.stroke();
    } else if (type === 'coin') {
      ctx.fillStyle = '#e3b04b'; ctx.strokeStyle = '#a8742a'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f6d58a'; ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a8742a'; ctx.fillRect(-1.2, -4, 2.4, 8);
    } else if (type === 'sound' || type === 'mute') {
      ctx.fillStyle = C.ink; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-9, -3); ctx.lineTo(-5, -3); ctx.lineTo(0, -8); ctx.lineTo(0, 8); ctx.lineTo(-5, 3); ctx.lineTo(-9, 3); ctx.closePath(); ctx.fill();
      if (type === 'sound') { ctx.beginPath(); ctx.arc(1, 0, 5, -0.9, 0.9); ctx.stroke(); ctx.beginPath(); ctx.arc(1, 0, 9, -0.9, 0.9); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(4, -4); ctx.lineTo(10, 4); ctx.moveTo(10, -4); ctx.lineTo(4, 4); ctx.stroke(); }
    }
    ctx.restore();
  }

  // ---------- cup ----------
  function newCup() { return { size: null, tea: null, tops: [], fill: 0, topT: {}, shake: 0, sizeT: 0 }; }
  function cupDims(size) { return size === '大杯' ? { w: 78, h: 128 } : { w: 70, h: 104 }; }
  function drawCup(cup, cx, by, sc, alpha, withLid) {
    ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.translate(cx, by); ctx.scale(sc || 1, sc || 1);
    if (cup.shake > 0) ctx.translate(Math.sin(cup.shake * 60) * 4 * cup.shake / 0.4, 0);
    if (!cup.size) { // empty placeholder
      ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(255,248,235,0.75)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-36, -110); ctx.lineTo(36, -110); ctx.lineTo(28, 0); ctx.lineTo(-28, 0); ctx.closePath(); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(74,51,36,0.55)'; rr(-46, -66, 92, 24, 12); ctx.fill();
      text('先选杯型', 0, -54, 13, '#fff8ec');
      ctx.restore(); return;
    }
    var pop = cup.sizeT > 0 ? 1 + Math.sin(cup.sizeT / 0.25 * Math.PI) * 0.08 : 1;
    ctx.scale(pop, pop);
    var d = cupDims(cup.size), tw = d.w, bw = d.w * 0.78, h = d.h;
    function path(inset) {
      ctx.beginPath();
      ctx.moveTo(-tw / 2 + inset, -h + inset); ctx.lineTo(tw / 2 - inset, -h + inset);
      ctx.lineTo(bw / 2 - inset, -inset); ctx.lineTo(-bw / 2 + inset, -inset); ctx.closePath();
    }
    // shadow
    ctx.fillStyle = 'rgba(50,30,15,0.25)'; ctx.beginPath(); ctx.ellipse ? ctx.ellipse(0, 2, bw / 2 + 6, 5, 0, 0, Math.PI * 2) : ctx.arc(0, 2, bw / 2, 0, Math.PI * 2); ctx.fill();
    // cup back
    path(0); ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fill();
    ctx.save(); path(2); ctx.clip();
    // tea
    if (cup.tea) {
      var lvl = h * 0.86 * cup.fill;
      ctx.fillStyle = TEA_COLOR[cup.tea];
      ctx.fillRect(-tw / 2, -lvl, tw, lvl);
      if (cup.tea === '奶茶') { // caramel marbling
        ctx.strokeStyle = 'rgba(160,95,40,0.45)'; ctx.lineWidth = 3;
        for (var i = 0; i < 4; i++) {
          var yy = -lvl + 10 + i * (lvl / 4);
          ctx.beginPath(); ctx.moveTo(-tw / 2, yy); ctx.bezierCurveTo(-10, yy - 12, 8, yy + 14, tw / 2, yy - 4); ctx.stroke();
        }
      }
      if (cup.tea === '柠檬水' && cup.fill > 0.4) {
        for (var li = 0; li < 2; li++) {
          var lx = -12 + li * 22, ly = -lvl + 10;
          ctx.fillStyle = '#f3e27a'; ctx.beginPath(); ctx.arc(lx, ly, 7, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#c9b04a'; ctx.lineWidth = 1; ctx.stroke();
          ctx.strokeStyle = 'rgba(180,140,40,0.55)'; ctx.beginPath(); ctx.moveTo(lx - 4, ly); ctx.lineTo(lx + 4, ly); ctx.moveTo(lx, ly - 4); ctx.lineTo(lx, ly + 4); ctx.stroke();
        }
      }
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-tw / 2, -lvl, tw, 4);
    }
    // toppings
    var layer = 0;
    cup.tops.forEach(function (t) {
      var at = clamp((cup.topT[t] || 0) / 0.3, 0, 1);
      var drop = (1 - at) * 50;
      var base = -4 - layer * 18;
      ctx.globalAlpha = (alpha == null ? 1 : alpha) * (0.3 + 0.7 * at);
      if (t === '珍珠') {
        for (var r = 0; r < 2; r++) for (var j = 0; j < 6; j++) {
          var px = -bw / 2 + 7 + j * ((bw - 14) / 5) + (r % 2) * 4, py = base - 4 - r * 8 - drop;
          ctx.fillStyle = '#2b1d16'; ctx.beginPath(); ctx.arc(px, py, 4.6, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(px - 1.5, py - 1.5, 1.3, 0, Math.PI * 2); ctx.fill();
        }
      } else if (t === '椰果') {
        for (var r2 = 0; r2 < 2; r2++) for (var j2 = 0; j2 < 5; j2++) {
          var qx = -bw / 2 + 6 + j2 * ((bw - 14) / 4) + (r2 % 2) * 5, qy = base - 6 - r2 * 8 - drop;
          ctx.save(); ctx.translate(qx, qy); ctx.rotate((j2 + r2) * 0.5);
          ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillRect(-4, -4, 8, 8);
          ctx.strokeStyle = 'rgba(180,195,205,0.9)'; ctx.lineWidth = 1; ctx.strokeRect(-4, -4, 8, 8);
          ctx.restore();
        }
      } else if (t === '布丁') {
        ctx.fillStyle = '#f0c35a'; rr(-bw / 2 + 2, base - 16 - drop, bw - 4, 16, 4); ctx.fill();
        ctx.fillStyle = '#9a5424'; rr(-bw / 2 + 2, base - 16 - drop, bw - 4, 5, 3); ctx.fill();
      }
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      layer++;
    });
    ctx.restore();
    // glass front
    path(0); ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.32)'; ctx.fillRect(-tw / 2 + 7, -h + 8, 5, h - 20);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; rr(-tw / 2 - 3, -h - 4, tw + 6, 6, 3); ctx.fill();
    if (withLid) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.ellipse ? ctx.ellipse(0, -h - 4, tw / 2 + 2, 6, 0, Math.PI, 0) : ctx.arc(0, -h - 4, tw / 2, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = '#8b6a4f'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(6, -h - 30); ctx.lineTo(-2, -h * 0.4); ctx.stroke();
    }
    ctx.restore();
  }
  function cupLabel(cup) {
    var p = [];
    if (cup.size) p.push(cup.size);
    if (cup.tea) p.push(cup.tea);
    if (cup.tops.length) p.push(cup.tops.join('+'));
    return p.join(' · ');
  }

  // ---------- state ----------
  function freshPot() { return { state: 'idle', t: 0, servings: 0, pending: 0 }; }
  function freshBoard() { return { state: 'idle', t: 0, servings: 0, pending: 0 }; }
  var S = {
    screen: 'loading', // loading | start | play | result
    t: 0, elapsed: 0, score: 0, served: 0, combo: 0, maxCombo: 0, tips: 0, mistakes: 0, lost: 0,
    lives: MAX_LIVES, lifeFlash: 0, ending: 0,
    customers: [null, null, null], cup: newCup(), nextSpawn: 0, uid: 0,
    pot: freshPot(), board: freshBoard(),
    floats: [], parts: [], flying: [], best: 0, newBest: false, paused: false, hint: null, coinPop: 0, comboPop: 0,
    btnPress: {}, resultT: 0
  };
  getLocalData('milktea_best').then(function (v) { if (v && typeof v.best === 'number') S.best = v.best; });
  getLocalData('milktea_muted').then(function (v) { if (v && v.muted) muted = true; });

  function difficulty() { return clamp(S.elapsed / DIFF_RAMP, 0, 1); }
  function inTutorial() { return S.elapsed < TUTORIAL_SEC || S.uid < TUTORIAL_ORDERS; }
  function makeOrder() {
    var d = difficulty(), size = pick(SIZES), tea, tops = [];
    if (inTutorial()) {
      tea = pick(['红茶', '绿茶', '奶茶']);
      tops = [pick(['椰果', '布丁'])];
    } else {
      tea = Math.random() < lerp(0.10, 0.32, d) ? '柠檬水' : pick(['红茶', '绿茶', '奶茶']);
      var pearlP = lerp(0.18, 0.45, d), twoP = lerp(0.08, 0.35, d);
      if (tea === '柠檬水' && Math.random() < 0.3) {
        tops = [];
      } else {
        if (Math.random() < pearlP) tops.push('珍珠');
        else tops.push(pick(['椰果', '布丁']));
        if (Math.random() < twoP) {
          var rest = TOPS.filter(function (t) { return tops.indexOf(t) < 0; });
          tops.push(pick(rest));
        }
      }
      tops.sort(function (a, b) { return TOPS.indexOf(a) - TOPS.indexOf(b); });
    }
    return { size: size, tea: tea, tops: tops };
  }
  function spawn() {
    var free = []; for (var i = 0; i < 3; i++) if (!S.customers[i]) free.push(i);
    if (!free.length) return false;
    var used = S.customers.filter(Boolean).map(function (c) { return c.kind; });
    var kinds = KINDS.filter(function (k) { return used.indexOf(k) < 0; });
    var slot = pick(free), order = makeOrder(), d = difficulty();
    var pat = lerp(28, 16, d);
    if (order.tea === '柠檬水') pat += 3;
    if (order.tops.indexOf('珍珠') >= 0) pat += 2.5;
    if (order.tops.length >= 2) pat += 2;
    S.customers[slot] = { id: ++S.uid, slot: slot, kind: pick(kinds), order: order, patience: pat, max: pat, state: 'enter', t: 0, warned: false };
    return true;
  }

  function resetGame() {
    S.t = 0; S.elapsed = 0; S.score = 0; S.served = 0; S.combo = 0; S.maxCombo = 0; S.tips = 0; S.mistakes = 0; S.lost = 0;
    S.lives = MAX_LIVES; S.lifeFlash = 0; S.ending = 0;
    S.customers = [null, null, null]; S.cup = newCup(); S.nextSpawn = 0.4; S.floats = []; S.parts = []; S.flying = [];
    S.pot = freshPot(); S.board = freshBoard();
    S.newBest = false; S.hint = null; S.resultT = 0;
  }

  function addFloat(s, x, y, color, sz) { S.floats.push({ s: s, x: x, y: y, c: color || C.gold, sz: sz || 20, t: 0 }); }
  function burst(x, y, color, n) {
    for (var i = 0; i < n; i++) S.parts.push({ x: x, y: y, vx: rand(-120, 120), vy: rand(-220, -60), t: 0, life: rand(0.5, 0.9), c: color, r: rand(2.5, 5) });
  }
  function coinsTo(x, y, n) {
    for (var i = 0; i < n; i++) S.parts.push({ coin: true, x0: x + rand(-14, 14), y0: y + rand(-10, 10), x1: 192, y1: 32, t: -i * 0.05, life: 0.55 });
  }
  function hint(s) { S.hint = { s: s, t: 0 }; }

  // ---------- actions ----------
  function refundPearl() {
    if (S.pot.state === 'boiling') S.pot.pending = (S.pot.pending || 0) + 1;
    else if (S.pot.state === 'ready') S.pot.servings++;
    else { S.pot.state = 'ready'; S.pot.servings = 1; }
  }
  function refundLemon() {
    if (S.board.state === 'chopping') S.board.pending = (S.board.pending || 0) + 1;
    else if (S.board.state === 'ready') S.board.servings++;
    else { S.board.state = 'ready'; S.board.servings = 1; }
  }
  function refundPrep(cup) {
    if (cup && cup.tops && cup.tops.indexOf('珍珠') >= 0) refundPearl();
    if (cup && cup.tea === '柠檬水') refundLemon();
  }
  function consumePearl() {
    if (S.pot.state !== 'ready' || S.pot.servings <= 0) return false;
    S.pot.servings--;
    if (S.pot.servings <= 0) { S.pot.state = 'idle'; S.pot.t = 0; }
    return true;
  }
  function consumeLemon() {
    if (S.board.state !== 'ready' || S.board.servings <= 0) return false;
    S.board.servings--;
    if (S.board.servings <= 0) { S.board.state = 'idle'; S.board.t = 0; }
    return true;
  }
  function tapPot() {
    press('pot');
    if (S.pot.state === 'boiling') { hint('珍珠还在煮…'); sfx.tap(); return; }
    if (S.pot.state === 'ready') { hint('珍珠好了，点按钮加进杯里'); sfx.tap(); return; }
    S.pot.state = 'boiling'; S.pot.t = 0; sfx.boil();
  }
  function tapBoard() {
    press('board');
    if (S.board.state === 'chopping') { hint('正在切柠檬…'); sfx.tap(); return; }
    if (S.board.state === 'ready') { hint('柠檬切好了，可以做柠檬水'); sfx.tap(); return; }
    S.board.state = 'chopping'; S.board.t = 0; sfx.chop();
  }
  function loseLife(msg, x, y, kind) {
    if (S.ending > 0 || S.lives <= 0) return;
    S.lives--; S.combo = 0; S.lifeFlash = 0.8;
    addFloat('店命 -1', x == null ? 80 : x, y == null ? 70 : y, C.coral, 20);
    if (kind === 'angry') sfx.angry(); else sfx.wrong();
    vibrate();
    if (msg) hint(msg);
    if (S.lives <= 0) S.ending = 1.0;
  }
  function chooseSize(s) {
    var cup = S.cup; if (cup.size === s) return;
    cup.size = s; cup.sizeT = 0.25; sfx.tap();
  }
  function chooseTea(t) {
    var cup = S.cup;
    if (!cup.size) { cup.shake = 0.4; hint('先选杯型'); sfx.wrong(); return; }
    if (cup.tea === t) return;
    if (t === '柠檬水' && !consumeLemon()) { cup.shake = 0.4; hint('先切柠檬'); sfx.wrong(); return; }
    if (cup.tea === '柠檬水') refundLemon();
    cup.tea = t; cup.fill = 0; sfx.pour();
  }
  function toggleTop(t) {
    var cup = S.cup;
    if (!cup.size) { cup.shake = 0.4; hint('先选杯型'); sfx.wrong(); return; }
    var i = cup.tops.indexOf(t);
    if (i >= 0) {
      cup.tops.splice(i, 1);
      if (t === '珍珠') refundPearl();
      sfx.tap(); return;
    }
    if (cup.tops.length >= 2) { cup.shake = 0.4; hint('最多加两种小料'); sfx.wrong(); return; }
    if (t === '珍珠' && !consumePearl()) { cup.shake = 0.4; hint(S.pot.state === 'boiling' ? '珍珠还没煮好' : '珍珠还没煮好'); sfx.wrong(); return; }
    cup.tops.push(t); cup.topT[t] = 0; sfx.drop();
  }
  function trashCup() {
    if (!S.cup.size && !S.cup.tea && !S.cup.tops.length) return;
    refundPrep(S.cup);
    S.flying.push({ cup: S.cup, x0: 195, y0: 548, x1: 330, y1: 900, t: 0, dur: 0.35, trash: true });
    S.cup = newCup(); sfx.trash();
  }
  function sameOrder(cup, o) {
    if (cup.size !== o.size || cup.tea !== o.tea || cup.tops.length !== o.tops.length) return false;
    for (var i = 0; i < o.tops.length; i++) if (cup.tops.indexOf(o.tops[i]) < 0) return false;
    return true;
  }
  function serve() {
    if (S.screen !== 'play' || S.ending > 0) return;
    var cup = S.cup;
    if (!cup.size) { cup.shake = 0.4; hint('先选杯型'); sfx.wrong(); return; }
    if (!cup.tea) { cup.shake = 0.4; hint('还没做完哦'); sfx.wrong(); return; }
    if (!cup.tops.length && cup.tea !== '柠檬水') { cup.shake = 0.4; hint('还没做完哦'); sfx.wrong(); return; }
    var target = null;
    S.customers.forEach(function (c) {
      if (c && (c.state === 'wait' || c.state === 'enter') && sameOrder(cup, c.order) && (!target || c.id < target.id)) target = c;
    });
    if (!target) { // mistake: dump + lose a life
      S.mistakes++;
      S.flying.push({ cup: cup, x0: 195, y0: 548, x1: 60, y1: 900, t: 0, dur: 0.4, trash: true });
      S.cup = newCup();
      loseLife('没人点这杯', 195, 395, 'wrong');
      return;
    }
    var frac = target.patience / target.max;
    var base = 40 + (cup.tops.length ? (cup.tops.length - 1) * 12 : 0) + (cup.size === '大杯' ? 5 : 0) + (cup.tea === '柠檬水' ? 8 : 0) + (cup.tops.indexOf('珍珠') >= 0 ? 8 : 0);
    var tip = Math.round(30 * frac);
    S.combo++; S.maxCombo = Math.max(S.maxCombo, S.combo);
    var mult = Math.min(2, 1 + 0.1 * (S.combo - 1));
    var gain = Math.round((base + tip) * mult);
    S.score += gain; S.tips += tip; S.served++;
    target.state = 'happy'; target.t = 0;
    var tx = SLOT_X[target.slot];
    S.flying.push({ cup: cup, x0: 195, y0: 548, x1: tx, y1: 380, t: 0, dur: 0.28 });
    S.cup = newCup();
    addFloat('+' + gain, tx, 252, C.gold, 24);
    if (tip >= 20) addFloat('小费 +' + tip, tx, 278, '#fff3d6', 15);
    if (S.combo >= 2) { addFloat('连击 ×' + S.combo, 195, 480, '#fff3d6', 20); S.comboPop = 0.35; }
    burst(tx, 330, C.gold, 14); burst(tx, 330, C.sageLight, 8);
    coinsTo(tx, 320, Math.min(6, 2 + Math.floor(gain / 30)));
    S.coinPop = 0.3;
    sfx.serve(); sfx.coin();
  }

  // ---------- buttons ----------
  var BTN = [];
  function defButtons() {
    BTN = [];
    var x0 = 16, wAll = 358, g = 8;
    var y1 = 592, h = 48;
    var w2 = (wAll - g) / 2, w3 = (wAll - 2 * g) / 3, w4 = (wAll - 3 * g) / 4;
    SIZES.forEach(function (s, i) { BTN.push({ id: 'size_' + s, kind: 'size', v: s, x: x0 + i * (w2 + g), y: y1, w: w2, h: h }); });
    TEAS.forEach(function (s, i) { BTN.push({ id: 'tea_' + s, kind: 'tea', v: s, x: x0 + i * (w4 + g), y: y1 + h + g, w: w4, h: h }); });
    TOPS.forEach(function (s, i) { BTN.push({ id: 'top_' + s, kind: 'top', v: s, x: x0 + i * (w3 + g), y: y1 + 2 * (h + g), w: w3, h: h }); });
    BTN.push({ id: 'serve', kind: 'serve', x: x0, y: y1 + 3 * (h + g) + 2, w: wAll - 76, h: 62 });
    BTN.push({ id: 'trash', kind: 'trash', x: x0 + wAll - 68, y: y1 + 3 * (h + g) + 2, w: 68, h: 62 });
  }
  defButtons();
  var UI_BTN = {
    mute: { x: 336, y: 62, w: 44, h: 36 },
    pot: { x: 6, y: 448, w: 108, h: 128 },
    board: { x: 276, y: 448, w: 108, h: 128 },
    start: { x: 95, y: 690, w: 200, h: 62 },
    save: { x: 30, y: 748, w: 156, h: 56 },
    again: { x: 204, y: 748, w: 156, h: 56 },
    startMute: { x: 330, y: 20, w: 44, h: 36 }
  };
  function hit(b, x, y) { return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; }
  function press(id) { S.btnPress[id] = 0.18; }
  function pressScale(id) { var p = S.btnPress[id] || 0; return p > 0 ? 1 - Math.sin(p / 0.18 * Math.PI) * 0.07 : 1; }

  function drawButton(b, label, icon, selected, style) {
    var s = pressScale(b.id);
    ctx.save();
    ctx.translate(b.x + b.w / 2, b.y + b.h / 2); ctx.scale(s, s);
    var x = -b.w / 2, y = -b.h / 2;
    var fill = C.cream, edge = '#d6c09c', tcol = C.ink;
    if (selected) { fill = C.sage; edge = C.sageDark; tcol = '#fffdf6'; }
    if (style === 'serve') { fill = C.coral; edge = C.coralDark; tcol = '#fff8f0'; }
    if (style === 'trash') { fill = '#8a6a50'; edge = '#5e4532'; tcol = '#fff'; }
    shadowOn(6, 3); rr(x, y + 3, b.w, b.h, 14); ctx.fillStyle = edge; ctx.fill(); shadowOff();
    rr(x, y, b.w, b.h, 14); ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.5; rr(x + 3, y + 3, b.w - 6, b.h - 6, 11); ctx.stroke();
    if (style === 'trash') { drawIcon('trash', 0, -6, 22); text('清空', 0, 17, 12, tcol); }
    else if (style === 'serve') {
      drawCup({ size: '中杯', tea: '奶茶', tops: ['珍珠'], fill: 1, topT: { '珍珠': 1 }, shake: 0, sizeT: 0 }, -46, 20, 0.32, 1, true);
      text('出杯', 12, 0, 26, tcol);
    } else {
      var narrow = b.w < 100;
      if (icon) drawIcon(icon, x + (b.w > 150 ? 46 : (narrow ? 16 : 26)), 0, narrow ? 18 : 24);
      text(label, narrow ? 12 : 12, 0, narrow ? 13 : 17, tcol);
    }
    ctx.restore();
  }

  // ---------- input ----------
  function toLogical(e) {
    return { x: (e.clientX - cLeft - offX) / scale, y: (e.clientY - cTop - offY) / scale };
  }
  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    audio();
    var p = toLogical(e);
    onTap(p.x, p.y);
  });
  // fallback for very old webviews without pointer events
  if (!window.PointerEvent) {
    canvas.addEventListener('touchstart', function (e) {
      e.preventDefault(); audio();
      var t = e.changedTouches[0]; var p = toLogical(t); onTap(p.x, p.y);
    }, { passive: false });
    canvas.addEventListener('mousedown', function (e) { var p = toLogical(e); onTap(p.x, p.y); });
  }

  function toggleMute() {
    muted = !muted; setLocalData('milktea_muted', { muted: muted });
    if (!muted) sfx.tap();
  }

  function onTap(x, y) {
    if (S.screen === 'start') {
      if (hit(UI_BTN.startMute, x, y)) { press('startMute'); toggleMute(); return; }
      if (hit(UI_BTN.start, x, y) || y > 300) { press('start'); startGame(); }
      return;
    }
    if (S.screen === 'result') {
      if (S.resultT < 0.6) return;
      if (hit(UI_BTN.save, x, y)) { press('save'); sfx.tap(); saveResultImage(); return; }
      if (hit(UI_BTN.again, x, y)) { press('again'); startGame(); return; }
      return;
    }
    if (S.screen !== 'play') return;
    if (hit(UI_BTN.mute, x, y)) { press('mute'); toggleMute(); return; }
    if (S.ending > 0) return;
    if (hit(UI_BTN.pot, x, y)) { tapPot(); return; }
    if (hit(UI_BTN.board, x, y)) { tapBoard(); return; }
    for (var i = 0; i < BTN.length; i++) {
      var b = BTN[i];
      if (!hit(b, x, y)) continue;
      press(b.id);
      if (b.kind === 'size') chooseSize(b.v);
      else if (b.kind === 'tea') chooseTea(b.v);
      else if (b.kind === 'top') toggleTop(b.v);
      else if (b.kind === 'serve') serve();
      else if (b.kind === 'trash') trashCup();
      return;
    }
  }

  function startGame() {
    resetGame(); S.screen = 'play'; sfx.start();
  }
  function endGame() {
    S.screen = 'result'; S.resultT = 0;
    if (S.score > S.best) { S.best = S.score; S.newBest = S.score > 0; setLocalData('milktea_best', { best: S.best }); }
    sfx.end();
  }

  // ---------- result math ----------
  function titleFor(score) {
    if (score >= 3500) return '奶茶店顶流店长';
    if (score >= 2000) return '人气店长';
    if (score >= 800) return '熟练店员';
    return '摸鱼学徒';
  }
  function percentFor(score) { return clamp(Math.round(99 * (1 - Math.exp(-score / 1500))), 1, 99); }
  function formatTime(sec) {
    var s = Math.max(0, Math.floor(sec)), m = Math.floor(s / 60);
    s = s % 60;
    if (m <= 0) return s + '秒';
    return m + '分' + (s < 10 ? '0' : '') + s + '秒';
  }

  // ---------- update ----------
  function update(dt) {
    var k;
    for (k in S.btnPress) if (S.btnPress[k] > 0) S.btnPress[k] -= dt;
    if (S.coinPop > 0) S.coinPop -= dt;
    if (S.comboPop > 0) S.comboPop -= dt;
    S.floats = S.floats.filter(function (f) { f.t += dt; return f.t < 1.1; });
    S.parts = S.parts.filter(function (p) {
      p.t += dt;
      if (!p.coin && p.t > 0) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 520 * dt; }
      return p.t < p.life;
    });
    S.flying = S.flying.filter(function (f) { f.t += dt; return f.t < f.dur; });
    if (S.hint) { S.hint.t += dt; if (S.hint.t > 1.3) S.hint = null; }
    if (S.screen === 'result') { S.resultT += dt; return; }
    if (S.screen !== 'play' || S.paused) return;

    if (S.lifeFlash > 0) S.lifeFlash -= dt;
    if (S.ending > 0) {
      S.ending -= dt;
      // let leave animations finish, then settle
      for (var ei = 0; ei < 3; ei++) {
        var ec = S.customers[ei]; if (!ec) continue;
        ec.t += dt;
        if ((ec.state === 'happy' && ec.t > 1.0) || (ec.state === 'angry' && ec.t > 1.0)) S.customers[ei] = null;
      }
      if (S.ending <= 0) endGame();
      return;
    }

    S.elapsed += dt;
    var cup = S.cup;
    if (cup.tea && cup.fill < 1) cup.fill = Math.min(1, cup.fill + dt / 0.28);
    if (cup.shake > 0) cup.shake -= dt;
    if (cup.sizeT > 0) cup.sizeT -= dt;
    cup.tops.forEach(function (t) { cup.topT[t] = (cup.topT[t] || 0) + dt; });

    // prep stations
    if (S.pot.state === 'boiling') {
      S.pot.t += dt;
      if (S.pot.t >= BOIL_TIME) {
        S.pot.state = 'ready';
        S.pot.servings = POT_SERVINGS + (S.pot.pending || 0);
        S.pot.pending = 0;
        sfx.boilDone(); hint('珍珠煮好了');
      }
    }
    if (S.board.state === 'chopping') {
      S.board.t += dt;
      if (S.board.t >= CHOP_TIME) {
        S.board.state = 'ready';
        S.board.servings = LEMON_SERVINGS + (S.board.pending || 0);
        S.board.pending = 0;
        sfx.chopDone(); hint('柠檬切好了');
      }
    }

    // spawn
    S.nextSpawn -= dt;
    var count = S.customers.filter(Boolean).length;
    if (S.nextSpawn <= 0 || count === 0 && S.nextSpawn > 0.8) {
      if (spawn()) {
        var d = difficulty();
        S.nextSpawn = S.elapsed < 2 ? 1.6 : lerp(4.6, 2.1, d) * rand(0.9, 1.15);
      } else S.nextSpawn = 0.3;
    }
    for (var i = 0; i < 3; i++) {
      var c = S.customers[i]; if (!c) continue;
      c.t += dt;
      if (c.state === 'enter' && c.t > 0.35) { c.state = 'wait'; c.t = 0; }
      if (c.state === 'wait' || c.state === 'enter') {
        c.patience -= dt;
        if (!c.warned && c.patience / c.max <= 0.22 && c.patience > 0) {
          c.warned = true;
          addFloat('先救快走人！', SLOT_X[i], 240, C.coral, 16);
          sfx.warn();
        }
        if (c.patience <= 0) {
          c.state = 'angry'; c.t = 0; S.lost++;
          addFloat('等太久啦…', SLOT_X[i], 252, C.coral, 17);
          loseLife('有客人等急走掉了', SLOT_X[i], 210, 'angry');
        }
      }
      if ((c.state === 'happy' && c.t > 1.0) || (c.state === 'angry' && c.t > 1.0)) S.customers[i] = null;
    }
  }

  // ---------- draw: play ----------
  function drawCustomer(c, x, extraScale) {
    var im = IMG[c.kind]; if (!imgReady(c.kind)) return;
    var meta = KIND_META[c.kind];
    var w = meta.w * (extraScale || 1), h = im.naturalHeight * w / im.naturalWidth;
    var y = COUNTER_Y - h * meta.vis;
    var dx = 0, dy = 0, a = 1;
    if (c.state === 'enter') { var e = clamp(c.t / 0.35, 0, 1); dy = (1 - easeOutBack(e)) * 60; a = e; }
    if (c.state === 'happy') {
      dy = -Math.abs(Math.sin(c.t * 9)) * 12 * (c.t < 0.6 ? 1 : 0);
      if (c.t > 0.6) { var q = (c.t - 0.6) / 0.4; dy = q * 90; a = 1 - q; }
    }
    if (c.state === 'angry') {
      dx = c.t < 0.55 ? Math.sin(c.t * 50) * 5 : 0;
      if (c.t > 0.6) { var q2 = (c.t - 0.6) / 0.4; dy = q2 * 90; a = 1 - q2; }
    }
    var urgentC = (c.state === 'wait' || c.state === 'enter') && c.patience / c.max <= 0.22;
    if (urgentC) dx += Math.sin(S.elapsed * 28) * 3;
    ctx.save(); ctx.globalAlpha = a;
    ctx.drawImage(im, x - w / 2 + dx, y + dy, w, h);
    if (urgentC) {
      ctx.globalAlpha = (0.18 + 0.14 * Math.sin(S.elapsed * 10)) * a;
      ctx.fillStyle = C.coral; ctx.beginPath(); ctx.arc(x + dx, y + dy + h * 0.32, w * 0.42, 0, Math.PI * 2); ctx.fill();
    }
    if (c.state === 'angry' && c.t < 0.7) { // red flush
      ctx.globalAlpha = 0.25 * a; ctx.fillStyle = C.coral; ctx.beginPath(); ctx.arc(x + dx, y + dy + h * 0.32, w * 0.42, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function drawBubble(c) {
    var x = SLOT_X[c.slot], w = 116, h = 84, bx = x - w / 2, by = 150;
    var a = 1, s = 1;
    if (c.state === 'enter') { var e = clamp(c.t / 0.35, 0, 1); a = e; s = 0.7 + 0.3 * easeOutBack(e); }
    if (c.state === 'happy' || c.state === 'angry') { a = clamp(1 - c.t / 0.3, 0, 1); s = 1 + c.t * 0.4; }
    if (a <= 0) return;
    var frac = clamp(c.patience / c.max, 0, 1);
    var urgent = frac < 0.3 && (c.state === 'wait' || c.state === 'enter');
    var danger = frac <= 0.22 && (c.state === 'wait' || c.state === 'enter');
    ctx.save(); ctx.globalAlpha = a;
    ctx.translate(x, by + h / 2); ctx.scale(s, s);
    if (danger) ctx.translate(Math.sin(S.elapsed * 48) * 3.2, 0);
    else if (urgent) ctx.translate(Math.sin(S.elapsed * 40) * 1.6, 0);
    ctx.translate(-x, -(by + h / 2));
    shadowOn(8, 3);
    rr(bx, by, w, h, 14); ctx.fillStyle = danger ? '#fde8e2' : C.paper; ctx.fill(); shadowOff();
    if (danger) { ctx.strokeStyle = C.coral; ctx.lineWidth = 2.2; rr(bx, by, w, h, 14); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(x - 9, by + h - 1); ctx.lineTo(x + 9, by + h - 1); ctx.lineTo(x, by + h + 11); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#e2d2b3'; ctx.lineWidth = 1.2; rr(bx, by, w, h, 14); ctx.stroke();
    // text
    var o = c.order;
    ctx.fillStyle = urgent ? C.coral : C.sage; ctx.beginPath(); ctx.arc(bx + 12, by + 16, 4.5, 0, Math.PI * 2); ctx.fill();
    fitText(o.size + ' ' + o.tea + (o.tops.length ? ' ' + o.tops.join('+') : ''), x + 6, by + 16, w - 26, 13.5, C.ink, true);
    if (danger) {
      ctx.fillStyle = C.coral; rr(bx + w - 32, by - 11, 28, 16, 8); ctx.fill();
      text('急', bx + w - 18, by - 3, 11, '#fff');
    }
    // icons
    var icons = [o.tea].concat(o.tops), n = icons.length, gap = 30, sx = x - (n - 1) * gap / 2;
    var sizeH = o.size === '大杯';
    icons.forEach(function (ic, i) { drawIcon(ic, sx + i * gap, by + 44, i === 0 && !sizeH ? 22 : 26); });
    // patience bar
    var pw = w - 22, px = bx + 11, py = by + h - 14;
    rr(px, py, pw, 7, 3.5); ctx.fillStyle = '#e7dcc6'; ctx.fill();
    var col = frac > 0.55 ? C.sage : frac > 0.3 ? C.caramel : C.coral;
    if (frac > 0.01) { rr(px, py, pw * frac, 7, 3.5); ctx.fillStyle = col; ctx.fill(); }
    ctx.restore();
    // reaction
    if (c.state === 'happy' && c.t < 0.9) reactionTag(x, 270 - c.t * 20, '好喝！', C.sage);
    if (c.state === 'angry' && c.t < 0.9) reactionTag(x, 270 - c.t * 20, '哼…', C.coral);
  }
  function reactionTag(x, y, s, col) {
    ctx.save(); shadowOn(6, 2);
    ctx.font = font(15, true); var w = ctx.measureText(s).width + 22;
    rr(x - w / 2, y - 14, w, 28, 14); ctx.fillStyle = col; ctx.fill(); shadowOff();
    text(s, x, y, 15, '#fffdf6'); ctx.restore();
  }
  function pill(x, y, w, h) {
    shadowOn(6, 2); rr(x, y, w, h, h / 2); ctx.fillStyle = C.paper; ctx.fill(); shadowOff();
    ctx.strokeStyle = '#d9c5a2'; ctx.lineWidth = 1.5; rr(x, y, w, h, h / 2); ctx.stroke();
  }
  function drawHUD() {
    var flash = S.lifeFlash > 0, lowLife = S.lives <= 1;
    var shakeX = flash ? Math.sin(S.lifeFlash * 50) * 4 : 0;
    ctx.save(); ctx.translate(shakeX, 0);
    if (flash || lowLife) {
      ctx.save(); ctx.globalAlpha = flash ? 0.55 + 0.4 * Math.sin(S.lifeFlash * 20) : 0.12 + 0.1 * Math.sin(S.elapsed * 8);
      rr(12, 12, 148, 42, 21); ctx.fillStyle = C.coral; ctx.fill(); ctx.restore();
    }
    pill(12, 12, 148, 42);
    for (var li = 0; li < MAX_LIVES; li++) {
      var alive = li < S.lives;
      var sc = (!alive && flash && li === S.lives) ? 1 + Math.sin(S.lifeFlash * 30) * 0.15 : (lowLife && alive ? 1 + Math.sin(S.elapsed * 8) * 0.08 : 1);
      ctx.save(); ctx.translate(36 + li * 38, 33); ctx.scale(sc, sc);
      drawIcon(alive ? 'life' : 'lifeOff', 0, 0, 26);
      ctx.restore();
    }
    ctx.restore();
    pill(168, 12, 156, 42);
    var cp = S.coinPop > 0 ? 1 + Math.sin(S.coinPop / 0.3 * Math.PI) * 0.25 : 1;
    ctx.save(); ctx.translate(190, 33); ctx.scale(cp, cp); drawIcon('coin', 0, 0, 26); ctx.restore();
    text(String(S.score), 258, 34, 24, C.ink);
    // combo
    var cpp = S.comboPop > 0 ? 1 + Math.sin(S.comboPop / 0.35 * Math.PI) * 0.2 : 1;
    ctx.save(); ctx.translate(356, 32); ctx.scale(cpp, cpp);
    shadowOn(6, 2); rr(-25, -22, 50, 44, 10); ctx.fillStyle = S.combo >= 2 ? C.sageLight : '#efe6d2'; ctx.fill(); shadowOff();
    ctx.strokeStyle = S.combo >= 2 ? C.sageDark : '#cbb894'; ctx.lineWidth = 1.5; rr(-25, -22, 50, 44, 10); ctx.stroke();
    text('连击', 0, -9, 11, C.inkSoft); text('×' + S.combo, 0, 9, 18, C.ink);
    ctx.restore();
    // mute
    var mb = UI_BTN.mute, ms = pressScale('mute');
    ctx.save(); ctx.translate(mb.x + mb.w / 2, mb.y + mb.h / 2); ctx.scale(ms, ms);
    ctx.globalAlpha = 0.85; ctx.fillStyle = C.paper; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    drawIcon(muted ? 'mute' : 'sound', 0, 0, 20); ctx.restore();
  }
  function needPearl() {
    return S.customers.some(function (c) { return c && (c.state === 'wait' || c.state === 'enter') && c.order.tops.indexOf('珍珠') >= 0; });
  }
  function needLemon() {
    return S.customers.some(function (c) { return c && (c.state === 'wait' || c.state === 'enter') && c.order.tea === '柠檬水'; });
  }
  function stationPulse(need, idle) { return (need && idle) ? 1 + Math.sin(S.elapsed * 7) * 0.06 : 1; }
  function drawPot() {
    var px = 58, py = 530, ps = pressScale('pot') * stationPulse(needPearl(), S.pot.state === 'idle');
    ctx.save(); ctx.translate(px, py); ctx.scale(ps, ps);
    if (needPearl() && S.pot.state === 'idle') {
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(S.elapsed * 7); ctx.fillStyle = C.gold;
      ctx.beginPath(); ctx.arc(0, -20, 42, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
    shadowOn(8, 4);
    // body
    ctx.fillStyle = '#6a4a32'; ctx.beginPath(); ctx.moveTo(-32, -18); ctx.lineTo(32, -18); ctx.quadraticCurveTo(36, 18, 0, 22); ctx.quadraticCurveTo(-36, 18, -32, -18); ctx.fill();
    shadowOff();
    ctx.fillStyle = '#8a6140'; ctx.beginPath(); ctx.moveTo(-30, -18); ctx.lineTo(30, -18); ctx.quadraticCurveTo(32, 12, 0, 16); ctx.quadraticCurveTo(-32, 12, -30, -18); ctx.fill();
    // handle
    ctx.strokeStyle = '#5a3a24'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(-34, -2, 12, 0.9, -0.9, true); ctx.stroke();
    // inner
    ctx.fillStyle = '#3a2418'; ctx.beginPath(); ctx.ellipse ? ctx.ellipse(0, -20, 26, 8, 0, 0, Math.PI * 2) : ctx.arc(0, -20, 26, 0, Math.PI * 2); ctx.fill();
    if (S.pot.state === 'idle') {
      ctx.fillStyle = 'rgba(120,160,200,0.35)'; ctx.beginPath(); ctx.ellipse ? ctx.ellipse(0, -20, 22, 6, 0, 0, Math.PI * 2) : ctx.arc(0, -20, 22, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = S.pot.state === 'boiling' ? '#c9a06a' : '#5a3a24';
      ctx.beginPath(); ctx.ellipse ? ctx.ellipse(0, -20, 22, 6, 0, 0, Math.PI * 2) : ctx.arc(0, -20, 22, 0, Math.PI * 2); ctx.fill();
      var nPearls = S.pot.state === 'ready' ? Math.min(8, 2 + S.pot.servings * 2) : 6;
      for (var i = 0; i < nPearls; i++) {
        var ang = i * 0.9 + (S.pot.state === 'boiling' ? S.elapsed * 3 : 0);
        var rr2 = 8 + (i % 3) * 4, bx = Math.cos(ang) * rr2 * 0.7, by = -20 + Math.sin(ang) * 3;
        if (S.pot.state === 'boiling') by += Math.sin(S.elapsed * 12 + i) * 1.5;
        ctx.fillStyle = '#21160f'; ctx.beginPath(); ctx.arc(bx, by, 3.6, 0, Math.PI * 2); ctx.fill();
      }
    }
    // lid
    var lidY = S.pot.state === 'boiling' ? -28 - Math.abs(Math.sin(S.elapsed * 10)) * 3 : -28;
    ctx.fillStyle = '#7a5134'; ctx.beginPath(); ctx.ellipse ? ctx.ellipse(0, lidY, 28, 7, 0, 0, Math.PI * 2) : ctx.arc(0, lidY, 28, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c98a4b'; ctx.beginPath(); ctx.arc(0, lidY - 4, 4, 0, Math.PI * 2); ctx.fill();
    if (S.pot.state === 'boiling') {
      for (var k = 0; k < 4; k++) {
        var sy = lidY - 10 - ((S.elapsed * 28 + k * 12) % 28), sx = -10 + k * 7;
        ctx.globalAlpha = 0.35; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx, sy, 4 + (k % 2), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      }
      var prog = clamp(S.pot.t / BOIL_TIME, 0, 1);
      ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -8, 34, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    var label = S.pot.state === 'boiling' ? '煮着…' : (S.pot.state === 'ready' ? '珍珠 ×' + S.pot.servings : '点这里煮珍珠');
    ctx.font = font(11, true); var lw = ctx.measureText(label).width + 14;
    ctx.fillStyle = S.pot.state === 'ready' ? C.sage : 'rgba(74,51,36,0.8)';
    rr(px - lw / 2, py + 18, lw, 18, 9); ctx.fill();
    text(label, px, py + 27, 11, '#fff8ec');
  }
  function drawBoard() {
    var px = 330, py = 525, ps = pressScale('board') * stationPulse(needLemon(), S.board.state === 'idle');
    ctx.save(); ctx.translate(px, py); ctx.scale(ps, ps);
    if (needLemon() && S.board.state === 'idle') {
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(S.elapsed * 7); ctx.fillStyle = C.gold;
      ctx.beginPath(); ctx.arc(0, -8, 44, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
    shadowOn(8, 4);
    ctx.fillStyle = '#a06a3e'; rr(-42, -28, 84, 56, 8); ctx.fill(); shadowOff();
    ctx.fillStyle = '#c08a55'; rr(-38, -24, 76, 48, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(80,50,28,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-30, -10); ctx.lineTo(30, -8); ctx.moveTo(-28, 6); ctx.lineTo(28, 8); ctx.stroke();
    if (S.board.state === 'ready') {
      for (var i = 0; i < Math.min(6, S.board.servings * 2); i++) {
        ctx.save(); ctx.translate(-22 + (i % 3) * 18, -10 + Math.floor(i / 3) * 16); ctx.rotate(i * 0.4);
        ctx.fillStyle = '#f3e27a'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#c9b04a'; ctx.lineWidth = 1; ctx.stroke();
        ctx.strokeStyle = 'rgba(180,140,40,0.55)'; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.moveTo(0, -4); ctx.lineTo(0, 4); ctx.stroke();
        ctx.restore();
      }
    } else {
      // whole lemons
      [[-14, -4, -0.3], [12, 2, 0.4]].forEach(function (L) {
        ctx.save(); ctx.translate(L[0], L[1]); ctx.rotate(L[2]);
        drawIcon('柠檬', 0, 0, 22);
        ctx.restore();
      });
      // knife
      var kx = S.board.state === 'chopping' ? Math.sin(S.board.t * 24) * 10 : 22;
      var ky = S.board.state === 'chopping' ? -8 + Math.abs(Math.sin(S.board.t * 24)) * 10 : -16;
      ctx.save(); ctx.translate(kx, ky); ctx.rotate(S.board.state === 'chopping' ? -0.6 + Math.sin(S.board.t * 24) * 0.4 : -0.7);
      ctx.fillStyle = '#d8d4cc'; ctx.fillRect(-2, -16, 5, 22);
      ctx.fillStyle = '#6a4a32'; ctx.fillRect(-3, 6, 7, 10);
      ctx.restore();
    }
    if (S.board.state === 'chopping') {
      var prog = clamp(S.board.t / CHOP_TIME, 0, 1);
      ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 36, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    var label = S.board.state === 'chopping' ? '切着…' : (S.board.state === 'ready' ? '柠檬 ×' + S.board.servings : '点这里切柠檬');
    ctx.font = font(11, true); var lw = ctx.measureText(label).width + 14;
    ctx.fillStyle = S.board.state === 'ready' ? C.sage : 'rgba(74,51,36,0.8)';
    rr(px - lw / 2, py + 26, lw, 18, 9); ctx.fill();
    text(label, px, py + 35, 11, '#fff8ec');
  }
  function drawProps() {
    // wooden board under cup
    ctx.save();
    shadowOn(8, 4);
    ctx.fillStyle = '#9b6a43';
    ctx.beginPath(); ctx.moveTo(130, 534); ctx.lineTo(262, 534); ctx.lineTo(276, 560); ctx.lineTo(116, 560); ctx.closePath(); ctx.fill();
    shadowOff();
    ctx.fillStyle = '#b07c50'; ctx.beginPath(); ctx.moveTo(132, 534); ctx.lineTo(260, 534); ctx.lineTo(266, 546); ctx.lineTo(126, 546); ctx.closePath(); ctx.fill();
    ctx.restore();
    drawPot();
    drawBoard();
  }
  function drawPlay() {
    drawBg();
    var order = S.customers.filter(Boolean);
    order.forEach(function (c) { drawCustomer(c, SLOT_X[c.slot]); });
    drawCounterFront();
    drawProps();
    // current cup
    drawCup(S.cup, 195, 548, 1, 1, false);
    var lbl = cupLabel(S.cup);
    if (lbl && S.cup.size) {
      ctx.font = font(13, true); var lw = ctx.measureText(lbl).width + 20;
      ctx.fillStyle = 'rgba(74,51,36,0.72)'; rr(195 - lw / 2, 566, lw, 22, 11); ctx.fill();
      text(lbl, 195, 577, 13, '#fff8ec');
    }
    // flying cups
    S.flying.forEach(function (f) {
      var q = clamp(f.t / f.dur, 0, 1), x = lerp(f.x0, f.x1, q), y = lerp(f.y0, f.y1, q) - Math.sin(q * Math.PI) * (f.trash ? 40 : 80);
      drawCup(f.cup, x, y, f.trash ? 1 - q * 0.4 : 1 - q * 0.45, f.trash ? 1 - q : 1 - q * 0.3, !f.trash);
    });
    order.forEach(function (c) { drawBubble(c); });
    // buttons
    var cup = S.cup;
    BTN.forEach(function (b) {
      var sel = false;
      if (b.kind === 'size') sel = cup.size === b.v;
      if (b.kind === 'tea') sel = cup.tea === b.v;
      if (b.kind === 'top') sel = cup.tops.indexOf(b.v) >= 0;
      if (b.kind === 'serve') drawButton(b, '出杯', null, false, 'serve');
      else if (b.kind === 'trash') drawButton(b, '清空', null, false, 'trash');
      else drawButton(b, b.v, b.v, sel);
    });
    drawHUD();
    drawFx();
    if (S.lifeFlash > 0) {
      ctx.save(); ctx.globalAlpha = 0.22 * (S.lifeFlash / 0.8);
      ctx.fillStyle = C.coral; ctx.fillRect(0, 0, LW, LH); ctx.restore();
    }
    if (S.hint) {
      var a = S.hint.t < 1 ? 1 : 1 - (S.hint.t - 1) / 0.3;
      ctx.save(); ctx.globalAlpha = clamp(a, 0, 1);
      ctx.font = font(15, true); var hw = ctx.measureText(S.hint.s).width + 30;
      rr(195 - hw / 2, 102, hw, 32, 16); ctx.fillStyle = 'rgba(74,51,36,0.85)'; ctx.fill();
      text(S.hint.s, 195, 118, 15, '#fff8ec'); ctx.restore();
    }
  }
  function drawFx() {
    S.parts.forEach(function (p) {
      if (p.coin) {
        if (p.t < 0) return;
        var q = clamp(p.t / p.life, 0, 1), e = q * q;
        var x = lerp(p.x0, p.x1, e), y = lerp(p.y0, p.y1, e) - Math.sin(q * Math.PI) * 40;
        drawIcon('coin', x, y, 16);
        return;
      }
      ctx.globalAlpha = clamp(1 - p.t / p.life, 0, 1); ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    });
    S.floats.forEach(function (f) {
      var q = f.t / 1.1, s = f.t < 0.15 ? easeOutBack(f.t / 0.15) : 1;
      ctx.save(); ctx.globalAlpha = clamp(1.4 - q * 1.4, 0, 1);
      ctx.translate(f.x, f.y - q * 46); ctx.scale(s, s);
      ctx.font = font(f.sz, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(74,51,36,0.85)'; ctx.strokeText(f.s, 0, 0);
      ctx.fillStyle = f.c; ctx.fillText(f.s, 0, 0); ctx.restore();
    });
  }

  // ---------- draw: start ----------
  function woodSign(cx, cy, w, h, title, sz) {
    ctx.save();
    ctx.strokeStyle = '#6b4a2f'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - w * 0.3, cy - h / 2); ctx.lineTo(cx - w * 0.3, 0); ctx.moveTo(cx + w * 0.3, cy - h / 2); ctx.lineTo(cx + w * 0.3, 0); ctx.stroke();
    shadowOn(12, 5); rr(cx - w / 2, cy - h / 2, w, h, 16); ctx.fillStyle = '#7a4e30'; ctx.fill(); shadowOff();
    rr(cx - w / 2 + 6, cy - h / 2 + 6, w - 12, h - 12, 12); ctx.fillStyle = '#9a6640'; ctx.fill();
    ctx.strokeStyle = 'rgba(80,50,28,0.35)'; ctx.lineWidth = 1.2;
    for (var i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(cx - w / 2 + 12, cy - h / 2 + i * h / 4); ctx.lineTo(cx + w / 2 - 12, cy - h / 2 + i * h / 4 + 2); ctx.stroke(); }
    ctx.font = font(sz, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = '#4a2e1a'; ctx.strokeText(title, cx, cy + 2);
    ctx.fillStyle = '#fff6e4'; ctx.fillText(title, cx, cy + 2);
    ctx.restore();
  }
  function ribbon(cx, cy, w, s) {
    ctx.save(); shadowOn(6, 3);
    ctx.fillStyle = '#e8d6b2';
    ctx.beginPath(); ctx.moveTo(cx - w / 2 - 22, cy - 12); ctx.lineTo(cx - w / 2 + 4, cy - 12); ctx.lineTo(cx - w / 2 + 4, cy + 18); ctx.lineTo(cx - w / 2 - 22, cy + 18); ctx.lineTo(cx - w / 2 - 12, cy + 3); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + w / 2 + 22, cy - 12); ctx.lineTo(cx + w / 2 - 4, cy - 12); ctx.lineTo(cx + w / 2 - 4, cy + 18); ctx.lineTo(cx + w / 2 + 22, cy + 18); ctx.lineTo(cx + w / 2 + 12, cy + 3); ctx.closePath(); ctx.fill();
    rr(cx - w / 2, cy - 20, w, 40, 6); ctx.fillStyle = C.paper; ctx.fill(); shadowOff();
    ctx.strokeStyle = '#d6c09c'; ctx.lineWidth = 1.5; rr(cx - w / 2 + 4, cy - 16, w - 8, 32, 4); ctx.stroke();
    fitText(s, cx, cy + 1, w - 24, 22, '#5a3a24', true);
    ctx.restore();
  }
  function bigButton(b, id, label, fill, edge) {
    var s = pressScale(id);
    ctx.save(); ctx.translate(b.x + b.w / 2, b.y + b.h / 2); ctx.scale(s, s);
    shadowOn(10, 4); rr(-b.w / 2, -b.h / 2 + 4, b.w, b.h, b.h / 2); ctx.fillStyle = edge; ctx.fill(); shadowOff();
    rr(-b.w / 2, -b.h / 2, b.w, b.h, b.h / 2); ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; rr(-b.w / 2 + 4, -b.h / 2 + 4, b.w - 8, b.h - 8, b.h / 2 - 4); ctx.stroke();
    text(label, 0, 1, 22, '#fffaf0');
    ctx.restore();
  }
  function drawStart(t) {
    drawBg();
    var bob = function (o) { return Math.sin(t * 2 + o) * 3; };
    var trio = [['raccoon', 195, 1.0], ['fox', 80, 1.1], ['deer', 312, 1.05]];
    trio.forEach(function (q, i) {
      ctx.save(); ctx.translate(0, bob(i));
      drawCustomer({ kind: q[0], state: 'wait', t: 0 }, q[1], q[2]);
      ctx.restore();
    });
    drawCounterFront();
    drawProps();
    var demo = { size: '大杯', tea: '奶茶', tops: ['珍珠', '布丁'], fill: 1, topT: { '珍珠': 1, '布丁': 1 }, shake: 0, sizeT: 0 };
    drawCup(demo, 195, 548, 1, 1, true);
    woodSign(195, 128, 286, 96, '忙碌奶茶店', 40);
    ribbon(195, 200, 220, '先备料，再出杯');
    // how-to card
    shadowOn(10, 4); rr(30, 584, 330, 88, 16); ctx.fillStyle = 'rgba(251,245,232,0.96)'; ctx.fill(); shadowOff();
    text('3 条店命，客人等急了或做错都会扣命', 195, 610, 14.5, C.ink);
    text('珍珠要先煮、柠檬要先切，备好再出杯', 195, 640, 14.5, C.inkSoft, 'center', false);
    var pulse = 1 + Math.sin(t * 4) * 0.03;
    ctx.save(); ctx.translate(195, 721); ctx.scale(pulse, pulse); ctx.translate(-195, -721);
    bigButton(UI_BTN.start, 'start', '开始营业', C.coral, C.coralDark); ctx.restore();
    text(S.best > 0 ? '最佳成绩  ' + S.best : '第一次开店，加油！', 195, 784, 15, '#fff3d6');
    var mb = UI_BTN.startMute;
    ctx.save(); ctx.translate(mb.x + mb.w / 2, mb.y + mb.h / 2);
    ctx.fillStyle = 'rgba(251,245,232,0.9)'; ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill();
    drawIcon(muted ? 'mute' : 'sound', 0, 0, 20); ctx.restore();
  }

  // ---------- draw: result ----------
  function drawResultScene(forImage) {
    drawBg();
    var t = S.resultT;
    // characters: raccoon waving back, deer, fox front-left
    drawCustomer({ kind: 'raccoon', state: 'wait', t: 0 }, 250, 0.95);
    drawCustomer({ kind: 'deer', state: 'wait', t: 0 }, 336, 0.95);
    drawCustomer({ kind: 'fox', state: 'wait', t: 0 }, 92, 1.25);
    drawCounterFront();
    // cups row
    var n = clamp(S.served, 0, 5), tops = [['珍珠'], ['椰果'], ['珍珠', '布丁'], ['布丁'], ['珍珠']], teas = ['奶茶', '红茶', '奶茶', '绿茶', '奶茶'];
    var gap = 62, sx = 195 - (n - 1) * gap / 2;
    for (var i = 0; i < n; i++) {
      var appear = forImage ? 1 : clamp((t - 0.2 - i * 0.1) / 0.25, 0, 1);
      if (appear <= 0) continue;
      var tp = {}; tops[i].forEach(function (k) { tp[k] = 1; });
      drawCup({ size: '中杯', tea: teas[i], tops: tops[i], fill: 1, topT: tp, shake: 0, sizeT: 0 }, sx + i * gap, 498 - (1 - appear) * 20, 0.72, appear, true);
    }
    if (n === 0) text('今天一杯都没卖出去…', 195, 420, 16, '#fff3d6');
    // sign + ribbon
    var sIn = forImage ? 1 : easeOutBack(clamp(t / 0.4, 0, 1));
    ctx.save(); ctx.translate(195, 0); ctx.scale(sIn, sIn); ctx.translate(-195, 0);
    woodSign(195, 92, 260, 92, '今日休业', 44);
    ribbon(195, 164, 220, titleFor(S.score));
    ctx.restore();
    // stats card
    var py = 488, ph = 248;
    shadowOn(14, 5); rr(62, py, 266, ph, 14); ctx.fillStyle = C.paper; ctx.fill(); shadowOff();
    ctx.strokeStyle = '#dccaa8'; ctx.lineWidth = 1.5; rr(68, py + 6, 254, ph - 12, 10); ctx.stroke();
    var rows = [['得分', String(S.score)], ['出杯', S.served + ' 杯'], ['最高连击', '×' + S.maxCombo], ['小费', String(S.tips)], ['营业时长', formatTime(S.elapsed)]];
    rows.forEach(function (r, i) {
      var y = py + 22 + i * 36;
      text(r[0], 86, y, 17, C.ink, 'left');
      text(r[1], 304, y, 18, C.ink, 'right');
      ctx.setLineDash([3, 4]); ctx.strokeStyle = '#d2bf9c'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(84, y + 16); ctx.lineTo(306, y + 16); ctx.stroke(); ctx.setLineDash([]);
    });
    text('超过了 ' + percentFor(S.score) + '% 的店长', 195, py + 210, 15, C.inkSoft, 'center', false);
    if (S.newBest) {
      ctx.save(); ctx.translate(300, py + 4); ctx.rotate(0.18);
      rr(-36, -14, 72, 28, 14); ctx.fillStyle = C.coral; ctx.fill();
      text('新纪录', 0, 1, 14, '#fff'); ctx.restore();
    } else if (S.best > 0) {
      text('最佳 ' + S.best, 195, py + 230, 12, '#a08a70', 'center', false);
    }
    if (forImage) {
      rr(70, 752, 250, 40, 20); ctx.fillStyle = 'rgba(251,245,232,0.92)'; ctx.fill();
      text('忙碌奶茶店 · 来挑战我的分数', 195, 772, 15, C.ink);
    }
  }
  function drawResult() {
    drawResultScene(false);
    var a = clamp((S.resultT - 0.5) / 0.3, 0, 1);
    ctx.save(); ctx.globalAlpha = a;
    bigButton(UI_BTN.save, 'save', '保存图片', C.coral, C.coralDark);
    bigButton(UI_BTN.again, 'again', '再来一局', C.sage, C.sageDark);
    ctx.restore();
    drawFx();
  }

  // ---------- save image ----------
  var saving = false;
  function renderCardDataURL() {
    var k = 2, c = document.createElement('canvas');
    c.width = LW * k; c.height = LH * k;
    var prev = ctx; ctx = c.getContext('2d');
    ctx.scale(k, k);
    drawResultScene(true);
    ctx = prev;
    return c.toDataURL('image/jpeg', 0.9);
  }
  function showToast(s) { hint(s); }
  function saveResultImage() {
    if (saving) return;
    saving = true;
    var url;
    try { url = renderCardDataURL(); } catch (e) { saving = false; showToast('图片生成失败'); return; }
    var m = mini();
    getBuildVersion().then(function (bv) {
      if (m && typeof m.saveImageToPhotosAlbum === 'function' && atLeast(bv, 9420)) {
        var p = (typeof m.writeTempFile === 'function')
          ? Promise.resolve().then(function () { return m.writeTempFile({ data: url }); }).then(function (r) { return r.filePath; }).catch(function () { return url; })
          : Promise.resolve(url);
        return p.then(function (fp) { return m.saveImageToPhotosAlbum({ filePath: fp }); })
          .then(function () { showToast('已保存到相册'); })
          .catch(function () { showToast('保存失败，请检查相册权限'); });
      }
      // browser / old-client fallback: show image for long-press save
      var modal = document.getElementById('saveModal');
      document.getElementById('saveImg').src = url;
      modal.className = 'modal';
    }).then(function () { saving = false; }, function () { saving = false; });
  }
  document.getElementById('saveClose').addEventListener('click', function () {
    document.getElementById('saveModal').className = 'modal hidden';
  });

  // ---------- visibility pause ----------
  document.addEventListener('visibilitychange', function () { S.paused = document.hidden; last = 0; });

  // ---------- main loop ----------
  var last = 0, clock = 0;
  function frame(ts) {
    var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
    last = ts;
    if (debug && window.__speed) dt *= window.__speed;
    clock += dt;
    if (S.screen === 'loading' && loaded >= toLoad.length) S.screen = 'start';
    update(dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#3b2a1e'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offX, dpr * offY);
    if (S.screen === 'loading') {
      ctx.fillStyle = '#e9d8b8'; ctx.fillRect(0, 0, LW, LH);
      text('奶茶店开门中…', 195, 420, 18, C.ink);
      var pw = 200 * (loaded / toLoad.length);
      rr(95, 446, 200, 10, 5); ctx.fillStyle = '#d6c09c'; ctx.fill();
      rr(95, 446, Math.max(10, pw), 10, 5); ctx.fillStyle = C.sage; ctx.fill();
    } else if (S.screen === 'start') drawStart(clock);
    else if (S.screen === 'play') drawPlay();
    else drawResult();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // test hook (only with ?debug)
  if (debug) {
    window.__mt = {
      S: S, start: startGame, serveFirst: function () {
        var c = null; S.customers.forEach(function (x) { if (x && x.state !== 'happy' && x.state !== 'angry' && (!c || x.id < c.id)) c = x; });
        if (!c) return false;
        if (c.order.tops.indexOf('珍珠') >= 0 && (S.pot.state !== 'ready' || S.pot.servings < 1)) {
          S.pot.state = 'ready'; S.pot.servings = Math.max(S.pot.servings, POT_SERVINGS); S.pot.t = BOIL_TIME;
        }
        if (c.order.tea === '柠檬水' && (S.board.state !== 'ready' || S.board.servings < 1)) {
          S.board.state = 'ready'; S.board.servings = Math.max(S.board.servings, LEMON_SERVINGS); S.board.t = CHOP_TIME;
        }
        chooseSize(c.order.size); chooseTea(c.order.tea); c.order.tops.forEach(function (t) { toggleTop(t); }); serve(); return true;
      },
      boil: tapPot, chop: tapBoard, buttons: function () { return BTN; },
      tap: onTap, end: endGame
    };
  }
})();
