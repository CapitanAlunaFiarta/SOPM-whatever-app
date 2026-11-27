/// <reference types="jest" />
import { friendlyDate, localDate, parseLocalDate, pluralDays } from '../dates';

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

  it('azi, mâine, ieri', () => {
    expect(friendlyDate('2026-11-27', today)).toBe('Azi');
    expect(friendlyDate('2026-11-28', today)).toBe('Mâine');
    expect(friendlyDate('2026-11-26', today)).toBe('Ieri');
  });

  it('altfel zi și lună, cu anul doar dacă diferă', () => {
    expect(friendlyDate('2026-11-20', today)).toBe('20 nov.');
    expect(friendlyDate('2027-05-01', today)).toBe('1 mai 2027');
  });
});

describe('pluralDays', () => {
  it('1 zi, altfel zile', () => {
    expect(pluralDays(1)).toBe('1 zi');
    expect(pluralDays(0)).toBe('0 zile');
    expect(pluralDays(12)).toBe('12 zile');
  });
});
