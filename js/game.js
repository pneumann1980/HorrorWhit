'use strict';

const STATE = {
  LOADING: 'loading', MENU: 'menu', PLAYING: 'playing',
  PAUSED: 'paused', GAMEOVER: 'gameover', WIN: 'win'
};

class Game {
  constructor() {
    this.state = STATE.LOADING;
    this.clock = new THREE.Clock();
    this.renderer = null;
    this.scene = null;
    this.camera = null;

    this.audio   = null;
    this.effects = null;
    this.ui      = null;
    this.level   = null;
    this.items   = null;
    this.enemy   = null;
    this.player  = null;
  }

  init() {
    this._setupRenderer();
    this._setupScene();

    // Subsystems (order matters: audio/ui first, then level, then actors)
    this.audio   = new AudioManager();
    this.audio.init();

    this.ui      = new UI();
    this.level   = new Level(this.scene);
    this.effects = new EffectsManager(this.camera, this.scene);
    this.items   = new ItemManager(this.scene, this.ui, this.audio);
    this.enemy   = new Enemy(this.scene, this.audio);
    this.player  = new Player(this.camera, this.scene, this.ui, this.audio, this.items, this.level);

    // Build world
    this.level.build();
    this.items.placeItems();
    this.enemy.initialize(this.level.getPatrolWaypoints());

    // Wire up win callback
    this.items.onWin = () => this._win();

    // Touch controls (no-op on desktop)
    touchControls.init(this.player);

    // Mobile detection (used to skip pointer lock)
    this._isMobile = TouchControls.isMobile();

    // Events
    window.addEventListener('resize', () => this._onResize());
    this._bindMenuButtons();

    // Show main menu
    this.setState(STATE.MENU);
    this._fakeLoad();
    this._loop();
  }

  // ── State machine ────────────────────────────────────────────────

  setState(s) {
    this.state = s;
    const ids = ['mainMenu','pauseMenu','gameOverScreen','winScreen',
                 'hud','loadingScreen','controlsScreen'];
    ids.forEach(id => document.getElementById(id)?.classList.add('hidden'));

    if (s === STATE.MENU)     { document.getElementById('mainMenu').classList.remove('hidden'); }
    if (s === STATE.PLAYING) {
      document.getElementById('hud').classList.remove('hidden');
      // Show touch controls if on touch device (touchControls.init already added class)
      if (this._isMobile) {
        document.getElementById('touchControls')?.classList.remove('hidden');
      }
    }
    if (s === STATE.PAUSED) {
      document.getElementById('hud').classList.remove('hidden');
      document.getElementById('pauseMenu').classList.remove('hidden');
      // Hide touch controls while paused (menu handles resume)
      document.getElementById('touchControls')?.classList.add('hidden');
    }
    if (s === STATE.MENU || s === STATE.GAMEOVER || s === STATE.WIN) {
      document.getElementById('touchControls')?.classList.add('hidden');
    }
    if (s === STATE.GAMEOVER) { document.getElementById('gameOverScreen').classList.remove('hidden'); }
    if (s === STATE.WIN)      { document.getElementById('winScreen').classList.remove('hidden'); }
    if (s === STATE.LOADING)  { document.getElementById('loadingScreen').classList.remove('hidden'); }
  }

  _startGame() {
    this.audio.resume();
    this._resetGame();
    this.setState(STATE.PLAYING);
    if (!this._isMobile) {
      document.getElementById('gameCanvas').requestPointerLock?.();
    }
    this.audio.startAmbient();
  }

  _resetGame() {
    this.player.reset();
    this.enemy.reset();
    this.items.reset();
    this.level.reset();
    this.effects.reset();
    this.clock.getDelta(); // flush
  }

  _pause() {
    this.setState(STATE.PAUSED);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  _resume() {
    this.setState(STATE.PLAYING);
    if (!this._isMobile) {
      document.getElementById('gameCanvas').requestPointerLock?.();
    }
  }

  _goMenu() {
    this.audio.stopAll();
    if (document.pointerLockElement) document.exitPointerLock();
    this.setState(STATE.MENU);
  }

  _gameOver() {
    this.audio.playGameOver();
    this.audio.stopAll();
    if (document.pointerLockElement) document.exitPointerLock();
    this.effects.gameOver();
    setTimeout(() => this.setState(STATE.GAMEOVER), 1200);
  }

  _win() {
    this.audio.playSuccess();
    if (document.pointerLockElement) document.exitPointerLock();
    setTimeout(() => this.setState(STATE.WIN), 800);
  }

  // ── Game loop ─────────────────────────────────────────────────────

  _loop() {
    requestAnimationFrame(() => this._loop());
    const delta = Math.min(this.clock.getDelta(), 0.08);

    if (this.state === STATE.PLAYING) {
      this._update(delta);
    } else if (this.state === STATE.PAUSED) {
      // Keep rendering but no logic
    }

    this.renderer.render(this.scene, this.camera);
  }

  _update(delta) {
    // Check ESC first
    if (this.player.input.escape) {
      this.player.input.escape = false;
      if (this.ui.isKeypadOpen()) {
        this.ui.closeKeypad();
      } else if (!this.ui.isNoteOpen()) {
        this._pause();
        return;
      }
    }

    // Push joystick values into player before movement is processed
    touchControls.applyJoystick();
    this.player.update(delta, this.state);

    const playerPos = this.player.getPosition();
    this.enemy.update(delta, playerPos, this.player.getDirection());
    this.items.update(delta);

    // Tension from enemy proximity
    const dist = this.enemy.getDistanceToPlayer(playerPos);
    const tension = Math.max(0, 1 - dist / 14);
    this.effects.setTension(tension);
    this.audio.setTension(tension);

    // Level update (handles light flicker, passes tension for extra effect)
    this.level.update(delta, tension);
    this.effects.update(delta);

    // Game over: enemy attacks
    if (this.enemy.isAttacking() && dist < 1.8) {
      this._gameOver();
      return;
    }

    // Win: player reached exit
    if (this.player.hasWon) {
      this._win();
    }
  }

  // ── Setup helpers ────────────────────────────────────────────────

  _setupRenderer() {
    const canvas = document.getElementById('gameCanvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = false;
    this.renderer.setClearColor(0x000000);
  }

  _setupScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x000000, 0.055);
    this.camera = new THREE.PerspectiveCamera(
      72, window.innerWidth / window.innerHeight, 0.1, 80
    );
    this.camera.position.set(0, 1.7, 0);
  }

  _bindMenuButtons() {
    const $ = id => document.getElementById(id);

    $('startBtn').addEventListener('click',   () => this._startGame());
    $('controlsBtn').addEventListener('click', () => {
      $('mainMenu').classList.add('hidden');
      $('controlsScreen').classList.remove('hidden');
    });
    $('backBtn').addEventListener('click', () => {
      $('controlsScreen').classList.add('hidden');
      $('mainMenu').classList.remove('hidden');
    });
    $('resumeBtn').addEventListener('click',  () => this._resume());
    $('mainMenuBtn').addEventListener('click',() => this._goMenu());
    $('retryBtn').addEventListener('click',   () => this._startGame());
    $('goMenuBtn').addEventListener('click',  () => this._goMenu());
    $('winMenuBtn').addEventListener('click', () => this._goMenu());

    // Keypad close callback
    this.ui.onKeypadClose = () => {
      if (this.state === STATE.PLAYING) {
        document.getElementById('gameCanvas').requestPointerLock();
      }
    };
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _fakeLoad() {
    // Brief loading animation then show menu
    const fill = document.getElementById('loadingFill');
    let pct = 0;
    const iv = setInterval(() => {
      pct += 8 + Math.random() * 12;
      fill.style.width = Math.min(100, pct) + '%';
      if (pct >= 100) {
        clearInterval(iv);
        setTimeout(() => {
          document.getElementById('loadingScreen').classList.add('hidden');
          document.getElementById('mainMenu').classList.remove('hidden');
        }, 300);
      }
    }, 80);
  }
}

// ── Bootstrap ────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  const game = new Game();
  game.init();
  window._game = game;
});
