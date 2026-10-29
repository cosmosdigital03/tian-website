(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./connection-network.js'));
  else root.TianConnectionPrivacy = factory(root.TianConnectionNetwork);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (networkTools) {
  'use strict';

  // Public exit addresses only. Verified against the current TIAN app inventory
  // on 2026-10-19. Renew only after rechecking ownership and active exit roles.
  // Expiration prevents a reassigned cloud address being called a TIAN exit.
  // A match identifies the visible exit for this check, not a verified session.
  const tianExits = Object.freeze({
    checkedAt: '2026-10-19', expiresAt: '2026-11-18',
    ipv4: Object.freeze(['159.203.181.31', '15.216.27.87'])
  });
  const ownerNote = 'The network owner and the VPN or relay brand can be different companies.';
  // Only explicit service names qualify. Hosting, reseller, parent-company,
  // and transit names (including M247, Datacamp, and Proton AG) do not.
  const vpnNames = [
    [/^Surfshark(?: VPN)?$/i, 'Surfshark'],
    [/^Mullvad(?: VPN)?$/i, 'Mullvad VPN'], [/^Proton\s?VPN$/i, 'Proton VPN'],
    [/^ExpressVPN$/i, 'ExpressVPN'], [/^Private Internet Access$/i, 'Private Internet Access'],
    [/^IVPN$/i, 'IVPN'], [/^Windscribe(?: VPN)?$/i, 'Windscribe'],
    [/^TunnelBear(?: VPN)?$/i, 'TunnelBear'], [/^IPVanish(?: VPN)?$/i, 'IPVanish'],
    [/^CyberGhost(?: VPN)?$/i, 'CyberGhost VPN']
  ];

  function read(source, key) {
    try { return source == null ? undefined : source[key]; }
    catch (_) { return undefined; }
  }
  function text(value, limit) {
    return typeof value === 'string' ? value.slice(0, limit || 120).trim() : '';
  }
  function parseIPv4(value) {
    if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) return null;
    const chunks = value.split('.');
    if (chunks.some(function (part) { return (part.length > 1 && part[0] === '0') || Number(part) > 255; })) return null;
    return chunks.map(Number);
  }
  function parseIP(value) {
    value = text(value, 64);
    const v4 = parseIPv4(value);
    if (v4) return { family: 4, bytes: v4, mapped: null };
    if (!value.includes(':') || !/^[a-f\d:.]+$/i.test(value)) return null;
    if (value.includes('.')) {
      const lastColon = value.lastIndexOf(':');
      const tail = parseIPv4(value.slice(lastColon + 1));
      if (!tail) return null;
      value = value.slice(0, lastColon + 1) + ((tail[0] << 8) | tail[1]).toString(16) + ':' + ((tail[2] << 8) | tail[3]).toString(16);
    }
    const compressed = value.split('::');
    if (compressed.length > 2) return null;
    const left = compressed[0] ? compressed[0].split(':') : [];
    const right = compressed.length === 2 && compressed[1] ? compressed[1].split(':') : [];
    if (left.concat(right).some(function (part) { return !/^[a-f\d]{1,4}$/i.test(part); })) return null;
    let words;
    if (compressed.length === 1) {
      if (left.length !== 8) return null;
      words = left;
    } else {
      const gap = 8 - left.length - right.length;
      if (gap < 1) return null;
      words = left.concat(Array(gap).fill('0'), right);
    }
    const bytes = [];
    for (const word of words) {
      const number = parseInt(word, 16);
      bytes.push(number >> 8, number & 255);
    }
    const mapped = bytes.slice(0, 10).every(function (part) { return part === 0; }) && bytes[10] === 255 && bytes[11] === 255;
    return { family: 6, bytes: bytes, mapped: mapped ? bytes.slice(12) : null };
  }
  function publicAddress(ip) {
    const bytes = ip.family === 4 ? ip.bytes : ip.mapped;
    if (bytes) return bytes[0] > 0 && bytes[0] < 224 && bytes[0] !== 10 && bytes[0] !== 127 &&
      !(bytes[0] === 169 && bytes[1] === 254) && !(bytes[0] === 172 && bytes[1] >= 16 && bytes[1] <= 31) &&
      !(bytes[0] === 192 && bytes[1] === 168);
    return !ip.bytes.every(function (part) { return part === 0; }) &&
      !(ip.bytes.slice(0, 15).every(function (part) { return part === 0; }) && ip.bytes[15] === 1) &&
      (ip.bytes[0] & 254) !== 252 && ip.bytes[0] !== 255 && !(ip.bytes[0] === 254 && (ip.bytes[1] & 192) === 128);
  }
  function parseCIDR(value, expectedFamily) {
    if (typeof value !== 'string' || value.length > 64) return null;
    const parts = value.split('/');
    if (parts.length !== 2 || !/^\d{1,3}$/.test(parts[1])) return null;
    const ip = parseIP(parts[0]);
    const prefix = Number(parts[1]);
    if (!ip || ip.family !== expectedFamily || prefix < 1 || prefix > (ip.family === 4 ? 32 : 128)) return null;
    return { ip: ip, prefix: prefix };
  }
  function prefixMatch(bytes, network, prefix) {
    if (bytes.length !== network.length) return false;
    const whole = Math.floor(prefix / 8);
    for (let i = 0; i < whole; i += 1) if (bytes[i] !== network[i]) return false;
    const remainder = prefix % 8;
    return !remainder || (bytes[whole] >> (8 - remainder)) === (network[whole] >> (8 - remainder));
  }
  function inCIDR(ip, range) {
    if (ip.family === range.ip.family && prefixMatch(ip.bytes, range.ip.bytes, range.prefix)) return true;
    if (ip.mapped && range.ip.family === 4) return prefixMatch(ip.mapped, range.ip.bytes, range.prefix);
    if (ip.family === 4 && range.ip.mapped && range.prefix >= 96) return prefixMatch(ip.bytes, range.ip.mapped, range.prefix - 96);
    return false;
  }
  function timestamp(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    if (value instanceof Date) return value.getTime();
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(value)) return NaN;
    const number = Date.parse(value);
    if (!Number.isFinite(number) || new Date(number).toISOString().slice(0, 10) !== value.slice(0, 10)) return NaN;
    return number;
  }
  function currentPeriod(start, end, now) {
    const first = timestamp(start);
    const last = timestamp(end);
    return Number.isFinite(now) && Number.isFinite(first) && Number.isFinite(last) && first < last && now >= first && now < last;
  }
  function relayMatch(ip, data, now) {
    if (!currentPeriod(read(data, 'updatedAt'), read(data, 'expiresAt'), now)) return false;
    const v4 = read(data, 'ipv4');
    const v6 = read(data, 'ipv6');
    if (!Array.isArray(v4) || !Array.isArray(v6) || v4.length + v6.length > 50000 || v4.length + v6.length === 0) return false;
    let matched = false;
    // Validate the complete supplied snapshot before accepting any match.
    // A malformed family or CIDR invalidates the snapshot rather than making
    // an unsupported positive claim from partially valid data.
    for (const pair of [[v4, 4], [v6, 6]]) {
      for (const cidr of pair[0]) {
        const range = parseCIDR(cidr, pair[1]);
        if (!range) return false;
        if (!matched && inCIDR(ip, range)) matched = true;
      }
    }
    return matched;
  }
  function networkNames(network) {
    return [read(network, 'rawProvider'), read(network, 'organization'), read(network, 'provider')]
      .map(function (name) { return text(name); }).filter(function (name) { return name && name !== 'Not identified'; });
  }
  function serviceName(name) {
    // Permit ordinary legal suffixes, but not arbitrary reseller descriptions.
    return name.replace(/(?:,?\s+(?:Inc\.?|LLC|Ltd\.?|Limited|AB|GmbH|S\.A\.?|B\.V\.?))+$/i, '').trim();
  }
  function result(kind, label, summary, routeValue, routeNote, networkType, evidence, tone) {
    return { kind: kind, label: label, summary: summary, routeValue: routeValue, routeNote: routeNote, networkType: networkType, evidence: evidence, tone: tone };
  }
  function unknown() {
    return result('unknown', 'Connection type not identified',
      'This lookup could not reliably identify a VPN, relay, or access network. The IP alone cannot establish your connection’s privacy protections.',
      'Public IP address', ownerNote, 'Not determined', 'No supported VPN, relay, or network-owner evidence was found.', 'neutral');
  }
  function classify(network, options) {
    try {
      const ip = parseIP(read(network, 'ip'));
      if (!ip || !publicAddress(ip)) return unknown();
      const suppliedNow = read(options, 'now');
      const now = suppliedNow === undefined ? Date.now() : timestamp(suppliedNow);
      const v4 = ip.family === 4 ? ip.bytes : ip.mapped;
      if (v4 && currentPeriod(tianExits.checkedAt, tianExits.expiresAt, now) && tianExits.ipv4.includes(v4.join('.'))) {
        return result('tian', 'TIAN exit detected',
          'The IP seen by this check matches a known TIAN exit. A VPN can change your public IP while browser details remain visible.',
          'TIAN exit', 'This matches a configured exit address; it does not verify encryption, DNS, or every app. ' + ownerNote, 'Known VPN exit',
          'Exact configured TIAN exit match. List checked ' + tianExits.checkedAt + '; expires ' + tianExits.expiresAt + '.', 'positive');
      }
      const names = networkNames(network);
      let appleRange = false;
      try { appleRange = relayMatch(ip, read(options, 'relayRanges'), now); }
      catch (_) { /* An unavailable or malformed optional snapshot is not evidence. */ }
      const appleName = names.some(function (name) { return /^(?:Apple\s+)?iCloud Private Relay$/i.test(serviceName(name)); });
      if (appleRange || appleName) {
        return result('private-relay', 'iCloud Private Relay detected',
          appleRange
            ? 'This IP matches Apple’s published iCloud Private Relay exit ranges. It identifies a relay for this request; it does not establish protection for every app or connection.'
            : 'The network lookup explicitly identifies iCloud Private Relay. It describes this request’s visible network; it does not establish protection for every app or connection.',
          'iCloud Private Relay exit', 'Private Relay can use a partner network. ' + ownerNote, 'Privacy relay',
          appleRange ? 'Matched Apple’s published exit ranges in the current local snapshot.' : 'The network lookup explicitly names iCloud Private Relay.', 'positive');
      }
      if (names.some(function (name) { return name === 'VPN-labeled network'; })) {
        return result('vpn-reported', 'VPN-labeled network reported',
          'The lookup returned a name containing VPN. This alone does not establish whether a VPN is active or what protection it provides.',
          'VPN-labeled network', 'This lookup does not verify encryption, DNS, or traffic from other apps. ' + ownerNote,
          'Not determined', 'The lookup included VPN in a network name; this is not verification of a VPN connection.', 'neutral');
      }
      for (const name of names) {
        const entry = vpnNames.find(function (item) { return item[0].test(serviceName(name)); });
        if (entry) return result('vpn', entry[1] + ' detected',
          'The lookup identifies ' + entry[1] + ' for the IP seen by this check. Browser details can still be visible while using a VPN.',
          entry[1] + ' address', 'The lookup names a VPN service; it does not verify encryption, DNS, or every app. ' + ownerNote, 'VPN service reported', 'The lookup explicitly names ' + name + '; a hosting company name alone would not identify this VPN.', 'positive');
      }
      const owner = networkTools && typeof networkTools.identify === 'function' ? networkTools.identify(network) : { networkType: 'unknown', evidence: '' };
      if (owner.networkType === 'hosting') return result('hosting', 'Server IP detected',
        'This IP is associated with ' + owner.provider + '. A VPN, proxy, or another server-based connection may explain this address. The IP alone cannot confirm a VPN.',
        'Server address', ownerNote, 'Cloud / hosting network', owner.evidence, 'neutral');
      if (owner.networkType === 'mobile') return result('mobile', 'Mobile provider detected',
        'The visible IP is associated with a mobile network operator, which may also provide fixed wireless internet. This lookup cannot determine which privacy tools are active.',
        'Mobile provider address', 'A network name does not identify your device, billing account, or whether this is cellular service.',
        'Mobile / fixed wireless provider', owner.evidence, 'neutral');
      if (owner.networkType === 'access') return result('access', 'Internet provider detected',
        'The visible IP is associated with an internet access provider. An IP lookup alone cannot determine whether you use a VPN or other privacy protections.',
        'Internet provider address', 'The network name does not identify your billing account or establish whether a VPN is active.',
        'Internet access provider', owner.evidence, 'neutral');
      return unknown();
    } catch (_) { return unknown(); }
  }
  return { classify: classify };
});

