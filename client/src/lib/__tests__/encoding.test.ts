/// <reference types="jest" />
/// <reference types="node" />
import { base64UrlToBytes, bytesToBase64Url, completionMessage, utf8 } from '../encoding';

describe('base64url', () => {
  it('codifică fără padding și cu alfabetul URL-safe', () => {
    expect(bytesToBase64Url(new Uint8Array([0xfb, 0xff, 0xfe]))).toBe('-__-');
    expect(bytesToBase64Url(utf8('a'))).toBe('YQ');
    expect(bytesToBase64Url(new Uint8Array())).toBe('');
  });

  it('decodează și cu padding lipsă', () => {
    expect(Array.from(base64UrlToBytes('-__-'))).toEqual([0xfb, 0xff, 0xfe]);
    expect(new TextDecoder().decode(base64UrlToBytes('YQ'))).toBe('a');
  });

  it('dus-întors pentru toate lungimile mici', () => {
    for (let length = 0; length < 70; length += 1) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + length) % 256);
      expect(Array.from(base64UrlToBytes(bytesToBase64Url(bytes)))).toEqual(Array.from(bytes));
    }
  });

  it('se potrivește cu Buffer (base64url din Node, folosit și de server)', () => {
    const bytes = Uint8Array.from({ length: 32 }, (_, i) => 255 - i * 7);
    expect(bytesToBase64Url(bytes)).toBe(Buffer.from(bytes).toString('base64url'));
  });
});

describe('completionMessage', () => {
  it('are exact formatul verificat de user-service', () => {
    expect(completionMessage(42, 'abc_-')).toBe('whatever:complete:42:abc_-');
  });
});
