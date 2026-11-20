---
description: "Stil: klar (Hilfsdatei des Skills, nicht selbst aufrufen)"
user-invocable: false
disable-model-invocation: true
---

# Stil: klar

Neutral und ohne Firmenbezug — für eigene Themen, Erklärungen zu KI und Werkzeugen, alles
ohne eigenes Corporate Design.

**Wirkung:** dunkel, ruhig, modern, hochwertig. Viel Raum, wenig gleichzeitig.

| Element | Wert |
|---|---|
| Grund | Nachtblau `#0b1020` mit zwei weichen Farbnebeln (Violett oben links, Türkis unten rechts, langsam treibend) und feinen Partikeln |
| Akzent | Verlauf Violett `#7c5cff` → Türkis `#22d3ee` (`accent(ctx, x0, x1)`), für Schlüsselwörter, Linien, Zahlen |
| Text | `#f4f6fb`, zweitrangig mit 66 % Deckkraft |
| Flächen | Glaskarten: Weiß 6 % mit heller Kante 14 %, Ecken 22 px |
| Schrift | Inter (Google Fonts), 400 / 600 / 800 |

**Bausteine in `szenen.js`:** `background()` Nebel und Partikel über alle Szenen · `accent()`
Verlauf · `glassCard()` Karte, die einblendet und aufsteigt · `icon()` Liniensymbole, die sich
selbst zeichnen (`setLineDash`) · Zähler (Zahl aus `M.p` gerundet, dazu `tick`-Töne) ·
aufgefächerter Bilderstapel · `rng(seed)` für vorberechneten Zufall.

**Aufbau eines Videos:** Titel mittig (Zeile 2 im Verlauf, Linie zeichnet sich darunter) →
Inhaltsszenen mit Überschrift oben links → Schlussaussage mittig mit drei Stichworten im Verlauf.
Szenen blenden zum Ende hin aus (`out`-Faktor auf `globalAlpha`), kein Wisch-Übergang.

**Bewegung:** weich und langsam — `outCubic`, `outQuint`, `inOutSine`. Kein `outBack`, kein
`outElastic`.

**Töne:** kein Klangteppich (gesperrt, nur mit `VIDEO.musik = true` auf Wunsch), `whoosh` leise an den Szenenwechseln,
`pop` aufsteigend für Karten, `tick` für Zähler, `ding`/`chime` sparsam.

**Beispielvideo:** „Vom Skript zum Video“, 16 s, 16:9, ohne Stimme. Mit Teststimme und
Untertiteln geprüft (siehe `gotchas.md`).
