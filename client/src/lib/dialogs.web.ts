/** Pe web, Alert din React Native nu afișează butoane, așa că folosim dialogurile browserului. */
export function confirmAction(title: string, message: string, _confirmLabel?: string): Promise<boolean> {
  return Promise.resolve(window.confirm(`${title}\n\n${message}`));
}

export function showMessage(title: string, message: string): void {
  window.alert(`${title}\n\n${message}`);
}
