import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { translate } from '../i18n/core';

import { ApiError, endSession, hasStoredSession, onSessionExpired, refreshSession, request, saveSession } from './api';
import type { Session, User } from './types';

type Status = 'loading' | 'offline' | 'signedOut' | 'signedIn';

type RegisterInput = { fullName: string; username: string; email: string; password: string };

type AuthContextValue = {
  status: Status;
  user: User | null;
  message: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => void;
  updateUser: (patch: Partial<User>) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // La pornire: refacem sesiunea din refresh token. Dacă serverul nu răspunde, NU ștergem sesiunea.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus('loading');
      try {
        if (!(await hasStoredSession())) {
          if (!cancelled) setStatus('signedOut');
          return;
        }
        const session = await refreshSession();
        if (cancelled) return;
        if (session) {
          setUser(session.user);
          setStatus('signedIn');
        } else {
          setStatus('signedOut');
        }
      } catch (error) {
        if (cancelled) return;
        setMessage(error instanceof Error ? error.message : translate('error.serverUnavailable'));
        setStatus('offline');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    onSessionExpired(() => {
      queryClient.clear();
      setUser(null);
      setMessage(translate('auth.sessionExpired'));
      setStatus('signedOut');
    });
    return () => onSessionExpired(null);
  }, [queryClient]);

  const startSession = useCallback(async (session: Session) => {
    await saveSession(session);
    queryClient.clear();
    setMessage(null);
    setUser(session.user);
    setStatus('signedIn');
  }, [queryClient]);

  const signIn = useCallback(async (email: string, password: string) => {
    const session = await request<Session>('user', '/users/login', { method: 'POST', body: { email, password } }, { auth: false });
    await startSession(session);
  }, [startSession]);

  const register = useCallback(async (input: RegisterInput) => {
    const session = await request<Session>('user', '/users/register', { method: 'POST', body: input }, { auth: false });
    await startSession(session);
  }, [startSession]);

  const signOut = useCallback(async () => {
    await endSession();
    queryClient.clear();
    setUser(null);
    setMessage(null);
    setStatus('signedOut');
  }, [queryClient]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    status, user, message, signIn, register, signOut, retry, updateUser,
  }), [status, user, message, signIn, register, signOut, retry, updateUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}

/** Utilizatorul autentificat (doar în ecranele protejate). */
export function useCurrentUser(): User {
  const { user } = useAuth();
  if (!user) throw new ApiError(401, translate('auth.required'));
  return user;
}
