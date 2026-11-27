// Test end-to-end al API-ului (user-service + task-service) pe o bază de date reală.
// Rulează în CI: node e2e/api-smoke.mjs
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

const USER = process.env.USER_API || 'http://localhost:8081/api';
const TASK = process.env.TASK_API || 'http://localhost:8082/api';
const USER_LOG = process.env.USER_LOG || '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@ci.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ci-admin-password-123';

let failures = 0;
let passed = 0;
const annotation = (text) => String(text).slice(0, 1500).replace(/%/g, '%25').replace(/\r?\n/g, '%0A');
const check = (name, condition, detail) => {
  if (condition) {
    passed += 1;
    console.log(`✓ ${name}`);
  } else {
    failures += 1;
    const info = detail === undefined ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail);
    console.log(`✗ FAIL ${name}${info ? ` → ${info}` : ''}`);
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=API: ${annotation(name)}::${annotation(info || 'eșuat')}`);
  }
};

async function call(method, url, { token, body, headers } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* nu e JSON */ }
  return { status: response.status, json, text, headers: response.headers };
}

const bucharestDate = (offsetDays = 0) => {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(date);
};
const today = bucharestDate(0);
const yesterday = bucharestDate(-1);
const tomorrow = bucharestDate(1);

const run = Date.now().toString(36);
const password = 'parola-foarte-sigura-123';
const userA = { fullName: 'Ana Test', username: `ana_${run}`, email: `ana_${run}@example.com`, password };
const userB = { fullName: 'Bob Test', username: `bob_${run}`, email: `bob_${run}@example.com`, password };
const userC = { fullName: 'Cip Test', username: `cip_${run}`, email: `cip_${run}@example.com`, password };

const baseTask = (overrides = {}) => ({
  title: 'Task de test', category: 'CHORES', priority: 'Medium', dueDate: today, isRecurring: false,
  requiresLocation: false, latitude: 45.6525, longitude: 25.5888, radius: 150, requiresBiometrics: false,
  friend: '', ...overrides,
});

async function main() {
  // --- sănătate și securitate de bază
  check('user-service /health', (await call('GET', `${USER}/health`)).status === 200);
  check('user-service /health/db', (await call('GET', `${USER}/health/db`)).status === 200);
  check('task-service /tasks/health', (await call('GET', `${TASK}/tasks/health`)).status === 200);
  const anonymous = await call('GET', `${USER}/users/me`);
  check('fără token → 401 cu mesaj JSON', anonymous.status === 401 && anonymous.json?.error?.includes('Autentificare'), anonymous);
  check('task-service fără token → 401', (await call('GET', `${TASK}/tasks`)).status === 401);

  // --- înregistrare, login, refresh
  const regA = await call('POST', `${USER}/users/register`, { body: userA });
  check('înregistrare A', regA.status === 200 && regA.json?.token && regA.json?.refreshToken, regA);
  const regB = await call('POST', `${USER}/users/register`, { body: userB });
  const regC = await call('POST', `${USER}/users/register`, { body: userC });
  check('înregistrare B și C', regB.status === 200 && regC.status === 200, [regB.json, regC.json]);
  const duplicate = await call('POST', `${USER}/users/register`, { body: userA });
  check('înregistrare duplicat → 409', duplicate.status === 409, duplicate);
  const shortPassword = await call('POST', `${USER}/users/register`, { body: { ...userA, email: `x_${run}@example.com`, username: `x_${run}`, password: 'scurta' } });
  check('parolă scurtă → 400 în română', shortPassword.status === 400 && /caractere/.test(shortPassword.json?.error || ''), shortPassword);

  const wrong = await call('POST', `${USER}/users/login`, { body: { email: userA.email, password: 'gresita-gresita' } });
  check('login greșit → 401', wrong.status === 401, wrong);
  const login = await call('POST', `${USER}/users/login`, { body: { email: userA.email.toUpperCase(), password } });
  check('login A (email case-insensitive)', login.status === 200 && login.json?.user?.username === userA.username, login);
  let tokenA = login.json?.token;
  const tokenB = regB.json?.token;
  const tokenC = regC.json?.token;

  const me = await call('GET', `${USER}/users/me`, { token: tokenA });
  check('/users/me', me.status === 200 && me.json?.email === userA.email && me.json?.freezesLeft === 3, me);

  const refreshed = await call('POST', `${USER}/users/refresh`, { body: { refreshToken: login.json?.refreshToken } });
  check('refresh token → token nou', refreshed.status === 200 && refreshed.json?.token && refreshed.json?.refreshToken !== login.json?.refreshToken, refreshed);
  const reused = await call('POST', `${USER}/users/refresh`, { body: { refreshToken: login.json?.refreshToken } });
  check('refresh token refolosit → 401', reused.status === 401, reused);
  tokenA = refreshed.json?.token || tokenA;

  // --- finalizare unică + streak
  const simple = await call('POST', `${TASK}/tasks`, { token: tokenA, body: baseTask({ title: 'Simplu', category: 'General', priority: 'Normal' }) });
  check('creare task (valori vechi normalizate)', simple.status === 200 && simple.json?.category === 'CHORES' && simple.json?.priority === 'Medium', simple);
  const first = await call('POST', `${TASK}/tasks/${simple.json?.id}/verify-complete`, { token: tokenA, body: {} });
  check('finalizare task', first.status === 200 && first.json?.task?.status === 'Completed' && first.json?.streak === 1 && first.json?.points === 1, first);
  const second = await call('POST', `${TASK}/tasks/${simple.json?.id}/verify-complete`, { token: tokenA, body: {} });
  check('a doua finalizare → 409', second.status === 409, second);
  const meAfter = await call('GET', `${USER}/users/me`, { token: tokenA });
  check('streak 1, puncte 1 după finalizări repetate', meAfter.json?.streak === 1 && meAfter.json?.points === 1, meAfter.json);

  const invalidCategory = await call('POST', `${TASK}/tasks`, { token: tokenA, body: baseTask({ category: 'Altceva' }) });
  check('categorie necunoscută → 400', invalidCategory.status === 400, invalidCategory);
  const invalidEnglish = await call('POST', `${TASK}/tasks`, { token: tokenA, headers: { 'Accept-Language': 'en' }, body: baseTask({ category: 'Altceva' }) });
  check('erorile vin în limba cerută (en)', invalidEnglish.json?.error === 'Invalid category.', invalidEnglish.json);
  const invalidSpanish = await call('POST', `${TASK}/tasks`, { token: tokenA, headers: { 'Accept-Language': 'es-ES,es;q=0.9' }, body: baseTask({ category: 'Altceva' }) });
  check('erorile vin în limba cerută (es)', invalidSpanish.json?.error === 'Categoría no válida.', invalidSpanish.json);
  const unauthorizedEnglish = await call('GET', `${TASK}/tasks`, { headers: { 'Accept-Language': 'en' } });
  check('401 tradus (en)', unauthorizedEnglish.status === 401 && unauthorizedEnglish.json?.error === 'Authentication required.', unauthorizedEnglish.json);
  const legacySport = await call('POST', `${TASK}/tasks`, { token: tokenA, body: baseTask({ title: 'Sală', category: 'Sănătate' }) });
  check('categorie veche Sănătate → SPORT', legacySport.json?.category === 'SPORT', legacySport.json);
  const entertainment = await call('POST', `${TASK}/tasks`, { token: tokenA, body: baseTask({ title: 'Film', category: 'ENTERTAINMENT' }) });
  check('categorie nouă ENTERTAINMENT', entertainment.json?.category === 'ENTERTAINMENT', entertainment.json);

  // --- recap lunar (rămâne corect și după ștergerea activității)
  await call('POST', `${TASK}/tasks/${legacySport.json?.id}/verify-complete`, { token: tokenA, body: {} });
  const recapBefore = await call('GET', `${TASK}/tasks/recap`, { token: tokenA });
  const sportCount = (recap) => recap.json?.categories?.find((item) => item.category === 'SPORT')?.count;
  check('recap: 4 categorii, finalizările numărate', recapBefore.status === 200 && recapBefore.json?.categories?.length === 4
    && sportCount(recapBefore) === 1 && recapBefore.json?.total >= 2 && recapBefore.json?.month === today.slice(0, 7), recapBefore.json);
  await call('DELETE', `${TASK}/tasks/${legacySport.json?.id}`, { token: tokenA });
  const recapAfter = await call('GET', `${TASK}/tasks/recap`, { token: tokenA });
  check('recap: activitatea ștearsă rămâne numărată', sportCount(recapAfter) === 1, recapAfter.json);
  const recapBadMonth = await call('GET', `${TASK}/tasks/recap?month=2026-13`, { token: tokenA });
  check('recap: lună invalidă → 400', recapBadMonth.status === 400, recapBadMonth);
  const recapPast = await call('GET', `${TASK}/tasks/recap?month=2000-01`, { token: tokenA });
  check('recap: lună fără activități', recapPast.status === 200 && recapPast.json?.total === 0, recapPast.json);

  // --- task recurent
  const recurring = await call('POST', `${TASK}/tasks`, { token: tokenA, body: baseTask({ title: 'Zilnic', isRecurring: true }) });
  const recurringDone = await call('POST', `${TASK}/tasks/${recurring.json?.id}/verify-complete`, { token: tokenA, body: {} });
  check('recurent: rămâne activ, scadent mâine', recurringDone.status === 200 && recurringDone.json?.task?.status === 'Upcoming'
    && recurringDone.json?.task?.dueDate === tomorrow && recurringDone.json?.task?.completedToday === true, recurringDone);
  const recurringAgain = await call('POST', `${TASK}/tasks/${recurring.json?.id}/verify-complete`, { token: tokenA, body: {} });
  check('recurent: a doua oară azi → 409', recurringAgain.status === 409, recurringAgain);

  // --- biometrie: câmpul vechi nu mai ocolește verificarea
  const bioTask = await call('POST', `${TASK}/tasks`, { token: tokenA, body: baseTask({ title: 'Cu biometrie', requiresBiometrics: true }) });
  const bypass = await call('POST', `${TASK}/tasks/${bioTask.json?.id}/verify-complete`, { token: tokenA, body: { mobileBiometricConfirmed: true } });
  check('mobileBiometricConfirmed nu mai ocolește biometria', bypass.status === 401, bypass);

  // --- biometrie nativă cu cheie pe dispozitiv (Ed25519)
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const rawPublic = publicKey.export({ format: 'jwk' }).x;
  const device = await call('POST', `${USER}/users/devices`, { token: tokenA, body: { publicKey: rawPublic, name: 'Telefon CI' } });
  check('înregistrare telefon', device.status === 200 && device.json?.deviceId, device);
  const challenge = await call('POST', `${USER}/users/devices/challenge`, { token: tokenA, body: { deviceId: device.json?.deviceId, taskId: bioTask.json?.id } });
  check('challenge biometric', challenge.status === 200 && challenge.json?.challenge, challenge);
  const message = Buffer.from(`whatever:complete:${bioTask.json?.id}:${challenge.json?.challenge}`, 'utf8');
  const signature = sign(null, message, privateKey).toString('base64url');
  const badSignature = sign(null, Buffer.from('alt mesaj'), privateKey).toString('base64url');
  const forged = await call('POST', `${USER}/users/devices/verify`, { token: tokenA, body: { challengeId: challenge.json?.challengeId, signature: badSignature } });
  check('semnătură greșită → 401', forged.status === 401, forged);
  const challenge2 = await call('POST', `${USER}/users/devices/challenge`, { token: tokenA, body: { deviceId: device.json?.deviceId, taskId: bioTask.json?.id } });
  const message2 = Buffer.from(`whatever:complete:${bioTask.json?.id}:${challenge2.json?.challenge}`, 'utf8');
  const verified = await call('POST', `${USER}/users/devices/verify`, { token: tokenA, body: { challengeId: challenge2.json?.challengeId, signature: sign(null, message2, privateKey).toString('base64url') } });
  check('semnătură corectă → biometricToken', verified.status === 200 && verified.json?.biometricToken, verified);
  const replay = await call('POST', `${USER}/users/devices/verify`, { token: tokenA, body: { challengeId: challenge2.json?.challengeId, signature: sign(null, message2, privateKey).toString('base64url') } });
  check('challenge refolosit → 400', replay.status === 400, replay);
  void signature;
  const bioAsSession = await call('GET', `${USER}/users/me`, { token: verified.json?.biometricToken });
  check('token biometric nu e acceptat ca sesiune', bioAsSession.status === 401, bioAsSession);
  const wrongTask = await call('POST', `${TASK}/tasks/${simple.json?.id}/verify-complete`, { token: tokenA, body: { biometricToken: verified.json?.biometricToken } });
  check('token biometric pentru alt task nu ajută (task deja finalizat → 409)', wrongTask.status === 409, wrongTask);
  const bioDone = await call('POST', `${TASK}/tasks/${bioTask.json?.id}/verify-complete`, { token: tokenA, body: { biometricToken: verified.json?.biometricToken } });
  check('finalizare cu biometrie verificată', bioDone.status === 200, bioDone);
  const devices = await call('GET', `${USER}/users/devices`, { token: tokenA });
  check('listă telefoane', devices.status === 200 && devices.json?.length === 1 && devices.json[0].lastUsedAt, devices);

  // --- locație
  const locTask = await call('POST', `${TASK}/tasks`, { token: tokenA, body: baseTask({ title: 'Sala', requiresLocation: true, latitude: 45.6525, longitude: 25.5888, radius: 100 }) });
  const noCoords = await call('POST', `${TASK}/tasks/${locTask.json?.id}/verify-complete`, { token: tokenA, body: {} });
  check('locație lipsă → 400', noCoords.status === 400, noCoords);
  const far = await call('POST', `${TASK}/tasks/${locTask.json?.id}/verify-complete`, { token: tokenA, body: { latitude: 45.70, longitude: 25.60 } });
  check('prea departe → 400', far.status === 400 && /m de locația/.test(far.json?.error || ''), far);
  const mocked = await call('POST', `${TASK}/tasks/${locTask.json?.id}/verify-complete`, { token: tokenA, body: { latitude: 45.6525, longitude: 25.5888, mocked: true } });
  check('locație simulată → 400', mocked.status === 400, mocked);
  const near = await call('POST', `${TASK}/tasks/${locTask.json?.id}/verify-complete`, { token: tokenA, body: { latitude: 45.6528, longitude: 25.5889, accuracy: 12 } });
  check('în rază → finalizat', near.status === 200, near);
  const zeroLocation = await call('POST', `${TASK}/tasks`, { token: tokenA, body: baseTask({ requiresLocation: true, latitude: 0, longitude: 0 }) });
  check('task cu locație dar fără pin → 400', zeroLocation.status === 400, zeroLocation);

  // --- prieteni: fără emailuri, partajare doar cu prieteni
  const addB = await call('POST', `${USER}/friends`, { token: tokenA, body: { username: `@${userB.username}` } });
  check('A îl adaugă pe B', addB.status === 200, addB);
  const friendsB = await call('GET', `${USER}/friends`, { token: tokenB });
  check('B îl vede pe A, fără email', friendsB.status === 200 && friendsB.json?.[0]?.username === userA.username
    && friendsB.json?.[0]?.direction === 'incoming' && !('email' in (friendsB.json?.[0] || {})), friendsB.json);
  const selfAdd = await call('POST', `${USER}/friends`, { token: tokenA, body: { username: userA.username } });
  check('nu te poți adăuga singur', selfAdd.status === 400, selfAdd);
  const shareStranger = await call('POST', `${TASK}/tasks`, { token: tokenA, body: baseTask({ friend: userC.username }) });
  check('partajare cu non-prieten → 400', shareStranger.status === 400, shareStranger);
  const shared = await call('POST', `${TASK}/tasks`, { token: tokenA, body: baseTask({ title: 'Împreună', friend: userB.username }) });
  check('partajare cu prieten', shared.status === 200, shared);
  const tasksB = await call('GET', `${TASK}/tasks`, { token: tokenB });
  const seen = (tasksB.json || []).find((task) => task.id === shared.json?.id);
  check('B vede task-ul partajat, fără emailul lui A', seen && seen.isOwner === false && seen.ownerUsername === userA.username && !('ownerEmail' in seen), seen);
  const bCompletes = await call('POST', `${TASK}/tasks/${shared.json?.id}/verify-complete`, { token: tokenB, body: {} });
  check('B nu poate finaliza task-ul lui A', bCompletes.status === 404, bCompletes);
  const leaderboard = await call('GET', `${USER}/leaderboard`, { token: tokenC });
  check('clasament fără emailuri', leaderboard.status === 200 && leaderboard.json?.length > 0 && !('email' in leaderboard.json[0]), leaderboard.json?.[0]);

  // --- freeze
  const overdue = await call('POST', `${TASK}/tasks`, { token: tokenA, body: baseTask({ title: 'Restant', dueDate: yesterday }) });
  check('task cu scadență ieri apare Overdue', overdue.json?.status === 'Overdue', overdue.json);
  const frozen = await call('POST', `${TASK}/tasks/${overdue.json?.id}/freeze`, { token: tokenA });
  check('freeze: scadența devine azi, rămân 2', frozen.status === 200 && frozen.json?.task?.dueDate === today && frozen.json?.freezesLeft === 2, frozen);
  const freezeActive = await call('POST', `${TASK}/tasks/${overdue.json?.id}/freeze`, { token: tokenA });
  check('freeze pe task ne-restant → 409 (fără consum)', freezeActive.status === 409, freezeActive);
  const meFreeze = await call('GET', `${USER}/users/me`, { token: tokenA });
  check('freeze-uri rămase = 2', meFreeze.json?.freezesLeft === 2, meFreeze.json);

  // --- editare / anulare
  const editCompleted = await call('PUT', `${TASK}/tasks/${simple.json?.id}`, { token: tokenA, body: baseTask({ title: 'Nu' }) });
  check('editarea unui task finalizat → 409', editCompleted.status === 409, editCompleted);
  const toCancel = await call('POST', `${TASK}/tasks`, { token: tokenA, body: baseTask({ title: 'De anulat' }) });
  const canceled = await call('POST', `${TASK}/tasks/${toCancel.json?.id}/cancel`, { token: tokenA });
  check('anulare', canceled.status === 200 && canceled.json?.status === 'Canceled', canceled);
  const completeCanceled = await call('POST', `${TASK}/tasks/${toCancel.json?.id}/verify-complete`, { token: tokenA, body: {} });
  check('finalizarea unui task anulat → 409', completeCanceled.status === 409, completeCanceled);

  // --- chat
  const posted = await call('POST', `${USER}/chat`, { token: tokenA, body: { text: 'Salut din CI' } });
  const chat = await call('GET', `${USER}/chat`, { token: tokenB });
  check('chat cu timestamp ISO', posted.status === 200 && chat.json?.[0]?.text === 'Salut din CI' && /T.*Z$/.test(chat.json?.[0]?.createdAt || ''), chat.json?.[0]);

  // --- admin
  let adminLogin = { status: 0 };
  for (let attempt = 0; attempt < 15 && adminLogin.status !== 200; attempt += 1) {
    adminLogin = await call('POST', `${USER}/users/login`, { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    if (adminLogin.status !== 200) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  check('admin creat la pornire', adminLogin.status === 200 && adminLogin.json?.user?.role === 'ADMIN', adminLogin);
  const adminUsers = await call('GET', `${USER}/admin/users`, { token: adminLogin.json?.token });
  check('admin vede utilizatorii', adminUsers.status === 200 && adminUsers.json?.length >= 4, adminUsers.status);
  const userAdmin = await call('GET', `${USER}/admin/users`, { token: tokenA });
  check('utilizator obișnuit → 403 pe admin', userAdmin.status === 403, userAdmin);
  const bonus = await call('POST', `${USER}/admin/users/${encodeURIComponent(userB.email)}/bonus-streak`, { token: adminLogin.json?.token });
  const meB = await call('GET', `${USER}/users/me`, { token: tokenB });
  check('bonus streak +5', bonus.status === 200 && meB.json?.streak === 5, meB.json);

  // --- resetare parolă (MAIL_PROVIDER=log în CI)
  const resetRequest = await call('POST', `${USER}/users/password-reset/request`, { body: { email: userC.email, username: userC.username } });
  check('cerere resetare', resetRequest.status === 200, resetRequest);
  const unknown = await call('POST', `${USER}/users/password-reset/request`, { body: { email: `nimeni_${run}@example.com`, username: 'nimeni' } });
  check('cerere pentru cont inexistent → același răspuns', unknown.status === 200 && unknown.json?.message === resetRequest.json?.message, unknown);
  if (USER_LOG && existsSync(USER_LOG)) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const log = readFileSync(USER_LOG, 'utf8');
    const start = log.lastIndexOf(userC.email);
    const code = start >= 0 ? log.slice(start).match(/Codul tău: ([A-Z0-9]{5}-[A-Z0-9]{5})/)?.[1] : undefined;
    check('codul apare în log (provider log)', Boolean(code));
    const badCode = await call('POST', `${USER}/users/password-reset/confirm`, { body: { resetToken: 'AAAAA-BBBBB', newPassword: 'parola-noua-foarte-sigura' } });
    check('cod greșit → 400', badCode.status === 400, badCode);
    const confirmed = await call('POST', `${USER}/users/password-reset/confirm`, { body: { resetToken: code?.toLowerCase(), newPassword: 'parola-noua-foarte-sigura' } });
    check('resetare cu codul primit', confirmed.status === 200, confirmed);
    const oldRefresh = await call('POST', `${USER}/users/refresh`, { body: { refreshToken: regC.json?.refreshToken } });
    check('refresh token-urile vechi sunt revocate', oldRefresh.status === 401, oldRefresh);
    const newLogin = await call('POST', `${USER}/users/login`, { body: { email: userC.email, password: 'parola-noua-foarte-sigura' } });
    check('login cu parola nouă', newLogin.status === 200, newLogin);
  } else {
    check('USER_LOG disponibil pentru testul de resetare', false, USER_LOG);
  }
  void tokenC;

  // --- CORS
  const preflightOk = await call('OPTIONS', `${TASK}/tasks`, { headers: { Origin: 'https://deploy-preview-7--whatever-unitbv.netlify.app', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } });
  check('CORS: preview Netlify permis', preflightOk.status === 200 && preflightOk.headers.get('access-control-allow-origin') === 'https://deploy-preview-7--whatever-unitbv.netlify.app', preflightOk.status);
  const preflightBad = await call('OPTIONS', `${USER}/users/me`, { headers: { Origin: 'https://evil.example.com', 'Access-Control-Request-Method': 'GET' } });
  check('CORS: origine străină refuzată', preflightBad.status === 403, preflightBad.status);

  // --- rate limiting pe login
  let limited = 0;
  for (let attempt = 0; attempt < 9; attempt += 1) {
    const response = await call('POST', `${USER}/users/login`, { body: { email: `brute_${run}@example.com`, password: 'gresit-gresit' } });
    if (response.status === 429) limited += 1;
  }
  check('rate limit pe login', limited >= 1, limited);

  // --- logout
  const logout = await call('POST', `${USER}/users/logout`, { body: { refreshToken: refreshed.json?.refreshToken } });
  const afterLogout = await call('POST', `${USER}/users/refresh`, { body: { refreshToken: refreshed.json?.refreshToken } });
  check('logout revocă refresh token-ul', logout.status === 200 && afterLogout.status === 401, afterLogout);

  console.log(failures === 0 ? '\nToate verificările au trecut.' : `\n${failures} verificări au eșuat.`);
  if (process.env.GITHUB_ACTIONS) console.log(`::notice title=API e2e::${passed} verificări trecute, ${failures} eșuate`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('✗ FAIL eroare neașteptată', error);
  process.exit(1);
});
