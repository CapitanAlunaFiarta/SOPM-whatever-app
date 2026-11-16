import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

export const USER_API_URL = process.env.EXPO_PUBLIC_USER_API || 'http://10.0.2.2:8081/api';
export const TASK_API_URL = process.env.EXPO_PUBLIC_TASK_API || 'http://10.0.2.2:8082/api';

export const userApi = axios.create({ baseURL: USER_API_URL, timeout: 15000 });
export const taskApi = axios.create({ baseURL: TASK_API_URL, timeout: 15000 });

async function addToken(config) {
  const token = await SecureStore.getItemAsync('whatever.jwt');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
}

userApi.interceptors.request.use(addToken);
taskApi.interceptors.request.use(addToken);

export function apiMessage(error) {
  return error?.response?.data?.error || error?.response?.data?.message || error?.message || 'A apărut o eroare.';
}
