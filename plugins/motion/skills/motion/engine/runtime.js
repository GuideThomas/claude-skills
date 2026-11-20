/* Motion-Laufzeit für /motion — reines JavaScript, keine Bibliotheken.
 *
 * Ein Video ist ein Objekt VIDEO (im Videoteil der HTML-Datei). Die Laufzeit zeichnet
 * jedes Bild allein aus der Zeit t: renderAt(t) ist eine reine Funktion. Darum läuft
 * dieselbe Datei als Vorschau im Browser und als Bild-für-Bild-Export (motion.py export).
 *
 * Nicht pro Video ändern — Änderungen hier gelten für alle künftigen Videos und gehören
 * in engine/runtime.js, nicht in eine einzelne video.html.
 */
"use strict";

const M = (() => {
  const FORMATS = { "16:9": [1920, 1080], "1:1": [1080, 1080], "9:16": [1080, 1920], "4:5": [1080, 1350] };
  const params = new URLSearchParams(location.search);
  const EXPORT = params.has("export");
  const errors = [];
  const fail = (msg) => { errors.push(msg); console.error("[motion] " + msg); };

  // ---------- Mathematik und Easing ----------
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = {
    linear: (x) => x,
    inSine: (x) => 1 - Math.cos((x * Math.PI) / 2),
    outSine: (x) => Math.sin((x * Math.PI) / 2),
    inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
    inCubic: (x) => x * x * x,
    outCubic: (x) => 1 - Math.pow(1 - x, 3),
    inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    outQuint: (x) => 1 - Math.pow(1 - x, 5),
    outBack: (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
    outElastic: (x) => (x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin(((x * 10 - 0.75) * 2 * Math.PI) / 3) + 1),
  };
  // Fortschritt 0..1 zwischen den Zeitpunkten a und b, optional mit Easing (Name oder Funktion).
  const p = (t, a, b, e) => {
    const k = b === a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a));
    return e ? (typeof e === "string" ? ease[e] : e)(k) : k;
  };
  // Ein- und Ausblenden in einem: 0 → 1 (ab a, Dauer fin) … 1 → 0 (bis b, Dauer fout).
  const inOut = (t, a, b, fin = 0.4, fout = 0.4) => Math.min(p(t, a, a + fin, "outCubic"), 1 - p(t, b - fout, b, "inCubic"));

  // Deterministischer Zufall (mulberry32) — nie Math.random(), sonst weicht der Export ab.
  const rand = (seed = 1) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let r = Math.imul(a ^ (a >>> 15), 1 | a);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  };

  // ---------- Farben ----------
  const hexToRgb = (hex) => {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const rgba = (hex, a = 1) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };
  const mixColor = (h1, h2, k) => {
    const a = hexToRgb(h1), b = hexToRgb(h2);
    return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], clamp(k)))).join(",")})`;
  };

  // ---------- Zeichenhilfen ----------
  const roundRect = (ctx, x, y, w, h, r = 5) => {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  };
  const font = (o = {}) => `${o.weight || 400} ${o.size || 48}px ${o.font || api.style.font || "sans-serif"}`;
  const wrapLines = (ctx, str, maxWidth) => {
    const lines = [];
    for (const para of String(str).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const test = line ? line + " " + word : word;
        if (maxWidth && ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
        else line = test;
      }
      lines.push(line);
    }
    return lines;
  };
  /* Text mit optionalem Aufbau.
   * o: size, weight, font, color, align ("left"|"center"|"right"), baseline, maxWidth, lineHeight,
   *    letterSpacing (px), alpha, reveal (0..1), mode ("fade"|"words"|"chars"|"rise")
   * Gibt { width, height, lines } zurück. */
  const text = (ctx, str, x, y, o = {}) => {
    const outer = ctx.globalAlpha; // eine vorher gesetzte Transparenz wirkt mit, statt überschrieben zu werden
    ctx.save();
    ctx.font = font(o);
    ctx.textBaseline = o.baseline || "alphabetic";
    if ("letterSpacing" in ctx) ctx.letterSpacing = (o.letterSpacing || 0) + "px";
    const size = o.size || 48, lh = (o.lineHeight || 1.2) * size;
    const lines = wrapLines(ctx, str, o.maxWidth);
    const reveal = o.reveal === undefined ? 1 : clamp(o.reveal);
    const mode = o.mode || "fade";
    const align = o.align || "left";
    const baseAlpha = outer * (o.alpha === undefined ? 1 : o.alpha);
    ctx.fillStyle = o.color || api.style.fg || "#fff";
    let width = 0;
    const tokens = []; // für words/chars: alle Einheiten über alle Zeilen
    lines.forEach((line, li) => {
      const lw = ctx.measureText(line).width;
      width = Math.max(width, lw);
      const lx = align === "center" ? x - lw / 2 : align === "right" ? x - lw : x;
      const ly = y + li * lh;
      if (mode === "fade" || mode === "rise") { tokens.push({ s: line, x: lx, y: ly, whole: true }); return; }
      const units = mode === "chars" ? [...line] : line.split(/(\s+)/);
      let cx = lx;
      for (const u of units) {
        const w = ctx.measureText(u).width;
        if (u.trim()) tokens.push({ s: u, x: cx, y: ly });
        cx += w;
      }
    });
    ctx.textAlign = "left";
    if (mode === "fade" || mode === "rise") {
      const k = ease.outCubic(reveal);
      ctx.globalAlpha = baseAlpha * k;
      for (const tk of tokens) ctx.fillText(tk.s, tk.x, tk.y + (mode === "rise" ? (1 - k) * size * 0.5 : 0));
    } else {
      const n = tokens.length, span = 0.35;
      tokens.forEach((tk, i) => {
        const a = n > 1 ? (i / (n - 1)) * (1 - span) : 0;
        const k = ease.outCubic(clamp((reveal - a) / span));
        if (k <= 0) return;
        ctx.globalAlpha = baseAlpha * k;
        ctx.fillText(tk.s, tk.x, tk.y + (1 - k) * size * 0.35);
      });
    }
    ctx.restore();
    return { width, height: lines.length * lh, lines };
  };

  // ---------- Zeitmarken aus der Stimme ----------
  const norm = (s) => String(s).toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, "");
  /* cue("Gravitation") → Startzeit des Wortes; "Gravitation#2" = zweites Vorkommen;
   * "Gravitation+0.3" / "-0.2" = Versatz in Sekunden; "Gravitation:ende" = Wortende.
   * Zuerst VIDEO.cues, dann die Wörter der Stimme. Nicht gefunden → Fehler, kein stilles 0. */
  const cue = (spec) => {
    if (typeof spec === "number") return spec;
    const m = String(spec).match(/^(.+?)(?:#(\d+))?(:ende)?([+-]\d+(?:\.\d+)?)?$/);
    if (!m) { fail(`Zeitmarke unlesbar: "${spec}"`); return 0; }
    const [, name, nth, atEnd, off] = m;
    const offset = off ? parseFloat(off) : 0;
    if (api.video.cues && name in api.video.cues) return cue(api.video.cues[name]) + offset;
    const want = norm(name), k = nth ? parseInt(nth, 10) : 1;
    let seen = 0;
    for (const w of api.words) {
      if (norm(w.w) === want || (want.length >= 4 && norm(w.w).startsWith(want))) {
        if (++seen === k) return (atEnd ? w.e : w.s) + offset;
      }
    }
    fail(`Zeitmarke nicht gefunden: "${spec}"` + (api.words.length ? "" : " (keine Stimme geladen)"));
    return 0;
  };

  // ---------- Ton-Synthese (Web Audio) ----------
  // Jede Funktion plant Klänge auf einem (Offline)AudioContext ein: (ac, out, when, o, offset).
  // offset > 0 heisst: der Klang hätte schon vor `when` beginnen sollen (Sprung in der Vorschau).
  const noiseBuffer = (ac, dur, seed = 7) => {
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0), r = rand(seed);
    for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
    return buf;
  };
  const env = (g, when, peak, attack, decay) => {
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
  };
  const SFX = {
    whoosh(ac, out, when, o = {}, offset = 0) {
      if (offset > 0.05) return;
      const d = o.dur || 0.6, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      src.buffer = noiseBuffer(ac, d, o.seed || 3);
      f.type = "bandpass"; f.Q.value = 1.2;
      f.frequency.setValueAtTime(o.from || 400, when);
      f.frequency.exponentialRampToValueAtTime(o.peak || 2800, when + d * 0.55);
      f.frequency.exponentialRampToValueAtTime(o.to || 700, when + d);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(0.55 * (o.gain || 1), when + d * 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, when + d);
      src.connect(f).connect(g).connect(out);
      src.start(when); src.stop(when + d + 0.05);
    },
    pop(ac, out, when, o = {}, offset = 0) {
      if (offset > 0.05) return;
      const osc = ac.createOscillator(), g = ac.createGain(), f0 = o.freq || 880;
      osc.type = "sine";
      osc.frequency.setValueAtTime(f0, when);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.35, when + 0.09);
      env(g, when, 0.5 * (o.gain || 1), 0.004, 0.11);
      osc.connect(g).connect(out); osc.start(when); osc.stop(when + 0.2);
    },
    click(ac, out, when, o = {}, offset = 0) {
      if (offset > 0.05) return;
      const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      src.buffer = noiseBuffer(ac, 0.03, o.seed || 11);
      f.type = "highpass"; f.frequency.value = o.freq || 2500;
      env(g, when, 0.45 * (o.gain || 1), 0.001, 0.025);
      src.connect(f).connect(g).connect(out); src.start(when); src.stop(when + 0.05);
    },
    tick(ac, out, when, o = {}, offset = 0) { SFX.click(ac, out, when, { freq: 4000, gain: 0.5 * (o.gain || 1), seed: 13 }, offset); },
    ding(ac, out, when, o = {}, offset = 0) {
      if (offset > 0.05) return;
      const f0 = o.freq || 1046.5, d = o.dur || 1.4;
      [[1, 0.5], [2.76, 0.18], [5.4, 0.08]].forEach(([mult, amp]) => {
        const osc = ac.createOscillator(), g = ac.createGain();
        osc.type = "sine"; osc.frequency.value = f0 * mult;
        env(g, when, amp * (o.gain || 1), 0.003, d / mult);
        osc.connect(g).connect(out); osc.start(when); osc.stop(when + d + 0.1);
      });
    },
    chime(ac, out, when, o = {}, offset = 0) {
      [0, 0.09, 0.18].forEach((dt, i) => SFX.ding(ac, out, when + dt, { freq: (o.freq || 784) * [1, 1.26, 1.5][i], gain: 0.6 * (o.gain || 1), dur: 1.1 }, offset - dt));
    },
    rise(ac, out, when, o = {}, offset = 0) {
      if (offset > 0.05) return;
      const d = o.dur || 1.5, osc = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(o.from || 180, when);
      osc.frequency.exponentialRampToValueAtTime(o.to || 900, when + d);
      f.type = "lowpass"; f.frequency.setValueAtTime(400, when); f.frequency.exponentialRampToValueAtTime(4000, when + d);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(0.18 * (o.gain || 1), when + d * 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, when + d + 0.08);
      osc.connect(f).connect(g).connect(out); osc.start(when); osc.stop(when + d + 0.1);
    },
    thud(ac, out, when, o = {}, offset = 0) {
      if (offset > 0.05) return;
      const osc = ac.createOscillator(), g = ac.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(o.freq || 140, when);
      osc.frequency.exponentialRampToValueAtTime(42, when + 0.35);
      env(g, when, 0.7 * (o.gain || 1), 0.005, 0.45);
      osc.connect(g).connect(out); osc.start(when); osc.stop(when + 0.6);
    },
    type(ac, out, when, o = {}, offset = 0) {
      const d = o.dur || 1, r = rand(o.seed || 5), n = Math.max(1, Math.round(d * (o.rate || 14)));
      for (let i = 0; i < n; i++) {
        const dt = (i / n) * d + r() * 0.02;
        if (dt >= offset) SFX.click(ac, out, when + dt - Math.max(0, offset), { freq: 1800 + r() * 2200, gain: 0.35 * (o.gain || 1), seed: 20 + i }, 0);
      }
    },
    // Klangteppich: weicher Akkord, langsam atmend. o.dur Pflicht, o.notes = Frequenzen.
    pad(ac, out, when, o = {}, offset = 0) {
      const d = o.dur || 10, left = d - offset;
      if (left <= 0.2) return;
      const notes = o.notes || [130.81, 196.0, 261.63, 329.63];
      const f = ac.createBiquadFilter(), g = ac.createGain();
      f.type = "lowpass"; f.frequency.value = o.cutoff || 900; f.Q.value = 0.3;
      const peak = 0.06 * (o.gain || 1), fade = Math.min(2, d / 4);
      const startLevel = offset < fade ? peak * (offset / fade) : peak;
      g.gain.setValueAtTime(Math.max(startLevel, 0.0001), when);
      if (offset < fade) g.gain.linearRampToValueAtTime(peak, when + (fade - offset));
      g.gain.setValueAtTime(peak, when + Math.max(0, left - fade));
      g.gain.linearRampToValueAtTime(0.0001, when + left);
      notes.forEach((hz, i) => [-4, 4].forEach((cents) => {
        const osc = ac.createOscillator();
        osc.type = i === 0 ? "sine" : "triangle";
        osc.frequency.value = hz; osc.detune.value = cents;
        osc.connect(f); osc.start(when); osc.stop(when + left + 0.1);
      }));
      f.connect(g).connect(out);
    },
  };

  // ---------- Zustand ----------
  const api = {
    EXPORT, errors, clamp, lerp, ease, p, inOut, rand, rgba, mixColor, hexToRgb, roundRect, font, wrapLines, text, cue, SFX,
    W: 1920, H: 1080, fps: 30, duration: 10, video: null, style: {}, words: [], scenes: [], sounds: [], img: {}, captionChunks: [],
  };

  const loadJSON = async (src) => (typeof src === "string" ? (await fetch(src)).json() : src);
  const loadImage = (src) => new Promise((ok) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => { fail(`Bild nicht geladen: ${String(src).slice(0, 60)}`); ok(null); };
    im.src = src;
  });

  const buildCaptions = () => {
    const maxChars = api.video.captionChars || (api.W > api.H ? 42 : 24), chunks = [];
    let cur = null;
    api.words.forEach((w, i) => {
      if (!cur) cur = { words: [], len: 0 };
      cur.words.push(w); cur.len += w.w.length + 1;
      // Umbruch an Satzzeichen, bei voller Zeile oder an einer Sprechpause (für Quellen ohne Satzzeichen)
      const next = api.words[i + 1], pause = next ? next.s - w.e : 0;
      if (/[.!?;:]$/.test(w.w) || cur.len >= maxChars || pause > 0.35) { chunks.push(cur); cur = null; }
    });
    if (cur) chunks.push(cur);
    for (const c of chunks) { c.s = c.words[0].s; c.e = c.words[c.words.length - 1].e; }
    for (let i = 0; i < chunks.length; i++) chunks[i].until = Math.min(chunks[i].e + 0.6, i + 1 < chunks.length ? chunks[i + 1].s : Infinity);
    api.captionChunks = chunks;
  };

  const drawCaptions = (ctx, T) => {
    const c = api.captionChunks.find((ch) => T >= ch.s - 0.05 && T < ch.until);
    if (!c) return;
    const cs = Object.assign({ size: api.W > api.H ? 44 : 54, color: "#ffffff", accent: api.style.accent || "#00B9F1", box: "rgba(0,0,0,0.55)", bottom: 0.1 }, api.video.captionStyle || {});
    ctx.save();
    ctx.font = font({ size: cs.size, weight: 600 });
    const sep = ctx.measureText(" ").width;
    const widths = c.words.map((w) => ctx.measureText(w.w).width);
    const total = widths.reduce((a, b) => a + b, 0) + sep * (c.words.length - 1);
    const y = api.H * (1 - cs.bottom), pad = cs.size * 0.45;
    ctx.fillStyle = cs.box;
    roundRect(ctx, api.W / 2 - total / 2 - pad, y - cs.size - pad * 0.6, total + pad * 2, cs.size + pad * 1.5, 8);
    ctx.fill();
    let x = api.W / 2 - total / 2;
    c.words.forEach((w, i) => {
      ctx.fillStyle = T >= w.s && T < w.e + 0.05 ? cs.accent : cs.color;
      ctx.fillText(w.w, x, y);
      x += widths[i] + sep;
    });
    ctx.restore();
  };

  // ---------- 3D (Three.js, nur mit VIDEO.three) ----------
  /* Lädt Three.js aus three/ (Dateien im Ordner) oder aus data:-Adressen (gebündelte Seite). Die Importe
     zwischen den Dateien werden auf Blob-Adressen umgeschrieben, darum tragen beide Wege. Danach steht
     api.three = { THREE, renderer, env, render(ctx, scene, camera), welt } bereit; welt ist der Rückgabewert
     von VIDEO.setup3d(THREE, api.three, api). Die Leinwand ist durchsichtig, darunter liegt der 2D-Grund. */
  const load3d = async (cfg) => {
    const src = Object.assign({ core: "three/three.core.min.js", module: "three/three.module.min.js",
      room: "three/RoomEnvironment.js" }, cfg === true ? {} : cfg);
    const text = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u.slice(0, 60)}: HTTP ${r.status}`); return r.text(); };
    const blob = (code) => URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    const coreUrl = blob(await text(src.core));
    const modUrl = blob((await text(src.module)).split('"./three.core.min.js"').join(JSON.stringify(coreUrl)));
    const roomUrl = blob((await text(src.room)).replace(/from\s*['"]three['"]/g, `from ${JSON.stringify(modUrl)}`));
    const THREE = await import(modUrl);
    const { RoomEnvironment } = await import(roomUrl);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(api.W, api.H, false);
    renderer.setClearColor(0x000000, 0);
    const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    api.three = {
      THREE, renderer, env,
      render(ctx, scene, camera) {
        if (camera.isPerspectiveCamera && camera.aspect !== api.W / api.H) { camera.aspect = api.W / api.H; camera.updateProjectionMatrix(); }
        renderer.render(scene, camera);
        ctx.drawImage(renderer.domElement, 0, 0, api.W, api.H);
      },
    };
    if (api.video.setup3d) api.three.welt = api.video.setup3d(THREE, api.three, api);
  };

  api.init = async (VIDEO) => {
    api.video = VIDEO;
    api.style = VIDEO.style || {};
    [api.W, api.H] = FORMATS[VIDEO.format || "16:9"] || (fail(`Format unbekannt: ${VIDEO.format}`), FORMATS["16:9"]);
    api.fps = VIDEO.fps || 30;
    if (VIDEO.voice) {
      try { api.words = await loadJSON(VIDEO.voice.words); }
      catch (e) { fail(`Wörter der Stimme nicht geladen (${VIDEO.voice.words}) — über motion.py öffnen, nicht per Doppelklick`); }
    }
    for (const [k, src] of Object.entries(VIDEO.images || {})) api.img[k] = await loadImage(src);
    for (const f of api.style.fontsToLoad || []) {
      try { await document.fonts.load(f); } catch (e) { /* unten geprüft */ }
      if (!document.fonts.check(f)) fail(`Schrift nicht geladen: ${f}`);
    }
    if (VIDEO.three) {
      try { await load3d(VIDEO.three); }
      catch (e) { fail(`3D nicht geladen: ${e.message} — Ordner mit „motion.py neu … --3d“ angelegt? Über motion.py öffnen, nicht per Doppelklick`); }
    }
    // Szenen: start/ende dürfen Zahlen oder Zeitmarken sein.
    const sc = (VIDEO.scenes || []).map((s) => Object.assign({}, s, { start: cue(s.start ?? 0) }));
    const last = api.words.length ? api.words[api.words.length - 1].e : 0;
    api.duration = VIDEO.duration ? cue(VIDEO.duration) : Math.max(last + (VIDEO.tail ?? 1.5), ...sc.map((s) => (s.end !== undefined ? cue(s.end) : s.start + 1)));
    const ordered = [...sc].sort((a, b) => a.start - b.start);
    for (const s of sc) {
      const next = ordered.find((o) => o.start > s.start);
      s.end = s.end !== undefined ? cue(s.end) : next ? next.start : api.duration;
      s.dur = s.end - s.start;
      if (s.dur <= 0) fail(`Szene "${s.name}" hat keine Dauer (${s.start.toFixed(2)}–${s.end.toFixed(2)})`);
    }
    api.scenes = sc;
    api.sounds = [];
    for (const snd of VIDEO.sounds || []) api.sounds.push(Object.assign({}, snd, { at: cue(snd.at) }));
    for (const s of sc) for (const snd of s.sounds || []) api.sounds.push(Object.assign({}, snd, { at: s.start + (typeof snd.at === "number" ? snd.at : cue(snd.at) - s.start) }));
    for (const snd of api.sounds) if (!SFX[snd.sfx]) fail(`Ton unbekannt: "${snd.sfx}" (vorhanden: ${Object.keys(SFX).join(", ")})`);
    // Keine Hintergrundmusik ohne ausdrücklichen Wunsch.
    if (VIDEO.musik !== true && api.sounds.some((snd) => snd.sfx === "pad"))
      fail('Klangteppich ("pad") ist ausgeschlossen — Hintergrundmusik nur auf ausdrücklichen Wunsch, dann VIDEO.musik = true');
    if (VIDEO.captions && api.words.length) buildCaptions();
  };

  // ---------- Zeichnen ----------
  api.renderAt = (ctx, T) => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = api.style.bg || "#000";
    ctx.fillRect(0, 0, api.W, api.H);
    if (api.video.background) { ctx.save(); api.video.background(ctx, T, api); ctx.restore(); }
    for (const s of api.scenes) {
      if (T < s.start || T >= s.end) continue;
      const t = T - s.start;
      ctx.save();
      s.draw(ctx, t, Object.assign({ k: s.dur ? t / s.dur : 1, T }, s), api);
      ctx.restore();
    }
    if (api.video.overlay) { ctx.save(); api.video.overlay(ctx, T, api); ctx.restore(); }
    if (api.captionChunks.length) drawCaptions(ctx, T);
    ctx.restore();
  };

  // Plant alle Töne ab Zeitpunkt T0 auf `out` ein; `base` = Kontextzeit, die T0 entspricht.
  api.scheduleSounds = (ac, out, base, T0) => {
    for (const snd of api.sounds) {
      const offset = T0 - snd.at;
      const when = base + Math.max(0, -offset);
      try { SFX[snd.sfx](ac, out, when, snd, Math.max(0, offset)); } catch (e) { fail(`Ton "${snd.sfx}" bei ${snd.at}: ${e.message}`); }
    }
  };

  api.mix = () => Object.assign({ voice: 1, sfx: api.video.voice ? 0.45 : 0.8 }, api.video.mix || {});

  // Ganze Tonspur offline rendern (für den Export) → WAV als Base64.
  api.renderAudio = async () => {
    const rate = 48000, len = Math.ceil(api.duration * rate);
    const ac = new OfflineAudioContext(2, len, rate);
    const mix = api.mix();
    const sfxBus = ac.createGain(); sfxBus.gain.value = mix.sfx; sfxBus.connect(ac.destination);
    if (api.video.voice) {
      const data = await (await fetch(api.video.voice.src)).arrayBuffer();
      const buf = await ac.decodeAudioData(data);
      const src = ac.createBufferSource(), g = ac.createGain();
      g.gain.value = mix.voice;
      src.buffer = buf; src.connect(g).connect(ac.destination); src.start(api.video.voice.offset || 0);
    }
    api.scheduleSounds(ac, sfxBus, 0, 0);
    const out = await ac.startRendering();
    const n = out.length, ch = [out.getChannelData(0), out.getChannelData(1)];
    const bytes = new Uint8Array(44 + n * 4), dv = new DataView(bytes.buffer);
    const w = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
    w(0, "RIFF"); dv.setUint32(4, 36 + n * 4, true); w(8, "WAVE"); w(12, "fmt ");
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
    dv.setUint32(24, rate, true); dv.setUint32(28, rate * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true);
    w(36, "data"); dv.setUint32(40, n * 4, true);
    let peak = 0;
    for (let i = 0, o = 44; i < n; i++) for (let c = 0; c < 2; c++, o += 2) {
      const v = clamp(ch[c][i], -1, 1); peak = Math.max(peak, Math.abs(v));
      dv.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    }
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return { wav: btoa(bin), peak };
  };

  return api;
})();

// ---------- Player ----------
(async () => {
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  await M.init(VIDEO);
  canvas.width = M.W; canvas.height = M.H;
  document.documentElement.style.setProperty("--ar", `${M.W} / ${M.H}`);
  document.title = VIDEO.title || document.title;

  // Export-Schnittstelle für motion.py
  window.__motion = {
    info: () => ({ W: M.W, H: M.H, fps: M.fps, duration: M.duration, errors: M.errors, voice: !!VIDEO.voice,
      scenes: M.scenes.map((s) => ({ name: s.name, start: s.start, end: s.end, key: s.key !== undefined ? s.start + s.key : (s.start + s.end) / 2 })) }),
    frame: (T, type = "image/png", quality = 0.95) => { M.renderAt(ctx, T); return canvas.toDataURL(type, quality); },
    audio: () => M.renderAudio(),
  };
  window.__motionReady = true;
  if (M.EXPORT) { document.body.classList.add("export"); M.renderAt(ctx, 0); return; }

  const $ = (id) => document.getElementById(id);
  const playBtn = $("play"), seek = $("seek"), time = $("time"), chapters = $("chapters"), stopsBox = $("stops"), cont = $("continue");
  seek.max = M.duration;
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  let T = 0, playing = false, startPerf = 0, startT = 0, ac = null, bus = null, waitingAt = null;
  const voice = VIDEO.voice ? new Audio(VIDEO.voice.src) : null;
  const voiceOffset = VIDEO.voice?.offset || 0;
  if (voice) voice.volume = Math.min(1, M.mix().voice);
  const stopScenes = M.scenes.filter((s) => s.stop);
  if (stopScenes.length) stopsBox.parentElement.hidden = false;

  for (const s of M.scenes.filter((s) => s.chapter)) {
    const b = document.createElement("button");
    b.textContent = s.chapter; b.onclick = () => { go(s.start); if (!playing) play(); };
    chapters.appendChild(b);
  }

  const stopAudio = () => { if (bus) { bus.disconnect(); bus = null; } if (voice) voice.pause(); };
  const startAudio = () => {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") ac.resume();
    bus = ac.createGain(); bus.gain.value = M.mix().sfx; bus.connect(ac.destination);
    M.scheduleSounds(ac, bus, ac.currentTime + 0.03, T);
    if (voice) {
      const vt = T - voiceOffset;
      if (vt >= 0 && (!voice.duration || vt < voice.duration)) { voice.currentTime = vt; voice.play().catch(() => {}); }
    }
  };
  const play = () => {
    if (T >= M.duration - 0.01) T = 0;
    playing = true; waitingAt = null; cont.hidden = true;
    startPerf = performance.now(); startT = T; startAudio();
    playBtn.dataset.state = "pause"; playBtn.setAttribute("aria-label", "Pause");
  };
  const pause = () => {
    playing = false; stopAudio();
    playBtn.dataset.state = "play"; playBtn.setAttribute("aria-label", "Abspielen");
  };
  const go = (t) => { const was = playing; if (was) pause(); T = M.clamp(t, 0, M.duration); draw(); if (was) play(); };
  const draw = () => { M.renderAt(ctx, T); seek.value = T; time.textContent = `${fmt(T)} / ${fmt(M.duration)}`; };

  playBtn.onclick = () => (playing ? pause() : play());
  canvas.onclick = () => (playing ? pause() : play());
  cont.onclick = () => { T = waitingAt + 0.001; play(); };
  seek.oninput = () => go(parseFloat(seek.value));
  $("full").onclick = () => (document.fullscreenElement ? document.exitFullscreen() : canvas.requestFullscreen());
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" && e.target.type !== "range") return;
    if (e.code === "Space" || e.key === "k") { e.preventDefault(); playing ? pause() : play(); }
    else if (e.key === "ArrowRight") go(T + 5);
    else if (e.key === "ArrowLeft") go(T - 5);
    else if (e.key === "Home") go(0);
    else if (e.key === "f") $("full").click();
  });

  const loop = () => {
    if (playing) {
      let next = startT + (performance.now() - startPerf) / 1000;
      if (stopsBox.checked) {
        const hit = stopScenes.find((s) => T < s.end && next >= s.end);
        if (hit) { next = hit.end - 0.001; T = next; pause(); waitingAt = next; cont.hidden = false; }
      }
      if (playing) T = next;
      if (voice && playing && !voice.paused && Math.abs(voice.currentTime + voiceOffset - T) > 0.12) voice.currentTime = T - voiceOffset;
      if (T >= M.duration) { T = M.duration; pause(); }
    }
    draw();
    requestAnimationFrame(loop);
  };
  if (M.errors.length) $("errors").textContent = "Fehler: " + M.errors.join(" · ");
  draw();
  requestAnimationFrame(loop);
})();
