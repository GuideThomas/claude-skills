---
name: motion
description: Baut Motion-Graphics- und Erklärvideos aus reinem JavaScript — ohne Videogenerator. Ergebnis als MP4 und/oder interaktive HTML-Seite, Stil wählbar, optional 3D (Three.js), künstliche Stimme (ElevenLabs) und wortgenaue Untertitel. Auslöser: „Erklärvideo", „Motion Graphics", „animiertes Video", „Video aus Code", „Explainer", „/motion <Thema>".
---

# /motion — Erklärvideos aus Code

Claude schreibt reines JavaScript, das jedes Bild auf ein Canvas zeichnet; Töne entstehen per
Web Audio. Weil jedes Bild **allein aus der Zeit t** berechnet wird, ist dieselbe HTML-Datei
Vorschau, interaktive Seite und Quelle für einen Bild-für-Bild-Export zur MP4.

Der Hebel für gleichmäßige Qualität ist die **Stil-Referenz als vollständiger Code**
(`styles/<stil>/szenen.js`): Ein neues Video übernimmt Palette, Helfer und Übergänge und
ersetzt nur die Szenen — nicht aus einem Bild oder einer Beschreibung neu erfunden.
**Lies vorher `gotchas.md`.**

**Pfade:** `<SKILL>` ist der Ordner, in dem diese Datei liegt (beim Laden des Skills als
„Base directory" angezeigt). Videos landen als Vorgabe in `./motion-videos/<kurzname>/` im
aktuellen Arbeitsverzeichnis. Unter Windows `python`, unter macOS/Linux `python3`.

## 0. Einrichtung prüfen (bei jedem Aufruf, dauert eine Sekunde)

```bash
python -c "import playwright, imageio_ffmpeg, PIL, numpy; print('Pakete ok')"
```

Fehlt etwas: dem Benutzer sagen, was installiert wird (vier Python-Pakete und ein Chromium für den
Export, zusammen rund 200 MB, einmalig), **nach seinem Ja** ausführen:

```bash
python -m pip install --user playwright imageio-ffmpeg pillow numpy
python -m playwright install chromium
```

Danach die Prüfzeile erneut. Ein eigenes ffmpeg braucht es nicht, `imageio-ffmpeg` bringt eines mit.
Kein Python vorhanden: auf python.org verweisen (3.10 oder neuer), nicht selbst installieren.

## Eingabe

$ARGUMENTS

Thema oder Briefing, optional Stil, Format, Stimme, Ziel. **Nur fehlende Eckpunkte erfragen,
zum Anklicken** (AskUserQuestion), Empfehlung zuerst:

| Eckpunkt | Werte | Vorgabe |
|---|---|---|
| Stil | `klar` (neutral, dunkel) · eigene unter `styles/` | `klar` |
| Format | `16:9` · `1:1` · `4:5` · `9:16` | 16:9; Social-Media-Feed eher 1:1 oder 4:5 |
| Stimme | ElevenLabs · ohne (Texteinblendungen + Töne) | — fragen |
| Untertitel | eingebrannt · ohne | — **immer fragen** |
| Ziel | MP4 · interaktive Seite · beides | beides |
| Länge | Sekunden | 20–60 s |
| 3D (Three.js) | ja · nein | **fragen, wenn das Thema räumlich ist** (Gegenstand, Raum, Montage, Produkt von allen Seiten); sonst nein, ohne Frage. Bei ja: `neu … --3d` und §5a |

## Ablauf

### 1. Ordner anlegen

```bash
python <SKILL>/scripts/motion.py neu <kurzname> --stil <stil>
```

Legt `motion-videos/<kurzname>/video.html` an: Vorlage + Laufzeit + das Beispielvideo des
Stils + dessen Assets. Ein Pfad mit Trenner statt Kurzname legt woanders an.

### 2. Stil-Referenz lesen — ganz

`styles/<stil>/stil.md` (Regeln) und `styles/<stil>/szenen.js` (vollständiger Code). Danach
die API unten. Nicht überfliegen: die Helfer dort sind das, was das neue Video gleich aussehen lässt.

### 3. Sprechertext (nur mit Stimme)

`<ordner>/sprechertext.txt`: kurze Hauptsätze, ein Gedanke je Satz, Zahlen so geschrieben, wie
sie gesprochen werden sollen, Satzzeichen setzen (sie steuern die Untertitel-Umbrüche).
**Vom Benutzer freigeben lassen**, bevor Guthaben verbraucht wird.
Planungswert Deutsch: **≈ 14,7 Zeichen bzw. 2,0–2,1 Wörter je Sekunde**.

### 4. Stimme erzeugen (ElevenLabs)

Ziel sind zwei Dateien im Video-Ordner: `stimme-roh.mp3` und `woerter.json` (je Wort `{w, s, e}`
in Sekunden). Zwei Wege:

**a) ElevenLabs-Connector in Claude** (Werkzeuge `creative_*`, per ToolSearch laden):
`creative_list_voices` (kostenlos, Stimme passend zum Thema wählen) →
`creative_generate_speech` (erst `estimate_only: true` zum Bepreisen und dem Benutzer nennen,
dann mit derselben `flow_id` und `generations_count: 1` erzeugen — die Vorgabe 2 kostet doppelt) →
`creative_get_flow_run_status` (`content_url`, ca. 2 h gültig, sofort als `stimme-roh.mp3` laden) →
`creative_transcribe_audio` mit `connect_from` auf die Sprachausgabe (Scribe, Wort-Zeitmarken) →
`words_download_url` laden → `motion.py woerter <scribe.json> --out <ordner>/woerter.json`.
Fehlen die `creative_*`-Werkzeuge in der laufenden Sitzung: in den Connector-Einstellungen
freischalten und eine **frische Sitzung** starten, die bekommt sie beim Start.

**b) ElevenLabs-API mit eigenem Schlüssel** (Umgebungsvariable `ELEVENLABS_API_KEY`, nie im Code
oder Chat): `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps`, Header
`xi-api-key`, Modell `eleven_multilingual_v2`. Antwort: `audio_base64` → `stimme-roh.mp3`, das
JSON mit `alignment` direkt an `motion.py woerter` geben.

Modell `eleven_multilingual_v2` (Deutsch, stabil bei langen Texten). 🚨 **Im Connector höchstens
5.000 Zeichen je Anfrage**: längere Texte an einer Kapitelgrenze teilen, jeden Teil mit derselben
Stimme erzeugen und durch Scribe schicken, dann `scripts/stimme_zusammen.py` (setzt
`stimme-roh.mp3` und `scribe-gesamt.json` zusammen, danach `woerter` und `pegel`).

Bleibt die Stimme aus: dem Benutzer sagen, woran es liegt, nicht still auf einen anderen Dienst
ausweichen.

🚨 **Danach immer den Pegel angleichen** (ElevenLabs liefert über lange Texte keinen festen Pegel):

```bash
python <SKILL>/scripts/motion.py pegel <kurzname>
```

Misst in gleich langen 10-s-Fenstern nur die Sprechanteile, glättet den Verlauf, hebt auf −17,5 dBFS und
schreibt `stimme.mp3` (Zeitlage unverändert, wird geprüft). Exit 5, wenn danach noch mehr als 1,5 dB
Spanne bleiben. `--nur-messen` misst nur. Der Export misst die fertige Tonspur noch einmal (Grenze 2 dB).

**Deutsche Zahlen in den Untertiteln:** Sprechertext mit ausgeschriebenen Zahlen („zwei Komma fünf
Meter“), dann `motion.py woerter <scribe.json> --ersetzen ersetzungen.json` — Folgen werden für die
Anzeige in Ziffern gesetzt („2,5 m“), die Stimme bleibt unberührt. Beispiel: `data/ersetzungen-beispiel.json`.

Danach `woerter.json` **lesen**: die Zeiten bestimmen, wann welche Szene beginnt. Szenenstarts am
besten als feste Sekunden aus `woerter.json` setzen statt `M.cue` (vermeidet die Präfixtreffer-Falle).

### 5. Szenen schreiben

Den Videoteil zwischen `/*@VIDEO-START@*/` und `/*@VIDEO-ENDE@*/` in `video.html` ersetzen —
**nur diesen Teil**, Laufzeit und Vorlage bleiben. Mit Stimme: `voice: { src: "stimme.mp3",
words: "woerter.json" }`, Szenen-`start` als Zeitmarke (`"Gravitation"`, `"Wärme-0.3"`) oder Zahl,
`captions: true` nur, wenn eingebrannte Untertitel gewählt wurden — **vorher immer fragen**. Für
Social Media, das stumm abspielt, sind sie die naheliegende Empfehlung, aber nicht die Vorgabe.

🚨 **Zeitmarken vor dem Storyboard prüfen:** `M.cue` trifft ab vier Buchstaben auch Wörter, die so *beginnen*, und
`#n` zählt sie mit („dreißig#2“ traf „dreißig Grad“ im nächsten Kapitel). Ein falscher Treffer meldet keinen Fehler.
`python <SKILL>/scripts/zeitmarken_pruefen.py <kurzname> --kapitel <Startzeiten>` listet jede
Zeitmarke mit Zeit, Kapitel und getroffenem Wort.

### 5a. 3D-Szenen (nur wenn 3D gewählt)

Der Ordner braucht `three/` (`motion.py neu <kurzname> --stil <stil> --3d`, nachträglich: dieselben
drei Dateien aus `engine/three/` kopieren). Im Videoteil zwei Einträge, dann steht in jeder Szene
`M.three` bereit (`THREE`, `render(ctx, scene, camera)`, `env`, `welt`):

```js
three: { core: "three/three.core.min.js", module: "three/three.module.min.js", room: "three/RoomEnvironment.js" },
setup3d(THREE, D) {                       // einmal beim Laden: Szene bauen
  const scene = new THREE.Scene();
  scene.environment = D.env;              // Umgebungslicht, sonst wirkt Metall grau
  /* Meshes, Kamera … */
  return { scene, cam };                  // landet in M.three.welt
},
// in einer Szene:
draw(ctx, t, s, M) {
  const { scene, cam } = M.three.welt;
  cam.position.set(Math.sin(t * 0.2) * 6, 4, Math.cos(t * 0.2) * 6); cam.lookAt(0, 0, 0);  // alles aus t
  M.three.render(ctx, scene, cam);        // 3D auf die 2D-Leinwand, danach 2D-Text darüber
},
```

Die 3D-Leinwand ist durchsichtig, Grund und Text bleiben 2D aus dem Stil. Fallen und Messwerte:
`gotchas.md` §3D. Vollständiger Videoteil zum Abschauen (Profil mit Lichtband, belegt bis zur MP4):
`engine/three/beispiel-profil.js`.

### 6. Storyboard zur Freigabe

```bash
python <SKILL>/scripts/motion.py standbilder <kurzname>
```

Ein Standbild je Szene (bei `key` bzw. Szenenmitte) plus `storyboard/storyboard.png`. Selbst
ansehen, Fehler beheben, dann das Storyboard dem Benutzer zeigen. Sagt er „ohne Storyboard",
direkt weiter. `--at 1.5,7,12` setzt eigene Zeitpunkte — gut für Übergänge.

### 7. Fertigstellen

```bash
python <SKILL>/scripts/motion.py export <kurzname>      # → video.mp4
python <SKILL>/scripts/motion.py buendeln <kurzname>    # → <kurzname>.html, alles eingebettet
```

`export` prüft selbst und bricht mit Exit 5 ab, wenn Bild- oder Tonspur fehlt, die Dauer um
> 0,5 s abweicht, der Ton stumm oder übersteuert ist. `buendeln` bettet Stimme, Wörter und
Bilder ein — die Seite läuft dann auch per Doppelklick und ist teilbar.

### 8. Gegenprobe aus der fertigen Datei

Nicht dem Renderer glauben, sondern die MP4 dekodieren und ansehen:

```bash
FF=$(python -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")
"$FF" -hide_banner -loglevel error -y -i <ordner>/video.mp4 -vf "fps=6/<Dauer in s>,scale=480:-1,tile=3x2" -frames:v 1 <ordner>/kontrolle.png
```

Sechs gleichmäßig verteilte Bilder aus der fertigen Datei; dazu den Ton je Abschnitt messen
(`-ss <von> -t <länge> -af volumedetect -vn -f null -`), wenn Töne oder Stimme dabei sind.

### 9. Abgeben

MP4 und/oder gebündelte HTML übergeben. Veröffentlichen (Website, Social Media) nur auf
ausdrücklichen Wunsch.

### 10. Korrekturen und neue Stile

Änderungswünsche direkt im Videoteil umsetzen, dann Schritt 6/7 erneut. Gefällt ein Ergebnis
als Stil: `motion.py stil-speichern <kurzname> <stilname>`, danach `stil.md` ausfüllen und
eingebettete Bilder (z. B. ein eigenes Logo) als Dateien nach `styles/<stilname>/assets/` legen.
⚠️ Als Plugin installiert liegt `styles/` im Plugin-Cache und wird bei einem Update ersetzt: den
Benutzer darauf hinweisen und den neuen Stilordner zusätzlich an einen eigenen Ort kopieren.
Laufzeit verbessert? `motion.py laufzeit <kurzname>` zieht ein bestehendes Video nach.

## API des Videoteils

```js
const VIDEO = {
  title: "…", format: "16:9", fps: 30,
  duration: 20,                 // ohne Stimme Pflicht; mit Stimme: Ende der Stimme + tail (1,5 s)
  voice: { src: "stimme.mp3", words: "woerter.json", offset: 0 },   // optional
  captions: true, captionStyle: { size, color, accent, box, bottom }, captionChars: 42,
  cues: { intro: 0, knall: "Gravitation+0.2" },   // eigene Zeitmarken, vor den Wörtern gesucht
  style: { bg, fg, accent, font, fontsToLoad: ["700 40px Inter"] }, // nicht ladbare Schrift = Fehler
  images: { logo: "logo.svg" },                   // → M.img.logo
  mix: { voice: 1, sfx: 0.45 },                   // Töne mit Stimme leiser
  sounds: [{ at: 1.2, sfx: "whoosh", gain: 1 }],  // absolute Zeit oder Zeitmarke
  background(ctx, T, M) {}, overlay(ctx, T, M) {}, // laufen über alle Szenen
  scenes: [{
    name: "Wärme", chapter: "Wärme",   // chapter → Kapitelknopf in der Seite
    start: 3.5 | "Wärme", end: …,      // end fehlt → Start der nächsten Szene
    key: 2.0,                          // Zeitpunkt (relativ) fürs Storyboard
    stop: true,                        // interaktive Seite hält am Szenenende („Weiter")
    sounds: [{ at: 0.6, sfx: "pop" }], // Zeit relativ zum Szenenstart
    draw(ctx, t, s, M) {},             // t = Sekunden seit Szenenstart, s.dur, s.k (0..1)
  }],
};
```

**Helfer `M`:** `M.W`, `M.H` · `M.p(t, a, b, ease)` Fortschritt 0..1 · `M.inOut(t, a, b, fin, fout)`
· `M.ease.{linear,inSine,outSine,inOutSine,inCubic,outCubic,inOutCubic,outQuint,outBack,outElastic}`
· `M.clamp`, `M.lerp`, `M.rand(seed)` · `M.rgba(hex, a)`, `M.mixColor(h1, h2, k)` ·
`M.roundRect(ctx, x, y, w, h, r)` · `M.text(ctx, str, x, y, {size, weight, font, color, align,
maxWidth, lineHeight, letterSpacing, alpha, reveal, mode: fade|rise|words|chars})` ·
`M.cue("Wort#2+0.3")` · `M.img.<name>`

**Töne `sfx`:** `whoosh` (dur, from, peak, to) · `pop` (freq) · `click` · `tick` · `ding`
(freq, dur) · `chime` · `rise` (dur, from, to) · `thud` (freq) · `type` (dur, rate) ·
`pad` Klangteppich (dur Pflicht, notes, cutoff) — **gesperrt**, nur mit `VIDEO.musik = true` auf ausdrücklichen Wunsch. Alle mit `gain`.

**Pflichtregeln für Szenen-Code:** nie `Math.random()`, `Date.now()` oder Zustand, der sich
zwischen Bildern merkt — `draw` muss für dasselbe t dasselbe Bild liefern, sonst weicht der
Export von der Vorschau ab. Vorberechnete Zufallswerte mit eigenem Seed beim Laden (siehe
`styles/klar/szenen.js`, `rng`). Ein Text, der nicht ins Bild passt, wird umbrochen
(`maxWidth`), nicht verkleinert.
