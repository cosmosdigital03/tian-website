(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const button = byId('details-toggle');
  const localButton = byId('details-local');
  const clearButton = byId('details-clear');
  const results = byId('connection-results');
  const status = byId('details-status');
  if (!button || !localButton || !clearButton || !results || !status ||
      !window.TianDeviceDetection || !window.TianConnectionNetwork) return;
  const endpoint = 'https://ipwho.is/?fields=success,message,ip,type,country,region,city,connection.asn,connection.org,connection.isp';
  const unavailable = 'Not available';
  const valueIds = ['ip', 'provider', 'location', 'organization', 'asn',
    'device', 'browser', 'os', 'screen', 'language', 'timezone'];
  let sequence = 0;
  let activeController = null;
  let activeTimeout = null;
  let currentNetwork = null;
  let currentDevice = null;
  let networkState = 'idle';
  let lookupBlockedUntil = 0;

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
    localButton.disabled = busy;
    results.setAttribute('aria-busy', String(busy));
    button.textContent = busy ? 'Checking your connection…' : 'Run the check again';
  }
  function resetNetwork(message) {
    currentNetwork = null;
    ['ip', 'provider', 'location', 'organization', 'asn'].forEach(key => setText('detail-' + key, message));
    setText('detail-ip-note', 'The public address visible to the lookup service');
    setText('detail-provider-note', 'The network behind that address');
  }
  function renderDevice(input) {
    const data = window.TianDeviceDetection.describe(input);
    currentDevice = data;
    ['device', 'browser', 'os'].forEach(key => {
      setText('detail-' + key, data[key]);
      setText('detail-' + key + '-note', data[key + 'Note']);
    });
    renderInsight();
  }
  function renderInsight() {
    if (!currentDevice) return;
    const parts = [];
    if (currentNetwork && currentNetwork.hasProvider) parts.push('A connection through ' + currentNetwork.provider + '.');
    if (currentNetwork && currentNetwork.hasLocation) parts.push('An IP associated with ' + currentNetwork.location + '.');
    if (currentDevice.device && currentDevice.device !== 'Not identified') parts.push('A browser reporting ' + currentDevice.device + '.');
    setText('details-insight', parts.length
      ? parts.join(' ') + ' These are the beginnings of a digital profile.'
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
    setText('detail-screen', safely(() => {
      const width = window.screen.width;
      const height = window.screen.height;
      return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
        ? width + ' × ' + height : unavailable;
    }, unavailable));
    setText('detail-language', shortText(safely(() => navigator.language, unavailable)));
    setText('detail-timezone', shortText(safely(() => Intl.DateTimeFormat().resolvedOptions().timeZone, unavailable)));
    // Optional model hints are read only after a click and remain in this page.
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
  async function runCheck(withNetwork) {
    const check = ++sequence;
    stopRequest();
    networkState = withNetwork ? 'loading' : 'local';
    currentDevice = null;
    resetNetwork(withNetwork ? 'Checking…' : 'Not requested');
    results.hidden = false;
    clearButton.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    localButton.setAttribute('aria-expanded', 'true');
    setText('details-badge', withNetwork ? 'READING YOUR CONNECTION' : 'BROWSER DETAILS');
    setText('details-network-status', withNetwork ? 'Looking up the current public IP' : 'Browser-only check · no network lookup');
    setBusy(withNetwork);
    collectDevice(check);
    if (!withNetwork) {
      status.textContent = 'Browser details are ready. No IP lookup was requested.';
      return;
    }
    if (Date.now() < lookupBlockedUntil) {
      networkState = 'limited';
      resetNetwork('Temporarily unavailable');
      setText('details-badge', 'BROWSER DETAILS READY');
      setText('details-network-status', 'The lookup provider is at its limit. Try later.');
      status.textContent = 'Browser details are ready. The network provider has asked us to wait before trying again.';
      setBusy(false);
      return;
    }
    status.textContent = 'Browser details are ready. Checking your public IP and network…';
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
      ['ip', 'provider', 'location', 'organization', 'asn'].forEach(key => setText('detail-' + key, currentNetwork[key]));
      setText('detail-ip-note', currentNetwork.type + ' · Seen by the lookup service');
      setText('detail-provider-note', currentNetwork.providerNote);
      setText('details-badge', 'VISIBLE TO THIS CHECK');
      const checkedAt = safely(() => new Date().toLocaleTimeString(undefined, {
        hour: 'numeric', minute: '2-digit'
      }), '');
      setText('details-network-status', (checkedAt ? 'Checked at ' + checkedAt : 'Checked just now') + ' · IPWHOIS.io');
      networkState = 'ready';
      renderInsight();
      status.textContent = 'Your network and browser details are ready. Location is an IP estimate.';
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
    networkState = 'idle';
    results.hidden = true;
    results.setAttribute('aria-busy', 'false');
    valueIds.forEach(key => setText('detail-' + key, unavailable));
    ['ip', 'provider', 'device', 'browser', 'os'].forEach(key => setText('detail-' + key + '-note', ''));
    setText('details-insight', '');
    setText('details-network-status', '');
    setText('details-badge', 'LIVE CONNECTION CHECK');
    button.disabled = false;
    localButton.disabled = false;
    button.textContent = 'Reveal my information';
    button.setAttribute('aria-expanded', 'false');
    localButton.setAttribute('aria-expanded', 'false');
    clearButton.hidden = true;
    status.textContent = announce ? 'Results have been cleared from this page.' : '';
    if (announce) button.focus({ preventScroll: true });
  }
  button.hidden = false;
  localButton.hidden = false;
  button.addEventListener('click', () => { void runCheck(true); });
  localButton.addEventListener('click', () => { void runCheck(false); });
  clearButton.addEventListener('click', () => clearResults(true));
  window.addEventListener('pagehide', () => clearResults(false));
  window.addEventListener('offline', () => {
    if (results.hidden || networkState === 'local' || networkState === 'idle') return;
    ++sequence;
    stopRequest();
    networkState = 'unavailable';
    resetNetwork('Offline');
    setText('details-badge', 'BROWSER DETAILS READY');
    setText('details-network-status', 'You appear to be offline. Run again after reconnecting.');
    status.textContent = 'Network details cleared because the browser went offline.';
    setBusy(false);
    renderInsight();
  });
})();

