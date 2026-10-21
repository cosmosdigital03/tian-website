(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.TianDeviceDetection = api;
})(typeof window === 'object' && window ? window : null, function () {
  'use strict';

  // This module only describes values supplied by the caller. It does not read
  // browser APIs, request client hints, make requests, or retain visitor data.
  var unknown = 'Not identified';
  var reportedOS = 'Browser-reported platform; OS version is not verified.';
  var reportedBrowser = 'Browser-reported name; it can be modified or hidden.';

  function read(source, key) {
    try { return source == null ? undefined : source[key]; }
    catch (_) { return undefined; }
  }

  function text(value, limit) {
    return typeof value === 'string' ? value.slice(0, limit).trim() : '';
  }

  function emptyResult() {
    return {
      device: unknown,
      deviceNote: 'The browser did not provide enough device information.',
      os: unknown,
      osNote: 'The browser platform is hidden or unrecognized.',
      browser: unknown,
      browserNote: 'The browser name is hidden or unrecognized.'
    };
  }

  function platformOS(value) {
    if (/^android$/i.test(value)) return 'Android';
    if (/^(?:windows|win32|win64|windows phone)$/i.test(value)) return 'Windows';
    if (/^(?:chrome ?os|cros)$/i.test(value)) return 'ChromeOS';
    if (/^(?:ipad|ipados)$/i.test(value)) return 'iPadOS';
    if (/^(?:ios|iphone|ipod)$/i.test(value)) return 'iOS';
    if (/^(?:macos|mac os|mac os x|macintel|macppc)$/i.test(value)) return 'macOS';
    if (/^linux(?:\s|$)/i.test(value)) return 'Linux';
    return '';
  }

  function userAgentOS(ua) {
    // Older Windows Phone strings can contain both Android and iPhone tokens.
    if (/Windows Phone|Windows NT|Windows (?:95|98|ME|CE)/i.test(ua)) return 'Windows';
    if (/iPad/i.test(ua)) return 'iPadOS';
    if (/iPhone|iPod/i.test(ua)) return 'iOS';
    if (/Android/i.test(ua)) return 'Android';
    if (/CrOS/i.test(ua)) return 'ChromeOS';
    if (/Macintosh|Mac OS X/i.test(ua)) return 'macOS';
    if (/Linux/i.test(ua)) return 'Linux';
    return '';
  }

  function cleanModel(value) {
    var model = text(value, 64).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!model || !/[a-z0-9]/i.test(model) || /[<>{}\[\]\\]/.test(model)) return '';
    // Chromium's reduced Android UA uses "Android 10; K". K is a placeholder,
    // not hardware. Architecture, locale, and browser tokens are not models.
    if (/^(?:K|U|Mobile|Tablet|Phone|Android|Linux|Unknown|Undefined|Null|Generic|Not[ _-]?(?:set|available|identified)|wv|x86(?:_64)?|i[3-6]86|aarch64|arm(?:64|v\d+[a-z]*)?|Intel)$/i.test(model)) return '';
    if (/^[a-z]{2,3}[-_][a-z]{2}$/i.test(model) || /^(?:rv:|Build\/|AppleWebKit|Mozilla|Chrome\/|Safari\/)/i.test(model)) return '';
    return model;
  }

  function androidModel(ua) {
    var match = /Android(?:\s+[\d.]+)?\s*;\s*([^)]*)/i.exec(ua);
    if (!match) return '';
    var parts = match[1].split(';').slice(0, 12);
    for (var i = 0; i < parts.length; i += 1) {
      var candidate = parts[i].replace(/\s+Build\/.*$/i, '').trim();
      var model = cleanModel(candidate);
      if (model) return model;
    }
    return '';
  }

  function modelLabel(model) {
    var samsung = model.replace(/^Samsung\s+/i, '');
    if (/^SM-[a-z0-9]/i.test(samsung)) return 'Samsung · ' + samsung.toUpperCase();
    return model;
  }

  function knownBrands(input) {
    var found = Object.create(null);
    try {
      if (!Array.isArray(input)) return found;
      for (var i = 0; i < Math.min(input.length, 16); i += 1) {
        var name = text(read(read(input, i), 'brand'), 80).toLowerCase();
        // Only recognized browser brands become labels. Unknown brands and
        // GREASE entries such as "Not A(Brand" are ignored.
        var labels = {
          'microsoft edge': 'Microsoft Edge',
          'samsung internet': 'Samsung Internet',
          'opera': 'Opera',
          'opera gx': 'Opera GX',
          'brave': 'Brave',
          'vivaldi': 'Vivaldi',
          'duckduckgo': 'DuckDuckGo',
          'firefox': 'Firefox',
          'google chrome': 'Google Chrome',
          'chromium': 'Chromium'
        };
        if (Object.prototype.hasOwnProperty.call(labels, name)) found[labels[name]] = true;
      }
    } catch (_) { /* Malformed client-hint data is optional. */ }
    return found;
  }

  function describeBrowser(ua, brands) {
    var specific = ['Microsoft Edge', 'Samsung Internet', 'Opera GX', 'Opera', 'Brave', 'Vivaldi', 'DuckDuckGo', 'Firefox'];
    for (var i = 0; i < specific.length; i += 1) {
      if (brands[specific[i]]) return specific[i];
    }
    // These browsers also advertise Chrome/Safari compatibility tokens.
    if (/SamsungBrowser\//i.test(ua)) return 'Samsung Internet';
    if (/Edg(?:e|A|iOS)?\//i.test(ua)) return 'Microsoft Edge';
    if (/OPR\/|OPiOS\/|Opera(?:\/|\s)/i.test(ua)) return 'Opera';
    if (/Firefox\/|FxiOS\//i.test(ua)) return 'Firefox';
    if (/CriOS\//i.test(ua)) return 'Google Chrome';
    if (/Vivaldi\//i.test(ua)) return 'Vivaldi';
    if (/DuckDuckGo\//i.test(ua)) return 'DuckDuckGo';
    if (/Silk\//i.test(ua)) return 'Amazon Silk';
    if (brands['Google Chrome']) return 'Google Chrome';
    if (brands.Chromium || /Chromium\//i.test(ua)) return 'Chromium';
    if (/Chrome\//i.test(ua)) return 'Chrome-compatible';
    if (/Safari\//i.test(ua) && /Version\//i.test(ua)) return 'Safari';
    return '';
  }

  function describe(input) {
    var result = emptyResult();
    try {
      var ua = text(read(input, 'userAgent'), 4096);
      var platform = text(read(input, 'platform'), 128);
      var clientPlatform = platformOS(text(read(input, 'clientPlatform'), 128));
      var mobile = read(input, 'mobile');
      var touches = read(input, 'maxTouchPoints');
      var touchCapable = typeof touches === 'number' && isFinite(touches) && touches > 1;
      var uaOS = userAgentOS(ua);
      var os = clientPlatform || uaOS || platformOS(platform);
      // A generic iOS platform hint can still accompany an explicit iPad UA.
      if (os === 'iOS' && /iPad/i.test(ua + ' ' + platform)) os = 'iPadOS';
      var ipadDesktop = os === 'macOS' && touchCapable && /Macintosh|MacIntel/i.test(ua + ' ' + platform);

      if (ipadDesktop) {
        os = 'iPadOS';
        result.device = 'iPad (estimated)';
        result.deviceNote = 'Estimated from Mac-style browser data and touch support.';
        result.osNote = 'iPadOS estimated from Mac-style browser data and touch support.';
      } else if (os === 'iPadOS') {
        result.device = 'iPad';
        result.deviceNote = 'Browser-reported device family; exact model is hidden.';
      } else if (os === 'iOS') {
        result.device = /iPod/i.test(ua + ' ' + platform) ? 'iPod' : /iPhone/i.test(ua + ' ' + platform) ? 'iPhone' : 'iOS device';
        result.deviceNote = 'Browser-reported device family; exact model is hidden.';
      } else if (os === 'Android') {
        var model = cleanModel(read(input, 'model')) || androidModel(ua);
        if (model) {
          result.device = modelLabel(model);
          result.deviceNote = 'Model reported by the browser; not independently verified.';
        } else if (/Android TV|SmartTV|SMART-TV|GoogleTV/i.test(ua)) {
          result.device = 'Android TV device';
          result.deviceNote = 'Browser-reported TV platform; exact model is hidden.';
        } else if (mobile === true || (mobile !== false && /Mobile/i.test(ua))) {
          result.device = 'Android phone (estimated)';
          result.deviceNote = 'Estimated from browser-reported mobile data; model is hidden.';
        } else if (/Tablet/i.test(ua) || (uaOS === 'Android' && !/Mobile/i.test(ua))) {
          result.device = 'Android tablet (estimated)';
          result.deviceNote = 'Estimated from Android browser data; it may be another device type.';
        } else {
          result.device = 'Android device';
          result.deviceNote = 'Browser reports Android; device type and model are hidden.';
        }
      } else if (os === 'macOS') {
        result.device = 'Mac';
        result.deviceNote = 'Browser-reported Mac family; exact Mac model is hidden.';
      } else if (os === 'Windows' || os === 'ChromeOS' || os === 'Linux') {
        result.device = os + ' device';
        result.deviceNote = 'Browser-reported platform; hardware model is hidden.';
      } else if (mobile === true || /\bMobile\b/i.test(ua)) {
        result.device = 'Mobile device (estimated)';
        result.deviceNote = 'Estimated from browser-reported mobile data; model is hidden.';
      } else if (/\bTablet\b/i.test(ua)) {
        result.device = 'Tablet (estimated)';
        result.deviceNote = 'Estimated from browser-reported tablet data; model is hidden.';
      }

      if (os) {
        result.os = os;
        if (!ipadDesktop) result.osNote = reportedOS;
      }
      var browser = describeBrowser(ua, knownBrands(read(input, 'brands')));
      if (browser) {
        result.browser = browser;
        result.browserNote = browser === 'Chrome-compatible'
          ? 'Chrome-compatible user agent; exact browser is not exposed.'
          : reportedBrowser;
      }
    } catch (_) { /* Hidden or malformed browser data must never break the page. */ }
    return result;
  }

  return { describe: describe };
});
