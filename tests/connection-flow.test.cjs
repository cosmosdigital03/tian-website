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
const tianFixture = { ...fixture, ip: '159.203.181.31',
  connection: { isp: 'DigitalOcean, LLC', org: 'DigitalOcean, LLC', asn: 14061 } };
const vpnFixture = { ...fixture, ip: '203.0.113.62',
  connection: { isp: 'Mullvad VPN', org: 'Mullvad VPN', asn: 39351 } };
const cloudFixture = { ...fixture, ip: '203.0.113.63',
  connection: { isp: 'Amazon.com, Inc.', org: 'Amazon.com, Inc.', asn: 16509 } };
// An address in the checked-in official Apple snapshot, with its partner owner.
const appleFixture = { ...fixture, ip: '104.28.28.1',
  connection: { isp: 'Cloudflare, Inc.', org: 'Cloudflare, Inc.', asn: 13335 } };
const ok = data => ({ ok: true, status: 200, json: async () => data, headers: { get: () => null } });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise; reject = rejectPromise;
  });
  return { promise, resolve, reject };
};
const privacyValueIds = ['detail-privacy-label', 'detail-privacy-summary', 'detail-route',
  'detail-route-note', 'detail-network-type', 'detail-evidence'];

// This small VM DOM exercises real modules and observable interaction behavior.
// It performs no external requests and does not substitute for visual browser QA.
function page(options = {}) {
  const elements = new Map();
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const plainText = value => value.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  for (const match of html.matchAll(/<([a-z][\w-]*)\b[^>]*\bid="([^"]+)"[^>]*>/gi)) {
    const attributes = {};
    for (const attr of match[0].matchAll(/([\w-]+)="([^"]*)"/g)) attributes[attr[1]] = attr[2];
    const events = new Map();
    const textStart = match.index + match[0].length;
    const textEnd = html.indexOf('</' + match[1] + '>', textStart);
    const element = {
      attributes, hidden: /\bhidden(?:\s|>)/.test(match[0]), disabled: /\bdisabled(?:\s|>)/.test(match[0]),
      textContent: textEnd < 0 ? '' : plainText(html.slice(textStart, textEnd)), focused: false,
      setAttribute(name, value) { attributes[name] = String(value); },
      getAttribute(name) { return attributes[name] ?? null; },
      removeAttribute(name) { delete attributes[name]; },
      addEventListener(name, fn) {
        if (!events.has(name)) events.set(name, []);
        events.get(name).push(fn);
      },
      focus() { this.focused = true; },
      click() { if (!this.disabled && !this.hidden) for (const fn of events.get('click') || []) fn({ type: 'click' }); }
    };
    element.dataset = new Proxy({}, {
      get(_, key) { return attributes['data-' + String(key).replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())]; },
      set(_, key, value) {
        attributes['data-' + String(key).replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())] = String(value);
        return true;
      }
    });
    Object.defineProperty(element, 'innerHTML', { set() { throw new Error('Remote values must not become HTML'); } });
    elements.set(match[2], element);
  }
  const requests = [], windowEvents = new Map(), documentEvents = new Map(), connectionEvents = new Map(), timers = new Map();
  const sideEffects = { persistence: 0, cookies: 0, intervals: 0, beacon: 0 };
  let nextTimer = 1, browserReads = 0, modelReads = 0;
  let now = Date.parse('2026-10-19T20:00:00Z');
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const navigator = { platform: options.platform || 'iPhone', language: 'en-US', maxTouchPoints: 5,
    onLine: options.online !== false,
    sendBeacon() { sideEffects.beacon += 1; throw new Error('No analytics beacons'); }
  };
  Object.defineProperty(navigator, 'userAgent', { get() {
    browserReads += 1;
    return options.ua || 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1';
  } });
  if (options.model) navigator.userAgentData = {
    brands: [], mobile: true, platform: 'Android',
    getHighEntropyValues(fields) {
      modelReads += 1;
      assert.deepEqual(Array.from(fields), ['model']);
      return options.model(modelReads);
    }
  };
  if (options.connection) navigator.connection = {
    addEventListener(name, fn) {
      if (!connectionEvents.has(name)) connectionEvents.set(name, []);
      connectionEvents.get(name).push(fn);
    }
  };
  const location = new URL(options.url || 'https://tianvpn.com/');
  const document = {
    getElementById: id => elements.get(id) || null, location,
    visibilityState: options.visibility || 'visible',
    addEventListener(name, fn) {
      if (!documentEvents.has(name)) documentEvents.set(name, []);
      documentEvents.get(name).push(fn);
    }
  };
  Object.defineProperty(document, 'cookie', {
    get() { sideEffects.cookies += 1; throw new Error('No cookies'); },
    set() { sideEffects.cookies += 1; throw new Error('No cookies'); }
  });
  const window = {
    screen: { width: 390, height: 844 }, location, isSecureContext: location.protocol === 'https:',
    addEventListener(name, fn) {
      if (!windowEvents.has(name)) windowEvents.set(name, []);
      windowEvents.get(name).push(fn);
    },
    setTimeout(fn, delay) { const id = nextTimer++; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval() { sideEffects.intervals += 1; throw new Error('No background polling'); }
  };
  const sandbox = {
    window, document, navigator, URL, Intl, Date: ClockDate, console, location,
    isSecureContext: window.isSecureContext,
    AbortController: options.noAbort ? undefined : AbortController,
    fetch(url, config) {
      requests.push({ url, config });
      return options.fetch ? options.fetch(url, config, requests.length) : Promise.resolve(ok(fixture));
    },
    setTimeout: window.setTimeout, clearTimeout: window.clearTimeout, setInterval: window.setInterval
  };
  for (const key of ['localStorage', 'sessionStorage', 'indexedDB']) {
    for (const target of [window, sandbox]) Object.defineProperty(target, key, {
      get() { sideEffects.persistence += 1; throw new Error('No persistence'); }
    });
  }
  Object.assign(window, { fetch: sandbox.fetch, AbortController: sandbox.AbortController });
  sandbox.globalThis = window;
  const context = vm.createContext(sandbox);
  for (const file of ['connection-device.js', 'connection-network.js', 'connection-relays.js',
    'connection-privacy.js', 'connection-details.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  return {
    elements, requests, timers, sideEffects,
    get: id => elements.get(id),
    event(name, event = {}) {
      if (name === 'offline') navigator.onLine = false;
      if (name === 'online') navigator.onLine = true;
      for (const fn of windowEvents.get(name) || []) fn({ type: name, ...event });
    },
    visibility(state) {
      document.visibilityState = state;
      for (const fn of documentEvents.get('visibilitychange') || []) fn({ type: 'visibilitychange' });
    },
    networkChange() {
      for (const fn of connectionEvents.get('change') || []) fn({ type: 'change' });
    },
    advance(ms) { now += ms; },
    fireTimer(id) { const timer = timers.get(id); timers.delete(id); timer.fn(); },
    reads: () => ({ browserReads, modelReads })
  };
}

function privacySnapshot(p) {
  return privacyValueIds.map(id => p.get(id).textContent);
}
function assertNoTracking(p) {
  assert.deepEqual(p.sideEffects, { persistence: 0, cookies: 0, intervals: 0, beacon: 0 });
  for (const { url, config } of p.requests) {
    const target = new URL(url);
    assert.equal(target.origin, 'https://ipwho.is');
    assert.equal(target.pathname, '/');
    assert.deepEqual(Array.from(target.searchParams.keys()), ['fields']);
    assert.ok(!url.includes('iPhone') && !url.includes('en-US') && !url.includes('SM-S928U'));
    assert.equal(config.credentials, 'omit');
    assert.equal(config.referrerPolicy, 'no-referrer');
    assert.equal(config.cache, 'no-store');
    assert.equal(config.body, undefined);
    assert.equal(config.method || 'GET', 'GET');
  }
}
function assertNoPositiveRoute(p) {
  assert.notEqual(p.get('details-privacy').getAttribute('data-tone'), 'positive');
  assert.doesNotMatch(p.get('detail-privacy-label').textContent, /(?:^|\s)protected(?:\s|$)|TIAN route detected/i);
}

test('Startup needs no reveal, refresh, or clear controls and makes exactly one bounded automatic lookup', async () => {
  const pending = deferred();
  const p = page({ fetch: () => pending.promise });
  assert.equal(p.get('details-toggle'), undefined);
  assert.equal(p.get('details-clear'), undefined);
  assert.equal(p.get('details-local'), undefined);
  assert.equal(p.get('detail-device').textContent, 'iPhone');
  assert.equal(p.get('detail-os').textContent, 'iOS');
  assert.equal(p.get('connection-results').hidden, false);
  assert.equal(p.get('connection-results').getAttribute('aria-busy'), 'true');
  assert.equal(p.requests.length, 1);
  assertNoPositiveRoute(p);
  p.event('pageshow', { persisted: false }); p.event('online');
  p.event('pageshow', { persisted: true });
  assert.equal(p.requests.length, 1, 'Lifecycle events must not duplicate an active lookup');
  pending.resolve(ok(fixture)); await flush();
  assert.equal(p.get('detail-ip').textContent, fixture.ip);
  assert.equal(p.get('detail-provider').textContent, 'Spectrum (Charter)');
  assert.match(p.get('details-network-status').textContent, /^Checked /);
  assert.equal(p.get('connection-results').getAttribute('aria-busy'), 'false');
  assert.equal(p.timers.size, 0);
  assertNoTracking(p);
});

test('Reconnect supersedes pending network and model responses without restoring stale values', async () => {
  const oldFetch = deferred(), oldModel = deferred();
  const p = page({
    fetch: (_, __, number) => number === 1 ? oldFetch.promise : Promise.resolve(ok(vpnFixture)),
    model: number => number === 1 ? oldModel.promise : Promise.resolve({ model: 'SM-S928U' })
  });
  p.event('offline');
  assert.equal(p.requests[0].config.signal.aborted, true);
  assert.equal(p.get('connection-results').hidden, false);
  assert.equal(p.get('detail-ip').textContent, 'Offline');
  assert.equal(p.get('detail-device').textContent, 'Android phone (estimated)');
  assertNoPositiveRoute(p);
  assert.equal(p.timers.size, 0);
  p.event('online'); p.event('online'); await flush();
  assert.equal(p.requests.length, 2);
  assert.equal(p.get('detail-ip').textContent, vpnFixture.ip);
  assert.equal(p.get('detail-device').textContent, 'Samsung · SM-S928U');
  const currentPrivacy = privacySnapshot(p);
  oldFetch.resolve(ok(tianFixture)); oldModel.resolve({ model: 'Pixel 9' }); await flush();
  assert.equal(p.get('detail-ip').textContent, vpnFixture.ip);
  assert.equal(p.get('detail-device').textContent, 'Samsung · SM-S928U');
  assert.deepEqual(privacySnapshot(p), currentPrivacy);
  assertNoTracking(p);
});

test('Pagehide clears transient data and aborts; back/forward restoration automatically refreshes once', async () => {
  const oldFetch = deferred(), oldModel = deferred();
  const p = page({
    fetch: (_, __, number) => number === 1 ? oldFetch.promise : Promise.resolve(ok(fixture)),
    model: number => number === 1 ? oldModel.promise : Promise.resolve({ model: 'SM-S928U' })
  });
  p.event('pagehide', { persisted: true });
  assert.equal(p.requests[0].config.signal.aborted, true);
  assert.equal(p.get('detail-device').textContent, 'Not available');
  assert.equal(p.get('detail-ip').textContent, 'Not available');
  assert.equal(p.get('connection-results').getAttribute('aria-busy'), 'false');
  assert.equal(p.timers.size, 0);
  assertNoPositiveRoute(p);
  p.event('offline'); p.event('online');
  oldFetch.resolve(ok(tianFixture)); oldModel.resolve({ model: 'Pixel 9' }); await flush();
  assert.equal(p.requests.length, 1, 'A suspended page must never start another lookup');
  assert.equal(p.get('detail-ip').textContent, 'Not available');
  assert.equal(p.get('detail-device').textContent, 'Not available');
  assertNoPositiveRoute(p);
  p.event('pageshow', { persisted: true }); p.event('pageshow', { persisted: true }); await flush();
  assert.equal(p.requests.length, 2);
  assert.equal(p.get('connection-results').hidden, false);
  assert.equal(p.get('detail-ip').textContent, fixture.ip);
  assert.equal(p.get('detail-device').textContent, 'Samsung · SM-S928U');
  assertNoTracking(p);
});

test('A delayed response body cannot replace a newer restored-page snapshot', async () => {
  const oldBody = deferred();
  const p = page({ fetch: async (_, __, number) => number === 1
    ? { ...ok(tianFixture), json: () => oldBody.promise } : ok(vpnFixture) });
  await flush();
  p.event('pagehide', { persisted: true }); p.event('pageshow', { persisted: true });
  await flush();
  assert.equal(p.get('detail-ip').textContent, vpnFixture.ip);
  const currentPrivacy = privacySnapshot(p);
  oldBody.resolve(tianFixture); await flush();
  assert.equal(p.get('detail-ip').textContent, vpnFixture.ip);
  assert.deepEqual(privacySnapshot(p), currentPrivacy);
  assert.equal(p.get('connection-results').getAttribute('aria-busy'), 'false');
  assert.equal(p.timers.size, 0);
});

test('Offline removes a previous privacy verdict and reconnect refreshes the visible check once', async () => {
  const reconnect = deferred();
  const p = page({ fetch: (_, __, number) => number === 1 ? Promise.resolve(ok(vpnFixture)) : reconnect.promise });
  await flush();
  assert.equal(p.get('details-privacy').getAttribute('data-tone'), 'positive');
  const previousPrivacy = privacySnapshot(p);
  p.event('offline'); p.event('offline');
  assert.equal(p.get('detail-ip').textContent, 'Offline');
  assert.equal(p.get('detail-device').textContent, 'iPhone');
  assert.equal(p.get('connection-results').hidden, false);
  assertNoPositiveRoute(p);
  assert.notDeepEqual(privacySnapshot(p), previousPrivacy);
  assert.equal(p.requests.length, 1, 'Offline transitions must stay local');
  p.event('online'); p.event('online');
  assert.equal(p.requests.length, 2, 'Repeated online events must not race or repeat the reconnect request');
  assert.equal(p.get('detail-ip').textContent, 'Checking…');
  assert.equal(p.get('connection-results').getAttribute('aria-busy'), 'true');
  assertNoPositiveRoute(p);
  reconnect.resolve(ok(fixture)); await flush();
  assert.equal(p.get('detail-ip').textContent, fixture.ip);
  assertNoPositiveRoute(p);
});

test('An initially offline browser exposes local values without fetching and waits for reconnect', async () => {
  const p = page({ online: false });
  assert.equal(p.requests.length, 0);
  assert.equal(p.get('connection-results').hidden, false);
  assert.equal(p.get('detail-device').textContent, 'iPhone');
  assert.equal(p.get('detail-ip').textContent, 'Offline');
  assert.equal(p.get('connection-results').getAttribute('aria-busy'), 'false');
  assertNoPositiveRoute(p);
  p.event('pageshow', { persisted: false }); p.event('offline');
  assert.equal(p.requests.length, 0);
  p.event('online'); await flush();
  assert.equal(p.requests.length, 1);
  assert.equal(p.get('detail-ip').textContent, fixture.ip);
  p.event('pagehide', { persisted: true }); p.event('offline');
  p.event('pageshow', { persisted: true }); await flush();
  assert.equal(p.requests.length, 1, 'An offline restoration must not start a network request');
  assert.equal(p.get('connection-results').hidden, false);
  assert.equal(p.get('detail-ip').textContent, 'Offline');
  p.event('online'); await flush();
  assert.equal(p.requests.length, 2);
  assert.equal(p.get('detail-ip').textContent, fixture.ip);
});

test('An automatic restoration removes the previous verdict before any lookup failure can display it', async () => {
  const failures = [
    () => Promise.reject(new TypeError('Failed to fetch')),
    () => Promise.resolve(ok({ success: false, message: 'Unavailable' })),
    () => Promise.resolve({ ok: false, status: 503 }),
    () => Promise.resolve({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } }),
    () => Promise.resolve(ok({ success: true, ip: '<script>alert(1)</script>' }))
  ];
  for (const fail of failures) {
    const p = page({ fetch: (url, config, number) => number === 1 ? Promise.resolve(ok(vpnFixture)) : fail(url, config) });
    await flush();
    assert.equal(p.get('details-privacy').getAttribute('data-tone'), 'positive');
    const oldVerdict = privacySnapshot(p);
    p.event('pagehide', { persisted: true }); p.event('pageshow', { persisted: true });
    assertNoPositiveRoute(p);
    await flush();
    assert.equal(p.get('detail-ip').textContent, 'Temporarily unavailable');
    assert.equal(p.get('detail-device').textContent, 'iPhone');
    assert.equal(p.get('connection-results').getAttribute('aria-busy'), 'false');
    assertNoPositiveRoute(p);
    assert.notDeepEqual(privacySnapshot(p), oldVerdict);
    assert.equal(p.requests.length, 2);
    assert.equal(p.timers.size, 0, 'Failures must not schedule retries');
    p.event('online'); p.event('pageshow', { persisted: false }); await flush();
    assert.equal(p.requests.length, 2, 'Unrelated lifecycle events must not retry a failed lookup');
    assertNoTracking(p);
  }
});

test('The eight-second timeout aborts and leaves browser details available without retrying', async () => {
  const p = page({ fetch: (_, config) => new Promise((resolve, reject) => {
    config.signal.addEventListener('abort', () => reject(new Error('AbortError')));
  }) });
  const [id, timer] = Array.from(p.timers.entries())[0];
  assert.equal(timer.delay, 8000);
  p.fireTimer(id); await flush();
  assert.equal(p.requests[0].config.signal.aborted, true);
  assert.equal(p.get('detail-ip').textContent, 'Temporarily unavailable');
  assert.equal(p.get('detail-device').textContent, 'iPhone');
  assert.equal(p.get('connection-results').getAttribute('aria-busy'), 'false');
  assertNoPositiveRoute(p);
  assert.equal(p.requests.length, 1);
  assert.equal(p.timers.size, 0);
});

test('HTTP 429 honors Retry-After and waits for a later lifecycle transition after cooldown', async () => {
  const p = page({ fetch: async (_, __, number) => number === 1
    ? { ok: false, status: 429, headers: { get: () => '3600' } } : ok(fixture) });
  await flush(); p.event('offline'); p.event('online'); await flush();
  assert.equal(p.requests.length, 1);
  assert.match(p.get('details-network-status').textContent, /limit/i);
  assert.equal(p.get('detail-device').textContent, 'iPhone');
  assertNoPositiveRoute(p);
  assert.equal(p.timers.size, 0);
  p.advance(3600001); await flush();
  assert.equal(p.requests.length, 1, 'Cooldown expiration itself must not send a request');
  p.event('offline'); p.event('online'); await flush();
  assert.equal(p.requests.length, 2);
  assert.equal(p.get('detail-ip').textContent, fixture.ip);
  assertNoTracking(p);
});

test('Unavailable AbortController and refused model hints fail gracefully on automatic startup', async () => {
  const p = page({ noAbort: true, model: () => Promise.reject(new Error('Hints denied')) });
  await flush();
  assert.equal(p.requests.length, 0);
  assert.equal(p.get('detail-ip').textContent, 'Temporarily unavailable');
  assert.equal(p.get('connection-results').getAttribute('aria-busy'), 'false');
  assert.notEqual(p.get('detail-device').textContent, 'Not available');
  assertNoPositiveRoute(p);
  assertNoTracking(p);
});

test('Optional model hints improve the on-screen device without appending them to the automatic request', async () => {
  const p = page({ model: () => Promise.resolve({ model: 'SM-S928U' }) });
  await flush();
  assert.equal(p.get('detail-device').textContent, 'Samsung · SM-S928U');
  assert.equal(p.requests.length, 1);
  assert.equal(p.reads().modelReads, 1);
  assertNoTracking(p);
});

test('TIAN, an identified VPN, and a published Apple relay receive positive treatment; cloud hosting alone does not', async () => {
  const tian = page({ fetch: async () => ok(tianFixture) });
  const otherVpn = page({ fetch: async () => ok(vpnFixture) });
  const apple = page({ fetch: async () => ok(appleFixture) });
  const cloud = page({ fetch: async () => ok(cloudFixture) });
  const access = page();
  await flush();
  assert.equal(tian.get('details-privacy').getAttribute('data-tone'), 'positive');
  assert.equal(otherVpn.get('details-privacy').getAttribute('data-tone'), 'positive');
  assert.equal(apple.get('details-privacy').getAttribute('data-tone'), 'positive');
  assert.match(tian.get('detail-privacy-label').textContent + ' ' + tian.get('detail-route').textContent, /TIAN/i);
  assert.match(otherVpn.get('detail-privacy-label').textContent + ' ' + otherVpn.get('detail-route').textContent, /VPN/i);
  assert.match(apple.get('detail-privacy-label').textContent, /iCloud Private Relay/i);
  assert.match(apple.get('detail-provider').textContent, /Cloudflare/i);
  assertNoPositiveRoute(cloud);
  assert.match(cloud.get('detail-network-type').textContent, /hosting|cloud|server|data.?cent/i);
  assertNoPositiveRoute(access);
  assert.doesNotMatch(access.get('detail-privacy-label').textContent, /unsafe|unprotected|exposed|stolen|at risk/i);
  for (const p of [tian, otherVpn, apple, cloud, access]) {
    assert.ok(p.get('detail-evidence').textContent.length > 0);
    assertNoTracking(p);
  }
});

test('HTTPS describes the website connection independently of the VPN verdict', async () => {
  const secureAccess = page();
  const secureVpn = page({ fetch: async () => ok(vpnFixture) });
  const insecureVpn = page({ url: 'http://tianvpn.com/', fetch: async () => ok(vpnFixture) });
  await flush();
  assert.match(secureAccess.get('detail-transport').textContent, /HTTPS/i);
  assert.equal(secureAccess.get('detail-transport').textContent, secureVpn.get('detail-transport').textContent);
  assertNoPositiveRoute(secureAccess);
  assert.equal(secureVpn.get('details-privacy').getAttribute('data-tone'), 'positive');
  assert.equal(insecureVpn.get('details-privacy').getAttribute('data-tone'), 'positive');
  assert.notEqual(insecureVpn.get('detail-transport').textContent, secureVpn.get('detail-transport').textContent);
  assert.match(insecureVpn.get('detail-transport').textContent, /HTTP|not encrypted|unencrypted/i);
});

test('Returning to visible refreshes after 30 seconds, while focus and duplicate visibility events do not', async () => {
  const refresh = deferred();
  const p = page({ fetch: (_, __, number) => number === 1 ? Promise.resolve(ok(fixture)) : refresh.promise });
  await flush();
  p.advance(29999); p.visibility('hidden'); p.visibility('visible');
  assert.equal(p.requests.length, 1);
  assert.equal(p.timers.size, 0, 'A quick tab switch does not queue a lookup');
  p.advance(1); p.event('focus'); p.visibility('visible');
  assert.equal(p.requests.length, 1, 'Focus alone and repeated visible events are not returns');
  p.visibility('hidden'); p.visibility('visible');
  assert.equal(p.requests.length, 2);
  assert.equal(p.get('detail-ip').textContent, 'Checking…');
  p.advance(30000); p.visibility('hidden'); p.visibility('visible'); p.event('focus');
  assert.equal(p.requests.length, 2, 'Returning while a request is active cannot overlap it');
  refresh.resolve(ok(vpnFixture)); await flush();
  assert.equal(p.get('detail-ip').textContent, vpnFixture.ip);
  assert.equal(p.timers.size, 0);
  assertNoTracking(p);
});

test('Browser network changes immediately clear stale verdicts and coalesce into one cooldown refresh', async () => {
  const refresh = deferred();
  const p = page({ connection: true, fetch: (_, __, number) => number === 1 ? Promise.resolve(ok(vpnFixture)) : refresh.promise });
  await flush();
  assert.equal(p.get('details-privacy').getAttribute('data-tone'), 'positive');
  p.advance(5000); p.networkChange();
  assertNoPositiveRoute(p);
  assert.equal(p.get('detail-ip').textContent, 'Awaiting update');
  assert.match(p.get('detail-evidence').textContent, /network change/i);
  assert.equal(p.get('detail-device').textContent, 'iPhone');
  assert.equal(p.requests.length, 1);
  assert.equal(p.timers.size, 1);
  const [[id, timer]] = Array.from(p.timers.entries());
  assert.equal(timer.delay, 25000);
  p.advance(10000);
  for (let n = 0; n < 20; n += 1) p.networkChange();
  assert.equal(p.timers.size, 1);
  assert.equal(p.timers.get(id), timer, 'Event spam cannot postpone or multiply the scheduled refresh');
  p.advance(15000); p.fireTimer(id);
  assert.equal(p.requests.length, 2);
  assert.equal(p.get('detail-ip').textContent, 'Checking…');
  assertNoPositiveRoute(p);
  refresh.resolve(ok(fixture)); await flush();
  assert.equal(p.get('detail-ip').textContent, fixture.ip);
  assert.equal(p.timers.size, 0, 'A completed event-driven refresh never becomes polling');
  assertNoTracking(p);
});

test('Network changes abort the old request before a delayed refresh and ignore old body and model values', async () => {
  const oldBody = deferred(), oldModel = deferred();
  const p = page({ connection: true,
    fetch: async (_, __, number) => number === 1 ? { ...ok(tianFixture), json: () => oldBody.promise } : ok(fixture),
    model: number => number === 1 ? oldModel.promise : Promise.resolve({ model: 'SM-S928U' })
  });
  await flush(); p.networkChange();
  assert.equal(p.requests[0].config.signal.aborted, true);
  assert.equal(p.requests.length, 1);
  assert.equal(p.timers.size, 1, 'Only the coalesced refresh remains, not the old request timeout');
  const [id] = p.timers.keys();
  p.advance(30000); p.fireTimer(id); await flush();
  assert.equal(p.requests.length, 2);
  assert.equal(p.get('detail-ip').textContent, fixture.ip);
  assert.equal(p.get('detail-device').textContent, 'Samsung · SM-S928U');
  const currentPrivacy = privacySnapshot(p);
  oldBody.resolve(tianFixture); oldModel.resolve({ model: 'Pixel 9' }); await flush();
  assert.equal(p.get('detail-ip').textContent, fixture.ip);
  assert.equal(p.get('detail-device').textContent, 'Samsung · SM-S928U');
  assert.deepEqual(privacySnapshot(p), currentPrivacy);
  assert.equal(p.timers.size, 0);
});

test('Hidden pages defer network-change work until visible and navigation cancels a queued refresh', async () => {
  const p = page({ connection: true }); await flush();
  p.visibility('hidden'); p.advance(30000); p.networkChange();
  assert.equal(p.requests.length, 1);
  assert.equal(p.timers.size, 0);
  assert.equal(p.get('detail-ip').textContent, 'Awaiting update');
  p.visibility('visible'); await flush();
  assert.equal(p.requests.length, 2, 'A visible return consumes the pending network change exactly once');
  p.networkChange();
  assert.equal(p.timers.size, 1);
  p.visibility('hidden');
  assert.equal(p.timers.size, 0, 'Backgrounding cancels the one-shot refresh timer');
  p.visibility('visible');
  assert.equal(p.timers.size, 1, 'A pending event resumes only when visible');
  p.event('pagehide', { persisted: true });
  assert.equal(p.timers.size, 0, 'Navigation cancels the queued event-driven refresh');
  p.networkChange(); p.visibility('hidden'); p.visibility('visible');
  assert.equal(p.requests.length, 2);
  assert.equal(p.timers.size, 0);
  p.event('pageshow', { persisted: true }); await flush();
  assert.equal(p.requests.length, 3);
  assert.equal(p.get('detail-ip').textContent, fixture.ip);
  assertNoTracking(p);
});

test('New visibility and network-change triggers honor provider rate limits without automatic failure retries', async () => {
  const p = page({ connection: true, fetch: async (_, __, number) => number === 1
    ? { ok: false, status: 429, headers: { get: () => '3600' } } : ok(fixture) });
  await flush(); p.advance(30000);
  p.visibility('hidden'); p.visibility('visible'); p.networkChange(); await flush();
  assert.equal(p.requests.length, 1);
  assert.equal(p.timers.size, 0);
  assert.match(p.get('details-network-status').textContent, /limit/i);
  assertNoPositiveRoute(p);
  p.advance(3570000); await flush();
  assert.equal(p.requests.length, 1, 'Rate-limit expiry itself is not an event or a retry');
  p.networkChange(); await flush();
  assert.equal(p.requests.length, 2);
  assert.equal(p.get('detail-ip').textContent, fixture.ip);
  assert.equal(p.timers.size, 0);
  assertNoTracking(p);
});

test('A network-change refresh failure stops until another genuine lifecycle event', async () => {
  const p = page({ connection: true, fetch: async (_, __, number) => {
    if (number === 1) return ok(vpnFixture);
    throw new Error('Unavailable');
  } });
  await flush(); p.advance(30000); p.networkChange(); await flush();
  assert.equal(p.requests.length, 2);
  assert.equal(p.get('detail-ip').textContent, 'Temporarily unavailable');
  assert.equal(p.get('detail-device').textContent, 'iPhone');
  assertNoPositiveRoute(p);
  assert.equal(p.timers.size, 0);
  p.advance(300000); p.event('focus'); p.visibility('visible'); await flush();
  assert.equal(p.requests.length, 2);
  assertNoTracking(p);
});
