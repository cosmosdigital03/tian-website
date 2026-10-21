'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'premium.css'), 'utf8');

// These are source-contract checks, not a browser layout/animation engine.
// home-ui.test.cjs exercises the real motion controller and automatic-connection
// behavior; responsive appearance and intermediate frames also need browser QA.
const decode = text => text.replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
function elements(input) {
  const document = { tag: '#document', attrs: {}, children: [] };
  const stack = [document];
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  for (const match of input.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^>]*>|[^<]+/g)) {
    const token = match[0];
    if (token.startsWith('<!')) continue;
    if (token.startsWith('</')) {
      const tag = /^<\/([\w-]+)/.exec(token)[1].toLowerCase();
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].tag === tag) { stack.length = i; break; }
      }
    } else if (token.startsWith('<')) {
      const tag = /^<([\w-]+)/.exec(token)[1].toLowerCase();
      const attrs = {};
      const attributeText = token.slice(tag.length + 1, token.endsWith('/>') ? -2 : -1);
      for (const attr of attributeText.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
        attrs[attr[1]] = decode(attr[2] ?? attr[3] ?? attr[4] ?? '');
      }
      const element = { tag, attrs, children: [], parent: stack.at(-1) };
      stack.at(-1).children.push(element);
      if (!voidTags.has(tag) && !token.endsWith('/>')) stack.push(element);
    } else stack.at(-1).children.push(decode(token));
  }
  return document;
}
function findAll(node, predicate) {
  return node.children.flatMap(child => typeof child === 'string' ? [] :
    [...(predicate(child) ? [child] : []), ...findAll(child, predicate)]);
}
const document = elements(html);
const hasClass = (node, name) => (node.attrs.class || '').split(/\s+/).includes(name);
const byClass = (node, name) => findAll(node, child => hasClass(child, name));
const text = node => node.children.map(child => typeof child === 'string' ? child : text(child)).join(' ').replace(/\s+/g, ' ').trim();
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selector, declarations]) => ({ selector: selector.trim(), declarations }));
const variables = new Map([...css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)].map(([, name, value]) => [name, value]));
const resolveVariables = value => value.replace(/var\((--[\w-]+)\)/g, (_, name) => variables.get(name) || '');
function fontFor(selector) {
  return rules.filter(rule => rule.selector.split(',').map(value => value.trim()).includes(selector))
    .flatMap(rule => [...rule.declarations.matchAll(/(?:^|;)\s*font(?:-family)?\s*:\s*([^;}]+)/g)].map(match => resolveVariables(match[1])));
}
function declarations(selector) {
  const rule = rules.find(item => item.selector === selector);
  assert.ok(rule, 'Missing CSS rule: ' + selector);
  return Object.fromEntries([...rule.declarations.matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g)]
    .map(([, name, value]) => [name, value.trim()]));
}
function measure(value, unit) {
  assert.match(value || '', new RegExp('^-?(?:\\d+(?:\\.\\d*)?|\\.\\d+)' + unit + '$'), 'Expected a ' + unit + ' measurement, got ' + value);
  return parseFloat(value);
}
function keyframes(name) {
  const start = css.indexOf('@keyframes ' + name + '{');
  assert.ok(start >= 0, 'Missing animation: ' + name);
  const open = css.indexOf('{', start);
  let depth = 1, end = open + 1;
  while (depth && end < css.length) {
    if (css[end] === '{') depth += 1;
    if (css[end] === '}') depth -= 1;
    end += 1;
  }
  assert.equal(depth, 0, 'Animation must have a complete CSS block');
  return [...css.slice(open + 1, end - 1).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .flatMap(([, stops, body]) => stops.split(',').map(stop => ({ offset: parseFloat(stop), body })));
}

test('The hero names information views, not a traffic-routing or reassembly diagram', () => {
  const hero = byClass(document, 'hero-visual')[0];
  assert.ok(hero, 'A hero illustration must be present');
  const art = byClass(hero, 'information-story')[0];
  assert.ok(art && art.tag === 'figure', 'The complete story must remain a named native figure');
  const accessibleParts = (art.attrs['aria-labelledby'] || '').split(/\s+/).map(id =>
    findAll(document, child => child.attrs.id === id)[0]);
  assert.ok(accessibleParts.every(node => node && text(node)), 'Every figure label must resolve to readable text');
  assert.ok(accessibleParts.some(node => node.tag === 'figcaption' && /information views/i.test(text(node))));
  const descriptions = (art.attrs['aria-describedby'] || '').split(/\s+/).map(id =>
    findAll(document, child => child.attrs.id === id)[0]);
  assert.ok(descriptions.every(node => node && text(node)), 'Every figure description must resolve to readable text');
  assert.ok(descriptions.some(node => /separate points of view/i.test(text(node))));
  assert.ok(descriptions.some(node => /Relay information views, not traffic paths/i.test(text(node))));
  const visibleCopy = findAll(hero, node => ['p', 'span'].includes(node.tag)).filter(node => {
    for (let parent = node.parent; parent && parent !== hero; parent = parent.parent) {
      if (parent.tag === 'svg') return false;
    }
    return true;
  }).map(text).join(' ');
  assert.match(visibleCopy, /Relay information views, not traffic paths/i,
    'The key qualification must be visible outside decorative artwork');
  assert.match(visibleCopy, /No data is split or reassembled/i);
  assert.doesNotMatch(text(hero), /(?:guaranteed|complete|total) anonymity|untraceable|impossible to (?:track|identify)/i);
});

test('Two labeled picture halves remain distinct from the Entry and Exit knowledge wells', () => {
  const story = byClass(document, 'information-story')[0];
  assert.equal(byClass(story, 'information-piece').length, 2);
  assert.equal(byClass(story, 'knowledge-well').length, 2);
  assert.equal(byClass(story, 'service-frame').length, 1);
  assert.equal(byClass(story, 'story-divider').length, 1, 'A settled service frame must keep a visible knowledge boundary');
  for (const [pieceName, label] of [['identity-piece', /IDENTITY.*Your IP/], ['destination-piece', /DESTINATION.*Destination/]]) {
    const pieces = byClass(story, pieceName);
    assert.equal(pieces.length, 1);
    assert.match(text(pieces[0]), label);
    assert.equal(findAll(pieces[0], child => child.tag === 'svg').length, 1, 'Each information card retains its own picture half');
    assert.equal(byClass(pieces[0], 'piece-picture')[0].attrs['aria-hidden'], 'true', 'Decorative picture halves must not duplicate the text labels');
  }
  assert.match(text(byClass(story, 'well-entry')[0]), /ENTRY VIEW.*connecting IP.*Destination encrypted.*through this relay/i);
  assert.match(text(byClass(story, 'well-exit')[0]), /EXIT VIEW.*destination.*through Entry/i);
  for (const node of [...byClass(story, 'information-piece'), ...byClass(story, 'knowledge-well')]) {
    for (let ancestor = node; ancestor; ancestor = ancestor.parent) {
      assert.equal(Object.hasOwn(ancestor.attrs, 'hidden'), false);
      assert.notEqual(ancestor.attrs['aria-hidden'], 'true', 'Information labels remain available without motion or JavaScript');
    }
  }
});

test('The resting layout keeps each piece inside its own well within one service frame', () => {
  const piece = declarations('.information-piece');
  const well = declarations('.knowledge-well');
  const width = measure(piece.width, '%');
  const wellWidth = measure(well.width, '%');
  const left = measure(declarations('.identity-piece').left, '%');
  const right = 100 - measure(declarations('.destination-piece').right, '%') - width;
  const entry = measure(declarations('.well-entry').left, '%');
  const exit = 100 - measure(declarations('.well-exit').right, '%') - wellWidth;
  assert.ok(left >= entry && left + width <= entry + wellWidth, 'Identity remains in Entry');
  assert.ok(right >= exit && right + width <= exit + wellWidth, 'Destination remains in Exit');
  assert.ok(entry + wellWidth < exit && left + width < right, 'Wells and pieces have a positive settled gap');
  const top = measure(piece.top, 'px');
  const wellTop = measure(well.top, 'px');
  assert.ok(top >= wellTop && top + measure(piece.height, 'px') <= wellTop + measure(well.height, 'px'));
  const frame = declarations('.service-frame');
  assert.match(frame.inset, /^\d+px 0 0$/);
  assert.ok(parseFloat(frame.inset) <= wellTop);
  for (const rule of rules.filter(item => item.selector === '.information-stage')) {
    const height = /height\s*:\s*([\d.]+)px/.exec(rule.declarations);
    if (height) assert.ok(Number(height[1]) >= wellTop + measure(well.height, 'px'), 'Every responsive stage must contain both settled wells');
  }
});

test('The paired animations separate information views together and never cross the center boundary', () => {
  const width = measure(declarations('.information-piece').width, '%');
  const left = measure(declarations('.identity-piece').left, '%');
  const right = 100 - measure(declarations('.destination-piece').right, '%') - width;
  const identity = keyframes('identity-view');
  const destination = keyframes('destination-view');
  assert.deepEqual(identity.map(frame => frame.offset), destination.map(frame => frame.offset));
  const transforms = frames => frames.map(frame => {
    const value = /transform\s*:\s*translate\(\s*(-?[\d.]+)(%?)\s*,\s*(-?[\d.]+)(px)?\s*\)/.exec(frame.body);
    assert.ok(value, 'Each information stop must be an explicit two-axis translation');
    assert.ok(value[2] === '%' || Number(value[1]) === 0);
    assert.ok(value[4] === 'px' || Number(value[3]) === 0);
    return { offset: frame.offset, x: Number(value[1]), y: Number(value[3]) };
  });
  const first = transforms(identity), second = transforms(destination);
  first.forEach((frame, index) => {
    const other = second[index];
    assert.equal(frame.x, -other.x || 0);
    assert.equal(frame.y, other.y);
    assert.ok(frame.x >= 0 && other.x <= 0);
    assert.ok(left + width + frame.x * width / 100 <= right + other.x * width / 100 + 0.001,
      'The two information cards must never overlap or merge at any animation stop');
  });
  assert.ok(first.some(frame => frame.offset === 0 && frame.x > 0 && frame.y < 0), 'The sequence begins with adjacent picture halves above the wells');
  assert.ok(first.filter(frame => frame.x === 0 && frame.y === 0).length >= 2, 'The separated resting state must be held, not flashed');
  assert.deepEqual(first.find(frame => frame.offset === 0), { ...first.find(frame => frame.offset === 100), offset: 0 }, 'The loop must return continuously to its first pose');
  const identityMotion = declarations('.motion-enabled .identity-piece').animation;
  const destinationMotion = declarations('.motion-enabled .destination-piece').animation;
  assert.equal(identityMotion.replace('identity-view', ''), destinationMotion.replace('destination-view', ''), 'Both information views share timing and easing');
  assert.match(identityMotion, /infinite/);
  for (const frame of keyframes('service-frame')) assert.doesNotMatch(frame.body, /\btransform\s*:/, 'The enclosing service frame must not move the views back together');
});

test('Pausing or reducing motion leaves the separated story readable', () => {
  for (const selector of ['.information-piece', '.knowledge-well', '.service-frame', '.story-divider']) {
    const base = declarations(selector);
    assert.equal(base.animation, undefined, 'New motion must remain opt-in: ' + selector);
    assert.notEqual(base.display, 'none');
    assert.notEqual(base.visibility, 'hidden');
    assert.notEqual(base.opacity, '0');
  }
  assert.match(css, /\.motion-paused\s+\*\s*\{[^}]*animation-play-state\s*:\s*paused\s*!important/);
  const reduced = css.slice(css.lastIndexOf('@media(prefers-reduced-motion:reduce)'));
  assert.match(reduced, /\.information-piece\s*\{[^}]*transform\s*:\s*none/);
  assert.match(reduced, /\.story-source-label\s*\{[^}]*visibility\s*:\s*hidden/);
  const motionButton = byClass(document, 'motion-toggle');
  assert.equal(motionButton.length, 1);
  assert.equal(motionButton[0].tag, 'button');
  assert.equal(motionButton[0].attrs.type, 'button');
  assert.equal(motionButton[0].attrs['aria-pressed'], 'false');
  assert.match(text(motionButton[0]), /Pause motion/);
});

test('The architecture section distinguishes relay knowledge from the actual serial transport', () => {
  const comparison = byClass(document, 'knowledge-comparison')[0];
  assert.ok(comparison);
  const cards = byClass(comparison, 'knowledge-card');
  assert.equal(cards.length, 2);
  assert.match(text(cards[0]), /ENTRY.*Connecting IP.*Handled here.*Destination.*encrypted inner connection/i);
  assert.match(text(cards[1]), /EXIT.*Destination connections.*Handled here.*through Entry, not directly from your device IP/i);
  const transport = byClass(document, 'transport-caption')[0];
  assert.match(text(transport), /device connects to Exit through Entry/i);
  assert.match(text(transport), /inner connection stays encrypted/i);
  assert.match(text(transport), /not your traffic into parallel paths/i);
  assert.equal(byClass(document, 'route-map').length, 0);
  const boundary = text(byClass(document, 'architecture-boundary')[0]);
  assert.match(boundary, /not a promise of anonymity/i);
  assert.match(boundary, /Both relays are operated by TIAN/i);
  assert.match(boundary, /traffic analysis can still correlate activity/i);
});

test('The hero no longer depicts serial shields or animated payload routing', () => {
  const hero = byClass(document, 'hero-visual')[0];
  for (const name of ['gate-entry', 'gate-exit', 'art-packet']) {
    assert.equal(byClass(hero, name).length, 0, 'Old traffic illustration class must not remain: ' + name);
  }
  assert.equal(findAll(hero, node => node.tag === 'animatemotion').length, 0,
    'Moving information cards must not become a payload following a traffic path');
});

test('Retro headings use local system serifs while readable body text stays sans-serif', () => {
  for (const [name, selectors] of [
    ['hero', ['h1', '.hero h1']],
    ['section headings', ['h2', '.section-heading h2', '.details-heading h2']],
    ['architecture panel', ['h3', '.architecture-panel h3']]
  ]) {
    const fonts = selectors.flatMap(fontFor);
    assert.ok(fonts.some(font => /Georgia|Iowan|Palatino/i.test(font) && /(?:^|,)\s*serif\s*$/i.test(font)), name + ' must retain the local editorial serif stack');
  }
  assert.ok(fontFor('body').some(font => /sans-serif\s*$/i.test(font)), 'Body copy must remain a system sans-serif');
});

test('The latest narrow-screen hero rule restores one column after the desktop redesign', () => {
  const mobileHeroRules = [];
  for (const match of css.matchAll(/@media\s*\(\s*max-width\s*:\s*640px\s*\)\s*\{/g)) {
    const open = match.index + match[0].length - 1;
    let depth = 1, end = open + 1;
    while (depth && end < css.length) {
      if (css[end] === '{') depth += 1;
      if (css[end] === '}') depth -= 1;
      end += 1;
    }
    assert.equal(depth, 0, 'Narrow-screen media query must be a complete block');
    for (const [, selector, body] of css.slice(open + 1, end - 1).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (selector.split(',').some(value => value.trim() === '.hero')) mobileHeroRules.push(body);
    }
  }
  assert.ok(mobileHeroRules.length, 'A narrow-screen hero layout must exist');
  const latest = mobileHeroRules.at(-1);
  const columns = [...latest.matchAll(/(?:^|;)\s*grid-template-columns\s*:\s*([^;]+)/g)].at(-1)?.[1].trim();
  assert.equal(columns, '1fr', 'The last narrow-screen hero rule must explicitly reset the later desktop two-column layout; an earlier mobile rule is insufficient');
});

test('The revised artwork and typography introduce no remote fonts or presentation vendors', () => {
  assert.doesNotMatch(css, /@(?:import|font-face)\b/i);
  for (const node of findAll(document, () => true)) {
    const resource = node.attrs.src ||
      ((node.tag === 'link' && /^(?:stylesheet|preload|preconnect|dns-prefetch)$/.test(node.attrs.rel || '')) || node.tag === 'image' || node.tag === 'use'
        ? node.attrs.href || node.attrs['xlink:href'] : null);
    if (resource) assert.doesNotMatch(resource, /^(?:https?:)?\/\//i, 'Presentation asset must stay local: ' + resource);
  }
  for (const [, resource] of css.matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/g)) {
    assert.doesNotMatch(resource, /^(?:https?:)?\/\//i, 'CSS asset must stay local: ' + resource);
  }
});
