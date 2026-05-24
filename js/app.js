/**
 * Cathay Pacific IFE UI — Application Core & State Machine
 * Revised to match reference video:
 *   TAP → Globe with flight animation → Earth slides to bottom + split-flap dest overlay → Board scene
 */

// ── Application States ────────────────────────────────────────
const AppState = {
  START_SCREEN:       'START_SCREEN',
  GLOBE_SCENE:        'GLOBE_SCENE',
  GLOBE_ARRIVE:       'GLOBE_ARRIVE',     // Camera zoomed in to destination
  GLOBE_PULLBACK:     'GLOBE_PULLBACK',   // Earth in lower half, text appears
  TRANSITION_TO_BOARD:'TRANSITION_TO_BOARD',
  BOARD_SCENE:        'BOARD_SCENE'
};

// ── Cabin Audio Synthesizer ───────────────────────────────────
class CabinMusic {
  constructor() {
    this.ctx          = null;
    this.masterGain   = null;
    this.filter       = null;
    this.isPlaying    = false;
    this.chordIndex   = 0;
    this.chordTimeout = null;
    this.chimeInterval= null;

    // Fmaj9 → Cmaj9 → Bbmaj9 → Am9
    this.chords = [
      [87.31, 130.81, 220.00, 329.63, 392.00],
      [65.41, 98.00,  164.81, 246.94, 293.66],
      [116.54,174.61, 293.66, 440.00, 523.25],
      [110.00,164.81, 261.63, 392.00, 493.88]
    ];
  }

  init() {
    if (this.isPlaying) return;
    try {
      const AC   = window.AudioContext || window.webkitAudioContext;
      this.ctx   = new AC();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.07, this.ctx.currentTime);
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type                     = 'lowpass';
      this.filter.frequency.setValueAtTime(480, this.ctx.currentTime);
      this.filter.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.isPlaying = true;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.playNextChord();
      this.startChimeLoop();
    } catch (e) { console.warn('Audio init failed:', e); }
  }

  playNextChord() {
    if (!this.isPlaying || !this.ctx) return;
    const freqs    = this.chords[this.chordIndex];
    this.chordIndex = (this.chordIndex + 1) % this.chords.length;
    const now      = this.ctx.currentTime;
    const dur      = 12, fade = 4;
    const vg       = this.ctx.createGain();
    vg.gain.setValueAtTime(0, now);
    vg.gain.linearRampToValueAtTime(0.14, now + fade);
    vg.gain.setValueAtTime(0.14, now + dur - fade);
    vg.gain.linearRampToValueAtTime(0, now + dur);
    vg.connect(this.filter);
    freqs.forEach(freq => {
      const o1 = this.ctx.createOscillator(), o2 = this.ctx.createOscillator();
      o1.type = 'triangle'; o1.frequency.setValueAtTime(freq - 1.2, now);
      o2.type = 'sine';     o2.frequency.setValueAtTime(freq + 1.2, now);
      o1.connect(vg); o2.connect(vg);
      o1.start(now);  o2.start(now);
      setTimeout(() => { try{o1.stop();o2.stop();}catch(e){} }, (dur + 0.5) * 1000);
    });
    this.chordTimeout = setTimeout(() => this.playNextChord(), (dur - fade) * 1000);
  }

  playCabinChime() {
    if (!this.isPlaying || !this.ctx) return;
    const now = this.ctx.currentTime;
    this._chime(880,    now,        2.5);
    this._chime(1109.73,now + 0.05, 2.3);
    this._chime(783.99, now + 0.8,  3.0);
    this._chime(987.77, now + 0.85, 2.8);
  }

  _chime(freq, t, dur) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const g   = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.011, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const delay    = this.ctx.createDelay();
    const feedback = this.ctx.createGain();
    delay.delayTime.setValueAtTime(0.25, t);
    feedback.gain.setValueAtTime(0.22, t);
    osc.connect(g);
    g.connect(this.masterGain);
    g.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    feedback.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + dur + 0.5);
  }

  startChimeLoop() {
    const next = () => {
      if (!this.isPlaying) return;
      this.chimeInterval = setTimeout(() => { this.playCabinChime(); next(); },
        30000 + Math.random() * 15000);
    };
    next();
  }

  stop() {
    this.isPlaying = false;
    if (this.chordTimeout)  clearTimeout(this.chordTimeout);
    if (this.chimeInterval) clearTimeout(this.chimeInterval);
    if (this.ctx) this.ctx.close();
  }
}

// ── Globe HUD Split-Flap ──────────────────────────────────────
// Removed split-flap from globe HUD to match reference video.

// ── Main Application ──────────────────────────────────────────
class IFEApplication {
  constructor() {
    this.state              = AppState.START_SCREEN;
    this.flights            = window.destinations || [];
    this.currentFlightIndex = 0;

    // DOM
    this.startScreen  = document.getElementById('start-screen');
    this.globeContainer = document.getElementById('globe-container');
    this.starfield    = document.getElementById('starfield');
    this.globeHud     = document.getElementById('globe-hud');
    this.globeEnjoy   = document.getElementById('globe-enjoy-label');
    this.globeDestText= document.getElementById('globe-dest-text');
    this.flapScene    = document.getElementById('flap-scene');
    this.flapTouchHint= document.getElementById('flap-touch-hint');
    this.bgAudio      = document.getElementById('bg-audio');

    if (!this.flights.length) {
      this.flights = [{
        flightNo:'CX826', origin:'HKG', originName:'HONG KONG',
        originCoords:{ lat:22.308, lng:113.918 },
        destination:'YYZ', destinationName:'TORONTO',
        destCoords:{ lat:43.677, lng:-79.624 },
        gate:'23', status:'BOARDING'
      }];
    }

    // Globe HUD flap display removed

    this.init();
  }

  init() {
    this.initStarfield();
    this.initClock();

    this.startScreen.addEventListener('click',      () => this.handleFirstTap());
    this.startScreen.addEventListener('touchstart', e => { e.preventDefault(); this.handleFirstTap(); });
    this.flapTouchHint.addEventListener('click',      () => this.handleNextFlightTap());
    this.flapTouchHint.addEventListener('touchstart', e => { e.preventDefault(); this.handleNextFlightTap(); });

    // Init sub-modules
    const gs = window.GlobeScene;
    if (gs && gs.init) gs.init('globe-container');
    const sfb = window.SplitFlapBoard;
    if (sfb && sfb.init) sfb.init();
  }

  initClock() {
    const el = document.getElementById('flap-time');
    if (!el) return;
    const tick = () => {
      const n = new Date();
      el.textContent = `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
    };
    setInterval(tick, 1000);
    tick();
  }

  initStarfield() {
    const canvas = this.starfield;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W = canvas.width  = window.innerWidth;
    let H = canvas.height = window.innerHeight;

    const stars = Array.from({ length: 80 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 1.2 + 0.3,
      a: Math.random() * 0.7 + 0.15,
      da: (Math.random() * 0.012 + 0.004) * (Math.random() > 0.5 ? 1 : -1)
    }));

    window.addEventListener('resize', () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
    });

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      stars.forEach(s => {
        s.a += s.da;
        if (s.a > 0.9 || s.a < 0.1) s.da = -s.da;
        ctx.globalAlpha = s.a;
        ctx.fillStyle   = '#fff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      requestAnimationFrame(draw);
    };
    draw();
  }

  // ── Tap Handlers ───────────────────────────────────────────
  handleFirstTap() {
    if (this.state !== AppState.START_SCREEN) return;
    if (this.bgAudio) {
      this.bgAudio.currentTime = 118; // Start music at 1:58
      this.bgAudio.volume = 0.5;
      this.bgAudio.play().catch(e => console.warn('Audio play failed:', e));
    }
    this.transitionTo(AppState.GLOBE_SCENE);
  }

  handleNextFlightTap() {
    if (this.state !== AppState.BOARD_SCENE) return;
    this.currentFlightIndex = (this.currentFlightIndex + 1) % this.flights.length;
    this.transitionTo(AppState.GLOBE_SCENE);
  }

  // ── State Machine ──────────────────────────────────────────
  transitionTo(nextState) {
    console.log(`[IFE] ${this.state} → ${nextState}`);
    this.state = nextState;

    switch (nextState) {
      // ── GLOBE_SCENE ────────────────────────────────────────
      case AppState.GLOBE_SCENE: {
        // Sweep wipe animation
        const sweep = document.getElementById('sweep-transition');
        if (sweep) {
          sweep.classList.add('sweep-active');
          setTimeout(() => sweep.classList.remove('sweep-active'), 2600);
        }

        setTimeout(() => {
          // Hide start screen
          if (this.startScreen) {
            this.startScreen.classList.add('hidden-scene');
            setTimeout(() => { this.startScreen.style.display = 'none'; }, 600);
          }
          // Hide board scene
          if (this.flapScene) {
            this.flapScene.classList.remove('visible-scene');
            this.flapScene.classList.add('hidden-scene');
          }
          // Hide globe HUD until arrive
          if (this.globeHud) {
            this.globeHud.classList.remove('globe-hud--visible');
          }

          // Show globe
          if (this.globeContainer) {
            this.globeContainer.style.display = 'block';
            // Force reflow before removing hidden class so transition fires
            void this.globeContainer.offsetWidth;
            this.globeContainer.classList.remove('hidden-scene');
            this.globeContainer.classList.add('visible-scene');
            // Trigger resize so Globe.gl recalculates its canvas dimensions
            setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
          }

          if (this.globeDestText) {
            this.globeDestText.textContent = '';
          }

          // Start the 3D flight animation
          this.startGlobeFlight();
        }, 850);
        break;
      }

      // ── GLOBE_ARRIVE: camera at destination, show text ────
      case AppState.GLOBE_ARRIVE: {
        // Show the HUD overlay
        if (this.globeHud) {
          this.globeHud.classList.add('globe-hud--visible');
        }
        // Use English text like the reference video
        const flight = this.flights[this.currentFlightIndex];
        if (flight && this.globeEnjoy) {
          this.globeEnjoy.textContent = 'Enjoy your journey';
          if (this.globeDestText) {
            this.globeDestText.textContent = flight.destinationName;
          }
        }
        break;
      }

      // ── TRANSITION_TO_BOARD ────────────────────────────────
      case AppState.TRANSITION_TO_BOARD: {
        // Fade out globe HUD
        if (this.globeHud) {
          this.globeHud.classList.remove('globe-hud--visible');
        }
        // Fade out globe
        if (this.globeContainer) {
          this.globeContainer.classList.remove('visible-scene');
          this.globeContainer.classList.add('hidden-scene');
        }
        // Fade in board
        if (this.flapScene) {
          this.flapScene.style.display = 'flex';
          this.flapScene.classList.remove('hidden-scene');
          this.flapScene.classList.add('visible-scene');
        }
        setTimeout(() => this.transitionTo(AppState.BOARD_SCENE), 1100);
        break;
      }

      // ── BOARD_SCENE ────────────────────────────────────────
      case AppState.BOARD_SCENE: {
        this.triggerFlapsUpdate();
        break;
      }
    }
  }

  startGlobeFlight() {
    const flight = this.flights[this.currentFlightIndex];
    if (!flight) return;

    const gs = window.GlobeScene;
    if (gs && gs.startFlight) {
      const dest = {
        lat:  flight.destCoords.lat,
        lng:  flight.destCoords.lng,
        name: flight.destinationName
      };

      gs.startFlight(dest, () => {
        // Globe scene calls onComplete after "pull-back" phase
        // → show text HUD
        this.transitionTo(AppState.GLOBE_ARRIVE);

        // Hold the arrive scene for 3s, then transition to board
        setTimeout(() => {
          this.transitionTo(AppState.TRANSITION_TO_BOARD);
        }, 3500);
      });
    } else {
      // Fallback
      console.warn('[IFE] GlobeScene.startFlight not found – fallback');
      this.transitionTo(AppState.GLOBE_ARRIVE);
      setTimeout(() => this.transitionTo(AppState.TRANSITION_TO_BOARD), 4000);
    }
  }

  triggerFlapsUpdate() {
    const flight = this.flights[this.currentFlightIndex];
    if (!flight) return;
    // Use English board name for split-flap character cycling
    const boardFlight = {
      ...flight,
      destinationName: flight.destinationNameBoard || flight.destination
    };
    const sfb = window.SplitFlapBoard;
    if (sfb && sfb.showFlight) {
      sfb.showFlight(boardFlight);
    }
  }
}

// ── Boot ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  window.ifeApp = new IFEApplication();
});
