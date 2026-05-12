/* ============================================================
   jiggler.js — KeepAwake v2
   Techniques (in priority order):
   1. Screen Wake Lock API        — prevents OS screen sleep directly
   2. Picture-in-Picture Video    — floating video window, forces display active
   3. AudioContext silent tone    — keeps browser audio session alive
   4. Web Worker heartbeat        — background timer immune to tab throttling
   5. Canvas animation loop       — continuous render thread activity
   ============================================================ */
(function () {
  'use strict';

  /* ── State ──────────────────────────────────────────── */
  var isRunning    = false;
  var elapsedSecs  = 0;
  var intervalSecs = 60;
  var timerId      = null;
  var intervalId   = null;

  /* Technique handles */
  var wakeLock     = null;
  var pipVideo     = null;
  var audioCtx     = null;
  var oscillator   = null;
  var gainNode     = null;
  var worker       = null;
  var frameId      = null;
  var canvasEl     = null;
  var ctx2d        = null;
  var angle        = 0;

  /* Technique status */
  var techs = {
    wakelock: false,
    pip:      false,
    audio:    false,
    worker:   false,
    canvas:   true,   // always available
  };

  var hasWakeLock = 'wakeLock' in navigator;
  var hasPiP      = 'pictureInPictureEnabled' in document;
  var hasAudio    = !!(window.AudioContext || window.webkitAudioContext);

  /* ── DOM refs ───────────────────────────────────────── */
  var btnToggle, statusDot, statusText, timerDisplay,
      intervalSelect, customWrap, customInput;

  /* =========================================================
     TECHNIQUE 1: Screen Wake Lock API
     Prevents the OS from dimming/locking the screen.
     Teams monitors screen lock state → screen staying ON
     keeps Teams active on most systems.
  ========================================================= */
  async function startWakeLock() {
    if (!hasWakeLock || location.protocol !== 'https:') return false;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', function () {
        techs.wakelock = false;
        updateTechUI();
        if (isRunning) {
          document.addEventListener('visibilitychange', reacquireWakeLock);
        }
      });
      techs.wakelock = true;
      return true;
    } catch (e) {
      techs.wakelock = false;
      return false;
    }
  }

  async function reacquireWakeLock() {
    if (document.visibilityState === 'visible' && isRunning) {
      await startWakeLock();
      document.removeEventListener('visibilitychange', reacquireWakeLock);
      updateTechUI();
    }
  }

  function stopWakeLock() {
    if (wakeLock) { wakeLock.release(); wakeLock = null; }
    document.removeEventListener('visibilitychange', reacquireWakeLock);
    techs.wakelock = false;
  }

  /* =========================================================
     TECHNIQUE 2: Canvas MediaStream + Picture-in-Picture
     Creates an animated canvas, captures it as a video stream,
     and enters Picture-in-Picture mode.
     The PiP floating window signals continuous display activity
     to the OS — even when the browser is minimized.
     This is the most reliable technique for Desktop Teams users.
  ========================================================= */
  async function startPiP() {
    if (!hasPiP) return false;
    try {
      /* Create a tiny animated canvas */
      var pipCanvas = document.createElement('canvas');
      pipCanvas.width = 2; pipCanvas.height = 2;
      var pipCtx = pipCanvas.getContext('2d');
      var pipAngle = 0;

      function animatePip() {
        if (!isRunning) return;
        pipAngle += 0.1;
        pipCtx.fillStyle = 'hsl(' + (pipAngle * 57) + ',60%,50%)';
        pipCtx.fillRect(0, 0, 2, 2);
        requestAnimationFrame(animatePip);
      }
      animatePip();

      /* Capture canvas as a MediaStream and play as video */
      var stream = pipCanvas.captureStream(2); // 2 fps — low CPU
      pipVideo = document.createElement('video');
      pipVideo.srcObject = stream;
      pipVideo.muted     = true;
      pipVideo.loop      = true;
      pipVideo.style.cssText = 'position:fixed;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
      document.body.appendChild(pipVideo);
      await pipVideo.play();

      /* Enter Picture-in-Picture */
      await pipVideo.requestPictureInPicture();
      techs.pip = true;
      return true;
    } catch (e) {
      techs.pip = false;
      return false;
    }
  }

  async function stopPiP() {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      }
    } catch (e) {}
    if (pipVideo) { pipVideo.pause(); pipVideo.remove(); pipVideo = null; }
    techs.pip = false;
  }

  /* =========================================================
     TECHNIQUE 3: AudioContext Silent Tone
     Creates a nearly-silent audio oscillator.
     An active AudioContext signals media activity to the OS,
     which prevents idle detection on many platforms.
     Volume is set to 0.0001 — effectively inaudible.
  ========================================================= */
  function startAudio() {
    if (!hasAudio) return false;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      audioCtx   = new AC();
      oscillator = audioCtx.createOscillator();
      gainNode   = audioCtx.createGain();
      gainNode.gain.value = 0.0001; // ~inaudible
      oscillator.type      = 'sine';
      oscillator.frequency.value = 40; // sub-bass, below audible range
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      techs.audio = true;
      return true;
    } catch (e) {
      techs.audio = false;
      return false;
    }
  }

  function stopAudio() {
    try {
      if (oscillator) { oscillator.stop(); oscillator.disconnect(); oscillator = null; }
      if (gainNode)   { gainNode.disconnect(); gainNode = null; }
      if (audioCtx)   { audioCtx.close(); audioCtx = null; }
    } catch (e) {}
    techs.audio = false;
  }

  /* =========================================================
     TECHNIQUE 4: Web Worker Heartbeat
     Browser tabs can be throttled by the OS when backgrounded,
     causing setInterval to slow down dramatically.
     Web Workers run in a separate thread and are NOT throttled,
     making them immune to this problem.
     The worker fires a tick every intervalSecs seconds,
     triggering our pointer simulation reliably in the background.
  ========================================================= */
  function startWorker() {
    try {
      var workerCode = [
        'var t;',
        'self.onmessage = function(e) {',
        '  if (e.data.type === "start") {',
        '    if (t) clearInterval(t);',
        '    t = setInterval(function() { self.postMessage({type:"tick"}); }, e.data.ms || 60000);',
        '  } else if (e.data.type === "stop") {',
        '    if (t) clearInterval(t);',
        '  }',
        '};',
      ].join('\n');
      var blob   = new Blob([workerCode], { type: 'application/javascript' });
      var blobUrl= URL.createObjectURL(blob);
      worker = new Worker(blobUrl);
      worker.onmessage = function (e) {
        if (e.data.type === 'tick' && isRunning) {
          jigglePointer();
        }
      };
      worker.postMessage({ type: 'start', ms: intervalSecs * 1000 });
      URL.revokeObjectURL(blobUrl);
      techs.worker = true;
      return true;
    } catch (e) {
      techs.worker = false;
      return false;
    }
  }

  function stopWorker() {
    if (worker) { worker.postMessage({ type: 'stop' }); worker.terminate(); worker = null; }
    techs.worker = false;
  }

  /* =========================================================
     TECHNIQUE 5: Canvas Animation Loop
     Continuous requestAnimationFrame loop on a hidden canvas.
     Keeps the browser rendering thread active.
     Always available regardless of browser/OS.
  ========================================================= */
  function startCanvas() {
    if (!canvasEl) {
      canvasEl = document.createElement('canvas');
      canvasEl.width = canvasEl.height = 2;
      canvasEl.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none';
      document.body.appendChild(canvasEl);
      ctx2d = canvasEl.getContext('2d');
    }
    techs.canvas = true;
    canvasLoop();
  }

  function canvasLoop() {
    if (!isRunning) return;
    angle += 0.05;
    ctx2d.fillStyle = 'rgba(' + Math.round(Math.sin(angle) * 127 + 128) + ',0,0,0.01)';
    ctx2d.fillRect(0, 0, 1, 1);
    frameId = requestAnimationFrame(canvasLoop);
  }

  function stopCanvas() {
    if (frameId) { cancelAnimationFrame(frameId); frameId = null; }
  }

  /* =========================================================
     Pointer simulation (supplementary)
     Dispatches synthetic mousemove events on this document.
     NOTE: Browser synthetic events do NOT affect the Windows
     OS idle timer (GetLastInputInfo). They DO help keep
     browser-based activity detection alive (e.g. Teams Web
     if it's in the same browser session).
  ========================================================= */
  var pX = 0, pY = 0, pDir = 1;
  function jigglePointer() {
    pX += pDir;
    if (Math.abs(pX) > 3) pDir *= -1;
    try {
      document.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true, cancelable: false,
        clientX: (window.innerWidth  / 2) + pX,
        clientY: (window.innerHeight / 2) + pY,
        movementX: pDir, movementY: 0,
      }));
    } catch (e) {}
  }

  /* =========================================================
     Main start / stop
  ========================================================= */
  async function startAll() {
    isRunning = true;

    /* Start all techniques in parallel */
    var results = await Promise.all([
      startWakeLock(),
      startAudio(),
    ]);

    startCanvas();

    var workerStarted = startWorker();
    if (!workerStarted) {
      /* Fallback: regular interval (may be throttled in background) */
      jigglePointer();
      intervalId = setInterval(jigglePointer, intervalSecs * 1000);
    }

    /* PiP requires user gesture context — try after small delay */
    setTimeout(async function () {
      if (isRunning) {
        await startPiP();
        updateTechUI();
      }
    }, 500);

    updateTechUI();
    document.title = '🟢 Running — KeepAwake';
    window.gaEvent('jiggler_started', {
      wakelock: techs.wakelock,
      audio:    techs.audio,
      worker:   techs.worker,
      pip:      techs.pip,
    });
  }

  function stopAll() {
    var duration = elapsedSecs;
    isRunning = false;

    stopWakeLock();
    stopPiP();
    stopAudio();
    stopWorker();
    stopCanvas();

    if (intervalId) { clearInterval(intervalId); intervalId = null; }

    updateTechUI();
    document.title = 'KeepAwake — Free Mouse Jiggler';
    window.gaEvent('jiggler_stopped', { duration_seconds: duration });
  }

  /* ── Toggle ─────────────────────────────────── */
  async function toggle() {
    if (isRunning) {
      stopAll();
      stopTimer();
      updateUI(false);
    } else {
      updateUI(true); // optimistic update
      await startAll();
      startTimer();
    }
  }

  /* ── Timer ──────────────────────────────────── */
  function startTimer() {
    elapsedSecs = 0;
    updateTimerDisplay();
    timerId = setInterval(function () {
      elapsedSecs++;
      updateTimerDisplay();
    }, 1000);
  }

  function stopTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
    elapsedSecs = 0;
  }

  function formatTime(s) {
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (h > 0) return h + 'h ' + pad(m) + 'm ' + pad(sec) + 's';
    if (m > 0) return m + 'm ' + pad(sec) + 's';
    return sec + 's';
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function updateTimerDisplay() {
    if (timerDisplay) {
      timerDisplay.textContent = isRunning ? formatTime(elapsedSecs) : '—';
    }
  }

  /* ── UI updates ─────────────────────────────── */
  function updateUI(running) {
    if (!btnToggle) return;
    if (running) {
      btnToggle.textContent = 'Stop Jiggler';
      btnToggle.classList.add('running');
      if (statusDot)  statusDot.classList.add('active');
      if (statusText) { statusText.textContent = 'Jiggling active ✓'; statusText.style.color = 'var(--accent)'; }
    } else {
      btnToggle.textContent = 'Start Jiggler';
      btnToggle.classList.remove('running');
      if (statusDot)  statusDot.classList.remove('active');
      if (statusText) { statusText.textContent = 'Stopped'; statusText.style.color = 'var(--text-3)'; }
      updateTimerDisplay();
    }
  }

  function updateTechUI() {
    setTech('tech-wakelock', techs.wakelock, hasWakeLock ? null : 'Not supported (Firefox/HTTP)');
    setTech('tech-pip',      techs.pip,      hasPiP      ? null : 'Not supported in this browser');
    setTech('tech-audio',    techs.audio,    hasAudio    ? null : 'Not supported');
    setTech('tech-worker',   techs.worker,   null);
    setTech('tech-canvas',   techs.canvas,   null);
  }

  function setTech(id, active, unsupportedMsg) {
    var dot = document.getElementById(id + '-dot');
    var lbl = document.getElementById(id + '-status');
    if (!dot || !lbl) return;
    if (!isRunning) {
      dot.className = 'tech-dot';
      lbl.textContent = '—';
      lbl.className = 'tech-status';
      return;
    }
    if (active) {
      dot.className = 'tech-dot ok';
      lbl.textContent = 'Active';
      lbl.className = 'tech-status ok';
    } else if (unsupportedMsg) {
      dot.className = 'tech-dot warn';
      lbl.textContent = unsupportedMsg;
      lbl.className = 'tech-status warn';
    } else {
      dot.className = 'tech-dot';
      lbl.textContent = 'Inactive';
      lbl.className = 'tech-status';
    }
  }

  /* ── Interval handling ──────────────────────── */
  function getIntervalSecs() {
    var v = intervalSelect ? intervalSelect.value : '60';
    if (v === 'custom') {
      var n = parseInt(customInput ? customInput.value : '60', 10);
      return isNaN(n) || n < 5 ? 60 : Math.min(n, 3600);
    }
    return parseInt(v, 10);
  }

  function onIntervalChange() {
    var v = intervalSelect ? intervalSelect.value : '60';
    if (customWrap) customWrap.style.display = v === 'custom' ? 'flex' : 'none';
    intervalSecs = getIntervalSecs();
    window.gaEvent('interval_changed', { interval_seconds: intervalSecs });
    if (isRunning && worker) {
      worker.postMessage({ type: 'stop' });
      worker.postMessage({ type: 'start', ms: intervalSecs * 1000 });
    } else if (isRunning && intervalId) {
      clearInterval(intervalId);
      jigglePointer();
      intervalId = setInterval(jigglePointer, intervalSecs * 1000);
    }
  }

  /* ── Init ───────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    btnToggle     = document.getElementById('btn-toggle');
    statusDot     = document.getElementById('status-dot');
    statusText    = document.getElementById('status-text');
    timerDisplay  = document.getElementById('timer-display');
    intervalSelect= document.getElementById('interval-select');
    customWrap    = document.getElementById('custom-interval-wrap');
    customInput   = document.getElementById('custom-interval-input');

    if (!btnToggle) return;

    updateUI(false);
    updateTechUI();

    /* Show Wake Lock capability badge */
    var wlEl = document.getElementById('wl-status');
    if (wlEl) {
      if (hasWakeLock && location.protocol === 'https:') {
        wlEl.innerHTML = '<span class="badge badge--green">✓ Wake Lock API available — best performance</span>';
      } else if (!hasWakeLock) {
        wlEl.innerHTML = '<span class="badge badge--gray">Wake Lock unavailable — using PiP + Audio + Canvas fallback</span>';
      } else {
        wlEl.innerHTML = '<span class="badge badge--gray">Wake Lock requires HTTPS — using PiP + Audio + Canvas</span>';
      }
      window.gaEvent('wake_lock_supported', { supported: hasWakeLock && location.protocol === 'https:' });
    }

    btnToggle.addEventListener('click', toggle);

    if (intervalSelect) intervalSelect.addEventListener('change', onIntervalChange);
    if (customInput)    customInput.addEventListener('input', onIntervalChange);

    /* Space bar shortcut */
    document.addEventListener('keydown', function (e) {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
        e.preventDefault();
        toggle();
      }
    });

    /* Re-acquire Wake Lock when tab becomes visible */
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && isRunning && !wakeLock) {
        startWakeLock().then(updateTechUI);
      }
    });
  });

})();
