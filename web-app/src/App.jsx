import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import logo from './logo.png';
import MapPinPicker from './MapPinPicker.jsx';
import PwaInstallBanner from './PwaInstallBanner.jsx';
import { api, clearSession, hasStoredSession, restoreSession, saveSession, setSessionLostHandler } from './api.js';

const localDate = (offsetDays = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toLocaleDateString('en-CA');
};

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

function encodeBase64Url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function withoutExtensions(options) {
  const { extensions: _ignored, ...rest } = options;
  return rest;
}

function credentialJson(credential) {
  const response = credential.response;
  return JSON.stringify({
    id: credential.id,
    rawId: encodeBase64Url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment || undefined,
    clientExtensionResults: credential.getClientExtensionResults ? credential.getClientExtensionResults() : {},
    response: {
      clientDataJSON: encodeBase64Url(response.clientDataJSON),
      authenticatorData: response.authenticatorData && encodeBase64Url(response.authenticatorData),
      attestationObject: response.attestationObject && encodeBase64Url(response.attestationObject),
      signature: response.signature && encodeBase64Url(response.signature),
      userHandle: response.userHandle ? encodeBase64Url(response.userHandle) : null
    }
  });
}

function browserCreationOptions(options) {
  return {
    ...withoutExtensions(options),
    challenge: decodeBase64Url(options.challenge),
    user: { ...options.user, id: decodeBase64Url(options.user.id) },
    excludeCredentials: (options.excludeCredentials || []).map(item => ({ ...item, id: decodeBase64Url(item.id) }))
  };
}

function browserRequestOptions(options) {
  return {
    ...withoutExtensions(options),
    challenge: decodeBase64Url(options.challenge),
    allowCredentials: (options.allowCredentials || []).map(item => ({ ...item, id: decodeBase64Url(item.id) }))
  };
}

const emptyDraft = () => ({
  title: '', category: 'Personal', priority: 'Medium', dueDate: localDate(),
  isRecurring: false, requiresLocation: false, latitude: 45.6525, longitude: 25.5888,
  radius: 150, requiresBiometrics: false, friend: ''
});

const statusLabels = { All: 'Toate', Upcoming: 'Active', Overdue: 'Restante', Completed: 'Finalizate', Canceled: 'Anulate' };

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' });
}

function StatCard({ label, value, tone, hint }) {
  return <div className={`stat-card ${tone || ''}`}><span className="stat-label-text">{label}</span><strong className="stat-value">{value}</strong>{hint && <small className="stat-hint">{hint}</small>}</div>;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [restoring, setRestoring] = useState(hasStoredSession());
  const [authTab, setAuthTab] = useState('login');
  const [auth, setAuth] = useState({ email: '', password: '', fullName: '', username: '' });
  const [resetToken, setResetToken] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tasks, setTasks] = useState([]);
  const [messages, setMessages] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [activeNav, setActiveNav] = useState('overview');
  const [showMap, setShowMap] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chatInput, setChatInput] = useState('');

  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    setSessionLostHandler(() => { setUser(null); setError('Sesiunea a expirat. Autentifică-te din nou.'); });
    const url = new URL(window.location.href);
    if (url.pathname === '/reset' || url.searchParams.get('code')) {
      setAuthTab('reset-confirm');
      setResetToken(url.searchParams.get('code') || '');
      window.history.replaceState(null, '', '/');
    }
    if (hasStoredSession()) {
      restoreSession()
        .then(data => { if (data) setUser(data.user); })
        .catch(() => setError('Serverul pornește (poate dura până la un minut). Reîncarcă pagina în câteva secunde.'))
        .finally(() => setRestoring(false));
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [taskList, chat, me] = await Promise.all([
        api('task', '/tasks'),
        api('user', '/chat'),
        api('user', '/users/me')
      ]);
      setTasks(taskList);
      setMessages(chat.slice().reverse());
      setUser(current => current ? { ...current, ...me } : current);
      if (me.role === 'ADMIN') setAdminUsers(await api('user', '/admin/users'));
    } catch (e) {
      setError(e.message);
    }
  }, [user?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadData();
    if (!user) return undefined;
    const interval = setInterval(() => { if (document.visibilityState === 'visible') loadData(); }, 15000);
    return () => clearInterval(interval);
  }, [loadData, user?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  const notify = (message) => { setError(''); setNotice(message); setTimeout(() => setNotice(''), 4500); };
  const updateDraft = (key, value) => setDraft(current => ({ ...current, [key]: value }));

  const submitAuth = async event => {
    event.preventDefault(); setError('');
    try {
      if (authTab === 'reset-request') {
        const result = await api('user', '/users/password-reset/request', {
          method: 'POST', body: { email: auth.email, username: auth.username }
        }, { auth: false });
        setAuthTab('reset-confirm'); notify(result.message); return;
      }
      if (authTab === 'reset-confirm') {
        const result = await api('user', '/users/password-reset/confirm', {
          method: 'POST', body: { resetToken, newPassword: auth.password }
        }, { auth: false });
        setAuthTab('login'); setResetToken(''); notify(result.message); return;
      }
      const path = authTab === 'login' ? '/users/login' : '/users/register';
      const body = authTab === 'login' ? { email: auth.email, password: auth.password } : auth;
      const data = await api('user', path, { method: 'POST', body }, { auth: false });
      saveSession(data);
      setUser(data.user);
      setAuth(current => ({ ...current, password: '' }));
      notify('Bine ai revenit în Whatever.');
    } catch (e) { setError(e.message); }
  };

  const logout = async () => {
    await clearSession();
    setUser(null); setTasks([]); setMessages([]); setAdminUsers([]); setActiveNav('overview');
  };

  const getCurrentPosition = (purpose) => new Promise((resolve, reject) => {
    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      reject(new Error('GPS-ul funcționează doar pe HTTPS.'));
      return;
    }
    if (!navigator.geolocation) {
      reject(new Error('Browserul nu oferă geolocație.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, positionError => {
      const reasons = {
        1: 'Accesul la locație a fost blocat. Permite Location pentru acest site din setările browserului.',
        2: 'Locația nu este disponibilă. Activează GPS-ul și încearcă din nou.',
        3: 'Cererea GPS a expirat. Mută-te într-un loc cu semnal mai bun și încearcă din nou.'
      };
      reject(new Error(`${purpose}: ${reasons[positionError.code] || 'locația nu a putut fi citită.'}`));
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });

  const useCurrentLocation = async () => {
    try {
      const position = await getCurrentPosition('Locația nu a putut fi obținută');
      updateDraft('latitude', Number(position.coords.latitude.toFixed(5)));
      updateDraft('longitude', Number(position.coords.longitude.toFixed(5)));
      setShowMap(true); notify('Pinul a fost mutat pe locația curentă.');
    } catch (e) {
      setError(e.message);
    }
  };

  const saveTask = async event => {
    event.preventDefault(); setBusy(true);
    try {
      const path = editingId ? `/tasks/${editingId}` : '/tasks';
      await api('task', path, { method: editingId ? 'PUT' : 'POST', body: draft });
      setDraft(emptyDraft()); setEditingId(null); setShowMap(false); await loadData();
      notify(editingId ? 'Activitatea a fost actualizată.' : 'Activitatea a fost creată.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const completeTask = async task => {
    if (busy) return;
    setBusy(true);
    try {
      const body = {};
      if (task.requiresLocation) {
        const position = await getCurrentPosition('Locația este necesară pentru confirmarea task-ului');
        body.latitude = position.coords.latitude;
        body.longitude = position.coords.longitude;
        body.accuracy = position.coords.accuracy;
      }
      if (task.requiresBiometrics) {
        if (!window.PublicKeyCredential || !navigator.credentials) throw new Error('Passkey-urile nu sunt disponibile în acest browser.');
        const options = await api('user', '/users/webauthn/assertion/options', { method: 'POST' });
        const credential = await navigator.credentials.get({ publicKey: browserRequestOptions(options.publicKey) });
        const result = await api('user', '/users/webauthn/assertion/finish', {
          method: 'POST', body: { credentialJson: credentialJson(credential), taskId: task.id }
        });
        body.biometricToken = result.biometricToken;
      }
      const result = await api('task', `/tasks/${task.id}/verify-complete`, { method: 'POST', body });
      await loadData();
      notify(`Task confirmat. Streak: ${result.streak} ${result.streak === 1 ? 'zi' : 'zile'} · ${result.points} puncte.`);
    } catch (e) {
      if (e.name === 'NotAllowedError') {
        setError('Confirmarea cu passkey a fost anulată sau a expirat. Dacă nu ai activat încă passkey-ul, apasă „🔐 Passkey” sus.');
      } else {
        setError(e.message);
      }
    } finally { setBusy(false); }
  };

  const taskAction = async (path, options, message, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    try { await api('task', path, options); await loadData(); notify(message); }
    catch (e) { setError(e.message); }
  };

  const registerBiometric = async () => {
    try {
      if (!window.PublicKeyCredential || !navigator.credentials) throw new Error('Passkey-urile nu sunt disponibile în acest browser.');
      const options = await api('user', '/users/webauthn/register/options', { method: 'POST' });
      const credential = await navigator.credentials.create({ publicKey: browserCreationOptions(options.publicKey) });
      await api('user', '/users/webauthn/register/finish', { method: 'POST', body: { credentialJson: credentialJson(credential) } });
      notify('Passkey-ul a fost activat pentru cont.');
    } catch (e) {
      if (e.name === 'NotAllowedError') {
        setError('Activarea passkey-ului a fost anulată sau nu este permisă de browser.');
      } else {
        setError(e.message);
      }
    }
  };

  const adminAction = async (email, action, body) => {
    try {
      await api('user', `/admin/users/${encodeURIComponent(email)}/${action}`, { method: 'POST', body });
      await loadData(); notify('Acțiunea de administrare a fost aplicată.');
    } catch (e) { setError(e.message); }
  };

  const sendChat = async event => {
    event.preventDefault();
    if (!chatInput.trim()) return;
    try {
      await api('user', '/chat', { method: 'POST', body: { text: chatInput.trim() } });
      setChatInput(''); await loadData();
    } catch (e) { setError(e.message); }
  };

  const filteredTasks = useMemo(() => tasks.filter(task => {
    const matchesSearch = `${task.title} ${task.category}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (statusFilter === 'All' || task.status === statusFilter);
  }), [tasks, search, statusFilter]);

  const stats = useMemo(() => ({
    total: tasks.length,
    completed: tasks.filter(task => task.status === 'Completed').length,
    overdue: tasks.filter(task => task.status === 'Overdue').length,
    active: tasks.filter(task => ['Upcoming', 'Overdue'].includes(task.status)).length
  }), [tasks]);
  const progress = stats.total ? Math.round(stats.completed / stats.total * 100) : 0;

  if (restoring) {
    return <div className="auth-wrapper"><div className="auth-card"><div className="auth-brand"><img src={logo} alt="Whatever" className="auth-logo" /><h1>WHATEVER</h1><p>Se încarcă sesiunea… (prima pornire a serverului poate dura până la un minut)</p></div></div></div>;
  }

  if (!user) return <AuthScreen {...{ authTab, setAuthTab, auth, setAuth, resetToken, setResetToken, error, submitAuth }} />;

  return <div className="whatever-app">
    <PwaInstallBanner />
    <header className="app-header">
      <div className="brand-box"><img src={logo} alt="Whatever" className="brand-logo" /><div><h1>WHATEVER</h1><p>Planifică. Acționează. Progresează.</p></div></div>
      <div className="header-actions"><span className="user-chip"><b>{user.fullName}</b><small>@{user.username} · 🔥 {user.streak ?? 0} · ⭐ {user.points ?? 0} · ❄ {user.freezesLeft ?? 3}</small></span><div className="header-security-actions"><span className={`role-badge ${isAdmin ? 'role-admin' : 'role-user'}`}>{isAdmin ? 'Administrator' : 'Utilizator'}</span><button className="passkey-button" onClick={registerBiometric}>🔐 Passkey</button></div><button className="btn-logout" onClick={logout}>Ieșire</button></div>
    </header>
    <nav className="top-navigation">
      <button className={activeNav === 'overview' ? 'active' : ''} onClick={() => setActiveNav('overview')}>▦ Overview</button>
      <button className={activeNav === 'tasks' ? 'active' : ''} onClick={() => setActiveNav('tasks')}>✓ Activități</button>
      <button className={activeNav === 'chat' ? 'active' : ''} onClick={() => setActiveNav('chat')}>◌ Comunitate</button>
      {isAdmin && <button className={`admin-nav-btn ${activeNav === 'admin' ? 'active' : ''}`} onClick={() => setActiveNav('admin')}>⚙ Admin</button>}
    </nav>
    {error && <div className="alert error app-alert"><span>{error}</span><button className="alert-close" aria-label="Închide mesajul" onClick={() => setError('')}>×</button></div>}
    {notice && <div className="alert success">{notice}</div>}
    {activeNav === 'overview' && <Overview {...{ stats, progress, tasks, setActiveNav, isAdmin, user }} />}
    {activeNav === 'tasks' && <main className="workspace">
      <section className="panel-card task-form-card"><div className="section-heading"><div><span className="eyebrow">WORKSPACE</span><h2>{editingId ? 'Editează activitatea' : 'Creează o activitate'}</h2></div><span className="live-dot">● sincronizat</span></div>
        <form onSubmit={saveTask} className="task-form">
          <input className="input-large" required maxLength="255" placeholder="Ce vrei să realizezi?" value={draft.title} onChange={e => updateDraft('title', e.target.value)} />
          <div className="form-grid task-details-grid"><label>Categorie<select value={draft.category} onChange={e => updateDraft('category', e.target.value)}><option>Personal</option><option>Facultate</option><option>Sport</option><option>Proiect Echipă</option><option>Sănătate</option></select></label><label>Prioritate<select value={draft.priority} onChange={e => updateDraft('priority', e.target.value)}><option>Low</option><option>Medium</option><option>High</option></select></label><label>Scadență<input type="date" required value={draft.dueDate} onChange={e => updateDraft('dueDate', e.target.value)} /></label></div>
          <div className="option-row task-options"><label className="toggle"><input type="checkbox" checked={draft.requiresLocation} onChange={e => updateDraft('requiresLocation', e.target.checked)} /><span />Confirmare în locație</label><label className="toggle"><input type="checkbox" checked={draft.requiresBiometrics} onChange={e => updateDraft('requiresBiometrics', e.target.checked)} /><span />Biometrie la finalizare</label><label className="toggle"><input type="checkbox" checked={draft.isRecurring} onChange={e => updateDraft('isRecurring', e.target.checked)} /><span />Zilnic (recurentă)</label></div>
          <div className="task-action-row">
            {draft.requiresLocation && <div className="location-panel"><div className="location-actions task-location-actions"><button type="button" className="btn-secondary" onClick={() => setShowMap(current => !current)}>🗺 {showMap ? 'Ascunde harta' : 'Alege pe hartă'}</button><button type="button" className="btn-secondary" onClick={useCurrentLocation}>⌖ Folosește locația mea</button><label>Rază (m)<input type="number" min="10" max="10000" value={draft.radius} onChange={e => updateDraft('radius', Number(e.target.value))} /></label></div>{showMap && <MapPinPicker latitude={draft.latitude} longitude={draft.longitude} radius={draft.radius} onChangeCoords={(latitude, longitude) => setDraft(current => ({ ...current, latitude, longitude }))} />}<small className="coordinates">Lat {draft.latitude} · Lng {draft.longitude} · raza admisă {draft.radius}m</small></div>}
            <div className="form-footer task-form-actions"><button className="btn-primary" disabled={busy}>{busy ? 'Se salvează…' : editingId ? 'Salvează modificările' : '+ Adaugă activitatea'}</button>{editingId && <button type="button" className="btn-secondary" onClick={() => { setEditingId(null); setDraft(emptyDraft()); }}>Renunță</button>}</div>
          </div>
        </form>
      </section>
      <section className="panel-card"><div className="section-heading"><div><span className="eyebrow">ACTIVITĂȚI</span><h2>Lista ta</h2></div><div className="filters"><input placeholder="Caută titlu sau categorie..." value={search} onChange={e => setSearch(e.target.value)} />{Object.keys(statusLabels).map(status => <button key={status} className={statusFilter === status ? 'selected' : ''} onClick={() => setStatusFilter(status)}>{statusLabels[status]}</button>)}</div></div><div className="task-list">{filteredTasks.length ? filteredTasks.map(task => <TaskCard key={task.id} task={task} busy={busy}
        onComplete={completeTask}
        onDelete={() => taskAction(`/tasks/${task.id}`, { method: 'DELETE' }, 'Activitatea a fost ștearsă.', 'Ștergi definitiv această activitate?')}
        onCancel={() => taskAction(`/tasks/${task.id}/cancel`, { method: 'POST' }, 'Activitatea a fost anulată.')}
        onFreeze={() => taskAction(`/tasks/${task.id}/freeze`, { method: 'POST' }, 'Freeze folosit: activitatea e mutată pe azi.')}
        onEdit={() => { setEditingId(task.id); setDraft({ ...emptyDraft(), ...task, radius: task.radius || 150 }); setShowMap(Boolean(task.requiresLocation)); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />) : <div className="empty-state"><span>✦</span><h3>Nicio activitate aici</h3><p>Începe prin a crea primul tău obiectiv.</p></div>}</div></section>
    </main>}
    {activeNav === 'chat' && <Chat messages={messages} chatInput={chatInput} setChatInput={setChatInput} onSend={sendChat} />}
    {activeNav === 'admin' && isAdmin && <AdminPanel users={adminUsers} currentEmail={user.email} onAction={adminAction} />}
  </div>;
}

function AuthScreen({ authTab, setAuthTab, auth, setAuth, resetToken, setResetToken, error, submitAuth }) {
  return <div className="auth-wrapper"><div className="auth-card"><PwaInstallBanner /><div className="auth-brand"><img src={logo} alt="Whatever" className="auth-logo" /><span className="eyebrow">YOUR PERSONAL OPERATING SYSTEM</span><h1>WHATEVER</h1><p>Un spațiu clar pentru lucrurile care contează.</p></div><div className="auth-tabs"><button className={authTab === 'login' ? 'active' : ''} onClick={() => setAuthTab('login')}>Autentificare</button><button className={authTab === 'register' ? 'active' : ''} onClick={() => setAuthTab('register')}>Cont nou</button><button className={authTab.startsWith('reset') ? 'active' : ''} onClick={() => setAuthTab('reset-request')}>Resetare</button></div>{error && <div className="alert error">{error}</div>}<form onSubmit={submitAuth} className="auth-form">{authTab === 'register' && <><label>Nume complet<input required value={auth.fullName} onChange={e => setAuth({ ...auth, fullName: e.target.value })} /></label><label>Username<input required pattern="@?[A-Za-z0-9._\-]{3,30}" title="3-30 caractere: litere, cifre, punct, _ sau -" value={auth.username} onChange={e => setAuth({ ...auth, username: e.target.value })} /></label></>}{authTab !== 'reset-confirm' && <label>Email<input type="email" required autoComplete="email" value={auth.email} onChange={e => setAuth({ ...auth, email: e.target.value })} /></label>}{authTab === 'reset-request' && <label>Username<input required value={auth.username} onChange={e => setAuth({ ...auth, username: e.target.value })} /></label>}{authTab === 'reset-confirm' && <label>Codul primit pe email<input required placeholder="XXXXX-XXXXX" value={resetToken} onChange={e => setResetToken(e.target.value)} /></label>}{(authTab === 'login' || authTab === 'register' || authTab === 'reset-confirm') && <label>{authTab === 'reset-confirm' ? 'Parola nouă' : 'Parolă'}<input type="password" minLength={authTab === 'login' ? undefined : 12} required autoComplete={authTab === 'login' ? 'current-password' : 'new-password'} value={auth.password} onChange={e => setAuth({ ...auth, password: e.target.value })} /></label>}<button className="btn-primary btn-auth-submit">{authTab === 'login' ? 'Intră în cont' : authTab === 'register' ? 'Creează contul' : authTab === 'reset-request' ? 'Trimite codul' : 'Schimbă parola'}</button></form></div></div>;
}

function Overview({ stats, progress, tasks, setActiveNav, isAdmin, user }) {
  const upcoming = tasks.filter(task => ['Upcoming', 'Overdue'].includes(task.status) && !task.completedToday).slice(0, 4);
  return <main className="workspace"><section className="hero-panel hero-card"><div className="hero-copy"><span className="eyebrow">BUN VENIT ÎNAPOI</span><h2>Concentrează-te pe următorul pas.</h2><p>{user.streak > 0 ? `Ai un streak de ${user.streak} ${user.streak === 1 ? 'zi' : 'zile'}. Finalizează o activitate azi ca să-l păstrezi.` : 'Finalizează o activitate azi ca să pornești un streak.'}</p><button className="btn-primary hero-action" onClick={() => setActiveNav('tasks')}>Vezi activitățile →</button></div><div className="hero-progress"><div className="progress-ring"><strong>{progress}%</strong><span>progres</span></div><div className="hero-progress-track"><span style={{ width: `${progress}%` }} /></div></div></section><div className="stats-grid"><StatCard label="Streak" value={`🔥 ${user.streak ?? 0}`} tone="orange" hint="zile la rând" /><StatCard label="Puncte" value={user.points ?? 0} tone="green" hint="activități finalizate" /><StatCard label="În lucru" value={stats.active} tone="blue" hint="următorul pas" /><StatCard label="Restante" value={stats.overdue} tone="orange" hint="necesită atenție" /></div><section className="panel-card"><div className="section-heading"><div><span className="eyebrow">URMĂTORII PAȘI</span><h2>Planul tău</h2></div><button className="btn-secondary" onClick={() => setActiveNav('tasks')}>Toate activitățile</button></div>{upcoming.length ? <div className="mini-task-list">{upcoming.map(task => <div key={task.id} className="mini-task"><span className="mini-dot" /><div><b>{task.title}</b><small>{task.category} · scadent {task.dueDate}{task.status === 'Overdue' ? ' · restant' : ''}</small></div><span className="priority">{task.priority}</span></div>)}</div> : <div className="empty-state compact"><span>✓</span><h3>Ziua ta este la zi</h3><p>Nu ai activități urgente.</p></div>}</section>{isAdmin && <div className="admin-callout" onClick={() => setActiveNav('admin')}><span>⚙</span><div><b>Panou administrator</b><small>Conturi, streak-uri și control platformă</small></div><strong>→</strong></div>}</main>;
}

function TaskCard({ task, busy, onComplete, onDelete, onCancel, onFreeze, onEdit }) {
  const active = task.status === 'Upcoming' || task.status === 'Overdue';
  const canComplete = task.isOwner && active && !task.completedToday;
  return <article className={`task-card status-${task.status.toLowerCase()}`}><div className="task-card-top"><div className="task-icon">{task.category === 'Sport' ? '⚡' : task.category === 'Sănătate' ? '♡' : task.category === 'Facultate' ? '✎' : '◆'}</div><div className="task-main"><div className="task-title-line"><h3>{task.title}</h3><span className={`status-badge ${task.status}`}>{statusLabels[task.status] || task.status}</span></div><div className="task-meta"><span>{task.category}</span><span>·</span><span>Scadență {task.dueDate}</span>{task.priority && <span className={`priority ${task.priority}`}>{task.priority}</span>}</div>{task.isRecurring && <div className="security-meta">↻ Zilnic · finalizată de {task.streakCount} ori{task.completedToday ? ' · ✓ făcută azi' : ''}</div>}{task.requiresLocation && <div className="security-meta">⌖ Verificare GPS · raza {task.radius}m</div>}{task.requiresBiometrics && <div className="security-meta">⌁ Biometrie necesară</div>}{!task.isOwner && <div className="security-meta">👥 Partajată de @{task.ownerUsername}</div>}</div></div>{task.isOwner && <div className="task-actions">{canComplete && <button className="btn-primary small" disabled={busy} onClick={() => onComplete(task)}>✓ Confirmă</button>}{task.status === 'Overdue' && <button className="btn-secondary small" onClick={onFreeze}>❄ Freeze</button>}{active && <button className="icon-button" onClick={onEdit}>Edit</button>}<button className="icon-button danger" onClick={onDelete}>Șterge</button>{active && <button className="icon-button" onClick={onCancel}>Anulează</button>}</div>}</article>;
}

function Chat({ messages, chatInput, setChatInput, onSend }) {
  return <main className="workspace narrow"><section className="panel-card chat-section"><div className="section-heading"><div><span className="eyebrow">COMUNITATE</span><h2>Chat global</h2></div><span className="live-dot">● live</span></div><div className="chat-messages-box">{messages.map(message => <div className="chat-bubble" key={message.id}><div><b>{message.senderName}</b><small>@{message.senderUsername} · {formatTime(message.createdAt || message.time)}</small></div><span>{message.text}</span></div>)}</div><form onSubmit={onSend} className="chat-input-row"><input required maxLength="2000" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Scrie un mesaj pentru comunitate..." /><button className="btn-primary">Trimite</button></form></section></main>;
}

function AdminPanel({ users, currentEmail, onAction }) {
  const [query, setQuery] = useState('');
  const visible = users.filter(user => `${user.fullName} ${user.username} ${user.email}`.toLowerCase().includes(query.toLowerCase()));
  const resetPassword = (email) => {
    const newPassword = window.prompt('Parola nouă (minim 12 caractere):');
    if (newPassword) onAction(email, 'password', { newPassword });
  };
  return <main className="workspace"><section className="hero-panel admin-hero"><div><span className="eyebrow">RESTRICTED ACCESS</span><h2>Control Center</h2><p>Administrare platformă și monitorizare comunitate.</p></div><div className="admin-stat"><strong>{users.length}</strong><span>conturi create</span></div></section><section className="panel-card"><div className="section-heading"><div><span className="eyebrow">USER DIRECTORY</span><h2>Conturi și streak-uri</h2></div><input className="search-input" placeholder="Caută utilizator..." value={query} onChange={e => setQuery(e.target.value)} /></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Utilizator</th><th>Email</th><th>Rol</th><th>Streak</th><th>Puncte</th><th>Freeze</th><th>Acțiuni</th></tr></thead><tbody>{visible.map(user => <tr key={user.email}><td><b>{user.fullName}</b><small>@{user.username}</small></td><td>{user.email}</td><td><span className="role-badge">{user.role}</span></td><td><strong className="streak-value">🔥 {user.streak}</strong></td><td>⭐ {user.points}</td><td>❄ {user.freezesLeft}</td><td className="table-actions"><button onClick={() => onAction(user.email, 'bonus-streak')}>+5 streak</button><button onClick={() => onAction(user.email, 'reset-freezes')}>Reset freeze</button>{user.email !== currentEmail && <button className="danger-text" onClick={() => resetPassword(user.email)}>Reset parolă</button>}</td></tr>)}</tbody></table></div></section></main>;
}
