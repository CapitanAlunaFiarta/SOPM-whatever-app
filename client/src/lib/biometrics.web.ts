import { request } from './api';
import { PASSKEY_DOMAIN } from './config';
import { base64UrlToBytes, bytesToBase64Url } from './encoding';

/** Pe web, biometria înseamnă passkey (WebAuthn), verificat de server cu biblioteca Yubico. */
export type BiometricStatus = {
  available: boolean;
  enabled: boolean;
  label: string;
  hint?: string;
};

const flagKey = (userId: number) => `whatever.passkey.${userId}`;

function passkeyHostOk(): boolean {
  const host = window.location.hostname;
  return host === PASSKEY_DOMAIN || host.endsWith(`.${PASSKEY_DOMAIN}`) || host === 'localhost';
}

function supported(): boolean {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window && Boolean(navigator.credentials);
}

export async function getBiometricStatus(userId: number): Promise<BiometricStatus> {
  if (!supported()) {
    return { available: false, enabled: false, label: 'Passkey', hint: 'Browserul nu suportă passkey-uri.' };
  }
  if (!passkeyHostOk()) {
    return { available: false, enabled: false, label: 'Passkey', hint: `Passkey-urile funcționează doar pe ${PASSKEY_DOMAIN}.` };
  }
  let enabled = false;
  try {
    enabled = window.localStorage.getItem(flagKey(userId)) === '1';
  } catch {
    enabled = false;
  }
  return { available: true, enabled, label: 'Passkey (amprentă, Face ID, Windows Hello)' };
}

type CreationOptions = { publicKey: Record<string, any> };
type RequestOptions = { publicKey: Record<string, any> };

function withoutExtensions<T extends Record<string, any>>(options: T): T {
  const { extensions: _ignored, ...rest } = options;
  return rest as T;
}

function credentialJson(credential: PublicKeyCredential): string {
  const response = credential.response as AuthenticatorAttestationResponse & AuthenticatorAssertionResponse;
  const encode = (value?: ArrayBuffer | null) => (value ? bytesToBase64Url(new Uint8Array(value)) : undefined);
  return JSON.stringify({
    id: credential.id,
    rawId: encode(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
    clientExtensionResults: credential.getClientExtensionResults?.() ?? {},
    response: {
      clientDataJSON: encode(response.clientDataJSON),
      attestationObject: encode(response.attestationObject),
      authenticatorData: encode(response.authenticatorData),
      signature: encode(response.signature),
      userHandle: response.userHandle ? encode(response.userHandle) : null,
    },
  });
}

function asBuffer(value: string): ArrayBuffer {
  const bytes = base64UrlToBytes(value);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function translate(error: unknown): Error {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return new Error('Confirmarea cu passkey a fost anulată sau a expirat.');
  }
  return error instanceof Error ? error : new Error('Passkey-ul nu a putut fi folosit.');
}

export async function enableBiometrics(userId: number): Promise<void> {
  const status = await getBiometricStatus(userId);
  if (!status.available) throw new Error(status.hint ?? 'Passkey-urile nu sunt disponibile.');
  const { publicKey } = await request<CreationOptions>('user', '/users/webauthn/register/options', { method: 'POST' });
  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        ...withoutExtensions(publicKey),
        challenge: asBuffer(publicKey.challenge),
        user: { ...publicKey.user, id: asBuffer(publicKey.user.id) },
        excludeCredentials: (publicKey.excludeCredentials ?? []).map((item: any) => ({ ...item, id: asBuffer(item.id) })),
      } as PublicKeyCredentialCreationOptions,
    })) as PublicKeyCredential | null;
    if (!credential) throw new Error('Passkey-ul nu a fost creat.');
    await request('user', '/users/webauthn/register/finish', { method: 'POST', body: { credentialJson: credentialJson(credential) } });
    try {
      window.localStorage.setItem(flagKey(userId), '1');
    } catch {
      // ignorăm
    }
  } catch (error) {
    throw translate(error);
  }
}

export async function disableBiometrics(userId: number): Promise<void> {
  try {
    window.localStorage.removeItem(flagKey(userId));
  } catch {
    // ignorăm
  }
}

export async function biometricTokenForTask(userId: number, taskId: number): Promise<string> {
  const status = await getBiometricStatus(userId);
  if (!status.available) throw new Error(status.hint ?? 'Passkey-urile nu sunt disponibile.');
  const { publicKey } = await request<RequestOptions>('user', '/users/webauthn/assertion/options', { method: 'POST' });
  try {
    const credential = (await navigator.credentials.get({
      publicKey: {
        ...withoutExtensions(publicKey),
        challenge: asBuffer(publicKey.challenge),
        allowCredentials: (publicKey.allowCredentials ?? []).map((item: any) => ({ ...item, id: asBuffer(item.id) })),
      } as PublicKeyCredentialRequestOptions,
    })) as PublicKeyCredential | null;
    if (!credential) throw new Error('Confirmarea cu passkey a eșuat.');
    const result = await request<{ biometricToken: string }>('user', '/users/webauthn/assertion/finish', {
      method: 'POST',
      body: { credentialJson: credentialJson(credential), taskId },
    });
    return result.biometricToken;
  } catch (error) {
    throw translate(error);
  }
}
