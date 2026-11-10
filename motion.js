// TIAN motion layer. Runs after app.js. Everything here is an enhancement: with this script off, or with
// motion paused, the page shows its finished state.
(() => {
  'use strict';
  const body = document.body;
  const motionOn = () => body.classList.contains('motion-enabled');
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const canObserve = 'IntersectionObserver' in window;

  // ---- header: reading progress and the section in view ----
  const header = $('.header');
  if (header) {
    const bar = document.createElement('span');
    bar.className = 'read-progress';
    bar.setAttribute('aria-hidden', 'true');
    header.appendChild(bar);
    const nav = $('.main-nav');
    const links = nav ? $$('a[href^="#"]', nav) : [];
    const targets = links.map(a => document.getElementById(a.getAttribute('href').slice(1)));
    let glider = null, current = null, ticking = false;
    if (nav) {
      glider = document.createElement('span');
      glider.className = 'nav-glider';
      glider.setAttribute('aria-hidden', 'true');
      nav.appendChild(glider);
    }
    const place = () => {
      if (!glider) return;
      nav.classList.toggle('has-active', !!current);
      if (!current) return;
      glider.style.setProperty('--x', current.offsetLeft + 'px');
      glider.style.setProperty('--w', current.offsetWidth + 'px');
    };
    const update = () => {
      ticking = false;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.setProperty('--read', max > 0 ? Math.min(1, window.scrollY / max).toFixed(4) : '0');
      const line = window.innerHeight * 0.38;
      let active = null;
      targets.forEach((t, i) => {
        if (!t) return;
        const r = t.getBoundingClientRect();
        if (r.top <= line && r.bottom > line) active = links[i];
      });
      if (active === current) return;
      current = active;
      links.forEach(a => (a === active ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current')));
      place();
    };
    const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', () => { update(); place(); });
    update();
  }

  // ---- headings rise line by line (the break tags become real lines) ----
  function splitLines(heading) {
    if (heading.classList.contains('split')) return;
    const lines = [[]];
    [...heading.childNodes].forEach(node => (node.nodeName === 'BR' ? lines.push([]) : lines[lines.length - 1].push(node)));
    heading.textContent = '';
    lines.filter(nodes => nodes.length).forEach((nodes, i) => {
      const outer = document.createElement('b'), inner = document.createElement('b');
      outer.className = 'ln';
      inner.className = 'ln-in';
      inner.style.setProperty('--i', i);
      nodes.forEach(node => inner.appendChild(node));
      outer.appendChild(inner);
      heading.appendChild(outer);
    });
    heading.classList.add('split');
  }
  if (motionOn()) $$('.hero h1, .section-heading h2, .details-heading h2, .faq-heading h2, .closing h2, .privacy-promise h2').forEach(splitLines);

  // ---- reveals: a short stagger inside each row, and a few more things that reveal ----
  const rowDelay = selector => {
    const groups = new Map();
    $$(selector).forEach(el => { const p = el.parentElement; groups.set(p, (groups.get(p) || []).concat(el)); });
    groups.forEach(list => list.forEach((el, i) => el.style.setProperty('--rd', (i % 4) * 80 + 'ms')));
  };
  rowDelay('.experience-grid > .feature-card, .platforms-grid > .platform-card, .principles > div');
  if (motionOn() && canObserve) {
    const io = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.replace('reveal-pending', 'reveal-visible');
      io.unobserve(entry.target);
    }), { threshold: 0.08, rootMargin: '0px 0px -4% 0px' });
    $$('.principles > div, .comparison-table-wrap, .closing .wrap, .questions details').forEach(el => {
      if (el.getBoundingClientRect().top < window.innerHeight) return;
      el.classList.add('reveal', 'reveal-pending');
      io.observe(el);
    });
  }
  // Once a reveal has finished, hover transitions go back to their own quick timing.
  document.addEventListener('transitionend', event => {
    const el = event.target;
    if (event.propertyName === 'opacity' && el.classList && el.classList.contains('reveal-visible')) el.classList.remove('reveal-visible');
  });

  // ---- hero picture: the connection's route and the travelling light ----
  const stage = $('.information-stage');
  if (stage) {
    const layer = document.createElement('div');
    layer.className = 'flow-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = '<svg class="flow"><defs><linearGradient id="flow-grad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="0"><stop offset="0" stop-color="#7ec8ff"/><stop offset=".5" stop-color="#5ce1e6"/><stop offset="1" stop-color="#64f4ac"/></linearGradient></defs><path class="flow-line"/><circle class="flow-node" r="3"/><circle class="flow-node flow-node-b" r="3"/></svg><span class="flow-end flow-you">You</span><span class="flow-end flow-web">Web</span><i class="flow-light"></i>';
    stage.appendChild(layer);
    const piece = $('.information-piece', stage);
    const line = $('.flow-line', layer), grad = $('#flow-grad', layer), nodes = $$('.flow-node', layer);
    const layout = () => {
      const W = stage.clientWidth;
      if (!W) return;
      const g = Math.max(5, Math.min(9, W * 0.015)), top = 158, r = 8;
      const y = piece ? piece.offsetTop + piece.offsetHeight / 2 : 325;
      line.setAttribute('d', `M${g} ${top}V${y - r}Q${g} ${y} ${g + r} ${y}H${W - g - r}Q${W - g} ${y} ${W - g} ${y - r}V${top}`);
      grad.setAttribute('x2', W);
      nodes[0].setAttribute('cx', g); nodes[0].setAttribute('cy', top);
      nodes[1].setAttribute('cx', W - g); nodes[1].setAttribute('cy', top);
      layer.style.setProperty('--fg', g + 'px');
      layer.style.setProperty('--fy', top + 'px');
      layer.style.setProperty('--fdx', (W - 2 * g) + 'px');
      layer.style.setProperty('--fdy', (y - top) + 'px');
    };
    layout();
    if ('ResizeObserver' in window) new ResizeObserver(layout).observe(stage);
    else window.addEventListener('resize', layout);
    $$('.knowledge-well p', stage).forEach(p => p.insertAdjacentHTML('afterbegin', '<svg class="well-check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.6l3 3 6-7.2" pathLength="1"/></svg>'));
  }

  // ---- live footprint: a value shimmers while it is really being checked, and settles when it arrives ----
  const values = ['detail-ip', 'detail-provider', 'detail-location', 'detail-device', 'detail-browser', 'detail-os'].map(id => document.getElementById(id)).filter(Boolean);
  if (values.length && 'MutationObserver' in window) {
    const settle = el => {
      const waiting = /^Checking/.test(el.textContent.trim());
      const waited = el.classList.contains('is-wait');
      el.classList.toggle('is-wait', waiting);
      if (waiting) el.classList.remove('is-done');
      else if (waited) { void el.offsetWidth; el.classList.add('is-done'); }
    };
    values.forEach(el => {
      el.classList.add('scan-val');
      settle(el);
      new MutationObserver(() => settle(el)).observe(el, { childList: true, characterData: true, subtree: true });
    });
  }

  // ---- how it works: the two tabs become a two-step walkthrough ----
  const tabs = $$('[data-shield]'), panel = $('#architecture-panel'), compare = $('.knowledge-comparison'), tabBox = $('.architecture-tabs');
  if (tabs.length === 2 && panel && tabBox) {
    if (compare) {
      const link = document.createElement('i');
      link.className = 'knowledge-link';
      link.setAttribute('aria-hidden', 'true');
      compare.appendChild(link);
    }
    const selected = () => tabs.find(t => t.getAttribute('aria-selected') === 'true');
    const sync = () => { const t = selected(); if (compare && t) compare.dataset.active = t.dataset.shield; };
    sync();
    new MutationObserver(() => {
      sync();
      if (!motionOn()) return;
      panel.classList.remove('swap');
      void panel.offsetWidth;
      panel.classList.add('swap');
    }).observe(panel, { attributes: true, attributeFilter: ['aria-labelledby'] });

    let auto = true, inView = false, timer = 0;
    const schedule = () => {
      clearTimeout(timer);
      const run = auto && inView && motionOn();
      tabBox.classList.toggle('tabs-auto', run);
      if (!run) return;
      timer = setTimeout(() => {
        const next = tabs.find(t => t.getAttribute('aria-selected') !== 'true');
        if (auto && motionOn() && next) next.click();
        schedule();
      }, 6000);
    };
    const stop = () => { auto = false; schedule(); };
    tabs.forEach(t => { t.addEventListener('pointerdown', stop); t.addEventListener('keydown', stop); });
    if (canObserve) new IntersectionObserver(entries => { inView = entries[0].isIntersecting; schedule(); }, { threshold: 0.6 }).observe(tabBox);
    new MutationObserver(schedule).observe(body, { attributes: true, attributeFilter: ['class'] });
  }

  // ---- cards answer the pointer with a soft light ----
  if (window.matchMedia('(hover: hover)').matches) {
    $$('.feature-card, .platform-card, .knowledge-card, .principles > div, .questions details').forEach(card => {
      card.classList.add('glow-card');
      card.addEventListener('pointermove', event => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (event.clientX - r.left) + 'px');
        card.style.setProperty('--my', (event.clientY - r.top) + 'px');
      });
    });
  }

  // ---- line icons draw themselves ----
  $$('.platform-icon svg, .promise-icon svg').forEach(svg => {
    svg.classList.add('draw-icon');
    $$('path, rect, circle', svg).forEach(shape => shape.setAttribute('pathLength', '1'));
  });

  // ---- comparison: a tiny route drawing above each column title ----
  const glyphs = {
    'compare-standard': '<path d="M2 8H70"/><circle cx="36" cy="8" r="4.5"/>',
    'compare-double': '<path d="M2 8H70"/><circle cx="27" cy="8" r="4.5"/><circle cx="45" cy="8" r="4.5"/>',
    'compare-tian': '<path class="g-a" d="M2 8H22"/><circle class="g-a" cx="27" cy="8" r="4.5"/><path class="g-gap" d="M36 1.5V14.5"/><circle class="g-b" cx="45" cy="8" r="4.5"/><path class="g-b" d="M50 8H70"/>'
  };
  Object.keys(glyphs).forEach(id => {
    const cell = document.getElementById(id);
    if (cell) cell.insertAdjacentHTML('afterbegin', '<svg class="route-glyph" viewBox="0 0 72 16" aria-hidden="true">' + glyphs[id] + '</svg>');
  });

  // ---- questions open and close smoothly ----
  $$('.questions details').forEach(item => {
    const summary = $('summary', item);
    if (!summary || !item.animate) return;
    let running = null;
    summary.addEventListener('click', event => {
      if (!motionOn()) return;
      event.preventDefault();
      if (running) running.cancel();
      const opening = !item.open || item.classList.contains('closing');
      const from = item.offsetHeight;
      item.classList.toggle('closing', !opening);
      if (opening) item.open = true;
      const to = opening ? item.offsetHeight : summary.offsetHeight + (item.offsetHeight - item.clientHeight);
      item.style.overflow = 'hidden';
      running = item.animate({ height: [from + 'px', to + 'px'] }, { duration: 340, easing: 'cubic-bezier(.2,.7,.2,1)' });
      running.onfinish = () => {
        if (!opening) item.open = false;
        item.classList.remove('closing');
        item.style.overflow = '';
        running = null;
      };
      running.oncancel = () => { item.style.overflow = ''; };
    });
  });

  // ---- the hero arrives (the timer is a safety net for tabs where frames are throttled) ----
  const arrive = () => body.classList.add('hero-in');
  requestAnimationFrame(() => requestAnimationFrame(arrive));
  setTimeout(arrive, 900);
})();
