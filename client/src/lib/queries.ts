import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { translate } from '../i18n/core';

import { request, saveSession } from './api';
import type { Release } from './appVersion';
import { useAuth } from './auth';
import { biometricTokenForTask } from './biometrics';
import { currentPosition } from './location';
import type {
  ActivityChat, ActivityDays, ActivityPreview, AdminUser, CalendarLink, CalendarMonth, ChatMessage, CompletionResult, Favor, FavorInput, FavorList,
  Friend, FriendStatus, LeaderboardEntry, Profile, Recap, Session, Task, TaskInput, TaskMessage, User,
} from './types';

export const keys = {
  me: ['me'] as const,
  tasks: ['tasks'] as const,
  chat: ['chat'] as const,
  friends: ['friends'] as const,
  leaderboard: ['leaderboard'] as const,
  adminUsers: ['admin-users'] as const,
  recap: ['recap'] as const,
  taskMessages: (id: number) => ['task-messages', id] as const,
  favors: ['favors'] as const,
  favorPhoto: (id: number) => ['favor-photo', id] as const,
  profiles: ['profile'] as const,
  profile: (username: string) => ['profile', username] as const,
  activityChats: ['activity-chats'] as const,
  previews: ['activity-previews'] as const,
  appVersion: ['app-version'] as const,
  calendar: ['calendar'] as const,
  calendarLink: ['calendar-link'] as const,
  activityDays: ['activity-days'] as const,
};

export function useMe() {
  const { updateUser, status } = useAuth();
  return useQuery({
    queryKey: keys.me,
    enabled: status === 'signedIn',
    queryFn: async () => {
      const me = await request<User>('user', '/users/me');
      updateUser(me);
      return me;
    },
  });
}

export function useTasks() {
  const { status } = useAuth();
  return useQuery({
    queryKey: keys.tasks,
    enabled: status === 'signedIn',
    queryFn: () => request<Task[]>('task', '/tasks'),
  });
}

/** Recap-ul unei luni (YYYY-MM): câte activități ai finalizat în fiecare categorie. */
export function useRecap(month: string) {
  const { status } = useAuth();
  return useQuery({
    queryKey: [...keys.recap, month],
    enabled: status === 'signedIn',
    queryFn: () => request<Recap>('task', `/tasks/recap?month=${encodeURIComponent(month)}`),
  });
}

/** Ce am finalizat în fiecare zi a unei luni (YYYY-MM), pentru vederea de calendar. */
export function useCalendarMonth(month: string) {
  const { status } = useAuth();
  return useQuery({
    queryKey: [...keys.calendar, month],
    enabled: status === 'signedIn',
    queryFn: () => request<CalendarMonth>('task', `/tasks/calendar?month=${encodeURIComponent(month)}`),
  });
}

/** Harta zilelor active (recap): câte finalizări în fiecare zi din ultimele `weeks` săptămâni. */
export function useActivityDays(weeks = 26) {
  const { status } = useAuth();
  return useQuery({
    queryKey: [...keys.activityDays, weeks],
    enabled: status === 'signedIn',
    queryFn: () => request<ActivityDays>('task', `/tasks/calendar/activity?weeks=${weeks}`),
  });
}

/** După o schimbare de profil: eu, profilul public, prietenii și clasamentul (unde apar poza și descrierea). */
function useRefreshProfile() {
  const client = useQueryClient();
  const { updateUser } = useAuth();
  return (user: User) => {
    updateUser(user);
    client.setQueryData(keys.me, user);
    return Promise.all([
      client.invalidateQueries({ queryKey: keys.profiles }),
      client.invalidateQueries({ queryKey: keys.leaderboard }),
      client.invalidateQueries({ queryKey: keys.chat }),
    ]);
  };
}

/** Descrierea scurtă de pe profil. */
export function useUpdateBio() {
  const refresh = useRefreshProfile();
  return useMutation({
    mutationFn: (bio: string) => request<User>('user', '/users/me/profile', { method: 'PUT', body: { bio } }),
    onSuccess: refresh,
  });
}

/** Poza de profil: JPEG în base64 (serverul o recodează la 256×256); null = scoate poza. */
export function useAvatar() {
  const refresh = useRefreshProfile();
  return useMutation({
    mutationFn: (image: string | null) => image
      ? request<User>('user', '/users/me/avatar', { method: 'PUT', body: { image } })
      : request<User>('user', '/users/me/avatar', { method: 'DELETE' }),
    onSuccess: refresh,
  });
}

/** Linkul secret de abonare la calendar (se creează la prima cerere). */
export function useCalendarLink(enabled: boolean) {
  const { status } = useAuth();
  return useQuery({
    queryKey: keys.calendarLink,
    enabled: status === 'signedIn' && enabled,
    staleTime: 5 * 60_000,
    queryFn: () => request<CalendarLink>('task', '/tasks/calendar/link'),
  });
}

/** Un link nou de abonare; cel vechi nu mai funcționează. */
export function useResetCalendarLink() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => request<CalendarLink>('task', '/tasks/calendar/link/reset', { method: 'POST' }),
    onSuccess: (link) => client.setQueryData(keys.calendarLink, link),
  });
}

export function useChat() {
  const { status } = useAuth();
  return useQuery({
    queryKey: keys.chat,
    enabled: status === 'signedIn',
    queryFn: () => request<ChatMessage[]>('user', '/chat'),
    refetchInterval: 10_000,
  });
}

export function useFriends() {
  const { status } = useAuth();
  return useQuery({
    queryKey: keys.friends,
    enabled: status === 'signedIn',
    // Cererile primite apar pe Acasă și în Social fără să reîncarci aplicația; deschiderea listei o reîmprospătează.
    refetchInterval: 30_000,
    refetchOnMount: 'always',
    queryFn: () => request<Friend[]>('user', '/friends'),
  });
}

/** Prieten confirmat (un server vechi nu trimite status: acolo toți erau prieteni). */
export const isFriend = (friend: Friend) => !friend.status || friend.status === 'FRIEND';

/** Profilul public al cuiva: streak, activități finalizate și relația cu mine. */
export function useProfile(username: string) {
  const { status } = useAuth();
  return useQuery({
    queryKey: keys.profile(username),
    enabled: status === 'signedIn' && Boolean(username),
    queryFn: () => request<Profile>('user', `/profiles/${encodeURIComponent(username)}`),
  });
}

/** Cea mai nouă versiune publicată a aplicației (o verifică serverul pe GitHub Releases). */
export function useLatestRelease() {
  const { status } = useAuth();
  return useQuery({
    queryKey: keys.appVersion,
    enabled: status === 'signedIn',
    staleTime: 10 * 60_000,
    queryFn: () => request<Release>('user', '/app/version'),
  });
}

/** Chaturile activităților în care sunt membru, cu ultimul mesaj. */
export function useActivityChats() {
  const { status } = useAuth();
  return useQuery({
    queryKey: keys.activityChats,
    enabled: status === 'signedIn',
    refetchInterval: 15_000,
    refetchOnMount: 'always',
    queryFn: () => request<ActivityChat[]>('task', '/tasks/chats'),
  });
}

/** Ce văd despre activitățile trimise în comunitate (pentru cardurile din chat). */
export function useActivityPreviews(ids: number[]) {
  const { status } = useAuth();
  const sorted = [...new Set(ids)].sort((a, b) => a - b).slice(0, 50);
  return useQuery({
    queryKey: [...keys.previews, sorted.join(',')],
    enabled: status === 'signedIn' && sorted.length > 0,
    refetchInterval: 30_000,
    queryFn: () => request<ActivityPreview[]>('task', `/tasks/shared?ids=${sorted.join(',')}`),
  });
}

export function useLeaderboard() {
  const { status } = useAuth();
  return useQuery({
    queryKey: keys.leaderboard,
    enabled: status === 'signedIn',
    queryFn: () => request<LeaderboardEntry[]>('user', '/leaderboard'),
  });
}

export function useAdminUsers(enabled: boolean) {
  return useQuery({
    queryKey: keys.adminUsers,
    enabled,
    queryFn: () => request<AdminUser[]>('user', '/admin/users'),
  });
}

/** Invalidează datele afectate de o acțiune pe task-uri (listă, profil, clasament, recap). */
function useRefreshAfterTaskChange() {
  const client = useQueryClient();
  return () => Promise.all([
    client.invalidateQueries({ queryKey: keys.tasks }),
    client.invalidateQueries({ queryKey: keys.me }),
    client.invalidateQueries({ queryKey: keys.leaderboard }),
    client.invalidateQueries({ queryKey: keys.recap }),
    client.invalidateQueries({ queryKey: keys.calendar }),
  ]);
}

export function useSaveTask() {
  const refresh = useRefreshAfterTaskChange();
  return useMutation({
    mutationFn: ({ id, input }: { id?: number; input: TaskInput }) =>
      request<Task>('task', id ? `/tasks/${id}` : '/tasks', { method: id ? 'PUT' : 'POST', body: input }),
    onSuccess: refresh,
  });
}

export function useCompleteTask() {
  const refresh = useRefreshAfterTaskChange();
  const { user, updateUser } = useAuth();
  return useMutation({
    mutationFn: async (task: Task) => {
      if (!user) throw new Error(translate('auth.signInAgain'));
      const body: Record<string, unknown> = {};
      if (task.requiresLocation) Object.assign(body, await currentPosition());
      if (task.requiresBiometrics) body.biometricToken = await biometricTokenForTask(user.id, task.id);
      return request<CompletionResult>('task', `/tasks/${task.id}/verify-complete`, { method: 'POST', body });
    },
    onSuccess: (result) => {
      updateUser({ streak: result.streak, points: result.points, freezesLeft: result.freezesLeft });
      return refresh();
    },
  });
}

export function useTaskAction() {
  const refresh = useRefreshAfterTaskChange();
  return useMutation({
    mutationFn: ({ task, action }: { task: Task; action: 'cancel' | 'freeze' | 'delete' }) =>
      action === 'delete'
        ? request('task', `/tasks/${task.id}`, { method: 'DELETE' })
        : request('task', `/tasks/${task.id}/${action}`, { method: 'POST' }),
    onSuccess: refresh,
  });
}

/** Invitatul acceptă sau refuză o activitate de grup. */
export function useInviteResponse() {
  const refresh = useRefreshAfterTaskChange();
  return useMutation({
    mutationFn: ({ task, accept }: { task: Task; accept: boolean }) =>
      request('task', `/tasks/${task.id}/${accept ? 'accept' : 'decline'}`, { method: 'POST' }),
    onSuccess: refresh,
  });
}

/** Chatul unei activități de grup; se reîmprospătează cât timp ecranul e deschis. */
export function useTaskMessages(id: number, enabled: boolean) {
  return useQuery({
    queryKey: keys.taskMessages(id),
    enabled,
    refetchInterval: 5000,
    queryFn: () => request<TaskMessage[]>('task', `/tasks/${id}/messages`),
  });
}

export function useSendTaskMessage(id: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => request<TaskMessage>('task', `/tasks/${id}/messages`, { method: 'POST', body: { text } }),
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: keys.taskMessages(id) }),
      client.invalidateQueries({ queryKey: keys.tasks }),
      client.invalidateQueries({ queryKey: keys.activityChats }),
    ]),
  });
}

/** Favorurile mele și balanța cu fiecare prieten; se reîmprospătează des, ca să vezi răspunsurile. */
export function useFavors() {
  const { status } = useAuth();
  return useQuery({
    queryKey: keys.favors,
    enabled: status === 'signedIn',
    refetchInterval: 20_000,
    queryFn: () => request<FavorList>('task', '/favors'),
  });
}

export function useRequestFavor() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: FavorInput) => request<Favor>('task', '/favors', { method: 'POST', body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.favors }),
  });
}

export type FavorAction = 'accept' | 'decline' | 'refuse' | 'cancel' | 'approve' | 'reject';

export function useFavorAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ favor, action, note }: { favor: Favor; action: FavorAction; note?: string }) =>
      request<Favor>('task', `/favors/${favor.id}/${action}`, { method: 'POST', body: action === 'reject' ? { note } : undefined }),
    // Aprobarea dă puncte celui care a făcut favorul și schimbă balanța.
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: keys.favors }),
      client.invalidateQueries({ queryKey: keys.leaderboard }),
    ]),
  });
}

/** Poza făcută cu camera din aplicație (JPEG în base64), cu locația și momentul în care a fost făcută. */
export function useSubmitFavorPhoto() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: {
      id: number; photo: string; latitude: number; longitude: number; accuracy?: number; mocked?: boolean; takenAt: string;
    }) => request<Favor>('task', `/favors/${id}/photo`, { method: 'POST', body }),
    onSuccess: (favor) => Promise.all([
      client.invalidateQueries({ queryKey: keys.favors }),
      client.invalidateQueries({ queryKey: keys.favorPhoto(favor.id) }),
    ]),
  });
}

export function useFavorPhoto(id: number, enabled: boolean) {
  return useQuery({
    queryKey: keys.favorPhoto(id),
    enabled,
    staleTime: 60_000,
    queryFn: () => request<{ dataUrl: string }>('task', `/favors/${id}/photo`),
  });
}

export function useSendChat() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => request('user', '/chat', { method: 'POST', body: { text } }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.chat }),
  });
}

export function useDeleteChat() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request('user', `/chat/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.chat }),
  });
}

export type FriendAction = 'request' | 'accept' | 'decline' | 'remove';

/** Cerere de prietenie, acceptare, refuz sau ștergere (inclusiv retragerea unei cereri trimise). */
export function useFriendAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ username, action }: { username: string; action: FriendAction }) => {
      const path = `/friends/${encodeURIComponent(username)}`;
      if (action === 'request') return request<{ status: FriendStatus }>('user', '/friends', { method: 'POST', body: { username } });
      if (action === 'remove') return request<{ status: string }>('user', path, { method: 'DELETE' });
      return request<{ status: string }>('user', `${path}/${action}`, { method: 'POST' });
    },
    // Prietenii decid și pe cine poți invita sau cui poți cere un favor.
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: keys.friends }),
      client.invalidateQueries({ queryKey: keys.profiles }),
      client.invalidateQueries({ queryKey: keys.favors }),
    ]),
  });
}

/** Îți arăți streak-ul în chatul comunității (valoarea o pune serverul). */
export function useShareStreak() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => request<{ streak: number }>('user', '/chat/streak', { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.chat }),
  });
}

/** Organizatorul trimite activitatea în chatul comunității, ca invitație. */
export function useShareActivity() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request<Task>('task', `/tasks/${id}/share`, { method: 'POST' }),
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: keys.chat }),
      client.invalidateQueries({ queryKey: keys.tasks }),
    ]),
  });
}

/** Cer să particip la o activitate din comunitate (sau îmi retrag cererea). */
export function useJoinActivity() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cancel }: { id: number; cancel?: boolean }) =>
      request<ActivityPreview>('task', `/tasks/${id}/join`, { method: cancel ? 'DELETE' : 'POST' }),
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: keys.previews }),
      client.invalidateQueries({ queryKey: keys.tasks }),
    ]),
  });
}

/** Organizatorul aprobă sau refuză o cerere de participare. */
export function useJoinRequestAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, username, approve }: { taskId: number; username: string; approve: boolean }) =>
      request<Task>('task', `/tasks/${taskId}/requests/${encodeURIComponent(username)}/${approve ? 'approve' : 'decline'}`,
        { method: 'POST' }),
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: keys.tasks }),
      client.invalidateQueries({ queryKey: keys.previews }),
      client.invalidateQueries({ queryKey: keys.activityChats }),
    ]),
  });
}

export function useAdminAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ email, action, newPassword }: {
      email: string; action: 'bonus-streak' | 'reset-freezes' | 'password' | 'delete' | 'clear-profile'; newPassword?: string;
    }) => {
      const path = `/admin/users/${encodeURIComponent(email)}`;
      if (action === 'delete') return request('user', path, { method: 'DELETE' });
      return request('user', `${path}/${action}`, { method: 'POST', body: newPassword ? { newPassword } : undefined });
    },
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: keys.adminUsers }),
      client.invalidateQueries({ queryKey: keys.leaderboard }),
    ]),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (input: { currentPassword: string; newPassword: string }) => {
      // Serverul revocă sesiunile vechi și întoarce una nouă pentru dispozitivul curent.
      const result = await request<Session & { message: string }>('user', '/users/password', { method: 'POST', body: input });
      await saveSession(result);
      return result.message;
    },
  });
}
