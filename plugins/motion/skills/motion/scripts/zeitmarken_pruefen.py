"""Alle Zeitmarken im Videoteil gegen woerter.json prüfen — mit derselben Regel wie M.cue in engine/runtime.js.

Anlass: M.cue trifft ab vier Buchstaben auch Wörter, die so BEGINNEN, und `#n` zählt
diese Präfixtreffer mit. „dreißig#2“ landete deshalb in „dreißig Grad“ eines späteren Kapitels; „Haut“ trifft
„Hautrauigkeit“, „amerikanische“ trifft „amerikanischer“, „dritte“ trifft „Drittens“. Ein falscher Treffer meldet
keinen Fehler, er verschiebt nur still einen Auftritt.

Aufruf:
  python ~/.claude/skills/motion/scripts/zeitmarken_pruefen.py <videoordner> [--kapitel 0,7.48,46.42,…]

Liest den Videoteil aus video.html (zwischen den Marken), zieht jede Zeichenkette, die wie eine Zeitmarke
aussieht, und listet sie zeitlich sortiert mit dem getroffenen Wort. Mit --kapitel (Startzeiten der Kapitel in
Sekunden der Stimme) steht die Kapitelnummer dabei — so fällt ein Treffer im falschen Kapitel sofort auf.
Exit 1, wenn eine Zeitmarke nicht gefunden wird.
"""
import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

SFX = {"whoosh", "pop", "click", "tick", "ding", "chime", "rise", "thud", "type", "pad"}
SPEC = re.compile(r"^(.+?)(?:#(\d+))?(:ende)?([+-]\d+(?:\.\d+)?)?$")


def norm(s):
    # wie runtime.js: Kleinschreibung, NFC, nur Buchstaben und Ziffern
    return "".join(ch for ch in unicodedata.normalize("NFC", str(s).lower()) if ch.isalnum())


def cue(words, spec):
    name, nth, ende, off = SPEC.match(spec).groups()
    want, k, seen = norm(name), int(nth) if nth else 1, 0
    for w in words:
        n = norm(w["w"])
        if n == want or (len(want) >= 4 and n.startswith(want)):
            seen += 1
            if seen == k:
                return (w["e"] if ende else w["s"]) + (float(off) if off else 0), w["w"]
    return None, None


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("ordner")
    ap.add_argument("--kapitel", help="Startzeiten der Kapitel, kommagetrennt (Sekunden in der Stimme)")
    a = ap.parse_args()
    d = Path(a.ordner)
    if not d.is_dir():
        d = Path("motion-videos") / a.ordner
    html = (d / "video.html").read_text(encoding="utf-8")
    teil = html[html.index("/*@VIDEO-START@*/"): html.index("/*@VIDEO-ENDE@*/")]
    words = json.loads((d / "woerter.json").read_text(encoding="utf-8"))
    words = words["words"] if isinstance(words, dict) else words
    kap = [float(x) for x in a.kapitel.split(",")] if a.kapitel else None
    kandidaten = set(re.findall(r'"([^"\n]{2,40})"', teil))
    rows, fehlt = [], 0
    for sp in sorted(kandidaten):
        if sp in SFX or " " in sp or sp.startswith("#") or not re.search(r"[A-Za-zÄÖÜäöüß]", sp):
            continue
        t, wort = cue(words, sp)
        if t is None:
            # nur melden, wenn es eindeutig als Zeitmarke geschrieben ist (#n, :ende oder Versatz)
            if re.search(r"#\d|:ende|[+-]\d", sp):
                fehlt += 1
                rows.append((1e9, f"!! {sp:32s} NICHT GEFUNDEN"))
            continue
        k = f"Kap {max(i for i, v in enumerate(kap) if v <= t + 0.01) + 1:2d}  " if kap else ""
        rows.append((t, f"   {sp:32s} {t:8.2f} s  {k}{wort}"))
    for _, r in sorted(rows):
        print(r)
    print(f"{len(rows)} Zeitmarken · nicht gefunden: {fehlt}")
    print("Hinweis: Wörter ohne Treffer, die keine Zeitmarke sein sollen (Texte, Farben), fehlen in der Liste.")
    sys.exit(1 if fehlt else 0)


if __name__ == "__main__":
    main()
