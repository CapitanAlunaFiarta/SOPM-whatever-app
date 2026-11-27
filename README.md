# Whatever

Task manager gamificat: activități cu scadență, verificare în locație (GPS) și cu biometrie,
streak zilnic, freeze-uri lunare, prieteni, activități de grup cu chat propriu, favoruri confirmate cu poză,
recap lunar pe categorii, sesiuni de focus (Android), clasament, chat global și panou de administrare.
Aplicația e în română, engleză și spaniolă.

| Componentă | Tehnologie | Găzduire |
|---|---|---|
| `backend/user-service` | Spring Boot 3.5, Java 21 — conturi, sesiuni, email, passkey, biometrie, social, admin | Render (Docker) |
| `backend/task-service` | Spring Boot 3.5, Java 21 — activități, streak, freeze, verificări | Render (Docker) |
| `database/migrations` | PostgreSQL (SQL simplu, rulat în ordine) | Supabase |
| `client` | Expo SDK 58: React Native + React Native Web, Expo Router — **un singur cod** pentru Android, iOS și web | Netlify (web, `whatever-app-unitbv.me`), GitHub Releases (APK Android), EAS Build (opțional, Android/iOS) |

## Reguli de business

- **Streak** = zile consecutive (ora României) cu cel puțin o activitate finalizată. Dacă ultima zi activă e mai veche decât ieri, streak-ul afișat devine 0.
- **Puncte** = câte activități ai finalizat (vechiul „streak” al aplicației a fost convertit în puncte).
- **Freeze**: 3 pe lună. Se folosește pe o activitate restantă: o mută pe azi și acoperă o zi ratată din streak.
- **Recurent** = zilnic: după finalizare, activitatea rămâne activă cu scadența mâine. Se poate finaliza o dată pe zi.
- O activitate ne-recurentă se finalizează o singură dată (garantat și în baza de date, `task_completions`).
- **Locație**: serverul verifică distanța față de pin (cu toleranța preciziei GPS, max. 50 m). În aplicația de telefon, locațiile simulate (mock) sunt respinse.
- **Biometrie**: serverul acceptă doar un token biometric semnat, emis după
  - un passkey WebAuthn valid (web), sau
  - o semnătură Ed25519 făcută de telefon cu o cheie păstrată în Keychain/Keystore și deblocată cu amprentă/Face ID (aplicația nativă).
  Un câmp boolean trimis de client nu mai este acceptat.
- **Activități cu prieteni**: poți invita până la 10 prieteni la o activitate.
  - Fiecare invitat acceptă sau refuză. Cine acceptă devine membru, își confirmă singur partea (cu aceleași verificări de locație și biometrie) și primește streak și puncte.
  - O activitate unică se încheie când au confirmat toți membrii și nu mai așteaptă nicio invitație; una zilnică trece pe mâine când au confirmat toți în ziua respectivă.
  - Chatul activității (separat de cel general) se deschide la prima acceptare și devine doar de citit la 5 zile după încheiere sau anulare.
- **Favoruri** („pasă ca la tenis”): îi poți cere unui prieten un favor (ce, până când, unde se face poza).
  - Primul favor dintre voi poate fi refuzat liber. După ce un favor e făcut, cel care l-a primit îi datorează unul celuilalt.
  - Cât timp datorezi, nu poți cere. Când ți se cere și datorezi, poți refuza doar ca „nerezonabil”: datoria rămâne, iar prietenul poate cere altceva.
  - Între doi prieteni poate exista un singur favor în desfășurare. Cele neterminate până la scadență se anulează singure.
  - Confirmarea se face doar cu camera din aplicație (fără galerie). Serverul verifică momentul pozei, locul (raza) și că e JPEG, iar cel care a cerut aprobă sau respinge poza.
  - La aprobare, cel care a făcut favorul primește streak, un punct și intrare în recap.
- Emailurile altor utilizatori nu sunt expuse niciodată (prieteni, clasament, activități de grup, chat, favoruri).
- **Categorii**: `SPORT` (activitate fizică), `STUDY` (facultate/studiu), `CHORES` (treburi, comisioane — implicită), `ENTERTAINMENT`.
  Serverul păstrează cheile, aplicația afișează numele traduse. Valorile vechi sunt acceptate și mapate
  (Sport/Sănătate → SPORT, Facultate/Proiect Echipă → STUDY, restul → CHORES; migrarea `003`).
- **Recap lunar** (`GET /api/tasks/recap?month=YYYY-MM`): câte activități ai finalizat în fiecare categorie. Categoria se
  salvează la finalizare, deci recap-ul rămâne corect și după ștergerea activității.
- **Cercul de progres** (Acasă): activitățile confirmate azi, din tot ce era de făcut azi (cele confirmate plus cele încă
  deschise cu scadența azi sau mai devreme, inclusiv cele zilnice). Activitățile pentru zilele următoare nu intră în calcul.
- **Focus** (doar în aplicația de Android, ca în Forest): pentru o activitate alegi durata (15, 25, 45 sau 60 de minute)
  și aplicațiile care te distrag.
  - Aplicațiile nu sunt blocate: dacă deschizi una dintre ele în timpul sesiunii, sesiunea pică (afișează ce aplicație și după câte minute).
  - Whatever citește istoricul de utilizare al telefonului (permisiunea „Acces la datele de utilizare”, dată o singură dată
    din Setări), deci verificarea merge și dacă aplicația a fost închisă între timp. Datele nu pleacă de pe telefon.
  - La final, o activitate fără locație sau biometrie se confirmă singură; celelalte se confirmă cu un buton, cu verificările obișnuite.
  - Pe iOS ar fi nevoie de API-ul Screen Time (Family Controls), pentru care Apple cere o aprobare specială, iar un browser nu
    poate vedea alte aplicații. De aceea butonul Focus apare doar în APK-ul de Android (nici în Expo Go).
- **Limbi**: română, engleză, spaniolă. Aplicația pornește în limba telefonului/browserului (altfel engleză) și ține minte
  alegerea din Profil sau de pe ecranele de autentificare. Trimite `Accept-Language`, iar serverele traduc mesajele de eroare
  (`i18n/messages.tsv` din fiecare serviciu) și emailul de resetare a parolei.

## Pornire locală

1. Copiază `.env.example` în `.env` și înlocuiește valorile `replace-with-*`. Nu comite `.env`.
2. `docker compose up --build` — pornește Postgres (rulează toate fișierele din `database/migrations`), user-service pe `:8081` și task-service pe `:8082`.
   Local, `MAIL_PROVIDER=log` scrie emailurile (inclusiv codul de resetare) în logul user-service.
3. Aplicația: `cd client && npm install && npm start` (serverul Expo pornește pe portul 5173, ca să nu se bată cu user-service pe 8081).
   - `w` deschide versiunea web pe `http://localhost:5173`;
   - pe telefon, scanează codul QR cu **Expo Go** (Android/iOS).

   Implicit aplicația vorbește cu serverele de pe Render. Pentru backend-ul local creează `client/.env.local`:
   ```
   EXPO_PUBLIC_USER_API=http://<IP-ul calculatorului în rețea>:8081/api
   EXPO_PUBLIC_TASK_API=http://<IP-ul calculatorului în rețea>:8082/api
   ```
   (pe telefon, `localhost` înseamnă telefonul, nu calculatorul).

Verificări pentru `client`: `npm run typecheck`, `npm run lint`, `npm test`.

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
- **Netlify** (site-ul web): base directory `client`, build `npx expo export -p web`, publish `dist` (în `netlify.toml`).
  Fiecare pull request primește un deploy preview. Adresele API sunt implicit cele de pe Render; se pot schimba cu
  `EXPO_PUBLIC_USER_API` și `EXPO_PUBLIC_TASK_API` (variabile de mediu în Netlify). Variabilele vechi `VITE_*` nu mai sunt folosite.
- **Android (APK, automat)**: workflow-ul `.github/workflows/android.yml` construiește aplicația din `client/`
  (`expo prebuild` + Gradle) la fiecare push pe `main` care atinge `client/` și o publică în GitHub Releases.
  Ultima versiune se descarcă mereu de la
  `https://github.com/CapitanAlunaFiarta/SOPM-whatever-app/releases/latest/download/whatever.apk`
  (pe telefon: deschide linkul, apoi permite instalarea din browser). APK-ul e semnat cu cheia de debug din șablonul
  Expo — potrivit pentru instalare directă, nu pentru Google Play.
  - **Hărțile nu au nevoie de chei API**: pe Android harta este Leaflet + OpenStreetMap într-un WebView
    (`src/components/leaflet/`), pe iOS Apple Maps (`*.ios.tsx`), iar pe web Leaflet (`*.web.tsx`).
    `react-native-maps` e exclus din build-ul Android (`client/react-native.config.js`).
  - **Focus** folosește un modul nativ local, `client/modules/focus-guard` (Kotlin, Expo Modules API), inclus automat
    în APK: verifică permisiunea `PACKAGE_USAGE_STATS`, deschide setarea ei, listează aplicațiile din launcher și citește
    din `UsageStatsManager` ce aplicații au venit în prim-plan. Pe iOS și web modulul lipsește, iar aplicația ascunde funcția.
  - **Camera** (poza pentru favoruri) cere permisiunea `CAMERA`, fără microfon și fără scanner de coduri (pluginul `expo-camera` din `app.json`).
- **EAS Build** (opțional, în cloud; necesar pentru iOS și Google Play):
  1. Cont gratuit pe expo.dev, apoi în `client/`: `npx eas-cli@latest login` și `npx eas-cli@latest init`.
     Pune ID-ul proiectului afișat în `app.json` la `expo.extra.eas.projectId`.
  2. APK: `npm run build:android` (profilul `preview`). APK-ul de pe EAS are altă semnătură decât cel din
     GitHub Releases: pentru a trece de la unul la altul, dezinstalează întâi aplicația.
  3. **iOS** cere un cont Apple Developer (99 USD/an): `npx eas-cli@latest build -p ios --profile production`, apoi
     `npx eas-cli@latest submit -p ios` pentru TestFlight. Pe iOS harta este Apple Maps (fără cheie).
  4. Google Play: `npx eas-cli@latest build -p android --profile production` (fișier AAB) și `eas submit`.

## CI

`.github/workflows/ci.yml` rulează la fiecare push:
- **Backend**: `mvn verify` pentru ambele servicii, migrațiile pe un Postgres real și `e2e/api-smoke.mjs` — teste end-to-end
  pentru sesiuni, finalizări, streak, biometrie, locație, prieteni, freeze, admin, resetare parolă, CORS și rate limiting,
  plus traducerea erorilor, categorii și recap, activități de grup cu chat și favoruri (datorii, refuz „nerezonabil”, poză, aprobare).
- **Docker**: construiește imaginile ca pe Render și măsoară pornirea cu limitele planului gratuit.
- **Teste UI** (`e2e/ui/ui-smoke.mjs`): aplicația web, construită pentru backend-ul pornit în CI, rulează într-un Chrome
  headless cu un passkey virtual: cont nou, activități simple / cu passkey / cu locație (inclusiv refuz de departe),
  streak și puncte, cercul de progres, recap-ul lunar, o activitate cu un prieten și chatul ei, un favor confirmat cu poza
  făcută de camera falsă a lui Chrome (pornită cu întârziere, ca pe un telefon lent), chat, deconectare, rute protejate,
  schimbarea limbii, resetare parolă cu codul din email, panoul de admin.
- **Aplicația Expo**: TypeScript, ESLint, teste jest (inclusiv compatibilitatea semnăturii Ed25519 a telefonului cu
  verificarea din user-service), build-ul web pentru Netlify și bundle-urile JavaScript pentru Android și iOS.
- **Android APK** (`android.yml`): build-ul nativ complet (inclusiv modulul Kotlin pentru focus), la fiecare schimbare
  în `client/`. Dacă Maven Central sau Google Maven răspund cu 429/5xx, build-ul se reîncearcă o dată după 90 s.
