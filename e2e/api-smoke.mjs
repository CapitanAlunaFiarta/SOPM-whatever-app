// Test end-to-end al API-ului (user-service + task-service) pe o bază de date reală.
// Rulează în CI: node e2e/api-smoke.mjs
import {
  createDecipheriv, createECDH, createHmac, createPublicKey, generateKeyPairSync, randomBytes, sign, verify,
} from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

/** Un PNG RGB de o singură culoare, generat aici (pentru poza de profil). */
function png(width, height, [red, green, blue] = [56, 189, 248]) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) raw.set([red, green, blue], y * (width * 3 + 1) + 1 + x * 3);
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Web Push văzut din browser: decriptarea RFC 8291 (aes128gcm) și verificarea semnăturii VAPID (RFC 8292).
const hmac = (key, ...parts) => parts.reduce((mac, part) => mac.update(part), createHmac('sha256', key)).digest();
function decryptPush(body, ecdh, auth) {
  const salt = body.subarray(0, 16);
  const keyLength = body[20];
  const serverPublic = body.subarray(21, 21 + keyLength);
  const ciphertext = body.subarray(21 + keyLength);
  const prkKey = hmac(auth, ecdh.computeSecret(serverPublic));
  const ikm = hmac(prkKey, Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), serverPublic, Buffer.from([1]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])).subarray(0, 12);
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]);
  let end = plain.length - 1;
  while (end > 0 && plain[end] === 0) end -= 1;
  if (plain[end] !== 2) throw new Error('Lipsește delimitatorul 0x02');
  return { recordSize: body.readUInt32BE(16), message: JSON.parse(plain.subarray(0, end).toString('utf8')) };
}
function vapidValid(authorization, publicKey, audience) {
  const match = /^vapid t=([^,]+), k=(.+)$/.exec(authorization ?? '');
  if (!match || match[2] !== publicKey) return false;
  const [header, claims, signature] = match[1].split('.');
  const raw = Buffer.from(publicKey, 'base64url');
  const key = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256',
    x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33, 65).toString('base64url') } });
  const signed = verify('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'));
  const payload = JSON.parse(Buffer.from(claims, 'base64url').toString('utf8'));
  return signed && payload.aud === audience && payload.exp > Date.now() / 1000 && /^(https:|mailto:)/.test(payload.sub);
}

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

  // --- descriere, repetare la N zile/săptămâni, calendarul lunii și abonarea .ics (Google Calendar)
  const plusDays = (date, days) => {
    const value = new Date(`${date}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  };
  const football = await call('POST', `${TASK}/tasks`, { token: tokenA, body: baseTask({
    title: 'Fotbal, la două săptămâni', description: '  Adu mingea; ne vedem la poartă.\n', category: 'SPORT', isRecurring: true,
    repeatEvery: 2, repeatUnit: 'week', requiresLocation: true, latitude: 45.6525, longitude: 25.5888, radius: 300,
  }) });
  check('descrierea și repetarea se salvează', football.status === 200 && football.json?.description === 'Adu mingea; ne vedem la poartă.'
    && football.json?.repeatEvery === 2 && football.json?.repeatUnit === 'WEEK' && football.json?.nextOn === null, football.json);
  const footballDone = await call('POST', `${TASK}/tasks/${football.json?.id}/verify-complete`, { token: tokenA,
    body: { latitude: 45.6526, longitude: 25.5889, accuracy: 8 } });
  check('repetare: revine peste 2 săptămâni, nu mâine', footballDone.status === 200
    && footballDone.json?.task?.dueDate === plusDays(today, 14) && footballDone.json?.task?.nextOn === plusDays(today, 14)
    && footballDone.json?.task?.status === 'Upcoming' && footballDone.json?.task?.streakCount === 1, footballDone.json?.task);
  const later = await call('POST', `${TASK}/tasks`, { token: tokenA, body: baseTask({
    title: 'Începe mâine', description: 'Pornim de la parc.', isRecurring: true, repeatEvery: 3, repeatUnit: 'DAY', dueDate: tomorrow,
  }) });
  const early = await call('POST', `${TASK}/tasks/${later.json?.id}/verify-complete`, { token: tokenA, body: {} });
  const earlyEn = await call('POST', `${TASK}/tasks/${later.json?.id}/verify-complete`, { token: tokenA, headers: { 'Accept-Language': 'en' }, body: {} });
  check('recurentă: nu se confirmă înainte de ziua ei (409, tradus)', later.json?.nextOn === tomorrow && early.status === 409
    && early.json?.error === `Activitatea poate fi confirmată din ${tomorrow}.`
    && earlyEn.json?.error === `The activity can be confirmed from ${tomorrow}.`, [later.json?.nextOn, early.json, earlyEn.json]);
  const oldClientEdit = await call('PUT', `${TASK}/tasks/${later.json?.id}`, { token: tokenA, body: baseTask({
    title: 'Începe mâine (editat)', isRecurring: true, dueDate: tomorrow,
  }) });
  check('editare de la o aplicație veche: descrierea și intervalul rămân', oldClientEdit.status === 200
    && oldClientEdit.json?.description === 'Pornim de la parc.' && oldClientEdit.json?.repeatEvery === 3 && oldClientEdit.json?.repeatUnit === 'DAY', oldClientEdit.json);
  const clearedDescription = await call('PUT', `${TASK}/tasks/${later.json?.id}`, { token: tokenA, body: baseTask({
    title: 'Începe mâine', description: '', isRecurring: true, repeatEvery: 1, repeatUnit: 'WEEK', dueDate: tomorrow,
  }) });
  check('editare: descrierea se poate goli, unitatea se schimbă', clearedDescription.json?.description === ''
    && clearedDescription.json?.repeatUnit === 'WEEK' && clearedDescription.json?.repeatEvery === 1, clearedDescription.json);
  const badWeeks = await call('POST', `${TASK}/tasks`, { token: tokenA, body: baseTask({ isRecurring: true, repeatEvery: 53, repeatUnit: 'WEEK' }) });
  const badUnit = await call('POST', `${TASK}/tasks`, { token: tokenA, body: baseTask({ isRecurring: true, repeatEvery: 1, repeatUnit: 'MONTH' }) });
  const zeroDays = await call('POST', `${TASK}/tasks`, { token: tokenA, body: baseTask({ isRecurring: true, repeatEvery: 0 }) });
  const longText = await call('POST', `${TASK}/tasks`, { token: tokenA, body: baseTask({ description: 'x'.repeat(2001) }) });
  check('repetare și descriere invalide → 400', badWeeks.status === 400 && badUnit.status === 400 && zeroDays.status === 400
    && longText.status === 400 && /2000/.test(longText.json?.error || ''), [badWeeks.json, badUnit.json, zeroDays.json, longText.json]);

  const calendarMonth = await call('GET', `${TASK}/tasks/calendar?month=${today.slice(0, 7)}`, { token: tokenA });
  check('calendar: ce am finalizat azi, cu titlul', calendarMonth.status === 200 && calendarMonth.json?.month === today.slice(0, 7)
    && calendarMonth.json.completions?.some((item) => item.date === today && item.kind === 'TASK' && item.id === football.json?.id
      && item.title === 'Fotbal, la două săptămâni' && item.category === 'SPORT'), calendarMonth.json);
  const calendarOther = await call('GET', `${TASK}/tasks/calendar?month=${today.slice(0, 7)}`, { token: tokenB });
  const calendarBad = await call('GET', `${TASK}/tasks/calendar?month=2026-13`, { token: tokenA });
  check('calendar: doar finalizările mele; lună invalidă → 400', calendarOther.status === 200
    && !calendarOther.json?.completions?.some((item) => item.id === football.json?.id) && calendarBad.status === 400, calendarOther.json);
  const feedLink = await call('GET', `${TASK}/tasks/calendar/link`, { token: tokenA });
  const feedLinkAgain = await call('GET', `${TASK}/tasks/calendar/link`, { token: tokenA });
  check('abonare: link secret, același la a doua cerere', feedLink.status === 200 && /^[A-Za-z0-9_-]{32}$/.test(feedLink.json?.token || '')
    && feedLinkAgain.json?.token === feedLink.json?.token && feedLink.json?.lastFetchedAt === null, feedLink.json);
  const feed = await call('GET', `${TASK}/tasks/calendar/feed/${feedLink.json?.token}.ics?lang=en`);
  const ics = feed.text.replace(/\r\n /g, '');
  check('abonare: fișier .ics fără autentificare', feed.status === 200 && (feed.headers.get('content-type') || '').startsWith('text/calendar')
    && ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.includes('X-WR-CALNAME:Whatever — my activities\r\n'), feed.text.slice(0, 300));
  const footballEvent = ics.split('BEGIN:VEVENT').find((event) => event.includes(`UID:whatever-task-${football.json?.id}@`)) ?? '';
  check('abonare: activitatea recurentă are regula și ziua următoare', footballEvent.includes('SUMMARY:Fotbal\\, la două săptămâni\r\n')
    && footballEvent.includes('RRULE:FREQ=WEEKLY;INTERVAL=2\r\n')
    && footballEvent.includes(`DTSTART;VALUE=DATE:${plusDays(today, 14).replace(/-/g, '')}\r\n`), footballEvent || ics);
  check('abonare: locația și descrierea (scăpate ca în RFC 5545)', footballEvent.includes('GEO:45.652500;25.588800\r\n')
    && footballEvent.includes('DESCRIPTION:Adu mingea\\; ne vedem la poartă.\\n\\nOpen in Whatever: '), footballEvent || ics);
  const longLines = feed.text.split('\r\n').filter((line) => Buffer.byteLength(line, 'utf8') > 75);
  check('abonare: rânduri de cel mult 75 de octeți', longLines.length === 0, longLines);
  const fetchedAt = await call('GET', `${TASK}/tasks/calendar/link`, { token: tokenA });
  const feedReset = await call('POST', `${TASK}/tasks/calendar/link/reset`, { token: tokenA });
  const oldFeed = await call('GET', `${TASK}/tasks/calendar/feed/${feedLink.json?.token}.ics`);
  const newFeed = await call('GET', `${TASK}/tasks/calendar/feed/${feedReset.json?.token}.ics`);
  const guessed = await call('GET', `${TASK}/tasks/calendar/feed/${'A'.repeat(32)}.ics`);
  check('abonare: Google a citit linkul; după resetare cel vechi nu mai merge', fetchedAt.json?.lastFetchedAt !== null
    && feedReset.status === 200 && feedReset.json?.token !== feedLink.json?.token && oldFeed.status === 404 && newFeed.status === 200
    && guessed.status === 404 && newFeed.text.includes('X-WR-CALNAME:Whatever — activitățile mele'), [fetchedAt.json, feedReset.json, oldFeed.status, newFeed.status]);
  const feedOther = await call('GET', `${TASK}/tasks/calendar/link`, { token: tokenB });
  const otherIcs = await call('GET', `${TASK}/tasks/calendar/feed/${feedOther.json?.token}.ics`);
  check('abonare: fiecare își vede doar activitățile lui', feedOther.json?.token !== feedReset.json?.token
    && otherIcs.status === 200 && !otherIcs.text.includes('Fotbal'), otherIcs.text.slice(0, 300));

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

  // --- prieteni: cerere cu Da/Nu, fără emailuri, partajare doar cu prieteni
  const addB = await call('POST', `${USER}/friends`, { token: tokenA, body: { username: `@${userB.username}` } });
  check('A îi trimite o cerere lui B', addB.status === 200 && addB.json?.status === 'OUTGOING', addB);
  const friendsB = await call('GET', `${USER}/friends`, { token: tokenB });
  check('B vede cererea lui A, fără email', friendsB.status === 200 && friendsB.json?.[0]?.username === userA.username
    && friendsB.json?.[0]?.status === 'INCOMING' && friendsB.json?.[0]?.direction === 'incoming'
    && !('email' in (friendsB.json?.[0] || {})), friendsB.json);
  const sharePending = await call('POST', `${TASK}/tasks`, { token: tokenA, body: baseTask({ friend: userB.username }) });
  check('cât timp cererea așteaptă nu sunteți prieteni (partajare → 400)', sharePending.status === 400, sharePending);
  const addAgain = await call('POST', `${USER}/friends`, { token: tokenA, body: { username: userB.username } });
  check('a doua cerere nu dublează nimic', addAgain.status === 200 && addAgain.json?.status === 'OUTGOING', addAgain);
  const acceptB = await call('POST', `${USER}/friends/${userA.username}/accept`, { token: tokenB });
  const friendsA = await call('GET', `${USER}/friends`, { token: tokenA });
  check('B acceptă: amândoi se văd prieteni', acceptB.status === 200 && acceptB.json?.status === 'FRIEND'
    && friendsA.json?.find((f) => f.username === userB.username)?.status === 'FRIEND', friendsA.json);
  const acceptMissing = await call('POST', `${USER}/friends/${userC.username}/accept`, { token: tokenB });
  check('acceptarea unei cereri inexistente → 404', acceptMissing.status === 404, acceptMissing);
  const cAsksB = await call('POST', `${USER}/friends`, { token: tokenC, body: { username: userB.username } });
  const bDeclinesC = await call('POST', `${USER}/friends/${userC.username}/decline`, { token: tokenB });
  const friendsC = await call('GET', `${USER}/friends`, { token: tokenC });
  check('B refuză cererea lui C: cererea dispare', cAsksB.json?.status === 'OUTGOING' && bDeclinesC.status === 200
    && !(friendsC.json || []).some((f) => f.username === userB.username), friendsC.json);
  const selfAdd = await call('POST', `${USER}/friends`, { token: tokenA, body: { username: userA.username } });
  check('nu te poți adăuga singur', selfAdd.status === 400, selfAdd);
  const shareStranger = await call('POST', `${TASK}/tasks`, { token: tokenA, body: baseTask({ friend: userC.username }) });
  check('partajare cu non-prieten → 400', shareStranger.status === 400, shareStranger);
  const shared = await call('POST', `${TASK}/tasks`, { token: tokenA, body: baseTask({ title: 'Împreună', friend: userB.username }) });
  check('partajare cu prieten', shared.status === 200, shared);
  const tasksB = await call('GET', `${TASK}/tasks`, { token: tokenB });
  const seen = (tasksB.json || []).find((task) => task.id === shared.json?.id);
  check('B vede task-ul partajat, fără emailul lui A', seen && seen.isOwner === false && seen.ownerUsername === userA.username && !('ownerEmail' in seen), seen);
  check('partajarea veche (friend) devine invitație', seen?.myStatus === 'INVITED' && seen?.friend === userB.username
    && seen?.participants?.[0]?.username === userB.username, seen);
  const bCompletes = await call('POST', `${TASK}/tasks/${shared.json?.id}/verify-complete`, { token: tokenB, body: {} });
  check('invitatul nu poate confirma înainte să accepte', bCompletes.status === 409, bCompletes);
  const cCompletes = await call('POST', `${TASK}/tasks/${shared.json?.id}/verify-complete`, { token: tokenC, body: {} });
  check('un străin nu vede activitatea', cCompletes.status === 404, cCompletes);
  const leaderboard = await call('GET', `${USER}/leaderboard`, { token: tokenC });
  check('clasament fără emailuri', leaderboard.status === 200 && leaderboard.json?.length > 0 && !('email' in leaderboard.json[0]), leaderboard.json?.[0]);

  // --- activități de grup: invitații, fiecare membru confirmă, chat separat de cel general
  await call('POST', `${USER}/friends`, { token: tokenC, body: { username: userA.username } });
  const mutual = await call('POST', `${USER}/friends`, { token: tokenA, body: { username: userC.username } });
  check('cerere în ambele sensuri → prieteni direct', mutual.status === 200 && mutual.json?.status === 'FRIEND', mutual);
  const group = await call('POST', `${TASK}/tasks`, { token: tokenA, body: baseTask({
    title: 'Alergăm împreună', category: 'SPORT', participants: [userB.username, `@${userC.username}`, userB.username],
  }) });
  const gid = group.json?.id;
  check('grup: 2 invitați (fără dubluri), doar proprietarul e membru', group.status === 200
    && group.json?.participants?.length === 2 && group.json.participants.every((p) => p.status === 'INVITED')
    && group.json.memberCount === 1 && group.json.myStatus === 'OWNER', group.json);
  check('grup: chatul se deschide abia după o acceptare', group.json?.chat?.available === false, group.json?.chat);
  const earlyMessage = await call('POST', `${TASK}/tasks/${gid}/messages`, { token: tokenA, body: { text: 'Hei' } });
  check('grup: mesaj înainte de acceptare → 409', earlyMessage.status === 409, earlyMessage);
  const invitedChat = await call('GET', `${TASK}/tasks/${gid}/messages`, { token: tokenB });
  check('grup: invitatul nu citește chatul', invitedChat.status === 409, invitedChat);
  const accepted = await call('POST', `${TASK}/tasks/${gid}/accept`, { token: tokenB });
  check('grup: B acceptă și devine membru', accepted.status === 200 && accepted.json?.myStatus === 'ACCEPTED'
    && accepted.json?.memberCount === 2 && accepted.json?.chat?.available === true, accepted.json);
  const acceptAgain = await call('POST', `${TASK}/tasks/${gid}/accept`, { token: tokenB });
  check('grup: a doua acceptare → 409', acceptAgain.status === 409, acceptAgain);
  const sent = await call('POST', `${TASK}/tasks/${gid}/messages`, { token: tokenA, body: { text: 'Ne vedem la 7' } });
  const groupChat = await call('GET', `${TASK}/tasks/${gid}/messages`, { token: tokenB });
  check('grup: chatul activității, fără emailuri', sent.status === 200 && sent.json?.mine === true
    && groupChat.json?.length === 1 && groupChat.json[0].text === 'Ne vedem la 7' && groupChat.json[0].mine === false
    && groupChat.json[0].username === userA.username && !('email' in groupChat.json[0]), groupChat.json);
  const emptyMessage = await call('POST', `${TASK}/tasks/${gid}/messages`, { token: tokenB, body: { text: '   ' } });
  check('grup: mesaj gol → 400', emptyMessage.status === 400, emptyMessage);
  const globalChat = await call('GET', `${USER}/chat`, { token: tokenB });
  check('grup: mesajul nu apare în chatul general', !(globalChat.json || []).some((m) => m.text === 'Ne vedem la 7'), globalChat.json);
  // reacții și răspunsuri în chatul activității
  const groupReply = await call('POST', `${TASK}/tasks/${gid}/messages`, { token: tokenB, body: { text: 'Vin și eu', replyTo: sent.json?.id } });
  check('grup: răspuns la un mesaj, cu citatul lui (fără email)', groupReply.status === 200
    && groupReply.json?.replyTo?.id === sent.json?.id && groupReply.json.replyTo.text === 'Ne vedem la 7'
    && groupReply.json.replyTo.username === userA.username && !('email' in groupReply.json.replyTo), groupReply.json);
  const groupReplyMissing = await call('POST', `${TASK}/tasks/${gid}/messages`, { token: tokenB, body: { text: 'Hm', replyTo: 999999999 } });
  check('grup: răspuns la un mesaj care nu există → 404', groupReplyMissing.status === 404, groupReplyMissing);
  const replyId = groupReply.json?.id;
  const reactUrl = `${TASK}/tasks/${gid}/messages/${replyId}/reactions`;
  const thumbs = await call('POST', reactUrl, { token: tokenA, body: { emoji: '👍' } });
  check('grup: A reacționează cu 👍', thumbs.status === 200 && thumbs.json?.id === replyId
    && JSON.stringify(thumbs.json?.reactions) === JSON.stringify([{ emoji: '👍', count: 1, mine: true }]), thumbs.json);
  const heart = await call('POST', reactUrl, { token: tokenB, body: { emoji: '❤' } });
  const reactedByA = (await call('GET', `${TASK}/tasks/${gid}/messages`, { token: tokenA })).json?.find((m) => m.id === replyId);
  check('grup: ❤ fără selector e același ❤️; fiecare își vede reacția', heart.status === 200
    && JSON.stringify(reactedByA?.reactions) === JSON.stringify([{ emoji: '👍', count: 1, mine: true }, { emoji: '❤️', count: 1, mine: false }]),
  reactedByA);
  const swapReaction = await call('POST', reactUrl, { token: tokenA, body: { emoji: '🔥' } });
  check('grup: altă reacție o înlocuiește pe prima (una de persoană)', swapReaction.status === 200
    && swapReaction.json?.reactions?.length === 2 && !swapReaction.json.reactions.some((r) => r.emoji === '👍')
    && swapReaction.json.reactions.find((r) => r.emoji === '🔥')?.mine === true, swapReaction.json);
  const undoReaction = await call('POST', reactUrl, { token: tokenA, body: { emoji: '🔥' } });
  check('grup: aceeași reacție a doua oară o scoate', undoReaction.status === 200
    && JSON.stringify(undoReaction.json?.reactions) === JSON.stringify([{ emoji: '❤️', count: 1, mine: false }]), undoReaction.json);
  const pizza = await call('POST', reactUrl, { token: tokenA, body: { emoji: '🍕' } });
  check('grup: reacție necunoscută → 400', pizza.status === 400, pizza);
  const invitedReacts = await call('POST', reactUrl, { token: tokenC, body: { emoji: '👍' } });
  check('grup: invitatul care n-a acceptat nu reacționează (409)', invitedReacts.status === 409, invitedReacts);
  const replyToReply = await call('POST', `${TASK}/tasks/${gid}/messages`, { token: tokenA, body: { text: 'Super', replyTo: replyId } });
  const deleteOthersGroup = await call('DELETE', `${TASK}/tasks/${gid}/messages/${sent.json?.id}`, { token: tokenB });
  check('grup: nu poți șterge mesajul altcuiva → 403', deleteOthersGroup.status === 403, deleteOthersGroup);
  const deleteOwnGroup = await call('DELETE', `${TASK}/tasks/${gid}/messages/${replyId}`, { token: tokenB });
  const groupAfterDelete = (await call('GET', `${TASK}/tasks/${gid}/messages`, { token: tokenA })).json ?? [];
  check('grup: îți ștergi mesajul; răspunsul la el rămâne, fără citat', replyToReply.status === 200 && deleteOwnGroup.status === 200
    && !groupAfterDelete.some((m) => m.id === replyId) && groupAfterDelete.find((m) => m.id === replyToReply.json?.id)?.replyTo === null,
  groupAfterDelete);
  const aConfirms = await call('POST', `${TASK}/tasks/${gid}/verify-complete`, { token: tokenA, body: {} });
  check('grup: A confirmă, activitatea îi așteaptă pe ceilalți', aConfirms.status === 200
    && aConfirms.json?.task?.status === 'Upcoming' && aConfirms.json.task.confirmedByMe === true
    && aConfirms.json.task.confirmedCount === 1, aConfirms.json?.task);
  const aAgain = await call('POST', `${TASK}/tasks/${gid}/verify-complete`, { token: tokenA, body: {} });
  check('grup: aceeași persoană nu confirmă de două ori', aAgain.status === 409, aAgain);
  const bConfirms = await call('POST', `${TASK}/tasks/${gid}/verify-complete`, { token: tokenB, body: {} });
  check('grup: B confirmă și primește streak + punct; C n-a răspuns încă', bConfirms.status === 200
    && bConfirms.json?.points === 1 && bConfirms.json?.streak === 1 && bConfirms.json?.task?.status === 'Upcoming', bConfirms.json);
  const cDeclines = await call('POST', `${TASK}/tasks/${gid}/decline`, { token: tokenC });
  const finished = (await call('GET', `${TASK}/tasks`, { token: tokenA })).json?.find((task) => task.id === gid);
  check('grup: după refuzul lui C toți membrii au confirmat → finalizată, chat deschis încă 5 zile',
    cDeclines.status === 200 && finished?.status === 'Completed' && finished.chat.readOnly === false
    && Date.parse(finished.chat.closesAt) > Date.now() + 4 * 86400000, finished);
  const cList = await call('GET', `${TASK}/tasks`, { token: tokenC });
  const cChat = await call('GET', `${TASK}/tasks/${gid}/messages`, { token: tokenC });
  check('grup: cine refuză nu mai vede activitatea', !(cList.json || []).some((task) => task.id === gid) && cChat.status === 404, cChat);
  const recapB = await call('GET', `${TASK}/tasks/recap`, { token: tokenB });
  check('grup: recap-ul lui B numără activitatea la Sport',
    recapB.json?.categories?.find((item) => item.category === 'SPORT')?.count === 1, recapB.json);

  const daily = await call('POST', `${TASK}/tasks`, { token: tokenA, body: baseTask({
    title: 'Citim zilnic', isRecurring: true, participants: [userB.username, userC.username],
  }) });
  const did = daily.json?.id;
  await call('POST', `${TASK}/tasks/${did}/accept`, { token: tokenB });
  const legacyEdit = await call('PUT', `${TASK}/tasks/${did}`, { token: tokenA, body: baseTask({
    title: 'Citim zilnic', isRecurring: true, friend: userB.username,
  }) });
  check('grup: o aplicație veche (doar „friend”) nu scoate invitați', legacyEdit.status === 200
    && legacyEdit.json?.participants?.length === 2, legacyEdit.json);
  const removeC = await call('PUT', `${TASK}/tasks/${did}`, { token: tokenA, body: baseTask({
    title: 'Citim zilnic', isRecurring: true, participants: [userB.username],
  }) });
  check('grup: proprietarul scoate un invitat', removeC.status === 200 && removeC.json?.participants?.length === 1, removeC.json);
  const aDaily = await call('POST', `${TASK}/tasks/${did}/verify-complete`, { token: tokenA, body: {} });
  check('grup zilnic: rămâne pe azi până confirmă toți', aDaily.json?.task?.dueDate === today
    && aDaily.json.task.completedToday === true, aDaily.json?.task);
  const bDaily = await call('POST', `${TASK}/tasks/${did}/verify-complete`, { token: tokenB, body: {} });
  check('grup zilnic: după ultimul membru trece pe mâine', bDaily.json?.task?.dueDate === tomorrow
    && bDaily.json.task.status === 'Upcoming' && bDaily.json.task.confirmedCount === 2, bDaily.json?.task);

  // --- favoruri: „pasă ca la tenis”, poză făcută la locație și aprobată de cel care a cerut
  const PHOTO = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAQABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCCiiimfOH/2Q==';
  const favorPlace = { latitude: 45.6427, longitude: 25.5887, radius: 150 };
  const photoAt = (place, extra = {}) => ({
    photo: `data:image/jpeg;base64,${PHOTO}`, latitude: place.latitude, longitude: place.longitude, accuracy: 10,
    takenAt: new Date().toISOString(), ...extra,
  });
  const favorBody = (friend, title) => ({ friend, title, details: 'Mulțumesc!', category: 'CHORES', dueDate: tomorrow, ...favorPlace });
  const strangerFavor = await call('POST', `${TASK}/favors`, { token: tokenC, body: favorBody(userB.username, 'Nu') });
  check('favor: doar prietenilor', strangerFavor.status === 400, strangerFavor);
  const firstFavor = await call('POST', `${TASK}/favors`, { token: tokenA, body: favorBody(userB.username, 'Cumpără pâine') });
  check('favor: primul favor nu e obligatoriu', firstFavor.status === 200 && firstFavor.json?.status === 'REQUESTED'
    && firstFavor.json.obligated === false && firstFavor.json.role === 'REQUESTER' && firstFavor.json.friend?.username === userB.username, firstFavor.json);
  const secondOpen = await call('POST', `${TASK}/favors`, { token: tokenB, body: favorBody(userA.username, 'Și eu') });
  check('favor: un singur favor deschis între doi prieteni', secondOpen.status === 409, secondOpen);
  const refuseFree = await call('POST', `${TASK}/favors/${firstFavor.json?.id}/refuse`, { token: tokenB });
  check('favor: „nerezonabil” doar când datorezi', refuseFree.status === 409, refuseFree);
  const favorDeclined = await call('POST', `${TASK}/favors/${firstFavor.json?.id}/decline`, { token: tokenB });
  check('favor: B refuză liber primul favor', favorDeclined.status === 200 && favorDeclined.json?.status === 'DECLINED', favorDeclined.json);
  const askFavor = await call('POST', `${TASK}/favors`, { token: tokenA, body: favorBody(userB.username, 'Udă florile') });
  const fid = askFavor.json?.id;
  const earlyPhoto = await call('POST', `${TASK}/favors/${fid}/photo`, { token: tokenB, body: photoAt(favorPlace) });
  check('favor: poza abia după acceptare', earlyPhoto.status === 409, earlyPhoto);
  await call('POST', `${TASK}/favors/${fid}/accept`, { token: tokenB });
  const farPhoto = await call('POST', `${TASK}/favors/${fid}/photo`, { token: tokenB, body: photoAt({ latitude: 44.4268, longitude: 26.1025 }) });
  check('favor: poza de departe e refuzată', farPhoto.status === 400 && /m de locația/.test(farPhoto.json?.error || ''), farPhoto);
  const oldPhoto = await call('POST', `${TASK}/favors/${fid}/photo`, { token: tokenB, body: photoAt(favorPlace, { takenAt: '2026-01-01T10:00:00Z' }) });
  check('favor: poza veche (nu din cameră acum) e refuzată', oldPhoto.status === 400, oldPhoto);
  const notJpeg = await call('POST', `${TASK}/favors/${fid}/photo`, { token: tokenB, body: photoAt(favorPlace, { photo: 'aGVsbG8gd29ybGQ=' }) });
  check('favor: doar JPEG', notJpeg.status === 400, notJpeg);
  const favorSubmitted = await call('POST', `${TASK}/favors/${fid}/photo`, { token: tokenB, body: photoAt(favorPlace) });
  check('favor: poza la locație → așteaptă aprobarea', favorSubmitted.status === 200 && favorSubmitted.json?.status === 'SUBMITTED'
    && favorSubmitted.json.hasPhoto === true, favorSubmitted.json);
  const strangerPhoto = await call('GET', `${TASK}/favors/${fid}/photo`, { token: tokenC });
  const photoForA = await call('GET', `${TASK}/favors/${fid}/photo`, { token: tokenA });
  check('favor: poza o văd doar cei doi', strangerPhoto.status === 404
    && photoForA.json?.dataUrl === `data:image/jpeg;base64,${PHOTO}`, strangerPhoto);
  const selfApprove = await call('POST', `${TASK}/favors/${fid}/approve`, { token: tokenB });
  check('favor: cel care l-a făcut nu-și aprobă singur poza', selfApprove.status === 403, selfApprove);
  const favorRejected = await call('POST', `${TASK}/favors/${fid}/reject`, { token: tokenA, body: { note: 'Nu se văd florile' } });
  check('favor: poza respinsă → se poate face alta', favorRejected.json?.status === 'ACCEPTED' && favorRejected.json.reviewNote === 'Nu se văd florile', favorRejected.json);
  await call('POST', `${TASK}/favors/${fid}/photo`, { token: tokenB, body: photoAt(favorPlace) });
  const pointsBefore = (await call('GET', `${USER}/users/me`, { token: tokenB })).json?.points ?? 0;
  const favorApproved = await call('POST', `${TASK}/favors/${fid}/approve`, { token: tokenA });
  const pointsAfter = (await call('GET', `${USER}/users/me`, { token: tokenB })).json?.points ?? 0;
  check('favor: aprobat → B primește un punct', favorApproved.json?.status === 'COMPLETED' && pointsAfter === pointsBefore + 1, { approved: favorApproved.json, pointsBefore, pointsAfter });
  const balancesA = await call('GET', `${TASK}/favors`, { token: tokenA });
  const balancesB = await call('GET', `${TASK}/favors`, { token: tokenB });
  check('favor: acum A îi datorează lui B', balancesA.json?.balances?.find((b) => b.username === userB.username)?.balance === 'I_OWE'
    && balancesB.json?.balances?.find((b) => b.username === userA.username)?.balance === 'THEY_OWE', balancesA.json?.balances);
  const owesAsk = await call('POST', `${TASK}/favors`, { token: tokenA, body: favorBody(userB.username, 'Încă unul') });
  check('favor: cine datorează nu poate cere', owesAsk.status === 409, owesAsk);
  const returnFavor = await call('POST', `${TASK}/favors`, { token: tokenB, body: favorBody(userA.username, 'Du gunoiul') });
  check('favor: B cere înapoi → A e obligat', returnFavor.json?.obligated === true, returnFavor.json);
  const declineOwed = await call('POST', `${TASK}/favors/${returnFavor.json?.id}/decline`, { token: tokenA });
  check('favor: cine datorează nu poate refuza liber', declineOwed.status === 409, declineOwed);
  const unreasonable = await call('POST', `${TASK}/favors/${returnFavor.json?.id}/refuse`, { token: tokenA });
  const stillOwes = await call('GET', `${TASK}/favors`, { token: tokenA });
  check('favor: „nerezonabil” → datoria rămâne', unreasonable.json?.status === 'REFUSED'
    && stillOwes.json?.balances?.find((b) => b.username === userB.username)?.balance === 'I_OWE', unreasonable.json);
  const favorOther = await call('POST', `${TASK}/favors`, { token: tokenB, body: favorBody(userA.username, 'Altceva') });
  const favorCanceled = await call('POST', `${TASK}/favors/${favorOther.json?.id}/cancel`, { token: tokenB });
  check('favor: după refuz se poate cere altul, iar cine a cerut îl poate anula', favorOther.status === 200
    && favorOther.json?.obligated === true && favorCanceled.json?.status === 'CANCELED', { other: favorOther.json, canceled: favorCanceled.json });
  const recapFavor = await call('GET', `${TASK}/tasks/recap`, { token: tokenB });
  check('favor: intră în recap-ul celui care l-a făcut',
    recapFavor.json?.categories?.find((item) => item.category === 'CHORES')?.count >= 1, recapFavor.json);

  // --- comunitate: profil public, streak arătat în chat, invitație deschisă la o activitate de grup
  const userD = { fullName: 'Dan Test', username: `dan_${run}`, email: `dan_${run}@example.com`, password };
  const tokenD = (await call('POST', `${USER}/users/register`, { body: userD })).json?.token;
  const profileA = await call('GET', `${USER}/profiles/@${userA.username}`, { token: tokenD });
  check('profil public: streak, puncte, activități finalizate, fără email', profileA.status === 200
    && profileA.json?.username === userA.username && profileA.json.streak >= 1 && profileA.json.completed >= 1
    && profileA.json.points >= 1 && profileA.json.relation === 'NONE' && !('email' in profileA.json), profileA.json);
  const profileFriend = await call('GET', `${USER}/profiles/${userB.username}`, { token: tokenA });
  const profileSelf = await call('GET', `${USER}/profiles/${userA.username}`, { token: tokenA });
  check('profil: relația e FRIEND / SELF', profileFriend.json?.relation === 'FRIEND' && profileSelf.json?.relation === 'SELF',
    [profileFriend.json?.relation, profileSelf.json?.relation]);
  const noStreak = await call('POST', `${USER}/chat/streak`, { token: tokenD });
  check('fără streak nu ai ce arăta → 400', noStreak.status === 400, noStreak);
  const shareStreak = await call('POST', `${USER}/chat/streak`, { token: tokenA });
  const streakChat = await call('GET', `${USER}/chat`, { token: tokenD });
  check('streak arătat în comunitate (valoarea de pe server)', shareStreak.status === 200 && streakChat.json?.[0]?.kind === 'STREAK'
    && streakChat.json[0].payload?.streak === shareStreak.json?.streak && streakChat.json[0].senderUsername === userA.username, streakChat.json?.[0]);

  const ride = await call('POST', `${TASK}/tasks`, { token: tokenA, body: baseTask({
    title: 'Tură de bicicletă', description: 'Ne întâlnim la intrarea în parc.', category: 'SPORT', dueDate: tomorrow,
  }) });
  const rid = ride.json?.id;
  const joinPrivate = await call('POST', `${TASK}/tasks/${rid}/join`, { token: tokenD });
  check('o activitate netrimisă în comunitate nu primește cereri → 404', joinPrivate.status === 404, joinPrivate);
  const shareRide = await call('POST', `${TASK}/tasks/${rid}/share`, { token: tokenA });
  const rideChat = await call('GET', `${USER}/chat`, { token: tokenD });
  check('invitația apare în chatul comunității', shareRide.status === 200 && shareRide.json?.shared === true
    && rideChat.json?.[0]?.kind === 'ACTIVITY' && rideChat.json[0].payload?.taskId === rid, rideChat.json?.[0]);
  const shareAgain = await call('POST', `${TASK}/tasks/${rid}/share`, { token: tokenA });
  const shareByOther = await call('POST', `${TASK}/tasks/${rid}/share`, { token: tokenB });
  check('o singură trimitere la câteva ore, doar de organizator', shareAgain.status === 409 && shareByOther.status === 404,
    [shareAgain.status, shareByOther.status]);
  const previewD = await call('GET', `${TASK}/tasks/shared?ids=${rid},999999`, { token: tokenD });
  check('previzualizare pentru oricine: fără locație și fără membri', previewD.status === 200 && previewD.json?.length === 1
    && previewD.json[0].myStatus === 'NONE' && previewD.json[0].canJoin === true && previewD.json[0].memberCount === 1
    && previewD.json[0].maxMembers === 30 && !('latitude' in previewD.json[0]) && !('participants' in previewD.json[0])
    && previewD.json[0].description === 'Ne întâlnim la intrarea în parc.', previewD.json);
  const ownerJoin = await call('POST', `${TASK}/tasks/${rid}/join`, { token: tokenA });
  check('organizatorul nu-și cere singur participarea → 409', ownerJoin.status === 409, ownerJoin);
  const dJoins = await call('POST', `${TASK}/tasks/${rid}/join`, { token: tokenD });
  const dReadsEarly = await call('GET', `${TASK}/tasks/${rid}/messages`, { token: tokenD });
  check('D (nu e prieten) cere să participe; până la aprobare nu e membru', dJoins.status === 200
    && dJoins.json?.myStatus === 'REQUESTED' && dReadsEarly.status === 404, [dJoins.json, dReadsEarly.status]);
  const rideA = (await call('GET', `${TASK}/tasks`, { token: tokenA })).json?.find((task) => task.id === rid);
  check('organizatorul vede cererea', rideA?.joinRequests?.length === 1 && rideA.joinRequests[0].username === userD.username, rideA?.joinRequests);
  const bJoins = await call('POST', `${TASK}/tasks/${rid}/join`, { token: tokenB });
  const declineB = await call('POST', `${TASK}/tasks/${rid}/requests/${userB.username}/decline`, { token: tokenA });
  const bAgain = await call('POST', `${TASK}/tasks/${rid}/join`, { token: tokenB });
  const previewB = await call('GET', `${TASK}/tasks/shared?ids=${rid}`, { token: tokenB });
  check('o cerere refuzată nu se poate repeta', bJoins.json?.myStatus === 'REQUESTED' && declineB.status === 200
    && bAgain.status === 409 && previewB.json?.[0]?.myStatus === 'DECLINED' && previewB.json[0].canJoin === false, previewB.json);
  const approveD = await call('POST', `${TASK}/tasks/${rid}/requests/@${userD.username}/approve`, { token: tokenA });
  check('organizatorul aprobă: D devine membru, chatul se deschide', approveD.status === 200 && approveD.json?.memberCount === 2
    && approveD.json.joinRequests?.length === 0 && approveD.json.chat?.available === true, approveD.json);
  const dTasks = await call('GET', `${TASK}/tasks`, { token: tokenD });
  const dMessage = await call('POST', `${TASK}/tasks/${rid}/messages`, { token: tokenD, body: { text: 'Vin cu bicicleta mea' } });
  check('D vede activitatea și scrie în chatul ei', dTasks.json?.find((task) => task.id === rid)?.myStatus === 'ACCEPTED'
    && dMessage.status === 200, dMessage);
  const approveAgain = await call('POST', `${TASK}/tasks/${rid}/requests/${userD.username}/approve`, { token: tokenA });
  check('o cerere aprobată nu se mai aprobă o dată → 404', approveAgain.status === 404, approveAgain);
  const keepD = await call('PUT', `${TASK}/tasks/${rid}`, { token: tokenA, body: baseTask({
    title: 'Tură de bicicletă', category: 'SPORT', dueDate: tomorrow, participants: [userD.username],
  }) });
  check('la editare rămâne membru și cine a intrat din comunitate (nu e prieten)', keepD.status === 200
    && keepD.json?.participants?.some((p) => p.username === userD.username && p.status === 'ACCEPTED'), keepD);
  const chatsA = await call('GET', `${TASK}/tasks/chats`, { token: tokenA });
  const rideChatEntry = chatsA.json?.find((item) => item.taskId === rid);
  check('lista de chaturi: ultimul mesaj și numărul de membri', chatsA.status === 200 && chatsA.json?.[0]?.taskId === rid
    && rideChatEntry?.lastMessage?.text === 'Vin cu bicicleta mea' && rideChatEntry.lastMessage.mine === false
    && rideChatEntry.memberCount === 2 && !('email' in rideChatEntry.lastMessage), chatsA.json?.[0]);
  const chatsC = await call('GET', `${TASK}/tasks/chats`, { token: tokenC });
  check('lista de chaturi conține doar activitățile tale', chatsC.status === 200 && !(chatsC.json || []).some((item) => item.taskId === rid), chatsC.json);
  const dCancels = await call('DELETE', `${TASK}/tasks/${rid}/join`, { token: tokenD });
  check('nu ai ce retrage după aprobare → 404', dCancels.status === 404, dCancels);

  // --- profil: descriere, poză (recodată de server), insigne, cea mai lungă serie, harta zilelor active
  const bioSaved = await call('PUT', `${USER}/users/me/profile`, { token: tokenA, body: { bio: '  Alerg dimineața.\n  Învăț seara.  ' } });
  const bioLong = await call('PUT', `${USER}/users/me/profile`, { token: tokenA, body: { bio: 'x'.repeat(161) } });
  check('descrierea de pe profil (un singur rând, max. 160)', bioSaved.status === 200 && bioSaved.json?.bio === 'Alerg dimineața. Învăț seara.'
    && bioLong.status === 400 && /160/.test(bioLong.json?.error || ''), [bioSaved.json?.bio, bioLong.json]);
  const avatarUp = await call('PUT', `${USER}/users/me/avatar`, { token: tokenA,
    body: { image: `data:image/png;base64,${png(300, 200).toString('base64')}` } });
  check('poza de profil se salvează', avatarUp.status === 200 && typeof avatarUp.json?.avatarVersion === 'number', avatarUp.json);
  const avatarFile = await fetch(`${USER}/avatars/${userA.username}`);
  const avatarBytes = Buffer.from(await avatarFile.arrayBuffer());
  check('poza e publică: JPEG mic, fără EXIF, cu cache', avatarFile.status === 200
    && avatarFile.headers.get('content-type') === 'image/jpeg' && avatarBytes[0] === 0xff && avatarBytes[1] === 0xd8
    && avatarBytes.length < 40_000 && !avatarBytes.includes(Buffer.from('Exif'))
    && /public/.test(avatarFile.headers.get('cache-control') || ''), [avatarFile.status, avatarFile.headers.get('content-type'), avatarBytes.length]);
  const notModified = await fetch(`${USER}/avatars/${userA.username}`, { headers: { 'If-None-Match': avatarFile.headers.get('etag') || '' } });
  check('poza: 304 când browserul o are deja', notModified.status === 304, notModified.status);
  const avatarBad = await call('PUT', `${USER}/users/me/avatar`, { token: tokenA, body: { image: Buffer.from('nu e o poză').toString('base64') } });
  const avatarTiny = await call('PUT', `${USER}/users/me/avatar`, { token: tokenA, body: { image: png(8, 8).toString('base64') } });
  check('poze invalide → 400', avatarBad.status === 400 && avatarTiny.status === 400, [avatarBad.json, avatarTiny.json]);
  const profileWithPhoto = await call('GET', `${USER}/profiles/${userA.username}`, { token: tokenB });
  check('profilul public: poza, descrierea, cea mai lungă serie și 18 insigne', profileWithPhoto.status === 200
    && profileWithPhoto.json?.avatarVersion === avatarUp.json?.avatarVersion && profileWithPhoto.json?.bio === 'Alerg dimineața. Învăț seara.'
    && profileWithPhoto.json?.bestStreak >= 1 && profileWithPhoto.json?.badges?.length === 18
    && profileWithPhoto.json.badges.find((badge) => badge.id === 'FIRST_STEP')?.earned === true
    && profileWithPhoto.json.badges.find((badge) => badge.id === 'DONE_100')?.earned === false, profileWithPhoto.json);
  const friendsWithPhoto = await call('GET', `${USER}/friends`, { token: tokenB });
  const boardWithPhoto = await call('GET', `${USER}/leaderboard`, { token: tokenB });
  const chatWithPhoto = await call('GET', `${USER}/chat`, { token: tokenB });
  check('poza apare la prieteni, în clasament și în chat', friendsWithPhoto.json?.find((friend) => friend.username === userA.username)?.avatarVersion
      === avatarUp.json?.avatarVersion
    && boardWithPhoto.json?.find((entry) => entry.username === userA.username)?.avatarVersion === avatarUp.json?.avatarVersion
    && chatWithPhoto.json?.find((message) => message.senderUsername === userA.username)?.senderAvatar === avatarUp.json?.avatarVersion,
    [friendsWithPhoto.json, chatWithPhoto.json?.[0]]);
  const meWithBest = await call('GET', `${USER}/users/me`, { token: tokenA });
  check('cea mai lungă serie e salvată', meWithBest.json?.bestStreak >= meWithBest.json?.streak && meWithBest.json?.bestStreak >= 1, meWithBest.json);
  const heatmap = await call('GET', `${TASK}/tasks/calendar/activity?weeks=8`, { token: tokenA });
  const heatMax = await call('GET', `${TASK}/tasks/calendar/activity?weeks=1000`, { token: tokenA });
  check('harta zilelor active: de luni, până azi, cu ziua de azi', heatmap.status === 200 && heatmap.json?.weeks === 8
    && new Date(`${heatmap.json.from}T12:00:00Z`).getUTCDay() === 1 && heatmap.json.to === today
    && heatmap.json.days?.some((day) => day.date === today && day.count >= 1) && heatmap.json.activeDays >= 1
    && heatMax.json?.weeks === 53, [heatmap.json, heatMax.json?.weeks]);
  const avatarGone = await call('DELETE', `${USER}/users/me/avatar`, { token: tokenA });
  const avatarMissing = await fetch(`${USER}/avatars/${userA.username}`);
  check('poza se poate scoate', avatarGone.status === 200 && avatarGone.json?.avatarVersion === null && avatarMissing.status === 404, avatarGone.json);

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
  const typo = await call('POST', `${USER}/chat`, { token: tokenA, body: { text: 'Mesaj cu greșeală' } });
  const typoId = (await call('GET', `${USER}/chat`, { token: tokenA })).json?.find((m) => m.text === 'Mesaj cu greșeală')?.id;
  const deleteOthers = await call('DELETE', `${USER}/chat/${typoId}`, { token: tokenB });
  const deleteOwn = await call('DELETE', `${USER}/chat/${typoId}`, { token: tokenA });
  const afterDelete = await call('GET', `${USER}/chat`, { token: tokenA });
  check('îți poți șterge mesajele tale, nu și pe ale altora', typo.status === 200 && deleteOthers.status === 403
    && deleteOwn.status === 200 && !afterDelete.json?.some((m) => m.id === typoId), [deleteOthers.status, deleteOwn.status]);
  const helloId = (await call('GET', `${USER}/chat`, { token: tokenA })).json?.find((m) => m.text === 'Salut din CI')?.id;
  const chatReply = await call('POST', `${USER}/chat`, { token: tokenB, body: { text: 'Salut, Ana!', replyTo: helloId } });
  const chatWithReply = (await call('GET', `${USER}/chat`, { token: tokenC })).json ?? [];
  const replyMessage = chatWithReply.find((m) => m.text === 'Salut, Ana!');
  check('comunitate: răspuns cu citatul mesajului (fără email)', chatReply.status === 200 && replyMessage?.replyTo?.id === helloId
    && replyMessage.replyTo.text === 'Salut din CI' && replyMessage.replyTo.username === userA.username
    && !('email' in replyMessage.replyTo) && Array.isArray(replyMessage.reactions), replyMessage);
  const chatReplyMissing = await call('POST', `${USER}/chat`, { token: tokenB, body: { text: 'Hm', replyTo: 999999999 } });
  check('comunitate: răspuns la un mesaj care nu există → 404', chatReplyMissing.status === 404, chatReplyMissing);
  const laugh = await call('POST', `${USER}/chat/${helloId}/reactions`, { token: tokenC, body: { emoji: '😂' } });
  const laughSeenByA = (await call('GET', `${USER}/chat`, { token: tokenA })).json?.find((m) => m.id === helloId);
  check('comunitate: reacția lui C, văzută de A (fără să fie a lui)', laugh.status === 200
    && JSON.stringify(laugh.json?.reactions) === JSON.stringify([{ emoji: '😂', count: 1, mine: true }])
    && JSON.stringify(laughSeenByA?.reactions) === JSON.stringify([{ emoji: '😂', count: 1, mine: false }]), laughSeenByA);
  const laughAgain = await call('POST', `${USER}/chat/${helloId}/reactions`, { token: tokenC, body: { emoji: '😂' } });
  check('comunitate: a doua apăsare scoate reacția', laughAgain.status === 200 && laughAgain.json?.reactions?.length === 0, laughAgain.json);
  const reactMissing = await call('POST', `${USER}/chat/999999999/reactions`, { token: tokenC, body: { emoji: '👍' } });
  const reactBad = await call('POST', `${USER}/chat/${helloId}/reactions`, { token: tokenC, body: { emoji: 'x' } });
  check('comunitate: reacție la un mesaj inexistent → 404, emoji necunoscut → 400', reactMissing.status === 404 && reactBad.status === 400,
    [reactMissing.status, reactBad.status]);

  // --- mesaje private: doar între prieteni; deschiderea conversației marchează mesajele ca citite
  const dmToB = await call('POST', `${USER}/dm/${userB.username}`, { token: tokenA, body: { text: 'Salut, Bob! Mergem mâine?' } });
  check('DM: A îi scrie prietenului B', dmToB.status === 200 && dmToB.json?.mine === true && dmToB.json.read === false
    && dmToB.json.username === userA.username && !('email' in dmToB.json), dmToB.json);
  const bInbox = await call('GET', `${USER}/dm`, { token: tokenB });
  const fromA = (bInbox.json ?? []).find((c) => c.username === userA.username);
  check('DM: B vede conversația cu un mesaj necitit (fără emailuri)', bInbox.status === 200 && fromA?.unread === 1
    && fromA.canWrite === true && fromA.lastMessage?.text === 'Salut, Bob! Mergem mâine?' && fromA.lastMessage.mine === false
    && !JSON.stringify(bInbox.json).includes('@example.com'), bInbox.json);
  const bOpens = await call('GET', `${USER}/dm/${userA.username}`, { token: tokenB });
  check('DM: B deschide conversația (mesajul încă apare ca necitit în răspunsul ăsta)', bOpens.status === 200
    && bOpens.json?.with?.username === userA.username && bOpens.json.canWrite === true && bOpens.json.messages?.length === 1
    && bOpens.json.messages[0].mine === false && bOpens.json.messages[0].read === false
    && !JSON.stringify(bOpens.json).includes('@example.com'), bOpens.json);
  const bInboxAfter = (await call('GET', `${USER}/dm`, { token: tokenB })).json?.find((c) => c.username === userA.username);
  const aSeesRead = (await call('GET', `${USER}/dm/${userB.username}`, { token: tokenA })).json?.messages?.[0];
  check('DM: după deschidere e citit (B: 0 necitite; A vede „văzut”)', bInboxAfter?.unread === 0 && aSeesRead?.read === true,
    { bInboxAfter, aSeesRead });
  const dmReply = await call('POST', `${USER}/dm/@${userA.username}`, { token: tokenB, body: { text: 'Da, la 7!', replyTo: dmToB.json?.id } });
  check('DM: B răspunde cu citat', dmReply.status === 200 && dmReply.json?.replyTo?.id === dmToB.json?.id
    && dmReply.json.replyTo.text === 'Salut, Bob! Mergem mâine?', dmReply.json);
  const dmReact = await call('POST', `${USER}/dm/messages/${dmToB.json?.id}/reactions`, { token: tokenB, body: { emoji: '👍' } });
  const aThread = (await call('GET', `${USER}/dm/${userB.username}`, { token: tokenA })).json;
  check('DM: reacția lui B apare la A', dmReact.status === 200
    && JSON.stringify(aThread?.messages?.find((m) => m.id === dmToB.json?.id)?.reactions) === JSON.stringify([{ emoji: '👍', count: 1, mine: false }]),
  aThread?.messages);
  const strangerWrites = await call('POST', `${USER}/dm/${userB.username}`, { token: tokenC, body: { text: 'Salut' } });
  check('DM: unui străin nu-i poți scrie (403)', strangerWrites.status === 403, strangerWrites);
  const strangerReacts = await call('POST', `${USER}/dm/messages/${dmToB.json?.id}/reactions`, { token: tokenC, body: { emoji: '👍' } });
  const strangerDeletes = await call('DELETE', `${USER}/dm/messages/${dmToB.json?.id}`, { token: tokenC });
  check('DM: un străin nu atinge mesajele altora (404, nimic nu se scurge)', strangerReacts.status === 404 && strangerDeletes.status === 404,
    [strangerReacts.status, strangerDeletes.status]);
  const strangerReads = await call('GET', `${USER}/dm/${userB.username}`, { token: tokenC });
  check('DM: un străin vede doar conversația lui (goală, fără drept de scris)', strangerReads.status === 200
    && strangerReads.json?.messages?.length === 0 && strangerReads.json.canWrite === false, strangerReads.json);
  const dmSelf = await call('POST', `${USER}/dm/${userA.username}`, { token: tokenA, body: { text: 'eu' } });
  const dmNobody = await call('POST', `${USER}/dm/nimeni_${run}`, { token: tokenA, body: { text: 'alo' } });
  const dmEmpty = await call('POST', `${USER}/dm/${userB.username}`, { token: tokenA, body: { text: '  ' } });
  check('DM: sie însuși → 400, cuiva inexistent → 404, gol → 400', dmSelf.status === 400 && dmNobody.status === 404 && dmEmpty.status === 400,
    [dmSelf.status, dmNobody.status, dmEmpty.status]);
  const bDeletesA = await call('DELETE', `${USER}/dm/messages/${dmToB.json?.id}`, { token: tokenB });
  const aDeletesOwn = await call('DELETE', `${USER}/dm/messages/${dmToB.json?.id}`, { token: tokenA });
  const bThreadAfter = (await call('GET', `${USER}/dm/${userA.username}`, { token: tokenB })).json;
  check('DM: doar cine a scris șterge mesajul; răspunsul rămâne fără citat', bDeletesA.status === 403 && aDeletesOwn.status === 200
    && bThreadAfter?.messages?.length === 1 && bThreadAfter.messages[0].text === 'Da, la 7!' && bThreadAfter.messages[0].replyTo === null,
  bThreadAfter);
  // C și B devin prieteni, își scriu, apoi B îl șterge pe C: conversația rămâne, dar doar de citit.
  await call('POST', `${USER}/friends`, { token: tokenC, body: { username: userB.username } });
  await call('POST', `${USER}/friends/${userC.username}/accept`, { token: tokenB });
  const cWrites = await call('POST', `${USER}/dm/${userB.username}`, { token: tokenC, body: { text: 'Mersi de acceptare!' } });
  const unfriend = await call('DELETE', `${USER}/friends/${userC.username}`, { token: tokenB });
  const cAfterUnfriend = await call('POST', `${USER}/dm/${userB.username}`, { token: tokenC, body: { text: 'Mai ești?' } });
  const cThread = (await call('GET', `${USER}/dm/${userB.username}`, { token: tokenC })).json;
  const cInbox = (await call('GET', `${USER}/dm`, { token: tokenC })).json?.find((c) => c.username === userB.username);
  check('DM: după ce prietenia se încheie conversația rămâne doar de citit', cWrites.status === 200 && unfriend.status === 200
    && cAfterUnfriend.status === 403 && cThread?.canWrite === false && cThread.messages?.length === 1 && cInbox?.canWrite === false,
  { cAfterUnfriend: cAfterUnfriend.status, cThread, cInbox });

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
  const beforeBonus = await call('GET', `${USER}/users/me`, { token: tokenB });
  const bonus = await call('POST', `${USER}/admin/users/${encodeURIComponent(userB.email)}/bonus-streak`, { token: adminLogin.json?.token });
  const meB = await call('GET', `${USER}/users/me`, { token: tokenB });
  check('bonus streak +5', bonus.status === 200 && meB.json?.streak === (beforeBonus.json?.streak ?? 0) + 5, meB.json);
  check('bonus streak: și recordul crește', meB.json?.bestStreak >= meB.json?.streak, meB.json);
  // Moderare: adminul scoate poza și descrierea cuiva.
  await call('PUT', `${USER}/users/me/profile`, { token: tokenC, body: { bio: 'Descriere de moderat' } });
  await call('PUT', `${USER}/users/me/avatar`, { token: tokenC, body: { image: png(64, 64, [200, 30, 30]).toString('base64') } });
  const clearByUser = await call('POST', `${USER}/admin/users/${encodeURIComponent(userC.email)}/clear-profile`, { token: tokenA });
  const cleared = await call('POST', `${USER}/admin/users/${encodeURIComponent(userC.email)}/clear-profile`, { token: adminLogin.json?.token });
  const meC = await call('GET', `${USER}/users/me`, { token: tokenC });
  const avatarC = await fetch(`${USER}/avatars/${userC.username}`);
  check('admin scoate poza și descrierea (doar adminul)', clearByUser.status === 403 && cleared.status === 200 && meC.json?.bio === ''
    && meC.json?.avatarVersion === null && avatarC.status === 404, [clearByUser.status, cleared.status, meC.json]);

  // --- versiuni noi ale aplicației: serverul vede release-ul (GitHub simulat) și îl anunță o singură dată în chat
  const releases = process.env.RELEASES_STUB || 'http://localhost:8099';
  const setRelease = (tag) => fetch(`${releases}/__set`, { method: 'POST', body: JSON.stringify({ tag }) });
  const updates = async () => ((await call('GET', `${USER}/chat`, { token: tokenB })).json || []).filter((m) => m.kind === 'UPDATE');
  await setRelease('android-v2.3.0-17');
  const baseline = await call('POST', `${USER}/admin/releases/check`, { token: adminLogin.json?.token });
  check('versiuni: prima verificare doar notează versiunea curentă', baseline.status === 200 && baseline.json?.version === '2.3.0'
    && baseline.json?.build === 17 && (await updates()).length === 0, baseline.json);
  await setRelease('android-v2.4.0-18');
  await call('POST', `${USER}/admin/releases/check`, { token: adminLogin.json?.token });
  await call('POST', `${USER}/admin/releases/check`, { token: adminLogin.json?.token });
  const announced = await updates();
  check('versiune nouă → un singur mesaj de la Whatever în chat', announced.length === 1 && announced[0].senderRole === 'SYSTEM'
    && announced[0].payload?.version === '2.4.0' && announced[0].payload?.build === 18
    && announced[0].payload?.url?.endsWith('/releases/download/android-v2.4.0-18/whatever.apk'), announced);
  const latestVersion = await call('GET', `${USER}/app/version`, { token: tokenC });
  check('GET /app/version: cea mai nouă versiune', latestVersion.status === 200 && latestVersion.json?.version === '2.4.0'
    && latestVersion.json?.build === 18, latestVersion.json);
  const userCheck = await call('POST', `${USER}/admin/releases/check`, { token: tokenA });
  check('verificarea forțată e doar pentru admin', userCheck.status === 403, userCheck.status);

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

  // --- notificări pe web (Web Push, fără Firebase): abonare, criptare și semnătură, preferințe, evenimente din ambele
  //     servicii. Serviciul de push e simulat aici (în CI serverele au PUSH_EXTRA_HOSTS=localhost).
  const pushes = [];
  const pushServer = createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      pushes.push({ path: request.url, headers: request.headers, body: Buffer.concat(chunks) });
      // Un browser care s-a dezabonat: serviciul de push răspunde 410 Gone.
      response.writeHead(request.url.startsWith('/gone/') ? 410 : 201);
      response.end();
    });
  });
  await new Promise((resolve) => pushServer.listen(8098, resolve));
  const waitPush = async (path, after) => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const found = pushes.slice(after).find((push) => push.path === path);
      if (found) return found;
      await sleep(200);
    }
    return null;
  };
  const vapid = await call('GET', `${USER}/push/key`, { token: tokenA });
  const vapidKey = vapid.json?.publicKey ?? '';
  check('push: cheia publică VAPID (P-256, 65 de octeți)', vapid.status === 200
    && Buffer.from(vapidKey, 'base64url').length === 65 && Buffer.from(vapidKey, 'base64url')[0] === 4, vapid.json);
  const browserA = createECDH('prime256v1');
  browserA.generateKeys();
  const authA = randomBytes(16);
  const keysA = { p256dh: browserA.getPublicKey().toString('base64url'), auth: authA.toString('base64url') };
  const pathA = `/push/${run}/a`;
  const subscribeA = await call('POST', `${USER}/push/subscriptions`, { token: tokenA,
    body: { endpoint: `http://localhost:8098${pathA}`, keys: keysA, language: 'en' } });
  const subscribeGone = await call('POST', `${USER}/push/subscriptions`, { token: tokenA,
    body: { endpoint: `http://localhost:8098/gone/${run}`, keys: keysA, language: 'ro' } });
  check('push: A își abonează două browsere', subscribeA.status === 200 && subscribeGone.json?.devices === 2, [subscribeA.json, subscribeGone.json]);
  const badEndpoint = await call('POST', `${USER}/push/subscriptions`, { token: tokenA,
    body: { endpoint: 'https://evil.example/push', keys: keysA } });
  const badKey = await call('POST', `${USER}/push/subscriptions`, { token: tokenA,
    body: { endpoint: `http://localhost:8098${pathA}x`, keys: { p256dh: Buffer.alloc(65).toString('base64url'), auth: keysA.auth } } });
  check('push: un endpoint necunoscut sau o cheie invalidă → 400', badEndpoint.status === 400 && badKey.status === 400,
    [badEndpoint.status, badKey.status]);
  let mark = pushes.length;
  const testPush = await call('POST', `${USER}/push/test`, { token: tokenA });
  const delivered = await waitPush(pathA, mark);
  const testMessage = delivered ? decryptPush(delivered.body, browserA, authA) : null;
  check('push: notificarea de test ajunge criptată (aes128gcm), semnată VAPID, în limba abonamentului', testPush.status === 200
    && delivered?.headers['content-encoding'] === 'aes128gcm' && Number(delivered.headers.ttl) > 0
    && vapidValid(delivered.headers.authorization, vapidKey, 'http://localhost:8098')
    && testMessage?.message.title === 'Notifications work!' && testMessage.message.url === '/profile' && testMessage.recordSize === 4096,
  { headers: delivered?.headers, testMessage });
  let afterGone = await call('GET', `${USER}/push/settings`, { token: tokenA });
  for (let attempt = 0; attempt < 25 && afterGone.json?.devices !== 1; attempt += 1) {
    await sleep(200);
    afterGone = await call('GET', `${USER}/push/settings`, { token: tokenA });
  }
  check('push: browserul care a răspuns 410 (dezabonat) e scos', afterGone.json?.devices === 1, afterGone.json);
  check('push: implicit primești toate tipurile', ['requests', 'messages', 'favors', 'invitations', 'updates']
    .every((kind) => afterGone.json?.[kind] === true), afterGone.json);
  const muted = await call('PUT', `${USER}/push/settings`, { token: tokenA, body: { messages: false } });
  check('push: oprești doar mesajele', muted.status === 200 && muted.json?.messages === false && muted.json.requests === true, muted.json);
  mark = pushes.length;
  await call('POST', `${USER}/dm/${userA.username}`, { token: tokenB, body: { text: 'Ești acolo?' } });
  await sleep(1500);
  check('push: cu mesajele oprite nu primești notificare pentru un mesaj privat', !pushes.slice(mark).some((push) => push.path === pathA),
    pushes.slice(mark).map((push) => push.path));
  await call('PUT', `${USER}/push/settings`, { token: tokenA, body: { messages: true } });
  mark = pushes.length;
  await call('POST', `${USER}/dm/${userA.username}`, { token: tokenB, body: { text: 'Hai la alergare!' } });
  const dmDelivery = await waitPush(pathA, mark);
  const dmPush = dmDelivery ? decryptPush(dmDelivery.body, browserA, authA).message : null;
  check('push: mesaj privat → titlul e numele, textul e mesajul, linkul duce la conversație', dmPush?.title === userB.fullName
    && dmPush.body === 'Hai la alergare!' && dmPush.url === `/chat/dm/${userB.username}`, dmPush);
  mark = pushes.length;
  const pushTask = await call('POST', `${TASK}/tasks`, { token: tokenB, body: baseTask({ title: 'Fotbal duminică', participants: [userA.username] }) });
  const inviteDelivery = await waitPush(pathA, mark);
  const invitePush = inviteDelivery ? decryptPush(inviteDelivery.body, browserA, authA).message : null;
  check('push: invitația trimisă de task-service ajunge la A, tradusă', pushTask.status === 200 && invitePush?.title === 'Activity invitation'
    && invitePush.body === `${userB.fullName} invited you to “Fotbal duminică”.` && invitePush.url === `/activity/${pushTask.json?.id}`, invitePush);
  const unsubscribed = await call('POST', `${USER}/push/unsubscribe`, { token: tokenA, body: { endpoint: `http://localhost:8098${pathA}` } });
  const testWithout = await call('POST', `${USER}/push/test`, { token: tokenA });
  check('push: după dezabonare nu mai ai dispozitive (test → 409)', unsubscribed.json?.devices === 0 && testWithout.status === 409,
    [unsubscribed.json, testWithout.status]);
  pushServer.close();

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
