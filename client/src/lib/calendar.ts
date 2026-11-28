import { API_URLS } from './config';
import { nextDay } from './recurrence';
import { APP_URL } from './share';
import type { Task } from './types';

const compact = (date: string) => date.replace(/-/g, '');

/** Pagina activității în aplicația web (deschide ecranul de detalii). */
export function activityUrl(id: number): string {
  return `${APP_URL}/activity/${id}`;
}

/**
 * Google Maps cu traseul până în centrul razei activității. Pe Android și iOS linkul deschide aplicația
 * Google Maps, dacă e instalată; altfel site-ul.
 */
export function googleMapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

type CalendarTask = Pick<Task, 'id' | 'title' | 'dueDate' | 'isRecurring' | 'repeatEvery' | 'repeatUnit' | 'requiresLocation'
  | 'latitude' | 'longitude'> & { description?: string; nextOn?: string | null };

/**
 * Formularul „Adaugă în Google Calendar” completat cu activitatea: eveniment de o zi întreagă (activitățile nu au
 * oră), cu repetarea (RRULE) la cele recurente, locația și un link înapoi în Whatever.
 */
export function googleCalendarUrl(task: CalendarTask, openLabel: string): string {
  const start = task.nextOn ?? task.dueDate;
  const details = [task.description?.trim(), `${openLabel}: ${activityUrl(task.id)}`].filter(Boolean).join('\n\n');
  const params = [
    ['action', 'TEMPLATE'],
    ['text', task.title],
    ['dates', `${compact(start)}/${compact(nextDay(start))}`],
    ['details', details],
  ];
  if (task.requiresLocation) params.push(['location', `${task.latitude.toFixed(6)},${task.longitude.toFixed(6)}`]);
  if (task.isRecurring) {
    params.push(['recur', `RRULE:FREQ=${task.repeatUnit === 'WEEK' ? 'WEEKLY' : 'DAILY'};INTERVAL=${Math.max(1, task.repeatEvery ?? 1)}`]);
  }
  return `https://calendar.google.com/calendar/render?${params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')}`;
}

/** Linkul secret către fișierul .ics cu activitățile mele (îl citește Google Calendar). */
export function calendarFeedUrl(token: string, language: string): string {
  return `${API_URLS.task}/tasks/calendar/feed/${token}.ics?lang=${language}`;
}

/** Deschide Google Calendar cu întrebarea „Adaugi acest calendar?” pentru linkul dat. */
export function googleSubscribeUrl(feedUrl: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedUrl.replace(/^https?:/, 'webcal:'))}`;
}
