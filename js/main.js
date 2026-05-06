/* main.js — Theme, nav, FAQ, GA4 helpers */
(function () {
  'use strict';
  const THEME_KEY = 'sa-theme';

  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem(THEME_KEY, t);
  }
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const pref  = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    applyTheme(saved || pref);
  }

  window.gaEvent = function (name, params) {
    if (typeof gtag === 'function') gtag('event', name, params || {});
  };

  document.addEventListener('DOMContentLoaded', () => {
    // Theme buttons
    document.querySelectorAll('.theme-toggle').forEach(btn =>
      btn.addEventListener('click', () => {
        const cur = document.documentElement.getAttribute('data-theme') || 'light';
        applyTheme(cur === 'dark' ? 'light' : 'dark');
      })
    );

    // Mobile nav
    const burger = document.getElementById('nav-burger');
    const mobile = document.getElementById('nav-mobile');
    if (burger && mobile) {
      burger.addEventListener('click', () => {
        const open = mobile.classList.toggle('open');
        burger.setAttribute('aria-expanded', open);
      });
      document.addEventListener('click', e => {
        if (!burger.contains(e.target) && !mobile.contains(e.target)) {
          mobile.classList.remove('open');
          burger.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // Active nav link
    const path = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav__links a, .nav__mobile a').forEach(a => {
      const href = a.getAttribute('href');
      if (href === path || (path === '' && href === 'index.html')) a.classList.add('active');
    });

    // FAQ accordion
    document.querySelectorAll('.faq-question').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.faq-item');
        const open = item.classList.contains('open');
        document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
        if (!open) item.classList.add('open');
      });
    });

    // Page engaged event
    setTimeout(() => window.gaEvent('page_engaged', { page: location.pathname }), 30000);
  });

  initTheme();
})();
