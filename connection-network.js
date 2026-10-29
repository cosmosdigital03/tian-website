(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TianConnectionNetwork = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Registry names stay visible alongside familiar consumer and server brands.
  // The visible network is not necessarily the visitor's billing provider.
  const aliases = [
    [/^(?:Charter Communications|Time Warner Cable|Bright House Networks)\b/i, 'Spectrum (Charter)'],
    [/^Spectrum(?:\s*\(Charter\))?$/i, 'Spectrum (Charter)'],
    [/^T[\s-]?Mobile(?:\s+USA|\s+US\b|,\s*USA)/i, 'T-Mobile'],
    [/^T[\s-]?Mobile$/i, 'T-Mobile'],
    [/^Comcast(?:\s+Cable)?\b/i, 'Comcast'],
    [/^AT&T\b/i, 'AT&T'],
    [/^Verizon\b/i, 'Verizon'],
    [/^Cox Communications\b/i, 'Cox']
  ];
  // Checked 2026-10-19. These identify network operators, never VPN brands.
  // ARIN: https://whois.arin.net/rest/asn/AS14061.html (DigitalOcean)
  // ARIN: https://whois.arin.net/rest/asn/AS14618.html (Amazon.com)
  // AWS identifies 16509 and 14618 as Amazon ASNs:
  // https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_ProvisionByoipCidr.html
  // Keep this deliberately narrow; unfamiliar ASNs are not classified as servers.
  const hostingASNs = { 14061: 'DigitalOcean', 14618: 'Amazon Web Services (AWS)', 16509: 'Amazon Web Services (AWS)' };
  const hostingNames = [
    [/^DigitalOcean(?:\s|,|$)/i, 'DigitalOcean'],
    [/^(?:Amazon\.com|Amazon Technologies|Amazon Web Services|Amazon Data Services)(?:\s|,|\.|$)/i, 'Amazon Web Services (AWS)'],
    [/^AWS(?:\s|,|$)/i, 'Amazon Web Services (AWS)']
  ];
  function clean(value, max) {
    if (typeof value !== 'string') return '';
    return value.slice(0, max || 120).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g, '').trim();
  }
  function providerText(value) {
    const valueText = clean(value);
    // Do not display this provider's name if a lookup returns it.
    // A VPN-labeled result is still only a report, not verified protection.
    if (/^NordVPN(?:,?\s+(?:Inc\.?|LLC|Ltd\.?|Limited|AB|GmbH|S\.A\.?|B\.V\.?))*$/i.test(valueText)) return 'VPN-labeled network';
    return /nord/i.test(valueText) ? 'Network name withheld' : valueText;
  }
  function read(source, key) {
    try { return source == null ? undefined : source[key]; }
    catch (_) { return undefined; }
  }
  function numberASN(value) {
    if (typeof value === 'string' && /^(?:AS)?\d{1,10}$/i.test(value)) value = Number(value.replace(/^AS/i, ''));
    return Number.isInteger(value) && value > 0 && value <= 4294967295 ? value : null;
  }
  function identify(network) {
    const numeric = numberASN(read(network, 'asnNumber')) || numberASN(read(network, 'asn'));
    const rawProvider = providerText(read(network, 'rawProvider')) || providerText(read(network, 'provider'));
    const organization = providerText(read(network, 'organization'));
    const names = [rawProvider, organization].filter(function (name) { return name && name !== 'Not identified'; });
    const hostByASN = Object.prototype.hasOwnProperty.call(hostingASNs, numeric) ? hostingASNs[numeric] : '';
    if (hostByASN) return {
      provider: hostByASN, networkType: 'hosting',
      evidence: 'AS' + numeric + ' is a known ' + hostByASN + ' network.'
    };
    for (const name of names) {
      const host = hostingNames.find(function (entry) { return entry[0].test(name); });
      if (host) return { provider: host[1], networkType: 'hosting', evidence: 'The network lookup names ' + name + ', a known cloud provider.' };
    }
    for (const name of names) {
      if (/^T[\s-]?Mobile(?:\s+USA|\s+US\b|,\s*USA|$)/i.test(name) || /^(?:Verizon Wireless|Cellco Partnership)\b/i.test(name)) {
        return {
          provider: /^T[\s-]?Mobile/i.test(name) ? 'T-Mobile' : 'Verizon', networkType: 'mobile',
          evidence: 'The lookup names a mobile network operator; its fixed wireless services can use the same network.'
        };
      }
    }
    for (const name of names) {
      const alias = aliases.find(function (entry) { return entry[0].test(name); });
      if (alias) return {
        provider: alias[1], networkType: 'access',
        evidence: 'The lookup names ' + name + ', an internet access provider; the specific service is not identified.'
      };
    }
    return { provider: '', networkType: 'unknown', evidence: '' };
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
    const isp = providerText(connection.isp);
    const organization = providerText(connection.org);
    const rawProvider = isp || organization;
    const asnValue = numberASN(connection.asn);
    const asn = asnValue ? 'AS' + asnValue : '';
    const owner = identify({ rawProvider: rawProvider, organization: organization, asnNumber: asnValue });
    const alias = aliases.find(function (entry) { return entry[0].test(rawProvider); });
    const provider = owner.networkType === 'hosting' ? owner.provider : alias ? alias[1] : rawProvider || owner.provider;
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
      rawProvider: rawProvider, asnNumber: asnValue,
      networkType: owner.networkType, networkEvidence: owner.evidence,
      location: locationParts.join(', ') || 'Not identified',
      hasProvider: Boolean(provider), hasLocation: locationParts.length > 0
    };
  }
  return { normalize: normalize, identify: identify };
});

