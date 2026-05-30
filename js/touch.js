'use strict';

// Touch controls for mobile / tablet
// Design principles:
//   · Left thumb  → floating joystick (spawns where you touch left half)
//   · Left thumb  → flashlight button above joystick zone
//   · Right thumb → drag = look camera
//   · Right thumb → TAP (< 10 px movement, < 250 ms) = interact (E)
//   · Auto-sprint when joystick pushed ≥ 70 % — no sprint button needed
//   · Pause button top-right, small
class TouchControls {
  constructor() {
    this.player = null;
    this.active = false;

    // Joystick
    this._joyId     = null;   // touch identifier
    this._joyOrigin = { x: 0, y: 0 };
    this._joyDelta  = { x: 0, y: 0 }; // normalised –1..1
    this._joyMaxR   = 52;              // max knob displacement in px
    this._joyEl     = null;            // group element moved to finger
    this._knobEl    = null;

    // Look
    this._lookId     = null;
    this._lookLast   = { x: 0, y: 0 };
    this._lookStart  = { x: 0, y: 0 };
    this._lookMoved  = 0;
    this._lookStartT = 0;
    this._lookSens   = 0.0024;

    // Buttons
    this._btnFlash    = null;
    this._btnInteract = null;
    this._btnPause    = null;
  }

  init(player) {
    this.player = player;
    const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (!hasTouch) return;

    this.active = true;
    document.body.classList.add('touch-device');

    const tc = document.getElementById('touchControls');
    if (tc) tc.classList.remove('hidden');

    this._joyEl   = document.getElementById('joystickFloating');
    this._knobEl  = document.getElementById('joystickKnob');
    this._btnFlash    = document.getElementById('btnFlash');
    this._btnInteract = document.getElementById('btnInteract');
    this._btnPause    = document.getElementById('btnPause');

    this._setupJoystick();
    this._setupLook();
    this._setupButtons();
    this._setupMobileUI();
  }

  applyJoystick() {
    if (!this.active || !this.player) return;
    this.player._touchMove = {
      x: this._joyDelta.x,
      y: this._joyDelta.y,
    };
    // Auto-sprint when joystick pushed hard (≥ 70 %)
    const mag = Math.sqrt(
      this._joyDelta.x ** 2 + this._joyDelta.y ** 2
    );
    this.player.input.sprint = mag >= 0.70;
  }

  // ── Floating joystick ─────────────────────────────────────────────

  _setupJoystick() {
    // Joystick activates anywhere in left 48 % of screen
    const inLeftZone = t =>
      t.clientX < window.innerWidth * 0.48 &&
      // don't steal touches from flashlight button
      !t.target.closest('#btnFlash');

    document.addEventListener('touchstart', e => {
      for (const t of e.changedTouches) {
        if (this._joyId === null && inLeftZone(t)) {
          this._joyId = t.identifier;
          this._joyOrigin = { x: t.clientX, y: t.clientY };
          this._showJoystick(t.clientX, t.clientY);
        }
      }
    }, { passive: true });

    document.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this._joyId) continue;
        const dx = t.clientX - this._joyOrigin.x;
        const dy = t.clientY - this._joyOrigin.y;
        const dist = Math.hypot(dx, dy);
        const clamped = Math.min(dist, this._joyMaxR);
        const nx = dist > 0 ? (dx / dist) * clamped : 0;
        const ny = dist > 0 ? (dy / dist) * clamped : 0;
        this._joyDelta.x = nx / this._joyMaxR;
        this._joyDelta.y = ny / this._joyMaxR;
        this._moveKnob(nx, ny);
      }
    }, { passive: true });

    document.addEventListener('touchend', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._joyId) {
          this._joyId = null;
          this._joyDelta.x = 0;
          this._joyDelta.y = 0;
          this._hideJoystick();
        }
      }
    }, { passive: true });

    document.addEventListener('touchcancel', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._joyId) {
          this._joyId = null;
          this._joyDelta.x = 0;
          this._joyDelta.y = 0;
          this._hideJoystick();
        }
      }
    }, { passive: true });
  }

  _showJoystick(cx, cy) {
    if (!this._joyEl) return;
    const R = this._joyMaxR + 10; // base radius slightly bigger than max travel
    this._joyEl.style.left   = (cx - R) + 'px';
    this._joyEl.style.top    = (cy - R) + 'px';
    this._joyEl.style.width  = (R * 2) + 'px';
    this._joyEl.style.height = (R * 2) + 'px';
    this._joyEl.style.opacity = '1';
    if (this._knobEl) {
      this._knobEl.style.transform = 'translate(-50%, -50%)';
    }
  }

  _hideJoystick() {
    if (!this._joyEl) return;
    this._joyEl.style.opacity = '0';
    if (this._knobEl) this._knobEl.style.transform = 'translate(-50%, -50%)';
  }

  _moveKnob(ox, oy) {
    if (!this._knobEl) return;
    this._knobEl.style.transform =
      `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
  }

  // ── Look drag + tap-to-interact ───────────────────────────────────

  _setupLook() {
    const inLookZone = t => {
      // Right 52 % of screen, not on action buttons
      return t.clientX >= window.innerWidth * 0.48 &&
             !t.target.closest('#btnInteract') &&
             !t.target.closest('#btnPause');
    };

    const TAP_DIST = 12;  // px – if movement < this → tap
    const TAP_TIME = 260; // ms – if duration < this → tap

    document.addEventListener('touchstart', e => {
      for (const t of e.changedTouches) {
        if (this._lookId === null && inLookZone(t)) {
          this._lookId     = t.identifier;
          this._lookLast   = { x: t.clientX, y: t.clientY };
          this._lookStart  = { x: t.clientX, y: t.clientY };
          this._lookMoved  = 0;
          this._lookStartT = Date.now();
        }
      }
    }, { passive: true });

    document.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this._lookId || !this.player) continue;
        const dx = t.clientX - this._lookLast.x;
        const dy = t.clientY - this._lookLast.y;
        this._lookMoved += Math.hypot(dx, dy);
        this.player.yaw   -= dx * this._lookSens;
        this.player.pitch -= dy * this._lookSens;
        this.player.pitch = Math.max(-Math.PI * 0.44,
                              Math.min(Math.PI * 0.44, this.player.pitch));
        this._lookLast = { x: t.clientX, y: t.clientY };
      }
    }, { passive: true });

    document.addEventListener('touchend', e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this._lookId) continue;
        this._lookId = null;
        // Short tap with little movement → interact
        const elapsed = Date.now() - this._lookStartT;
        if (this._lookMoved < TAP_DIST && elapsed < TAP_TIME) {
          if (this.player) this.player._pendingInteract = true;
          this._flashInteractBtn();
        }
      }
    }, { passive: true });
  }

  _flashInteractBtn() {
    if (!this._btnInteract) return;
    this._btnInteract.classList.add('pressed');
    setTimeout(() => this._btnInteract.classList.remove('pressed'), 180);
  }

  // ── Action buttons ────────────────────────────────────────────────

  _setupButtons() {
    // Interact (E) – dedicated button + right-side tap (handled above)
    this._touchBtn(this._btnInteract, {
      onStart: () => { if (this.player) this.player._pendingInteract = true; }
    });

    // Flashlight (F) – toggle on tap
    this._touchBtn(this._btnFlash, {
      onStart: () => { if (this.player) this.player._pendingFlashlight = true; }
    });

    // Pause – top right
    if (this._btnPause) {
      this._btnPause.addEventListener('touchstart', e => {
        e.stopPropagation();
        if (this.player) this.player.input.escape = true;
      }, { passive: true });
    }
  }

  _touchBtn(el, { onStart, onEnd } = {}) {
    if (!el) return;
    el.addEventListener('touchstart', e => {
      e.stopPropagation();
      el.classList.add('pressed');
      if (onStart) onStart();
    }, { passive: true });
    el.addEventListener('touchend', e => {
      e.stopPropagation();
      el.classList.remove('pressed');
      if (onEnd) onEnd();
    }, { passive: true });
    el.addEventListener('touchcancel', () => {
      el.classList.remove('pressed');
      if (onEnd) onEnd();
    }, { passive: true });
  }

  // ── Mobile UI helpers ─────────────────────────────────────────────

  _setupMobileUI() {
    // Note close button
    document.getElementById('noteCloseBtn')?.addEventListener('click', () => {
      document.getElementById('noteDisplay')?.classList.add('hidden');
    });

    // Prevent body pinch-zoom / scroll
    document.addEventListener('touchmove', e => {
      if (e.touches.length > 1) e.preventDefault();
    }, { passive: false });
  }

  static isMobile() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  }
}

const touchControls = new TouchControls();
