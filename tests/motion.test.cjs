'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('index.html');
const base = read('premium.css');
const css = read('motion.css').replace(/\/\*[\s\S]*?\*\//g, '');
const js = read('motion.js');

// Source-contract checks for the motion and type layer (motion.css, motion.js), in the manner of
// information-story.test.cjs. They do not run a browser: timing, layout and how the motion feels
// still need browser review at desktop and phone widths.

const rules = [], faces = [], keyframes = new Map();
(function parse(text, media) {
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    const prelude = text.slice(i, open).trim();
    let depth = 1, end = open + 1;
    while (depth && end < text.length) {
      if (text[end] === '{') depth += 1;
      if (text[end] === '}') depth -= 1;
      end += 1;
    }
    assert.equal(depth, 0, 'Every block in motion.css must be closed: ' + prelude);
    const body = text.slice(open + 1, end - 1);
    if (/^@media\b/.test(prelude)) parse(body, prelude);
    else if (/^@keyframes\b/.test(prelude)) {
      keyframes.set(prelude.replace(/^@keyframes\s+/, ''), [...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, stops, frame]) => ({
        offsets: stops.split(',').map(stop => ({ from: 0, to: 100 })[stop.trim()] ?? parseFloat(stop)),
        body: frame
      })));
    } else if (prelude === '@font-face') faces.push(body);
    else rules.push({ selector: prelude, body, media });
    i = end;
  }
})(css, '');
const parts = rule => rule.selector.split(',').map(value => value.trim());
const ruleFor = selector => rules.find(rule => parts(rule).includes(selector));

test('The motion layer is linked after the base stylesheet and after app.js, with a version tag', () => {
  const at = name => html.indexOf(name + '?v=');
  for (const name of ['premium.css', 'motion.css', 'app.js', 'motion.js']) assert.ok(at(name) > 0, name + ' must be linked with a version tag');
  assert.ok(at('premium.css') < at('motion.css'), 'motion.css overrides premium.css, so it must come second');
  assert.ok(at('app.js') < at('motion.js'), 'motion.js reads the motion state that app.js sets');
  assert.match(html, /<script src="motion\.js\?v=[\w-]+" defer><\/script>/);
});

test('The motion layer loads nothing from another host and stores nothing', () => {
  assert.doesNotMatch(css, /@import\b/i);
  for (const [, resource] of css.matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/g)) {
    if (resource.startsWith('#')) continue;
    assert.doesNotMatch(resource, /^(?:https?:)?\/\//i, 'CSS asset must stay local: ' + resource);
    assert.ok(fs.existsSync(path.join(root, resource)), 'CSS asset must exist: ' + resource);
  }
  assert.doesNotMatch(js, /https?:\/\/|\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|\bimport\s*\(/, 'motion.js must not contact any host');
  assert.doesNotMatch(js, /localStorage|sessionStorage|document\.cookie|indexedDB/, 'motion.js must not store anything');
});

test('The motion layer takes its fonts from the shared fonts.css (see fonts.test.cjs)', () => {
  assert.equal(faces.length, 0, 'Font files are declared once, in fonts.css');
  const fonts = html.indexOf('fonts.css?v=');
  assert.ok(fonts > 0 && fonts < html.indexOf('premium.css?v='), 'fonts.css must be linked before the other stylesheets');
});

test('Headlines and interface use the display stack and reading text uses the serif stack, each with a system fallback', () => {
  const variables = ruleFor(':root').body;
  const value = name => new RegExp(name + '\\s*:\\s*([^;]+)').exec(variables)[1].trim();
  assert.match(value('--display'), /^var\(--tian-display,.*sans-serif\)$/);
  assert.match(value('--serif'), /^var\(--tian-serif,.*serif\)$/);
  assert.equal(value('--mono'), 'var(--display)', 'Small labels are interface text');
  assert.match(ruleFor('body').body, /font-family\s*:\s*var\(--display\)/);
  const reading = rules.find(rule => /font-family\s*:\s*var\(--serif\)/.test(rule.body));
  for (const selector of ['.hero-lede', '.section-heading>p', '.feature-copy p', '.platform-card p', '.comparison-table td', '.questions details p', '.privacy-promise p:not(.eyebrow)']) {
    assert.ok(parts(reading).includes(selector), 'Reading text must use the serif stack: ' + selector);
  }
  assert.match(ruleFor('.signal-ip dd>span').body, /font-family\s*:\s*var\(--mono-real\)/, 'The IP address stays monospaced');
  assert.match(base, /--display\s*:\s*-apple-system/, 'The base stylesheet keeps the system stack underneath');
});

test('Every animation and every hidden-until-revealed state waits for motion to be enabled', () => {
  let animated = 0;
  for (const rule of rules) {
    const animates = /(?:^|;)\s*animation(?:-name)?\s*:\s*(?!none)/.test(rule.body);
    for (const part of parts(rule)) {
      if (animates) { animated += 1; assert.match(part, /\.motion-enabled\b/, 'Animation must be opt-in: ' + part); }
      if (/reveal-pending|:not\(\.hero-in\)|\.is-wait|\.is-done|\.swap\b|\.tabs-auto/.test(part)) {
        assert.match(part, /\.motion-enabled\b/, 'A state that hides or moves content must be opt-in: ' + part);
      }
    }
    for (const [, name] of rule.body.matchAll(/(?:^|;)\s*animation\s*:\s*([\w-]+)/g)) {
      if (name !== 'none') assert.ok(keyframes.has(name), 'Keyframes must exist for ' + name);
    }
  }
  assert.ok(animated >= 20, 'The layer is expected to animate; found ' + animated);
  assert.match(base, /\.motion-paused\s+\*\s*\{[^}]*animation-play-state\s*:\s*paused\s*!important/);
  assert.match(base, /@media\(prefers-reduced-motion:reduce\)/);
});

test('The hero loop lights one view at a time and never moves the picture cards along a path', () => {
  const opacity = name => new Map(keyframes.get(name).flatMap(frame => frame.offsets.map(offset => [offset, Number(/opacity\s*:\s*([\d.]+)/.exec(frame.body)[1])])));
  const identity = opacity('veil-a'), destination = opacity('veil-b');
  assert.deepEqual([...identity.keys()].sort((a, b) => a - b), [...destination.keys()].sort((a, b) => a - b));
  for (const [offset, veil] of identity) {
    assert.ok(veil > 0 || destination.get(offset) > 0, 'Both views must never be fully lit together (at ' + offset + '%)');
  }
  assert.ok([...identity.values()].includes(0) && [...destination.values()].includes(0), 'Each view is fully lit in its own turn');
  assert.equal(identity.get(0), identity.get(100), 'The loop returns to its first pose');
  for (const name of ['lit-a', 'lit-b']) {
    for (const frame of keyframes.get(name)) {
      assert.doesNotMatch(frame.body, /translate|rotate/, 'Picture cards stay in their wells');
      assert.ok(Number(/scale\(([\d.]+)\)/.exec(frame.body)[1]) <= 1.02, 'Picture cards only breathe');
    }
  }
  const loop = rules.filter(rule => /animation\s*:\s*(?:flow-run|lit-[ab]|veil-[ab]|well-[ab]|words-[ab]|check-[ab]|divider-pulse)\b/.test(rule.body));
  assert.equal(loop.length, 12, 'The light, two cards, two veils, two wells, two sets of words, two checks and the divider');
  for (const rule of loop) assert.match(rule.body, /animation\s*:\s*[\w-]+ 10s linear infinite/, 'Every part of the hero loop shares one clock: ' + rule.selector);
  assert.equal(js.split('class="flow-light"').length - 1, 1, 'One connection, one point of light');
  assert.doesNotMatch(js + css, /animateMotion|offset-path/i);
  assert.ok(rules.some(rule => parts(rule).includes('.story-source-label') && /visibility\s*:\s*visible/.test(rule.body)),
    'The sentence above the picture stays visible because nothing covers it any more');
});

test('Motion never takes over scrolling', () => {
  assert.doesNotMatch(js, /['"](?:wheel|mousewheel|touchstart|touchmove)['"]/);
  assert.doesNotMatch(js, /scrollTo\s*\(|scrollBy\s*\(|scrollIntoView\s*\(|scrollTop\s*=/);
  assert.match(js, /addEventListener\('scroll', request, \{ passive: true \}\)/, 'Scroll is only listened to, passively, for the progress line');
  assert.equal(js.split('preventDefault()').length - 1, 1, 'Only the question toggle replaces a default action');
  assert.doesNotMatch(css, /scroll-snap|overscroll-behavior|position\s*:\s*(?:fixed|sticky)/);
});

test('Timed behaviour stops with the pause control, with reduced motion, and when the visitor takes over', () => {
  assert.match(js, /const motionOn = \(\) => body\.classList\.contains\('motion-enabled'\)/);
  assert.match(js, /if \(motionOn\(\) && canObserve\)/, 'Elements are only held back for a reveal while motion is on');
  assert.match(js, /const run = auto && inView && motionOn\(\)/, 'The walkthrough only advances while motion is on and the tabs are in view');
  assert.match(js, /t\.addEventListener\('pointerdown', stop\); t\.addEventListener\('keydown', stop\)/, 'A click or key press on a tab ends the walkthrough');
  assert.match(js, /if \(!motionOn\(\)\) return;\s+event\.preventDefault\(\)/, 'Questions use the browser toggle when motion is off');
  assert.match(js, /setTimeout\(arrive, 900\)/, 'The hero cannot stay hidden where frames are throttled');
  for (const id of ['tab-entry', 'tab-exit', 'architecture-panel']) assert.ok(html.includes('id="' + id + '"'), 'The walkthrough relies on #' + id);
});

test('The footprint shimmer follows the real lookup and never writes a value', () => {
  assert.match(js, /\/\^Checking\/\.test\(el\.textContent\.trim\(\)\)/, 'A value shimmers only while the page itself says it is checking');
  assert.match(js, /new MutationObserver\(\(\) => settle\(el\)\)\.observe\(el, \{ childList: true, characterData: true, subtree: true \}\)/);
  assert.equal(js.split('.textContent = ').length - 1, 1, 'Only a heading being split into lines is rewritten');
  assert.match(js, /heading\.textContent = ''/);
  for (const id of ['detail-ip', 'detail-provider', 'detail-location', 'detail-device', 'detail-browser', 'detail-os']) {
    assert.ok(js.includes("'" + id + "'") && html.includes('id="' + id + '"'), 'Footprint value must exist: ' + id);
  }
  const waiting = rules.find(rule => /\.scan-val\.is-wait/.test(rule.selector));
  assert.match(waiting.body, /color\s*:\s*transparent/);
  assert.doesNotMatch(waiting.body, /display\s*:\s*none|visibility\s*:\s*hidden|content\s*:/, 'The real text stays in the page for assistive technology');
});

test('The only words the motion layer adds are the two route labels', () => {
  const markup = [...js.matchAll(/'(<[^']*>)'/g)].map(match => match[1]).join(' ');
  assert.ok(markup.includes('class="flow-end flow-you"'), 'The injected markup must be found by this test');
  assert.equal(markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), 'You Web');
});
