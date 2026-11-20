"""Mehrere ElevenLabs-Teile zu einer Stimme zusammensetzen, Scribe-Wörter mit Versatz zusammenführen.

Anlass: Der Flow nimmt bei creative_generate_speech höchstens 5.000 Zeichen je Prompt (gemessen:
8.135 Zeichen → Fehler). Längere Sprechertexte an Kapitelgrenzen teilen, jeden Teil in
derselben flow_id mit derselben Stimme erzeugen und durch Scribe schicken (0 Credits), dann hiermit verbinden.

Aufruf:
  python ~/.claude/skills/motion/scripts/stimme_zusammen.py <videoordner> \
      --teile teil-a.mp3 teil-b.mp3 --scribe scribe-a.json scribe-b.json [--pause 1.0]

Jeder Teil wird 0,05 s nach seinem letzten Wort abgeschnitten, dazwischen Stille bis `--pause` Sekunden.
Schreibt stimme-roh.mp3 (V0, verlustarm) und scribe-gesamt.json. Danach:
  python ~/.claude/skills/motion/scripts/motion.py woerter <ordner>/scribe-gesamt.json --out <ordner>/woerter.json
  python ~/.claude/skills/motion/scripts/motion.py pegel <ordner>      # gleicht die Teile im Pegel an
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg
import numpy as np

RATE = 44100
NACHLAUF = 0.05  # Sekunden nach dem letzten Wort eines Teils


def decode(ff, f):
    r = subprocess.run([ff, "-v", "error", "-i", str(f), "-f", "f32le", "-ac", "1", "-ar", str(RATE), "-"],
                       capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype=np.float32)


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("ordner")
    ap.add_argument("--teile", nargs="+", required=True)
    ap.add_argument("--scribe", nargs="+", required=True)
    ap.add_argument("--pause", type=float, default=1.0)
    a = ap.parse_args()
    if len(a.teile) != len(a.scribe) or len(a.teile) < 2:
        sys.exit("Je Teil genau eine Scribe-Datei, mindestens zwei Teile")
    d = Path(a.ordner)
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    stuecke, woerter, t0 = [], [], 0.0
    for i, (mp3, sj) in enumerate(zip(a.teile, a.scribe)):
        x = decode(ff, d / mp3)
        w = [v for v in json.loads((d / sj).read_text(encoding="utf-8"))["words"] if v.get("type", "word") == "word"]
        letzt = i == len(a.teile) - 1
        ende = max(v["end"] for v in w)
        if not letzt:
            x = x[: min(len(x), int(round((ende + NACHLAUF) * RATE)))]
        woerter += [dict(v, start=round(v["start"] + t0, 3), end=round(v["end"] + t0, 3)) for v in w]
        stuecke.append(x)
        print(f"Teil {i + 1}: {mp3} · Versatz {t0:.3f} s · {len(w)} Wörter · letztes Wort endet {ende:.3f} s")
        t0 += len(x) / RATE
        if not letzt:
            still = max(0, int(round((a.pause - NACHLAUF) * RATE)))
            stuecke.append(np.zeros(still, dtype=np.float32))
            t0 += still / RATE
    y = np.concatenate(stuecke)
    (d / "scribe-gesamt.json").write_text(json.dumps({"words": woerter}, ensure_ascii=False), encoding="utf-8")
    r = subprocess.run([ff, "-y", "-v", "error", "-f", "f32le", "-ar", str(RATE), "-ac", "1", "-i", "-",
                        "-c:a", "libmp3lame", "-q:a", "0", str(d / "stimme-roh.mp3")], input=y.tobytes())
    if r.returncode != 0:
        sys.exit("stimme-roh.mp3 konnte nicht geschrieben werden")
    print(f"Gesamt {len(y) / RATE:.3f} s · {len(woerter)} Wörter · letztes Wortende {woerter[-1]['end']:.3f} s")


if __name__ == "__main__":
    main()
