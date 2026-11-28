import { compareVersions, isNewerRelease } from '../appVersion';

describe('versiunea aplicației', () => {
  it('compară versiunile pe componente', () => {
    expect(compareVersions('2.10.0', '2.9.1')).toBeGreaterThan(0);
    expect(compareVersions('2.4.0', '2.4.0')).toBe(0);
    expect(compareVersions('2.3.0', '2.4')).toBeLessThan(0);
  });

  it('un release e nou după versiune, apoi după build', () => {
    expect(isNewerRelease({ version: '2.4.0', build: 18 }, { version: '2.3.0', build: 17 })).toBe(true);
    expect(isNewerRelease({ version: '2.4.0', build: 18 }, { version: '2.4.0', build: 18 })).toBe(false);
    expect(isNewerRelease({ version: '2.4.0', build: 19 }, { version: '2.4.0', build: 18 })).toBe(true);
    // Pe web și iOS nu știm build-ul: contează doar versiunea.
    expect(isNewerRelease({ version: '2.4.0', build: 19 }, { version: '2.4.0', build: 0 })).toBe(false);
    expect(isNewerRelease({ version: '2.3.0', build: 30 }, { version: '2.4.0', build: 18 })).toBe(false);
    expect(isNewerRelease({ version: null, build: null })).toBe(false);
  });
});
