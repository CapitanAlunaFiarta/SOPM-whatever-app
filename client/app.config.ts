import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extinde app.json cu valori care vin din mediu la build (GitHub Actions, EAS sau local):
 * - EAS_PROJECT_ID: opțional; ID-ul proiectului EAS se poate pune și direct în app.json
 *   la expo.extra.eas.projectId (afișat de `npx eas-cli@latest init`).
 * - ANDROID_VERSION_CODE: numărul build-ului Android (în GitHub Actions = numărul rulării),
 *   ca fiecare APK nou să se instaleze peste cel vechi.
 *
 * Hărțile nu au nevoie de chei: pe Android e Leaflet + OpenStreetMap într-un WebView,
 * pe iOS Apple Maps, pe web Leaflet.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const versionCode = Number(process.env.ANDROID_VERSION_CODE);
  return {
    ...config,
    name: config.name ?? 'Whatever',
    slug: config.slug ?? 'whatever-app',
    android: {
      ...config.android,
      ...(Number.isInteger(versionCode) && versionCode > 0 ? { versionCode } : {}),
    },
    extra: {
      ...config.extra,
      ...(process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {}),
    },
  };
};
