(() => {
  'use strict';
  const button = document.getElementById('details-toggle');
  const panel = document.getElementById('browser-details');
  const status = document.getElementById('details-status');
  if (!button || !panel || !status) return;

  // Read basic browser-provided values only after an explicit click.
  // No requests, persistence, identifiers, high-entropy hints, or geolocation.
  const unavailable = 'Unavailable';
  function safely(read) {
    try { const value = read(); return value ? String(value) : unavailable; }
    catch (_) { return unavailable; }
  }
  function describeBrowser(ua) {
    if (/Edg(?:e|A|iOS)?\//.test(ua)) return 'Microsoft Edge';
    if (/OPR\//.test(ua) || /OPiOS\//.test(ua)) return 'Opera';
    if (/Firefox\//.test(ua) || /FxiOS\//.test(ua)) return 'Firefox';
    if (/Chrome\//.test(ua) || /CriOS\//.test(ua)) return 'Chrome or Chromium-based';
    if (/Safari\//.test(ua) && /Version\//.test(ua)) return 'Safari';
    return 'Not identified';
  }
  function describeOS(ua) {
    if (/iPhone|iPad|iPod/.test(ua)) return 'iOS / iPadOS';
    if (/Android/.test(ua)) return 'Android';
    if (/Windows/.test(ua)) return 'Windows';
    if (/CrOS/.test(ua)) return 'ChromeOS';
    if (/Macintosh|Mac OS X/.test(ua)) return 'macOS or iPadOS';
    if (/Linux/.test(ua)) return 'Linux';
    return 'Not identified';
  }
  function reveal() {
    const ua = safely(() => navigator.userAgent);
    const values = {
      browser: ua === unavailable ? unavailable : describeBrowser(ua),
      device: ua === unavailable ? unavailable : (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? 'Tablet (estimated)' : /Mobile|iPhone|iPod/.test(ua) ? 'Mobile (estimated)' : 'Desktop / other (estimated)'),
      os: ua === unavailable ? unavailable : describeOS(ua),
      screen: safely(() => screen.width > 0 && screen.height > 0 ? screen.width + ' × ' + screen.height : ''),
      language: safely(() => navigator.language),
      timezone: safely(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
    };
    Object.entries(values).forEach(([key, value]) => {
      const target = document.getElementById('detail-' + key);
      if (target) target.textContent = value;
    });
  }
  button.hidden = false;
  button.addEventListener('click', () => {
    const expanded = button.getAttribute('aria-expanded') !== 'true';
    if (expanded) reveal();
    else panel.querySelectorAll('dd').forEach(field => { field.textContent = unavailable; });
    panel.hidden = !expanded;
    button.setAttribute('aria-expanded', String(expanded));
    button.textContent = expanded ? 'Hide browser details' : 'Show browser details';
    status.textContent = expanded ? 'Basic browser details are shown below. Values may be approximate.' : 'Browser details hidden and cleared.';
  });
})();
