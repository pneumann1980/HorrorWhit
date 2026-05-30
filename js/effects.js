'use strict';

// Visual effects: vignette, camera shake, screen static, light flicker
class EffectsManager {
  constructor(camera, scene) {
    this.camera = camera;
    this.scene = scene;

    this._tension = 0;
    this._shakeIntensity = 0;
    this._shakeTimer = 0;
    this._flickerLights = [];

    this._vignetteEl = document.getElementById('vignette');
    this._bloodEl = document.getElementById('bloodOverlay');
    this._staticEl = document.getElementById('static');
    this._canvasEl = document.getElementById('gameCanvas');

    // Base camera position offset for shake
    this._shakeOffset = new THREE.Vector3();
    this._isGameOver = false;
  }

  // Register a light that should flicker
  registerFlickerLight(light, baseIntensity, flickerRate) {
    this._flickerLights.push({ light, baseIntensity, flickerRate: flickerRate || 1, phase: Math.random() * Math.PI * 2 });
  }

  setTension(level) {
    this._tension = Math.max(0, Math.min(1, level));
  }

  update(delta) {
    if (this._isGameOver) return;

    const t = this._tension;

    // Vignette darkens with tension
    const vigOpacity = 0.6 + t * 0.3;
    this._vignetteEl.style.opacity = vigOpacity;

    // Static overlay fades in at high tension
    if (this._staticEl) {
      this._staticEl.style.opacity = Math.max(0, (t - 0.7) * 0.5);
    }

    // Camera shake
    if (t > 0.5) {
      this._shakeIntensity = (t - 0.5) * 0.012;
    } else {
      this._shakeIntensity = 0;
    }

    if (this._shakeIntensity > 0) {
      this._shakeTimer += delta;
      this._shakeOffset.set(
        (Math.sin(this._shakeTimer * 18) + Math.cos(this._shakeTimer * 23)) * this._shakeIntensity,
        (Math.cos(this._shakeTimer * 15) + Math.sin(this._shakeTimer * 27)) * this._shakeIntensity * 0.6,
        0
      );
      this.camera.position.x += this._shakeOffset.x;
      this.camera.position.y += this._shakeOffset.y;
    }

    // Flicker registered lights
    const now = performance.now() * 0.001;
    for (const f of this._flickerLights) {
      const flicker = this._flickerValue(now, f.phase, f.flickerRate, t);
      f.light.intensity = f.baseIntensity * flicker;
    }

    // Blood overlay pulses when tension > 0.8
    if (t > 0.8) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 4);
      this._bloodEl.style.background = `rgba(120,0,0,${(t - 0.8) * pulse * 0.25})`;
    } else {
      this._bloodEl.style.background = 'rgba(120,0,0,0)';
    }
  }

  _flickerValue(now, phase, rate, tension) {
    // Multi-frequency flicker for realistic lamp effect
    const f1 = 0.5 + 0.5 * Math.sin((now * 2.1 + phase) * rate);
    const f2 = 0.5 + 0.5 * Math.sin((now * 5.7 + phase * 1.3) * rate);
    const f3 = Math.random() < 0.003 ? 0.1 : 1.0; // occasional glitch

    const base = f1 * 0.4 + f2 * 0.4 + 0.2;
    const tensionFlicker = 1 - tension * 0.4 * (0.5 + 0.5 * Math.sin(now * 8));
    return Math.max(0.05, base * tensionFlicker * f3);
  }

  // Called once on game over for dramatic effect
  gameOver() {
    this._isGameOver = true;
    this._bloodEl.style.transition = 'background 0.15s';
    this._bloodEl.style.background = 'rgba(120, 0, 0, 0.7)';
    if (this._canvasEl) this._canvasEl.classList.add('shaking');
    setTimeout(() => {
      if (this._canvasEl) this._canvasEl.classList.remove('shaking');
      this._bloodEl.style.background = 'rgba(0,0,0,0)';
    }, 600);
  }

  // Brief white/static flash
  jumpScare() {
    if (!this._staticEl) return;
    this._staticEl.style.opacity = '0.8';
    setTimeout(() => { this._staticEl.style.opacity = '0'; }, 120);
  }

  reset() {
    this._isGameOver = false;
    this._tension = 0;
    this._shakeIntensity = 0;
    this._vignetteEl.style.opacity = '0.6';
    this._bloodEl.style.background = 'rgba(0,0,0,0)';
    if (this._staticEl) this._staticEl.style.opacity = '0';
    if (this._canvasEl) this._canvasEl.classList.remove('shaking');
  }
}
