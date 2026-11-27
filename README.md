# Whatever

Task manager gamificat: activități cu scadență, verificare în locație (GPS) și cu biometrie,
streak zilnic, freeze-uri lunare, prieteni, clasament, chat global și panou de administrare.

| Componentă | Tehnologie | Găzduire |
|---|---|---|
| `backend/user-service` | Spring Boot 3.5, Java 21 — conturi, sesiuni, email, passkey, biometrie, social, admin | Render (Docker) |
| `backend/task-service` | Spring Boot 3.5, Java 21 — activități, streak, freeze, verificări | Render (Docker) |
| `database/migrations` | PostgreSQL (SQL simplu, rulat în ordine) | Supabase |
| `web-app` | React 18 + Vite — site-ul actual | Netlify (`whatever-app-unitbv.me`) |

## Reguli de business

- **Streak** = zile consecutive (ora României) cu cel puțin o activitate finalizată. Dacă ultima zi activă e mai veche decât ieri, streak-ul afișat devine 0.
- **Puncte** = câte activități ai finalizat (vechiul „streak” al aplicației a fost convertit în puncte).
- **Freeze**: 3 pe lună. Se folosește pe o activitate restantă: o mută pe azi și acoperă o zi ratată din streak.
- **Recurent** = zilnic: după finalizare, activitatea rămâne activă cu scadența mâine. Se poate finaliza o dată pe zi.
- O activitate ne-recurentă se finalizează o singură dată (garantat și în baza de date, `task_completions`).
- **Locație**: serverul verifică distanța față de pin (cu toleranța preciziei GPS, max. 50 m). În aplicația nativă, locațiile simulate sunt respinse.
- **Biometrie**: serverul acceptă doar un token biometric semnat, emis după
  - un passkey WebAuthn valid (web), sau
  - o semnătură Ed25519 făcută de telefon cu o cheie păstrată în Keychain/Keystore și deblocată cu amprentă/Face ID (aplicația nativă).
  Un câmp boolean trimis de client nu mai este acceptat.
- Partajarea unei activități se face doar cu prietenii. Emailurile altor utilizatori nu sunt expuse niciodată (prieteni, clasament, activități partajate).

## Pornire locală

1. Copiază `.env.example` în `.env` și înlocuiește valorile `replace-with-*`. Nu comite `.env`.
2. `docker compose up --build` — pornește Postgres (rulează toate fișierele din `database/migrations`), user-service pe `:8081` și task-service pe `:8082`.
   Local, `MAIL_PROVIDER=log` scrie emailurile (inclusiv codul de resetare) în logul user-service.
3. Frontend: `cd web-app && npm install && npm run dev` → `http://localhost:5173`.

## Variabile de mediu (Render)

Ambele servicii: `DB_URL`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET` (același, minim 32 caractere), `CORS_ORIGIN`, `APP_TIMEZONE=Europe/Bucharest`.

User-service în plus:

| Variabilă | Rol |
|---|---|
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Contul de admin, creat la prima pornire. Parola **nu** mai este rescrisă la fiecare pornire. Pune `ADMIN_RESET_PASSWORD=true` o singură dată ca s-o resetezi din variabilă. |
| `MAIL_PROVIDER` | `brevo` sau `resend` în producție. Render free blochează porturile SMTP (25/465/587), deci Gmail SMTP nu funcționează acolo. |
| `MAIL_API_KEY`, `MAIL_FROM` | Cheia API și adresa expeditorului (verificată la provider). |
| `PUBLIC_URL` | Adresa site-ului; apare în linkul de resetare (`/reset?code=...`). |
| `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN` | Domeniul pentru passkey-uri (`whatever-app-unitbv.me`). |
| `JWT_EXPIRATION_MS`, `JWT_REFRESH_DAYS` | Durata token-ului de acces (implicit 1 h) și a sesiunii (implicit 30 de zile). |

### Email cu Brevo (gratuit, 300 emailuri/zi)

1. Cont pe brevo.com → **Senders, domains & dedicated IPs** → adaugă și verifică adresa expeditorului (ideal un domeniu propriu, de exemplu `no-reply@whatever-app-unitbv.me`).
2. **SMTP & API → API Keys** → generează o cheie.
3. În Render, la user-service: `MAIL_PROVIDER=brevo`, `MAIL_API_KEY=<cheia>`, `MAIL_FROM=<adresa verificată>`.

Până la configurarea emailului, administratorul poate reseta parolele din panoul Admin.

## Bază de date

Migrațiile sunt în `database/migrations` și se rulează în ordine (local le rulează Docker automat).
Pe Supabase se aplică din SQL Editor sau prin MCP. Migrarea `002` este compatibilă cu versiunea veche a backend-ului,
deci se aplică înaintea deploy-ului. Aplicația nu folosește Data API-ul Supabase, așa că rolurile `anon`/`authenticated`
nu au drepturi pe tabele (RLS rămâne activ ca a doua barieră).

Pentru Supabase Session Pooler fiecare serviciu folosește maximum 3 conexiuni (`DB_POOL_MAX_SIZE`).
Proiectele Supabase gratuite se pun pe pauză după 7 zile de inactivitate — verifică proiectul înainte de o prezentare.

## Deploy

- **Render**: ambele servicii se redeployează automat la push pe `main`. Imaginile Docker folosesc CDS (Class Data Sharing)
  și un utilizator non-root; pe 0,1 CPU / 512 MB pornirea scade de la ~80 s la ~25 s. Serviciile gratuite adorm după 15 minute fără trafic.
  Serviciile sunt în Oregon; pentru latență mai mică cu Supabase (Irlanda) recreează-le în Frankfurt (regiunea nu se poate schimba ulterior).
- **Netlify**: base directory `web-app`, build `npm run build`, publish `dist` (în `netlify.toml`). `VITE_USER_API` și `VITE_TASK_API`
  se setează în Netlify și se compilează la build.

## CI

`.github/workflows/ci.yml` rulează la fiecare push:
- **Backend**: `mvn verify` pentru ambele servicii, migrațiile pe un Postgres real și `e2e/api-smoke.mjs` — teste end-to-end
  pentru sesiuni, finalizări, streak, biometrie, locație, prieteni, freeze, admin, resetare parolă, CORS și rate limiting.
- **Docker**: construiește imaginile ca pe Render și măsoară pornirea cu limitele planului gratuit.
- **Web**: build-ul Vite.
