/**
 * Cathay Pacific IFE UI — Application Core & State Machine
 * Revised to match reference video:
 *   TAP → Globe with flight animation → Earth slides to bottom + split-flap dest overlay → Board scene
 */

// ── Application States ────────────────────────────────────────
const AppState = {
  START_SCREEN:       'START_SCREEN',
  GLOBE_SCENE:        'GLOBE_SCENE',
  DEST_REVEAL:        'DEST_REVEAL',      // Shows destination rolling
  GLOBE_ARRIVE:       'GLOBE_ARRIVE'      // Camera zoomed in to destination
};

// ── Audio handled by <audio> tag in HTML ──────────────────────

// ── Main Application ──────────────────────────────────────────
class IFEApplication {
  constructor() {
    this.state              = AppState.START_SCREEN;
    this.flights            = window.destinations || [];
    this.currentFlightIndex = 0;
    this.selectedLang       = 'en'; // default language

    // DOM
    this.startScreen  = document.getElementById('start-screen');
    this.globeContainer = document.getElementById('globe-container');
    this.starfield    = document.getElementById('starfield');
    this.globeHud     = document.getElementById('globe-hud');
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

    // Shuffle destinations with Fisher-Yates
    for (let i = this.flights.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.flights[i], this.flights[j]] = [this.flights[j], this.flights[i]];
    }

    // 降低中国境内航点（除港台外）的出现概率：随机丢弃 70% 的中国航点
    const CN_AIRPORTS = new Set(['PEK', 'PVG', 'CAN', 'CTU', 'XMN', 'WUH']);
    this.flights = this.flights.filter(f => {
      if (CN_AIRPORTS.has(f.destination)) {
        return Math.random() < 0.3; // 只保留 30%
      }
      return true;
    });

    // Globe HUD flap display removed

    this.init();
  }

  init() {
    this.initStarfield();
    this.initClock();

    const langItems = document.querySelectorAll('.lang-list li');
    langItems.forEach(item => {
      const handler = () => {
        const langMap = {
          'English': 'en', '繁體中文': 'zh-TW', '簡體中文': 'zh-CN',
          '日本語': 'ja', '한국어': 'ko', 'Français': 'fr', 'Deutsch': 'de'
        };
        this.selectedLang = langMap[item.textContent.trim()] || 'en';
        console.log('[IFE] Language selected:', this.selectedLang, 'from text:', item.textContent.trim());
        this.handleFirstTap();
      };
      item.addEventListener('click', handler);
      item.addEventListener('touchstart', e => { e.preventDefault(); handler(); });
    });

    // Init sub-modules
    const gs = window.GlobeScene;
    if (gs && gs.init) gs.init('globe-container');
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

    const stars = Array.from({ length: 30 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.2 + 0.3,
      a: Math.random() * 0.7 + 0.15
    }));

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      stars.forEach(s => {
        ctx.globalAlpha = s.a;
        ctx.fillStyle   = '#fff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    };

    window.addEventListener('resize', () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
      stars.forEach(s => {
        s.x = Math.random() * W;
        s.y = Math.random() * H;
      });
      draw();
    });

    draw();
  }

  // ── Destination Name by Language ────────────────────────
  getDestName(flight) {
    const lang = this.selectedLang;
    if (lang === 'zh-TW' || lang === 'ja' || lang === 'ko') {
      // 日韩用汉字（与繁中通用）
      return flight.destinationNameCn || flight.destinationName || flight.destination;
    }
    if (lang === 'zh-CN') {
      return flight.destinationNameCnS || flight.destinationNameCn || flight.destinationName || flight.destination;
    }
    return flight.destinationName || flight.destination;
  }

  // 出发地（香港）的本地化名称
  getOriginName() {
    const lang = this.selectedLang;
    if (lang === 'en' || lang === 'fr' || lang === 'de') return 'Hong Kong';
    return '香港';
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

  // ── State Machine ──────────────────────────────────────────
  transitionTo(nextState) {
    console.log(`[IFE] ${this.state} → ${nextState}`);
    this.state = nextState;

    switch (nextState) {
      // ── GLOBE_SCENE (Initial Tap) ──────────────────────────
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
          
          // Show globe
          if (this.globeContainer) {
            this.globeContainer.classList.remove('hidden-scene');
            this.globeContainer.classList.add('visible-scene');
            setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
          }

          // Go directly to DEST_REVEAL after globe is visible
          setTimeout(() => this.transitionTo(AppState.DEST_REVEAL), 100);
        }, 850);
        break;
      }

      // ── DEST_REVEAL: Show HUD, roll text, wait, then fly ──
      case AppState.DEST_REVEAL: {
        // Show Cathay logo first
        if (this.globeHud) {
          this.globeHud.classList.add('globe-hud--visible');
          // Toggle cjk-mode on HUD content
          const hudContent = document.querySelector('.globe-hud-content');
          if (hudContent) {
            const isCJK = (this.selectedLang === 'zh-TW' || this.selectedLang === 'zh-CN' || this.selectedLang === 'ja' || this.selectedLang === 'ko');
            hudContent.classList.toggle('cjk-mode', isCJK);
          }
        }

        const flight = this.flights[this.currentFlightIndex];

        // After 1.5s, show localized subtitle + rolling text
        setTimeout(() => {
          const subtitle = document.getElementById('rolling-subtitle');
          if (subtitle) {
            const subtitles = {
              'en': 'Enjoy your flight to',
              'zh-TW': '請享受前往',
              'zh-CN': '请享受前往',
              'ja': 'ご搭乗ください',
              'ko': '행운의 비행을',
              'fr': 'Bon vol vers',
              'de': 'Guten Flug nach',
            };
            subtitle.textContent = subtitles[this.selectedLang] || subtitles['en'];
            subtitle.style.opacity = '1';
          }

          console.log('[IFE] DEST_REVEAL: selectedLang=', this.selectedLang);
          if (flight) {
            const destName = this.getDestName(flight);
            console.log('[IFE] DEST_REVEAL: destName=', destName);
            this.revealDestination(destName);
          }
        }, 1500);

        // Wait 5.5 seconds total for text roll to finish + hold, then start flight
        setTimeout(() => {
          if (this.globeHud) {
            this.globeHud.classList.remove('globe-hud--visible');
          }
          // Hide subtitle
          const subtitle = document.getElementById('rolling-subtitle');
          if (subtitle) subtitle.style.opacity = '0';
          // small delay for hud to fade out before camera moves
          setTimeout(() => {
            this.startGlobeFlight();
          }, 600);
        }, 5500);
        break;
      }

      // ── GLOBE_ARRIVE: camera at destination, wait to board ──
      case AppState.GLOBE_ARRIVE: {
        const flight = this.flights[this.currentFlightIndex];
        const destText = document.getElementById('globe-dest-text');
        const enjoyLabel = document.querySelector('.globe-enjoy-label');
        const rolling = document.getElementById('rolling-text-container');
        const finalText = document.getElementById('final-text-container');

        // Toggle cjk-mode on HUD content
        const hudContent = document.querySelector('.globe-hud-content');
        if (hudContent) {
          const isCJK = (this.selectedLang === 'zh-TW' || this.selectedLang === 'zh-CN' || this.selectedLang === 'ja' || this.selectedLang === 'ko');
          hudContent.classList.toggle('cjk-mode', isCJK);
        }

        if (destText && flight) {
          destText.textContent = this.getDestName(flight);
        }
        if (enjoyLabel) {
          const enjoyLabels = {
            'en': 'Enjoy your journey',
            'zh-TW': '享受你的旅程',
            'zh-CN': '享受你的旅程',
            'ja': '良い旅を',
            'ko': '좋은 여행 되세요',
            'fr': 'Bon voyage',
            'de': 'Gute Reise',
          };
          enjoyLabel.textContent = enjoyLabels[this.selectedLang] || enjoyLabels['en'];
          enjoyLabel.style.display = '';
        }
        if (rolling) rolling.style.display = 'none';
        if (finalText) finalText.style.display = 'flex';
        
        if (this.globeHud) {
          this.globeHud.classList.add('end-scene');
          this.globeHud.classList.add('globe-hud--visible');
        }
        
        
        if (window.GlobeScene && window.GlobeScene.shiftCameraToBottom) {
          window.GlobeScene.shiftCameraToBottom(2000);
        }
        break;
      }
    }
  }

  revealDestination(targetName) {
    const container = document.getElementById('rolling-text-container');
    if (!container) return;

    container.innerHTML = '';

    const lang = this.selectedLang;
    const isCJK = (lang === 'zh-TW' || lang === 'zh-CN' || lang === 'ja' || lang === 'ko');
    container.classList.toggle('rolling-text-cjk', isCJK);

    const enChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const zhTWChars = '香港新加坡東京首爾台北大阪上海北京廣州成都廈門武漢曼谷吉隆坡馬尼拉雅加達河內孟買迪拜倫敦巴黎法蘭克福阿姆斯特丹蘇黎世米蘭多倫多洛杉磯紐約舊金山溫哥華芝加哥雪梨墨爾本奧克蘭';
    const zhCNChars = '香港新加坡东京首尔台北大阪上海北京广州成都厦门武汉曼谷吉隆坡马尼拉雅加达河内孟买迪拜伦敦巴黎法兰克福阿姆斯特丹苏黎世米兰多伦多洛杉矶纽约旧金山温哥华芝加哥雪梨墨尔本奥克兰';
    const chars = (lang === 'zh-CN') ? zhCNChars : (isCJK ? zhTWChars : enChars);

    const letters = targetName.split('');
    const numRolls = 45;
    const charHeight = 60;

    letters.forEach((targetChar, index) => {
      const col = document.createElement('div');
      col.className = 'rolling-char-col';

      const inner = document.createElement('div');
      inner.className = 'rolling-char-inner';
      col.appendChild(inner);
      container.appendChild(col);

      if (targetChar === ' ') {
        const space = document.createElement('div');
        space.className = 'rolling-char';
        space.innerHTML = '&nbsp;';
        inner.appendChild(space);
        return;
      }

      // For CJK characters, use full-width space for consistency
      const displayTarget = (isCJK && targetChar !== ' ') ? targetChar : targetChar;

      for (let i = 0; i < numRolls; i++) {
        const charDiv = document.createElement('div');
        charDiv.className = 'rolling-char blur';

        if (i === numRolls - 1) {
          charDiv.textContent = displayTarget;
          charDiv.classList.remove('blur');
        } else {
          charDiv.textContent = chars[Math.floor(Math.random() * chars.length)];
        }
        inner.appendChild(charDiv);
      }

      inner.style.transform = `translateY(0px)`;

      setTimeout(() => {
        inner.style.transition = `transform 3.2s cubic-bezier(0.1, 0.8, 0.2, 1)`;
        inner.style.transform = `translateY(-${(numRolls - 1) * charHeight}px)`;

        setTimeout(() => {
          Array.from(inner.children).forEach(child => child.classList.remove('blur'));
        }, 2800);
      }, 200 + index * 100);
    });
  }

  startGlobeFlight() {
    const flight = this.flights[this.currentFlightIndex];
    if (!flight) return;
    if (window.GlobeScene) {
      const dest = {
        lat:  flight.destCoords.lat,
        lng:  flight.destCoords.lng,
        name: this.getDestName(flight),
        originName: this.getOriginName()
      };

      window.GlobeScene.startFlight(dest, () => {
        // Flight finished
        this.transitionTo(AppState.GLOBE_ARRIVE);
        
        // Wait 5 seconds, then reset to start screen for next flight
        setTimeout(() => {
          this.currentFlightIndex = (this.currentFlightIndex + 1) % this.flights.length;
          
          // Fade out globe and HUD
          if (this.globeContainer) {
            this.globeContainer.classList.remove('visible-scene');
            this.globeContainer.classList.add('hidden-scene');
          }
          if (this.globeHud) {
            this.globeHud.classList.remove('globe-hud--visible');
            setTimeout(() => {
              this.globeHud.classList.remove('end-scene');
              const rolling = document.getElementById('rolling-text-container');
              const finalText = document.getElementById('final-text-container');
              if (rolling) rolling.style.display = 'flex';
              if (finalText) finalText.style.display = 'none';
            }, 1000);
          }
          
          if (window.GlobeScene && window.GlobeScene.reset) {
            window.GlobeScene.reset();
          }
          
          // Fade in start screen
          if (this.startScreen) {
            this.startScreen.style.display = 'flex';
            void this.startScreen.offsetWidth;
            this.startScreen.classList.remove('hidden-scene');
          }
          
          setTimeout(() => this.transitionTo(AppState.START_SCREEN), 1500);
        }, 5000);
      });
    } else {
      // Fallback
      console.warn('[IFE] GlobeScene.startFlight not found – fallback');
      this.transitionTo(AppState.GLOBE_ARRIVE);
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
