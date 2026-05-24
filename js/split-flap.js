/**
 * Cathay Pacific IFE UI — Split-Flap Departure Board Engine
 * Synthesizes a mechanically realistic 3D split-flap display.
 */

(function () {
  'use strict';

  // Supported character drum list
  const CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-";

  // Configuration for row widths
  const ROW_CONFIGS = {
    flight: { id: 'flap-row-flight', count: 6 },
    from:   { id: 'flap-row-from',   count: 3 },
    to:     { id: 'flap-row-to',     count: 14 },  // longest: SAN FRANCISCO = 13 chars
    gate:   { id: 'flap-row-gate',   count: 3 },
    status: { id: 'flap-row-status', count: 12 }
  };

  // Stagger delays (in ms)
  const ROW_STAGGER_DELAY = 120;
  const COL_STAGGER_DELAY = 40;

  // Help unlock audio context on initial interactions
  window.addEventListener('click', () => {});
  window.addEventListener('touchstart', () => {});

  // Helper to determine flip duration from CSS variables dynamically
  let cachedFlipDurationMs = null;
  function getFlipDurationMs() {
    if (cachedFlipDurationMs !== null) return cachedFlipDurationMs;
    const root = document.documentElement;
    const style = getComputedStyle(root);
    const durationStr = style.getPropertyValue('--flip-duration').trim();
    if (durationStr.endsWith('ms')) {
      cachedFlipDurationMs = parseFloat(durationStr);
    } else if (durationStr.endsWith('s')) {
      cachedFlipDurationMs = parseFloat(durationStr) * 1000;
    } else {
      cachedFlipDurationMs = 250; // default fallback
    }
    return cachedFlipDurationMs;
  }

  // Get sequence of characters from current to target
  function getCharSequence(curr, target) {
    let idxC = CHARS.indexOf(curr);
    let idxT = CHARS.indexOf(target);
    
    if (idxC === -1) idxC = 0; // fallback to space
    if (idxT === -1) idxT = 0; // fallback to space
    
    if (idxC === idxT) {
      return [curr];
    }

    const seq = [];
    let currIdx = idxC;
    while (currIdx !== idxT) {
      seq.push(CHARS[currIdx]);
      currIdx = (currIdx + 1) % CHARS.length;
    }
    seq.push(CHARS[idxT]);
    return seq;
  }

  // Representation of a single 3D split-flap character cell
  class FlapCell {
    constructor(domElement, initialChar = " ") {
      this.el = domElement;
      this.currentChar = initialChar;
      this.targetChar = initialChar;
      this.isFlipping = false;
      this.sequence = [];
      this.seqIndex = 0;
      this.timer = null;

      // Cache DOM nodes for maximum performance
      this.staticTopText = this.el.querySelector('.flap-top .flap-text');
      this.staticBottomText = this.el.querySelector('.flap-bottom .flap-text');
      this.flipTop = this.el.querySelector('.flap-flip-top');
      this.flipTopText = this.el.querySelector('.flap-flip-top .flap-text');
      this.flipBottom = this.el.querySelector('.flap-flip-bottom');
      this.flipBottomText = this.el.querySelector('.flap-flip-bottom .flap-text');
    }

    // Set value immediately without animation (e.g. initial setup)
    setCharInstant(char) {
      this.currentChar = char;
      this.targetChar = char;
      
      this.staticTopText.textContent = char;
      this.staticBottomText.textContent = char;
      this.flipTopText.textContent = char;
      this.flipBottomText.textContent = char;
      
      this.isFlipping = false;
      
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      
      this.flipTop.classList.remove('flipping');
      this.flipBottom.classList.remove('flipping');
    }

    // Apply color variants for Status row cells
    setStatusColor(color) {
      const texts = [
        this.staticTopText,
        this.staticBottomText,
        this.flipTopText,
        this.flipBottomText
      ];
      texts.forEach(span => {
        if (color) {
          span.setAttribute('data-status-color', color);
        } else {
          span.removeAttribute('data-status-color');
        }
      });
    }

    // Initiate rolling to target character
    flipTo(targetChar, delay = 0, onComplete) {
      this.targetChar = targetChar;
      if (this.currentChar === targetChar) {
        if (onComplete) onComplete();
        return;
      }

      this.sequence = getCharSequence(this.currentChar, targetChar);
      this.seqIndex = 1; // index 0 is current character

      if (this.timer) {
        clearTimeout(this.timer);
      }

      if (delay > 0) {
        this.timer = setTimeout(() => {
          this.runFlipSequence(onComplete);
        }, delay);
      } else {
        this.runFlipSequence(onComplete);
      }
    }

    // Recursive stepping through character drum positions
    runFlipSequence(onComplete) {
      if (this.seqIndex >= this.sequence.length) {
        this.isFlipping = false;
        if (onComplete) onComplete();
        return;
      }

      this.isFlipping = true;
      const nextChar = this.sequence[this.seqIndex];
      const currChar = this.currentChar;

      // Set text panels for physical step
      // Top static panel shows target of this step (which becomes visible as top flap drops)
      this.staticTopText.textContent = nextChar;
      // Bottom static panel shows current (covered until bottom flap completes drop)
      this.staticBottomText.textContent = currChar;
      // Flipping top panel shows current (starts horizontal and folds down)
      this.flipTopText.textContent = currChar;
      // Flipping bottom panel shows target (reveals its back as it lays down on bottom)
      this.flipBottomText.textContent = nextChar;

      // Trigger 3D css animation
      this.flipTop.classList.remove('flipping');
      this.flipBottom.classList.remove('flipping');
      
      // Force reflow to ensure the browser registers the class removal before re-adding it.
      // This is necessary for CSS animations to restart reliably without breaking sync with setTimeout.
      void this.el.offsetWidth;

      this.flipTop.classList.add('flipping');
      this.flipBottom.classList.add('flipping');

      const duration = getFlipDurationMs();

      this.timer = setTimeout(() => {
        // Complete the step: update current character
        this.currentChar = nextChar;

        // Sync all text content to ensure correct static display
        this.staticTopText.textContent = nextChar;
        this.staticBottomText.textContent = nextChar;
        this.flipTopText.textContent = nextChar;
        this.flipBottomText.textContent = nextChar;

        // Reset animation states
        this.flipTop.classList.remove('flipping');
        this.flipBottom.classList.remove('flipping');

        // Go to next step
        this.seqIndex++;
        this.runFlipSequence(onComplete);
      }, duration);
    }
  }

  // Active cells cache
  const cellsMap = {
    flight: [],
    from: [],
    to: [],
    gate: [],
    status: []
  };

  const SplitFlapBoard = {
    /**
     * Set up row cells programmatically according to ROW_CONFIGS
     */
    init() {
      for (const [key, config] of Object.entries(ROW_CONFIGS)) {
        const rowEl = document.getElementById(config.id);
        if (!rowEl) {
          console.warn(`SplitFlapBoard: Row element #${config.id} not found.`);
          continue;
        }

        // Reset HTML contents
        rowEl.innerHTML = '';
        cellsMap[key] = [];

        // Build individual cells
        for (let i = 0; i < config.count; i++) {
          const charEl = document.createElement('div');
          charEl.className = 'flap-char';
          charEl.innerHTML = `
            <div class="flap-top"><span class="flap-text"> </span></div>
            <div class="flap-bottom"><span class="flap-text"> </span></div>
            <div class="flap-flip-top"><span class="flap-text"> </span></div>
            <div class="flap-flip-bottom"><span class="flap-text"> </span></div>
          `;
          rowEl.appendChild(charEl);

          const cellInstance = new FlapCell(charEl, ' ');
          cellsMap[key].push(cellInstance);
        }
      }
      console.log('SplitFlapBoard: Initialized successfully with programmatically generated DOM.');
    },

    /**
     * Transition the board to display new flight details
     * @param {Object} flightData - e.g. { flightNo, origin, destinationName, gate, status }
     * @param {Function} onComplete - Callback executed when all cells stop flipping
     */
    showFlight(flightData, onComplete) {
      if (!flightData) {
        if (onComplete) onComplete();
        return;
      }

      // 1. Sanitize and prepare target strings for each row
      const rawValues = {
        flight: flightData.flightNo || '',
        from: flightData.origin || '',
        to: flightData.destinationName || '',
        gate: flightData.gate || '',
        status: flightData.status || ''
      };

      // Determine target status color variant
      let statusColor = '';
      if (rawValues.status) {
        const upperStatus = rawValues.status.toUpperCase();
        if (upperStatus.includes('DELAY') || upperStatus.includes('CANCEL') || upperStatus.includes('LATE')) {
          statusColor = 'warn';
        } else if (upperStatus.includes('BOARD') || upperStatus.includes('GO') || upperStatus.includes('NOW') || upperStatus.includes('CLOSE')) {
          statusColor = 'info';
        }
      }

      // Compute total cells flipping to manage the callback
      let cellsFlippingCount = 0;
      let cellsFinishedCount = 0;
      let animationStarted = false;

      function checkAllComplete() {
        if (cellsFinishedCount === cellsFlippingCount) {
          if (onComplete) {
            onComplete();
          }
        }
      }

      // Define row key order for vertical cascading wave
      const rowOrder = ['flight', 'from', 'to', 'gate', 'status'];

      rowOrder.forEach((key, rowIndex) => {
        const cells = cellsMap[key];
        const targetConfig = ROW_CONFIGS[key];
        if (!cells || !targetConfig) return;

        // Sanitize string to uppercase and pad to target character length
        let targetStr = rawValues[key].toUpperCase();
        
        // Remove unsupported characters, replacing them with spaces
        let cleanedStr = '';
        for (let i = 0; i < targetStr.length; i++) {
          const char = targetStr[i];
          cleanedStr += CHARS.includes(char) ? char : ' ';
        }
        
        // Pad end
        cleanedStr = cleanedStr.padEnd(targetConfig.count, ' ');

        // Apply status color on status row cells
        if (key === 'status') {
          cells.forEach(cell => cell.setStatusColor(statusColor));
        }

        // Apply flip on each cell
        cells.forEach((cell, colIndex) => {
          const targetChar = cleanedStr[colIndex] || ' ';
          if (cell.currentChar !== targetChar) {
            cellsFlippingCount++;
            
            // Calculate delay for stagger effect (horizontal + vertical wave)
            const staggerDelay = (rowIndex * ROW_STAGGER_DELAY) + (colIndex * COL_STAGGER_DELAY);

            cell.flipTo(targetChar, staggerDelay, () => {
              cellsFinishedCount++;
              checkAllComplete();
            });
          } else {
            // Ensure status color applies even if character doesn't change
            if (key === 'status') {
              cell.setStatusColor(statusColor);
            }
          }
        });
      });

      animationStarted = true;

      // Handle the edge case where no cells needed to flip
      if (cellsFlippingCount === 0) {
        if (onComplete) {
          onComplete();
        }
      }
    },

    /**
     * Orchestrator-compatible compatibility wrapper
     */
    flipTo(flightData, onComplete) {
      this.showFlight(flightData, onComplete);
    }
  };

  // Expose API globally (both uppercase and lowercase to support orchestrator integration)
  window.SplitFlapBoard = SplitFlapBoard;
  window.splitFlapBoard = SplitFlapBoard;

})();
