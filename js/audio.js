'use strict';

// Procedural sound system using Web Audio API
class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this._nodes = [];   // Tracked nodes to stop cleanly
    this._tension = 0;
    this._tensionGain = null;
    this._tensionOsc = null;
    this._ambientGain = null;
    this._heartbeatTimeout = null;
    this._footstepTimer = 0;
    this._footstepInterval = 0.45;
    this.active = false;
  }

  init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
    } catch (e) {
      console.warn('[Audio] Web Audio API unavailable:', e.message);
    }
  }

  // Resume context after user gesture (browser policy)
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ── Ambient atmosphere ──────────────────────────────────────────

  startAmbient() {
    if (!this.ctx) return;
    this.stopAll();
    this.active = true;
    this.resume();
    this._buildAmbient();
  }

  _buildAmbient() {
    const { ctx } = this;
    const t = ctx.currentTime;

    // Deep sub-bass drone
    const droneOsc = this._osc('sawtooth', 38);
    const droneFilter = this._filter('lowpass', 180, 3);
    this._ambientGain = ctx.createGain();
    this._ambientGain.gain.value = 0.04;
    droneOsc.connect(droneFilter);
    droneFilter.connect(this._ambientGain);
    this._ambientGain.connect(this.master);

    // LFO modulates drone pitch slightly
    const lfoOsc = this._osc('sine', 0.08);
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 6;
    lfoOsc.connect(lfoGain);
    lfoGain.connect(droneOsc.frequency);

    // Mid-range harmonic
    const midOsc = this._osc('sine', 76);
    const midGain = ctx.createGain();
    midGain.gain.value = 0.015;
    midOsc.connect(midGain);
    midGain.connect(this.master);

    // Random creak/tick noise bursts
    this._scheduleCreaks();

    // Tension layer (silent until set)
    this._tensionOsc = this._osc('sawtooth', 110);
    const tensionFilter = this._filter('bandpass', 900, 8);
    this._tensionGain = ctx.createGain();
    this._tensionGain.gain.value = 0;
    this._tensionOsc.connect(tensionFilter);
    tensionFilter.connect(this._tensionGain);
    this._tensionGain.connect(this.master);

    // High tension whine
    this._tensionOsc2 = this._osc('sine', 440);
    const tf2 = this._filter('highpass', 2000, 1);
    this._tensionGain2 = ctx.createGain();
    this._tensionGain2.gain.value = 0;
    this._tensionOsc2.connect(tf2);
    tf2.connect(this._tensionGain2);
    this._tensionGain2.connect(this.master);
  }

  _scheduleCreaks() {
    if (!this.active || !this.ctx) return;
    const delay = 5 + Math.random() * 20;
    this._creakTimeout = setTimeout(() => {
      if (!this.active) return;
      this._playCreak();
      this._scheduleCreaks();
    }, delay * 1000);
  }

  _playCreak() {
    const { ctx } = this;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150 + Math.random() * 100, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(80 + Math.random() * 60, ctx.currentTime + 0.8);

    const dist = ctx.createWaveShaper();
    dist.curve = this._makeDistCurve(200);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08 + Math.random() * 0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);

    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) pan.pan.value = (Math.random() - 0.5) * 1.4;

    osc.connect(dist);
    dist.connect(gain);
    if (pan) { gain.connect(pan); pan.connect(this.master); }
    else gain.connect(this.master);

    osc.start();
    osc.stop(ctx.currentTime + 0.9);
  }

  setTension(level) {
    if (!this.ctx || !this._tensionGain) return;
    level = Math.max(0, Math.min(1, level));
    this._tension = level;

    const t = this.ctx.currentTime;
    this._tensionGain.gain.setTargetAtTime(level * 0.06, t, 0.4);
    this._tensionGain2.gain.setTargetAtTime(level * level * 0.03, t, 0.3);

    if (this._tensionOsc)
      this._tensionOsc.frequency.setTargetAtTime(110 + level * 180, t, 0.5);

    if (this._ambientGain)
      this._ambientGain.gain.setTargetAtTime(0.04 + level * 0.06, t, 0.5);

    // Heartbeat when tension > 0.6
    if (level > 0.6 && !this._heartbeatTimeout) {
      this._startHeartbeat();
    } else if (level <= 0.6 && this._heartbeatTimeout) {
      clearTimeout(this._heartbeatTimeout);
      this._heartbeatTimeout = null;
    }
  }

  _startHeartbeat() {
    if (!this.active) return;
    const bpm = 80 + this._tension * 60;
    const interval = 60000 / bpm;
    this._playHeartbeat();
    this._heartbeatTimeout = setTimeout(() => {
      this._heartbeatTimeout = null;
      if (this._tension > 0.6) this._startHeartbeat();
    }, interval);
  }

  _playHeartbeat() {
    const { ctx } = this;
    const beat = (freq, delay) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime + delay);
      g.gain.linearRampToValueAtTime(0.3, ctx.currentTime + delay + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.18);
      osc.connect(g); g.connect(this.master);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.2);
    };
    beat(55, 0);
    beat(48, 0.12);
  }

  // ── One-shot sounds ──────────────────────────────────────────────

  playFootstep(running) {
    if (!this.ctx) return;
    const { ctx } = this;
    const bufSize = Math.floor(ctx.sampleRate * 0.07);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 5);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filter = this._filter('lowpass', running ? 900 : 600, 1);
    const g = ctx.createGain();
    g.gain.value = running ? 0.35 : 0.2;

    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start();
  }

  playCollect() {
    if (!this.ctx) return;
    [523, 659, 784].forEach((freq, i) => {
      const osc = this._osc('sine', freq);
      const g = this.ctx.createGain();
      const t0 = this.ctx.currentTime + i * 0.06;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.18, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
      osc.connect(g); g.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.4);
    });
  }

  playBatteryPickup() {
    if (!this.ctx) return;
    const osc = this._osc('square', 220);
    const g = this.ctx.createGain();
    const t0 = this.ctx.currentTime;
    g.gain.setValueAtTime(0.12, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + 0.15);
  }

  playDoor() {
    if (!this.ctx) return;
    const { ctx } = this;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(95, ctx.currentTime + 0.7);
    const dist = ctx.createWaveShaper();
    dist.curve = this._makeDistCurve(300);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.75);
    osc.connect(dist); dist.connect(g); g.connect(this.master);
    osc.start(); osc.stop(ctx.currentTime + 0.75);
  }

  playError() {
    if (!this.ctx) return;
    const { ctx } = this;
    [240, 220, 200].forEach((freq, i) => {
      const osc = this._osc('square', freq);
      const g = ctx.createGain();
      const t0 = ctx.currentTime + i * 0.1;
      g.gain.setValueAtTime(0.15, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);
      osc.connect(g); g.connect(this.master);
      osc.start(t0); osc.stop(t0 + 0.1);
    });
  }

  playSuccess() {
    if (!this.ctx) return;
    [392, 523, 659, 784].forEach((freq, i) => {
      const osc = this._osc('sine', freq);
      const g = this.ctx.createGain();
      const t0 = this.ctx.currentTime + i * 0.09;
      g.gain.setValueAtTime(0.2, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
      osc.connect(g); g.connect(this.master);
      osc.start(t0); osc.stop(t0 + 0.45);
    });
  }

  playGameOver() {
    if (!this.ctx) return;
    const { ctx } = this;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 1.5);
    const dist = ctx.createWaveShaper();
    dist.curve = this._makeDistCurve(600);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.0);
    osc.connect(dist); dist.connect(g); g.connect(this.master);
    osc.start(); osc.stop(ctx.currentTime + 2.0);
  }

  // ── Helpers ──────────────────────────────────────────────────────

  _osc(type, freq) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.start();
    this._nodes.push(osc);
    return osc;
  }

  _filter(type, freq, q) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q || 1;
    return f;
  }

  _makeDistCurve(amount) {
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  stopAll() {
    this.active = false;
    if (this._creakTimeout) clearTimeout(this._creakTimeout);
    if (this._heartbeatTimeout) clearTimeout(this._heartbeatTimeout);
    this._heartbeatTimeout = null;
    this._nodes.forEach(n => { try { n.stop(); } catch (e) {} });
    this._nodes = [];
    this._tensionGain = null;
    this._tensionOsc = null;
    this._ambientGain = null;
  }
}
