// Test end-to-end al aplicației web (client/) într-un Chrome real, pe backend-ul pornit local în CI.
// Acoperă: cont nou, activități (simplă, cu passkey, cu locație), streak/puncte, cercul de progres,
// recap-ul lunar pe categorii, activitate cu un prieten (invitație + chatul ei), favor confirmat cu poză
// făcută cu camera live (cameră falsă a lui Chrome) la locație, chat, deconectare, rute protejate, schimbarea limbii (inclusiv mesajele
// traduse de server), resetare parolă prin cod, panoul de admin.
// Variabile: UI_URL (implicit http://localhost:5173), CHROME_PATH, USER_LOG (log-ul user-service,
// pentru codul de resetare când MAIL_PROVIDER=log), ADMIN_EMAIL, ADMIN_PASSWORD, USER_API, TASK_API
// (prietenul din testul de grup e creat direct prin API).
import { existsSync, readFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { chromium } from 'playwright-core';

/** Un PNG RGB de o singură culoare (poza de profil aleasă „din galerie”). */
function png(width, height, [red, green, blue] = [139, 92, 246]) {
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

const BASE = process.env.UI_URL || 'http://localhost:5173';
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const USER_LOG = process.env.USER_LOG || '';
const USER_API = process.env.USER_API || 'http://localhost:8081/api';
const TASK_API = process.env.TASK_API || 'http://localhost:8082/api';
// GitHub Releases simulat (e2e/releases-stub.mjs), pornit în CI lângă servicii.
const RELEASES = process.env.RELEASES_STUB || 'http://localhost:8099';
const run = Date.now().toString(36);
const me = {
  fullName: 'Ana Testescu',
  username: `ui_${run}`,
  email: `ui_${run}@ci.local`,
  password: 'parola-ui-foarte-sigura-1',
  newPassword: 'parola-ui-schimbata-2',
};
const BRASOV = { latitude: 45.6427, longitude: 25.5887, accuracy: 8 };
const BUCURESTI = { latitude: 44.4268, longitude: 26.1025, accuracy: 8 };
const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' });

let failures = 0;
let passed = 0;
const dialogs = [];
const pageErrors = [];
const consoleErrors = [];

// Camera: Chrome dă un flux video de test, fără să ceară voie (pentru poza favorului).
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: 'ro-RO',
  timezoneId: 'Europe/Bucharest',
  geolocation: BRASOV,
  permissions: ['geolocation', 'camera'],
});
// Camera pornește greu, ca pe un telefon mai vechi: „Fă poza” trebuie să rămână inactiv până e gata
// (altfel apăsarea se pierde). Fără întârzierea asta, camera falsă a lui Chrome pornește instant.
await context.addInitScript(() => {
  const media = navigator.mediaDevices;
  if (!media?.getUserMedia) return;
  const original = media.getUserMedia.bind(media);
  media.getUserMedia = (constraints) => new Promise((resolve) => setTimeout(resolve, 2000)).then(() => original(constraints));
});
const page = await context.newPage();
page.setDefaultTimeout(25_000);
page.on('dialog', (dialog) => {
  dialogs.push(dialog.message());
  dialog.accept().catch(() => undefined);
});
page.on('pageerror', (error) => pageErrors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});

// Passkey: un autentificator virtual (ca amprenta laptopului), prin Chrome DevTools Protocol.
const cdp = await context.newCDPSession(page);
await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator', {
  options: {
    protocol: 'ctap2',
    transport: 'internal',
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
  },
});

function annotate(level, title, message) {
  const text = String(message).replace(/%/g, '%25').replace(/\r?\n/g, '%0A');
  console.log(`::${level} title=${title}::${text}`);
}

async function pageText() {
  const text = await page.evaluate(() => document.body.innerText).catch(() => '');
  return text.replace(/\s+/g, ' ').slice(0, 900);
}

async function step(name, fn) {
  const started = Date.now();
  try {
    await fn();
    passed += 1;
    console.log(`✓ ${name} (${Date.now() - started} ms)`);
    return true;
  } catch (error) {
    failures += 1;
    const first = String(error?.message ?? error).split('\n').slice(0, 3).join(' ');
    const text = await pageText();
    console.log(`✗ FAIL ${name}: ${first}\n   URL: ${page.url()}\n   Pagina: ${text}`);
    annotate('error', `UI: ${name}`, `${first}\nURL: ${page.url()}\nPagina: ${text}`);
    // Un pas picat nu trebuie să-i tragă după el pe următorii: reluăm de la pagina principală.
    await page.goto(BASE).catch(() => undefined);
    return false;
  }
}

// Ecranele anterioare din stivă rămân în DOM (ascunse), deci căutăm doar elementele vizibile.
const visible = (locator) => locator.filter({ visible: true });
const button = (name) => visible(page.getByRole('button', { name, exact: true }));
const field = (label) => visible(page.getByLabel(label, { exact: true }));
const seen = (text) => visible(page.getByText(text)).first().waitFor();
const path = () => new URL(page.url()).pathname;

/** Cerere directă la backend (pentru al doilea utilizator din testul de grup). */
async function api(service, endpoint, { token, body } = {}) {
  const response = await fetch(`${service === 'user' ? USER_API : TASK_API}${endpoint}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${endpoint} → ${response.status} ${JSON.stringify(data)}`);
  return data;
}

async function waitPath(expected) {
  await page.waitForURL((url) => url.pathname === expected, { timeout: 25_000 });
}

async function openTab(name, expectedPath) {
  const tab = visible(page.getByRole('tab', { name }));
  if (await tab.count()) await tab.first().click();
  else await visible(page.getByText(name, { exact: true })).first().click();
  await waitPath(expectedPath);
}

/** Așteaptă un mesaj alert/confirm apărut după poziția `from` din listă. */
async function expectDialog(from, pattern) {
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    const found = dialogs.slice(from).find((message) => pattern.test(message));
    if (found) return found;
    await page.waitForTimeout(200);
  }
  throw new Error(`Niciun mesaj ${pattern}. Mesaje: ${dialogs.slice(from).join(' | ') || '(niciunul)'}`);
}

/** Cardul unei activități: cel mai adânc element care conține titlul și butonul cerut. */
function taskCard(title, buttonName = 'Confirmă') {
  return visible(page.locator('div').filter({ hasText: title }).filter({ has: button(buttonName) })).last();
}

async function confirmTask(title) {
  await taskCard(title).getByRole('button', { name: 'Confirmă', exact: true }).click();
}

async function createTask(title, { biometrics = false, location = false, radius, category, friends = [] } = {}) {
  await page.goto(`${BASE}/task/new`);
  await field('Ce vrei să faci?').fill(title);
  if (category) await button(category).click();
  for (const username of friends) await visible(page.getByRole('checkbox', { name: `@${username}` })).click();
  if (biometrics) await visible(page.getByRole('switch', { name: 'Confirmare cu biometrie' })).click();
  if (location) {
    await visible(page.getByRole('switch', { name: 'Confirmare în locație' })).click();
    // Pinul pornește automat de la locația curentă.
    await seen(`${BRASOV.latitude.toFixed(5)}, ${BRASOV.longitude.toFixed(5)}`);
    if (radius) {
      await button('Altă rază').click();
      await field('Raza în metri').fill(String(radius));
    }
  }
  await button('Adaugă activitatea').click();
  await page.waitForURL((url) => url.pathname !== '/task/new');
  await taskCard(title).waitFor();
}

/** Încearcă `check` până trece (o acțiune din pagină ajunge la server după o clipă). */
async function eventually(check, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      return await check();
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await page.waitForTimeout(400);
    }
  }
}

/** Pe Social → Prieteni: acceptă cererea de prietenie primită de la `friend`. */
async function acceptFriendRequest(friend) {
  await seen('Cereri primite');
  await visible(page.locator('div').filter({ hasText: `@${friend.username}` }).filter({ has: button('Acceptă') })).last()
    .getByRole('button', { name: 'Acceptă', exact: true }).click();
  await seen(`Acum ești prieten cu @${friend.username}.`);
}

async function login(email, password) {
  await page.goto(`${BASE}/login`);
  await field('Email').fill(email);
  await field('Parolă').fill(password);
  await button('Intră în cont').click();
  await seen(/^Salut, /);
}

async function logout() {
  await openTab('Profil', '/profile');
  await button('Deconectează-te').click();
  await waitPath('/login');
}

let ok = await step('se deschide pagina de autentificare', async () => {
  await page.goto(BASE);
  await waitPath('/login');
  await button('Intră în cont').waitFor();
});

ok = ok && await step('cont nou', async () => {
  await visible(page.getByText('Cont nou', { exact: true })).click();
  await waitPath('/register');
  await field('Nume complet').fill(me.fullName);
  await field('Username').fill(me.username);
  await field('Email').fill(me.email);
  await field('Parolă (minim 12 caractere)').fill(me.password);
  await button('Creează contul').click();
  await seen('Salut, Ana!');
  if (await page.getByRole('tab', { name: 'Admin' }).count()) throw new Error('Un utilizator normal vede tab-ul Admin');
});

if (ok) {
  await step('activitate simplă: creare și confirmare → streak 1', async () => {
    await createTask('Citesc 10 pagini');
    const before = dialogs.length;
    await confirmTask('Citesc 10 pagini');
    await expectDialog(before, /Streak: 1 zi · 1 punct$/m);
    // Lista arată implicit doar activitățile active; cea finalizată apare la filtrul „Finalizate”.
    await button('Finalizate').click();
    await seen('Citesc 10 pagini');
    await seen('Făcută azi');
    await button('Active').click();
  });

  await step('reîncărcarea paginii păstrează sesiunea și ruta', async () => {
    await page.goto(`${BASE}/tasks`);
    await page.reload();
    await seen(/^1 în total/);
    if (path() !== '/tasks') throw new Error(`Am ajuns pe ${path()}`);
  });

  const passkey = await step('passkey activat din Profil', async () => {
    await openTab('Profil', '/profile');
    await seen('Neactivată pe acest dispozitiv');
    await button('Activează').click();
    await seen('Activă pe acest dispozitiv');
  });

  if (passkey) {
    await step('activitate cu biometrie: confirmată cu passkey', async () => {
      await createTask('Meditez 5 minute', { biometrics: true });
      const before = dialogs.length;
      await confirmTask('Meditez 5 minute');
      await expectDialog(before, /Streak: 1 zi · 2 puncte/);
    });
  }

  await step('activitate cu locație (rază aleasă de mână): confirmată la fața locului', async () => {
    await createTask('Alerg în parc', { location: true, radius: 250, category: 'Activitate fizică / sport' });
    await taskCard('Alerg în parc').getByText('GPS · 250 m').waitFor();
    const before = dialogs.length;
    await confirmTask('Alerg în parc');
    await expectDialog(before, /Streak: 1 zi · \d+ puncte/);
  });

  await step('activitate cu locație: refuzată de departe', async () => {
    await createTask('Înot la bazin', { location: true });
    await context.setGeolocation(BUCURESTI);
    const before = dialogs.length;
    await confirmTask('Înot la bazin');
    await expectDialog(before, /Nu s-a putut confirma/);
    await taskCard('Înot la bazin').waitFor(); // încă are butonul „Confirmă”
    await context.setGeolocation(BRASOV);
  });

  await step('acasă: cercul arată progresul de azi', async () => {
    await page.goto(BASE);
    await waitPath('/');
    // Trei activități confirmate azi și una încă deschisă („Înot la bazin”), deci între 1 și 99%.
    const ring = visible(page.getByRole('progressbar', { name: /^Progresul de azi: [1-9]\d?%$/ })).first();
    await ring.waitFor();
    const value = Number(await ring.getAttribute('aria-valuenow'));
    if (!(value > 0 && value < 100)) throw new Error(`Progres afișat: ${value}%`);
    await seen(/^\d din \d finalizate$/);
  });

  await step('recap lunar pe categorii', async () => {
    await button('Vezi recapul').click();
    await waitPath('/recap');
    await visible(page.getByLabel(/^Activitate fizică \/ sport: 1 activitate, \d+%$/)).first().waitFor();
    await visible(page.getByLabel(/^Treburi \/ comisioane: \d+ activități, \d+%$/)).first().waitFor();
    await seen('Divertisment');
    await button('Închide').click();
    await waitPath('/');
  });

  // Linkurile externe (Google Maps, Google Calendar) se deschid într-o fereastră nouă: le prindem fără să plecăm din pagină.
  const catchOpenedLinks = () => page.evaluate(() => {
    window.__opened = [];
    window.open = (url) => { window.__opened.push(String(url)); return null; };
  });
  const openedLinks = () => page.evaluate(() => window.__opened ?? []);

  await step('detalii: descriere, Google Maps spre centrul razei, Google Calendar, repetare la 2 săptămâni', async () => {
    await page.goto(`${BASE}/task/new`);
    await field('Ce vrei să faci?').fill('Fotbal în parc');
    await field('Descriere (opțional)').fill('Adu mingea. Ne vedem la intrarea dinspre lac.');
    await visible(page.getByRole('switch', { name: 'Se repetă' })).click();
    await field('Numărul de zile sau săptămâni').fill('2');
    await visible(page.getByRole('tab', { name: 'săptămâni', exact: true })).click();
    await seen('Revine la 2 săptămâni după ce o confirmi.');
    await visible(page.getByRole('switch', { name: 'Confirmare în locație' })).click();
    await seen(`${BRASOV.latitude.toFixed(5)}, ${BRASOV.longitude.toFixed(5)}`);
    await button('Adaugă activitatea').click();
    await page.waitForURL((url) => url.pathname !== '/task/new');
    await taskCard('Fotbal în parc').getByText('La fiecare 2 săptămâni · 0×').waitFor();
    await visible(page.getByRole('link', { name: 'Detalii: Fotbal în parc', exact: true })).first().click();
    await page.waitForURL((url) => url.pathname.startsWith('/activity/'));
    await seen('Adu mingea. Ne vedem la intrarea dinspre lac.');
    await seen('Repetare: La fiecare 2 săptămâni · încă neconfirmată');
    await seen('Raza: 150 m');
    await catchOpenedLinks();
    await button('Deschide în Google Maps').click();
    await button('Adaugă în Google Calendar').click();
    const opened = await openedLinks();
    const maps = opened.find((url) => url.startsWith('https://www.google.com/maps/dir/'));
    if (!maps?.includes(`destination=${BRASOV.latitude.toFixed(6)},${BRASOV.longitude.toFixed(6)}`)) {
      throw new Error(`Google Maps nu duce în centrul razei: ${opened.join(' | ')}`);
    }
    const calendar = new URL(opened.find((url) => url.startsWith('https://calendar.google.com/calendar/render')) ?? 'about:blank');
    if (calendar.searchParams.get('recur') !== 'RRULE:FREQ=WEEKLY;INTERVAL=2' || calendar.searchParams.get('text') !== 'Fotbal în parc'
      || !calendar.searchParams.get('details')?.startsWith('Adu mingea.')) {
      throw new Error(`Google Calendar: ${calendar}`);
    }
    // Butoanele de pe card sunt și aici: confirmarea mută activitatea peste 2 săptămâni.
    const before = dialogs.length;
    await button('Confirmă').click();
    await expectDialog(before, /Streak: 1 zi/);
    await seen(/^Revine pe \d{1,2} \S+/);
    await button('Închide').click();
  });

  await step('calendar: finalizarea de azi, ziua aleasă și abonarea din Google Calendar', async () => {
    await openTab('Activități', '/tasks');
    // Butoanele cu iconiță au în nume și caracterul iconiței, deci căutăm după o parte din nume.
    await visible(page.getByRole('tab', { name: 'Calendar' })).click();
    await visible(page.getByRole('button', { name: /^Azi · programate: \d+ · finalizate: [1-9]/ })).first().click();
    await seen(/activități finalizate$/);
    await visible(page.getByRole('link', { name: 'Detalii: Fotbal în parc', exact: true })).first().waitFor();
    const subscribe = button('Abonează-te în Google Calendar');
    await eventually(async () => {
      if ((await subscribe.getAttribute('aria-disabled')) === 'true') throw new Error('Linkul de abonare nu e gata');
    });
    await catchOpenedLinks();
    await subscribe.click();
    const opened = await openedLinks();
    const cid = new URL(opened[0] ?? 'about:blank').searchParams.get('cid') ?? '';
    if (!/^webcal:\/\/.+\/tasks\/calendar\/feed\/[A-Za-z0-9_-]{32}\.ics\?lang=ro$/.test(cid)) throw new Error(`Abonare: ${opened.join(' | ')}`);
    // Fișierul pe care îl citește Google: fără autentificare, cu activitatea și repetarea ei.
    const response = await fetch(cid.replace(/^webcal:/, new URL(TASK_API).protocol));
    const ics = (await response.text()).replace(/\r\n /g, '');
    if (response.status !== 200 || !ics.includes('SUMMARY:Fotbal în parc') || !ics.includes('RRULE:FREQ=WEEKLY;INTERVAL=2')) {
      throw new Error(`Fișierul .ics: ${response.status} ${ics.slice(0, 400)}`);
    }
    await visible(page.getByRole('tab', { name: 'Listă' })).click();
  });

  await step('activitate cu un prieten: invitație, acceptare și chatul activității', async () => {
    const friend = {
      fullName: 'Bob Prieten', username: `bob_${run}`, email: `bob_${run}@ci.local`, password: 'parola-bob-foarte-sigura-1',
    };
    const { token } = await api('user', '/users/register', { body: friend });
    // Prietenul trimite o cerere; până nu o accept, nu-l pot invita.
    await api('user', '/friends', { token, body: { username: me.username } });
    await page.goto(BASE);
    await waitPath('/');
    // Tab-ul Social arată că ceva așteaptă după tine.
    await visible(page.getByRole('tab', { name: /Social/ })).filter({ hasText: '1' }).first().waitFor();
    await openTab('Social', '/social');
    await visible(page.getByRole('tab', { name: 'Prieteni' })).click();
    await acceptFriendRequest(friend);
    await createTask('Alergăm împreună', { category: 'Activitate fizică / sport', friends: [friend.username] });
    await seen(`@${friend.username} · invitat`);
    const invite = (await api('task', '/tasks', { token })).find((task) => task.title === 'Alergăm împreună');
    if (invite?.myStatus !== 'INVITED') throw new Error(`Prietenul nu are invitația: ${JSON.stringify(invite)}`);
    await api('task', `/tasks/${invite.id}/accept`, { token, body: {} });
    await api('task', `/tasks/${invite.id}/messages`, { token, body: { text: 'Salut! Ne vedem la 7?' } });
    await page.reload();
    await seen('0/2 confirmări');
    await taskCard('Alergăm împreună', 'Chat · 1').getByRole('button', { name: 'Chat · 1', exact: true }).click();
    await waitPath(`/chat/${invite.id}`);
    await seen('Salut! Ne vedem la 7?');
    await seen('nu a confirmat încă');
    await visible(page.getByPlaceholder('Scrie un mesaj pentru grup…')).fill('Perfect, vin și eu!');
    await button('Trimite').click();
    await seen('Perfect, vin și eu!');
    const seenByFriend = await api('task', `/tasks/${invite.id}/messages`, { token });
    if (!seenByFriend.some((message) => message.text === 'Perfect, vin și eu!' && !message.mine)) {
      throw new Error(`Prietenul nu vede mesajul: ${JSON.stringify(seenByFriend)}`);
    }
    const general = await api('user', '/chat', { token });
    if (general.some((message) => message.text === 'Perfect, vin și eu!')) throw new Error('Mesajul a ajuns în chatul general');
    await button('Închide').click();
    await waitPath('/tasks');
  });

  await step('favor: prietenul cere, faci poza cu camera live la locație, el aprobă', async () => {
    const friend = {
      fullName: 'Cip Vecin', username: `cip_${run}`, email: `cip_${run}@ci.local`, password: 'parola-cip-foarte-sigura-1',
    };
    const { token } = await api('user', '/users/register', { body: friend });
    await api('user', '/friends', { token, body: { username: me.username } });
    // Cererea de prietenie apare pe Acasă și duce la Social → Prieteni.
    await page.goto(BASE);
    await seen('O cerere de prietenie');
    await button('Vezi cererile').click();
    await waitPath('/social');
    await acceptFriendRequest(friend);
    const favor = await api('task', '/favors', { token, body: {
      friend: me.username, title: 'Ridică-mi coletul', details: 'E pe numele meu.', category: 'CHORES', dueDate: tomorrow,
      latitude: BRASOV.latitude, longitude: BRASOV.longitude, radius: 150,
    } });
    await page.goto(BASE);
    await seen('Un favor așteaptă după tine');
    await button('Vezi favorurile').click();
    await waitPath('/social');
    await visible(page.locator('div').filter({ hasText: 'Ridică-mi coletul' }).filter({ has: button('Accept') })).last()
      .getByRole('button', { name: 'Accept', exact: true }).click();
    await button('Fă poza la locație').click();
    await waitPath(`/favor/${favor.id}`);
    await button('Fă poza').click();
    const from = dialogs.length;
    await button('Trimite poza').click();
    await expectDialog(from, /Poza a fost trimisă spre aprobare/);
    const photo = await api('task', `/favors/${favor.id}/photo`, { token });
    if (!/^data:image\/jpeg;base64,\/9j\//.test(photo.dataUrl)) throw new Error('Prietenul nu primește un JPEG');
    await api('task', `/favors/${favor.id}/approve`, { token, body: {} });
    await page.reload();
    await seen('Îți datorează un favor');
    await seen('Făcut');
    await page.goto(BASE);
    await waitPath('/');
  });

  await step('chaturi: comunitatea și chatul activității în listă; mesaj și streak arătat', async () => {
    await openTab('Social', '/social');
    await visible(page.getByRole('tab', { name: 'Chat' })).click();
    await seen('Chaturile activităților');
    await visible(page.getByRole('button', { name: /^Alergăm împreună/ })).first().waitFor();
    await visible(page.getByRole('button', { name: /^Comunitate/ })).first().click();
    await waitPath('/chat/community');
    const text = `Salut din testul UI ${run}`;
    await visible(page.getByPlaceholder('Scrie un mesaj pentru comunitate…')).fill(text);
    await button('Trimite').click();
    await seen(text);
    await button('Arată-ți streak-ul').click();
    await seen('Streak-ul tău a apărut în chat.');
    await seen(/^Ana are un streak de \d+ (zi|zile|de zile)!$/);
  });

  await step('profil din chat: cererea de prietenie trimisă și acceptată', async () => {
    const stranger = {
      fullName: 'Dana Străină', username: `dana_${run}`, email: `dana_${run}@ci.local`, password: 'parola-dana-foarte-sigura-1',
    };
    const { token } = await api('user', '/users/register', { body: stranger });
    await api('user', '/chat', { token, body: { text: 'Cine vine la alergare?' } });
    await page.goto(`${BASE}/chat/community`);
    await seen('Cine vine la alergare?');
    await visible(page.getByRole('link', { name: 'Vezi profilul lui Dana Străină' })).first().click();
    await waitPath(`/user/${stranger.username}`);
    await seen('Activități finalizate');
    await button('Adaugă prieten').click();
    await seen('Cerere de prietenie trimisă');
    await api('user', `/friends/${me.username}/accept`, { token, body: {} });
    await page.reload();
    await seen('Sunteți prieteni');
  });

  await step('invitație în comunitate: cineva cere să participe, organizatorul aprobă', async () => {
    await createTask('Tură de bicicletă', { category: 'Activitate fizică / sport' });
    const from = dialogs.length;
    await taskCard('Tură de bicicletă', 'Trimite în comunitate')
      .getByRole('button', { name: 'Trimite în comunitate', exact: true }).click();
    await expectDialog(from, /Invitația a apărut în chatul comunității/);
    await page.goto(`${BASE}/chat/community`);
    await seen('Invitație la o activitate');
    await seen('Activitatea ta');
    const joiner = {
      fullName: 'Eva Comunitate', username: `eva_${run}`, email: `eva_${run}@ci.local`, password: 'parola-eva-foarte-sigura-1',
    };
    const { token } = await api('user', '/users/register', { body: joiner });
    const invite = (await api('user', '/chat', { token }))
      .find((message) => message.kind === 'ACTIVITY' && message.payload?.title === 'Tură de bicicletă');
    if (!invite) throw new Error('Invitația nu e în chatul comunității');
    const asked = await api('task', `/tasks/${invite.payload.taskId}/join`, { token, body: {} });
    if (asked.myStatus !== 'REQUESTED') throw new Error(`Cererea nu a fost trimisă: ${JSON.stringify(asked)}`);
    await page.goto(BASE);
    await seen('Cereri de participare · O cerere de participare');
    await visible(page.locator('div').filter({ hasText: `@${joiner.username}` }).filter({ has: button('Aprobă') })).last()
      .getByRole('button', { name: 'Aprobă', exact: true }).click();
    await eventually(async () => {
      const tasks = await api('task', '/tasks', { token });
      if (!tasks.some((task) => task.title === 'Tură de bicicletă' && task.myStatus === 'ACCEPTED')) throw new Error('Nu a devenit membru');
    });
  });

  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    await step('versiune nouă: anunț roșu în chat și butonul de update din Profil', async () => {
      const admin = await api('user', '/users/login', { body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } });
      // Două versiuni la rând: prima verificare poate doar nota versiunea curentă, a doua e sigur „nouă”.
      for (const tag of ['android-v9.8.0-98', 'android-v9.9.0-99']) {
        await fetch(`${RELEASES}/__set`, { method: 'POST', body: JSON.stringify({ tag }) });
        await api('user', '/admin/releases/check', { token: admin.token, body: {} });
      }
      await page.goto(`${BASE}/chat/community`);
      await seen('Există un nou update: versiunea 9.9.0');
      await button('Actualizează').waitFor();
      await page.goto(`${BASE}/profile`);
      await seen(/^Ai versiunea \d+\.\d+\.\d+$/);
      await seen('Versiune nouă disponibilă: 9.9.0');
      await button('Reîncarcă aplicația').waitFor();
    });
  }

  await step('deconectare și rută protejată', async () => {
    await logout();
    await page.goto(`${BASE}/tasks`);
    await waitPath('/login');
  });

  await step('limba: engleză (inclusiv erorile serverului), apoi înapoi la română', async () => {
    await page.goto(`${BASE}/login`);
    try {
      await visible(page.getByRole('radio', { name: 'English' })).click();
      await button('Sign in').waitFor();
      await field('Email').fill(me.email);
      await field('Password').fill('parola-gresita-123456');
      await button('Sign in').click();
      await seen('Incorrect email or password.');
      // Alegerea rămâne după reîncărcare.
      await page.reload();
      await button('Sign in').waitFor();
      await visible(page.getByRole('radio', { name: 'Română' })).click();
      await button('Intră în cont').waitFor();
    } finally {
      // Pașii următori caută textele în română, chiar dacă acest pas a eșuat.
      await page.evaluate(() => window.localStorage.setItem('whatever.language', 'ro')).catch(() => undefined);
    }
  });

  await step('resetare parolă cu codul din email', async () => {
    if (!USER_LOG || !existsSync(USER_LOG)) throw new Error(`USER_LOG lipsește: ${USER_LOG}`);
    await page.goto(`${BASE}/forgot`);
    await field('Email').fill(me.email);
    await field('Username').fill(me.username);
    await button('Trimite codul').click();
    await waitPath('/reset');
    let code;
    for (let i = 0; i < 20 && !code; i += 1) {
      const log = readFileSync(USER_LOG, 'utf8');
      const start = log.lastIndexOf(me.email);
      code = start >= 0 ? log.slice(start).match(/Codul tău: ([A-Z0-9]{5}-[A-Z0-9]{5})/)?.[1] : undefined;
      if (!code) await page.waitForTimeout(250);
    }
    if (!code) throw new Error('Codul de resetare nu apare în log');
    // Exact linkul din email.
    await page.goto(`${BASE}/reset?code=${code}`);
    await field('Parola nouă (minim 12 caractere)').fill(me.newPassword);
    await button('Schimbă parola').click();
    await button('Autentifică-te').click();
    await waitPath('/login');
    await login(me.email, me.newPassword);
  });

  await step('profilul arată streak-ul și punctele', async () => {
    await openTab('Profil', '/profile');
    await seen('🔥 1');
    const text = await page.evaluate(() => document.body.innerText);
    const points = Number(text.match(/Puncte\s+(\d+)/)?.[1]);
    if (!(points >= 2)) throw new Error(`Puncte afișate: ${points}`);
  });

  await step('profil: poză din galerie, descriere, insigne; harta zilelor active în recap', async () => {
    await openTab('Profil', '/profile');
    // Poza: selectorul de fișiere al browserului primește un PNG făcut aici; aplicația îl decupează pătrat.
    const chooser = page.waitForEvent('filechooser');
    await button('Adaugă o poză').click();
    await (await chooser).setFiles({ name: 'poza.png', mimeType: 'image/png', buffer: png(300, 200) });
    await button('Schimbă poza').waitFor();
    const photo = await fetch(`${USER_API}/avatars/${me.username}`);
    if (photo.status !== 200 || photo.headers.get('content-type') !== 'image/jpeg') throw new Error(`Poza: ${photo.status}`);
    await button('Adaugă o descriere').click();
    await field('Despre tine').fill('Alerg dimineața și învăț pentru licență.');
    await button('Salvează descrierea').click();
    await seen('Alerg dimineața și învăț pentru licență.');
    await visible(page.getByRole('button', { name: 'Primul pas: Câștigată', exact: true })).first().waitFor();
    await visible(page.getByRole('button', { name: /^Centenar: Progres: \d+ din 100$/ })).first().waitFor();
    await button('Recap lunar').click();
    await waitPath('/recap');
    await seen('Zilele tale active');
    await visible(page.getByRole('button', { name: /· finalizate: [1-9]\d*$/ })).first().waitFor();
    await button('Închide').click();
  });

  const admin = process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD;
  if (admin) {
    await step('admin: vede contul nou în panou', async () => {
      await logout();
      await login(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
      await openTab('Admin', '/admin');
      await seen(`@${me.username}`);
    });
  }
}

await step('fără erori JavaScript în pagină', async () => {
  if (pageErrors.length) throw new Error(pageErrors.slice(0, 5).join(' | '));
});
if (consoleErrors.length) {
  annotate('notice', 'UI: mesaje console.error', consoleErrors.slice(0, 10).join('\n'));
}

await browser.close();
console.log(failures ? `\n${failures} pași au eșuat` : '\nToate testele UI au trecut');
annotate('notice', 'UI e2e', `${passed} pași trecuți, ${failures} eșuați`);
process.exit(failures ? 1 : 0);
