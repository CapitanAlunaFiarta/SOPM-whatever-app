import { plannedReminders } from '../reminderPlan';

const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0, 0);

describe('amintirea de seară pentru streak', () => {
  it('azi, dacă n-ai confirmat nimic, îți amintește de streak-ul de păstrat; zilele următoare, de unul nou', () => {
    const plan = plannedReminders({ hour: 20, streak: 5, lastActiveOn: '2026-11-27', now: at(28, 15) });
    expect(plan.map((item) => [item.id, item.keepStreak])).toEqual([
      ['streak-2026-11-28', 5], ['streak-2026-11-29', 0], ['streak-2026-11-30', 0],
    ]);
    expect(plan[0].date.getHours()).toBe(20);
    expect(plan[0].date.getDate()).toBe(28);
  });

  it('după o confirmare azi, amintirea de azi dispare, iar mâine păstrezi streak-ul de acum', () => {
    const plan = plannedReminders({ hour: 21, streak: 6, lastActiveOn: '2026-11-28', now: at(28, 15) });
    expect(plan.map((item) => [item.id, item.keepStreak])).toEqual([['streak-2026-11-29', 6], ['streak-2026-11-30', 0]]);
  });

  it('după ora aleasă nu mai programează pentru azi', () => {
    const plan = plannedReminders({ hour: 20, streak: 3, lastActiveOn: '2026-11-27', now: at(28, 21) });
    expect(plan.map((item) => item.id)).toEqual(['streak-2026-11-29', 'streak-2026-11-30']);
  });

  it('fără nicio confirmare până acum: doar „începe un streak nou”', () => {
    const plan = plannedReminders({ hour: 19, streak: 0, lastActiveOn: null, now: at(30, 8) });
    expect(plan.map((item) => [item.id, item.keepStreak])).toEqual([
      ['streak-2026-11-30', 0], ['streak-2026-12-01', 0], ['streak-2026-12-02', 0],
    ]);
  });
});
