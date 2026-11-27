/// <reference types="jest" />
/// <reference types="node" />
import { ed25519 } from '@noble/curves/ed25519.js';
import { createPublicKey, verify } from 'node:crypto';

import { base64UrlToBytes, bytesToBase64Url, completionMessage, utf8 } from '../encoding';

/**
 * Semnătura făcută pe telefon (biometrics.ts, @noble/curves) trebuie să treacă de verificarea
 * din user-service (DeviceKeyService: Java „Ed25519” cu cheia publică împachetată X.509).
 * Refacem aici exact verificarea serverului cu node:crypto.
 */
const ED25519_X509_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function serverVerifies(publicKey: Uint8Array, message: string, signature: Uint8Array): boolean {
  const key = createPublicKey({ key: Buffer.concat([ED25519_X509_PREFIX, Buffer.from(publicKey)]), format: 'der', type: 'spki' });
  return verify(null, Buffer.from(utf8(message)), key, Buffer.from(signature));
}

describe('cheia de dispozitiv Ed25519', () => {
  const secretKey = Uint8Array.from({ length: 32 }, (_, i) => (i * 11 + 3) % 256);
  const publicKey = ed25519.getPublicKey(secretKey);
  const challenge = bytesToBase64Url(Uint8Array.from({ length: 32 }, (_, i) => i));

  it('cheia publică are 32 de octeți (coloana device_keys.public_key)', () => {
    expect(publicKey).toHaveLength(32);
    expect(base64UrlToBytes(bytesToBase64Url(publicKey))).toEqual(publicKey);
  });

  it('semnătura telefonului este acceptată de server', () => {
    const message = completionMessage(7, challenge);
    const signature = ed25519.sign(utf8(message), secretKey);
    expect(serverVerifies(publicKey, message, signature)).toBe(true);
  });

  it('serverul respinge semnătura pentru alt task', () => {
    const signature = ed25519.sign(utf8(completionMessage(7, challenge)), secretKey);
    expect(serverVerifies(publicKey, completionMessage(8, challenge), signature)).toBe(false);
  });
});
