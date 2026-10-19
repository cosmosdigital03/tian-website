'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const flush = () => new Promise(resolve => setImmediate(resolve));
const fixture = { success: true, ip: '198.51.100.42', city: 'Orlando', region: 'Florida',
  country: 'United States', connection: { isp: 'Charter Communications Inc', org: 'Charter', asn: 33363 } };
const ok = data => ({ ok: true, status: 200, json: async () => data, headers: { get: () => null } });

// A deliberately small DOM harness exercises requests, state, and text writes.
// It does not stand in for visual browser QA.
function page(options = {}) {
  const elements = new Map();
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const match of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const attributes = {};
    for (const attr of match[0].matchAll(/([\w-]+)="([^"]*)"/g)) attributes[attr[1]] = attr[2];
    const events = new Map();
    const element = {
      attributes, hidden: /\bhidden(?:\s|>)/.test(match[0]), disabled: false, textContent: '', focused: false,
      setAttribute(name, value) { attributes[name] = value; },
      getAttribute(name) { return attributes[name]; },
      addEventListener(name, fn) { events.set(name, fn); },
      focus() { this.focused = true; },
      click() { if (!this.disabled && !this.hidden) events.get('click')?.(); }
    };
    Object.defineProperty(element, 'innerHTML', { set() { throw new Error('Remote values must not become HTML'); } });
    elements.set(match[1], element);
  }
  const requests = [], windowEvents = new Map(), timers = new Map();
  let nextTimer = 1, browserReads = 0, modelReads = 0;
  const navigator = { platform: 'iPhone', language: 'en-US', maxTouchPoints: 5 };
  Object.defineProperty(navigator, 'userAgent', { get() {
    browserReads += 1;
    return options.ua || 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1';
  } });
  if (options.model) navigator.userAgentData = {
    brands: [], mobile: true, platform: 'Android',
    getHighEntropyValues(fields) { modelReads += 1; assert.deepEqual(Array.from(fields), ['model']); return options.model(); }
  };
  const document = { getElementById: id => elements.get(id) || null };
  Object.defineProperty(document, 'cookie', { get() { throw new Error('No cookies'); }, set() { throw new Error('No cookies'); } });
  const window = {
    screen: { width: 390, height: 844 },
    addEventListener: (name, fn) => windowEvents.set(name, fn),
    setTimeout(fn, delay) { const id = nextTimer++; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  for (const key of ['localStorage', 'sessionStorage', 'indexedDB']) {
    Object.defineProperty(window, key, { get() { throw new Error('No persistence'); } });
  }
  const sandbox = {
    window, document, navigator, URL, Intl, Date, console,
    AbortController: options.noAbort ? undefined : AbortController,
    fetch(url, config) {
      requests.push({ url, config });
      return options.fetch ? options.fetch(url, config) : Promise.resolve(ok(fixture));
    }
  };
  sandbox.globalThis = window;
  const context = vm.createContext(sandbox);
  for (const file of ['connection-device.js', 'connection-network.js', 'connection-details.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  return {
    elements, requests, timers,
    get: id => elements.get(id),
    click: id => elements.get(id).click(),
    event: name => windowEvents.get(name)?.(),
    reads: () => ({ browserReads, modelReads })
  };
}

test('Initial page load does not collect device details or contact the lookup provider', () => {
  const p = page({ model: () => Promise.resolve({ model: 'Pixel 9' }) });
  assert.deepEqual(p.reads(), { browserReads: 0, modelReads: 0 });
  assert.equal(p.requests.length, 0);
  assert.equal(p.get('connection-results').hidden, true);
  assert.equal(p.get('details-toggle').hidden, false);
});
test('Browser-only mode reads locally without a request, storage, or false network status', async () => {
  const p = page();
  p.click('details-local'); await flush();
  assert.equal(p.requests.length, 0);
  assert.equal(p.get('detail-device').textContent, 'iPhone');
  assert.equal(p.get('detail-os').textContent, 'iOS');
  assert.equal(p.get('detail-ip').textContent, 'Not requested');
  assert.equal(p.get('connection-results').hidden, false);
  assert.equal(p.get('connection-results').getAttribute('aria-busy'), 'false');
});
test('Full check sends one bounded credential-free request and displays real returned values', async () => {
  const p = page();
  p.click('details-toggle'); await flush();
  assert.equal(p.requests.length, 1);
  const { url, config } = p.requests[0];
  assert.equal(new URL(url).origin, 'https://ipwho.is');
  assert.equal(new URL(url).pathname, '/');
  assert.equal(config.credentials, 'omit');
  assert.equal(config.referrerPolicy, 'no-referrer');
  assert.equal(config.cache, 'no-store');
  assert.ok(!url.includes('iPhone') && !url.includes('en-US'));
  assert.equal(p.get('detail-ip').textContent, fixture.ip);
  assert.equal(p.get('detail-provider').textContent, 'Spectrum (Charter)');
  assert.equal(p.get('detail-device').textContent, 'iPhone');
  assert.match(p.get('details-network-status').textContent, /^Checked /);
  assert.equal(p.get('details-toggle').disabled, false);
  assert.equal(p.timers.size, 0);
});
test('Clear aborts pending lookup and late responses and hints cannot repopulate results', async () => {
  let resolveFetch, resolveModel;
  const p = page({
    fetch: () => new Promise(resolve => { resolveFetch = resolve; }),
    model: () => new Promise(resolve => { resolveModel = resolve; })
  });
  p.click('details-toggle');
  const signal = p.requests[0].config.signal;
  p.click('details-clear');
  assert.equal(signal.aborted, true);
  resolveFetch(ok(fixture)); resolveModel({ model: 'Pixel 9' }); await flush();
  assert.equal(p.get('connection-results').hidden, true);
  assert.equal(p.get('detail-ip').textContent, 'Not available');
  assert.equal(p.get('detail-device').textContent, 'Not available');
  assert.equal(p.get('details-toggle').focused, true);
  assert.equal(p.timers.size, 0);
});
test('A stale request cannot replace a later successful check', async () => {
  let resolveOld;
  const p = page({ fetch: () => p.requests.length === 1
    ? new Promise(resolve => { resolveOld = resolve; })
    : Promise.resolve(ok(Object.assign({}, fixture, { ip: '203.0.113.22' }))) });
  p.click('details-toggle'); p.click('details-clear'); p.click('details-toggle');
  await flush(); resolveOld(ok(fixture)); await flush();
  assert.equal(p.get('detail-ip').textContent, '203.0.113.22');
});
test('Network, API, JSON, and malformed-address failures preserve browser results', async () => {
  const failures = [
    () => Promise.reject(new TypeError('Failed to fetch')),
    () => Promise.resolve(ok({ success: false, message: 'Unavailable' })),
    () => Promise.resolve({ ok: false, status: 503 }),
    () => Promise.resolve({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } }),
    () => Promise.resolve(ok({ success: true, ip: '<script>alert(1)</script>' }))
  ];
  for (const fetch of failures) {
    const p = page({ fetch });
    p.click('details-toggle'); await flush();
    assert.equal(p.get('detail-ip').textContent, 'Temporarily unavailable');
    assert.equal(p.get('detail-device').textContent, 'iPhone');
    assert.equal(p.get('details-toggle').disabled, false);
    assert.match(p.get('details-status').textContent, /does not determine VPN/);
    assert.equal(p.requests.length, 1);
  }
});
test('Timeout aborts at eight seconds and leaves a usable browser-only result', async () => {
  const p = page({ fetch: (url, config) => new Promise((resolve, reject) => {
    config.signal.addEventListener('abort', () => reject(new Error('AbortError')));
  }) });
  p.click('details-toggle');
  const timer = Array.from(p.timers.values())[0];
  assert.equal(timer.delay, 8000); timer.fn(); await flush();
  assert.equal(p.requests[0].config.signal.aborted, true);
  assert.equal(p.get('detail-ip').textContent, 'Temporarily unavailable');
  assert.equal(p.get('detail-device').textContent, 'iPhone');
  assert.equal(p.get('details-toggle').disabled, false);
});
test('HTTP 429 respects Retry-After and never retries through another provider', async () => {
  const p = page({ fetch: async () => ({ ok: false, status: 429, headers: { get: () => '3600' } }) });
  p.click('details-toggle'); await flush();
  p.click('details-toggle'); await flush();
  assert.equal(p.requests.length, 1);
  assert.match(p.get('details-network-status').textContent, /limit/);
  assert.equal(p.get('detail-device').textContent, 'iPhone');
});
test('Offline clears a previous IP while page exit clears the whole result', async () => {
  const p = page();
  p.click('details-toggle'); await flush();
  p.event('offline');
  assert.equal(p.get('detail-ip').textContent, 'Offline');
  assert.equal(p.get('detail-device').textContent, 'iPhone');
  p.event('pagehide');
  assert.equal(p.get('connection-results').hidden, true);
  assert.equal(p.get('detail-device').textContent, 'Not available');
  assert.equal(p.get('details-toggle').getAttribute('aria-expanded'), 'false');
});
test('Unavailable AbortController and refused model hints fail gracefully', async () => {
  const p = page({ noAbort: true, model: () => Promise.reject(new Error('Hints denied')) });
  p.click('details-toggle'); await flush();
  assert.equal(p.requests.length, 0);
  assert.equal(p.get('detail-ip').textContent, 'Temporarily unavailable');
  assert.equal(p.get('details-toggle').disabled, false);
  assert.notEqual(p.get('detail-device').textContent, 'Not available');
});
test('Model hints can improve a device label locally without changing the network request', async () => {
  const p = page({ model: () => Promise.resolve({ model: 'SM-S928U' }) });
  p.click('details-local'); await flush();
  assert.equal(p.get('detail-device').textContent, 'Samsung · SM-S928U');
  assert.equal(p.requests.length, 0);
  assert.equal(p.reads().modelReads, 1);
});
