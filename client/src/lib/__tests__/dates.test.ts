/// <reference types="jest" />
import { formatTimestamp, friendlyDate, localDate, monthKey, monthLabel, parseLocalDate, shiftMonth } from '../dates';

describe('localDate', () => {
  const from = new Date(2026, 10, 30, 23, 30); // 30 nov. 2026, 23:30 ora locală

  it('folosește data locală, nu UTC', () => {
    expect(localDate(0, from)).toBe('2026-11-30');
  });

  it('trece corect peste lună și an', () => {
    expect(localDate(1, from)).toBe('2026-12-01');
    expect(localDate(32, from)).toBe('2027-01-01');
    expect(localDate(-30, from)).toBe('2026-10-31');
  });

  it('parseLocalDate este inversul lui localDate', () => {
    expect(localDate(0, parseLocalDate('2028-02-29'))).toBe('2028-02-29');
  });
});

describe('friendlyDate', () => {
  const today = '2026-11-27';

  it('azi, mâine, ieri în fiecare limbă', () => {
    expect(friendlyDate('2026-11-27', 'ro', { today })).toBe('Azi');
    expect(friendlyDate('2026-11-28', 'ro', { today })).toBe('Mâine');
    expect(friendlyDate('2026-11-26', 'ro', { today })).toBe('Ieri');
    expect(friendlyDate('2026-11-28', 'en', { today })).toBe('Tomorrow');
    expect(friendlyDate('2026-11-26', 'es', { today })).toBe('Ayer');
  });

  it('în mijlocul propoziției cu literă mică, fără să schimbe lunile', () => {
    expect(friendlyDate('2026-11-27', 'ro', { today, inline: true })).toBe('azi');
    expect(friendlyDate('2026-11-27', 'en', { today, inline: true })).toBe('today');
    expect(friendlyDate('2026-11-20', 'en', { today, inline: true })).toBe('Nov 20');
  });

  it('absolut: mereu ziua și luna', () => {
    expect(friendlyDate('2026-11-27', 'ro', { today, absolute: true })).toBe('27 nov.');
    expect(friendlyDate('2026-11-28', 'en', { today, absolute: true })).toBe('Nov 28');
  });

  it('altfel zi și lună, cu anul doar dacă diferă', () => {
    expect(friendlyDate('2026-11-20', 'ro', { today })).toBe('20 nov.');
    expect(friendlyDate('2027-05-01', 'ro', { today })).toBe('1 mai 2027');
    expect(friendlyDate('2026-11-20', 'en', { today })).toBe('Nov 20');
    expect(friendlyDate('2027-05-01', 'en', { today })).toBe('May 1, 2027');
    expect(friendlyDate('2026-12-24', 'es', { today })).toBe('24 dic');
    expect(friendlyDate('2027-01-06', 'es', { today })).toBe('6 ene 2027');
  });
});

describe('formatTimestamp', () => {
  const now = new Date(2026, 10, 27, 18, 0);

  it('azi doar ora, altfel și ziua; engleza cu AM/PM', () => {
    expect(formatTimestamp(new Date(2026, 10, 27, 9, 5).toISOString(), 'ro', now)).toBe('09:05');
    expect(formatTimestamp(new Date(2026, 10, 27, 0, 30).toISOString(), 'en', now)).toBe('12:30 AM');
    expect(formatTimestamp(new Date(2026, 10, 26, 21, 7).toISOString(), 'en', now)).toBe('Yesterday · 9:07 PM');
    expect(formatTimestamp(new Date(2026, 10, 20, 13, 0).toISOString(), 'es', now)).toBe('20 nov · 13:00');
  });

  it('lasă neschimbată o valoare invalidă', () => {
    expect(formatTimestamp('nu e o dată', 'ro', now)).toBe('nu e o dată');
  });
});

describe('luni', () => {
  it('cheia lunii și deplasarea peste ani', () => {
    expect(monthKey(new Date(2026, 10, 27))).toBe('2026-11');
    expect(shiftMonth('2026-11', 2)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('numele lunii în fiecare limbă', () => {
    expect(monthLabel('2026-11', 'ro')).toBe('Noiembrie 2026');
    expect(monthLabel('2026-11', 'en')).toBe('November 2026');
    expect(monthLabel('2026-11', 'es')).toBe('Noviembre de 2026');
  });
});
