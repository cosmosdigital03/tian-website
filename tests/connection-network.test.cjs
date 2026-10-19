'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize } = require('../connection-network.js');

function response(overrides = {}) {
  return Object.assign({
    success: true, ip: '198.51.100.42', city: 'Orlando', region: 'Florida', country: 'United States',
    connection: { isp: 'Charter Communications Inc', org: 'Charter Communications', asn: 33363 }
  }, overrides);
}

test('Spectrum keeps the original registry name and network owner', () => {
  const result = normalize(response());
  assert.equal(result.provider, 'Spectrum (Charter)');
  assert.equal(result.providerNote, 'Listed as Charter Communications Inc');
  assert.equal(result.organization, 'Charter Communications');
  assert.equal(result.asn, 'AS33363');
  assert.equal(result.location, 'Orlando, Florida, United States');
});
test('T-Mobile and Comcast Business are not confused with server or residential product claims', () => {
  assert.equal(normalize(response({ connection: { isp: 'T-Mobile USA, Inc.', asn: '21928' } })).provider, 'T-Mobile');
  const business = normalize(response({ connection: { isp: 'Comcast Business' } }));
  assert.equal(business.provider, 'Comcast');
  assert.match(business.providerNote, /Comcast Business/);
});
test('Unknown ISPs and relay/cloud providers remain their reported names', () => {
  for (const isp of ['DigitalOcean, LLC', 'iCloud Private Relay', 'Small Local ISP', 'Spectrum Data Services']) {
    assert.equal(normalize(response({ connection: { isp } })).provider, isp);
  }
});
test('Missing network data does not invent an ISP or an area', () => {
  const value = normalize({ success: true, ip: '198.51.100.42' });
  assert.equal(value.provider, 'Not identified');
  assert.equal(value.location, 'Not identified');
  assert.equal(value.hasProvider, false);
  assert.equal(value.hasLocation, false);
  assert.equal(value.asn, 'Not supplied');
});
test('IPv6 is preserved, duplicate location components are removed, and absent ISP falls back to owner', () => {
  const value = normalize(response({
    ip: '2001:db8:abcd:1234:5678:9abc:def0:1234', city: 'Singapore', region: 'Singapore', country: 'Singapore',
    connection: { org: 'Example Network', asn: 13335 }
  }));
  assert.equal(value.type, 'IPv6');
  assert.equal(value.ip, '2001:db8:abcd:1234:5678:9abc:def0:1234');
  assert.equal(value.provider, 'Example Network');
  assert.equal(value.location, 'Singapore');
});
test('Provider errors and malformed or local addresses never become public results', () => {
  for (const data of [null, {}, { success: false, ip: '198.51.100.42' }, { success: 'true', ip: '198.51.100.42' }]) {
    assert.throws(() => normalize(data));
  }
  for (const ip of ['999.1.2.3', '<img src=x>', '192.168.1.1', '127.0.0.1', '10.0.0.1', '::1', '::',
    'fd00::123', 'fe80::1', '::ffff:127.0.0.1', '::ffff:192.168.1.1', '2001:db8:xyz::1']) {
    assert.throws(() => normalize(response({ ip })), ip);
  }
});
test('Field types and oversized remote text are bounded without creating HTML', () => {
  const value = normalize(response({
    connection: { isp: 'x'.repeat(300), org: 44, asn: 'AS123 <script>' },
    city: ['unexpected'], region: { value: 'unexpected' }, country: ''
  }));
  assert.equal(value.provider.length, 120);
  assert.equal(value.organization, 'Not identified');
  assert.equal(value.asn, 'Not supplied');
  assert.equal(value.location, 'Not identified');
});
