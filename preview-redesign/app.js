(() => {
  'use strict';
  const body = document.body;
  body.classList.add('js-enabled');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = preference.matches;
  const motionButton = document.querySelector('.motion-toggle');
  function applyMotion() {
    body.classList.toggle('motion-paused', paused);
    body.classList.toggle('motion-enabled', !paused);
    if (!motionButton) return;
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.querySelector('span').textContent = paused ? 'Resume motion' : 'Pause motion';
    motionButton.querySelector('svg').innerHTML = paused ? '<path d="m8 4 12 8-12 8Z"/>' : '<path d="M8 5v14M16 5v14"/>';
  }
  applyMotion();
  if (motionButton) {
    motionButton.hidden = false;
    motionButton.addEventListener('click', () => { paused = !paused; applyMotion(); });
  }
  const preferenceChanged = () => { paused = preference.matches; applyMotion(); };
  if (preference.addEventListener) preference.addEventListener('change', preferenceChanged);
  else if (preference.addListener) preference.addListener(preferenceChanged);

  const header = document.querySelector('.header');
  const toggle = document.querySelector('.nav-toggle');
  const mobileNav = document.getElementById('mobile-nav');
  if (toggle && mobileNav) {
    function setMenu(open, restoreFocus = false) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      mobileNav.hidden = !open;
      header.classList.toggle('menu-open', open);
      if (restoreFocus) toggle.focus();
    }
    toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
    mobileNav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !mobileNav.hidden) setMenu(false, true);
    });
    const desktop = window.matchMedia('(min-width: 641px)');
    if (desktop.addEventListener) desktop.addEventListener('change', event => { if (event.matches) setMenu(false); });
  }

  const data = {
    entry: {
      kicker: 'THE DEVICE-FACING RELAY',
      title: 'Where you connect.\nNot where you’re going.',
      description: 'Entry handles your connecting IP and forwards the encrypted inner connection to Exit. The destination-facing work happens at the other relay.',
      detail: '↳ Your device-to-Exit inner connection stays encrypted through Entry.'
    },
    exit: {
      kicker: 'THE DESTINATION-FACING RELAY',
      title: 'Where you’re going.\nA separate point of view.',
      description: 'Exit handles the inner connection and routes traffic onward to your destination. It receives that connection through Entry rather than directly from your original connecting IP.',
      detail: '↳ Websites receive the Exit IP. Accounts and cookies can still identify you.'
    }
  };
  const tabs = [...document.querySelectorAll('[data-shield]')];
  function select(tab, focus = false) {
    const next = data[tab.dataset.shield];
    if (!next) return;
    tabs.forEach(item => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
    });
    document.getElementById('shield-kicker').textContent = next.kicker;
    document.getElementById('shield-title').textContent = next.title;
    document.getElementById('shield-description').textContent = next.description;
    document.getElementById('shield-detail').textContent = next.detail;
    document.getElementById('architecture-panel').setAttribute('aria-labelledby', tab.id);
    if (focus) tab.focus({preventScroll: true});
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (i + 1) % tabs.length;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); select(tabs[next], true); }
    });
  });
  // Content is fully visible without JavaScript and when motion is reduced.
  if ('IntersectionObserver' in window && !preference.matches) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.replace('reveal-pending', 'reveal-visible');
        observer.unobserve(entry.target);
      });
    }, {threshold: 0.06, rootMargin: '0px 0px 25px 0px'});
    document.querySelectorAll('.reveal').forEach(element => {
      // Never hide an already-visible section while the page is initializing.
      if (element.getBoundingClientRect().top < window.innerHeight) return;
      element.classList.add('reveal-pending');
      observer.observe(element);
    });
  }
})();
