import { Alert } from 'react-native';

import { translate } from '../i18n/core';

/** Confirmare (pe telefon: Alert nativ; pe web: dialogs.web.ts). */
export function confirmAction(title: string, message: string, confirmLabel = translate('common.yes')): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: translate('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

export function showMessage(title: string, message: string): void {
  Alert.alert(title, message);
}
