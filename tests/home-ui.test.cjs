'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'premium.css'), 'utf8');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const reduceQuery = '(prefers-reduced-motion: reduce)';
const desktopQuery = '(min-width: 641px)';
const decode = value => value.replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");

// This deliberately small DOM parses the checked-in markup and runs the actual
// controller in a VM. It tests DOM state and events, not layout or native browser
// focus/keyboard activation; those still need real-browser accessibility QA.
function markup(input) {
  let document;
  class Element {
    constructor(tagName, attributes = {}) {
      this.tagName = tagName;
      this.attributes = attributes;
      this.children = [];
      this.parentElement = null;
      this.events = new Map();
      this.top = 0;
      this.focusCalls = [];
      this.classList = {
        contains: value => this.classes().includes(value),
        add: (...values) => this.setClasses([...new Set([...this.classes(), ...values])]),
        remove: (...values) => this.setClasses(this.classes().filter(value => !values.includes(value))),
        toggle: (value, force) => {
          const enabled = force === undefined ? !this.classList.contains(value) : Boolean(force);
          if (enabled) this.classList.add(value); else this.classList.remove(value);
          return enabled;
        },
        replace: (before, after) => {
          if (!this.classList.contains(before)) return false;
          this.setClasses(this.classes().map(value => value === before ? after : value));
          return true;
        }
      };
      this.dataset = new Proxy({}, { get: (_, key) => this.attributes['data-' +
        String(key).replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())] });
    }
    classes() { return (this.attributes.class || '').split(/\s+/).filter(Boolean); }
    setClasses(values) { this.attributes.class = values.join(' '); }
    get id() { return this.attributes.id || ''; }
    get hidden() { return Object.hasOwn(this.attributes, 'hidden'); }
    set hidden(value) { if (value) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
    get tabIndex() { return this.attributes.tabindex === undefined ? (this.tagName === 'button' ? 0 : -1) : Number(this.attributes.tabindex); }
    set tabIndex(value) { this.setAttribute('tabindex', value); }
    get textContent() { return this.children.map(child => typeof child === 'string' ? child : child.textContent).join(''); }
    set textContent(value) { this.children = [String(value)]; }
    get innerHTML() { return this._innerHTML || ''; }
    set innerHTML(value) { this._innerHTML = String(value); this.children = []; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    removeAttribute(name) { delete this.attributes[name]; }
    matches(selector) {
      if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
      if (selector.startsWith('#')) return this.id === selector.slice(1);
      const attribute = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(selector);
      if (attribute) return Object.hasOwn(this.attributes, attribute[1]) &&
        (attribute[2] === undefined || this.attributes[attribute[1]] === attribute[2]);
      return this.tagName === selector.toLowerCase();
    }
    querySelectorAll(selector) {
      const result = [];
      for (const child of this.children) {
        if (typeof child === 'string') continue;
        if (child.matches(selector)) result.push(child);
        result.push(...child.querySelectorAll(selector));
      }
      return result;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    addEventListener(type, listener) {
      if (!this.events.has(type)) this.events.set(type, []);
      this.events.get(type).push(listener);
    }
    dispatch(type, fields = {}) {
      const event = { type, target: this, currentTarget: this, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }, ...fields };
      for (const listener of this.events.get(type) || []) listener(event);
      return event;
    }
    click() { if (!this.hidden) return this.dispatch('click'); }
    focus(options) { document.activeElement = this; this.focusCalls.push(options); }
    getBoundingClientRect() { return { top: this.top }; }
  }
  document = new Element('#document');
  const stack = [document];
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  for (const token of input.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^>]*>|[^<]+/g)) {
    const text = token[0];
    if (text.startsWith('<!')) continue;
    if (text.startsWith('</')) {
      const name = /^<\/([\w-]+)/.exec(text)[1].toLowerCase();
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].tagName === name) { stack.length = i; break; }
      }
    } else if (text.startsWith('<')) {
      const name = /^<([\w-]+)/.exec(text)[1].toLowerCase();
      const attributes = {};
      const attributeText = text.slice(name.length + 1, text.endsWith('/>') ? -2 : -1);
      for (const match of attributeText.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
        attributes[match[1]] = decode(match[2] ?? match[3] ?? match[4] ?? '');
      }
      const element = new Element(name, attributes);
      element.parentElement = stack.at(-1);
      stack.at(-1).children.push(element);
      if (!voidTags.has(name) && !text.endsWith('/>')) stack.push(element);
    } else stack.at(-1).children.push(decode(text));
  }
  document.body = document.querySelector('body');
  document.getElementById = id => document.querySelector('#' + id);
  return document;
}

function page(options = {}) {
  const document = markup(html);
  const media = new Map();
  const observers = [];
  const sideEffects = [];
  const prohibited = name => () => { sideEffects.push(name); throw new Error('UI must not call ' + name); };
  const window = {
    innerHeight: 800,
    matchMedia(query) {
      if (media.has(query)) return media.get(query);
      const listeners = [];
      const result = { media: query,
        matches: query === reduceQuery ? Boolean(options.reduced) : Boolean(options.desktop),
        change(matches) {
          this.matches = matches;
          for (const listener of listeners) listener({ matches, media: query });
        }
      };
      if (options.legacyMedia) result.addListener = listener => listeners.push(listener);
      else result.addEventListener = (type, listener) => { assert.equal(type, 'change'); listeners.push(listener); };
      media.set(query, result);
      return result;
    },
    fetch: prohibited('fetch'), setInterval: prohibited('setInterval'), setTimeout: prohibited('setTimeout')
  };
  const reveals = document.querySelectorAll('.reveal');
  reveals.forEach((element, index) => { element.top = options.revealTops?.[index] ?? (index === 0 ? 100 : 900 + index * 100); });
  class IntersectionObserver {
    constructor(callback, config) { this.callback = callback; this.config = config; this.observed = new Set(); observers.push(this); }
    observe(element) { this.observed.add(element); }
    unobserve(element) { this.observed.delete(element); }
    intersect(element, isIntersecting = true) { this.callback([{ target: element, isIntersecting }]); }
  }
  if (!options.noObserver) window.IntersectionObserver = IntersectionObserver;
  for (const storage of ['localStorage', 'sessionStorage', 'indexedDB']) {
    Object.defineProperty(window, storage, { get: prohibited(storage) });
  }
  const sandbox = { document, window, console, fetch: window.fetch,
    setTimeout: window.setTimeout, setInterval: window.setInterval };
  if (!options.noObserver) sandbox.IntersectionObserver = IntersectionObserver;
  vm.runInNewContext(source, sandbox, { filename: 'app.js', timeout: 1000 });
  return { document, window, media, observers, reveals, sideEffects,
    get: id => document.getElementById(id), query: selector => document.querySelector(selector) };
}

function assertSelected(p, selected, other) {
  assert.equal(p.get(selected).getAttribute('aria-selected'), 'true');
  assert.equal(p.get(selected).tabIndex, 0);
  assert.equal(p.get(other).getAttribute('aria-selected'), 'false');
  assert.equal(p.get(other).tabIndex, -1);
  assert.equal(p.get('architecture-panel').getAttribute('aria-labelledby'), selected);
}
function assertMenu(p, open) {
  assert.equal(p.query('.nav-toggle').getAttribute('aria-expanded'), String(open));
  assert.equal(p.query('.nav-toggle').getAttribute('aria-label'), open ? 'Close navigation' : 'Open navigation');
  assert.equal(p.get('mobile-nav').hidden, !open);
  assert.equal(p.query('.header').classList.contains('menu-open'), open);
}
function assertMotion(p, paused) {
  assert.equal(p.document.body.classList.contains('motion-paused'), paused);
  assert.equal(p.document.body.classList.contains('motion-enabled'), !paused);
  assert.equal(p.query('.motion-toggle').getAttribute('aria-pressed'), String(paused));
  assert.equal(p.query('.motion-toggle').querySelector('span').textContent, paused ? 'Resume motion' : 'Pause motion');
}

test('Entry is initially selected with one tab stop and an associated, readable panel', () => {
  const p = page();
  assertSelected(p, 'tab-entry', 'tab-exit');
  assert.equal(p.get('architecture-panel').getAttribute('role'), 'tabpanel');
  assert.equal(p.get('architecture-panel').tabIndex, 0);
  assert.match(p.get('shield-description').textContent, /Entry handles your connecting IP/);
});

test('Selecting Exit and Entry updates all copy and ARIA state without forcing focus', () => {
  const p = page();
  p.get('tab-exit').click();
  assertSelected(p, 'tab-exit', 'tab-entry');
  assert.equal(p.get('shield-kicker').textContent, 'THE DESTINATION-FACING RELAY');
  assert.equal(p.get('shield-title').textContent, 'Where you’re going.\nA separate point of view.');
  assert.match(p.get('shield-description').textContent, /rather than directly from your original connecting IP/);
  assert.match(p.get('shield-detail').textContent, /Accounts and cookies can still identify you/);
  assert.equal(p.get('tab-exit').focusCalls.length, 0);
  p.get('tab-entry').click();
  assertSelected(p, 'tab-entry', 'tab-exit');
  assert.equal(p.get('shield-kicker').textContent, 'THE DEVICE-FACING RELAY');
  assert.equal(p.get('shield-title').textContent, 'Where you connect.\nNot where you’re going.');
  assert.match(p.get('shield-description').textContent, /forwards the encrypted inner connection to Exit/);
  assert.match(p.get('shield-detail').textContent, /stays encrypted through Entry/);
});

for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
  test(key + ' switches tabs, wraps, and keeps focus with selection', () => {
    const p = page();
    const first = p.get('tab-entry').dispatch('keydown', { key });
    assert.equal(first.defaultPrevented, true);
    assertSelected(p, 'tab-exit', 'tab-entry');
    assert.equal(p.document.activeElement, p.get('tab-exit'));
    assert.equal(p.get('tab-exit').focusCalls[0].preventScroll, true);
    const second = p.get('tab-exit').dispatch('keydown', { key });
    assert.equal(second.defaultPrevented, true);
    assertSelected(p, 'tab-entry', 'tab-exit');
    assert.equal(p.document.activeElement, p.get('tab-entry'));
  });
}

test('Home and End select and focus the first and last tabs', () => {
  const p = page();
  assert.equal(p.get('tab-entry').dispatch('keydown', { key: 'End' }).defaultPrevented, true);
  assertSelected(p, 'tab-exit', 'tab-entry');
  assert.equal(p.document.activeElement, p.get('tab-exit'));
  assert.equal(p.get('tab-exit').dispatch('keydown', { key: 'Home' }).defaultPrevented, true);
  assertSelected(p, 'tab-entry', 'tab-exit');
  assert.equal(p.document.activeElement, p.get('tab-entry'));
});

test('Tabs do not intercept Tab, Escape, or typing; native buttons provide activation', () => {
  const p = page();
  for (const key of ['Tab', 'Escape', 'a', 'Enter', ' ']) {
    assert.equal(p.get('tab-entry').dispatch('keydown', { key }).defaultPrevented, false);
    assertSelected(p, 'tab-entry', 'tab-exit');
  }
  for (const tab of p.document.querySelectorAll('[data-shield]')) {
    assert.equal(tab.tagName, 'button');
    assert.equal(tab.getAttribute('type'), 'button');
  }
});

test('Mobile menu starts closed and the toggle synchronizes disclosure state', () => {
  const p = page();
  assertMenu(p, false);
  p.query('.nav-toggle').click(); assertMenu(p, true);
  p.query('.nav-toggle').click(); assertMenu(p, false);
  assert.equal(p.query('.nav-toggle').getAttribute('aria-controls'), 'mobile-nav');
});

test('Every mobile navigation link closes the menu without intercepting navigation', () => {
  const p = page();
  const links = p.get('mobile-nav').querySelectorAll('a');
  assert.ok(links.length >= 4);
  for (const link of links) {
    p.query('.nav-toggle').click();
    assert.equal(link.click().defaultPrevented, false);
    assertMenu(p, false);
  }
});

test('Escape closes an open mobile menu and returns focus, but does nothing when closed', () => {
  const p = page();
  p.query('.nav-toggle').click();
  p.document.dispatch('keydown', { key: 'Escape' });
  assertMenu(p, false);
  assert.equal(p.document.activeElement, p.query('.nav-toggle'));
  assert.equal(p.query('.nav-toggle').focusCalls.length, 1);
  p.document.dispatch('keydown', { key: 'Escape' });
  assert.equal(p.query('.nav-toggle').focusCalls.length, 1);
  p.query('.nav-toggle').click();
  p.document.dispatch('keydown', { key: 'Enter' });
  assertMenu(p, true);
});

for (const legacyMedia of [false, true]) {
  test('Responsive desktop transition closes the menu with ' + (legacyMedia ? 'legacy' : 'modern') + ' media query events', () => {
    const p = page({ legacyMedia });
    p.query('.nav-toggle').click();
    p.media.get(desktopQuery).change(false); assertMenu(p, true);
    p.media.get(desktopQuery).change(true); assertMenu(p, false);
    p.media.get(desktopQuery).change(false); assertMenu(p, false);
    assert.equal(p.query('.nav-toggle').focusCalls.length, 0, 'Resizing must not force focus onto a desktop-hidden toggle');
  });
}

test('Pause motion is enabled only after JavaScript initializes and toggles all motion state', () => {
  const p = page();
  assert.equal(p.document.body.classList.contains('js-enabled'), true);
  assert.equal(p.query('.motion-toggle').hidden, false);
  assertMotion(p, false);
  assert.match(p.query('.motion-toggle').querySelector('svg').innerHTML, /M8 5v14M16 5v14/);
  p.query('.motion-toggle').click(); assertMotion(p, true);
  assert.match(p.query('.motion-toggle').querySelector('svg').innerHTML, /m8 4 12 8-12 8Z/);
  p.query('.motion-toggle').click(); assertMotion(p, false);
});

for (const legacyMedia of [false, true]) {
  test('Reduced motion is a safe initial default and reacts to ' + (legacyMedia ? 'legacy' : 'modern') + ' preference changes', () => {
    const p = page({ reduced: true, legacyMedia });
    assertMotion(p, true);
    assert.equal(p.observers.length, 0, 'Reduced motion must not start reveal observers');
    assert.ok(p.reveals.every(element => !element.classList.contains('reveal-pending')));
    p.media.get(reduceQuery).change(false); assertMotion(p, false);
    p.media.get(reduceQuery).change(true); assertMotion(p, true);
  });
}

test('Reveal enhancement never hides content already visible at initialization', () => {
  const p = page({ revealTops: [-80, 0, 799, 800, 1200, 1800] });
  assert.equal(p.observers.length, 1);
  const observer = p.observers[0];
  assert.equal(observer.config.threshold, 0.06);
  for (const element of p.reveals) {
    assert.equal(element.classList.contains('reveal-pending'), element.top >= p.window.innerHeight);
    assert.equal(observer.observed.has(element), element.top >= p.window.innerHeight);
  }
  const offscreen = p.reveals.find(element => element.top >= 800);
  observer.intersect(offscreen, false);
  assert.equal(offscreen.classList.contains('reveal-pending'), true);
  observer.intersect(offscreen);
  assert.equal(offscreen.classList.contains('reveal-pending'), false);
  assert.equal(offscreen.classList.contains('reveal-visible'), true);
  assert.equal(observer.observed.has(offscreen), false);
});

test('No IntersectionObserver leaves all content readable and controls working', () => {
  const p = page({ noObserver: true });
  assert.equal(p.observers.length, 0);
  assert.ok(p.reveals.every(element => !element.classList.contains('reveal-pending')));
  p.get('tab-exit').click(); assertSelected(p, 'tab-exit', 'tab-entry');
  p.query('.motion-toggle').click(); assertMotion(p, true);
});

test('Motion CSS is opt-in and reduced-motion rules override reveal hiding and animation', () => {
  assert.match(css, /\.reveal\s*\{[^}]*opacity\s*:\s*1\s*;[^}]*transform\s*:\s*none/);
  assert.match(css, /\.motion-paused\s+\*\s*\{[^}]*animation-play-state\s*:\s*paused\s*!important/);
  assert.match(css, /\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/);
  const reducedBlock = css.slice(css.indexOf('@media(prefers-reduced-motion:reduce)'));
  assert.ok(reducedBlock.startsWith('@media(prefers-reduced-motion:reduce)'));
  assert.match(reducedBlock, /animation\s*:\s*none\s*!important/);
  assert.match(reducedBlock, /transition\s*:\s*none\s*!important/);
  assert.match(reducedBlock, /\.reveal,\.motion-enabled\s+\.reveal\.reveal-pending\s*\{[^}]*opacity\s*:\s*1\s*!important/);
  for (const [, selector, declarations] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/\banimation\s*:\s*(?!none\b)/.test(declarations)) {
      assert.match(selector, /\.motion-enabled\b/, 'Animated artwork must require JS-enabled motion: ' + selector);
    }
  }
});

test('Without JavaScript, the core narrative, native FAQs, links, and connection explanation remain in markup', () => {
  const document = markup(html);
  assert.equal(document.body.classList.contains('motion-enabled'), false);
  assert.equal(document.body.classList.contains('js-enabled'), false);
  assert.equal(document.querySelector('.motion-toggle').hidden, true);
  for (const id of ['main', 'hero-title', 'connection', 'connection-details', 'architecture-panel', 'comparison', 'iphone', 'questions']) {
    const element = document.getElementById(id);
    assert.ok(element && element.textContent.trim(), id + ' must contain server-rendered content');
    for (let node = element; node; node = node.parentElement) {
      assert.equal(node.hidden, false, id + ' must not be hidden behind JavaScript');
      assert.equal(node.classList.contains('reveal-pending'), false);
    }
  }
  assert.match(document.querySelector('noscript').textContent, /No lookup runs while JavaScript is disabled/);
  assert.ok(document.querySelectorAll('summary').length >= 7, 'FAQ disclosures must use native markup');
  assert.match(document.getElementById('questions').textContent, /Entry handles the device-facing connection/);
  assert.match(document.getElementById('questions').textContent, /Exit handles connections onward/);
  assert.equal(document.querySelector('.skip').getAttribute('href'), '#main');
});

test('All HTML IDs, ARIA references, table headers, fragments, and local assets resolve', () => {
  const document = markup(html);
  const elements = document.querySelectorAll('[id]');
  const ids = elements.map(element => element.id);
  assert.equal(new Set(ids).size, ids.length, 'Homepage IDs must be unique');
  for (const attribute of ['aria-labelledby', 'aria-describedby', 'aria-controls', 'headers']) {
    for (const element of document.querySelectorAll('[' + attribute + ']')) {
      for (const target of element.getAttribute(attribute).split(/\s+/)) {
        assert.ok(document.getElementById(target), attribute + ' target must exist: ' + target);
      }
    }
  }
  for (const [, id] of source.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)) {
    assert.ok(document.getElementById(id), 'app.js ID must exist: ' + id);
  }
  for (const attribute of ['href', 'src']) {
    for (const element of document.querySelectorAll('[' + attribute + ']')) {
      const value = element.getAttribute(attribute);
      if (/^(?:https?:|mailto:|tel:|data:)/i.test(value)) continue;
      assert.doesNotMatch(value, /^javascript:/i);
      const url = new URL(value, 'https://tianvpn.com/index.html');
      const filename = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      assert.ok(fs.existsSync(path.join(root, filename)), 'Local link or asset must exist: ' + value);
      if (url.hash) {
        const targetDocument = filename === 'index.html' ? document : markup(fs.readFileSync(path.join(root, filename), 'utf8'));
        assert.ok(targetDocument.getElementById(decodeURIComponent(url.hash.slice(1))), 'Fragment must exist: ' + value);
      }
    }
  }
  for (const [, target] of html.matchAll(/url\(#([^)]+)\)/g)) {
    assert.ok(document.getElementById(target), 'SVG paint/filter target must exist: ' + target);
  }
});

test('Connection data remains automatic, with no manual lookup/reveal/clear controls', () => {
  const document = markup(html);
  const connection = document.getElementById('connection-details');
  for (const tag of ['button', 'input', 'form', 'select']) assert.equal(connection.querySelectorAll(tag).length, 0);
  for (const id of ['details-toggle', 'details-clear', 'details-local', 'details-refresh']) {
    assert.equal(document.getElementById(id), null);
  }
  assert.equal(document.getElementById('connection-results').hidden, false);
  assert.equal(document.getElementById('connection-results').getAttribute('aria-busy'), 'true');
  const buttons = document.querySelectorAll('button');
  assert.equal(buttons.length, 4, 'Only navigation, motion, and the two architecture tabs are expected');
  for (const button of buttons) {
    assert.ok(button.classList.contains('nav-toggle') || button.classList.contains('motion-toggle') || button.getAttribute('data-shield'));
  }
});

test('UI interactions make no network requests, timers, or persistent-storage calls', () => {
  const p = page();
  p.get('tab-exit').click();
  p.get('tab-exit').dispatch('keydown', { key: 'Home' });
  p.query('.nav-toggle').click();
  p.document.dispatch('keydown', { key: 'Escape' });
  p.query('.motion-toggle').click();
  p.media.get(reduceQuery).change(true);
  assert.deepEqual(p.sideEffects, []);
});
