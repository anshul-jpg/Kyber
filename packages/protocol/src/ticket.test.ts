import test from 'node:test';
import assert from 'node:assert';
import { encodePairingTicket, decodePairingTicket, PairingTicket } from './index.js';

test('encodePairingTicket and decodePairingTicket round trip', () => {
  const ticket: PairingTicket = {
    version: 1,
    host: '100.64.0.1',
    port: 4040,
    ssl: false,
    token: 'a1b2c3d4e5f67890123456789abcdef0',
    workspaceId: 'ws_test_123',
  };

  const encoded = encodePairingTicket(ticket);
  assert.ok(encoded.length > 20, 'Encoded string should be non-empty base64url');
  assert.ok(!encoded.includes('+') && !encoded.includes('/'), 'Should be URL-safe');

  const decoded = decodePairingTicket(encoded);
  assert.deepStrictEqual(decoded, ticket);
});

test('decodePairingTicket extracts ticket parameter from URL', () => {
  const ticket: PairingTicket = {
    version: 1,
    host: '192.168.1.10',
    port: 4040,
    ssl: true,
    token: 'my-secure-token',
  };

  const encoded = encodePairingTicket(ticket);
  const fullUrl = `http://192.168.1.10:4040/?ticket=${encoded}`;

  const decoded = decodePairingTicket(fullUrl);
  assert.deepStrictEqual(decoded, ticket);
});

test('decodePairingTicket returns null on corrupt or invalid inputs', () => {
  assert.strictEqual(decodePairingTicket(''), null);
  assert.strictEqual(decodePairingTicket('not_a_valid_ticket!@#$'), null);
  assert.strictEqual(decodePairingTicket('eyJmb28iOiJiYXIifQ'), null); // JSON without host/port
});
