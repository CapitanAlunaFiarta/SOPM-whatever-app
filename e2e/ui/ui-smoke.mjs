// Test end-to-end al aplicației web (client/) într-un Chrome real, pe backend-ul pornit local în CI.
// Acoperă: cont nou, activități (simplă, cu passkey, cu locație), streak/puncte, chat, deconectare,
// rute protejate, resetare parolă prin cod, panoul de admin.
// Variabile: UI_URL (implicit http://localhost:5173), CHROME_PATH, USER_LOG (log-ul user-service,
// pentru codul de resetare când MAIL_PROVIDER=log), ADMIN_EMAIL, ADMIN_PASSWORD.
import { existsSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.UI_URL || 'http://localhost:5173';
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const USER_LOG = process.env.USER_LOG || '';
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

let failures = 0;
let passed = 0;
const dialogs = [];
const pageErrors = [];
const consoleErrors = [];

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: 'ro-RO',
  timezoneId: 'Europe/Bucharest',
  geolocation: BRASOV,
  permissions: ['geolocation'],
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
    return false;
  }
}

const button = (name) => page.getByRole('button', { name, exact: true });
const field = (label) => page.getByLabel(label, { exact: true });
const path = () => new URL(page.url()).pathname;

async function waitPath(expected) {
  await page.waitForURL((url) => url.pathname === expected, { timeout: 25_000 });
}

async function openTab(name, expectedPath) {
  const tab = page.getByRole('tab', { name });
  if (await tab.count()) await tab.first().click();
  else await page.getByText(name, { exact: true }).first().click();
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
  return page.locator('div').filter({ hasText: title }).filter({ has: button(buttonName) }).last();
}

async function createTask(title, { biometrics = false, location = false } = {}) {
  await page.goto(`${BASE}/task/new`);
  await field('Ce vrei să faci?').fill(title);
  if (biometrics) await page.getByRole('switch', { name: 'Confirmare cu biometrie' }).click();
  if (location) {
    await page.getByRole('switch', { name: 'Confirmare în locație' }).click();
    // Pinul pornește automat de la locația curentă.
    await page.getByText(`${BRASOV.latitude.toFixed(5)}, ${BRASOV.longitude.toFixed(5)}`).waitFor();
  }
  await button('Adaugă activitatea').click();
  await page.waitForURL((url) => url.pathname !== '/task/new');
  await taskCard(title).waitFor();
}

async function login(email, password) {
  await page.goto(`${BASE}/login`);
  await field('Email').fill(email);
  await field('Parolă').fill(password);
  await button('Intră în cont').click();
  await page.getByText(/^Salut, /).first().waitFor();
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
  await page.getByText('Cont nou', { exact: true }).click();
  await waitPath('/register');
  await field('Nume complet').fill(me.fullName);
  await field('Username').fill(me.username);
  await field('Email').fill(me.email);
  await field('Parolă (minim 12 caractere)').fill(me.password);
  await button('Creează contul').click();
  await page.getByText('Salut, Ana!').waitFor();
  if (await page.getByRole('tab', { name: 'Admin' }).count()) throw new Error('Un utilizator normal vede tab-ul Admin');
});

if (ok) {
  await step('activitate simplă: creare și confirmare → streak 1', async () => {
    await createTask('Citesc 10 pagini');
    const before = dialogs.length;
    await taskCard('Citesc 10 pagini').getByRole('button', { name: 'Confirmă', exact: true }).click();
    await expectDialog(before, /Streak: 1 zi · 1 punct$/m);
    await page.getByText('Finalizată').first().waitFor();
  });

  await step('reîncărcarea paginii păstrează sesiunea și ruta', async () => {
    await page.goto(`${BASE}/tasks`);
    await page.reload();
    await page.getByText('Citesc 10 pagini').first().waitFor();
    if (path() !== '/tasks') throw new Error(`Am ajuns pe ${path()}`);
  });

  const passkey = await step('passkey activat din Profil', async () => {
    await openTab('Profil', '/profile');
    await page.getByText('Neactivată pe acest dispozitiv').waitFor();
    await button('Activează').click();
    await page.getByText('Activă pe acest dispozitiv').waitFor();
  });

  if (passkey) {
    await step('activitate cu biometrie: confirmată cu passkey', async () => {
      await createTask('Meditez 5 minute', { biometrics: true });
      const before = dialogs.length;
      await taskCard('Meditez 5 minute').getByRole('button', { name: 'Confirmă', exact: true }).click();
      await expectDialog(before, /Streak: 1 zi · 2 puncte/);
    });
  }

  await step('activitate cu locație: confirmată la fața locului', async () => {
    await createTask('Alerg în parc', { location: true });
    const before = dialogs.length;
    await taskCard('Alerg în parc').getByRole('button', { name: 'Confirmă', exact: true }).click();
    await expectDialog(before, /Streak: 1 zi · \d+ puncte/);
  });

  await step('activitate cu locație: refuzată de departe', async () => {
    await createTask('Înot la bazin', { location: true });
    await context.setGeolocation(BUCURESTI);
    const before = dialogs.length;
    await taskCard('Înot la bazin').getByRole('button', { name: 'Confirmă', exact: true }).click();
    await expectDialog(before, /Nu s-a putut confirma/);
    await taskCard('Înot la bazin').waitFor(); // încă are butonul „Confirmă”
    await context.setGeolocation(BRASOV);
  });

  await step('chat: mesajul apare în listă', async () => {
    await openTab('Social', '/social');
    const text = `Salut din testul UI ${run}`;
    await page.getByPlaceholder('Scrie un mesaj pentru comunitate…').fill(text);
    await button('Trimite').click();
    await page.getByText(text).first().waitFor();
  });

  await step('deconectare și rută protejată', async () => {
    await logout();
    await page.goto(`${BASE}/tasks`);
    await waitPath('/login');
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
    await page.getByText('🔥 1').first().waitFor();
    const text = await page.evaluate(() => document.body.innerText);
    const points = Number(text.match(/Puncte\s+(\d+)/)?.[1]);
    if (!(points >= 2)) throw new Error(`Puncte afișate: ${points}`);
  });

  const admin = process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD;
  if (admin) {
    await step('admin: vede contul nou în panou', async () => {
      await logout();
      await login(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
      await openTab('Admin', '/admin');
      await page.getByText(`@${me.username}`, { exact: false }).first().waitFor();
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
