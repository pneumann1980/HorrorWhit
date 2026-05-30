'use strict';

// Room layout (XZ plane, Y=up):
// Start[-5,5]×[-5,5] → CorrA[5,18]×[-1.5,1.5] → Hub[18,30]×[-8,8]
// Hub north → Lab[18,30]×[-18,-8]  (doorway z=-8, x[20,26])
// Hub south → Storage[18,30]×[8,18] (doorway z=8, x[20,26])
// Hub east  → Security[30,42]×[-5,5] (doorway x=30, z[-1.5,1.5])
// Security  → TechCorr[42,52]×[-1.5,1.5] → TechRoom[52,64]×[-5,5]
// Exit door at x=64, z≈0 (locked until fuse+code)

class Level {
  constructor(scene) {
    this.scene = scene;
    this.zones = [];        // Walkable AABB list
    this.lights = [];       // All scene lights (for management)
    this.flickerGroups = []; // {lights, base, rate, phase}
    this.exitDoorMesh = null;
    this.exitUnlocked = false;
    this.fuseboxMesh = null;
    this.fuseInstalled = false;
    this.keypads = [];      // {mesh, code, onSuccess}

    // Materials (created once, reused)
    this._mats = {};
  }

  // ── Public API ───────────────────────────────────────────────────

  build() {
    this._initMaterials();
    this._buildGeometry();
    this._buildLights();
    this._buildZones();
  }

  reset() {
    this.exitUnlocked = false;
    this.fuseInstalled = false;
    if (this.exitDoorMesh) this.exitDoorMesh.visible = true;
    if (this.fuseboxMesh) {
      this.fuseboxMesh.material = this._mats.fusebox;
    }
  }

  update(delta, tension) {
    const t = performance.now() * 0.001;
    const ten = tension || 0;
    for (const g of this.flickerGroups) {
      const v = this._flicker(t, g.phase, g.rate, ten);
      for (const l of g.lights) l.intensity = g.base * v;
    }
  }

  unlockExit() {
    this.exitUnlocked = true;
    if (this.exitDoorMesh) this.exitDoorMesh.visible = false;
  }

  // Returns true if position (x,z) is in any walkable zone
  isValidPosition(x, z) {
    for (const z_ of this.zones) {
      if (x >= z_.x1 && x <= z_.x2 && z >= z_.z1 && z <= z_.z2) return true;
    }
    return false;
  }

  getPatrolWaypoints() {
    return [
      new THREE.Vector3(24, 0, 0),
      new THREE.Vector3(24, 0, -13),
      new THREE.Vector3(24, 0, 0),
      new THREE.Vector3(24, 0, 13),
      new THREE.Vector3(24, 0, 0),
      new THREE.Vector3(36, 0, 0),
      new THREE.Vector3(36, 0, 3),
      new THREE.Vector3(36, 0, 0),
    ];
  }

  // ── Materials ────────────────────────────────────────────────────

  _initMaterials() {
    const M = THREE.MeshLambertMaterial;
    this._mats = {
      // Mid-tone surfaces: the ambient * material_color formula needs
      // material colors in the 0x70–0x99 range to produce visible output
      wallGrey:    new M({ color: 0x909090 }),  // neutral concrete
      wallLab:     new M({ color: 0x7888a0 }),  // cool blue lab tile
      wallStorage: new M({ color: 0x887060 }),  // warm brown planks
      wallSec:     new M({ color: 0x686878 }),  // dark cool plaster
      wallTech:    new M({ color: 0x607068 }),  // dark teal server room
      floor:       new M({ color: 0x505050 }),  // dark concrete
      floorLab:    new M({ color: 0x4c5060 }),  // dark lab linoleum
      ceiling:     new M({ color: 0x303030 }),  // keep ceiling dark
      door:        new M({ color: 0x504030 }),
      doorFrame:   new M({ color: 0x604e38 }),
      metal:       new M({ color: 0x606060 }),
      crate:       new M({ color: 0x705838 }),
      desk:        new M({ color: 0x584838 }),
      screen:      new M({ color: 0x101018, emissive: 0x001030, emissiveIntensity: 0.8 }),
      fusebox:     new M({ color: 0x486048 }),
      fuseboxLit:  new M({ color: 0x406040, emissive: 0x006000, emissiveIntensity: 1.0 }),
      exitDoor:    new M({ color: 0x385038 }),
    };
  }

  // ── Geometry ─────────────────────────────────────────────────────

  _buildGeometry() {
    const H = 4;    // Room height
    const DH = 2.5; // Doorway height
    const T = 0.25; // Wall thickness

    // ── Start Room X[-5,5] Z[-5,5] ──
    this._floor(-5, 5, -5, 5);
    this._ceil(-5, 5, -5, 5);
    this._wall(0,  H/2, -5,   10, H, T, this._mats.wallGrey);  // N
    this._wall(0,  H/2,  5,   10, H, T, this._mats.wallGrey);  // S
    this._wall(-5, H/2,  0, T, H,  10, this._mats.wallGrey);  // W
    // E wall: door at z[-1.5,1.5]
    this._wallWithDoor(5, -5, 5, -1.5, 1.5, H, DH, T, 'E', this._mats.wallGrey);
    // Props
    this._box(-3, 0.4, -2, 0.8, 0.8, 0.8, this._mats.crate);      // crate
    this._box(2, 0.25, 3, 1.5, 0.05, 0.8, this._mats.desk);        // papers on floor proxy
    this._box(-2, 0.9, 2, 0.5, 1.8, 0.5, this._mats.metal);        // chair (upturned)

    // ── Corridor A X[5,18] Z[-1.5,1.5] ──
    this._floor(5, 18, -1.5, 1.5, this._mats.floor);
    this._ceil(5, 18, -1.5, 1.5);
    this._wall(11.5, H/2, -1.5, 13, H, T, this._mats.wallGrey); // N
    this._wall(11.5, H/2,  1.5, 13, H, T, this._mats.wallGrey); // S

    // ── Hub X[18,30] Z[-8,8] ──
    this._floor(18, 30, -8, 8);
    this._ceil(18, 30, -8, 8);
    // W wall (at x=18) with doorway z[-1.5,1.5]
    this._wallWithDoor(18, -8, 8, -1.5, 1.5, H, DH, T, 'W', this._mats.wallGrey);
    // E wall (at x=30) with doorway z[-1.5,1.5]
    this._wallWithDoor(30, -8, 8, -1.5, 1.5, H, DH, T, 'E', this._mats.wallGrey);
    // N wall (at z=-8) with doorway x[20,26]
    this._wallWithDoorNS(18, 30, -8, 20, 26, H, DH, T, this._mats.wallGrey);
    // S wall (at z=8) with doorway x[20,26]
    this._wallWithDoorNS(18, 30, 8, 20, 26, H, DH, T, this._mats.wallGrey);
    // Props: overturned desk in hub
    this._box(21, 0.4, 3, 2, 0.8, 0.9, this._mats.desk);
    this._box(27, 0.4, -4, 0.5, 0.8, 2, this._mats.metal); // file cabinet

    // ── Lab X[18,30] Z[-18,-8] ──
    this._floor(18, 30, -18, -8, this._mats.floorLab);
    this._ceil(18, 30, -18, -8);
    this._wall(24, H/2, -18, 12, H, T, this._mats.wallLab);  // N wall
    this._wall(18, H/2, -13, T, H, 10, this._mats.wallLab);  // W wall
    this._wall(30, H/2, -13, T, H, 10, this._mats.wallLab);  // E wall
    // S wall of lab mirrors hub N (same opening at x[20,26])
    this._wallWithDoorNS(18, 30, -8, 20, 26, H, DH, T, this._mats.wallLab);
    // Lab props: tables, equipment
    this._box(20, 1.0, -14, 4, 0.1, 1.2, this._mats.metal);  // lab bench
    this._box(26, 1.0, -14, 4, 0.1, 1.2, this._mats.metal);
    this._box(22, 2.0, -14, 0.4, 0.6, 0.4, this._mats.screen); // monitor
    this._box(19.5, 0.5, -12, 0.8, 1.0, 0.6, this._mats.metal); // equipment
    this._box(29, 0.5, -16, 0.6, 1.0, 2.0, this._mats.metal);  // shelf

    // ── Storage X[18,30] Z[8,18] ──
    this._floor(18, 30, 8, 18, this._mats.floor);
    this._ceil(18, 30, 8, 18);
    this._wall(24, H/2, 18,  12, H, T, this._mats.wallStorage); // S wall
    this._wall(18, H/2, 13, T, H, 10, this._mats.wallStorage);  // W
    this._wall(30, H/2, 13, T, H, 10, this._mats.wallStorage);  // E
    this._wallWithDoorNS(18, 30, 8, 20, 26, H, DH, T, this._mats.wallStorage);
    // Props: crates, shelves
    this._box(20, 0.4, 15, 2.0, 0.8, 0.8, this._mats.crate);
    this._box(21, 1.2, 15, 2.0, 0.8, 0.8, this._mats.crate);
    this._box(27, 0.4, 16, 1.5, 0.8, 1.5, this._mats.crate);
    this._box(19, 0.5, 10, 0.3, 2.5, 3.5, this._mats.metal);   // shelf rack
    this._box(29, 0.5, 11, 0.3, 2.5, 4.0, this._mats.metal);

    // ── Security Room X[30,42] Z[-5,5] ──
    this._floor(30, 42, -5, 5);
    this._ceil(30, 42, -5, 5);
    this._wall(36, H/2, -5, 12, H, T, this._mats.wallSec); // N
    this._wall(36, H/2,  5, 12, H, T, this._mats.wallSec); // S
    this._wallWithDoor(30, -5, 5, -1.5, 1.5, H, DH, T, 'W', this._mats.wallSec);
    this._wallWithDoor(42, -5, 5, -1.5, 1.5, H, DH, T, 'E', this._mats.wallSec);
    // Props: security desk, monitors
    this._box(35, 1.0, 0, 4.0, 0.1, 1.5, this._mats.metal); // desk surface
    this._box(35, 0.4, 0, 3.8, 0.8, 1.3, this._mats.desk);  // desk body
    this._box(34, 2.0, 0, 0.5, 0.6, 0.4, this._mats.screen);
    this._box(35.5, 2.0, 0, 0.5, 0.6, 0.4, this._mats.screen);
    this._box(40, 0.4, -3, 0.8, 0.8, 0.8, this._mats.crate);

    // ── Tech Corridor X[42,52] Z[-1.5,1.5] ──
    this._floor(42, 52, -1.5, 1.5, this._mats.floor);
    this._ceil(42, 52, -1.5, 1.5);
    this._wall(47, H/2, -1.5, 10, H, T, this._mats.wallTech); // N
    this._wall(47, H/2,  1.5, 10, H, T, this._mats.wallTech); // S
    // Pipes on wall
    this._box(47, 3.2, -1.4, 8, 0.2, 0.2, this._mats.metal);

    // ── Tech Room X[52,64] Z[-5,5] ──
    this._floor(52, 64, -5, 5);
    this._ceil(52, 64, -5, 5);
    this._wall(58, H/2, -5, 12, H, T, this._mats.wallTech); // N
    this._wall(58, H/2,  5, 12, H, T, this._mats.wallTech); // S
    this._wallWithDoor(52, -5, 5, -1.5, 1.5, H, DH, T, 'W', this._mats.wallTech); // W
    // E wall (exit) with door
    this._wallWithDoor(64, -5, 5, -1.5, 1.5, H, DH, T, 'E', this._mats.wallTech);
    // Server racks
    this._box(55, 1.75, -3.5, 1.5, 3.5, 1.0, this._mats.metal);
    this._box(55, 1.75,  3.5, 1.5, 3.5, 1.0, this._mats.metal);
    this._box(58, 1.75, -4.0, 1.5, 3.5, 1.0, this._mats.metal);
    this._box(58, 1.75,  4.0, 1.5, 3.5, 1.0, this._mats.metal);
    this._box(61, 1.75, -3.5, 1.5, 3.5, 1.0, this._mats.metal);
    this._box(61, 1.75,  3.5, 1.5, 3.5, 1.0, this._mats.metal);
    // Glowing server indicators (emissive material)
    const serverLitMat = new THREE.MeshLambertMaterial({color:0x002010, emissive:0x002010, emissiveIntensity:1});
    this._box(55, 1.0, -3.5, 1.3, 0.05, 0.8, serverLitMat);

    // Fusebox on N wall of tech room
    this.fuseboxMesh = this._box(55, 1.5, -4.85, 0.6, 0.8, 0.1, this._mats.fusebox);
    this.fuseboxMesh.userData.interactable = true;
    this.fuseboxMesh.userData.type = 'fusebox';
    this.fuseboxMesh.userData.label = 'Sicherungskasten';

    // Exit door mesh (blocks the opening at x=64)
    const exitGeo = new THREE.BoxGeometry(0.15, DH, 3.0);
    this.exitDoorMesh = new THREE.Mesh(exitGeo, this._mats.exitDoor);
    this.exitDoorMesh.position.set(64, DH/2, 0);
    this.scene.add(this.exitDoorMesh);

    // Exit keypad marker (small box on south side of exit)
    const kpGeo = new THREE.BoxGeometry(0.1, 0.3, 0.2);
    const kpMat = new THREE.MeshLambertMaterial({color:0x204020, emissive:0x002000, emissiveIntensity:0.5});
    const kp = new THREE.Mesh(kpGeo, kpMat);
    kp.position.set(63.9, 1.5, 1.8);
    kp.userData.interactable = true;
    kp.userData.type = 'exitkeypad';
    kp.userData.label = 'Zugangscode eingeben';
    this.scene.add(kp);
    this.keypads.push(kp);
  }

  // ── Lights ───────────────────────────────────────────────────────

  _buildLights() {
    // KEY FIX: ambient must be WHITE (or near-white) at decent intensity.
    // MeshLambertMaterial formula: finalColor = materialColor × (ambientColor × ambientIntensity + Σlights)
    // 0x1a ambient * 0x90 wall = 0.10 * 0.56 = 0.056 (nearly black!)
    // 0xff ambient * 0.45 intensity * 0x90 wall = 1.0 * 0.45 * 0.56 = 0.25 (visible dark grey) ✓
    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(ambient);

    // Start room – warm overhead lamp (flickering)
    this._pointLight(0,   3.5,  0,   0xffb870, 3.5, 22, true,  0.8);

    // Corridor A – two overhead lamps
    this._pointLight(9,   3.5,  0,   0xffb040, 2.5, 16, true,  0.5);
    this._pointLight(15,  3.5,  0,   0xffb040, 2.2, 14, false, 0);

    // Hub – main overhead + two fill lights
    this._pointLight(24,  3.6,  0,   0xffd090, 4.0, 24, true,  1.0);
    this._pointLight(21,  3.5, -5,   0xffb060, 1.8, 14, true,  0.6);
    this._pointLight(27,  3.5,  5,   0xffb060, 1.8, 14, true,  0.4);

    // Lab – cold fluorescent (three lights for even 12×10 coverage)
    this._pointLight(21,  3.5, -12,  0xd8eeff, 3.0, 18, false, 0);
    this._pointLight(27,  3.5, -12,  0xd8eeff, 2.8, 16, false, 0);
    this._pointLight(24,  3.5, -16,  0xc8e8ff, 2.0, 14, false, 0);

    // Storage – warm incandescent
    this._pointLight(22,  3.5,  12,  0xffb060, 2.8, 18, true,  0.4);
    this._pointLight(27,  3.5,  15,  0xffa050, 2.0, 14, true,  0.5);

    // Security room – eerie red emergency light
    this._pointLight(36,  3.0,  0,   0xff2800, 3.0, 20, true,  1.5);
    this._pointLight(40,  2.5,  0,   0xcc1000, 1.5, 12, false, 0);

    // Tech corridor – green emergency strip
    this._pointLight(47,  3.5,  0,   0x60ff90, 2.5, 16, false, 0);

    // Tech room – server rack glow + ceiling panels
    this._pointLight(55,  2.5,  0,   0x5090ff, 2.5, 16, false, 0);
    this._pointLight(60,  2.5,  0,   0x30d060, 2.2, 14, true,  0.3);
    this._pointLight(63,  2.5,  0,   0x3060c0, 2.0, 14, false, 0);
  }

  _pointLight(x, y, z, color, intensity, dist, flicker, rate) {
    const light = new THREE.PointLight(color, intensity, dist);
    light.position.set(x, y, z);
    this.scene.add(light);
    this.lights.push(light);
    if (flicker) {
      this.flickerGroups.push({
        lights: [light],
        base: intensity,
        rate,
        phase: Math.random() * Math.PI * 2
      });
    }
    return light;
  }

  _flicker(t, phase, rate, tension) {
    const f1 = 0.5 + 0.5 * Math.sin((t * 2.3 + phase) * rate);
    const f2 = 0.5 + 0.5 * Math.sin((t * 5.1 + phase * 1.7) * rate);
    const glitchChance = 0.003 + (tension || 0) * 0.04;
    const glitch = Math.random() < glitchChance ? 0.06 : 1.0;
    const tensionDim = 1 - (tension || 0) * 0.4 * (0.5 + 0.5 * Math.sin(t * 7));
    return Math.max(0.04, (f1 * 0.5 + f2 * 0.3 + 0.2) * glitch * tensionDim);
  }

  // ── Walkable zones ───────────────────────────────────────────────

  _buildZones() {
    const R = 0.35; // Player collision radius
    this.zones = [
      // Start room (no shrink on east – corridor connection)
      {x1:-4.65, x2:5,    z1:-4.65, z2:4.65,  name:'start'},
      // Corridor A
      {x1:5,     x2:18,   z1:-1.15, z2:1.15,  name:'corrA'},
      // Hub (shrunk east/north/south for partial doorways)
      {x1:18,    x2:29.65,z1:-7.65, z2:7.65,  name:'hub'},
      // Lab body (south shrunk away from hub boundary)
      {x1:18.35, x2:29.65,z1:-17.65,z2:-8.35, name:'lab'},
      // Lab passage (doorway z=-8, x[20,26])
      {x1:20.35, x2:25.65,z1:-8.35, z2:-7.65, name:'lab_pass'},
      // Storage body
      {x1:18.35, x2:29.65,z1:8.35,  z2:17.65, name:'storage'},
      // Storage passage (doorway z=8)
      {x1:20.35, x2:25.65,z1:7.65,  z2:8.35,  name:'storage_pass'},
      // Hub-Security passage (doorway x=30, z[-1.5,1.5])
      {x1:29.65, x2:30.35,z1:-1.15, z2:1.15,  name:'hub_sec_pass'},
      // Security room (shrunk west and east)
      {x1:30.35, x2:41.65,z1:-4.65, z2:4.65,  name:'security'},
      // Security-TechCorr passage (doorway x=42)
      {x1:41.65, x2:42.35,z1:-1.15, z2:1.15,  name:'sec_tech_pass'},
      // Tech corridor
      {x1:42,    x2:52,   z1:-1.15, z2:1.15,  name:'techCorr'},
      // Tech room (shrunk east toward exit)
      {x1:52,    x2:63.65,z1:-4.65, z2:4.65,  name:'tech'},
    ];
  }

  // ── Geometry helpers ─────────────────────────────────────────────

  _floor(x1, x2, z1, z2, mat) {
    const w = x2 - x1, d = z2 - z1;
    const geo = new THREE.PlaneGeometry(w, d);
    const m = new THREE.Mesh(geo, mat || this._mats.floor);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x1+x2)/2, 0, (z1+z2)/2);
    m.receiveShadow = true;
    this.scene.add(m);
  }

  _ceil(x1, x2, z1, z2, mat) {
    const w = x2-x1, d = z2-z1;
    const geo = new THREE.PlaneGeometry(w, d);
    const m = new THREE.Mesh(geo, mat || this._mats.ceiling);
    m.rotation.x = Math.PI / 2;
    m.position.set((x1+x2)/2, 4, (z1+z2)/2);
    this.scene.add(m);
  }

  _wall(cx, cy, cz, sx, sy, sz, mat) {
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    const mesh = new THREE.Mesh(geo, mat || this._mats.wallGrey);
    mesh.position.set(cx, cy, cz);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  _box(cx, cy, cz, sx, sy, sz, mat) {
    return this._wall(cx, cy, cz, sx, sy, sz, mat);
  }

  // Vertical wall along Z axis (at fixed x) with doorway at z[dz1,dz2]
  _wallWithDoor(x, zFrom, zTo, dz1, dz2, H, DH, T, side, mat) {
    const h = H, dh = DH;
    // Lower-south segment (z > dz2 to zTo)
    if (zTo > dz2) {
      const len = zTo - dz2;
      this._wall(x, h/2, (dz2+zTo)/2, T, h, len, mat);
    }
    // Lower-north segment (zFrom to dz1)
    if (dz1 > zFrom) {
      const len = dz1 - zFrom;
      this._wall(x, h/2, (zFrom+dz1)/2, T, h, len, mat);
    }
    // Top over doorway (dh to H)
    if (H > DH) {
      const topH = H - DH;
      const len = dz2 - dz1;
      this._wall(x, DH + topH/2, (dz1+dz2)/2, T, topH, len, mat);
    }
  }

  // Horizontal wall along X axis (at fixed z) with doorway at x[dx1,dx2]
  _wallWithDoorNS(xFrom, xTo, z, dx1, dx2, H, DH, T, mat) {
    const h = H, dh = DH;
    if (dx1 > xFrom) {
      const len = dx1 - xFrom;
      this._wall((xFrom+dx1)/2, h/2, z, len, h, T, mat);
    }
    if (xTo > dx2) {
      const len = xTo - dx2;
      this._wall((dx2+xTo)/2, h/2, z, len, h, T, mat);
    }
    if (H > DH) {
      const topH = H - DH;
      const len = dx2 - dx1;
      this._wall((dx1+dx2)/2, DH + topH/2, z, len, topH, T, mat);
    }
  }
}
