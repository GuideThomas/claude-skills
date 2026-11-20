"""Werkzeug für /motion — Motion-Graphics- und Erklärvideos aus reinem JavaScript.

  neu <ordner> --stil <name> [--3d]     Video-Ordner anlegen: video.html aus Vorlage, Laufzeit und Stil;
                                        --3d kopiert Three.js nach <ordner>/three/
  standbilder <ordner> [--at 1,4.5,9]   Storyboard: ein Standbild je Szene (oder zu den Zeiten) + storyboard.png
  export <ordner> [--out video.mp4]     Bild für Bild rendern und mit Ton zur MP4 muxen
  buendeln <ordner> [--out x.html]      eigenständige HTML-Seite: Stimme, Wörter und Bilder eingebettet
  laufzeit <ordner>                     Laufzeit in video.html durch den Stand aus engine/runtime.js ersetzen
  stil-speichern <ordner> <name>        Videoteil und Kopf als neuen Stil unter styles/<name>/ ablegen
  woerter <alignment.json> [--out …] [--ersetzen e.json]
                                        ElevenLabs-Zeitmarken in woerter.json (je Wort) umsetzen; --ersetzen setzt
                                        gesprochene Zahlen für die Untertitel in Ziffern („sechs zwei“ → „62“)
  pegel <ordner> [--nur-messen]         Stimme über die Zeit angleichen: stimme-roh.mp3 -> stimme.mp3, danach messen

<ordner> ist ein Video-Ordner mit video.html; ohne Pfadtrenner liegt er unter ./motion-videos/ (im aktuellen Verzeichnis).
Exit-Codes: 0 ok · 2 Eingabe ungültig · 3 Video meldet Fehler · 4 Werkzeug fehlt · 5 Export unplausibel.
"""
import argparse
import base64
import functools
import json
import re
import shutil
import subprocess
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
ENGINE = SKILL / "engine"
STYLES = SKILL / "styles"
DEFAULT_ROOT = Path.cwd() / "motion-videos"
VIDEO_RE = re.compile(r"/\*@VIDEO-START@\*/\n?(.*?)/\*@VIDEO-ENDE@\*/", re.S)
RUNTIME_RE = re.compile(r"/\*@RUNTIME-START@\*/.*?/\*@RUNTIME-ENDE@\*/", re.S)
KOPF_RE = re.compile(r"<!--@KOPF-START@-->\n?(.*?)<!--@KOPF-ENDE@-->", re.S)
MIME = {".mp3": "audio/mpeg", ".wav": "audio/wav", ".svg": "image/svg+xml", ".png": "image/png",
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".js": "text/javascript"}
THREE_FILES = ("three.core.min.js", "three.module.min.js", "RoomEnvironment.js")


def die(msg: str, code: int = 2):
    print(f"FEHLER: {msg}")
    sys.exit(code)


def video_dir(arg: str) -> Path:
    p = Path(arg)
    if p.suffix == ".html":
        p = p.parent
    if not p.is_absolute() and len(p.parts) == 1:
        p = DEFAULT_ROOT / p
    return p


# ---------- Zusammenbau ----------

def assemble(kopf: str, video_js: str, runtime: str) -> str:
    html = (ENGINE / "vorlage.html").read_text(encoding="utf-8")
    html = html.replace("<!--@KOPF@-->", f"<!--@KOPF-START@-->\n{kopf.strip()}\n<!--@KOPF-ENDE@-->")
    html = VIDEO_RE.sub(lambda m: f"/*@VIDEO-START@*/\n{video_js.strip()}\n/*@VIDEO-ENDE@*/", html)
    return html.replace("/*@RUNTIME@*/", f"/*@RUNTIME-START@*/\n{runtime.strip()}\n/*@RUNTIME-ENDE@*/")


def cmd_neu(a):
    style = STYLES / a.stil
    if not (style / "szenen.js").exists():
        have = ", ".join(sorted(p.name for p in STYLES.iterdir() if (p / "szenen.js").exists()))
        die(f"Stil '{a.stil}' unbekannt (vorhanden: {have})")
    d = video_dir(a.ordner)
    if (d / "video.html").exists() and not a.force:
        die(f"{d / 'video.html'} existiert schon (--force überschreibt)")
    d.mkdir(parents=True, exist_ok=True)
    kopf = (style / "kopf.html").read_text(encoding="utf-8") if (style / "kopf.html").exists() else ""
    html = assemble(kopf, (style / "szenen.js").read_text(encoding="utf-8"),
                    (ENGINE / "runtime.js").read_text(encoding="utf-8"))
    (d / "video.html").write_text(html, encoding="utf-8")
    copied = []
    for f in sorted((style / "assets").glob("*")) if (style / "assets").is_dir() else []:
        shutil.copy2(f, d / f.name)
        copied.append(f.name)
    # Ein Stil mit 3D-Szenen (setup3d im Videoteil) braucht three/ immer, auch ohne --3d
    stil_3d = "setup3d(" in (style / "szenen.js").read_text(encoding="utf-8")
    if a.drei_d or stil_3d:
        ziel = d / "three"
        ziel.mkdir(exist_ok=True)
        for name in THREE_FILES:   # nur die Bibliothek, nicht die Beispieldatei
            shutil.copy2(ENGINE / "three" / name, ziel / name)
        copied.append("three/ (Three.js, Version in engine/three/README.md)")
    print(f"Angelegt: {d / 'video.html'}")
    print(f"Stil: {a.stil} (Vorlage: {style / 'szenen.js'})")
    print(f"Assets: {', '.join(copied) if copied else '-'}")
    if a.drei_d and not stil_3d:
        print("3D: im Videoteil `three: { core: \"three/three.core.min.js\", module: \"three/three.module.min.js\", "
              "room: \"three/RoomEnvironment.js\" }` und `setup3d` setzen, Muster in SKILL.md §5a")


def cmd_laufzeit(a):
    f = video_dir(a.ordner) / "video.html"
    html = f.read_text(encoding="utf-8")
    if not RUNTIME_RE.search(html):
        die("keine Laufzeit-Marker in video.html")
    runtime = (ENGINE / "runtime.js").read_text(encoding="utf-8").strip()
    f.write_text(RUNTIME_RE.sub(lambda m: f"/*@RUNTIME-START@*/\n{runtime}\n/*@RUNTIME-ENDE@*/", html), encoding="utf-8")
    print(f"Laufzeit ersetzt: {f}")


def cmd_stil_speichern(a):
    html = (video_dir(a.ordner) / "video.html").read_text(encoding="utf-8")
    m, k = VIDEO_RE.search(html), KOPF_RE.search(html)
    if not m:
        die("kein Videoteil (VIDEO-START/ENDE) in video.html")
    if not re.fullmatch(r"[a-z0-9-]+", a.name):
        die("Stilname nur aus a-z, 0-9 und Bindestrich")
    d = STYLES / a.name
    if (d / "szenen.js").exists() and not a.force:
        die(f"Stil '{a.name}' existiert schon (--force überschreibt)")
    d.mkdir(parents=True, exist_ok=True)
    (d / "szenen.js").write_text(m.group(1).strip() + "\n", encoding="utf-8")
    (d / "kopf.html").write_text((k.group(1).strip() if k else "") + "\n", encoding="utf-8")
    if not (d / "stil.md").exists():
        # Frontmatter hält die Datei aus der Skill-Liste.
        (d / "stil.md").write_text(f"---\ndescription: \"Stil: {a.name} (Hilfsdatei des Skills, nicht selbst aufrufen)\"\nuser-invocable: false\ndisable-model-invocation: true\n---\n\n# Stil: {a.name}\n\nTODO: Wirkung, Farben, Schrift, Bewegung, Töne — siehe styles/klar/stil.md als Muster.\n", encoding="utf-8")
    print(f"Stil gespeichert: {d}")
    print("Noch zu tun: stil.md ausfüllen; eingebettete Bilder als Dateien nach assets/ legen.")


# ---------- Wörter aus ElevenLabs-Zeitmarken ----------

def alignment_to_words(data: dict) -> list:
    """Zwei ElevenLabs-Quellen: Sprachausgabe `with-timestamps` (alignment je Zeichen) und
    Spracherkennung Scribe (`words` mit type word/spacing/audio_event, Zeiten in Sekunden)."""
    if "transcripts" in data and data["transcripts"]:
        data = data["transcripts"][0]
    if isinstance(data.get("words"), list):
        return [{"w": w["text"], "s": round(w["start"], 3), "e": round(w["end"], 3)}
                for w in data["words"] if w.get("type", "word") == "word" and w.get("start") is not None]
    al = data.get("alignment") or data.get("normalized_alignment") or data
    chars = al["characters"]
    starts, ends = al["character_start_times_seconds"], al["character_end_times_seconds"]
    words, cur = [], None
    for ch, s, e in zip(chars, starts, ends):
        if ch.isspace():
            if cur:
                words.append(cur)
                cur = None
            continue
        if cur is None:
            cur = {"w": ch, "s": round(s, 3), "e": round(e, 3)}
        else:
            cur["w"] += ch
            cur["e"] = round(e, 3)
    if cur:
        words.append(cur)
    return words


PUNKT = ".,:;!?"


def apply_replacements(words: list, rules: dict) -> list:
    """Gesprochene Folgen für die Anzeige ersetzen, z. B. „I-E-C sechs zwei zwei sechs zwei“ → „IEC 62262“.
    rules = {"folgen": [[gesprochen, anzeige], …], "zeichen": [[von, nach], …]}. Folgen: längste zuerst,
    ohne Groß-/Kleinschreibung und Satzzeichen; das Satzzeichen des letzten Worts bleibt, Zeit = erstes s … letztes e.
    Die Stimme bleibt unberührt — es ändert sich nur, was die Untertitel zeigen und wonach M.cue sucht."""
    norm = lambda w: w.rstrip(PUNKT).lower()
    seqs = sorted(([s.split(), d] for s, d in rules.get("folgen", [])), key=lambda r: -len(r[0]))
    used, out, i = {" ".join(s): 0 for s, _ in seqs}, [], 0
    while i < len(words):
        for seq, disp in seqs:
            n = len(seq)
            if [norm(w["w"]) for w in words[i:i + n]] == [x.lower() for x in seq]:
                last = words[i + n - 1]["w"]
                tail = last[len(last.rstrip(PUNKT)):]
                out.append({"w": disp + tail, "s": words[i]["s"], "e": words[i + n - 1]["e"]})
                used[" ".join(seq)] += 1
                i += n
                break
        else:
            out.append(dict(words[i]))
            i += 1
    for w in out:
        for a_, b_ in rules.get("zeichen", []):
            w["w"] = w["w"].replace(a_, b_)
    unused = [k for k, v in used.items() if v == 0]
    print(f"Ersetzt: {sum(used.values())} Folgen" + (f" · nie getroffen: {'; '.join(unused)}" if unused else ""))
    return out


def cmd_woerter(a):
    src = Path(a.datei)
    words = alignment_to_words(json.loads(src.read_text(encoding="utf-8")))
    if a.ersetzen:
        words = apply_replacements(words, json.loads(Path(a.ersetzen).read_text(encoding="utf-8")))
    out = Path(a.out) if a.out else src.with_name("woerter.json")
    out.write_text("[\n" + ",\n".join(json.dumps(w, ensure_ascii=False) for w in words) + "\n]\n", encoding="utf-8")
    print(f"Wörter: {len(words)}, Ende: {words[-1]['e'] if words else 0:.2f} s")
    print(f"Datei: {out}")


# ---------- Browser ----------

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class Session:
    """Lokaler HTTP-Server (nur 127.0.0.1) plus Chromium im Exportmodus."""

    def __init__(self, folder: Path):
        self.folder = folder

    def __enter__(self):
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            die("Playwright fehlt -> python -m pip install --user playwright; python -m playwright install chromium", 4)
        handler = functools.partial(Quiet, directory=str(self.folder))
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.pw = sync_playwright().start()
        # WebGL über ANGLE/SwiftShader (GL) statt der Vorgabe ANGLE/Vulkan: unter Vulkan ging der Kontext
        # in 3D-Szenen lautlos verloren, das Profil fehlte im Bild (gotchas.md §3D, 20.11.2026).
        self.browser = self.pw.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        self.page = self.browser.new_page(viewport={"width": 1280, "height": 720})
        self.page_errors = []
        self.page.on("pageerror", lambda e: self.page_errors.append(str(e)))
        self.page.on("console", lambda m: m.type == "error" and self.page_errors.append(m.text))
        url = f"http://127.0.0.1:{self.httpd.server_port}/video.html?export=1"
        self.page.goto(url)
        try:
            self.page.wait_for_function("window.__motionReady === true", timeout=45000)
        except Exception:
            die("Video wurde nicht bereit: " + ("; ".join(self.page_errors) or "Zeitüberschreitung"), 3)
        self.info = self.page.evaluate("window.__motion.info()")
        errs = self.info["errors"] + [e for e in self.page_errors if "[motion]" not in e]
        if errs:
            die("Video meldet Fehler:\n  - " + "\n  - ".join(errs), 3)
        return self

    def frame_png(self, t: float) -> bytes:
        url = self.page.evaluate("t => window.__motion.frame(t)", t)
        return base64.b64decode(url.split(",", 1)[1])

    def frames(self, times: list, mime: str) -> list:
        urls = self.page.evaluate("([ts, mime]) => ts.map(t => window.__motion.frame(t, mime, 0.95))", [times, mime])
        return [base64.b64decode(u.split(",", 1)[1]) for u in urls]

    def __exit__(self, *exc):
        self.browser.close()
        self.pw.stop()
        self.httpd.shutdown()


def ffmpeg_exe() -> str:
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        exe = shutil.which("ffmpeg")
        if not exe:
            die("ffmpeg fehlt -> python -m pip install --user imageio-ffmpeg", 4)
        return exe


# ---------- Standbilder ----------

def cmd_standbilder(a):
    d = video_dir(a.ordner)
    out = d / "storyboard"
    out.mkdir(exist_ok=True)
    for old in out.glob("*.png"):
        old.unlink()
    with Session(d) as s:
        info = s.info
        if a.at:
            shots = [(float(x), f"t={float(x):.1f}s") for x in a.at.split(",")]
        else:
            shots = [(sc["key"], sc["name"]) for sc in info["scenes"]]
        files = []
        for i, (t, label) in enumerate(shots, 1):
            f = out / f"{i:02d}-{re.sub(r'[^A-Za-z0-9äöüÄÖÜß]+', '-', label).strip('-')[:40]}.png"
            f.write_bytes(s.frame_png(min(t, info["duration"] - 1e-3)))
            files.append((f, t, label))
    sheet = contact_sheet(files, out / "storyboard.png", a.breite)
    print(f"Format: {info['W']}x{info['H']}, Dauer: {info['duration']:.1f} s, Szenen: {len(info['scenes'])}")
    for f, t, label in files:
        print(f"  {t:6.2f} s  {label}  -> {f.name}")
    print(f"Storyboard: {sheet}")


def contact_sheet(files, target: Path, width: int) -> Path:
    from PIL import Image, ImageDraw, ImageFont
    thumbs = []
    for f, t, label in files:
        im = Image.open(f).convert("RGB")
        im.thumbnail((width, width * 4))
        thumbs.append((im, f"{f.name[:2]} · {t:.1f} s · {label}"))
    cols = 3 if thumbs and thumbs[0][0].width >= thumbs[0][0].height else 4
    tw, th = thumbs[0][0].size
    lab, gap = 34, 16
    rows = (len(thumbs) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tw + (cols + 1) * gap, rows * (th + lab) + (rows + 1) * gap), (24, 24, 27))
    draw = ImageDraw.Draw(sheet)
    try:
        fnt = ImageFont.truetype("arial.ttf", 18)
    except OSError:
        fnt = ImageFont.load_default()
    for i, (im, text) in enumerate(thumbs):
        x = gap + (i % cols) * (tw + gap)
        y = gap + (i // cols) * (th + lab + gap)
        sheet.paste(im, (x, y))
        draw.text((x + 2, y + th + 8), text, fill=(220, 220, 225), font=fnt)
    sheet.save(target)
    return target


# ---------- Export ----------

def probe(ff: str, f: Path) -> dict:
    r = subprocess.run([ff, "-hide_banner", "-i", str(f)], capture_output=True, text=True, encoding="utf-8", errors="replace")
    dur = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r.stderr)
    return {
        "duration": int(dur.group(1)) * 3600 + int(dur.group(2)) * 60 + float(dur.group(3)) if dur else 0.0,
        "video": re.search(r"Video: (\w+).*?(\d{3,4}x\d{3,4})", r.stderr),
        "audio": re.search(r"Audio: (\w+)", r.stderr),
    }


def cmd_export(a):
    d = video_dir(a.ordner)
    out = Path(a.out) if a.out else d / "video.mp4"
    ff = ffmpeg_exe()
    started = time.time()
    with Session(d) as s:
        info = s.info
        fps = a.fps or info["fps"]
        n = max(1, round(info["duration"] * fps))
        audio = s.page.evaluate("window.__motion.audio()")
        wav = d / ".ton.wav"
        wav.write_bytes(base64.b64decode(audio["wav"]))
        mix_spread = None
        if info.get("voice"):   # gleichbleibende Lautstärke über das ganze Video
            xm, rm = decode_mono(ff, wav, 48000)
            mix_spread = level_report(window_levels(xm, rm), "Tonspur")
        # JPEG 0.95 statt PNG: bei Verläufen und Partikeln ist ein PNG-Bild ~2,5 MB gross und die
        # Übertragung aus dem Browser kostet ein Vielfaches des Zeichnens (gemessen 27.10.2026).
        mime, codec = ("image/png", "png") if a.png else ("image/jpeg", "mjpeg")
        cmd = [ff, "-y", "-hide_banner", "-loglevel", "error",
               "-f", "image2pipe", "-framerate", str(fps), "-c:v", codec, "-i", "-",
               "-i", str(wav),
               "-c:v", "libx264", "-preset", "medium", "-crf", str(a.crf), "-pix_fmt", "yuv420p",
               "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(out)]
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        batch, done, next_report = 6, 0, 0.25
        try:
            while done < n:
                times = [(done + i) / fps for i in range(min(batch, n - done))]
                for img in s.frames(times, mime):
                    proc.stdin.write(img)
                done += len(times)
                if done / n >= next_report:
                    print(f"  {done}/{n} Bilder ({time.time() - started:.0f} s)")
                    next_report += 0.25
        finally:
            proc.stdin.close()
            rc = proc.wait()
        wav.unlink(missing_ok=True)
    if rc != 0:
        die(f"ffmpeg brach ab (Exit {rc})", 5)
    pr = probe(ff, out)
    size_mb = out.stat().st_size / 1e6
    print(f"Datei: {out}")
    print(f"Bild: {pr['video'].group(1) + ' ' + pr['video'].group(2) if pr['video'] else 'FEHLT'}, {fps} fps, {n} Bilder")
    print(f"Ton: {pr['audio'].group(1) if pr['audio'] else 'FEHLT'}, Spitzenpegel {audio['peak']:.2f}")
    print(f"Dauer: {pr['duration']:.2f} s (Soll {info['duration']:.2f} s), Größe: {size_mb:.1f} MB, Renderzeit: {time.time() - started:.0f} s")
    problems = []
    if not pr["video"] or not pr["audio"]:
        problems.append("Bild- oder Tonspur fehlt")
    if abs(pr["duration"] - info["duration"]) > 0.5:
        problems.append("Dauer weicht um mehr als 0,5 s ab")
    if audio["peak"] < 0.01:
        problems.append("Tonspur ist stumm")
    if audio["peak"] > 0.99:
        problems.append("Tonspur übersteuert (Spitzenpegel >= 0.99) — mix-Werte senken")
    if mix_spread is not None and mix_spread > PEGEL_GRENZE_MIX:
        problems.append(f"Lautstärke schwankt um {mix_spread:.1f} dB (> {PEGEL_GRENZE_MIX} dB) — vorher motion.py pegel")
    if problems:
        die("Export unplausibel: " + "; ".join(problems), 5)


# ---------- Pegel ----------
# Die Stimme wurde in der zweiten Hälfte eines Videos leiser. ElevenLabs liefert
# bei langen Texten keinen gleichbleibenden Pegel; ein fester Faktor (mix.voice) gleicht das nicht
# aus. Gemessen wird in GLEICH LANGEN Fenstern und nur über Sprechanteile (Pausen würden sonst den
# Pegel eines Fensters mit vielen Pausen drücken und eine Drift vortäuschen oder verdecken).

PEGEL_FENSTER = 10.0     # s
PEGEL_GRENZE = 1.5       # dB, größte erlaubte Spanne der Fensterpegel einer Stimme
PEGEL_GRENZE_MIX = 2.0   # dB, dasselbe für die fertige Tonspur (Töne dürfen etwas beitragen)
PEGEL_ZIEL = -17.5       # dBFS der Sprechanteile — fest, damit auch verschiedene Videos gleich laut sind
                         # (ElevenLabs-Rohstimmen gemessen: −17,4 / −17,6; eine driftende: −27,8 → −36,5)


def decode_mono(ff: str, f: Path, rate: int = 44100):
    import numpy as np
    r = subprocess.run([ff, "-v", "error", "-i", str(f), "-ac", "1", "-ar", str(rate), "-f", "f32le", "-"],
                       capture_output=True)
    if r.returncode != 0 or not r.stdout:
        die(f"Ton nicht lesbar: {f}", 4)
    return np.frombuffer(r.stdout, dtype=np.float32).astype(np.float64), rate


def frame_energy(x, rate: int, frame: float = 0.05):
    """Energie je 50-ms-Rahmen und Maske der Sprechanteile (Rahmen bis 25 dB unter dem 95-%-Wert)."""
    import numpy as np
    n = int(rate * frame)
    k = len(x) // n
    e = (x[:k * n].reshape(k, n) ** 2).mean(axis=1)
    db = 10 * np.log10(e + 1e-12)
    loud = db[db > -80]
    ref = np.percentile(loud, 95) if loud.size else -80
    return e, db > ref - 25, frame


def window_levels(x, rate: int, fenster: float = PEGEL_FENSTER):
    """Pegel (dBFS, Energiemittel der Sprechrahmen) je gleich langem Fenster; Fenster mit < 20 % Sprache entfallen."""
    import numpy as np
    e, voiced, frame = frame_energy(x, rate)
    per = int(round(fenster / frame))
    out = []
    for i in range(0, len(e) - per // 2, per):
        ee, vv = e[i:i + per], voiced[i:i + per]
        if vv.sum() >= 0.2 * per:
            out.append((i * frame, 10 * np.log10(ee[vv].mean())))
    return out


def level_report(levels, label: str) -> float:
    if not levels:
        die(f"{label}: keine Sprechanteile gefunden", 5)
    vals = [v for _, v in levels]
    half = len(vals) // 2
    spread = max(vals) - min(vals)
    a = sum(vals[:half]) / max(1, half)
    b = sum(vals[half:]) / max(1, len(vals) - half)
    print(f"{label}: {len(vals)} Fenster à {PEGEL_FENSTER:.0f} s, Spanne {spread:.2f} dB, "
          f"1. Hälfte {a:.2f} dBFS, 2. Hälfte {b:.2f} dBFS (Δ {b - a:+.2f} dB)")
    print("  " + " ".join(f"{v:.1f}" for v in vals))
    return spread


def first_onset(x, rate: int) -> float:
    e, voiced, frame = frame_energy(x, rate)
    idx = voiced.nonzero()[0]
    return idx[0] * frame if idx.size else 0.0


def cmd_pegel(a):
    import numpy as np
    d = video_dir(a.ordner)
    ff = ffmpeg_exe()
    roh, ziel = d / "stimme-roh.mp3", d / "stimme.mp3"
    if a.nur_messen:   # nur lesen, nichts anlegen
        for f in (ziel, roh):
            if f.exists():
                x, rate = decode_mono(ff, f)
                level_report(window_levels(x, rate), f.name)
        return
    if not roh.exists():
        if not ziel.exists():
            die(f"weder {roh.name} noch {ziel.name} in {d}")
        shutil.copy2(ziel, roh)   # Original bleibt als stimme-roh.mp3 erhalten
        print(f"Original gesichert: {roh.name}")
    x, rate = decode_mono(ff, roh)
    level_report(window_levels(x, rate), "Vorher")
    # Örtlicher Pegel: Energie der Sprechrahmen, gaußgeglättet (σ = 3 s) — Pausen zählen nicht mit.
    e, voiced, frame = frame_energy(x, rate)
    sig = 3.0 / frame
    ker = np.exp(-0.5 * (np.arange(-int(4 * sig), int(4 * sig) + 1) / sig) ** 2)
    num = np.convolve(e * voiced, ker, mode="same")
    den = np.convolve(voiced.astype(float), ker, mode="same")
    ok = den > 1e-3 * ker.sum()
    local = np.full(len(e), np.nan)
    local[ok] = 10 * np.log10(num[ok] / den[ok] + 1e-12)
    idx = np.arange(len(e))
    local = np.interp(idx, idx[ok], local[ok])            # lange Pausen: Nachbarwert halten
    # Zwei Schritte: (1) den Verlauf auf den eigenen Mittelwert glätten, (2) die ganze Datei auf
    # PEGEL_ZIEL heben — begrenzt durch die Spitze. Ein fester Zielwert im ersten Schritt stieß bei
    # einer leisen Datei an die Verstärkungsgrenze und ließ die Drift stehen (gemessen).
    mean = 10 * np.log10(e[voiced].mean())
    gain_db = np.clip(mean - local, -15.0, 15.0)
    t_frames = (idx + 0.5) * frame * rate
    y = x * 10 ** (np.interp(np.arange(len(x)), t_frames, gain_db) / 20)
    shift = PEGEL_ZIEL - mean
    peak = np.abs(y).max() * 10 ** (shift / 20)
    if peak > 0.95:
        shift -= 20 * np.log10(peak / 0.95)               # einheitlich weniger anheben, Verlauf bleibt flach
    y *= 10 ** (shift / 20)
    gain_db = gain_db + shift
    # -q:a 0: 128 kbit/s CBR senkt den Pegel dieser Stimme um 0,44 dB (gotchas.md, 10.11.2026)
    r = subprocess.run([ff, "-y", "-v", "error", "-f", "f32le", "-ar", str(rate), "-ac", "1", "-i", "-",
                        "-c:a", "libmp3lame", "-q:a", "0", str(ziel)], input=y.astype(np.float32).tobytes())
    if r.returncode != 0:
        die("MP3 konnte nicht geschrieben werden", 4)
    z, _ = decode_mono(ff, ziel)
    nachher = level_report(window_levels(z, rate), "Nachher")
    versatz = (first_onset(z, rate) - first_onset(x, rate)) * 1000
    dauer = (len(z) - len(x)) / rate * 1000
    print(f"Verstärkung {gain_db.min():+.1f} … {gain_db.max():+.1f} dB · Spitze {np.abs(z).max():.2f} · "
          f"Versatz Sprechbeginn {versatz:+.0f} ms · Längenunterschied {dauer:+.0f} ms · Datei {ziel.name}")
    problems = []
    if nachher > PEGEL_GRENZE:
        problems.append(f"Spanne nach dem Ausgleich {nachher:.2f} dB > {PEGEL_GRENZE} dB")
    if abs(versatz) > 30 or abs(dauer) > 60:
        problems.append("Zeitlage verschoben — woerter.json passte dann nicht mehr")
    if problems:
        die("Pegel unplausibel: " + "; ".join(problems), 5)


# ---------- Bündeln ----------

def data_uri(f: Path) -> str:
    return f"data:{MIME.get(f.suffix.lower(), 'application/octet-stream')};base64,{base64.b64encode(f.read_bytes()).decode()}"


def cmd_buendeln(a):
    d = video_dir(a.ordner)
    html = (d / "video.html").read_text(encoding="utf-8")
    m = VIDEO_RE.search(html)
    if not m:
        die("kein Videoteil in video.html")
    js, inlined = m.group(1), []

    def inline_file(match):
        q, name = match.group(1), match.group(2)
        f = d / name
        if not f.exists():
            die(f"verwiesene Datei fehlt: {f}")
        inlined.append(name)
        if f.suffix == ".json":
            return json.dumps(json.loads(f.read_text(encoding="utf-8")), ensure_ascii=False, separators=(",", ":"))
        return q + data_uri(f) + q

    js = re.sub(r"""(["'])([\w./-]+\.(?:mp3|wav|json|svg|png|jpe?g|webp))\1""", inline_file, js)
    # Three.js (nur Pfade unter three/, damit kein anderes .js im Videoteil angefasst wird); die Laufzeit
    # lädt sie per fetch, das trägt auch für data:-Adressen
    js = re.sub(r"""(["'])(three/[\w.-]+\.js)\1""", inline_file, js)
    out = Path(a.out) if a.out else d / f"{d.name}.html"
    out.write_text(html[:m.start(1)] + js + html[m.end(1):], encoding="utf-8")
    size = out.stat().st_size / 1e6
    print(f"Eingebettet: {', '.join(inlined) if inlined else '-'}")
    print(f"Datei: {out} ({size:.1f} MB)")
    if size > 16:
        die("über 16 MB — als Artifact nicht veröffentlichbar", 5)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("neu"); p.add_argument("ordner"); p.add_argument("--stil", required=True); p.add_argument("--force", action="store_true")
    p.add_argument("--3d", dest="drei_d", action="store_true", help="Three.js nach <ordner>/three/ kopieren")
    p = sub.add_parser("standbilder"); p.add_argument("ordner"); p.add_argument("--at"); p.add_argument("--breite", type=int, default=640)
    p = sub.add_parser("export"); p.add_argument("ordner"); p.add_argument("--out"); p.add_argument("--fps", type=int); p.add_argument("--crf", type=int, default=18); p.add_argument("--png", action="store_true")
    p = sub.add_parser("buendeln"); p.add_argument("ordner"); p.add_argument("--out")
    p = sub.add_parser("laufzeit"); p.add_argument("ordner")
    p = sub.add_parser("stil-speichern"); p.add_argument("ordner"); p.add_argument("name"); p.add_argument("--force", action="store_true")
    p = sub.add_parser("woerter"); p.add_argument("datei"); p.add_argument("--out"); p.add_argument("--ersetzen")
    p = sub.add_parser("pegel"); p.add_argument("ordner"); p.add_argument("--nur-messen", action="store_true")
    a = ap.parse_args()
    {"neu": cmd_neu, "standbilder": cmd_standbilder, "export": cmd_export, "buendeln": cmd_buendeln,
     "laufzeit": cmd_laufzeit, "stil-speichern": cmd_stil_speichern, "woerter": cmd_woerter,
     "pegel": cmd_pegel}[a.cmd](a)
    return 0


if __name__ == "__main__":
    sys.exit(main())
