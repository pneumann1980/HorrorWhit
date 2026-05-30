'use strict';

// First-Person Controller with flashlight, collision, interaction
class Player {
  constructor(camera, scene, ui, audio, items, level) {
    this.camera = camera;
    this.scene = scene;
    this.ui = ui;
    this.audio = audio;
    this.items = items;
    this.level = level;

    // State
    this.position = new THREE.Vector3(0, 1.7, 0);
    this.yaw   = 0;
    this.pitch = 0;
    this.hasWon = false;

    // Movement
    this.WALK_SPEED   = 3.0;
    this.SPRINT_SPEED = 5.2;
    this.EYE_HEIGHT   = 1.7;
    this._bobPhase    = 0;
    this._bobBase     = 1.7;
    this._stepTimer   = 0;
    this._stepInterval = 0.45;

    // Flashlight
    this.flashlightOn  = true;
    this.battery       = 1.0;   // 0..1
    this.DRAIN_RATE    = 0.012; // per second when on
    this._flashlight   = null;
    this._flashlightTarget = null;

    // Input
    this.input = {
      forward: false, back: false, left: false, right: false,
      sprint: false, interact: false, flashlight: false, escape: false
    };
    this._pointerLocked = false;
    this._pendingInteract = false;
    this._pendingFlashlight = false;

    this._setup();
  }

  // ── Setup ─────────────────────────────────────────────────────────

  _setup() {
    // Keyboard
    window.addEventListener('keydown', e => this._onKey(e, true));
    window.addEventListener('keyup',   e => this._onKey(e, false));

    // Pointer lock
    document.addEventListener('pointerlockchange', () => {
      this._pointerLocked = !!document.pointerLockElement;
    });
    document.addEventListener('mousemove', e => {
      if (!this._pointerLocked) return;
      const sens = 0.0015;
      this.yaw   -= e.movementX * sens;
      this.pitch -= e.movementY * sens;
      this.pitch = Math.max(-Math.PI * 0.45, Math.min(Math.PI * 0.45, this.pitch));
    });

    // Canvas click → lock pointer
    document.getElementById('gameCanvas').addEventListener('click', () => {
      if (!this._pointerLocked && window._game && window._game.state === 'playing') {
        document.getElementById('gameCanvas').requestPointerLock();
      }
    });

    // Flashlight (SpotLight)
    this._flashlight = new THREE.SpotLight(0xffd0a0, 1.8, 22, Math.PI / 6, 0.35, 1.8);
    this._flashlight.castShadow = false;
    this._flashlightTarget = new THREE.Object3D();
    this.scene.add(this._flashlightTarget);
    this.scene.add(this._flashlight);
  }

  _onKey(e, down) {
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'arrowup')    this.input.forward = down;
    if (k === 's' || k === 'arrowdown')  this.input.back    = down;
    if (k === 'a' || k === 'arrowleft')  this.input.left    = down;
    if (k === 'd' || k === 'arrowright') this.input.right   = down;
    if (k === 'shift')  this.input.sprint = down;
    if (k === 'e' && down) this._pendingInteract = true;
    if (k === 'f' && down) this._pendingFlashlight = true;
    if (k === 'escape' && down) this.input.escape = true;
  }

  // ── Per-frame ─────────────────────────────────────────────────────

  update(delta, gameState) {
    if (gameState !== 'playing' && gameState !== 'reading') return;

    // Handle flashlight toggle
    if (this._pendingFlashlight) {
      this._pendingFlashlight = false;
      this.flashlightOn = !this.flashlightOn;
      this.audio.playDoor();
      this.ui.setFlashlightOn(this.flashlightOn);
    }

    // Handle note/keypad read state
    const noteOpen = this.ui.isNoteOpen();
    const keypadOpen = this.ui.isKeypadOpen();

    if (noteOpen || keypadOpen) {
      if (this._pendingInteract) {
        this._pendingInteract = false;
        if (noteOpen) this.ui.hideNote();
      }
      this._pendingInteract = false;
      this._updateFlashlight();
      return;
    }

    if (gameState === 'playing') {
      this._move(delta);
      this._updateBattery(delta);
      this._updateInteractHint();

      if (this._pendingInteract) {
        this._pendingInteract = false;
        this._doInteract();
      }
    }

    this._updateCamera();
    this._updateFlashlight();
  }

  _move(delta) {
    // Merge keyboard and touch joystick input
    const joy = this._touchMove || { x: 0, y: 0 };
    let moveX = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0) + joy.x;
    let moveZ = (this.input.back  ? 1 : 0) - (this.input.forward ? 1 : 0) + joy.y;

    // Normalise to unit vector (prevents faster diagonal movement)
    const rawLen = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (rawLen > 1) { moveX /= rawLen; moveZ /= rawLen; }

    const isMoving = rawLen > 0.05;
    const running = this.input.sprint && isMoving;
    const speed = running ? this.SPRINT_SPEED : this.WALK_SPEED;

    if (!isMoving) {
      // Smoothly dampen bob when idle
      this._bobPhase += (0 - this._bobPhase) * delta * 5;
      return;
    }

    // World-space direction from yaw
    const cos = Math.cos(this.yaw), sin = Math.sin(this.yaw);
    let dx = (moveX * cos - moveZ * sin) * speed * delta;
    let dz = (moveX * sin + moveZ * cos) * speed * delta;

    // Collision sliding
    const nx = this.position.x + dx;
    const nz = this.position.z + dz;

    if (this.level.isValidPosition(nx, this.position.z)) {
      this.position.x = nx;
    }
    if (this.level.isValidPosition(this.position.x, nz)) {
      this.position.z = nz;
    }

    // Head bob
    const bobSpeed = running ? 12 : 7;
    this._bobPhase += delta * bobSpeed;
    const bobAmt = running ? 0.065 : 0.04;
    this.camera.position.y = this._bobBase + Math.sin(this._bobPhase) * bobAmt;

    // Footsteps
    this._stepTimer += delta;
    if (this._stepTimer > this._stepInterval / (running ? 1.8 : 1)) {
      this._stepTimer = 0;
      this.audio.playFootstep(running);
    }

    // Win zone – did player reach exit?
    if (this.level.exitUnlocked && this.position.x > 63.5) {
      this.hasWon = true;
    }
  }

  _updateBattery(delta) {
    if (this.flashlightOn && this.battery > 0) {
      this.battery -= this.DRAIN_RATE * delta;
      if (this.battery <= 0) {
        this.battery = 0;
        this.flashlightOn = false;
        this.ui.setFlashlightOn(false);
        this.ui.showNotification('Batterie leer!', 3);
      }
    }
    this.ui.updateBattery(this.battery);

    // Flashlight intensity = battery level
    if (this._flashlight) {
      this._flashlight.intensity = this.flashlightOn ? Math.max(0, 1.8 * this.battery) : 0;
    }
  }

  rechargeBattery(amount) {
    this.battery = Math.min(1.0, this.battery + amount);
  }

  _updateCamera() {
    this.camera.position.x = this.position.x;
    this.camera.position.z = this.position.z;
    // Y handled by bob system; set base if standing still
    if (!this.input.forward && !this.input.back && !this.input.left && !this.input.right) {
      this.camera.position.y += (this._bobBase - this.camera.position.y) * 0.1;
    }

    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  _updateFlashlight() {
    if (!this._flashlight) return;
    this._flashlight.position.copy(this.camera.position);

    // Aim flashlight slightly below center (feels natural)
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(this.camera.quaternion);
    const targetPos = this._flashlight.position.clone().add(forward.multiplyScalar(8));
    this._flashlightTarget.position.copy(targetPos);
    this._flashlight.target = this._flashlightTarget;
  }

  _updateInteractHint() {
    const nearest = this.items.getNearestInteractable(this.position, this.level);
    if (nearest) {
      const label = nearest.userData?.label || nearest.label ||
        (nearest.userData?.type === 'note' ? 'Notiz lesen' :
         nearest.userData?.type === 'battery' ? 'Batterie aufheben' :
         nearest.userData?.type === 'fuse' ? 'Sicherung aufheben' :
         'Interagieren');
      this.ui.showInteractHint(label);
    } else {
      this.ui.hideInteractHint();
    }
  }

  _doInteract() {
    const nearest = this.items.getNearestInteractable(this.position, this.level);
    if (nearest) {
      this.items.interact(nearest, this.level, this);
    }
  }

  // ── Public API ────────────────────────────────────────────────────

  getPosition() { return this.position.clone().setY(1.7); }
  getDirection() {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    return dir;
  }

  reset() {
    this.position.set(0, 1.7, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.battery = 1.0;
    this.flashlightOn = true;
    this.hasWon = false;
    this._bobPhase = 0;
    this.camera.position.set(0, 1.7, 0);
    this.camera.rotation.set(0, 0, 0);
    this.ui.updateBattery(1.0);
    this.ui.setFlashlightOn(true);
    this.ui.setObjective('Finde einen Weg aus der Anlage');
  }
}
