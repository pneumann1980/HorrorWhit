'use strict';

// Touch control system for mobile / tablet
// Provides virtual joystick + action buttons + look-drag
// Injects input into a Player instance and directly into player's yaw/pitch
class TouchControls {
  constructor() {
    this.player = null;       // Set in init()
    this.active = false;

    // Joystick state
    this._joyTouchId  = null;
    this._joyCenter   = { x: 0, y: 0 };
    this._joyDelta    = { x: 0, y: 0 }; // normalised -1..1
    this._joyMaxR     = 42;             // max knob displacement px

    // Look state
    this._lookTouchId = null;
    this._lookLast    = { x: 0, y: 0 };
    this._lookSens    = 0.0022;

    // Sprint is held via touch (toggle off when finger lifts)
    this._sprintTouchId = null;

    // DOM refs
    this._knob      = null;
    this._joyZone   = null;
    this._btnInteract = null;
    this._btnFlash    = null;
    this._btnSprint   = null;
    this._btnPause    = null;
  }

  // Call after player is created and DOM is ready
  init(player) {
    this.player = player;

    // Detect touch capability
    const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (!hasTouch) return;

    this.active = true;
    document.body.classList.add('touch-device');

    const tc = document.getElementById('touchControls');
    if (tc) tc.classList.remove('hidden');

    this._knob       = document.getElementById('joystickKnob');
    this._joyZone    = document.getElementById('joystickZone');
    this._btnInteract = document.getElementById('btnInteract');
    this._btnFlash    = document.getElementById('btnFlash');
    this._btnSprint   = document.getElementById('btnSprint');
    this._btnPause    = document.getElementById('btnPause');

    this._setupJoystick();
    this._setupLookArea();
    this._setupButtons();
    this._setupMobileUI();
  }

  // Inject joystick values into player movement each frame
  // Called from game loop (or player.update)
  applyJoystick() {
    if (!this.active || !this.player) return;
    // Expose delta so player._move() can read it
    this.player._touchMove = {
      x: this._joyDelta.x,
      y: this._joyDelta.y,
    };
  }

  // ── Joystick ─────────────────────────────────────────────────────

  _setupJoystick() {
    const zone = this._joyZone;
    if (!zone) return;

    // Use a wide touch zone (entire bottom-left quadrant) so player
    // doesn't have to hit the visual ring precisely
    const getTouchInZone = (touch) => {
      const rect = zone.getBoundingClientRect();
      // Zone is generous: anywhere in bottom-left quarter
      return touch.clientX < window.innerWidth * 0.45 &&
             touch.clientY > window.innerHeight * 0.45;
    };

    const getCenter = () => {
      const rect = zone.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };

    document.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (this._joyTouchId === null && getTouchInZone(t)) {
          this._joyTouchId = t.identifier;
          this._joyCenter  = getCenter();
          this._updateKnob(0, 0);
        }
      }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this._joyTouchId) continue;
        const dx = t.clientX - this._joyCenter.x;
        const dy = t.clientY - this._joyCenter.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const clamped = Math.min(dist, this._joyMaxR);
        const nx = dist > 0 ? (dx / dist) * clamped : 0;
        const ny = dist > 0 ? (dy / dist) * clamped : 0;
        this._joyDelta.x = nx / this._joyMaxR;
        this._joyDelta.y = ny / this._joyMaxR;
        this._updateKnob(nx, ny);
      }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._joyTouchId) {
          this._joyTouchId = null;
          this._joyDelta.x = 0;
          this._joyDelta.y = 0;
          this._updateKnob(0, 0);
        }
      }
    }, { passive: true });
  }

  _updateKnob(ox, oy) {
    if (!this._knob) return;
    this._knob.style.transform =
      `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
  }

  // ── Camera look (right 60% of screen, drag) ───────────────────

  _setupLookArea() {
    const isLookArea = (touch) => {
      // Right portion of screen that's not a button
      return touch.clientX > window.innerWidth * 0.45;
    };

    document.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (this._lookTouchId === null && isLookArea(t)) {
          // Don't steal touches from buttons (they handle stopPropagation)
          this._lookTouchId = t.identifier;
          this._lookLast = { x: t.clientX, y: t.clientY };
        }
      }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this._lookTouchId || !this.player) continue;
        const dx = t.clientX - this._lookLast.x;
        const dy = t.clientY - this._lookLast.y;
        this.player.yaw   -= dx * this._lookSens;
        this.player.pitch -= dy * this._lookSens;
        this.player.pitch = Math.max(-Math.PI * 0.45,
                              Math.min(Math.PI * 0.45, this.player.pitch));
        this._lookLast = { x: t.clientX, y: t.clientY };
      }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._lookTouchId) {
          this._lookTouchId = null;
        }
      }
    }, { passive: true });
  }

  // ── Action buttons ────────────────────────────────────────────

  _setupButtons() {
    // Interact button – fires once per tap
    this._setupBtn(this._btnInteract, {
      onStart: () => {
        if (this.player) this.player._pendingInteract = true;
      }
    });

    // Flashlight – fires once per tap
    this._setupBtn(this._btnFlash, {
      onStart: () => {
        if (this.player) this.player._pendingFlashlight = true;
      }
    });

    // Sprint – held
    this._setupBtn(this._btnSprint, {
      onStart: () => { if (this.player) this.player.input.sprint = true; },
      onEnd:   () => { if (this.player) this.player.input.sprint = false; }
    });

    // Pause (top right)
    if (this._btnPause) {
      this._btnPause.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        if (this.player) this.player.input.escape = true;
      }, { passive: true });
    }
  }

  _setupBtn(el, { onStart, onEnd } = {}) {
    if (!el) return;

    el.addEventListener('touchstart', (e) => {
      e.stopPropagation();  // prevent look area from stealing this touch
      el.classList.add('pressed');
      if (onStart) onStart();
    }, { passive: true });

    el.addEventListener('touchend', (e) => {
      e.stopPropagation();
      el.classList.remove('pressed');
      if (onEnd) onEnd();
    }, { passive: true });

    el.addEventListener('touchcancel', () => {
      el.classList.remove('pressed');
      if (onEnd) onEnd();
    }, { passive: true });
  }

  // ── Mobile UI tweaks ──────────────────────────────────────────

  _setupMobileUI() {
    // Close note by tapping the close button
    const noteCloseBtn = document.getElementById('noteCloseBtn');
    noteCloseBtn?.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      document.getElementById('noteDisplay')?.classList.add('hidden');
    }, { passive: true });
    noteCloseBtn?.addEventListener('click', () => {
      document.getElementById('noteDisplay')?.classList.add('hidden');
    });

    // Keypad close button
    const kpClose = document.getElementById('keypadCloseBtn');
    kpClose?.addEventListener('touchstart', (e) => {
      e.stopPropagation();
    }, { passive: true });
    // click event is already wired in ui.js

    // Prevent body scroll / zoom on touch
    document.addEventListener('touchmove', (e) => {
      if (e.target === document.getElementById('gameCanvas') ||
          e.target === document.body) {
        e.preventDefault();
      }
    }, { passive: false });
  }

  // Returns true if this is a touch device
  static isMobile() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  }
}

// Singleton accessible globally
const touchControls = new TouchControls();
