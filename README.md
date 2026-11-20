# Skills für Claude Code

## motion — Erklärvideos aus Code

Claude baut damit Motion-Graphics- und Erklärvideos aus reinem JavaScript: als MP4 und als
interaktive HTML-Seite, optional mit 3D (Three.js), künstlicher Stimme (ElevenLabs) und
wortgenauen Untertiteln. Kein Videogenerator, kein Abo, außer für die Stimme.

### Installation

In Claude Code (Desktop-App oder Terminal) nacheinander eingeben:

```
/plugin marketplace add GuideThomas/claude-skills
/plugin install motion@claude-skills
```

Danach Claude Code einmal neu starten. Beim ersten Video prüft Claude, ob die nötigen
Python-Pakete und der Browser für den Export da sind, und installiert sie nach Rückfrage
(einmalig, rund 200 MB). Voraussetzung ist Python 3.10 oder neuer.

Oder einfach Claude den Link zu diesem Repo geben und sagen: „Installiere mir das Plugin motion
von hier.“

### Benutzung

```
/motion:motion Erklärvideo, wie eine Wärmepumpe funktioniert, 30 Sekunden, 16:9
```

Oder ohne Befehl: „Mach mir ein Erklärvideo über …“. Claude fragt fehlende Eckpunkte ab
(Format, Stimme, Untertitel, 3D), zeigt ein Storyboard und liefert dann `video.mp4` und eine
eigenständige HTML-Seite. Die Videos landen unter `motion-videos/<kurzname>/` im Ordner, in
dem die Sitzung läuft.

### Updates

```
/plugin marketplace update claude-skills
```

### Stimme (optional)

Ohne Stimme gibt es Texteinblendungen und Töne. Für eine Sprecherstimme:

- **ElevenLabs-Connector in Claude** (Einstellungen → Connectors), dann kümmert sich Claude um alles, oder
- **eigener ElevenLabs-API-Schlüssel** als Umgebungsvariable `ELEVENLABS_API_KEY`. Den Schlüssel
  nie in den Chat kopieren.

Die Stimme kostet ElevenLabs-Credits (etwa 1 Credit je Zeichen). Claude nennt den Preis, bevor erzeugt wird.

### Getestet

Unter Windows 11: Anlegen, Storyboard, MP4-Export, 3D. macOS und Linux sollten genauso laufen,
sind aber ungeprüft.

Three.js 0.185.1 liegt unverändert bei (MIT-Lizenz, `engine/three/LICENSE`).
