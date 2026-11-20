---
description: "/motion — Three.js-Ablage (Hilfsdatei des Skills, nicht selbst aufrufen)"
user-invocable: false
disable-model-invocation: true
---

# Three.js für /motion

**Version 0.185.1**, Lizenz MIT (`LICENSE`). Die Dateien sind unverändert übernommen, Quelle ist das
npm-Paket `three`:

- `build/three.core.min.js`, `build/three.module.min.js`
- `examples/jsm/environments/RoomEnvironment.js` (Umgebungslicht, damit Metall glänzt)

Sie liegen hier und nicht in einem `node_modules`, damit `/motion` auf jedem Rechner und im Container
gleich arbeitet und kein Download nötig ist. `motion.py neu … --3d` kopiert sie in den Video-Ordner nach
`three/`, `buendeln` bettet sie ein.

**Die Importe werden zur Laufzeit umgeschrieben, nicht in den Dateien.** `three.module.min.js` importiert
`./three.core.min.js`, und `RoomEnvironment.js` importiert `'three'`. Die Laufzeit (`engine/runtime.js`,
`load3d`) lädt alle drei als Text, setzt Blob-Adressen ein und importiert dann. So funktioniert derselbe
Weg mit Dateien im Ordner und mit eingebetteten `data:`-Adressen in der gebündelten Seite.

**Version heben:** alle drei Dateien aus **derselben** Version ersetzen, danach die 3D-Probe aus
`gotchas.md` §3D laufen lassen (gleicher Hash bei gleicher Zeit, keine Konsolenfehler).
