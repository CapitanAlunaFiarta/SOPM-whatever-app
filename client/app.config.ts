import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extinde app.json cu valori care vin din mediu la build (EAS sau local):
 * - GOOGLE_MAPS_API_KEY: cheia pentru Google Maps pe Android în build-urile instalabile
 *   (în Expo Go nu e nevoie de ea). Fără cheie, aplicația Android funcționează, dar fără hartă.
 * - EAS_PROJECT_ID: opțional; ID-ul proiectului EAS se poate pune și direct în app.json
 *   la expo.extra.eas.projectId (afișat de `npx eas-cli@latest init`).
 * - ANDROID_VERSION_CODE: numărul build-ului Android (în GitHub Actions = numărul rulării),
 *   ca fiecare APK nou să se instaleze peste cel vechi.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const plugins = [...(config.plugins ?? [])];
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
  if (mapsKey) {
    plugins.push(['react-native-maps', { androidGoogleMapsApiKey: mapsKey }]);
  }
  const versionCode = Number(process.env.ANDROID_VERSION_CODE);
  return {
    ...config,
    name: config.name ?? 'Whatever',
    slug: config.slug ?? 'whatever-app',
    plugins,
    android: {
      ...config.android,
      ...(Number.isInteger(versionCode) && versionCode > 0 ? { versionCode } : {}),
    },
    extra: {
      ...config.extra,
      androidGoogleMaps: Boolean(mapsKey),
      ...(process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {}),
    },
  };
};
