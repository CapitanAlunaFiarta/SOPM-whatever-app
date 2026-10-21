import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import logo from './logo.png';
import MapPinPicker from './MapPinPicker.jsx';
import PwaInstallBanner from './PwaInstallBanner.jsx';

const USER_API = import.meta.env.VITE_USER_API || 'http://localhost:8081/api';
const TASK_API = import.meta.env.VITE_TASK_API || 'http://localhost:8082/api';
const ADMIN_EMAIL = 'csebi63@gmail.com';
const today = new Date().toISOString().slice(0, 10);

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

function encodeBase64Url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function validWebAuthnExtensions(options) {
  if (!options.extensions || typeof options.extensions !== 'object') return options;
  const extensions = { ...options.extensions };
  delete extensions.appid;
  return Object.keys(extensions).length ? { ...options, extensions } : (() => {
    const { extensions: _ignored, ...withoutExtensions } = options;
    return withoutExtensions;
  })();
}

function credentialJson(credential) {
  const response = credential.response;
  return JSON.stringify({
    id: credential.id, rawId: encodeBase64Url(credential.rawId), type: credential.type,
    response: {
      clientDataJSON: encodeBase64Url(response.clientDataJSON),
      authenticatorData: response.authenticatorData && encodeBase64Url(response.authenticatorData),
      attestationObject: response.attestationObject && encodeBase64Url(response.attestationObject),
      signature: response.signature && encodeBase64Url(response.signature),
      userHandle: response.userHandle && encodeBase64Url(response.userHandle)
    }
  });
}

function browserCreationOptions(options) {
  return {
    ...validWebAuthnExtensions(options), challenge: decodeBase64Url(options.challenge),
    user: { ...options.user, id: decodeBase64Url(options.user.id) },
    excludeCredentials: (options.excludeCredentials || []).map(item => ({ ...item, id: decodeBase64Url(item.id) }))
  };
}

function browserRequestOptions(options) {
  return {
    ...validWebAuthnExtensions(options), challenge: decodeBase64Url(options.challenge),
    allowCredentials: (options.allowCredentials || []).map(item => ({ ...item, id: decodeBase64Url(item.id) }))
  };
}

async function request(url, options = {}, token) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers }
    });
  } catch {
    throw new Error(`Serverul nu poate fi contactat. Verifică în Netlify VITE_USER_API/VITE_TASK_API și CORS_ORIGIN în Render. URL încercat: ${url}`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Server error');
  return body;
}

const emptyDraft = {
  title: '', category: 'Personal', priority: 'Medium', dueDate: today,
  isRecurring: false, requiresLocation: false, latitude: 45.6525, longitude: 25.5888,
  radius: 150, requiresBiometrics: false, friend: ''
};

function StatCard({ label, value, tone, hint }) {
  return <div className={`stat-card ${tone || ''}`}><span className="stat-label-text">{label}</span><strong className="stat-value">{value}</strong>{hint && <small className="stat-hint">{hint}</small>}</div>;
}

export default function App() {
  const [session, setSession] = useState(null);
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

  const token = session?.token;
  const isAdmin = session?.user?.email?.toLowerCase() === ADMIN_EMAIL;

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const data = await Promise.all([
        request(`${TASK_API}/tasks`, {}, token),
        request(`${USER_API}/chat`, {}, token)
      ]);
      setTasks(data[0]);
      setMessages(data[1].slice().reverse());
      if (isAdmin) setAdminUsers(await request(`${USER_API}/admin/users`, {}, token));
    } catch (e) {
      if (e.message.includes('Autentificare')) setSession(null);
      else setError(e.message);
    }
  }, [token, isAdmin]);

  useEffect(() => {
    loadData();
    if (!token) return undefined;
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData, token]);

  const notify = (message) => { setError(''); setNotice(message); setTimeout(() => setNotice(''), 4500); };
  const updateDraft = (key, value) => setDraft(current => ({ ...current, [key]: value }));

  const submitAuth = async event => {
    event.preventDefault(); setError('');
    try {
      if (authTab === 'reset-request') {
        await request(`${USER_API}/users/password-reset/request`, {
          method: 'POST', body: JSON.stringify({ email: auth.email, username: auth.username })
        });
        setAuthTab('reset-confirm'); notify('Dacă datele sunt corecte, codul a fost trimis pe email.'); return;
      }
      if (authTab === 'reset-confirm') {
        await request(`${USER_API}/users/password-reset/confirm`, {
          method: 'POST', body: JSON.stringify({ resetToken, newPassword: auth.password })
        });
        setAuthTab('login'); setResetToken(''); notify('Parola a fost schimbată.'); return;
      }
      const path = authTab === 'login' ? '/users/login' : '/users/register';
      const body = authTab === 'login' ? { email: auth.email, password: auth.password } : auth;
      setSession(await request(`${USER_API}${path}`, { method: 'POST', body: JSON.stringify(body) }));
      notify('Bine ai revenit în Whatever.');
    } catch (e) { setError(e.message); }
  };

  const getCurrentPosition = (purpose) => new Promise((resolve, reject) => {
    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      reject(new Error('GPS-ul funcționează doar pe HTTPS. Deschide aplicația prin domeniul HTTPS, nu printr-un preview HTTP.'));
      return;
    }
    if (!navigator.geolocation) {
      reject(new Error('Browserul nu oferă geolocație.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, positionError => {
      const messages = {
        1: 'Accesul la locație a fost blocat. Permite Location pentru acest site din setările browserului.',
        2: 'Locația nu este disponibilă. Activează GPS-ul și încearcă din nou.',
        3: 'Cererea GPS a expirat. Mută-te într-un loc cu semnal mai bun și încearcă din nou.'
      };
      reject(new Error(`${purpose}: ${messages[positionError.code] || 'locația nu a putut fi citită.'}`));
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
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId ? `${TASK_API}/tasks/${editingId}` : `${TASK_API}/tasks`;
      await request(url, { method, body: JSON.stringify(draft) }, token);
      setDraft(emptyDraft); setEditingId(null); setShowMap(false); await loadData();
      notify(editingId ? 'Activitatea a fost actualizată.' : 'Activitatea a fost creată.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const completeTask = async task => {
    setBusy(true);
    try {
      let latitude = 0; let longitude = 0;
      if (task.requiresLocation) {
        const position = await getCurrentPosition('Locația este necesară pentru confirmarea task-ului');
        latitude = position.coords.latitude; longitude = position.coords.longitude;
      }
      let biometricToken;
      if (task.requiresBiometrics) {
        if (!window.PublicKeyCredential || !navigator.credentials) throw new Error('WebAuthn nu este disponibil pe acest dispozitiv.');
        const options = await request(`${USER_API}/users/webauthn/assertion/options`, { method: 'POST' }, token);
        const credential = await navigator.credentials.get({ publicKey: browserRequestOptions(options.publicKey) });
        const result = await request(`${USER_API}/users/webauthn/assertion/finish`, {
          method: 'POST', body: JSON.stringify({ credentialJson: credentialJson(credential), taskId: task.id })
        }, token);
        biometricToken = result.biometricToken;
      }
      await request(`${TASK_API}/tasks/${task.id}/verify-complete`, {
        method: 'POST', body: JSON.stringify({ latitude, longitude, biometricToken })
      }, token);
      await loadData(); notify('Task confirmat și sincronizat.');
    } catch (e) {
      if (e.name === 'NotAllowedError') {
        setError('Biometria a fost refuzată sau a expirat. Apasă Confirmă din nou și acceptă amprenta/Face ID; dacă nu ai activat Passkey-ul, activează-l din Cont.');
      } else {
        setError(e.message);
      }
    } finally { setBusy(false); }
  };

  const deleteTask = async id => {
    if (!window.confirm('Ștergi definitiv această activitate?')) return;
    try { await request(`${TASK_API}/tasks/${id}`, { method: 'DELETE' }, token); await loadData(); notify('Activitatea a fost ștearsă.'); }
    catch (e) { setError(e.message); }
  };

  const cancelTask = async id => {
    try { await request(`${TASK_API}/tasks/${id}/cancel`, { method: 'POST' }, token); await loadData(); notify('Activitatea a fost anulată.'); }
    catch (e) { setError(e.message); }
  };

  const freezeTask = async id => {
    try { await request(`${TASK_API}/tasks/${id}/freeze`, { method: 'POST' }, token); await loadData(); notify('Streak Freeze folosit.'); }
    catch (e) { setError(e.message); }
  };

  const registerBiometric = async () => {
    try {
      if (!window.PublicKeyCredential || !navigator.credentials) throw new Error('WebAuthn nu este disponibil pe acest dispozitiv.');
      const options = await request(`${USER_API}/users/webauthn/register/options`, { method: 'POST' }, token);
      const credential = await navigator.credentials.create({ publicKey: browserCreationOptions(options) });
      await request(`${USER_API}/users/webauthn/register/finish`, {
        method: 'POST', body: JSON.stringify({ credentialJson: credentialJson(credential) })
      }, token);
      notify('Passkey-ul a fost activat pentru cont.');
    } catch (e) {
      if (e.name === 'NotAllowedError') {
        setError('Activarea biometriei a fost anulată sau nu este permisă de browser. Folosește HTTPS și activează Passkey-ul pe acest dispozitiv.');
      } else {
        setError(e.message);
      }
    }
  };

  const adminAction = async (email, action, body) => {
    try {
      await request(`${USER_API}/admin/users/${encodeURIComponent(email)}/${action}`, {
        method: 'POST', body: body ? JSON.stringify(body) : undefined
      }, token);
      await loadData(); notify('Acțiunea de administrare a fost aplicată.');
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

  if (!session) return <AuthScreen {...{ authTab, setAuthTab, auth, setAuth, resetToken, setResetToken, error, submitAuth }} />;

  return <div className="whatever-app">
    <PwaInstallBanner />
    <header className="app-header">
      <div className="brand-box"><img src={logo} alt="Whatever" className="brand-logo" /><div><h1>WHATEVER</h1><p>Planifică. Acționează. Progresează.</p></div></div>
      <div className="header-actions"><span className="user-chip"><b>{session.user.fullName}</b><small>{isAdmin ? 'Super Administrator' : `@${session.user.username}`}</small></span><div className="header-security-actions"><span className={`role-badge ${isAdmin ? 'role-admin' : 'role-user'}`}>{isAdmin ? 'Super Administrator' : 'Administrator'}</span><button className="passkey-button" onClick={registerBiometric}>🔐 Passkey</button></div><button className="btn-logout" onClick={() => setSession(null)}>Ieșire</button></div>
    </header>
    <nav className="top-navigation">
      <button className={activeNav === 'overview' ? 'active' : ''} onClick={() => setActiveNav('overview')}>▦ Overview</button>
      <button className={activeNav === 'tasks' ? 'active' : ''} onClick={() => setActiveNav('tasks')}>✓ Activități</button>
      <button className={activeNav === 'chat' ? 'active' : ''} onClick={() => setActiveNav('chat')}>◌ Comunitate</button>
      {isAdmin && <button className={`admin-nav-btn ${activeNav === 'admin' ? 'active' : ''}`} onClick={() => setActiveNav('admin')}>⚙ Admin</button>}
    </nav>
    {error && <div className="alert error app-alert"><span>{error}</span><button className="alert-close" aria-label="Închide mesajul" onClick={() => setError('')}>×</button></div>}
    {notice && <div className="alert success">{notice}</div>}
    {activeNav === 'overview' && <Overview {...{ stats, progress, tasks, setActiveNav, isAdmin }} />}
    {activeNav === 'tasks' && <main className="workspace">
      <section className="panel-card task-form-card"><div className="section-heading"><div><span className="eyebrow">WORKSPACE</span><h2>{editingId ? 'Editează activitatea' : 'Creează o activitate'}</h2></div><span className="live-dot">● sincronizat</span></div>
        <form onSubmit={saveTask} className="task-form">
          <input className="input-large" required maxLength="255" placeholder="Ce vrei să realizezi?" value={draft.title} onChange={e => updateDraft('title', e.target.value)} />
          <div className="form-grid task-details-grid"><label>Categorie<select value={draft.category} onChange={e => updateDraft('category', e.target.value)}><option>Personal</option><option>Facultate</option><option>Sport</option><option>Proiect Echipă</option><option>Sănătate</option></select></label><label>Prioritate<select value={draft.priority} onChange={e => updateDraft('priority', e.target.value)}><option>Low</option><option>Medium</option><option>High</option></select></label><label>Scadență<input type="date" required value={draft.dueDate} onChange={e => updateDraft('dueDate', e.target.value)} /></label></div>
          <div className="option-row task-options"><label className="toggle"><input type="checkbox" checked={draft.requiresLocation} onChange={e => updateDraft('requiresLocation', e.target.checked)} /><span />Confirmare în locație</label><label className="toggle"><input type="checkbox" checked={draft.requiresBiometrics} onChange={e => updateDraft('requiresBiometrics', e.target.checked)} /><span />Passkey la finalizare</label><label className="toggle"><input type="checkbox" checked={draft.isRecurring} onChange={e => updateDraft('isRecurring', e.target.checked)} /><span />Activitate recurentă</label></div>
          <div className="task-action-row">
            {draft.requiresLocation && <div className="location-panel"><div className="location-actions task-location-actions"><button type="button" className="btn-secondary" onClick={() => setShowMap(current => !current)}>🗺 {showMap ? 'Ascunde harta' : 'Alege pe hartă'}</button><button type="button" className="btn-secondary" onClick={useCurrentLocation}>⌖ Folosește locația mea</button><label>Rază (m)<input type="number" min="10" max="10000" value={draft.radius} onChange={e => updateDraft('radius', Number(e.target.value))} /></label></div>{showMap && <MapPinPicker latitude={draft.latitude} longitude={draft.longitude} radius={draft.radius} onChangeCoords={(latitude, longitude) => setDraft(current => ({ ...current, latitude, longitude }))} />}<small className="coordinates">Lat {draft.latitude} · Lng {draft.longitude} · raza admisă {draft.radius}m</small></div>}
            <div className="form-footer task-form-actions"><button className="btn-primary" disabled={busy}>{busy ? 'Se salvează…' : editingId ? 'Salvează modificările' : '+ Adaugă activitatea'}</button>{editingId && <button type="button" className="btn-secondary" onClick={() => { setEditingId(null); setDraft(emptyDraft); }}>Renunță</button>}</div>
          </div>
        </form>
      </section>
      <section className="panel-card"><div className="section-heading"><div><span className="eyebrow">ACTIVITĂȚI</span><h2>Lista ta</h2></div><div className="filters"><input placeholder="Caută titlu sau categorie..." value={search} onChange={e => setSearch(e.target.value)} />{['All', 'Upcoming', 'Overdue', 'Completed', 'Canceled'].map(status => <button key={status} className={statusFilter === status ? 'selected' : ''} onClick={() => setStatusFilter(status)}>{status === 'All' ? 'Toate' : status}</button>)}</div></div><div className="task-list">{filteredTasks.length ? filteredTasks.map(task => <TaskCard key={task.id} task={task} onComplete={completeTask} onDelete={deleteTask} onCancel={cancelTask} onFreeze={freezeTask} onEdit={() => { setEditingId(task.id); setDraft({ ...emptyDraft, ...task, radius: task.radius || 150 }); setShowMap(Boolean(task.requiresLocation)); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />) : <div className="empty-state"><span>✦</span><h3>Nicio activitate aici</h3><p>Începe prin a crea primul tău obiectiv.</p></div>}</div></section>
    </main>}
    {activeNav === 'chat' && <Chat messages={messages} chatInput={chatInput} setChatInput={setChatInput} onSend={async e => { e.preventDefault(); if (!chatInput.trim()) return; await request(`${USER_API}/chat`, { method: 'POST', body: JSON.stringify({ text: chatInput.trim() }) }, token); setChatInput(''); await loadData(); }} />}
    {activeNav === 'admin' && isAdmin && <AdminPanel users={adminUsers} onAction={adminAction} />}
  </div>;
}

function AuthScreen({ authTab, setAuthTab, auth, setAuth, resetToken, setResetToken, error, submitAuth }) {
  return <div className="auth-wrapper"><div className="auth-card"><PwaInstallBanner /><div className="auth-brand"><img src={logo} alt="Whatever" className="auth-logo" /><span className="eyebrow">YOUR PERSONAL OPERATING SYSTEM</span><h1>WHATEVER</h1><p>Un spațiu clar pentru lucrurile care contează.</p></div><div className="auth-tabs"><button className={authTab === 'login' ? 'active' : ''} onClick={() => setAuthTab('login')}>Autentificare</button><button className={authTab === 'register' ? 'active' : ''} onClick={() => setAuthTab('register')}>Cont nou</button><button className={authTab.startsWith('reset') ? 'active' : ''} onClick={() => setAuthTab('reset-request')}>Resetare</button></div>{error && <div className="alert error">{error}</div>}<form onSubmit={submitAuth} className="auth-form">{authTab === 'register' && <><label>Nume complet<input required value={auth.fullName} onChange={e => setAuth({ ...auth, fullName: e.target.value })} /></label><label>Username<input required value={auth.username} onChange={e => setAuth({ ...auth, username: e.target.value })} /></label></>}{authTab !== 'reset-confirm' && <label>Email<input type="email" required value={auth.email} onChange={e => setAuth({ ...auth, email: e.target.value })} /></label>}{authTab === 'reset-request' && <label>Username<input required value={auth.username} onChange={e => setAuth({ ...auth, username: e.target.value })} /></label>}{(authTab === 'login' || authTab === 'register' || authTab === 'reset-confirm') && <label>Parolă<input type="password" minLength="12" required value={auth.password} onChange={e => setAuth({ ...auth, password: e.target.value })} /></label>}{authTab === 'reset-confirm' && <label>Codul primit pe email<input required value={resetToken} onChange={e => setResetToken(e.target.value)} /></label>}<button className="btn-primary btn-auth-submit">{authTab === 'login' ? 'Intră în cont' : authTab === 'register' ? 'Creează contul' : authTab === 'reset-request' ? 'Trimite codul' : 'Schimbă parola'}</button></form></div></div>;
}

function Overview({ stats, progress, tasks, setActiveNav, isAdmin }) {
  const upcoming = tasks.filter(task => task.status === 'Upcoming').slice(0, 4);
  return <main className="workspace"><section className="hero-panel hero-card"><div className="hero-copy"><span className="eyebrow">BUN VENIT ÎNAPOI</span><h2>Concentrează-te pe următorul pas.</h2><p>Obiectivele tale sunt sincronizate și pregătite pentru azi.</p><button className="btn-primary hero-action" onClick={() => setActiveNav('tasks')}>Vezi activitățile →</button></div><div className="hero-progress"><div className="progress-ring"><strong>{progress}%</strong><span>progres</span></div><div className="hero-progress-track"><span style={{ width: `${progress}%` }} /></div></div></section><div className="stats-grid"><StatCard label="Activități totale" value={stats.total} hint="în workspace" /><StatCard label="Finalizate" value={stats.completed} tone="green" hint="obiective atinse" /><StatCard label="În lucru" value={stats.active} tone="blue" hint="următorul pas" /><StatCard label="Restante" value={stats.overdue} tone="orange" hint="necesită atenție" /></div><section className="panel-card"><div className="section-heading"><div><span className="eyebrow">URMĂTORII PAȘI</span><h2>Planul tău</h2></div><button className="btn-secondary" onClick={() => setActiveNav('tasks')}>Toate activitățile</button></div>{upcoming.length ? <div className="mini-task-list">{upcoming.map(task => <div key={task.id} className="mini-task"><span className="mini-dot" /><div><b>{task.title}</b><small>{task.category} · scadent {task.dueDate}</small></div><span className="priority">{task.priority}</span></div>)}</div> : <div className="empty-state compact"><span>✓</span><h3>Ziua ta este la zi</h3><p>Nu ai activități urgente.</p></div>}</section>{isAdmin && <div className="admin-callout" onClick={() => setActiveNav('admin')}><span>⚙</span><div><b>Panou Super Administrator</b><small>Conturi, streak-uri și control platformă</small></div><strong>→</strong></div>}</main>;
}

function TaskCard({ task, onComplete, onDelete, onCancel, onFreeze, onEdit }) {
  return <article className={`task-card status-${task.status.toLowerCase()}`}><div className="task-card-top"><div className="task-icon">{task.category === 'Sport' ? '⚡' : task.category === 'Sănătate' ? '♡' : task.category === 'Facultate' ? '✎' : '◆'}</div><div className="task-main"><div className="task-title-line"><h3>{task.title}</h3><span className={`status-badge ${task.status}`}>{task.status}</span></div><div className="task-meta"><span>{task.category}</span><span>·</span><span>Scadență {task.dueDate}</span>{task.priority && <span className={`priority ${task.priority}`}>{task.priority}</span>}</div>{task.requiresLocation && <div className="security-meta">⌖ Verificare GPS · raza {task.radius}m</div>}{task.requiresBiometrics && <div className="security-meta">⌁ Passkey necesar</div>}</div></div><div className="task-actions">{task.status !== 'Completed' && task.status !== 'Canceled' && <button className="btn-primary small" onClick={() => onComplete(task)}>✓ Confirmă</button>}{task.status === 'Overdue' && <button className="btn-secondary small" onClick={() => onFreeze(task.id)}>❄ Freeze</button>}{task.status !== 'Completed' && <button className="icon-button" onClick={onEdit}>Edit</button>}<button className="icon-button danger" onClick={() => onDelete(task.id)}>Șterge</button>{task.status !== 'Completed' && task.status !== 'Canceled' && <button className="icon-button" onClick={() => onCancel(task.id)}>Anulează</button>}</div></article>;
}

function Chat({ messages, chatInput, setChatInput, onSend }) {
  return <main className="workspace narrow"><section className="panel-card chat-section"><div className="section-heading"><div><span className="eyebrow">COMUNITATE</span><h2>All Chat</h2></div><span className="live-dot">● live</span></div><div className="chat-messages-box">{messages.map(message => <div className="chat-bubble" key={message.id}><div><b>{message.senderName}</b><small>@{message.senderUsername} · {message.time}</small></div><span>{message.text}</span></div>)}</div><form onSubmit={onSend} className="chat-input-row"><input required maxLength="2000" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Scrie un mesaj pentru comunitate..." /><button className="btn-primary">Trimite</button></form></section></main>;
}

function AdminPanel({ users, onAction }) {
  const [query, setQuery] = useState('');
  const visible = users.filter(user => `${user.fullName} ${user.username} ${user.email}`.toLowerCase().includes(query.toLowerCase()));
  return <main className="workspace"><section className="hero-panel admin-hero"><div><span className="eyebrow">RESTRICTED ACCESS</span><h2>Control Center</h2><p>Administrare platformă și monitorizare comunitate.</p></div><div className="admin-stat"><strong>{users.length}</strong><span>conturi create</span></div></section><section className="panel-card"><div className="section-heading"><div><span className="eyebrow">USER DIRECTORY</span><h2>Conturi și streak-uri</h2></div><input className="search-input" placeholder="Caută utilizator..." value={query} onChange={e => setQuery(e.target.value)} /></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Utilizator</th><th>Email</th><th>Rol</th><th>Streak</th><th>Freeze</th><th>Acțiuni</th></tr></thead><tbody>{visible.map(user => <tr key={user.email}><td><b>{user.fullName}</b><small>@{user.username}</small></td><td>{user.email}</td><td><span className="role-badge">{user.role}</span></td><td><strong className="streak-value">🔥 {user.streak}</strong></td><td>❄ {user.freezesLeft}</td><td className="table-actions"><button onClick={() => onAction(user.email, 'bonus-streak')}>+5 streak</button><button onClick={() => onAction(user.email, 'reset-freezes')}>Reset freeze</button>{user.email !== ADMIN_EMAIL && <button className="danger-text" onClick={() => onAction(user.email, 'password', { newPassword: window.prompt('Parola nouă (minim 12 caractere):') })}>Reset parolă</button>}</td></tr>)}</tbody></table></div></section></main>;
}
