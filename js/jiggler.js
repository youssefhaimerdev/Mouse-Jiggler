/* jiggler.js — Wake Lock + Canvas + Pointer event simulation */
(function () {
  'use strict';

  let isRunning = false, wakeLock = null, intervalId = null;
  let timerId = null, elapsedSecs = 0, intervalSecs = 60;
  let frameId = null, angle = 0, canvas, ctx;
  let pX, pY, pDir = 1;

  const hasWakeLock = 'wakeLock' in navigator;

  /* DOM refs */
  let btnToggle, statusDot, statusText, timerDisplay, methodBadge,
      intervalSelect, customWrap, customInput;

  function setupCanvas() {
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = 2;
    canvas.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
  }

  async function acquireWakeLock() {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        if (isRunning) document.addEventListener('visibilitychange', reacquire);
      });
      return true;
    } catch { return false; }
  }

  async function reacquire() {
    if (document.visibilityState === 'visible' && isRunning) {
      await acquireWakeLock();
      document.removeEventListener('visibilitychange', reacquire);
    }
  }

  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release(); wakeLock = null; }
    document.removeEventListener('visibilitychange', reacquire);
  }

  function canvasLoop() {
    if (!isRunning) return;
    angle += 0.05;
    ctx.clearRect(0, 0, 2, 2);
    ctx.fillStyle = `rgba(${Math.sin(angle) * 127 + 128},0,0,0.01)`;
    ctx.fillRect(0, 0, 1, 1);
    frameId = requestAnimationFrame(canvasLoop);
  }

  function jigglePointer() {
    pX = (pX || window.innerWidth / 2) + pDir;
    if (Math.abs(pX - window.innerWidth / 2) > 3) pDir *= -1;
    try {
      document.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true, cancelable: false,
        clientX: pX, clientY: pY || window.innerHeight / 2,
        movementX: pDir, movementY: 0
      }));
    } catch {}
  }

  async function startJiggling() {
    let method = 'pointer';
    if (hasWakeLock && location.protocol === 'https:') {
      if (await acquireWakeLock()) method = 'wakelock';
    }
    canvasLoop();
    jigglePointer();
    intervalId = setInterval(jigglePointer, intervalSecs * 1000);
    return method;
  }

  function stopJiggling() {
    clearInterval(intervalId); intervalId = null;
    if (frameId) { cancelAnimationFrame(frameId); frameId = null; }
    releaseWakeLock();
  }

  function fmt(s) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m ${String(sec).padStart(2,'0')}s`;
    if (m > 0) return `${m}m ${String(sec).padStart(2,'0')}s`;
    return `${sec}s`;
  }

  function updateUI(method) {
    if (!btnToggle) return;
    if (isRunning) {
      btnToggle.textContent = 'Stop Jiggler';
      btnToggle.classList.add('running');
      statusDot.classList.add('active');
      statusText.textContent = 'Jiggling active ✓';
      statusText.style.color = 'var(--accent)';
      if (methodBadge) {
        methodBadge.textContent = method === 'wakelock'
          ? 'Wake Lock API + Canvas + Pointer Events'
          : 'Canvas + Pointer Events Simulation';
        methodBadge.className = 'badge badge--green';
      }
    } else {
      btnToggle.textContent = 'Start Jiggler';
      btnToggle.classList.remove('running');
      statusDot.classList.remove('active');
      statusText.textContent = 'Stopped';
      statusText.style.color = 'var(--text-3)';
      if (methodBadge) { methodBadge.textContent = 'Not running'; methodBadge.className = 'badge badge--gray'; }
      if (timerDisplay) timerDisplay.textContent = '—';
    }
  }

  function getIntervalSecs() {
    const v = intervalSelect ? intervalSelect.value : '60';
    if (v === 'custom') {
      const n = parseInt(customInput ? customInput.value : '60', 10);
      return (isNaN(n) || n < 5) ? 60 : Math.min(n, 3600);
    }
    return parseInt(v, 10);
  }

  async function toggle() {
    if (isRunning) {
      const dur = elapsedSecs;
      isRunning = false;
      stopJiggling();
      clearInterval(timerId); timerId = null;
      updateUI(null);
      window.gaEvent('jiggler_stopped', { duration_seconds: dur });
      document.title = 'StayAwake — Free Online Mouse Jiggler';
    } else {
      intervalSecs = getIntervalSecs();
      isRunning = true;
      const method = await startJiggling();
      elapsedSecs = 0;
      if (timerDisplay) timerDisplay.textContent = '0s';
      timerId = setInterval(() => {
        elapsedSecs++;
        if (timerDisplay) timerDisplay.textContent = fmt(elapsedSecs);
      }, 1000);
      updateUI(method);
      window.gaEvent('jiggler_started', { method });
      document.title = '🟢 Running — StayAwake Mouse Jiggler';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    btnToggle      = document.getElementById('btn-toggle');
    statusDot      = document.getElementById('status-dot');
    statusText     = document.getElementById('status-text');
    timerDisplay   = document.getElementById('timer-display');
    methodBadge    = document.getElementById('method-badge');
    intervalSelect = document.getElementById('interval-select');
    customWrap     = document.getElementById('custom-interval-wrap');
    customInput    = document.getElementById('custom-interval-input');

    if (!btnToggle) return;

    setupCanvas();
    updateUI(null);

    // Wake lock status badge
    const wlEl = document.getElementById('wl-status');
    if (wlEl) {
      const ok = hasWakeLock && location.protocol === 'https:';
      wlEl.innerHTML = ok
        ? '<span class="badge badge--green">✓ Wake Lock API available — best performance</span>'
        : '<span class="badge badge--gray">Wake Lock unavailable (Firefox/HTTP) — using Canvas + Pointer fallback</span>';
      window.gaEvent('wake_lock_supported', { supported: ok });
    }

    // User counter animation
    const counterEl = document.getElementById('user-counter');
    if (counterEl) {
      const target = 47291 + Math.floor(Math.random() * 60);
      let n = 47000;
      const step = () => {
        n += Math.ceil((target - n) * 0.15);
        counterEl.textContent = n.toLocaleString();
        if (n < target) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    btnToggle.addEventListener('click', toggle);

    if (intervalSelect) {
      intervalSelect.addEventListener('change', () => {
        const v = intervalSelect.value;
        if (customWrap) customWrap.style.display = v === 'custom' ? 'flex' : 'none';
        intervalSecs = getIntervalSecs();
        window.gaEvent('interval_changed', { interval_seconds: intervalSecs });
        if (isRunning) {
          clearInterval(intervalId);
          jigglePointer();
          intervalId = setInterval(jigglePointer, intervalSecs * 1000);
        }
      });
    }

    document.addEventListener('keydown', e => {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
        e.preventDefault(); toggle();
      }
    });
  });
})();
