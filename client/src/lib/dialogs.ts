import { Alert } from 'react-native';

/** Confirmare (pe telefon: Alert nativ; pe web: dialogs.web.ts). */
export function confirmAction(title: string, message: string, confirmLabel = 'Da'): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Renunță', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

export function showMessage(title: string, message: string): void {
  Alert.alert(title, message);
}
