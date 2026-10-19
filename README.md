# Whatever

Aplicația folosește două servicii Spring Boot și PostgreSQL:

- `user-service` pe `http://localhost:8081` pentru autentificare și chat;
- `task-service` pe `http://localhost:8082` pentru task-uri;
- frontend-ul Vite pe `http://localhost:5173`.

## Pornire locală

1. Copiază `.env.example` în `.env`.
2. Înlocuiește toate valorile `replace-with-*` cu secrete aleatorii. Nu comite `.env`.
3. Pornește stack-ul cu `docker compose up --build`.
4. Pornește frontend-ul cu `cd web-app; npm install; npm run dev`.

Parola admin este creată din `ADMIN_PASSWORD` la prima pornire și este stocată doar ca hash BCrypt. Nu există cont admin sau parolă implicită în cod ori în SQL.

## Securitate și sincronizare

Login-ul emite un JWT; fiecare cerere către task-service și chat trebuie să-l trimită ca `Authorization: Bearer ...`. Task-urile și mesajele sunt citite și scrise în PostgreSQL, iar frontend-ul reîncarcă starea serverului după fiecare modificare și la intervale scurte. API-urile nu mai acceptă date de identificare din body pentru proprietarul task-ului: proprietarul este extras din JWT.

Verificarea coordonatelor validează pe server formatul și distanța față de task. Coordonatele furnizate de browser nu sunt o dovadă anti-spoofing; pentru utilizare cu risc ridicat este necesară o integrare WebAuthn attestation/GPS hardware dedicată.

## Deploy Netlify + Render + Namecheap

Netlify găzduiește frontend-ul, iar Render rulează cele două servicii Docker. PostgreSQL poate fi găzduit gratuit într-un proiect Supabase; Render nu este baza de date a aplicației.

1. Creează o bază PostgreSQL public accesibilă într-un proiect Supabase și rulează [database/init.sql](./database/init.sql) o singură dată în SQL Editor.
2. Creează serviciile Render din [render.yaml](./render.yaml). Pentru ambele servicii setează `DB_URL`, `DB_USER`, `DB_PASSWORD` și aceeași valoare random pentru `JWT_SECRET`. La user-service setează și `ADMIN_EMAIL` și `ADMIN_PASSWORD`.
3. După deploy, copiază URL-urile Render în variabilele Netlify `VITE_USER_API` și `VITE_TASK_API`, cu sufixul `/api`. Nu le pune în `.env` comis în Git.
4. În Netlify setează base directory `web-app`, build command `npm run build` și publish directory `web-app/dist`; aceste valori sunt deja în [netlify.toml](./netlify.toml).
5. Adaugă în Netlify domeniul `whatever-app-unitbv.me`. În Namecheap, aplică exact înregistrările DNS afișate de Netlify pentru domeniul apex și `www`; nu inventa valori și elimină duplicatele A/CNAME care intră în conflict.
6. După propagarea DNS, setează în Render `CORS_ORIGIN=https://whatever-app-unitbv.me`, apoi redeploy ambele servicii.

`https://whatever-app-unitbv.me` este doar domeniul frontend-ului. URL-urile Render rămân API-urile backend; schimbarea lor în Netlify necesită un nou deploy frontend deoarece Vite le compilează la build.

### Variabile PostgreSQL pentru Render

În ambele servicii Render folosește o conexiune JDBC PostgreSQL:

```text
DB_URL=jdbc:postgresql://HOST:5432/postgres?sslmode=require
DB_USER=postgres
DB_PASSWORD=parola-Supabase
```

Supabase poate oferi și un host de connection pooler. Folosește hostul, portul, userul și baza afișate în pagina Connect a proiectului Supabase.
