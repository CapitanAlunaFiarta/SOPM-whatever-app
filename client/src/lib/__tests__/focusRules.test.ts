/// <reference types="jest" />
import { focusOutcome, formatRemaining, newSession } from '../focusRules';

const START = Date.UTC(2026, 10, 28, 9, 0, 0);
const session = newSession(7, 'Învăț pentru examen', 25, [
  { packageName: 'com.instagram.android', label: 'Instagram' },
  { packageName: 'com.zhiliaoapp.musically', label: 'TikTok' },
], START);

describe('focusOutcome', () => {
  it('rulează cât timp nu s-a deschis nimic și nu s-a terminat timpul', () => {
    expect(focusOutcome(session, [], START + 10 * 60_000)).toEqual({ status: 'running', remainingMs: 15 * 60_000 });
  });

  it('reușește la final dacă nu s-a deschis nicio aplicație urmărită', () => {
    const other = [{ packageName: 'com.android.chrome', timestamp: START + 60_000 }];
    expect(focusOutcome(session, other, session.endsAt)).toEqual({ status: 'succeeded' });
  });

  it('pică la prima aplicație urmărită deschisă în timpul sesiunii', () => {
    const opened = [
      { packageName: 'com.zhiliaoapp.musically', timestamp: START + 20 * 60_000 },
      { packageName: 'com.instagram.android', timestamp: START + 7 * 60_000 + 30_000 },
    ];
    expect(focusOutcome(session, opened, START + 30 * 60_000)).toEqual({ status: 'failed', app: 'Instagram', afterMinutes: 7 });
  });

  it('nu contează deschiderile dinainte de început sau de după final', () => {
    const opened = [
      { packageName: 'com.instagram.android', timestamp: START - 1000 },
      { packageName: 'com.instagram.android', timestamp: session.endsAt + 1000 },
    ];
    expect(focusOutcome(session, opened, session.endsAt + 2000)).toEqual({ status: 'succeeded' });
  });
});

describe('formatRemaining', () => {
  it('minute și secunde, rotunjit în sus', () => {
    expect(formatRemaining(25 * 60_000)).toBe('25:00');
    expect(formatRemaining(61_001)).toBe('01:02');
    expect(formatRemaining(-5)).toBe('00:00');
  });
});
