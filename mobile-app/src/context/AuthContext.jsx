import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { userApi, apiMessage } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const persistSession = useCallback(async (nextSession) => {
    setSession(nextSession);
    await SecureStore.setItemAsync('whatever.jwt', nextSession.token);
    await SecureStore.setItemAsync('whatever.user', JSON.stringify(nextSession.user));
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      const { data } = await userApi.post('/users/login', { email, password });
      await persistSession(data);
      return data;
    } catch (error) {
      throw new Error(apiMessage(error));
    }
  }, [persistSession]);

  const restore = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync('whatever.jwt');
      if (!token) return;
      const { data: user } = await userApi.get('/users/me');
      setSession({ token, user });
    } catch {
      await SecureStore.deleteItemAsync('whatever.jwt');
      await SecureStore.deleteItemAsync('whatever.user');
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync('whatever.jwt');
    await SecureStore.deleteItemAsync('whatever.user');
    setSession(null);
  }, []);

  useEffect(() => { restore(); }, [restore]);

  const value = useMemo(() => ({
    session,
    loading,
    login,
    logout,
    refreshUser: restore
  }), [session, loading, login, logout, restore]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth trebuie folosit în AuthProvider.');
  return context;
}
