import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Pe Android, react-native-maps folosește Google Maps, care cere o cheie API pusă în build
 * (GOOGLE_MAPS_API_KEY, vezi app.config.ts). Fără cheie, deschiderea hărții închide aplicația,
 * așa că în acel caz ecranele afișează o variantă fără hartă.
 * iOS folosește Apple Maps (nu are nevoie de cheie), iar Expo Go vine cu cheia lui.
 */
export const nativeMapsAvailable =
  Platform.OS !== 'android' ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  Constants.expoConfig?.extra?.androidGoogleMaps === true;
