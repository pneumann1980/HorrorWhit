'use strict';

// UI / HUD management
class UI {
  constructor() {
    this._batteryFill = document.getElementById('batteryFill');
    this._objective = document.getElementById('objective');
    this._interactHint = document.getElementById('interactHint');
    this._notification = document.getElementById('notification');
    this._noteDisplay = document.getElementById('noteDisplay');
    this._noteContent = document.getElementById('noteContent');
    this._flashlightOff = document.getElementById('flashlightOff');
    this._inventoryBar = document.getElementById('inventoryBar');

    this._notifTimer = 0;
    this._notifClearTimer = null;

    this.onKeypadClose = null;  // External callback
    this._keypadOpen = false;
    this._keypadCode = '';
    this._keypadTarget = null;
    this._keypadEl = document.getElementById('keypadOverlay');
    this._keypadDisplay = document.getElementById('keypadDisplay');

    this._buildKeypad();
    this._buildInventoryBar();
  }

  // ── Battery ─────────────────────────────────────────────────────

  updateBattery(pct) {
    // pct: 0..1
    const w = Math.max(0, Math.min(100, pct * 100));
    this._batteryFill.style.width = w + '%';
    // Color: green→yellow→red
    const pos = (1 - pct) * 100;
    this._batteryFill.style.backgroundPosition = pos + '% 0';
  }

  setFlashlightOn(on) {
    if (this._flashlightOff) {
      this._flashlightOff.style.opacity = on ? '0' : '1';
    }
  }

  // ── Objective ────────────────────────────────────────────────────

  setObjective(text) {
    this._objective.textContent = text;
  }

  // ── Interact hint ────────────────────────────────────────────────

  showInteractHint(text) {
    this._interactHint.textContent = '[E] ' + text;
    this._interactHint.classList.remove('hidden');
  }

  hideInteractHint() {
    this._interactHint.classList.add('hidden');
  }

  // ── Notification toast ───────────────────────────────────────────

  showNotification(text, duration) {
    if (this._notifClearTimer) clearTimeout(this._notifClearTimer);
    this._notification.textContent = text;
    this._notification.classList.remove('hidden');
    this._notifClearTimer = setTimeout(() => {
      this._notification.classList.add('hidden');
    }, (duration || 3) * 1000);
  }

  // ── Note/document display ────────────────────────────────────────

  showNote(content) {
    this._noteContent.textContent = content;
    this._noteDisplay.classList.remove('hidden');
  }

  hideNote() {
    this._noteDisplay.classList.add('hidden');
  }

  isNoteOpen() {
    return !this._noteDisplay.classList.contains('hidden');
  }

  // ── Inventory ────────────────────────────────────────────────────

  _buildInventoryBar() {
    if (!this._inventoryBar) return;
    this._invSlots = [];
    const items = ['fuse', 'note', 'note', 'note'];
    items.forEach((label, i) => {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      slot.dataset.key = label + i;
      slot.textContent = label.slice(0, 4);
      this._inventoryBar.appendChild(slot);
      this._invSlots.push(slot);
    });
  }

  updateInventory(items) {
    // items: array of item type strings player has
    if (!this._invSlots) return;
    const counts = {};
    items.forEach(i => { counts[i] = (counts[i] || 0) + 1; });

    let fuseSet = false;
    let noteCount = 0;
    this._invSlots.forEach(slot => {
      const k = slot.dataset.key;
      if (k === 'fuse0') {
        slot.classList.toggle('has-item', !!counts['fuse']);
      } else {
        const n = noteCount++;
        slot.classList.toggle('has-item', noteCount <= (counts['note'] || 0));
      }
    });
  }

  // ── Keypad ───────────────────────────────────────────────────────

  _buildKeypad() {
    if (!this._keypadEl) return;

    const grid = document.getElementById('keypadGrid');
    if (!grid) return;

    const buttons = ['1','2','3','4','5','6','7','8','9','CLR','0','ENT'];
    buttons.forEach(label => {
      const btn = document.createElement('button');
      btn.className = 'kp-btn';
      btn.textContent = label;
      btn.addEventListener('click', () => this._keypadInput(label));
      grid.appendChild(btn);
    });

    document.getElementById('keypadCloseBtn')?.addEventListener('click', () => {
      this.closeKeypad();
    });
  }

  openKeypad(correctCode, onSuccess) {
    this._keypadCode = '';
    this._keypadCorrect = correctCode;
    this._keypadSuccess = onSuccess;
    this._keypadDisplay.textContent = '';
    this._keypadDisplay.classList.remove('keypadError');
    this._keypadEl.classList.remove('hidden');
    this._keypadOpen = true;
  }

  closeKeypad() {
    this._keypadEl.classList.add('hidden');
    this._keypadOpen = false;
    if (this.onKeypadClose) this.onKeypadClose();
  }

  isKeypadOpen() { return this._keypadOpen; }

  _keypadInput(key) {
    if (key === 'CLR') {
      this._keypadCode = '';
      this._keypadDisplay.textContent = '';
      this._keypadDisplay.classList.remove('keypadError');
      return;
    }
    if (key === 'ENT') {
      if (this._keypadCode === this._keypadCorrect) {
        this._keypadDisplay.textContent = 'OK';
        this._keypadDisplay.style.color = '#40ff80';
        setTimeout(() => {
          this.closeKeypad();
          if (this._keypadSuccess) this._keypadSuccess();
        }, 600);
      } else {
        this._keypadDisplay.classList.add('keypadError');
        this._keypadDisplay.textContent = 'ERR';
        setTimeout(() => {
          this._keypadCode = '';
          this._keypadDisplay.textContent = '';
          this._keypadDisplay.classList.remove('keypadError');
        }, 800);
      }
      return;
    }
    if (this._keypadCode.length < 6) {
      this._keypadCode += key;
      this._keypadDisplay.textContent = this._keypadCode.replace(/./g, '●');
    }
  }
}
