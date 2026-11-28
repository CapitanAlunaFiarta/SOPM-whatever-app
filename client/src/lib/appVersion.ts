import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

import appJson from '../../app.json';

/**
 * Versiunea acestei aplicații și, pe Android, numărul build-ului (versionCode pus de CI la build).
 * Versiunea vine direct din app.json (importat în bundle), nu din manifestul din expo-constants, pe care
 * cache-ul Metro îl poate păstra de la un build mai vechi.
 */
export const appVersion: string = appJson.expo.version;
export const appBuild = Platform.OS === 'android' ? Number(Constants.expoConfig?.android?.versionCode ?? 0) : 0;

export type Release = { version: string | null; build: number | null; url: string | null; tag?: string | null };

/** Compară „2.10.0” cu „2.9.1” pe componente: negativ, zero sau pozitiv. */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const right = b.split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * E release-ul mai nou decât aplicația de aici? Contează versiunea; la aceeași versiune, pe Android,
 * și build-ul (un APK refăcut din aceeași versiune are build mai mare).
 */
export function isNewerRelease(release: Pick<Release, 'version' | 'build'> | null | undefined,
  current = { version: appVersion, build: appBuild }): boolean {
  if (!release?.version) return false;
  const difference = compareVersions(release.version, current.version);
  if (difference !== 0) return difference > 0;
  return current.build > 0 && (release.build ?? 0) > current.build;
}

/** Unde se poate actualiza aplicația: Android descarcă APK-ul, web-ul se reîncarcă, iOS nu (App Store/TestFlight). */
export const updateKind: 'download' | 'reload' | 'none' =
  Platform.OS === 'android' ? 'download' : Platform.OS === 'web' ? 'reload' : 'none';

/** Pornește actualizarea: pe Android deschide linkul APK-ului (browserul îl descarcă), pe web reîncarcă pagina. */
export async function startUpdate(url: string | null | undefined): Promise<void> {
  if (Platform.OS === 'web') {
    window.location.reload();
    return;
  }
  if (Platform.OS === 'android' && url) await Linking.openURL(url);
}
