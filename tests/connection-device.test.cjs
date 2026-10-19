'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { describe } = require('../connection-device.js');

const iphoneSafari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const macSafari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
const androidReduced = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';

test('iPhone Safari reports a family and does not turn frozen OS data into a version or exact phone model', () => {
  const result = describe({ userAgent: iphoneSafari, model: 'iPhone 17 Pro' });
  assert.equal(result.device, 'iPhone');
  assert.equal(result.os, 'iOS');
  assert.equal(result.browser, 'Safari');
  assert.match(result.deviceNote, /exact model is hidden/);
  assert.doesNotMatch(result.os, /18|26/);
});

test('iPad and iPod remain distinct from iPhone', () => {
  assert.equal(describe({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) Version/26.0 Safari/605.1' }).device, 'iPad');
  assert.equal(describe({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X)' }).os, 'iPadOS');
  assert.equal(describe({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X)', clientPlatform: 'iOS' }).os, 'iPadOS');
  const ipod = describe({ userAgent: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_8 like Mac OS X)' });
  assert.equal(ipod.device, 'iPod');
  assert.equal(ipod.os, 'iOS');
});

test('desktop-mode iPad is an estimate; ordinary Macs do not acquire invented hardware names', () => {
  const ipad = describe({ userAgent: macSafari, platform: 'MacIntel', maxTouchPoints: 5 });
  assert.equal(ipad.device, 'iPad (estimated)');
  assert.equal(ipad.os, 'iPadOS');
  assert.match(ipad.osNote, /estimated/i);
  const mac = describe({ userAgent: macSafari, platform: 'MacIntel', maxTouchPoints: 0, model: 'MacBook Pro' });
  assert.equal(mac.device, 'Mac');
  assert.equal(mac.os, 'macOS');
  assert.doesNotMatch(mac.device, /MacBook|iMac/);
});

test('Chromium Android 10; K reduction does not invent a K phone model or a current Android version', () => {
  const phone = describe({ userAgent: androidReduced, clientPlatform: 'Android', mobile: true, model: 'K' });
  assert.equal(phone.device, 'Android phone (estimated)');
  assert.equal(phone.os, 'Android');
  assert.match(phone.deviceNote, /model is hidden/);
  const tablet = describe({ userAgent: androidReduced.replace(' Mobile', ''), clientPlatform: 'Android', mobile: false });
  assert.equal(tablet.device, 'Android tablet (estimated)');
  assert.match(tablet.deviceNote, /another device type/);
});

test('real Samsung UA models and Samsung Internet take precedence over compatibility tokens', () => {
  const result = describe({
    userAgent: 'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S918B Build/TP1A.220624.014) AppleWebKit/537.36 Chrome/112.0.0.0 Mobile Safari/537.36 SamsungBrowser/23.0',
    brands: [{ brand: 'Chromium', version: '112' }]
  });
  assert.equal(result.device, 'Samsung · SM-S918B');
  assert.equal(result.browser, 'Samsung Internet');
  assert.match(result.deviceNote, /reported by the browser/);
});

test('real Pixel names and explicitly supplied client-hint models survive UA reduction', () => {
  const pixel = describe({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36' });
  assert.equal(pixel.device, 'Pixel 9 Pro');
  const samsung = describe({ userAgent: androidReduced, clientPlatform: 'Android', model: 'SM-S928U' });
  assert.equal(samsung.device, 'Samsung · SM-S928U');
  const hintPixel = describe({ userAgent: androidReduced, clientPlatform: 'Android', model: 'Pixel 9a' });
  assert.equal(hintPixel.device, 'Pixel 9a');
});

test('Android client platform can supply or correct the platform independently of the UA', () => {
  const result = describe({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0', clientPlatform: 'Android', mobile: true });
  assert.equal(result.os, 'Android');
  assert.equal(result.device, 'Android phone (estimated)');
  assert.equal(describe({ clientPlatform: 'Android', mobile: false }).device, 'Android device');
});

test('Windows 10 compatibility data is not claimed to distinguish Windows 10 from 11 or expose hardware', () => {
  const result = describe({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0.0.0 Safari/537.36', platform: 'Win32' });
  assert.equal(result.os, 'Windows');
  assert.equal(result.device, 'Windows device');
  assert.doesNotMatch(result.os + result.device, /10|11|desktop/i);
});

test('recognized browser brands ignore GREASE and distinguish Chromium from Google Chrome', () => {
  const chromium = describe({ userAgent: androidReduced, brands: [{ brand: 'Not A(Brand', version: '99' }, { brand: 'Chromium', version: '141' }] });
  assert.equal(chromium.browser, 'Chromium');
  const chrome = describe({ userAgent: androidReduced, brands: [{ brand: 'Chromium' }, { brand: 'Google Chrome' }, { brand: 'Not_A Brand' }] });
  assert.equal(chrome.browser, 'Google Chrome');
  const edge = describe({ userAgent: androidReduced, brands: [{ brand: 'Chromium' }, { brand: 'Microsoft Edge' }] });
  assert.equal(edge.browser, 'Microsoft Edge');
  assert.equal(describe({ userAgent: androidReduced }).browser, 'Chrome-compatible');
  assert.equal(describe({ brands: [{ brand: 'Invented browser' }] }).browser, 'Not identified');
});

test('iOS Chrome, Edge, Opera and Firefox are not mislabeled as Safari', () => {
  for (const [token, name] of [['CriOS/141.0', 'Google Chrome'], ['EdgiOS/141.0', 'Microsoft Edge'], ['OPiOS/3.3', 'Opera'], ['FxiOS/144.0', 'Firefox']]) {
    assert.equal(describe({ userAgent: iphoneSafari + ' ' + token }).browser, name);
  }
  assert.equal(describe({ userAgent: androidReduced + ' OPR/124.0' }).browser, 'Opera');
  assert.equal(describe({ userAgent: androidReduced + ' EdgA/141.0' }).browser, 'Microsoft Edge');
});

test('UA model parsing discards locale, architecture and browser tokens', () => {
  const real = describe({ userAgent: 'Mozilla/5.0 (Linux; U; Android 4.4.2; en-us; Nexus 5 Build/KOT49H) AppleWebKit/537.36 Mobile Safari/537.36' });
  assert.equal(real.device, 'Nexus 5');
  const firefox = describe({ userAgent: 'Mozilla/5.0 (Android 15; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0' });
  assert.equal(firefox.device, 'Android phone (estimated)');
  const generic = describe({ userAgent: 'Mozilla/5.0 (Linux; Android 10; x86_64; K) Chrome/141.0 Safari/537.36' });
  assert.equal(generic.device, 'Android tablet (estimated)');
});

test('missing or withheld data never defaults to desktop', () => {
  for (const input of [undefined, null, {}, { userAgent: '' }, { userAgent: 'Unrecognized/1.0' }, { mobile: false }]) {
    const result = describe(input);
    assert.equal(result.device, 'Not identified');
    assert.equal(result.os, 'Not identified');
    assert.doesNotMatch(result.device, /desktop/i);
  }
  assert.equal(describe({ mobile: true }).device, 'Mobile device (estimated)');
});

test('malformed or spoofed data cannot throw or inject markup through a model', () => {
  const rejected = new Proxy({}, { get() { throw new Error('blocked'); } });
  const revoked = Proxy.revocable([], {});
  revoked.revoke();
  const inputs = [Symbol('input'), 42, rejected, { brands: revoked.proxy }, { userAgent: { toString() { throw new Error('blocked'); } } }, { maxTouchPoints: Symbol('touch') }];
  for (const input of inputs) {
    assert.doesNotThrow(() => describe(input));
    const result = describe(input);
    assert.deepEqual(Object.keys(result).sort(), ['browser', 'browserNote', 'device', 'deviceNote', 'os', 'osNote'].sort());
    assert.ok(Object.values(result).every(value => typeof value === 'string'));
  }
  const hostileModel = describe({ userAgent: androidReduced, model: '<img src=x onerror=alert(1)>' });
  assert.equal(hostileModel.device, 'Android phone (estimated)');
});

test('raw model values are bounded and controls are removed', () => {
  const long = describe({ clientPlatform: 'Android', model: 'Pixel ' + 'a'.repeat(10000) });
  assert.ok(long.device.length <= 64);
  const cleaned = describe({ clientPlatform: 'Android', model: 'Pixel\n\t9 Pro' });
  assert.equal(cleaned.device, 'Pixel 9 Pro');
  assert.doesNotMatch(describe({ clientPlatform: 'Android', model: 'Pixel\u202e9 Pro' }).device, /\u202e/);
});

test('module attaches the browser API without reading navigator or making requests', () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const context = {
    window: {},
    get navigator() { throw new Error('must not read navigator'); },
    fetch() { throw new Error('must not fetch'); }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../connection-device.js'), 'utf8'), context);
  assert.equal(typeof context.window.TianDeviceDetection.describe, 'function');
  assert.equal(context.window.TianDeviceDetection.describe({ userAgent: iphoneSafari }).device, 'iPhone');
});
