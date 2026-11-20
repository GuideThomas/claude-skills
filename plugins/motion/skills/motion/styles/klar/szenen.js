// ===== Stil „klar“ — Beispielvideo: Vom Skript zum Video =====
// Dunkel, ruhig, modern, ohne Firmenbezug. Nachtblauer Grund mit zwei weichen Farbnebeln,
// Glaskarten, Verlaufsakzent Violett → Türkis, Schrift Inter. Bewegung: weich und langsam
// (outCubic, outQuint), nie hüpfend. Zeigt Partikel, Zähler und gezeichnete Symbole.

const K = {
  bg: "#0b1020", ink: "#f4f6fb", soft: "rgba(244,246,251,0.66)", faint: "rgba(244,246,251,0.14)",
  violet: "#7c5cff", teal: "#22d3ee", glass: "rgba(255,255,255,0.06)", glassLine: "rgba(255,255,255,0.14)",
};
const FONT = "Inter, system-ui, sans-serif";

// Verlauf Violett → Türkis über eine Breite.
function accent(ctx, x0, x1) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, K.violet); g.addColorStop(1, K.teal);
  return g;
}

// Glaskarte: halbtransparente Fläche mit heller Kante; k blendet und hebt sie ein.
function glassCard(ctx, M, x, y, w, h, k) {
  if (k <= 0) return;
  ctx.save();
  ctx.globalAlpha = k;
  ctx.translate(0, (1 - k) * 40);
  ctx.fillStyle = K.glass;
  M.roundRect(ctx, x, y, w, h, 22); ctx.fill();
  ctx.strokeStyle = K.glassLine; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

// Symbole als Linienzeichnung; k = Zeichenfortschritt 0..1.
function icon(ctx, kind, cx, cy, k) {
  ctx.save();
  ctx.strokeStyle = accent(ctx, cx - 60, cx + 60);
  ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.setLineDash([400]); ctx.lineDashOffset = 400 * (1 - k);
  ctx.beginPath();
  if (kind === "skript") {
    ctx.rect(cx - 44, cy - 56, 88, 112);
    for (let i = 0; i < 4; i++) { ctx.moveTo(cx - 26, cy - 28 + i * 22); ctx.lineTo(cx + (i === 3 ? 4 : 26), cy - 28 + i * 22); }
  } else if (kind === "szenen") {
    ctx.rect(cx - 60, cy - 40, 120, 80);
    ctx.moveTo(cx - 14, cy - 18); ctx.lineTo(cx + 20, cy); ctx.lineTo(cx - 14, cy + 18); ctx.closePath();
  } else {
    ctx.rect(cx - 64, cy - 44, 128, 88);
    for (let i = 0; i < 5; i++) { ctx.moveTo(cx - 52 + i * 26, cy - 44); ctx.lineTo(cx - 52 + i * 26, cy - 30); ctx.moveTo(cx - 52 + i * 26, cy + 30); ctx.lineTo(cx - 52 + i * 26, cy + 44); }
  }
  ctx.stroke();
  ctx.restore();
}

// Partikel: einmal deterministisch erzeugt, Position allein aus der Zeit berechnet.
// Eigener Zufallsgenerator, weil M beim Laden dieses Teils noch nicht existiert (die Laufzeit
// kommt danach); in draw-Funktionen steht M.rand(seed) zur Verfügung.
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const DOTS = (() => { const r = rng(42); return Array.from({ length: 90 }, () => ({ x: r(), y: r(), s: 1 + r() * 2.5, v: 0.004 + r() * 0.012, ph: r() * 6.28 })); })();

const VIDEO = {
  title: "Vom Skript zum Video",
  format: "16:9",
  fps: 30,
  duration: 16,
  style: { bg: K.bg, fg: K.ink, accent: K.teal, font: FONT, fontsToLoad: ["400 40px Inter", "600 40px Inter", "800 40px Inter"] },
  mix: { sfx: 0.8 },
  sounds: [
    // Kein Klangteppich ("pad"): Hintergrundmusik nur auf ausdrücklichen Wunsch, dann VIDEO.musik = true.
    { at: 3.75, sfx: "whoosh" }, { at: 7.75, sfx: "whoosh" }, { at: 12.25, sfx: "whoosh" },
  ],

  // Hintergrund läuft über alle Szenen: zwei Farbnebel und treibende Partikel.
  background(ctx, T, M) {
    const g1 = ctx.createRadialGradient(M.W * 0.18, M.H * 0.2, 0, M.W * 0.18, M.H * 0.2, 900);
    g1.addColorStop(0, M.rgba(K.violet, 0.28)); g1.addColorStop(1, M.rgba(K.violet, 0));
    ctx.fillStyle = g1; ctx.fillRect(0, 0, M.W, M.H);
    const g2 = ctx.createRadialGradient(M.W * (0.85 + 0.03 * Math.sin(T * 0.3)), M.H * 0.85, 0, M.W * 0.85, M.H * 0.85, 1000);
    g2.addColorStop(0, M.rgba(K.teal, 0.2)); g2.addColorStop(1, M.rgba(K.teal, 0));
    ctx.fillStyle = g2; ctx.fillRect(0, 0, M.W, M.H);
    ctx.fillStyle = K.ink;
    for (const d of DOTS) {
      const y = ((d.y - T * d.v) % 1 + 1) % 1;
      ctx.globalAlpha = 0.12 + 0.18 * (0.5 + 0.5 * Math.sin(T * 1.3 + d.ph));
      ctx.beginPath(); ctx.arc(d.x * M.W, y * M.H, d.s, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  },

  scenes: [
    {
      name: "Titel", start: 0,
      sounds: [{ at: 0.4, sfx: "rise", dur: 1.0, gain: 0.5 }, { at: 1.45, sfx: "ding", gain: 0.5, freq: 880 }],
      draw(ctx, t, s, M) {
        const out = 1 - M.p(t, s.dur - 0.4, s.dur, "inCubic");
        M.text(ctx, "Vom Skript", M.W / 2, 470, { size: 120, weight: 800, align: "center", reveal: M.p(t, 0.3, 1.2), mode: "rise", alpha: out });
        M.text(ctx, "zum Video", M.W / 2, 610, { size: 120, weight: 800, align: "center", color: accent(ctx, 700, 1220), reveal: M.p(t, 0.6, 1.5), mode: "rise", alpha: out });
        const k = M.p(t, 1.3, 2.3, "outQuint");
        ctx.globalAlpha = out;
        ctx.fillStyle = accent(ctx, M.W / 2 - 220, M.W / 2 + 220);
        M.roundRect(ctx, M.W / 2 - 220 * k, 668, 440 * k, 8, 4); ctx.fill();
        M.text(ctx, "Erklärvideos aus reinem Code", M.W / 2, 760, { size: 36, weight: 400, color: K.soft, align: "center", reveal: M.p(t, 1.8, 2.8), mode: "words", alpha: out });
      },
    },
    {
      name: "Drei Schritte", chapter: "Ablauf", start: 4,
      sounds: [0.3, 0.9, 1.5].map((at, i) => ({ at, sfx: "pop", freq: 620 + i * 140 })),
      draw(ctx, t, s, M) {
        const out = 1 - M.p(t, s.dur - 0.4, s.dur, "inCubic");
        ctx.globalAlpha = out;
        M.text(ctx, "In drei Schritten", 160, 220, { size: 56, weight: 800, reveal: M.p(t, 0, 0.6), mode: "rise" });
        const cards = [["skript", "Skript", "Was gesagt und gezeigt wird"], ["szenen", "Szenen", "JavaScript zeichnet jedes Bild"], ["export", "Export", "Bild für Bild zur MP4"]];
        cards.forEach(([kind, head, sub], i) => {
          const a = 0.3 + i * 0.6, x = 160 + i * 560, y = 340, k = M.p(t, a, a + 0.6, "outCubic");
          glassCard(ctx, M, x, y, 480, 440, k * out);
          ctx.save(); ctx.globalAlpha = k * out; ctx.translate(0, (1 - k) * 40);
          icon(ctx, kind, x + 240, y + 150, M.p(t, a + 0.2, a + 1.1, "outCubic"));
          M.text(ctx, head, x + 240, y + 300, { size: 48, weight: 600, align: "center" });
          M.text(ctx, sub, x + 240, y + 360, { size: 28, color: K.soft, align: "center", maxWidth: 400 });
          ctx.restore();
          if (i < 2) {
            const ak = M.p(t, a + 0.5, a + 0.9, "outCubic");
            ctx.save(); ctx.globalAlpha = ak * out; ctx.strokeStyle = K.faint; ctx.lineWidth = 4; ctx.lineCap = "round";
            ctx.beginPath(); ctx.moveTo(x + 490, y + 220); ctx.lineTo(x + 490 + 60 * ak, y + 220); ctx.stroke(); ctx.restore();
          }
        });
      },
    },
    {
      name: "Bilder pro Sekunde", chapter: "Export", start: 8,
      sounds: Array.from({ length: 10 }, (_, i) => ({ at: 0.6 + i * 0.16, sfx: "tick" })).concat([{ at: 2.3, sfx: "chime", gain: 0.6 }]),
      draw(ctx, t, s, M) {
        const out = 1 - M.p(t, s.dur - 0.4, s.dur, "inCubic");
        ctx.globalAlpha = out;
        // Bilderstapel fächert sich auf
        const fan = M.p(t, 0.4, 2.2, "outCubic");
        for (let i = 11; i >= 0; i--) {
          const x = 960 + i * 44 * fan, y = 330 + i * 14 * fan; // rechte Kante max. 960 + 11·44 + 420 = 1864
          ctx.save();
          ctx.globalAlpha = out * (0.25 + 0.75 * (1 - i / 12));
          ctx.fillStyle = K.glass; M.roundRect(ctx, x, y, 420, 260, 14); ctx.fill();
          ctx.strokeStyle = i === 0 ? accent(ctx, x, x + 420) : K.glassLine; ctx.lineWidth = i === 0 ? 4 : 2; ctx.stroke();
          ctx.restore();
        }
        const n = Math.round(30 * M.p(t, 0.6, 2.2, "outCubic"));
        M.text(ctx, String(n), 160, 560, { size: 260, weight: 800, color: accent(ctx, 160, 520), alpha: M.p(t, 0.2, 0.6) });
        M.text(ctx, "Bilder pro Sekunde", 170, 650, { size: 48, weight: 600, reveal: M.p(t, 0.5, 1.2), mode: "rise" });
        M.text(ctx, "Jedes Bild wird aus der Zeit berechnet. Darum ist der Export immer gleich.", 170, 730, { size: 30, color: K.soft, maxWidth: 760, lineHeight: 1.4, reveal: M.p(t, 1.4, 2.8), mode: "words" });
      },
    },
    {
      name: "Schluss", start: 12.5,
      draw(ctx, t, s, M) {
        const k = M.p(t, 0.2, 1.0, "outQuint");
        M.text(ctx, "Code statt Videogenerator", M.W / 2, 520, { size: 92, weight: 800, align: "center", reveal: k, mode: "rise" });
        M.text(ctx, "präzise · änderbar · wiederholbar", M.W / 2, 620, { size: 40, weight: 400, align: "center", color: accent(ctx, 640, 1280), reveal: M.p(t, 0.9, 1.8), mode: "words" });
      },
    },
  ],
};
