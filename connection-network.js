(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TianConnectionNetwork = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Registry names stay visible alongside familiar consumer brands.
  // The visible network is not necessarily the visitor's billing provider.
  const aliases = [
    [/^(?:Charter Communications|Time Warner Cable|Bright House Networks)\b/i, 'Spectrum (Charter)'],
    [/^T[\s-]?Mobile(?:\s+USA|\s+US\b|,\s*USA)/i, 'T-Mobile'],
    [/^Comcast(?:\s+Cable)?\b/i, 'Comcast'],
    [/^AT&T\b/i, 'AT&T'],
    [/^Verizon\b/i, 'Verizon'],
    [/^Cox Communications\b/i, 'Cox']
  ];
  function clean(value, max) {
    return typeof value === 'string'
      ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max || 120) : '';
  }
  function validIP(value) {
    if (value.length > 45) return false;
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) {
      const parts = value.split('.').map(Number);
      return parts.every(function (part) { return part >= 0 && part <= 255; }) &&
        parts[0] !== 0 && parts[0] !== 127 && parts[0] < 224 &&
        parts[0] !== 10 && !(parts[0] === 192 && parts[1] === 168) &&
        !(parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) &&
        !(parts[0] === 169 && parts[1] === 254);
    }
    if (!/^[a-f\d:.]+$/i.test(value) || !value.includes(':')) return false;
    try {
      const address = new URL('https://[' + value + ']/').hostname.slice(1, -1);
      const mapped = /^::ffff:([a-f\d]{1,4}):([a-f\d]{1,4})$/i.exec(address);
      if (mapped) {
        const high = parseInt(mapped[1], 16);
        const low = parseInt(mapped[2], 16);
        return validIP([high >> 8, high & 255, low >> 8, low & 255].join('.'));
      }
      return address !== '::' && address !== '::1' &&
        !/^(?:fc|fd|ff|fe[89ab])/i.test(address);
    } catch (_) { return false; }
  }
  function normalize(data) {
    if (!data || data.success !== true) throw new Error('Network lookup unavailable');
    const ip = clean(data.ip, 60);
    if (!validIP(ip)) throw new Error('Network lookup unavailable');
    const connection = data.connection && typeof data.connection === 'object' ? data.connection : {};
    const isp = clean(connection.isp);
    const organization = clean(connection.org);
    const rawProvider = isp || organization;
    const alias = aliases.find(function (entry) { return entry[0].test(rawProvider); });
    const provider = alias ? alias[1] : rawProvider;
    const asnValue = typeof connection.asn === 'string' && /^\d+$/.test(connection.asn)
      ? Number(connection.asn) : connection.asn;
    const asn = Number.isInteger(asnValue) && asnValue > 0 && asnValue <= 4294967295
      ? 'AS' + asnValue : '';
    const locationParts = [data.city, data.region, data.country].map(function (value) {
      return clean(value, 80);
    }).filter(function (value, index, all) {
      return value && all.indexOf(value) === index;
    });
    return {
      ip: ip, type: ip.includes(':') ? 'IPv6' : 'IPv4',
      provider: provider || 'Not identified',
      providerNote: rawProvider && provider !== rawProvider
        ? 'Listed as ' + rawProvider : 'Network associated with the visible IP',
      organization: organization || 'Not identified', asn: asn || 'Not supplied',
      location: locationParts.join(', ') || 'Not identified',
      hasProvider: Boolean(rawProvider), hasLocation: locationParts.length > 0
    };
  }
  return { normalize: normalize };
});
