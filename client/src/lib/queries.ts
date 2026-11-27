import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { translate } from '../i18n/core';

import { request, saveSession } from './api';
import { useAuth } from './auth';
import { biometricTokenForTask } from './biometrics';
import { currentPosition } from './location';
import type {
  AdminUser, ChatMessage, CompletionResult, Friend, LeaderboardEntry, Recap, Session, Task, TaskInput, User,
} from './types';

export const keys = {
  me: ['me'] as const,
  tasks: ['tasks'] as const,
  chat: ['chat'] as const,
  friends: ['friends'] as const,
  leaderboard: ['leaderboard'] as const,
  adminUsers: ['admin-users'] as const,
  recap: ['recap'] as const,
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
    queryFn: () => request<Friend[]>('user', '/friends'),
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

export function useFriendAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ username, remove }: { username: string; remove?: boolean }) =>
      remove
        ? request('user', `/friends/${encodeURIComponent(username)}`, { method: 'DELETE' })
        : request('user', '/friends', { method: 'POST', body: { username } }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.friends }),
  });
}

export function useAdminAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ email, action, newPassword }: {
      email: string; action: 'bonus-streak' | 'reset-freezes' | 'password' | 'delete'; newPassword?: string;
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
