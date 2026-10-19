'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize } = require('../connection-network.js');
const { classify } = require('../connection-privacy.js');

const now = '2026-10-19T20:00:00Z';
function network(ip = '198.51.100.42', connection = {}) {
  return normalize({ success: true, ip, connection });
}
function classifyAt(value, options = {}) { return classify(value, Object.assign({ now }, options)); }
function appleRanges(overrides = {}) {
  return Object.assign({
    updatedAt: '2026-10-19T19:00:00Z', expiresAt: '2026-11-18T19:00:00Z',
    ipv4: ['198.51.100.32/27'], ipv6: ['2001:db8:1234:5678:ab80::/73', '2001:db8:feed::/48']
  }, overrides);
}

test('both configured TIAN exits match exactly and carry a bounded claim', () => {
  for (const [ip, asn] of [['159.203.181.31', 14061], ['15.216.27.87', 16509]]) {
    const result = classifyAt(network(ip, { asn }));
    assert.equal(result.kind, 'tian');
    assert.equal(result.label, 'TIAN exit detected');
    assert.equal(result.tone, 'positive');
    assert.match(result.summary, /matches a known TIAN exit/);
    assert.match(result.summary, /browser details remain visible/);
    assert.match(result.routeNote, /does not verify encryption, DNS, or every app/);
    assert.match(result.evidence, /2026-10-19/);
    assert.match(result.evidence, /2026-11-18/);
  }
});

test('nearby addresses and the TIAN entry are not called TIAN exits', () => {
  for (const [ip, asn] of [['159.203.181.32', 14061], ['15.216.27.88', 16509], ['174.138.94.168', 14061]]) {
    const result = classifyAt(network(ip, { asn }));
    assert.equal(result.kind, 'hosting');
    assert.equal(result.label, 'Server IP detected');
    assert.doesNotMatch(result.label, /TIAN|VPN/);
  }
});

test('a stale, future or invalid time cannot keep a configured exit positively identified', () => {
  const exit = network('159.203.181.31', { asn: 14061 });
  for (const date of ['2026-10-18T23:59:59Z', '2026-11-18T00:00:00Z', '2027-01-01T00:00:00Z', 'not a date', NaN]) {
    assert.equal(classify(exit, { now: date }).kind, 'hosting');
  }
  assert.equal(classify(exit, { now: '2026-10-19T00:00:00Z' }).kind, 'tian');
  assert.equal(classify(exit, { now: Date.parse(now) }).kind, 'tian');
  assert.equal(classify(exit, { now: new Date(now) }).kind, 'tian');
});

test('IPv4-mapped representations identify the same configured TIAN exit', () => {
  for (const ip of ['::ffff:159.203.181.31', '0:0:0:0:0:ffff:9fcb:b51f']) {
    assert.equal(classifyAt(network(ip, { asn: 14061 })).kind, 'tian');
  }
});

test('AWS and DigitalOcean alone are server evidence, never VPN proof', () => {
  for (const connection of [{ asn: 16509 }, { asn: 14618 }, { asn: 14061 }, { isp: 'Amazon Technologies Inc.' }, { isp: 'DigitalOcean, LLC' }]) {
    const result = classifyAt(network('198.51.100.42', connection));
    assert.equal(result.kind, 'hosting');
    assert.equal(result.tone, 'neutral');
    assert.match(result.summary, /^This IP is associated with (?:Amazon Web Services \(AWS\)|DigitalOcean)\./);
    assert.match(result.summary, /A VPN, proxy, or another server-based connection may explain this address\. The IP alone cannot confirm a VPN\./);
    assert.equal(result.routeValue, 'Server address');
    assert.match(result.routeNote, /network owner.*VPN or relay brand/i);
  }
});

test('explicit non-TIAN VPN names receive the same positive tone and claim limits as TIAN', () => {
  const tian = classifyAt(network('159.203.181.31', { asn: 14061 }));
  for (const [name, label] of [['NordVPN', 'NordVPN'], ['Mullvad VPN AB', 'Mullvad VPN'], ['Proton VPN', 'Proton VPN'], ['Private Internet Access, Inc.', 'Private Internet Access'], ['Surfshark', 'Surfshark']]) {
    const result = classifyAt(network('198.51.100.42', { isp: 'Amazon.com, Inc.', org: name, asn: 16509 }));
    assert.equal(result.kind, 'vpn');
    assert.equal(result.label, label + ' detected');
    assert.equal(result.tone, tian.tone);
    assert.match(result.summary, /Browser details can still be visible while using a VPN/);
    assert.match(result.routeNote, /does not verify encryption, DNS, or every app/);
    assert.match(result.routeNote, /different companies/);
  }
});

test('generic hosting, reseller or parent-company names do not identify a specific VPN', () => {
  for (const name of ['M247', 'Datacamp Limited', 'Proton AG', 'Tefincom S.A.', 'NordVPN reseller', 'VPN Services LLC', 'Apple Inc.', 'Cloudflare, Inc.', 'TIAN']) {
    const result = classifyAt(network('198.51.100.42', { isp: name }));
    assert.equal(result.kind, 'unknown', name);
    assert.equal(result.tone, 'neutral');
  }
});

test('residential/business and mobile provider evidence never becomes an unprotected verdict', () => {
  for (const [isp, kind] of [['Charter Communications Inc', 'access'], ['Comcast Business', 'access'], ['AT&T Services, Inc.', 'access'], ['T-Mobile USA, Inc.', 'mobile'], ['Verizon Wireless', 'mobile']]) {
    const result = classifyAt(network('198.51.100.42', { isp }));
    assert.equal(result.kind, kind);
    assert.equal(result.tone, 'neutral');
    assert.doesNotMatch(JSON.stringify(result), /unprotected|partially protected|risk.?score|\d+%/i);
    assert.match(result.summary, /cannot determine/);
  }
});

test('a fresh official IPv4 relay range takes precedence over a hosting owner, with correct prefix boundaries', () => {
  const options = { relayRanges: appleRanges() };
  for (const ip of ['198.51.100.32', '198.51.100.42', '198.51.100.63']) {
    const result = classifyAt(network(ip, { asn: 16509 }), options);
    assert.equal(result.kind, 'private-relay');
    assert.equal(result.tone, 'positive');
    assert.match(result.summary, /Apple’s published/);
  }
  for (const ip of ['198.51.100.31', '198.51.100.64', '198.51.101.42']) {
    assert.equal(classifyAt(network(ip, { asn: 16509 }), options).kind, 'hosting');
  }
});

test('IPv6 compressed and expanded addresses respect ranges with non-byte prefix lengths', () => {
  const options = { relayRanges: appleRanges() };
  for (const ip of ['2001:db8:feed::1', '2001:0db8:feed:0000:0000:0000:0000:0001', '2001:db8:1234:5678:abff:ffff:ffff:ffff', '2001:db8:1234:5678:ab80::']) {
    assert.equal(classifyAt(network(ip), options).kind, 'private-relay', ip);
  }
  for (const ip of ['2001:db8:feee::1', '2001:db8:1234:5678:ab7f:ffff:ffff:ffff', '2001:db8:1234:5678:ac00::']) {
    assert.equal(classifyAt(network(ip), options).kind, 'unknown', ip);
  }
});

test('IPv4-mapped IPv6 works with both IPv4 and mapped-IPv6 CIDRs', () => {
  for (const ip of ['::ffff:198.51.100.42', '0:0:0:0:0:ffff:c633:642a']) {
    assert.equal(classifyAt(network(ip), { relayRanges: appleRanges() }).kind, 'private-relay');
  }
  const mappedRange = appleRanges({ ipv4: [], ipv6: ['::ffff:198.51.100.32/123'] });
  assert.equal(classifyAt(network('198.51.100.42'), { relayRanges: mappedRange }).kind, 'private-relay');
  assert.equal(classifyAt(network('198.51.100.64'), { relayRanges: mappedRange }).kind, 'unknown');
});

test('stale, future or malformed relay snapshots cannot create a positive CIDR claim', () => {
  const address = network('198.51.100.42', { asn: 16509 });
  const invalid = [
    appleRanges({ expiresAt: now }), appleRanges({ updatedAt: '2026-10-20T00:00:00Z' }),
    appleRanges({ expiresAt: '2026-02-30' }), appleRanges({ updatedAt: 'yesterday' }),
    appleRanges({ ipv4: '198.51.100.32/27' }), appleRanges({ ipv6: null }),
    appleRanges({ ipv4: ['198.51.100.32/27', 'garbage'] }),
    appleRanges({ ipv6: ['2001:db8::/129'] }), appleRanges({ ipv4: ['198.51.100.0/33'] }),
    appleRanges({ ipv4: ['0.0.0.0/0'] }), appleRanges({ ipv4: ['2001:db8::/32'] }),
    appleRanges({ ipv6: ['198.51.100.0/24'] }), appleRanges({ ipv6: ['2001:db8:::1/64'] })
  ];
  for (const relayRanges of invalid) {
    assert.equal(classifyAt(address, { relayRanges }).kind, 'hosting');
  }
});

test('an explicit iCloud Private Relay lookup name is separate evidence from the optional snapshot', () => {
  const address = network('198.51.100.100', { isp: 'Cloudflare, Inc.', org: 'iCloud Private Relay', asn: 13335 });
  const result = classifyAt(address, { relayRanges: appleRanges({ expiresAt: '2026-10-01' }) });
  assert.equal(result.kind, 'private-relay');
  assert.match(result.evidence, /lookup explicitly names/);
  assert.doesNotMatch(result.evidence, /published exit ranges/);
});

test('an exact TIAN exit takes precedence over optional relay data or a service name', () => {
  const relayRanges = appleRanges({ ipv4: ['159.203.181.31/32'] });
  const result = classifyAt(network('159.203.181.31', { org: 'Mullvad VPN' }), { relayRanges });
  assert.equal(result.kind, 'tian');
});

test('missing evidence and flags that this API does not provide remain neutral', () => {
  for (const input of [null, {}, { ip: '198.51.100.42' }, { ip: '198.51.100.42', networkType: 'vpn', is_vpn: true, risk_score: 100 }, { ip: '198.51.100.42', is_vpn: false, risk_score: 0 }]) {
    const result = classifyAt(input);
    assert.equal(result.kind, 'unknown');
    assert.equal(result.tone, 'neutral');
    assert.deepEqual(Object.keys(result).sort(), ['kind', 'label', 'summary', 'routeValue', 'routeNote', 'networkType', 'evidence', 'tone'].sort());
    assert.ok(Object.values(result).every(value => typeof value === 'string'));
  }
});

test('invalid/private addresses and blocked getters never throw or produce a positive finding', () => {
  const blocked = new Proxy({}, { get() { throw new Error('blocked'); } });
  for (const input of [blocked, { ip: '999.51.100.42', organization: 'Mullvad VPN' }, { ip: '198.51.100.42.evil', organization: 'Mullvad VPN' }, { ip: '192.168.1.1', organization: 'Mullvad VPN' }, { ip: '::1', organization: 'Mullvad VPN' }, { ip: '::ffff:127.0.0.1', organization: 'Mullvad VPN' }]) {
    assert.doesNotThrow(() => classifyAt(input));
    assert.equal(classifyAt(input).kind, 'unknown');
  }
  assert.equal(classifyAt(network(), { relayRanges: blocked }).kind, 'unknown');
});

test('browser exports use only supplied data and perform no API reads, requests or storage writes', () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const context = {
    get navigator() { throw new Error('must not read navigator'); },
    get localStorage() { throw new Error('must not read storage'); },
    fetch() { throw new Error('must not fetch'); }
  };
  vm.createContext(context);
  for (const file of ['../connection-network.js', '../connection-privacy.js']) {
    vm.runInContext(fs.readFileSync(require.resolve(file), 'utf8'), context);
  }
  assert.equal(typeof context.TianConnectionPrivacy.classify, 'function');
  assert.equal(context.TianConnectionPrivacy.classify({ ip: '159.203.181.31' }, { now }).kind, 'tian');
});
