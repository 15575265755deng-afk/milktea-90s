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
    ink: '#4a3324', inkSoft: '#7a5a42', gold: '#e3b04b', goldLite: '#ffe696'
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
  var ART = ['红茶', '绿茶', '奶茶', '柠檬水', '珍珠', '椰果', '布丁', '大杯', '中杯'];
  var IMG = {}, loaded = 0, toLoad = ['bg'].concat(KINDS).concat(ART);
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
    var ghost = !cup.size;
    if (ghost) cup = { size: '中杯', tea: null, tops: [], fill: 0, topT: {}, shake: cup.shake, sizeT: 0 };
    if (ghost) ctx.globalAlpha *= 0.72;

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
  // ---------- state ----------
  var S = {
    screen: 'loading', // loading | start | play | result
    t: 0, elapsed: 0, score: 0, served: 0, combo: 0, maxCombo: 0, tips: 0, mistakes: 0, lost: 0,
    lives: MAX_LIVES, lifeFlash: 0, ending: 0,
    customers: [null, null, null], spots: [null, null, null], spotShake: [0, 0, 0], tileShake: {},
    drag: null, snaps: [], stamp: 0, nextSpawn: 0, uid: 0,
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
    S.customers = [null, null, null]; S.spots = [null, null, null]; S.spotShake = [0, 0, 0]; S.tileShake = {};
    S.drag = null; S.snaps = []; S.stamp = 0;
    S.nextSpawn = 0.4; S.floats = []; S.parts = []; S.flying = [];
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

  function loseLife(msg, x, y, kind) {
    if (S.ending > 0 || S.lives <= 0) return;
    S.lives--; S.combo = 0; S.lifeFlash = 0.8;
    addFloat('店命 -1', x == null ? 80 : x, y == null ? 70 : y, C.coral, 20);
    if (kind === 'angry') sfx.angry(); else sfx.wrong();
    vibrate();
    if (msg) hint(msg);
    if (S.lives <= 0) S.ending = 1.0;
  }
  function sameOrder(cup, o) {
    if (cup.size !== o.size || cup.tea !== o.tea || cup.tops.length !== o.tops.length) return false;
    for (var i = 0; i < o.tops.length; i++) if (cup.tops.indexOf(o.tops[i]) < 0) return false;
    return true;
  }

  var UI_BTN = {
    mute: { x: 336, y: 62, w: 44, h: 36 },
    start: { x: 55, y: 764, w: 280, h: 52 },
    save: { x: 30, y: 748, w: 156, h: 56 },
    again: { x: 204, y: 748, w: 156, h: 56 },
    startMute: { x: 330, y: 20, w: 44, h: 36 }
  };
  function hit(b, x, y) { return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; }
  function press(id) { S.btnPress[id] = 0.18; }
  function pressScale(id) { var p = S.btnPress[id] || 0; return p > 0 ? 1 - Math.sin(p / 0.18 * Math.PI) * 0.07 : 1; }

  // ---------- input ----------
  function toLogical(e) {
    return { x: (e.clientX - cLeft - offX) / scale, y: (e.clientY - cTop - offY) / scale };
  }
  function toggleMute() {
    muted = !muted; setLocalData('milktea_muted', { muted: muted });
    if (!muted) sfx.tap();
  }
  function handleUiTap(x, y) {
    if (S.screen === 'start') {
      if (hit(UI_BTN.startMute, x, y)) { press('startMute'); toggleMute(); return true; }
      if (hit(UI_BTN.start, x, y) || y > 300) { press('start'); startGame(); return true; }
      return true;
    }
    if (S.screen === 'result') {
      if (S.resultT < 0.6) return true;
      if (hit(UI_BTN.save, x, y)) { press('save'); sfx.tap(); saveResultImage(); return true; }
      if (hit(UI_BTN.again, x, y)) { press('again'); startGame(); return true; }
      return true;
    }
    if (S.screen !== 'play') return true;
    if (hit(UI_BTN.mute, x, y)) { press('mute'); toggleMute(); return true; }
    if (S.ending > 0) return true;
    if (trashHit(x, y, false)) { tapTrash(); return true; }
    return false;
  }
  function pointerDown(x, y, pid, ev) {
    audio();
    if (S.drag) return; // one drag at a time
    if (handleUiTap(x, y)) return;
    if (S.screen !== 'play' || S.ending > 0) return;
    var si = spotCupAt(x, y);
    if (si >= 0) beginDrag('cup', null, si, x, y, pid);
    else {
      var it = itemAt(x, y);
      if (!it) return;
      beginDrag('item', it.name, -1, x, y, pid);
    }
    if (ev && ev.pointerId != null && canvas.setPointerCapture) {
      try { canvas.setPointerCapture(ev.pointerId); } catch (err) {}
    }
  }
  function samePid(pid) { return S.drag && (pid == null || S.drag.pid == null || pid === S.drag.pid); }
  function pointerMove(x, y, pid) { if (samePid(pid)) moveDrag(x, y); }
  function pointerUp(pid) { if (samePid(pid)) endDrag(); }
  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    var p = toLogical(e);
    pointerDown(p.x, p.y, e.pointerId, e);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!S.drag) return;
    e.preventDefault();
    var p = toLogical(e);
    pointerMove(p.x, p.y, e.pointerId);
  });
  canvas.addEventListener('pointerup', function (e) {
    e.preventDefault();
    if (S.drag) { var p = toLogical(e); pointerMove(p.x, p.y, e.pointerId); }
    pointerUp(e.pointerId);
  });
  canvas.addEventListener('pointercancel', function (e) {
    pointerUp(e.pointerId);
  });
  if (!window.PointerEvent) {
    canvas.addEventListener('touchstart', function (e) {
      e.preventDefault();
      var t = e.changedTouches[0]; var p = toLogical(t);
      pointerDown(p.x, p.y, t.identifier, null);
    }, { passive: false });
    canvas.addEventListener('touchmove', function (e) {
      if (!S.drag) return;
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i]; var p = toLogical(t);
        pointerMove(p.x, p.y, t.identifier);
      }
    }, { passive: false });
    canvas.addEventListener('touchend', function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i]; var p = toLogical(t);
        pointerMove(p.x, p.y, t.identifier);
        pointerUp(t.identifier);
      }
    }, { passive: false });
    canvas.addEventListener('touchcancel', function (e) {
      var t = e.changedTouches[0];
      pointerUp(t ? t.identifier : null);
    }, { passive: false });
    canvas.addEventListener('mousedown', function (e) {
      var p = toLogical(e); pointerDown(p.x, p.y, 1, null);
    });
    window.addEventListener('mousemove', function (e) {
      if (!S.drag) return;
      var p = toLogical(e); pointerMove(p.x, p.y, 1);
    });
    window.addEventListener('mouseup', function (e) { var p = toLogical(e); pointerMove(p.x, p.y, 1); pointerUp(1); });
  }

  function onTap(x, y) { handleUiTap(x, y); }

  function startGame() {
    resetGame(); S.screen = 'play'; sfx.start(); hint('先把杯子拖到杯位');
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
    S.snaps = S.snaps.filter(function (sn) { sn.t += dt; return sn.t < sn.dur; });
    for (k in S.tileShake) if (S.tileShake[k] > 0) S.tileShake[k] -= dt;
    if (S.drag) {
      var dh = S.drag.hist; dh.push({ x: S.drag.x, y: S.drag.y, t: clock });
      while (dh.length > 2 && clock - dh[1].t > 0.3) dh.shift();
    }
    if (S.hint) { S.hint.t += dt; if (S.hint.t > 1.3) S.hint = null; }
    if (S.screen === 'result') { S.resultT += dt; return; }
    if (S.screen !== 'play' || S.paused) return;

    if (S.lifeFlash > 0) S.lifeFlash -= dt;
    if (S.ending > 0) {
      S.ending -= dt; S.drag = null;
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
    for (var si = 0; si < 3; si++) {
      if (S.spotShake[si] > 0) S.spotShake[si] -= dt;
      var cup = S.spots[si]; if (!cup) continue;
      if (cup.tea && cup.fill < 1) cup.fill = Math.min(1, cup.fill + dt / 0.28);
      if (cup.sizeT > 0) cup.sizeT -= dt;
      cup.tops.forEach(function (t) { cup.topT[t] = (cup.topT[t] || 0) + dt; });
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
      if (c.shakeT > 0) c.shakeT -= dt;
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

  // ---------- drag workbench: layout ----------
  var BENCH = { top: 436, front: 560, bot: 588, bx0: 26, bx1: 364, fx0: 6, fx1: 384 };
  var SPOTS = [{ x: 84, y: 520 }, { x: 195, y: 520 }, { x: 306, y: 520 }];
  var SHELF = { y0: 600, y1: 840 };
  var ITEMS = [];
  function defItems() {
    ITEMS = [
      { name: '大杯', kind: 'size', x: 102, y: 668, w: 140, h: 56 },
      { name: '中杯', kind: 'size', x: 256, y: 668, w: 140, h: 56 }
    ];
    TEAS.forEach(function (n, i) { ITEMS.push({ name: n, kind: 'tea', x: 62 + 89 * i, y: 736, w: 80, h: 60 }); });
    TOPS.forEach(function (n, i) { ITEMS.push({ name: n, kind: 'top', x: 84 + 111 * i, y: 804, w: 96, h: 60 }); });
  }
  defItems();
  var TRASH = { x: 357, y: 668, w: 38, h: 52 };
  var MAX_TOPS = 2;
  function inBox(b, x, y, pad) {
    pad = pad || 0;
    return x >= b.x - b.w / 2 - pad && x <= b.x + b.w / 2 + pad && y >= b.y - b.h / 2 - pad && y <= b.y + b.h / 2 + pad;
  }
  function itemAt(x, y) {
    for (var i = 0; i < ITEMS.length; i++) if (inBox(ITEMS[i], x, y, 3)) return ITEMS[i];
    return null;
  }
  function itemByName(n) {
    for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].name === n) return ITEMS[i];
    return null;
  }
  function itemKind(n) {
    if (SIZES.indexOf(n) >= 0) return 'size';
    if (TEAS.indexOf(n) >= 0) return 'tea';
    return 'top';
  }
  // drop target: nearest spot column inside the counter area
  function spotAt(x, y) {
    if (y < 396 || y > 596) return -1;
    var best = -1, bd = 1e9;
    for (var i = 0; i < 3; i++) {
      var d = Math.abs(x - SPOTS[i].x);
      if (d <= 58 && d < bd) { bd = d; best = i; }
    }
    return best;
  }
  // grab a finished/in-progress cup from a spot
  function spotCupAt(x, y) {
    for (var i = 0; i < 3; i++) {
      var s = SPOTS[i];
      if (S.spots[i] && Math.abs(x - s.x) <= 48 && y >= s.y - 112 && y <= s.y + 30) return i;
    }
    return -1;
  }
  function trashHit(x, y, generous) { return inBox(TRASH, x, y, generous ? 16 : 4); }
  function activeCustomer(c) { return c && (c.state === 'wait' || c.state === 'enter'); }
  function customerAt(x, y) {
    if (y < 136 || y > 446) return null;
    var best = null, bd = 1e9;
    for (var i = 0; i < 3; i++) {
      var c = S.customers[i]; if (!activeCustomer(c)) continue;
      var d = Math.abs(x - SLOT_X[i]);
      if (d <= 64 && d < bd) { bd = d; best = c; }
    }
    return best;
  }
  function cupMatchesAny(cup) {
    if (!cup || !cup.tea) return false;
    for (var i = 0; i < 3; i++) if (activeCustomer(S.customers[i]) && sameOrder(cup, S.customers[i].order)) return true;
    return false;
  }

  // ---------- drag workbench: rules ----------
  function canDrop(name, i) {
    var cup = S.spots[i], k = itemKind(name);
    if (k === 'size') return cup ? '这里已经有杯子了' : '';
    if (!cup) return '先放杯子';
    if (k === 'tea') return cup.tea ? '已经有茶底了' : '';
    if (!cup.tea) return '先加茶底';
    if (cup.tops.indexOf(name) >= 0) return '已经加过' + name + '了';
    if (cup.tops.length >= MAX_TOPS) return '最多加两种小料';
    return '';
  }
  function applyDrop(name, i) {
    var k = itemKind(name), cup = S.spots[i];
    if (k === 'size') {
      cup = newCup(); cup.size = name; cup.sizeT = 0.25; S.spots[i] = cup; sfx.tap();
    } else if (k === 'tea') {
      cup.tea = name; cup.fill = 0; sfx.pour();
    } else {
      cup.tops.push(name); cup.topT[name] = 0; sfx.drop();
    }
    cup.last = name; cup.stamp = ++S.stamp;
    if (cupMatchesAny(cup)) burst(SPOTS[i].x, SPOTS[i].y - 50, C.goldLite, 6);
  }
  function snapBack(d, msg, shakeSpot) {
    var x1, y1;
    if (d.kind === 'item') { var it = itemByName(d.name); x1 = it.x; y1 = it.y - 6; S.tileShake[d.name] = 0.35; }
    else { x1 = SPOTS[d.spot].x; y1 = SPOTS[d.spot].y - 40; }
    S.snaps.push({ kind: d.kind, name: d.name, cup: d.cup, spot: d.spot, x0: d.x, y0: d.y, x1: x1, y1: y1, t: 0, dur: 0.2 });
    if (shakeSpot != null && shakeSpot >= 0) S.spotShake[shakeSpot] = 0.35;
    if (d.kind === 'cup' && shakeSpot == null) S.spotShake[d.spot] = 0.3;
    if (msg) { hint(msg); sfx.wrong(); vibrate(); }
  }
  function discardSpot(i, x, y) {
    var cup = S.spots[i]; if (!cup) return;
    S.flying.push({ cup: cup, x0: x == null ? SPOTS[i].x : x, y0: y == null ? SPOTS[i].y : y, x1: TRASH.x, y1: TRASH.y + 30, t: 0, dur: 0.32, trash: true });
    S.spots[i] = null; press('trash'); sfx.trash();
  }
  function tapTrash() {
    var best = -1;
    for (var i = 0; i < 3; i++) if (S.spots[i] && (best < 0 || S.spots[i].stamp > S.spots[best].stamp)) best = i;
    press('trash');
    if (best < 0) { hint('杯位都是空的'); sfx.tap(); return; }
    discardSpot(best);
    hint('清掉了 ' + (best + 1) + ' 号杯位');
  }
  function serveCup(i, target, x, y) {
    var cup = S.spots[i];
    S.spots[i] = null;
    if (!sameOrder(cup, target.order)) { // wrong drink: discard + lose a life
      S.mistakes++;
      S.flying.push({ cup: cup, x0: x, y0: y, x1: x < 195 ? 20 : 370, y1: 900, t: 0, dur: 0.45, trash: true });
      target.shakeT = 0.5;
      loseLife('点的不是这杯', SLOT_X[target.slot], 300, 'wrong');
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
    S.flying.push({ cup: cup, x0: x, y0: y, x1: tx, y1: 380, t: 0, dur: 0.22 });
    addFloat('+' + gain, tx, 252, C.gold, 24);
    if (tip >= 20) addFloat('小费 +' + tip, tx, 278, '#fff3d6', 15);
    if (S.combo >= 2) { addFloat('连击 ×' + S.combo, 195, 400, '#fff3d6', 20); S.comboPop = 0.35; }
    burst(tx, 330, C.gold, 14); burst(tx, 330, C.sageLight, 8);
    coinsTo(tx, 320, Math.min(6, 2 + Math.floor(gain / 30)));
    S.coinPop = 0.3;
    sfx.serve(); sfx.coin();
  }

  // ---------- drag workbench: pointer ----------
  function beginDrag(kind, name, spot, x, y, pid) {
    S.drag = { kind: kind, name: name, spot: spot, cup: spot >= 0 ? S.spots[spot] : null, x: x, y: y, x0: x, y0: y, pid: pid == null ? 1 : pid, hist: [{ x: x, y: y, t: clock }], moved: 0 };
    if (kind === 'cup') sfx.tap();
  }
  function moveDrag(x, y) {
    var d = S.drag; if (!d) return;
    d.moved = Math.max(d.moved, Math.abs(x - d.x0) + Math.abs(y - d.y0));
    d.x = x; d.y = y;
  }
  function endDrag() {
    var d = S.drag; if (!d) return;
    S.drag = null;
    if (S.screen !== 'play' || S.ending > 0) return;
    if (d.kind === 'item') {
      var i = spotAt(d.x, d.y);
      if (i < 0) {
        if (d.moved < 10) { snapBack(d, null); hint('按住拖到上面的杯位'); sfx.tap(); }
        else snapBack(d, null);
        return;
      }
      var why = canDrop(d.name, i);
      if (why) { snapBack(d, why, i); return; }
      applyDrop(d.name, i);
      return;
    }
    // cup
    var cup = S.spots[d.spot];
    if (!cup) return;
    if (trashHit(d.x, d.y, true)) { discardSpot(d.spot, d.x, d.y); return; }
    var c = customerAt(d.x, d.y);
    if (c) {
      if (!cup.tea) { snapBack(d, '还没做完哦'); return; }
      serveCup(d.spot, c, d.x, d.y);
      return;
    }
    var j = spotAt(d.x, d.y);
    if (j >= 0 && j !== d.spot && !S.spots[j]) { // move cup to an empty spot
      S.spots[j] = cup; S.spots[d.spot] = null; cup.stamp = ++S.stamp; sfx.tap();
      return;
    }
    snapBack(d, null);
  }
  function dragHover() {
    var d = S.drag; if (!d) return { spot: -1, cust: null, trash: false };
    if (d.kind === 'item') return { spot: spotAt(d.x, d.y), cust: null, trash: false };
    var tr = trashHit(d.x, d.y, true);
    return { spot: -1, cust: tr ? null : customerAt(d.x, d.y), trash: tr };
  }

  // ---------- drag workbench: drawing ----------
  var CUP_GEOM = {};
  function cupGeom(size) {
    if (CUP_GEOM[size] !== undefined) return CUP_GEOM[size];
    if (!imgReady(size)) return null;
    var im = IMG[size], w = im.naturalWidth, h = im.naturalHeight, g = null;
    try {
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      var cx = cv.getContext('2d'); cx.drawImage(im, 0, 0);
      var px = cx.getImageData(0, 0, w, h).data;
      var rows = [], last = 0, y, x, i;
      for (y = 0; y < h; y++) {
        var x0 = -1, x1 = -1;
        for (x = 0; x < w; x++) { if (px[(y * w + x) * 4 + 3] > 40) { if (x0 < 0) x0 = x; x1 = x; } }
        rows.push([x0, x1]); if (x0 >= 0) last = y;
      }
      var bodyTop = Math.round(h * (size === '大杯' ? 0.36 : 0.35)), bodyBot = Math.round(last - h * 0.035);
      var straw = document.createElement('canvas'); straw.width = w; straw.height = h;
      var sx = straw.getContext('2d'), sd = sx.createImageData(w, h);
      for (y = bodyTop; y < h; y++) for (x = 0; x < w; x++) {
        i = (y * w + x) * 4;
        var r = px[i], gg = px[i + 1], b = px[i + 2];
        if (px[i + 3] > 60 && r > gg + 50 && r > b + 50) { sd.data[i] = r; sd.data[i + 1] = gg; sd.data[i + 2] = b; sd.data[i + 3] = px[i + 3]; }
      }
      sx.putImageData(sd, 0, 0);
      g = { w: w, h: h, rows: rows, top: bodyTop, bot: bodyBot, last: last, straw: straw };
    } catch (e) { g = false; }
    CUP_GEOM[size] = g;
    return g;
  }
  function cupHeight(size) { return size === '大杯' ? 102 : 86; }
  // hand-painted cup with tea + toppings inside; bottom of the cup at (cx, by)
  function drawArtCup(cup, cx, by, sc, alpha) {
    var g = cup && cup.size ? cupGeom(cup.size) : null;
    if (!g) { if (cup && cup.size) drawCup(cup, cx, by, 0.6 * (sc || 1), alpha, false); return; }
    var k = cupHeight(cup.size) / g.last * (sc || 1);
    var pop = cup.sizeT > 0 ? 1 + Math.sin(cup.sizeT / 0.25 * Math.PI) * 0.08 : 1;
    ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.translate(cx, by); ctx.scale(k * pop, k * pop); ctx.translate(-g.w / 2, -g.last);
    ctx.fillStyle = 'rgba(50,28,12,0.32)';
    ctx.beginPath(); ctx.ellipse ? ctx.ellipse(g.w / 2, g.last - 2, g.w * 0.42, 10, 0, 0, Math.PI * 2) : ctx.arc(g.w / 2, g.last - 2, g.w * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(IMG[cup.size], 0, 0);
    var inset = 6, y, r;
    function bodyPath(yTop) {
      yTop = Math.max(g.top, Math.round(yTop));
      ctx.beginPath();
      var started = false;
      for (y = g.bot; y >= yTop; y -= 2) { r = g.rows[y]; if (r[0] < 0) continue; if (!started) { ctx.moveTo(r[0] + inset, y); started = true; } else ctx.lineTo(r[0] + inset, y); }
      for (y = yTop; y <= g.bot; y += 2) { r = g.rows[y]; if (r[0] < 0) continue; ctx.lineTo(r[1] - inset, y); }
      ctx.closePath();
    }
    var span = g.bot - g.top;
    if (cup.tea) {
      var lvl = g.bot - span * 0.84 * cup.fill;
      ctx.save(); bodyPath(lvl); ctx.clip();
      ctx.globalAlpha *= 0.88;
      ctx.fillStyle = TEA_COLOR[cup.tea]; ctx.fillRect(0, lvl, g.w, g.bot - lvl + 2);
      ctx.globalAlpha /= 0.88;
      if (cup.tea === '奶茶') { ctx.fillStyle = 'rgba(255,245,225,0.35)'; ctx.fillRect(0, lvl, g.w, span * 0.1); }
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(0, lvl, g.w, 4);
      if (cup.tea === '柠檬水' && cup.fill > 0.5) {
        for (var li = 0; li < 2; li++) {
          var lx = g.w * (0.36 + li * 0.3), ly = lvl + 16;
          ctx.fillStyle = '#f6e27a'; ctx.beginPath(); ctx.arc(lx, ly, 11, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#c9b04a'; ctx.lineWidth = 2; ctx.stroke();
          ctx.strokeStyle = 'rgba(180,140,40,0.6)'; ctx.beginPath(); ctx.moveTo(lx - 7, ly); ctx.lineTo(lx + 7, ly); ctx.moveTo(lx, ly - 7); ctx.lineTo(lx, ly + 7); ctx.stroke();
        }
      }
      ctx.restore();
    }
    if (cup.tops.length) {
      ctx.save(); bodyPath(g.top); ctx.clip();
      var layer = 0, a0 = ctx.globalAlpha;
      cup.tops.forEach(function (t) {
        var at = clamp((cup.topT[t] || 0) / 0.3, 0, 1), drop = (1 - at) * 60;
        var base = g.bot - 2 - layer * 26 - drop;
        var rw = g.rows[Math.min(g.bot, Math.max(g.top, Math.round(base)))] || [10, g.w - 10];
        var xl = rw[0] + inset + 4, xr = rw[1] - inset - 4, wd = xr - xl;
        ctx.globalAlpha = a0 * (0.35 + 0.65 * at);
        if (t === '珍珠') {
          for (var rr2 = 0; rr2 < 2; rr2++) for (var j = 0; j < 6; j++) {
            var px2 = xl + 5 + j * ((wd - 10) / 5) + (rr2 % 2) * 6, py2 = base - 6 - rr2 * 11;
            ctx.fillStyle = '#2b1d16'; ctx.beginPath(); ctx.arc(px2, py2, 6.2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.arc(px2 - 2, py2 - 2, 1.8, 0, Math.PI * 2); ctx.fill();
          }
        } else if (t === '椰果') {
          for (var r3 = 0; r3 < 2; r3++) for (var j3 = 0; j3 < 5; j3++) {
            var qx = xl + 6 + j3 * ((wd - 12) / 4) + (r3 % 2) * 6, qy = base - 7 - r3 * 11;
            ctx.save(); ctx.translate(qx, qy); ctx.rotate((j3 + r3) * 0.5);
            ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(-5, -5, 10, 10);
            ctx.strokeStyle = 'rgba(170,190,200,0.95)'; ctx.lineWidth = 1.4; ctx.strokeRect(-5, -5, 10, 10);
            ctx.restore();
          }
        } else if (t === '布丁') {
          ctx.fillStyle = '#f0c35a'; rr(xl, base - 22, wd, 22, 6); ctx.fill();
          ctx.fillStyle = '#9a5424'; rr(xl, base - 22, wd, 7, 4); ctx.fill();
        }
        layer++;
      });
      ctx.restore();
    }
    if (cup.tea || cup.tops.length) { ctx.globalAlpha *= 0.9; ctx.drawImage(g.straw, 0, 0); }
    ctx.restore();
  }

  // static bench + shelf, rendered once into an offscreen canvas
  var benchCache = null, benchK = 0;
  var BENCH_Y0 = 428;
  function seeded(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  function woodTex(w, h, base, stripe, contrast, seed, gradA, gradB) {
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    var g = cv.getContext('2d'), im = g.createImageData(w, h), d = im.data, rnd = seeded(seed);
    var ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
    var nx = new Array(w);
    for (var x = 0; x < w; x++) {
      var n = 0;
      for (var q = 0; q < 4; q++) n += Math.sin(x / w * 6.28 * (q + 1) * 0.6 + ph[q]) * (6 / (q + 1)) * (h / 120);
      nx[x] = n;
    }
    for (var y = 0; y < h; y++) {
      var lt = gradA + (gradB - gradA) * (y / Math.max(1, h - 1));
      for (var x2 = 0; x2 < w; x2++) {
        var v = Math.sin((y + nx[x2]) / stripe * Math.PI) * 0.5 + 0.5; v = v * v * v;
        var f = (rnd() - 0.5) * 6;
        var i = (y * w + x2) * 4;
        d[i] = clamp((base[0] - v * contrast + f) * lt, 0, 255);
        d[i + 1] = clamp((base[1] - v * contrast + f) * lt, 0, 255);
        d[i + 2] = clamp((base[2] - v * contrast + f) * lt, 0, 255);
        d[i + 3] = 255;
      }
    }
    g.putImageData(im, 0, 0);
    return cv;
  }
  function buildBench(k) {
    var cv = document.createElement('canvas');
    cv.width = Math.round(LW * k); cv.height = Math.round((LH - BENCH_Y0) * k);
    var prev = ctx; ctx = cv.getContext('2d');
    ctx.scale(k, k); ctx.translate(0, -BENCH_Y0);
    var B = BENCH;
    // dark wood floor behind the bench
    ctx.fillStyle = '#583a25'; ctx.fillRect(0, BENCH_Y0, LW, LH - BENCH_Y0);
    var sg = ctx.createLinearGradient(0, BENCH_Y0, 0, B.top + 6);
    sg.addColorStop(0, 'rgba(40,24,14,0.0)'); sg.addColorStop(1, 'rgba(40,24,14,0.55)');
    ctx.fillStyle = sg; ctx.fillRect(0, BENCH_Y0, LW, B.top + 6 - BENCH_Y0);
    // drop shadow under the bench
    ctx.save(); ctx.shadowColor = 'rgba(20,10,4,0.75)'; ctx.shadowBlur = 14 * k; ctx.shadowOffsetY = 6 * k;
    ctx.fillStyle = '#3a2416'; rr(B.fx0, B.bot - 14, B.fx1 - B.fx0, 16, 8); ctx.fill(); ctx.restore();
    // counter top in perspective (row by row)
    var tw = Math.round((B.fx1 - B.fx0) * k), th = Math.round((B.front - B.top) * k);
    var tex = woodTex(tw, th, [196, 142, 92], 7 * k, 26, 3, 0.86, 1.05);
    for (var y = 0; y < th; y++) {
      var t = y / Math.max(1, th - 1);
      var x0 = B.bx0 + (B.fx0 - B.bx0) * t, x1 = B.bx1 + (B.fx1 - B.bx1) * t;
      ctx.drawImage(tex, 0, y, tw, 1, x0, B.top + y / k, x1 - x0, 1 / k + 0.02);
    }
    // back rim
    ctx.fillStyle = '#96643e';
    ctx.beginPath(); ctx.moveTo(B.bx0, B.top); ctx.lineTo(B.bx1, B.top); ctx.lineTo(B.bx1 + 1, B.top + 6); ctx.lineTo(B.bx0 - 1, B.top + 6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#d6a876'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(B.bx0, B.top); ctx.lineTo(B.bx1, B.top); ctx.stroke();
    // side bevels
    ctx.fillStyle = '#785032';
    ctx.beginPath(); ctx.moveTo(B.bx0, B.top); ctx.lineTo(B.fx0, B.front); ctx.lineTo(B.fx0 - 3, B.front); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(B.bx1, B.top); ctx.lineTo(B.fx1, B.front); ctx.lineTo(B.fx1 + 3, B.front); ctx.closePath(); ctx.fill();
    // front face
    var fw = Math.round((B.fx1 - B.fx0) * k), fh = Math.round((B.bot - B.front) * k);
    var ftex = woodTex(fw, fh, [140, 92, 56], 5 * k, 20, 9, 1.0, 0.86);
    ctx.save(); rr(B.fx0, B.front - 10, B.fx1 - B.fx0, B.bot - B.front + 10, 8); ctx.clip();
    ctx.drawImage(ftex, B.fx0, B.front, B.fx1 - B.fx0, B.bot - B.front); ctx.restore();
    ctx.strokeStyle = '#ecc492'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(B.fx0, B.front); ctx.lineTo(B.fx1, B.front); ctx.stroke();
    ctx.strokeStyle = '#644028'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(B.fx0 + 4, B.front + 3); ctx.lineTo(B.fx1 - 4, B.front + 3); ctx.stroke();
    var lg = ctx.createLinearGradient(0, B.front + 3, 0, B.front + 10);
    lg.addColorStop(0, 'rgba(40,22,10,0.4)'); lg.addColorStop(1, 'rgba(40,22,10,0)');
    ctx.fillStyle = lg; ctx.fillRect(B.fx0, B.front + 3, B.fx1 - B.fx0, 7);
    // brass number plates
    SPOTS.forEach(function (s, i) {
      var fx = s.x + (s.x - 195) * 0.06;
      rr(fx - 11, B.front + 8, 22, B.bot - B.front - 13, 4); ctx.fillStyle = '#deb462'; ctx.fill();
      ctx.strokeStyle = '#a07636'; ctx.lineWidth = 1; ctx.stroke();
      text(String(i + 1), fx, (B.front + B.bot) / 2 + 1.5, 11, '#5c3c1e');
    });
    // ingredient shelf
    ctx.save(); ctx.shadowColor = 'rgba(30,18,10,0.5)'; ctx.shadowBlur = 8 * k; ctx.shadowOffsetY = 3 * k;
    rr(8, SHELF.y0, LW - 16, SHELF.y1 - SHELF.y0, 22); ctx.fillStyle = '#765032'; ctx.fill(); ctx.restore();
    ctx.strokeStyle = '#563822'; ctx.lineWidth = 2; rr(8, SHELF.y0, LW - 16, SHELF.y1 - SHELF.y0, 22); ctx.stroke();
    rr(14, SHELF.y0 + 6, LW - 28, SHELF.y1 - SHELF.y0 - 12, 18); ctx.fillStyle = '#f5e8cf'; ctx.fill();
    ctx.fillStyle = 'rgba(255,250,235,0.45)'; rr(20, SHELF.y0 + 9, LW - 40, 9, 5); ctx.fill();
    text('食材拖到杯位，做好拖给客人', 195, SHELF.y0 + 22, 13, C.ink);
    ctx = prev;
    return cv;
  }
  function drawBench() {
    var k = clamp(Math.ceil(dpr * scale * 2) / 2, 1.5, 3);
    if (!benchCache || benchK !== k) {
      try { benchCache = buildBench(k); benchK = k; } catch (e) { benchCache = null; }
    }
    if (benchCache) ctx.drawImage(benchCache, 0, BENCH_Y0, LW, LH - BENCH_Y0);
    else { ctx.fillStyle = '#7a5134'; ctx.fillRect(0, BENCH_Y0, LW, LH - BENCH_Y0); }
  }
  function tagPill(cx, cy, s, fill, fg) {
    ctx.font = font(10.5, true); var w = ctx.measureText(s).width + 16;
    ctx.save(); shadowOn(4, 1); rr(cx - w / 2, cy - 9, w, 18, 9); ctx.fillStyle = fill; ctx.fill(); shadowOff(); ctx.restore();
    text(s, cx, cy, 10.5, fg);
  }
  function drawSpot(i, cup, hidden, hover, valid, demo) {
    var s = SPOTS[i], rx = 48, ry = 18;
    var sh = S.spotShake[i] > 0 ? Math.sin(S.spotShake[i] * 60) * 4 * S.spotShake[i] / 0.35 : 0;
    var sx = s.x + sh, sy = s.y;
    ctx.save();
    ctx.fillStyle = 'rgba(60,35,18,0.28)';
    ctx.beginPath(); ctx.ellipse(sx, sy + 3, rx + 2, ry + 1, 0, 0, Math.PI * 2); ctx.fill();
    if (hover || valid) {
      var gs = hover ? (valid ? 0.85 : 0.5) : 0.25 + 0.15 * Math.sin(S.elapsed * 7);
      var gcol = hover && !valid ? '217,104,90' : '255,214,110';
      for (var q = 3; q >= 1; q--) {
        ctx.fillStyle = 'rgba(' + gcol + ',' + (gs * 0.22 * q).toFixed(3) + ')';
        ctx.beginPath(); ctx.ellipse(sx, sy, rx + 4 + q * 3, ry + 3 + q * 2, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    var empty = !cup || hidden;
    if (empty) {
      ctx.fillStyle = 'rgba(214,168,116,0.5)';
      ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(252,240,216,0.9)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(sx, sy, rx - 3, ry - 3, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      text('空杯位', sx, sy, 10.5, '#faeed6');
    } else {
      ctx.fillStyle = '#eedebe'; ctx.strokeStyle = '#b08a5c'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#d6be96'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(sx, sy, rx - 6, ry - 4, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (hover) {
      ctx.strokeStyle = valid ? C.gold : C.coral; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    if (!empty) {
      drawArtCup(cup, sx, sy + 9, 1, 1);
      var ready = demo ? demo.ready : cupMatchesAny(cup);
      if (ready) {
        var bob = Math.sin(S.elapsed * 6 + i) * 2;
        tagPill(sx + 38, 446 + bob, '做好啦 ↑', 'rgba(111,138,90,0.95)', '#fffcf0');
      } else if (cup.last) {
        tagPill(sx + 40, 458, cup.last + ' ✓', 'rgba(252,247,236,0.94)', C.inkSoft);
      }
    }
  }
  function drawTile(it, glow, dim) {
    var sh = S.tileShake[it.name] > 0 ? Math.sin(S.tileShake[it.name] * 60) * 4 * S.tileShake[it.name] / 0.35 : 0;
    var cx = it.x + sh, cy = it.y, w = it.w, h = it.h;
    if (glow) softGlow(cx, cy, w, h, C.gold, 0.45 + 0.25 * (0.5 + 0.5 * Math.sin(S.elapsed * 7)), 14);
    ctx.fillStyle = 'rgba(160,120,80,0.35)'; rr(cx - w / 2, cy - h / 2 + 3, w, h, 14); ctx.fill();
    rr(cx - w / 2, cy - h / 2, w, h, 14); ctx.fillStyle = C.paper; ctx.fill();
    ctx.strokeStyle = glow ? C.gold : '#d6c09c'; ctx.lineWidth = glow ? 2.5 : 1; ctx.stroke();
    var a = dim ? 0.3 : 1;
    if (it.kind === 'size') {
      drawArt(it.name, cx - 36, cy, it.name === '大杯' ? 40 : 36, it.name === '大杯' ? 48 : 42, a);
      text(it.name, cx + 22, cy, 15, dim ? '#b8a088' : C.ink);
      return;
    }
    drawArt(it.name, cx, cy - 7, it.kind === 'tea' ? 44 : 50, 38, a);
    text(it.name, cx, cy + 20, 11.5, dim ? '#b8a088' : C.ink);
  }
  function drawTrashBtn(hot) {
    var b = TRASH, s = pressScale('trash');
    ctx.save(); ctx.translate(b.x, b.y); ctx.scale(s, s);
    if (hot) softGlow(0, 0, b.w, b.h, C.coral, 0.8, 10);
    rr(-b.w / 2, -b.h / 2, b.w, b.h, 10); ctx.fillStyle = hot ? '#b9503f' : '#96765a'; ctx.fill();
    ctx.strokeStyle = '#6e523a'; ctx.lineWidth = 1; ctx.stroke();
    text('清', 0, -9, 11.5, '#fffcf6'); text('空', 0, 9, 11.5, '#fffcf6');
    ctx.restore();
  }
  // held item: lifted + enlarged, soft afterimages along the recent path (no line)
  function histAt(hist, age) {
    var tt = clock - age;
    for (var i = hist.length - 1; i > 0; i--) {
      var a = hist[i - 1], b = hist[i];
      if (a.t <= tt) { var q = b.t > a.t ? (tt - a.t) / (b.t - a.t) : 1; q = clamp(q, 0, 1); return { x: lerp(a.x, b.x, q), y: lerp(a.y, b.y, q) }; }
    }
    return hist.length ? { x: hist[0].x, y: hist[0].y } : null;
  }
  function drawHeldThing(kind, name, cup, x, y, alpha, sc) {
    if (kind === 'cup') { drawArtCup(cup, x, y + 44, 1.08 * sc, alpha); return; }
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.14); ctx.scale(sc, sc);
    drawArt(name, 0, 0, 66, 60, alpha);
    ctx.restore();
  }
  function drawGhostDrag(kind, name, cup, x, y, hist) {
    var ages = [0.2, 0.16, 0.12, 0.085, 0.05], alphas = [0.1, 0.15, 0.22, 0.3, 0.4];
    var ps = [], i, p;
    for (i = 0; i < ages.length; i++) ps.push(hist ? histAt(hist, ages[i]) : null);
    // soft streak
    ctx.save();
    for (i = 0; i < ps.length; i++) {
      p = ps[i]; if (!p) continue;
      var dd = Math.abs(p.x - x) + Math.abs(p.y - y); if (dd < 6) continue;
      ctx.fillStyle = 'rgba(255,246,225,' + (0.06 + i * 0.025).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, 12 + i * 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    for (i = 0; i < ps.length; i++) {
      p = ps[i]; if (!p) continue;
      if (Math.abs(p.x - x) + Math.abs(p.y - y) < 6) continue;
      drawHeldThing(kind, name, cup, p.x, p.y, alphas[i], 0.84 + 0.03 * i);
    }
    // lifted shadow + glow
    ctx.save();
    ctx.fillStyle = 'rgba(40,22,10,0.28)';
    ctx.beginPath(); ctx.ellipse(x + 4, y + (kind === 'cup' ? 52 : 34), 28, 7, 0, 0, Math.PI * 2); ctx.fill();
    var rg = ctx.createRadialGradient(x, y, 4, x, y, 46);
    rg.addColorStop(0, 'rgba(255,236,170,0.5)'); rg.addColorStop(1, 'rgba(255,236,170,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, 46, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    drawHeldThing(kind, name, cup, x, y, 1, 1);
  }
  function nextNeededName() {
    // gentle tutorial nudge: the next ingredient for the most recent unfinished cup
    var best = -1, i, c, j;
    for (i = 0; i < 3; i++) if (S.spots[i] && (best < 0 || S.spots[i].stamp > S.spots[best].stamp)) best = i;
    var focus = null;
    for (i = 0; i < 3; i++) {
      c = S.customers[i]; if (!activeCustomer(c)) continue;
      if (!focus || c.patience / c.max < focus.patience / focus.max) focus = c;
    }
    if (best < 0) return focus ? focus.order.size : null;
    var cup = S.spots[best];
    if (cupMatchesAny(cup)) return null;
    for (i = 0; i < 3; i++) {
      c = S.customers[i]; if (!activeCustomer(c)) continue;
      var o = c.order;
      if (o.size !== cup.size) continue;
      if (cup.tea && cup.tea !== o.tea) continue;
      var ok = true; for (j = 0; j < cup.tops.length; j++) if (o.tops.indexOf(cup.tops[j]) < 0) ok = false;
      if (!ok) continue;
      if (!cup.tea) return o.tea;
      for (j = 0; j < o.tops.length; j++) if (cup.tops.indexOf(o.tops[j]) < 0) return o.tops[j];
    }
    return null;
  }
  function drawWorkbench() {
    drawBench();
    var hv = dragHover(), d = S.drag;
    for (var i = 0; i < 3; i++) {
      var hidden = false;
      if (d && d.kind === 'cup' && d.spot === i) hidden = true;
      S.snaps.forEach(function (sn) { if (sn.kind === 'cup' && sn.spot === i) hidden = true; });
      var valid = false, hover = hv.spot === i;
      if (d && d.kind === 'item') valid = !canDrop(d.name, i);
      drawSpot(i, S.spots[i], hidden, hover, d && d.kind === 'item' ? valid : false);
    }
    var nudge = inTutorial() && !d ? nextNeededName() : null;
    ITEMS.forEach(function (it) {
      var held = d && d.kind === 'item' && d.name === it.name;
      var snapping = false;
      S.snaps.forEach(function (sn) { if (sn.kind === 'item' && sn.name === it.name) snapping = true; });
      drawTile(it, nudge === it.name, held || snapping);
    });
    drawTrashBtn(hv.trash);
  }
  function drawDragLayer() {
    S.snaps.forEach(function (sn) {
      var q = clamp(sn.t / sn.dur, 0, 1), e = 1 - (1 - q) * (1 - q);
      var x = lerp(sn.x0, sn.x1, e), y = lerp(sn.y0, sn.y1, e);
      if (sn.kind === 'cup') drawArtCup(sn.cup, x, y + 44, lerp(1.08, 1, e), 1);
      else { ctx.save(); ctx.translate(x, y); ctx.scale(lerp(1, 0.75, e), lerp(1, 0.75, e)); drawArt(sn.name, 0, 0, 66, 60, 1); ctx.restore(); }
    });
    var d = S.drag;
    if (d) drawGhostDrag(d.kind, d.name, d.cup, d.x, d.y, d.hist);
  }
  function drawArt(name, cx, cy, maxW, maxH, alpha) {
    var a = alpha == null ? 1 : alpha;
    if (imgReady(name)) {
      var im = IMG[name];
      var sc = Math.min(maxW / im.naturalWidth, maxH / im.naturalHeight);
      var w = im.naturalWidth * sc, h = im.naturalHeight * sc;
      ctx.save(); ctx.globalAlpha = a;
      ctx.drawImage(im, cx - w / 2, cy - h / 2, w, h);
      ctx.restore();
      return;
    }
    ctx.save(); ctx.globalAlpha = a;
    drawIcon(name, cx, cy, Math.min(maxW, maxH) * 0.55);
    ctx.restore();
  }
  function drawCounterClean() {
    var y0 = 418, y1 = 566;
    if (imgReady('bg')) {
      var im = IMG.bg, k = LH / im.naturalHeight, w = im.naturalWidth * k;
      var x = (LW - w) / 2;
      var srcY = 426 / k, srcH = 24 / k;
      ctx.drawImage(im, 0, srcY, im.naturalWidth, srcH, x, y0, w, y1 - y0);
    } else {
      ctx.fillStyle = '#8a5a38'; ctx.fillRect(0, y0, LW, y1 - y0);
    }
  }
  function softGlow(cx, cy, w, h, color, strength, radius) {
    ctx.save();
    for (var i = 4; i >= 1; i--) {
      ctx.globalAlpha = strength * (0.11 * i);
      ctx.fillStyle = color;
      var p = 3.5 * i;
      rr(cx - w / 2 - p, cy - h / 2 - p, w + 2 * p, h + 2 * p, (radius || 18) + p);
      ctx.fill();
    }
    ctx.restore();
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
    if (c.shakeT > 0) dx += Math.sin(c.shakeT * 50) * 6;
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
  function drawBubble(c, ready, hover) {
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
    if (hover === 'good' || ready) softGlow(x, by + h / 2, w, h, C.gold, hover ? 1 : 0.7 + 0.2 * Math.sin(S.elapsed * 6), 14);
    else if (hover === 'bad') softGlow(x, by + h / 2, w, h, C.coral, 0.8, 14);
    shadowOn(8, 3);
    rr(bx, by, w, h, 14); ctx.fillStyle = danger ? '#fde8e2' : C.paper; ctx.fill(); shadowOff();
    if (danger) { ctx.strokeStyle = C.coral; ctx.lineWidth = 2.2; rr(bx, by, w, h, 14); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(x - 9, by + h - 1); ctx.lineTo(x + 9, by + h - 1); ctx.lineTo(x, by + h + 11); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#e2d2b3'; ctx.lineWidth = 1.2; rr(bx, by, w, h, 14); ctx.stroke();
    if (ready || hover === 'good') { ctx.strokeStyle = C.gold; ctx.lineWidth = 2.2; rr(bx, by, w, h, 14); ctx.stroke(); }
    // text
    var o = c.order;
    ctx.fillStyle = urgent ? C.coral : C.sage; ctx.beginPath(); ctx.arc(bx + 12, by + 16, 4.5, 0, Math.PI * 2); ctx.fill();
    fitText(o.size + ' ' + o.tea + (o.tops.length ? ' ' + o.tops.join('+') : ''), x + 6, by + 16, w - 26, 13.5, C.ink, true);
    if (danger) {
      ctx.fillStyle = C.coral; rr(bx + w - 32, by - 11, 28, 16, 8); ctx.fill();
      text('急', bx + w - 18, by - 3, 11, '#fff');
    }
    // icons
    var icons = [o.tea].concat(o.tops), n = icons.length, gap = 34, sx = x - (n - 1) * gap / 2;
    icons.forEach(function (ic, i) { drawArt(ic, sx + i * gap, by + 43, 30, 30, 1); });
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
  function drawPlay() {
    drawBg();
    var order = S.customers.filter(Boolean);
    order.forEach(function (c) { drawCustomer(c, SLOT_X[c.slot]); });
    drawCounterFront();
    drawWorkbench();
    S.flying.forEach(function (f) {
      var q = clamp(f.t / f.dur, 0, 1), x = lerp(f.x0, f.x1, q), y = lerp(f.y0, f.y1, q) - Math.sin(q * Math.PI) * (f.trash ? 40 : 60);
      drawArtCup(f.cup, x, y + 44, f.trash ? 1 - q * 0.4 : 1 - q * 0.45, f.trash ? 1 - q : 1 - q * 0.3);
    });
    var hv = dragHover(), heldCup = S.drag && S.drag.kind === 'cup' ? S.spots[S.drag.spot] : null;
    order.forEach(function (c) {
      var ready = false;
      for (var i = 0; i < 3; i++) if (S.spots[i] && S.spots[i].tea && activeCustomer(c) && sameOrder(S.spots[i], c.order)) ready = true;
      var hover = hv.cust === c ? (heldCup && heldCup.tea && sameOrder(heldCup, c.order) ? 'good' : 'bad') : null;
      drawBubble(c, ready, hover);
    });
    drawHUD();
    drawDragLayer();
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
  var DEMO_CUPS = [
    { size: '大杯', tea: '奶茶', tops: ['珍珠'], fill: 1, topT: { '珍珠': 1 }, shake: 0, sizeT: 0, last: '珍珠' },
    { size: '中杯', tea: '红茶', tops: [], fill: 0.75, topT: {}, shake: 0, sizeT: 0, last: '红茶' }
  ];
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
    drawBench();
    drawSpot(0, DEMO_CUPS[0], false, false, false, { ready: true });
    drawSpot(1, DEMO_CUPS[1], false, true, true, { ready: false });
    drawSpot(2, null, false, false, false, { ready: false });
    // how to play
    var steps = [['大杯', '① 杯子拖到杯位（最多三杯一起做）'], ['红茶', '② 再拖茶底，然后拖小料'], ['珍珠', '③ 做好的杯子拖给点它的客人']];
    steps.forEach(function (s, i) {
      var y = 662 + i * 34;
      drawArt(s[0], 46, y, 28, 28, 1);
      text(s[1], 68, y, 14, C.ink, 'left');
    });
    var pulse = 1 + Math.sin(t * 4) * 0.03;
    ctx.save(); ctx.translate(195, UI_BTN.start.y + 26); ctx.scale(pulse, pulse); ctx.translate(-195, -(UI_BTN.start.y + 26));
    bigButton(UI_BTN.start, 'start', '开始营业', C.coral, C.coralDark); ctx.restore();
    // demo drag: pearls gliding from the shelf to spot 2 with afterimages
    var cyc = (t % 2.2) / 1.6;
    if (cyc <= 1) {
      var e = 1 - (1 - cyc) * (1 - cyc), x0 = 100, y0 = 790, x1 = 148, y1 = 560;
      var path = function (q) { return { x: lerp(x0, x1, q) + Math.sin(q * Math.PI) * -26, y: lerp(y0, y1, q) }; };
      var hist = [], now = clock;
      for (var hi = 12; hi >= 0; hi--) {
        var tq = Math.max(0, cyc - hi * 0.03), eq = 1 - (1 - tq) * (1 - tq), pp = path(eq);
        hist.push({ x: pp.x, y: pp.y, t: now - hi * 0.03 * 1.6 });
      }
      var cur = path(e);
      ctx.save(); ctx.globalAlpha = cyc > 0.85 ? (1 - cyc) / 0.15 : 1;
      drawGhostDrag('item', '珍珠', null, cur.x, cur.y, hist);
      ctx.restore();
    }
    woodSign(195, 128, 286, 96, '忙碌奶茶店', 40);
    ribbon(195, 200, 220, '拖一拖，三杯一起做');
    var startTip = (S.best > 0 ? '最佳 ' + S.best + '  ·  ' : '') + '3 条店命，送错或等急了都会扣命';
    ctx.font = font(13, true);
    var tipW = Math.min(330, ctx.measureText(startTip).width + 28);
    rr(195 - tipW / 2, 232, tipW, 26, 13); ctx.fillStyle = 'rgba(74,51,36,0.55)'; ctx.fill();
    text(startTip, 195, 245, 13, '#fff6e4');
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
    drawCounterClean();
    ctx.fillStyle = '#5c3e28';
    ctx.fillRect(0, 556, LW, LH - 556);
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
      S: S, start: startGame, end: endGame, tap: onTap,
      layout: function () {
        return { spots: SPOTS, items: ITEMS, trash: TRASH, slots: SLOT_X, scale: scale, offX: offX, offY: offY, cLeft: cLeft, cTop: cTop };
      },
      setOrder: function (slot, size, tea, tops, pat) {
        var c = S.customers[slot]; if (!c) return false;
        c.order = { size: size, tea: tea, tops: tops || [] };
        if (pat) { c.patience = pat; c.max = pat; }
        return true;
      }
    };
  }

})();
