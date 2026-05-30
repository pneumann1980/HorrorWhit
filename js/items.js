'use strict';

// All collectibles, interactables and pickup logic
class ItemManager {
  constructor(scene, ui, audio) {
    this.scene = scene;
    this.ui = ui;
    this.audio = audio;

    this.items = [];          // All spawned items
    this.collected = new Set();
    this.inventory = [];      // item types player carries

    this.hasFuse = false;
    this.fuseInstalled = false;
    this.notesFound = 0;
    this.currentNote = null;
    this.exitCodeKnown = false;
    this.onWin = null;        // Called when exit opened

    this._bobTime = 0;
  }

  // ── Notes content ────────────────────────────────────────────────

  static NOTES = {
    note0: {
      title: 'TAGEBUCH – TAG 47',
      text: `Dr. Vasquez – Tag 47

Das Stromnetz ist um 03:00 Uhr wieder ausgefallen.
Hansen sagt, die Ersatzsicherungen liegen im Labor.
Er sagt es, als wäre alles in Ordnung.

Ist es nicht.

Seit Wochen stimmen die Messwerte nicht mehr.
Die Isolationskammer in Bereich B... ich weiß nicht
was da unten noch lebt.

Wir sollten gehen. Jetzt sofort.

[Rest der Seite zerrissen]`
    },
    note1: {
      title: 'WARTUNGSPROTOKOLL – ANLAGE B',
      text: `Wartungsprotokoll – Anlage Sub-Level B
Ref: Stromausfall #12

Zur Wiederherstellung der Ausgangstür:
→ Ersatzsicherung in Sicherungskasten (Technikraum)
   einsetzen.
→ Ersatzsicherung befindet sich im Labor
   (Ostseite, hinteres Regal).

Notfall-Override-Code für Ausgangstür:
       4 – 2 – 9 – 1

   — Facility Engineering Dept.`
    },
    note2: {
      title: 'NOTIZ – HANDSCHRIFT',
      text: `Ich höre es jetzt die ganze Zeit.

Nicht mit den Ohren. Woanders.

Als würde jemand die Frequenz meiner Gedanken
aufzeichnen. Als würde es lernen.

Tag 1 haben wir es entdeckt.
Tag 12 hat es angefangen, uns zu beobachten.
Tag 23 sind die ersten verschwunden.
Tag 47 – heute – bin ich noch hier.

Aber nicht allein.

Falls du das liest: das Einzige, was es aufhält,
ist das Licht. Halte die Taschenlampe bereit.

Lauf nicht. Es liebt die Bewegung.`
    },
    note3: {
      title: 'SICHERHEITSBERICHT',
      text: `ZUGANGSBERICHT – SICHERHEITSRAUM

Kamera 3 (Korridor B): AUSGEFALLEN
Kamera 7 (Labor): AUSGEFALLEN
Kamera 9 (Lager): RAUSCHEN

Anmerkung des Leitenden Sicherheitsbeamten:
"Überprüfen Sie die Kabelschächte nicht selbst.
Schicken Sie niemanden allein.
Es ist noch da drin."

Alle Personalkarten gesperrt seit Tag 31.
Notausgang gesichert. Code liegt im System.`
    }
  };

  // ── Build all items ───────────────────────────────────────────────

  placeItems() {
    // Notes
    this._spawnNote(-2.5, -3, 'note0');       // Start room
    this._spawnNote(22,   -14, 'note1');       // Lab (has code!)
    this._spawnNote(22,   14, 'note2');        // Storage
    this._spawnNote(34,    2, 'note3');        // Security room

    // Batteries
    this._spawnBattery(2, 2);                  // Start room
    this._spawnBattery(27, 13);                // Storage room

    // Fuse
    this._spawnFuse(28, -15);                  // Lab, east shelf

    // Exit battery bonus
    this._spawnBattery(60, 3);                 // Tech room
  }

  _spawnNote(x, z, key) {
    const geo = new THREE.BoxGeometry(0.3, 0.35, 0.02);
    const mat = new THREE.MeshLambertMaterial({ color: 0xe8dfc8 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 1.1, z);
    mesh.rotation.y = (Math.random() - 0.5) * 0.4;
    mesh.userData = { interactable: true, type: 'note', key, collected: false };
    this.scene.add(mesh);
    this.items.push(mesh);

    // Subtle glow
    const geoG = new THREE.SphereGeometry(0.25, 6, 6);
    const matG = new THREE.MeshBasicMaterial({ color: 0xfff8e0, transparent: true, opacity: 0.07 });
    const glow = new THREE.Mesh(geoG, matG);
    glow.position.copy(mesh.position);
    this.scene.add(glow);
    mesh.userData.glow = glow;
  }

  _spawnBattery(x, z) {
    const geo = new THREE.CylinderGeometry(0.06, 0.06, 0.25, 8);
    const mat = new THREE.MeshLambertMaterial({ color: 0x404040 });
    const mesh = new THREE.Mesh(geo, mat);
    // gold top
    const topGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.04, 8);
    const topMat = new THREE.MeshLambertMaterial({ color: 0xd0a000, emissive: 0x604000, emissiveIntensity: 0.3 });
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.y = 0.145;
    mesh.add(top);
    mesh.position.set(x, 0.5, z);
    mesh.userData = { interactable: true, type: 'battery', collected: false };
    this.scene.add(mesh);
    this.items.push(mesh);
  }

  _spawnFuse(x, z) {
    const geo = new THREE.CylinderGeometry(0.06, 0.06, 0.2, 8);
    const mat = new THREE.MeshLambertMaterial({ color: 0x806000, emissive: 0x402000, emissiveIntensity: 0.2 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.z = Math.PI / 2;
    mesh.position.set(x, 1.0, z);
    mesh.userData = { interactable: true, type: 'fuse', collected: false };
    this.scene.add(mesh);
    this.items.push(mesh);
  }

  // ── Per-frame ────────────────────────────────────────────────────

  update(delta) {
    this._bobTime += delta;
    const bob = Math.sin(this._bobTime * 2) * 0.04;
    for (const item of this.items) {
      if (item.userData.collected) continue;
      item.position.y += bob * delta * 3;    // gentle float
      item.rotation.y += delta * 0.5;
      if (item.userData.glow) {
        item.userData.glow.material.opacity = 0.04 + 0.04 * Math.sin(this._bobTime * 1.5);
        item.userData.glow.position.copy(item.position);
      }
    }
  }

  reset() {
    // Remove existing items
    for (const item of this.items) {
      this.scene.remove(item);
      if (item.userData.glow) this.scene.remove(item.userData.glow);
    }
    this.items = [];
    this.collected.clear();
    this.inventory = [];
    this.hasFuse = false;
    this.fuseInstalled = false;
    this.notesFound = 0;
    this.exitCodeKnown = false;
    this.currentNote = null;
    this.placeItems();
  }

  // ── Interaction ───────────────────────────────────────────────────

  // Returns nearest interactable within reach, or null
  getNearestInteractable(playerPos, level) {
    const REACH = 2.2;
    let best = null, bestDist = REACH;

    for (const item of this.items) {
      if (item.userData.collected) continue;
      const d = playerPos.distanceTo(item.position);
      if (d < bestDist) { bestDist = d; best = item; }
    }

    // Check level interactables (fusebox, exit keypad)
    if (level) {
      if (level.fuseboxMesh && !level.fuseInstalled) {
        const d = playerPos.distanceTo(level.fuseboxMesh.position);
        if (d < bestDist) { bestDist = d; best = level.fuseboxMesh; }
      }
      if (!level.exitUnlocked) {
        for (const kp of level.keypads) {
          const d = playerPos.distanceTo(kp.position);
          if (d < bestDist) { bestDist = d; best = kp; }
        }
      }
      // Exit door check (win condition)
      if (level.exitUnlocked && level.exitDoorMesh) {
        const d = playerPos.distanceTo(new THREE.Vector3(64, 1.7, 0));
        if (d < 2.5) return { type: 'exit', label: 'Anlage verlassen' };
      }
    }

    return best;
  }

  interact(item, level, player) {
    if (!item) return;

    // Exit trigger
    if (item.type === 'exit') {
      if (this.onWin) this.onWin();
      return;
    }

    const type = item.userData?.type;

    if (type === 'note') {
      const noteData = ItemManager.NOTES[item.userData.key];
      if (noteData) {
        this.ui.showNote(`— ${noteData.title} —\n\n${noteData.text}`);
        this.audio.playCollect();
        this.notesFound++;
        this.ui.updateInventory(this.inventory);
        if (item.userData.key === 'note1') {
          this.exitCodeKnown = true;
          this.ui.showNotification('Code gefunden: 4-2-9-1', 5);
        }
        // Mark note glow off but keep collectible if not already flagged
        if (item.userData.glow) item.userData.glow.visible = false;
      }
      return; // note is not "consumed"
    }

    if (type === 'battery') {
      this._collect(item);
      this.audio.playBatteryPickup();
      player.rechargeBattery(0.5);
      this.ui.showNotification('Batterie aufgeladen', 2.5);
      return;
    }

    if (type === 'fuse') {
      this._collect(item);
      this.hasFuse = true;
      this.inventory.push('fuse');
      this.audio.playCollect();
      this.ui.showNotification('Sicherung aufgehoben', 2.5);
      this.ui.setObjective('Sicherung im Technikraum einsetzen');
      this.ui.updateInventory(this.inventory);
      return;
    }

    if (type === 'fusebox') {
      if (!this.hasFuse) {
        this.ui.showNotification('Du hast keine Sicherung.', 2.5);
        this.audio.playError();
        return;
      }
      if (level.fuseInstalled) {
        this.ui.showNotification('Sicherung bereits eingesetzt.', 2);
        return;
      }
      level.fuseInstalled = true;
      this.fuseInstalled = true;
      this.inventory = this.inventory.filter(i => i !== 'fuse');
      this.audio.playDoor();
      this.ui.showNotification('Sicherung eingesetzt – Strom wiederhergestellt!', 4);
      this.ui.setObjective('Code am Ausgang eingeben');
      this.ui.updateInventory(this.inventory);
      // Update fusebox visual
      item.material = new THREE.MeshLambertMaterial({color:0x204020, emissive:0x004000, emissiveIntensity:1});
      return;
    }

    if (type === 'exitkeypad') {
      if (!level.fuseInstalled) {
        this.ui.showNotification('Kein Strom. Sicherung einsetzen.', 3);
        this.audio.playError();
        return;
      }
      // Open keypad UI
      this.ui.openKeypad('4291', () => {
        this.audio.playSuccess();
        level.unlockExit();
        this.ui.showNotification('Ausgang entsperrt! Lauf!', 5);
        this.ui.setObjective('Den Ausgang erreichen!');
        // Allow win on walking through exit
      });
      return;
    }
  }

  _collect(item) {
    item.userData.collected = true;
    item.visible = false;
    if (item.userData.glow) item.userData.glow.visible = false;
  }
}
