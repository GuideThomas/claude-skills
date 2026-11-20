// Beispiel-Videoteil für 3D (/motion §5a): Alu-U-Profil mit Lichtband, Kamerafahrt, 4 s.
// Belegt am 19.11.2026 bis zur MP4 und zur gebündelten Seite (gotchas.md §3D). Ordner mit --3d anlegen,
// dann diesen Teil zwischen /*@VIDEO-START@*/ und /*@VIDEO-ENDE@*/ einsetzen.
const VIDEO = {
  title: "3D-Probe",
  format: "16:9",
  duration: 4,
  style: { bg: "#0b1020" },
  three: { core: "three/three.core.min.js", module: "three/three.module.min.js", room: "three/RoomEnvironment.js" },
  // Einmal beim Laden: Szene bauen. Zurückgegeben wird, was die Szenen brauchen (api.three.welt).
  setup3d(THREE, D) {
    const scene = new THREE.Scene();
    scene.environment = D.env;                       // Umgebungslicht: ohne wirkt Metall grau und matt
    const form = new THREE.Shape();
    [[-1, 0], [1, 0], [1, 0.8], [0.88, 0.8], [0.88, 0.12], [-0.88, 0.12], [-0.88, 0.8], [-1, 0.8]]
      .forEach(([x, y], i) => (i ? form.lineTo(x, y) : form.moveTo(x, y)));
    const profil = new THREE.Mesh(new THREE.ExtrudeGeometry(form, { depth: 6, bevelEnabled: false }),
      new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 1, roughness: 0.28 }));
    profil.position.z = -3;
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.03, 6),
      new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd9a0, emissiveIntensity: 0 }));
    band.position.y = 0.15;
    scene.add(profil, band);
    const cam = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 100);
    return { scene, cam, band };
  },
  scenes: [
    {
      name: "Profil", start: 0, sounds: [{ at: 0.8, sfx: "rise", dur: 1.2, gain: 0.5 }, { at: 2.0, sfx: "ding", gain: 0.5, freq: 880 }],
      draw(ctx, t, s, M) {
        const { scene, cam, band } = M.three.welt;
        const w = 0.5 + t * 0.22;                     // alles aus t, keine Uhr
        cam.position.set(Math.sin(w) * 6, 4.2, Math.cos(w) * 6);
        cam.lookAt(0, 0.3, 0);
        band.material.emissiveIntensity = M.clamp((t - 0.8) / 1.2, 0, 1) * 2.5;
        M.three.render(ctx, scene, cam);
        ctx.fillStyle = "#f4f6fb"; ctx.font = "700 72px system-ui, sans-serif";
        ctx.globalAlpha = M.clamp(t / 0.6, 0, 1);
        ctx.fillText("Profil mit Lichtband", 96, 150);
      },
    },
  ],
};
