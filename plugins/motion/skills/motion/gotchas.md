# /motion — Gotchas

Gemessene Fallen aus dem Bau und den ersten Videos (Windows 11, Python 3.14, Playwright 1.57 mit
eigenem Chromium, `imageio-ffmpeg` 0.6.0 → ffmpeg 7.1 mit libx264).

---

## Abhängigkeiten

Siehe `SKILL.md` Schritt 0. Kein System-ffmpeg nötig: `imageio-ffmpeg` bringt ein vollständiges mit.
Playwrights eigenes ffmpeg ist ein Rumpf nur für Bildschirmaufnahmen und taugt nicht zum Muxen.

⚠️ **`python -I` blendet die Benutzer-Pakete aus** — mit `-I` findet `motion.py` Playwright
nicht (`ModuleNotFoundError`). Ohne `-I` aufrufen.

## Logos und eigene Bilder

Ein SVG-Logo, dessen Farben in einer externen CSS-Datei stehen, wird als Bild geladen zum
**schwarzen Rechteck**. Nur SVGs mit eingebetteten Stilangaben (`<style>`-Block oder `fill=`)
verwenden — und ein Logo nie übernehmen, ohne es einmal als Standbild anzusehen.

## Export: JPEG-Einzelbilder, nicht PNG

Ein PNG-Bild mit Verläufen und Partikeln (Stil `klar`) ist ~2,5 MB groß; der Export brauchte
**242 s für 20,9 s Video**, die Zeit ging in der Übertragung aus dem Browser verloren. JPEG mit
Qualität 0,95: 191 KB je Bild, **38 s** für dasselbe Video. `export --png` bleibt für verlustfreie
Einzelbilder. Faustwert für die Planung: knapp 2 s Renderzeit je Videosekunde bei 1080p/30 fps.

## Zeit ist die einzige Quelle — sonst weicht der Export ab

Der Export ruft `renderAt(t)` Bild für Bild auf, nicht in Echtzeit. Alles, was nicht aus `t`
folgt (`Math.random()`, `Date.now()`, ein Zähler, der pro Bild hochzählt), sieht in der
Vorschau richtig aus und im Export anders. Zufall nur mit festem Seed, vorberechnet.
`M` existiert beim Laden des Videoteils noch nicht (die Laufzeit kommt danach) — für
Vorberechnungen ein eigener Generator, wie `rng` in `styles/klar/szenen.js`.

## Fehler brechen ab, statt still zu landen

Die Laufzeit sammelt Fehler, `motion.py` bricht dann mit Exit 3 ab: unbekannte Zeitmarke,
unbekannter Ton, Szene ohne Dauer, nicht geladene Schrift oder Bild, fehlende `woerter.json`.
Die Schrift-Prüfung heißt auch: **ohne Netz kein Export** mit Google-Fonts-Stilen — gewollt, ein
Export in der Ersatzschrift sähe anders aus und fiele niemandem auf.

## `file://` lädt keine Nebendateien — darum der lokale Server

Chromium blockiert `fetch()` auf `file://`. `video.html` mit `voice.words: "woerter.json"`
funktioniert deshalb nur über `motion.py` (lokaler Server auf 127.0.0.1, zufälliger Port, endet
mit dem Lauf). Die **gebündelte** Seite (`buendeln`) bettet Ton und Wörter ein und läuft per
Doppelklick.

## Transparenz: `M.text` multipliziert, eigene Zeichnungen sollten es auch

Eine vorher gesetzte Transparenz (`ctx.globalAlpha = out` zum Ausblenden der Szene) wirkt in
`M.text` mit. Eigene Helfer genauso schreiben: `ctx.globalAlpha *= …` innerhalb von `save/restore`.

## Untertitel brauchen Satzzeichen

Die Zeilen brechen an `.!?;:`, bei voller Zeile (42 Zeichen quer, 24 hoch) oder an einer
Sprechpause > 0,35 s. ElevenLabs liefert den Originaltext samt Satzzeichen; im Sprechertext also
Satzzeichen setzen.

## Testen ohne ElevenLabs-Guthaben

Für Tests der Synchronisation taugt unter Windows die eingebaute Sprachausgabe: `System.Speech`
mit einer deutschen Stimme (z. B. „Microsoft Hedda Desktop") schreibt eine WAV, das Ereignis
`SpeakProgress` liefert je Wort `AudioPosition` — daraus `woerter.json` bauen. Ein Prüfwerkzeug,
keine Produktionsstimme. Sie liefert Wörter **ohne** Satzzeichen, die Untertitel brechen dann schlechter.

## `[hidden]` gegen eigenes `display`

Ein Element mit `hidden`-Attribut und eigener CSS-Regel `display: flex` bleibt sichtbar. Die Vorlage
hat deshalb `[hidden] { display: none !important; }`.

## ElevenLabs — Formate

- Sprachausgabe mit Zeitmarken (API): `POST /v1/text-to-speech/{voice_id}/with-timestamps`, Header
  `xi-api-key`; Antwort `audio_base64` plus `alignment` mit `characters`,
  `character_start_times_seconds`, `character_end_times_seconds`. Ausgabe `mp3_44100_128`.
- Spracherkennung (Scribe): `words[]` mit `text`, `type` (`word`/`spacing`/`audio_event`), `start`, `end`.
- `motion.py woerter` setzt beide Formate um (`audio_event` wird herausgefiltert).

### Über den Connector in Claude

- **Alles läuft in einem „Flow“.** `generate_speech` mit `estimate_only: true` legt den Flow an und
  nennt die Kosten, ohne zu erzeugen (Credits ≈ Zeichen; 1.621 Zeichen ≈ 0,32 USD). Danach mit
  derselben `flow_id` erzeugen, `generations_count: 1` (Vorgabe 2 kostet doppelt).
- **Die Sprachausgabe liefert keine Zeitmarken**, nur Ton. `get_flow_run_status` gibt nach ~1 min
  `content_url` der MP3 (signiert, **2 h gültig** → sofort herunterladen).
- **Zeitmarken über Scribe:** `transcribe_audio` mit `connect_from: [<node_id der Sprachausgabe>]`
  und derselben `flow_id`. Ergebnis mit `words_download_url` (Scribe-Format) → `motion.py woerter`.
- 🚨 **Höchstens 5.000 Zeichen je Anfrage.** Die Schätzung mit `estimate_only` bepreist auch längere
  Texte ohne Einwand, der Fehler kommt erst beim Lauf. Teilen und mit `stimme_zusammen.py` verbinden.
- Fehlen die `creative_*`-Werkzeuge (Connector „verbunden“, aber nur eine Handvoll Werkzeuge):
  in den Connector-Einstellungen auf claude.ai freischalten, dann eine **neue** Sitzung starten.

## Untertitel in einer anderen Sprache als die Stimme

`captions: true` zeigt nur die **gesprochenen** Wörter. Für Untertitel in einer zweiten Sprache:
`captions: false`, je Satz eine Übersetzung (`untertitel.json`), die Satzzeiten aus `woerter.json`
abzählen und im `overlay` zeichnen. Chinesisch/Japanisch bricht nicht an Leerzeichen → eigener
Umbruch nach Breite, Satzzeichen nie an den Zeilenanfang.

⚠️ **CJK-Schrift von Google Fonts nur mit `&text=`.** Ohne den Parameter lädt `document.fonts.load()`
nur einen von rund hundert Teilen. Mit `&text=<alle Untertitelzeichen>` kommt **eine** Datei.

⚠️ **`voice.offset` verschiebt nur den Ton**, nicht `M.cue()` und nicht die eingebauten Untertitel.
Wer die Stimme verzögert, addiert den Versatz bei jeder Wort-Zeitmarke selbst (`M.cue(w) + OFF`).

## Einen Satz in eine fertige Stimme einsetzen

Ändert sich nur ein Satz, muss nicht die ganze Stimme neu entstehen: den Satz allein sprechen lassen
(Credits = Zeichen) und in der Mitte der Sprechpausen davor und danach einsetzen, Pegel an den alten
Satz angleichen, Zeitmarken verschieben.

⚠️ **Satzränder aus der Stille messen, nicht aus Scribe** — Scribe setzte das Wortende bis 0,37 s
hinter das Sprechende. Kurze Lücken **innerhalb** eines Worts (unter 0,15 s) sind keine Pause.

⚠️ **MP3 mit 128 kbit/s CBR neu kodieren senkt den Pegel der Stimme um ~0,44 dB.** Neu kodieren mit
`-q:a 0` (±0,01 dB), sonst klingt ein eingesetzter Satz lauter als sein Umfeld.

## Inhalt vor Länge

Bei Briefing- und Schulungsvideos zuerst den Inhalt vollständig schreiben, dann die Länge nennen
und bei Überlänge eine Teilung anbieten — nicht auf eine Zielzeit zusammenstreichen.
Planung in **Zeichen** (≈ 14,7 je Sekunde), nicht in Wörtern: ausgeschriebene Zahlen sind lange Wörter.

## Die Stimme wird über die Zeit leiser

ElevenLabs liefert bei langen Texten keinen festen Pegel; gemessen fiel eine Stimme in der zweiten
Hälfte um 6,9 dB ab. `motion.py pegel` gleicht jede Stimme an (Verlauf glätten σ = 3 s, dann auf
−17,5 dBFS).

⚠️ **Erst glätten, dann heben.** Ein fester Zielwert im selben Schritt stößt bei leisen Stimmen an
die Verstärkungsgrenze. Die Spitze begrenzt das Anheben, eine sehr leise Stimme landet flach, aber leiser.

⚠️ **Ein Pegel aus ungleich langen Abschnitten misst die Pausen.** Deshalb gleich lange Fenster
und nur Sprechanteile.

## Gesprochene Zahlen und Ziffern in den Untertiteln

ElevenLabs liest „62262“ als Zahl („zweiundsechzigtausend …“). Im Sprechertext deshalb ausschreiben,
wie gesprochen („sechs zwei zwei sechs zwei“), und für die Untertitel mit `woerter --ersetzen` zurück
in Ziffern setzen. Scribe gibt den Wortlaut samt Bindestrichen zurück („I-K-Prüfstand,“) — die
Ersetzungsfolgen müssen genau diese Schreibweise treffen; das Werkzeug nennt nie getroffene.
Abkürzungen mit Bindestrich („I-K“, „U-S-B“) spricht die Stimme als Buchstaben.

## Zeitmarken: Präfixtreffer zählen mit `#n` mit

`M.cue` vergleicht ab vier Buchstaben auch den **Wortanfang**: „Haut“ trifft „Hautrauigkeit“,
„dritte“ trifft „Drittens“. Das `#n` zählt diese Treffer mit — still und ohne Fehler. Darum
`scripts/zeitmarken_pruefen.py` vor dem Storyboard laufen lassen, oder ein eindeutiges Wort statt
`#n` nehmen, oder Szenenstarts als feste Zahlen aus `woerter.json` (erstes Wort des Kapitels minus 0,45 s).

## Layout-Kleinigkeiten

- **Überschrift und Fließtext:** Zeilenzahl der Überschrift mit `measureText` messen und den
  Fließtext darunter ansetzen, sonst Lücke oder Überlappung.
- **Beispielcodes in Bildern ohne Q, O, 0, I, 1** — verwechselbar je nach Schrift.
- **Leuchtschein:** Ein `createRadialGradient` in einem Rechteck, das kleiner ist als sein Radius,
  zeigt eine harte Kante. Gefüllt wird `cx − r … cx + r`, bei Bedarf per `clip()` begrenzt.

## 3D mit Three.js

Belegt mit `engine/three/beispiel-profil.js` (Alu-U-Profil, Lichtband, Kamerafahrt, 4 s):
Standbilder, Export (120 Bilder in 16 s), gebündelte Seite (1,0 MB).

- **Gleiche Zeit, gleiches Bild** — nur, solange die Szene **alles aus t** rechnet: keine
  `THREE.Clock`, kein `requestAnimationFrame`, kein `Math.random()` in `draw`. Zustand aus `setup3d`
  darf in `draw` nur **gesetzt** werden (Position, Intensität), nie fortgeschrieben.
- **Ohne Umgebungslicht wirkt Metall grau und matt.** `scene.environment = D.env` gehört in jede
  Szene mit `metalness > 0`.
- **Die Kamera entscheidet, ob man das Detail sieht** — im Storyboard prüfen, nicht erst in der MP4.
- **Gerendert wird ohne GPU** (SwiftShader im Export-Chromium): ~40 ms je Bild bei einer schlichten
  Szene. Schatten, viele Lichter und hohe Polygonzahl sind dort teurer. Weiche Schatten lieber 2D zeichnen.
- **Fehlt `three/`, bricht der Lauf laut ab** („3D nicht geladen: … HTTP 404“).
- 🚨 **WebGL-Kontext kann lautlos verloren gehen** (ANGLE auf Vulkan/SwiftShader): das Objekt fehlt,
  nur die 2D-Ebenen bleiben, keine Fehlermeldung. `motion.py` startet Chromium deshalb mit
  `--use-angle=swiftshader --enable-unsafe-swiftshader`. **Ein 3D-Standbild ohne Objekt heißt zuerst:
  Kontext prüfen.**
- **Die Importe werden zur Laufzeit umgeschrieben** (Blob-Adressen, `engine/three/README.md`). Die
  Dateien in `engine/three/` nie von Hand ändern, eine neue Version ersetzt alle drei gemeinsam.
