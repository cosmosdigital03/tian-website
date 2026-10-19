(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const button = byId('details-toggle');
  const clearButton = byId('details-clear');
  const results = byId('connection-results');
  const status = byId('details-status');
  const privacy = byId('details-privacy');
  if (!button || !clearButton || !results || !status || !privacy ||
      !window.TianDeviceDetection || !window.TianConnectionNetwork ||
      !window.TianConnectionPrivacy) return;
  const endpoint = 'https://ipwho.is/?fields=success,message,ip,type,country,region,city,connection.asn,connection.org,connection.isp';
  const unavailable = 'Not available';
  const valueIds = ['ip', 'provider', 'location', 'organization', 'asn', 'network-type',
    'device', 'browser', 'os', 'screen', 'language', 'timezone',
    'route', 'transport', 'clues'];
  const networkTypeLabels = {
    hosting: 'Server / hosting network', mobile: 'Mobile network',
    access: 'Internet provider network', unknown: 'Not determined'
  };
  let sequence = 0;
  let activeController = null;
  let activeTimeout = null;
  let currentNetwork = null;
  let currentPrivacy = null;
  let currentDevice = null;
  let hasDeviceClues = false;
  let networkState = 'idle';
  let lookupBlockedUntil = 0;
  let resumeOnPageShow = false;

  function setText(id, value) {
    const target = byId(id);
    if (target) target.textContent = value;
  }
  function safely(read, fallback) {
    try {
      const value = read();
      return value === undefined || value === null || value === '' ? fallback : value;
    } catch (_) { return fallback; }
  }
  function shortText(value) {
    return typeof value === 'string' ? value.slice(0, 120) : unavailable;
  }
  function stopRequest() {
    if (activeController) activeController.abort();
    if (activeTimeout) window.clearTimeout(activeTimeout);
    activeController = null;
    activeTimeout = null;
  }
  function setBusy(busy) {
    button.disabled = busy;
    results.setAttribute('aria-busy', String(busy));
    button.textContent = busy ? 'Checking your connection…' : 'Refresh check';
  }
  function resetNetwork(message) {
    currentNetwork = null;
    currentPrivacy = null;
    ['ip', 'provider', 'location', 'organization', 'asn', 'network-type'].forEach(key => setText('detail-' + key, message));
    setText('detail-ip-note', 'The public address visible to the lookup service');
    setText('detail-provider-note', 'The network behind that address');
  }
  function renderPrivacy() {
    const loading = networkState === 'loading';
    const reading = currentPrivacy || {
      kind: 'unknown', tone: 'neutral',
      label: loading ? 'Checking your network…' : 'Network privacy not determined',
      summary: loading
        ? 'Looking for a recognized VPN, relay, or server network.'
        : 'The network lookup is unavailable. Your website connection and browser details can still be shown.',
      routeValue: loading ? 'Checking…' : 'Not determined',
      routeNote: loading ? 'Reading the IP used for this lookup' : 'No conclusion about your VPN',
      networkType: 'unknown',
      evidence: loading ? 'Waiting for network details.' : 'No current IP lookup result is available.'
    };
    privacy.setAttribute('data-tone', reading.tone === 'positive' ? 'positive' : 'neutral');
    privacy.setAttribute('data-kind', reading.kind);
    setText('detail-privacy-label', reading.label);
    setText('detail-privacy-summary', reading.summary);
    setText('detail-route', reading.routeValue);
    setText('detail-route-note', reading.routeNote);
    setText('detail-evidence', reading.evidence);
    if (currentNetwork) setText('detail-network-type', networkTypeLabels[reading.networkType] || reading.networkType);
    const protocol = safely(() => window.location.protocol, '');
    setText('detail-transport', protocol === 'https:' ? 'HTTPS active' : protocol === 'http:' ? 'HTTP connection' : 'Not determined');
    setText('detail-transport-note', protocol === 'https:'
      ? 'The connection to this website is encrypted'
      : protocol === 'http:' ? 'The connection to this website is not encrypted' : 'Website encryption is separate from VPN routing');
    setText('detail-clues', hasDeviceClues ? 'Still visible' : 'Limited details');
    setText('detail-clues-note', hasDeviceClues
      ? 'A VPN can change your IP while these browser clues remain'
      : 'Your browser controls which details it shares');
  }
  function renderDevice(input) {
    const data = window.TianDeviceDetection.describe(input);
    currentDevice = data;
    ['device', 'browser', 'os'].forEach(key => {
      setText('detail-' + key, data[key]);
      setText('detail-' + key + '-note', data[key + 'Note']);
    });
    hasDeviceClues = hasDeviceClues || ['device', 'browser', 'os'].some(key => data[key] && data[key] !== 'Not identified');
    renderPrivacy();
    renderInsight();
  }
  function renderInsight() {
    if (!currentDevice) return;
    const parts = [];
    if (currentNetwork && currentNetwork.hasProvider) parts.push('A connection through ' + currentNetwork.provider + '.');
    if (currentNetwork && currentNetwork.hasLocation) parts.push('An IP associated with ' + currentNetwork.location + '.');
    if (currentDevice.device && currentDevice.device !== 'Not identified') parts.push('A browser reporting ' + currentDevice.device + '.');
    const explanation = currentPrivacy && currentPrivacy.tone === 'positive'
      ? ' A privacy route can change the network address. The browser clues shown here can still help websites recognize visits.'
      : ' These are the beginnings of a digital profile.';
    setText('details-insight', parts.length
      ? parts.join(' ') + explanation
      : 'Your browser controls which details it shares. Even a few signals can help websites recognize visits.');
  }
  function collectDevice(check) {
    const uaData = safely(() => navigator.userAgentData, null);
    const input = {
      userAgent: safely(() => navigator.userAgent, ''),
      platform: safely(() => navigator.platform, ''),
      maxTouchPoints: safely(() => navigator.maxTouchPoints, 0),
      brands: safely(() => uaData.brands, []),
      mobile: safely(() => uaData.mobile, undefined),
      clientPlatform: safely(() => uaData.platform, '')
    };
    renderDevice(input);
    const screen = safely(() => {
      const width = window.screen.width;
      const height = window.screen.height;
      return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
        ? width + ' × ' + height : unavailable;
    }, unavailable);
    const language = shortText(safely(() => navigator.language, unavailable));
    const timezone = shortText(safely(() => Intl.DateTimeFormat().resolvedOptions().timeZone, unavailable));
    setText('detail-screen', screen);
    setText('detail-language', language);
    setText('detail-timezone', timezone);
    hasDeviceClues = hasDeviceClues || [screen, language, timezone].some(value => value !== unavailable);
    renderPrivacy();
    // Optional model hints are read automatically and remain in this page.
    // A stale hint must never restore cleared results.
    const getModel = safely(() => uaData.getHighEntropyValues, null);
    if (typeof getModel === 'function') {
      try {
        Promise.resolve(getModel.call(uaData, ['model'])).then(hints => {
          if (check !== sequence || results.hidden) return;
          if (hints && typeof hints.model === 'string' && hints.model.trim()) {
            renderDevice(Object.assign({}, input, { model: hints.model }));
          }
        }).catch(() => {});
      } catch (_) { /* Basic browser data is still useful. */ }
    }
  }
  function showOffline() {
    networkState = 'offline';
    resetNetwork('Offline');
    setText('details-badge', 'BROWSER DETAILS READY');
    setText('details-network-status', 'You appear to be offline. The check will refresh after reconnecting.');
    status.textContent = 'Network details cleared because the browser is offline. Browser details remain visible.';
    setBusy(false);
    renderPrivacy();
    renderInsight();
  }
  async function runCheck() {
    const check = ++sequence;
    stopRequest();
    resumeOnPageShow = false;
    networkState = 'loading';
    currentDevice = null;
    hasDeviceClues = false;
    resetNetwork('Checking…');
    results.hidden = false;
    clearButton.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    setText('details-badge', 'READING YOUR CONNECTION');
    setText('details-network-status', 'Looking up the current public IP');
    setBusy(true);
    collectDevice(check);
    if (safely(() => navigator.onLine, true) === false) {
      showOffline();
      return;
    }
    if (Date.now() < lookupBlockedUntil) {
      networkState = 'limited';
      resetNetwork('Temporarily unavailable');
      setText('details-badge', 'BROWSER DETAILS READY');
      setText('details-network-status', 'The lookup provider is at its limit. Try later.');
      status.textContent = 'Browser details are ready. The network provider has asked us to wait before trying again.';
      setBusy(false);
      renderPrivacy();
      return;
    }
    status.textContent = 'Browser details are ready. Checking your public IP and privacy signals…';
    try {
      const controller = new AbortController();
      activeController = controller;
      activeTimeout = window.setTimeout(() => controller.abort(), 8000);
      const response = await fetch(endpoint, {
        signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer',
        cache: 'no-store', mode: 'cors'
      });
      if (check !== sequence) return;
      if (response.status === 429) {
        const retryAfter = safely(() => response.headers.get('Retry-After'), '');
        const seconds = /^\d+$/.test(retryAfter) ? Number(retryAfter) : NaN;
        const until = Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(retryAfter);
        lookupBlockedUntil = Number.isFinite(until) && until > Date.now() ? until : Date.now() + 60000;
        const error = new Error('limited');
        error.limited = true;
        throw error;
      }
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json();
      if (check !== sequence) return;
      currentNetwork = window.TianConnectionNetwork.normalize(data);
      currentPrivacy = window.TianConnectionPrivacy.classify(currentNetwork, { relayRanges: window.TianRelayRanges });
      ['ip', 'provider', 'location', 'organization', 'asn'].forEach(key => setText('detail-' + key, currentNetwork[key]));
      setText('detail-ip-note', currentNetwork.type + ' · Seen by the lookup service');
      setText('detail-provider-note', currentNetwork.providerNote);
      setText('details-badge', 'YOUR CONNECTION SNAPSHOT');
      const checkedAt = safely(() => new Date().toLocaleTimeString(undefined, {
        hour: 'numeric', minute: '2-digit'
      }), '');
      setText('details-network-status', (checkedAt ? 'Checked at ' + checkedAt : 'Checked just now') + ' · IPWHOIS.io');
      networkState = 'ready';
      renderPrivacy();
      renderInsight();
      status.textContent = 'Your network and browser details are ready. ' + currentPrivacy.label + '. Location is an IP estimate.';
    } catch (error) {
      if (check !== sequence) return;
      networkState = error && error.limited ? 'limited' : 'unavailable';
      resetNetwork('Temporarily unavailable');
      setText('details-badge', 'BROWSER DETAILS READY');
      setText('details-network-status', error && error.limited
        ? 'The lookup provider is at its limit. Try later.'
        : 'Network lookup unavailable · your browser details are still shown');
      status.textContent = error && error.limited
        ? 'Browser details are ready. The network lookup has reached its limit; please try later.'
        : 'Browser details are ready. The IP lookup could not complete. This does not determine VPN or protection status.';
      renderPrivacy();
      renderInsight();
    } finally {
      if (check === sequence) {
        stopRequest();
        setBusy(false);
      }
    }
  }
  function clearResults(announce) {
    ++sequence;
    stopRequest();
    currentDevice = null;
    currentNetwork = null;
    currentPrivacy = null;
    hasDeviceClues = false;
    networkState = 'idle';
    results.hidden = true;
    results.setAttribute('aria-busy', 'false');
    valueIds.forEach(key => setText('detail-' + key, unavailable));
    ['ip', 'provider', 'device', 'browser', 'os', 'route', 'transport', 'clues'].forEach(key => setText('detail-' + key + '-note', ''));
    ['details-insight', 'details-network-status', 'detail-privacy-label', 'detail-privacy-summary', 'detail-evidence'].forEach(id => setText(id, ''));
    privacy.setAttribute('data-tone', 'neutral');
    privacy.setAttribute('data-kind', 'unknown');
    setText('details-badge', 'CONNECTION CHECK');
    button.disabled = false;
    button.textContent = 'Show my information';
    button.setAttribute('aria-expanded', 'false');
    clearButton.hidden = true;
    status.textContent = announce ? 'Results have been cleared from this page.' : '';
    if (announce) {
      resumeOnPageShow = false;
      button.focus({ preventScroll: true });
    }
  }
  button.hidden = false;
  button.addEventListener('click', () => { void runCheck(); });
  clearButton.addEventListener('click', () => clearResults(true));
  window.addEventListener('pagehide', () => {
    resumeOnPageShow = !results.hidden;
    clearResults(false);
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted && resumeOnPageShow) void runCheck();
  });
  window.addEventListener('offline', () => {
    if (results.hidden || networkState === 'idle') return;
    ++sequence;
    stopRequest();
    showOffline();
  });
  window.addEventListener('online', () => {
    if (!results.hidden && networkState === 'offline') void runCheck();
  });
  // One automatic lookup on entry. No interval, background retry, or alternate provider.
  void runCheck();
})();
