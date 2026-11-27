import { ed25519 } from '@noble/curves/ed25519.js';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

import { translate } from '../i18n/core';

import { ApiError, request } from './api';
import { base64UrlToBytes, bytesToBase64Url, completionMessage, utf8 } from './encoding';

/**
 * Biometrie în aplicația nativă, verificată pe server:
 *  - la activare, telefonul generează o cheie Ed25519; cheia privată se salvează în Keychain/Keystore
 *    cu `requireAuthentication`, deci poate fi citită doar după amprentă/Face ID;
 *  - serverul primește doar cheia publică;
 *  - la finalizarea unui task, telefonul semnează un challenge unic primit de la server.
 */
export type BiometricStatus = {
  available: boolean;
  enabled: boolean;
  label: string;
  hint?: string;
};

const SECURE_SERVICE = 'whatever.biometric';
const secretKeyName = (userId: number) => `deviceKey.${userId}`;
const deviceIdName = (userId: number) => `whatever.deviceId.${userId}`;

async function hardwareLabel(): Promise<string> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return translate('bio.faceId');
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return translate('bio.fingerprint');
  } catch {
    // ignorăm
  }
  return translate('bio.generic');
}

export async function getBiometricStatus(userId: number): Promise<BiometricStatus> {
  const [hasHardware, isEnrolled, label, deviceId] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    hardwareLabel(),
    SecureStore.getItemAsync(deviceIdName(userId)),
  ]);
  if (!hasHardware) return { available: false, enabled: false, label, hint: translate('bio.noHardware') };
  if (!isEnrolled) {
    return { available: false, enabled: false, label, hint: translate('bio.notEnrolled') };
  }
  return { available: true, enabled: Boolean(deviceId), label };
}

export async function enableBiometrics(userId: number): Promise<void> {
  const status = await getBiometricStatus(userId);
  if (!status.available) throw new Error(status.hint ?? translate('bio.unavailable'));

  const secretKey = Crypto.getRandomBytes(32);
  const publicKey = ed25519.getPublicKey(secretKey);
  try {
    await SecureStore.setItemAsync(secretKeyName(userId), bytesToBase64Url(secretKey), {
      keychainService: SECURE_SERVICE,
      requireAuthentication: true,
      authenticationPrompt: translate('bio.enablePrompt'),
    });
  } catch {
    throw new Error(translate('bio.keyStoreFailed'));
  }

  const name = [Device.manufacturer, Device.modelName].filter(Boolean).join(' ') || translate('bio.phone');
  try {
    const { deviceId } = await request<{ deviceId: string }>('user', '/users/devices', {
      method: 'POST',
      body: { publicKey: bytesToBase64Url(publicKey), name },
    });
    await SecureStore.setItemAsync(deviceIdName(userId), deviceId);
  } catch (error) {
    await SecureStore.deleteItemAsync(secretKeyName(userId), { keychainService: SECURE_SERVICE }).catch(() => undefined);
    throw error;
  }
}

export async function disableBiometrics(userId: number): Promise<void> {
  const deviceId = await SecureStore.getItemAsync(deviceIdName(userId));
  if (deviceId) {
    await request('user', `/users/devices/${deviceId}`, { method: 'DELETE' }).catch(() => undefined);
  }
  await SecureStore.deleteItemAsync(deviceIdName(userId)).catch(() => undefined);
  await SecureStore.deleteItemAsync(secretKeyName(userId), { keychainService: SECURE_SERVICE }).catch(() => undefined);
}

/** Confirmare biometrică pentru un task: semnează challenge-ul serverului și întoarce token-ul biometric. */
export async function biometricTokenForTask(userId: number, taskId: number): Promise<string> {
  const deviceId = await SecureStore.getItemAsync(deviceIdName(userId));
  if (!deviceId) {
    throw new Error(translate('bio.enableFirst'));
  }
  let challenge: { challengeId: number; challenge: string };
  try {
    challenge = await request('user', '/users/devices/challenge', { method: 'POST', body: { deviceId, taskId } });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      await disableBiometrics(userId);
      throw new Error(translate('bio.deviceUnregistered'));
    }
    throw error;
  }

  let stored: string | null;
  try {
    stored = await SecureStore.getItemAsync(secretKeyName(userId), {
      keychainService: SECURE_SERVICE,
      requireAuthentication: true,
      authenticationPrompt: translate('bio.confirmPrompt'),
    });
  } catch {
    throw new Error(translate('bio.cancelled'));
  }
  if (!stored) {
    await disableBiometrics(userId);
    throw new Error(translate('bio.keyMissing'));
  }

  const signature = ed25519.sign(utf8(completionMessage(taskId, challenge.challenge)), base64UrlToBytes(stored));
  const result = await request<{ biometricToken: string }>('user', '/users/devices/verify', {
    method: 'POST',
    body: { challengeId: challenge.challengeId, signature: bytesToBase64Url(signature) },
  });
  return result.biometricToken;
}
