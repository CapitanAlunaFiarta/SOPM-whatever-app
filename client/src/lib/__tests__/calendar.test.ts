import { calendarFeedUrl, googleCalendarUrl, googleMapsUrl, googleSubscribeUrl } from '../calendar';
import { isValidRepeat, monthWeeks, nextDay, occurrences, repeatStepDays } from '../recurrence';

const weekly = { dueDate: '2026-12-05', isRecurring: true, repeatEvery: 2, repeatUnit: 'WEEK' as const, status: 'Upcoming' as const };

describe('recurrence', () => {
  it('repeats every N days or weeks from the next due date', () => {
    expect(occurrences(weekly, '2026-12-01', '2026-12-31')).toEqual(['2026-12-05', '2026-12-19']);
    expect(occurrences({ ...weekly, repeatEvery: 3, repeatUnit: 'DAY' }, '2026-12-01', '2026-12-12'))
      .toEqual(['2026-12-05', '2026-12-08', '2026-12-11']);
    // O lună mai târziu: prima apariție de după începutul lunii, nu de la scadență.
    expect(occurrences(weekly, '2027-01-01', '2027-01-31')).toEqual(['2027-01-02', '2027-01-16', '2027-01-30']);
    // Serverele vechi nu trimit intervalul: zilnic.
    expect(occurrences({ dueDate: '2026-12-30', isRecurring: true, status: 'Upcoming' }, '2026-12-29', '2027-01-01'))
      .toEqual(['2026-12-30', '2026-12-31', '2027-01-01']);
  });

  it('keeps one-off, finished and canceled activities on their own day', () => {
    expect(occurrences({ ...weekly, isRecurring: false }, '2026-12-01', '2026-12-31')).toEqual(['2026-12-05']);
    expect(occurrences({ ...weekly, status: 'Completed' }, '2026-12-01', '2026-12-31')).toEqual(['2026-12-05']);
    expect(occurrences({ ...weekly, status: 'Canceled' }, '2026-12-01', '2026-12-31')).toEqual([]);
    expect(occurrences({ ...weekly, isRecurring: false }, '2026-11-01', '2026-11-30')).toEqual([]);
  });

  it('validates intervals like the server and counts steps in days', () => {
    expect(isValidRepeat(1, 'DAY')).toBe(true);
    expect(isValidRepeat(365, 'DAY')).toBe(true);
    expect(isValidRepeat(53, 'WEEK')).toBe(false);
    expect(isValidRepeat(0, 'DAY')).toBe(false);
    expect(isValidRepeat(1.5, 'DAY')).toBe(false);
    expect(repeatStepDays(2, 'WEEK')).toBe(14);
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
    // Trecerea la ora de iarnă (25 octombrie) nu strică adunarea zilelor.
    expect(nextDay('2026-10-25')).toBe('2026-10-26');
  });

  it('lays out a month from Monday to Sunday', () => {
    const weeks = monthWeeks('2026-12');
    expect(weeks[0]).toEqual([null, '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06']);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
    expect(monthWeeks('2027-02')[0][0]).toBe('2027-02-01');
  });
});

describe('calendar links', () => {
  const task = {
    id: 12, title: 'Fotbal, parcul Tractorul', dueDate: '2026-12-05', isRecurring: true, repeatEvery: 2, repeatUnit: 'WEEK' as const,
    requiresLocation: true, latitude: 45.6525, longitude: 25.5888, description: 'Adu mingea', nextOn: null,
  };

  it('opens Google Maps with directions to the center of the radius', () => {
    expect(googleMapsUrl(45.6525, 25.5888)).toBe('https://www.google.com/maps/dir/?api=1&destination=45.652500,25.588800');
  });

  it('fills the Google Calendar form with an all-day, repeating event', () => {
    const url = new URL(googleCalendarUrl(task, 'Deschide în Whatever'));
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe('Fotbal, parcul Tractorul');
    expect(url.searchParams.get('dates')).toBe('20261205/20261206');
    expect(url.searchParams.get('recur')).toBe('RRULE:FREQ=WEEKLY;INTERVAL=2');
    expect(url.searchParams.get('location')).toBe('45.652500,25.588800');
    expect(url.searchParams.get('details')).toBe('Adu mingea\n\nDeschide în Whatever: https://whatever-app-unitbv.me/activity/12');
    const single = new URL(googleCalendarUrl({ ...task, isRecurring: false, requiresLocation: false, description: '' }, 'Deschide'));
    expect(single.searchParams.get('recur')).toBeNull();
    expect(single.searchParams.get('location')).toBeNull();
    expect(single.searchParams.get('details')).toBe('Deschide: https://whatever-app-unitbv.me/activity/12');
  });

  it('subscribes Google Calendar to the secret feed', () => {
    const feed = calendarFeedUrl('a'.repeat(32), 'ro');
    expect(feed).toMatch(/\/tasks\/calendar\/feed\/a{32}\.ics\?lang=ro$/);
    const subscribe = new URL(googleSubscribeUrl('https://example.com/api/tasks/calendar/feed/x.ics?lang=ro'));
    expect(subscribe.searchParams.get('cid')).toBe('webcal://example.com/api/tasks/calendar/feed/x.ics?lang=ro');
  });
});
