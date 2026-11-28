import { Platform, Share } from 'react-native';

/** Pagina aplicației, pusă în mesajele distribuite. */
export const APP_URL = 'https://whatever-app-unitbv.me';

/**
 * Deschide meniul de distribuire al sistemului. Unde nu există (unele browsere pe desktop), copiază textul.
 * Întoarce 'copied' când textul a ajuns în clipboard, ca ecranul să o spună.
 */
export async function shareText(message: string): Promise<'shared' | 'copied' | 'dismissed'> {
  if (Platform.OS === 'web') {
    const web = globalThis.navigator as Navigator | undefined;
    if (web?.share) {
      try {
        await web.share({ text: message });
        return 'shared';
      } catch {
        return 'dismissed';
      }
    }
    await web?.clipboard?.writeText(message);
    return 'copied';
  }
  const result = await Share.share({ message });
  return result.action === Share.dismissedAction ? 'dismissed' : 'shared';
}
