import React, { useCallback, useEffect, useState } from 'react';
import './App.css';
import logo from './logo.png';
import PwaInstallBanner from './PwaInstallBanner.jsx';

const USER_API = import.meta.env.VITE_USER_API || 'http://localhost:8081/api';
const TASK_API = import.meta.env.VITE_TASK_API || 'http://localhost:8082/api';

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

function encodeBase64Url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function credentialJson(credential) {
  const response = credential.response;
  return JSON.stringify({
    id: credential.id,
    rawId: encodeBase64Url(credential.rawId),
    type: credential.type,
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
    ...options,
    challenge: decodeBase64Url(options.challenge),
    user: { ...options.user, id: decodeBase64Url(options.user.id) },
    excludeCredentials: (options.excludeCredentials || []).map(item => ({ ...item, id: decodeBase64Url(item.id) }))
  };
}

function browserRequestOptions(options) {
  return {
    ...options,
    challenge: decodeBase64Url(options.challenge),
    allowCredentials: (options.allowCredentials || []).map(item => ({ ...item, id: decodeBase64Url(item.id) }))
  };
}

async function request(url, options = {}, token) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Server error');
  return body;
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
  const [title, setTitle] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [activeNav, setActiveNav] = useState('tasks');

  const token = session?.token;
  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const [nextTasks, nextMessages] = await Promise.all([
        request(`${TASK_API}/tasks`, {}, token),
        request(`${USER_API}/chat`, {}, token)
      ]);
      setTasks(nextTasks);
      setMessages(nextMessages.reverse());
    } catch (e) {
      if (e.message.includes('Autentificare')) setSession(null);
    }
  }, [token]);

  useEffect(() => {
    loadData();
    if (!token) return undefined;
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData, token]);

  const submitAuth = async (event) => {
    event.preventDefault();
    setError('');
    try {
      if (authTab === 'reset-request') {
        await request(`${USER_API}/users/password-reset/request`, {
          method: 'POST', body: JSON.stringify({ email: auth.email, username: auth.username })
        });
        setAuthTab('reset-confirm');
        setNotice('Dacă datele sunt corecte, codul a fost trimis pe Gmail.');
        return;
      }
      if (authTab === 'reset-confirm') {
        await request(`${USER_API}/users/password-reset/confirm`, {
          method: 'POST', body: JSON.stringify({ resetToken, newPassword: auth.password })
        });
        setAuthTab('login');
        setResetToken('');
        setNotice('Parola a fost schimbată. Te poți autentifica.');
        return;
      }
      const path = authTab === 'login' ? '/users/login' : '/users/register';
      const body = authTab === 'login' ? { email: auth.email, password: auth.password } : auth;
      setSession(await request(`${USER_API}${path}`, { method: 'POST', body: JSON.stringify(body) }));
      setNotice('Autentificare reușită.');
    } catch (e) { setError(e.message); }
  };

  const addTask = async (event) => {
    event.preventDefault();
    if (!title.trim()) return;
    try {
      await request(`${TASK_API}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(), category: 'Personal', priority: 'Medium',
          isRecurring: false, requiresLocation: false, latitude: 0, longitude: 0,
          radius: 150, requiresBiometrics: false,
          dueDate: new Date().toISOString().slice(0, 10), friend: ''
        })
      }, token);
      setTitle('');
      await loadData();
      setNotice('Task-ul a fost salvat în server.');
    } catch (e) { setError(e.message); }
  };

  const completeTask = async (task) => {
    try {
      let latitude = 0;
      let longitude = 0;
      if (task.requiresLocation) {
        const position = await new Promise((resolve, reject) => {
          if (!navigator.geolocation) return reject(new Error('Browserul nu oferă locație.'));
          navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error('Locația este necesară.')), { enableHighAccuracy: true, timeout: 10000 });
        });
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
      }
      let biometricToken;
      if (task.requiresBiometrics) {
        if (!window.PublicKeyCredential || !navigator.credentials) throw new Error('WebAuthn nu este disponibil în acest browser.');
        const options = await request(`${USER_API}/users/webauthn/assertion/options`, {}, token);
        const credential = await navigator.credentials.get({ publicKey: browserRequestOptions(options.publicKey) });
        const result = await request(`${USER_API}/users/webauthn/assertion/finish`, {
          method: 'POST',
          body: JSON.stringify({ credentialJson: credentialJson(credential), taskId: task.id })
        }, token);
        biometricToken = result.biometricToken;
      }
      await request(`${TASK_API}/tasks/${task.id}/verify-complete`, {
        method: 'POST',
        body: JSON.stringify({ latitude, longitude, biometricToken })
      }, token);
      await loadData();
      setNotice('Task finalizat și sincronizat.');
    } catch (e) { setError(e.message); }
  };

  const registerBiometric = async () => {
    try {
      if (!window.PublicKeyCredential || !navigator.credentials) throw new Error('WebAuthn nu este disponibil în acest browser.');
      const options = await request(`${USER_API}/users/webauthn/register/options`, {}, token);
      const credential = await navigator.credentials.create({ publicKey: browserCreationOptions(options) });
      await request(`${USER_API}/users/webauthn/register/finish`, {
        method: 'POST', body: JSON.stringify({ credentialJson: credentialJson(credential) })
      }, token);
      setNotice('Biometria a fost activată pentru acest cont.');
    } catch (e) { setError(e.message); }
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    if (!chatInput.trim()) return;
    try {
      await request(`${USER_API}/chat`, { method: 'POST', body: JSON.stringify({ text: chatInput.trim() }) }, token);
      setChatInput('');
      await loadData();
    } catch (e) { setError(e.message); }
  };

  if (!session) return (
    <div className="auth-wrapper"><div className="auth-card"><PwaInstallBanner />
      <div className="auth-brand"><img src={logo} alt="Whatever" className="auth-logo" /><h1>WHATEVER</h1><p>Task-uri sincronizate cu serverul</p></div>
      <div className="auth-tabs">
        <button className={authTab === 'login' ? 'active' : ''} onClick={() => setAuthTab('login')}>Autentificare</button>
        <button className={authTab === 'register' ? 'active' : ''} onClick={() => setAuthTab('register')}>Cont nou</button>
        <button className={authTab.startsWith('reset') ? 'active' : ''} onClick={() => setAuthTab('reset-request')}>Resetare parolă</button>
      </div>
      {error && <div className="auth-error">{error}</div>}
      <form onSubmit={submitAuth} className="auth-form">
        {authTab === 'register' && <>
          <label>Nume complet</label><input required value={auth.fullName} onChange={e => setAuth({ ...auth, fullName: e.target.value })} />
          <label>Username</label><input required value={auth.username} onChange={e => setAuth({ ...auth, username: e.target.value })} />
        </>}
        {authTab !== 'reset-confirm' && <><label>Email</label><input type="email" required value={auth.email} onChange={e => setAuth({ ...auth, email: e.target.value })} /></>}
        {(authTab === 'login' || authTab === 'register' || authTab === 'reset-confirm') && <label>Parolă nouă/parolă</label>}
        {(authTab === 'login' || authTab === 'register' || authTab === 'reset-confirm') && <input type="password" minLength="12" required value={auth.password} onChange={e => setAuth({ ...auth, password: e.target.value })} />}
        {authTab === 'reset-request' && <><label>Username</label><input required value={auth.username} onChange={e => setAuth({ ...auth, username: e.target.value })} /></>}
        {authTab === 'reset-confirm' && <><label>Codul primit pe Gmail</label><input required value={resetToken} onChange={e => setResetToken(e.target.value)} /></>}
        <button type="submit" className="btn-auth-submit">
          {authTab === 'login' ? 'Conectare' : authTab === 'register' ? 'Înregistrare' : authTab === 'reset-request' ? 'Trimite codul' : 'Schimbă parola'}
        </button>
      </form>
    </div></div>
  );

  return <div className="whatever-app">
    <PwaInstallBanner />
    <header className="whatever-header"><div className="brand-box"><img src={logo} alt="Whatever" className="brand-logo" /><div><h1>WHATEVER</h1><p>Conectat ca <strong>{session.user.fullName}</strong></p></div></div>
      <div><button className="btn-submit-task" onClick={registerBiometric}>Activează biometria</button><button className="btn-logout" onClick={() => setSession(null)}>Ieșire</button></div></header>
    <nav className="top-navigation"><button className={activeNav === 'tasks' ? 'active' : ''} onClick={() => setActiveNav('tasks')}>Task-uri</button><button className={activeNav === 'chat' ? 'active' : ''} onClick={() => setActiveNav('chat')}>Chat</button></nav>
    {error && <div className="auth-error">{error}<button onClick={() => setError('')}>x</button></div>}
    {notice && <div className="toast-banner">{notice}</div>}
    {activeNav === 'tasks' ? <main className="content-column"><form className="panel-card task-creator" onSubmit={addTask}><h3>Adaugă activitate</h3><input required maxLength="255" placeholder="Titlu..." value={title} onChange={e => setTitle(e.target.value)} /><button className="btn-submit-task">Salvează</button></form>
      <div className="tasks-container">{tasks.map(task => <div className="task-item" key={task.id}><h4>{task.title}</h4><span>{task.status}</span>{task.status !== 'Completed' && <button onClick={() => completeTask(task)}>Finalizează</button>}</div>)}</div>
    </main> : <section className="panel-card chat-section"><h3>Chat sincronizat</h3><div className="chat-messages-box">{messages.map(message => <div className="chat-bubble" key={message.id}><strong>{message.senderName}: </strong><span>{message.text}</span></div>)}</div><form onSubmit={sendMessage} className="chat-input-row"><input required maxLength="2000" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Scrie mesaj..." /><button className="btn-submit-task">Trimite</button></form></section>}
  </div>;
}
