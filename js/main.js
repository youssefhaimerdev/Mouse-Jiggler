/* main.js — KeepAwake v2 shared utilities */
(function () {
  'use strict';

  window.gaEvent = function (name, params) {
    if (typeof gtag === 'function') gtag('event', name, params || {});
  };

  document.addEventListener('DOMContentLoaded', function () {

    /* ── Theme ──────────────────────────────────── */
    var THEME_KEY = 'ka-theme';
    function applyTheme(t) {
      document.documentElement.setAttribute('data-theme', t);
      localStorage.setItem(THEME_KEY, t);
    }
    var savedTheme = localStorage.getItem(THEME_KEY) ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(savedTheme);

    document.querySelectorAll('.theme-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cur = document.documentElement.getAttribute('data-theme') || 'light';
        applyTheme(cur === 'dark' ? 'light' : 'dark');
      });
    });

    /* ── Mobile nav ─────────────────────────────── */
    var burger = document.getElementById('nav-burger');
    var mobile = document.getElementById('nav-mobile');
    if (burger && mobile) {
      burger.addEventListener('click', function () {
        var open = mobile.classList.toggle('open');
        burger.setAttribute('aria-expanded', open);
      });
      document.addEventListener('click', function (e) {
        if (!burger.contains(e.target) && !mobile.contains(e.target)) {
          mobile.classList.remove('open');
          burger.setAttribute('aria-expanded', 'false');
        }
      });
    }

    /* ── Active nav ─────────────────────────────── */
    var path = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav__links a, .nav__mobile a').forEach(function (a) {
      if (a.getAttribute('href') === path) a.classList.add('active');
    });

    /* ── FAQ accordion ──────────────────────────── */
    document.querySelectorAll('.faq-question').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var item = btn.closest('.faq-item');
        var isOpen = item.classList.contains('open');
        document.querySelectorAll('.faq-item.open').forEach(function (i) { i.classList.remove('open'); });
        if (!isOpen) item.classList.add('open');
      });
    });

    /* ── Page engaged ───────────────────────────── */
    setTimeout(function () {
      window.gaEvent('page_engaged', { page: location.pathname });
    }, 30000);

    /* ── User counter animation ─────────────────── */
    var counterEl = document.getElementById('user-counter');
    if (counterEl) {
      var target = 47291 + Math.floor(Math.random() * 80);
      var n = 47000;
      var step = function () {
        n += Math.ceil((target - n) * 0.15);
        counterEl.textContent = n.toLocaleString();
        if (n < target) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  });

  /* ── Service worker ─────────────────────────── */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }

  /* Apply theme immediately to avoid flash */
  (function () {
    var t = localStorage.getItem('ka-theme') ||
      (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', t);
  })();
})();
