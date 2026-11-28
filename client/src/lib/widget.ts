import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/**
 * Widgetul Android cu streak-ul (modulul nativ din modules/streak-widget). Aplicația îi trimite streak-ul, ziua ultimei
 * confirmări și textele în limba aleasă; mai departe widgetul își dă seama singur de o zi nouă sau de un streak rupt.
 * Pe web, iOS și în Expo Go modulul lipsește și funcțiile nu fac nimic.
 */
type StreakWidgetNative = {
  update(streak: number, lastActiveOn: string | null, days: string, zero: string, done: string, pending: string, start: string): void;
  clear(): void;
};

const native = Platform.OS === 'android' ? requireOptionalNativeModule<StreakWidgetNative>('StreakWidget') : null;

export type WidgetTexts = { days: string; zero: string; done: string; pending: string; start: string };

export function updateStreakWidget(streak: number, lastActiveOn: string | null, texts: WidgetTexts) {
  try {
    native?.update(streak, lastActiveOn, texts.days, texts.zero, texts.done, texts.pending, texts.start);
  } catch {
    // widgetul e un bonus: nu stricăm aplicația dacă sistemul refuză actualizarea
  }
}

export function clearStreakWidget() {
  try {
    native?.clear();
  } catch {
    // la fel
  }
}
