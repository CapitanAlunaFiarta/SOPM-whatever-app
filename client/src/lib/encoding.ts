/** Conversii base64url fără dependențe (funcționează pe Hermes și în browser). */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Mesajul semnat de telefon pentru finalizarea unui task; trebuie să fie identic cu cel de pe server. */
export function completionMessage(taskId: number, challenge: string): string {
  return `whatever:complete:${taskId}:${challenge}`;
}
