// Client API comun pentru site: token de acces în memorie, refresh token în localStorage,
// reîncercare automată după refresh când serverul răspunde 401.
const BASES = {
  user: import.meta.env.VITE_USER_API || 'http://localhost:8081/api',
  task: import.meta.env.VITE_TASK_API || 'http://localhost:8082/api'
};
const REFRESH_KEY = 'whatever.refreshToken';

let accessToken = null;
let refreshToken = readStored();
let refreshing = null;
let onSessionLost = () => {};

function readStored() {
  try { return localStorage.getItem(REFRESH_KEY); } catch { return null; }
}

function store(value) {
  try {
    if (value) localStorage.setItem(REFRESH_KEY, value);
    else localStorage.removeItem(REFRESH_KEY);
  } catch { /* storage indisponibil (mod privat) */ }
}

export function setSessionLostHandler(handler) {
  onSessionLost = handler;
}

export function hasStoredSession() {
  return Boolean(refreshToken);
}

export function saveSession(data) {
  accessToken = data.token;
  refreshToken = data.refreshToken;
  store(refreshToken);
}

export async function clearSession() {
  const token = refreshToken;
  accessToken = null;
  refreshToken = null;
  store(null);
  if (token) {
    try { await send('user', '/users/logout', { method: 'POST', body: { refreshToken: token } }, false); } catch { /* ignorăm */ }
  }
}

/** Reface sesiunea din refresh token (la încărcarea paginii). Întoarce {token, user} sau null. */
export async function restoreSession() {
  if (!refreshToken) return null;
  return refreshOnce();
}

function refreshOnce() {
  if (!refreshing) {
    refreshing = (async () => {
      const response = await send('user', '/users/refresh', { method: 'POST', body: { refreshToken } }, false);
      if (response.status === 401 || response.status === 400) {
        accessToken = null; refreshToken = null; store(null);
        return null;
      }
      const data = await parse(response);
      if (!response.ok) throw new Error(data.error || 'Serverul nu răspunde momentan.');
      saveSession(data);
      return data;
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function send(service, path, { method = 'GET', body } = {}, withAuth = true) {
  try {
    return await fetch(`${BASES[service]}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(withAuth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new Error('Serverul nu poate fi contactat. Dacă a stat nefolosit, pornește în până la un minut — încearcă din nou.');
  }
}

async function parse(response) {
  return response.json().catch(() => ({}));
}

/** Apel API. options: {method, body}; settings: {auth: true}. */
export async function api(service, path, options = {}, { auth = true } = {}) {
  let response = await send(service, path, options, auth);
  if (response.status === 401 && auth && refreshToken) {
    const refreshed = await refreshOnce();
    if (refreshed) response = await send(service, path, options, auth);
  }
  const data = await parse(response);
  if (response.status === 401 && auth) {
    accessToken = null; refreshToken = null; store(null);
    onSessionLost();
  }
  if (!response.ok) throw new Error(data.error || `Eroare server (${response.status}).`);
  return data;
}
