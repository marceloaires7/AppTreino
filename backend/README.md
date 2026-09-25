# Gym Training API (Google Apps Script)

Backend for AppTreino. The frontend (`../Lovable`) is hosted on GitHub Pages. The backend
is a single file, [`Code.gs`](Code.gs): the only file in an Apps Script project bound to a
Google Spreadsheet, whose tabs are the database. The login and the way the app talks to the
backend come from the TreinoFácil app (`marceloaires7/TreinoFacil`): hashed passwords, signed
tokens, and a single `POST { acao, args, token }`.

The app and every message the API returns are in Brazilian Portuguese. Data keys stay in
English: weekdays (`Monday`…), activity types (`workout`, `cardio`, `rest`) and roles
(`Trainer`, `Student`). The frontend translates them for display in `Lovable/src/lib/format.ts`.

```
Code.gs      the whole backend: paste it into the Apps Script editor
README.md    this file
tests/       Node test suite for Code.gs; stays in the repo, never uploaded to Apps Script
```

`Code.gs` is divided into sections: configuration, entry points and routing, auth (passwords,
tokens, access rules), student endpoints, trainer endpoints, editor functions, data layer, and
mappers.

## Deploy

1. Create a Google Spreadsheet and open **Extensions → Apps Script**.
2. Replace the contents of `Code.gs` in the editor with [`Code.gs`](Code.gs), then save. No
   other file is needed. The `@OnlyCurrentDoc` line at the top limits the script to this
   spreadsheet.
3. Create the accounts, choosing one of these options:
   - **Real accounts:** edit the list at the start of `cadastrarUsuarios`, choose that function
     in the toolbar and click **Run**. The execution log confirms each account. Then **delete
     the passwords from the code**, because the spreadsheet only keeps their hash.
   - **Demo data:** run `seedDemoData`. It creates a trainer (`coach` / `coach123`), a student
     (`aluno` / `aluno123`), two workouts and a weekly schedule.

   The first run asks for authorization: choose your account, click **Advanced → Go to (unsafe)
   → Allow**. The "unverified app" warning is expected, because the app is your own script.
4. **Deploy → New deployment → Web app**. Set **Execute as: Me** and **Who has access:
   Anyone**, then copy the `/exec` URL into the GitHub repository variable `VITE_API_URL`.
5. Check that it works by opening `<URL>` or `<URL>?acao=ping` in a browser.

You never create the tabs by hand: they are created, with their headers, the first time they
are needed. `setupDatabase` also formats them, and can be run again at any time.

After changing `Code.gs`, open **Deploy → Manage deployments → Edit** and choose
**Version: New version**. The `/exec` URL keeps serving the old version until you do this.
The URL itself does not change.

### Upgrading a spreadsheet from the version without tokens

That version stored passwords in plain text in `Usuarios.Senha` and trusted the `userId` sent
by the app. To upgrade:

1. Paste the new `Code.gs` and publish a **new version**.
2. Push the new frontend right away, because the old app cannot talk to the new backend.
3. Optionally run `setupDatabase` to hash every plain-text password at once. Otherwise each
   password is hashed the first time its owner signs in. Either way the `Senha` cell is blanked;
   when it is empty for everyone, you can delete that column.

The new columns (`Salt`, `SenhaHash`, `CriadoEm`) are added on their own. Everyone has to sign in
again once, because sessions saved by the old app have no token.

### Upgrading to 2.1.0 (reps per set, muscle groups, substitute video)

Paste the new `Code.gs` and publish a **new version**. The columns `Grupo_Muscular` and
`Link_Video_Substituto` are added to `Exercicios_Treino` on their own, and existing `Reps` values
keep working: a single value such as `12` still means 12 on every set. Until the backend is
updated, the new app still opens workouts, but changing the rest or the description from the
workout screen fails with `Ação desconhecida`. **Do not save workouts in the builder before
updating:** the old backend would store the reps as `12,10,8` and drop the muscle groups and the
substitute video.

## Accounts

| Task | How |
| --- | --- |
| Create accounts | `cadastrarUsuarios` in the editor. `role` is `Trainer` or `Student`. For a student, `treinador` is the trainer's login. |
| Change your own password | The key icon in the app header. It asks for the current password. |
| Forgotten password | `redefinirSenha` in the editor: fill in the login and the new password, run it, then delete the password from the code. The account keeps its ID and all its data. |
| Locked login | Five wrong passwords lock that login for 15 minutes. `redefinirSenha` also unlocks it. |

The app has no sign-up screen on purpose. The API URL is public, so anyone who found it could
otherwise fill the spreadsheet with accounts.

Logins are 3–30 characters (lowercase letters, numbers, `.`, `-`, `_`) and are
case-insensitive. Passwords have at least 6 characters. New accounts get the ID `US-<login>`.

## How the app talks to the backend

There is one request shape, a POST to the `/exec` URL:

```json
{ "acao": "getStudentData", "args": ["US-aluno"], "token": "<token from login>" }
```

It is answered with one of:

```json
{ "ok": true, "dados": { } }
{ "ok": false, "erro": "Sua sessão expirou. Entre de novo", "codigo": "SESSAO_INVALIDA" }
```

- **Only `login` and `ping` work without a token.** Every other action receives the signed-in
  user, read from the token, as its first argument. What the client sends in `args` never
  decides who it is.
- **`codigo: "SESSAO_INVALIDA"`** means the token is missing, expired, forged, or belongs to a
  deleted account. The app then forgets the session and goes back to the login.
- **Content type.** The body is JSON sent as `Content-Type: text/plain`. With
  `application/json` the browser would send a CORS preflight (`OPTIONS`), which Apps Script
  does not answer. `doOptions` exists, but Google does not route OPTIONS requests to it.
- **GET only answers `ping`**, so tokens never end up in URLs or browser history.
- **HTTP status.** Every response is HTTP 200, because Apps Script cannot set status codes.

In the frontend, `Lovable/src/lib/api.ts` is the only code that talks to the backend. Its
`call(acao, args)` function adds the token, and `src/lib/session.ts` keeps
`{ token, expiresAt, user }` in `localStorage` under `gymapp.session`.

## Access rules

"Their students" means students whose `ID_Treinador` is the trainer, plus students with no
trainer yet, which is the same list the dashboard shows.

| Action | `args` | Student | Trainer |
| --- | --- | --- | --- |
| `login` | `[login, senha]` | public | public |
| `ping` | `[]` | public | public |
| `changePassword` | `[currentPassword, newPassword]` | own | own |
| `getStudentData` | `[studentId]` | self (may omit the ID) | their students |
| `getStudentStats` | `[studentId]` | self (may omit the ID) | their students |
| `getWorkout` | `[workoutId]` | own workouts | their students' workouts |
| `saveWorkoutSession` | `[session]` | always saved as self | — |
| `getTrainerDashboard` | `[]` | — | self |
| `saveWorkoutPlan` | `[workout]` | own workouts (edit mode) | their students |
| `updateWorkoutDescription` | `[workoutId, description]` | own workouts | their students |
| `updateExerciseRest` | `[exerciseId, restSec]` | own workouts | their students |
| `deleteWorkoutPlan` | `[workoutId]` | own workouts (edit mode) | their students |
| `updateSchedule` | `[schedule]` | own week (edit mode) | their students |

In edit mode (the pencil button in the app header) a student uses the same screens as a trainer,
always on their own workouts and week: a student can omit `studentId`, and cannot edit, delete
or schedule another student's workouts.

Anything else is refused with an error such as `Só o personal pode fazer isso` or
`Você não tem acesso a este aluno`.

## API reference

The objects match the frontend's `Lovable/src/lib/types.ts`.

### `login` → `{ token, expiresAt, user }`

```json
{ "token": "VVMtYWx1bm98MTc5Mj….2000275282cfe3…", "expiresAt": 1792871938324,
  "user": { "id": "US-aluno", "name": "Aluno Demo", "role": "student", "trainerId": "US-coach", "initials": "AD" } }
```

The token lasts 30 days. A wrong password and an unknown login get the same answer,
`Usuário ou senha incorretos`, and take the same time, so the response does not reveal which logins
exist. The response never contains the login, `Salt`, `SenhaHash` or `Senha`.

### `getStudentData` → `{ user, workouts, schedule }`

```json
{
  "user": { "id": "US-aluno", "name": "Aluno Demo", "role": "student", "trainerId": "US-coach", "initials": "AD" },
  "workouts": [{
    "id": "TR-…", "name": "Treino A - Peito e Ombros", "studentId": "US-aluno",
    "description": "Superiores (empurrar). Aqueça os ombros antes do supino.",
    "exercises": [{ "id": "EX-…", "order": 1, "name": "Supino reto com barra", "sets": 3,
                    "reps": ["12", "10", "Até a falha"], "weight": 80, "restSec": 120, "videoUrl": "…",
                    "notes": "…", "rir": "RIR 2", "muscleGroups": ["Peito", "Tríceps"],
                    "substitute": "Supino reto com halteres", "substituteVideoUrl": "…" }]
  }],
  "schedule": { "studentId": "US-aluno", "days": [
    { "day": "Monday", "dayNumber": 1, "type": "workout", "workoutId": "TR-…", "workoutName": "Treino A - Peito e Ombros" },
    { "day": "Tuesday", "dayNumber": 2, "type": "cardio", "label": "30 min de bike (zona 2)" },
    { "day": "Sunday", "dayNumber": 7, "type": "rest" }
  ] }
}
```

- `sets`, `weight` and `restSec` are always numbers.
- `reps` has one string per set, so `sets` is always `reps.length`. Each is a number, a range like
  `"8-12"`, any other text such as `"10+F"`, or `"Até a falha"` for a set taken to failure.
- `description` is the `Descricao` column of `Treinos`. Versions before 2.1.0 called it `focus`.
- Empty optional fields are left out, `muscleGroups` included.
- `days` covers all 7 days: a day with no Agenda row comes back as `rest`.

### `getWorkout` → `{ workout }`

The workout has the same shape as in `getStudentData`. It is `null` when no workout has that ID.

### `saveWorkoutSession` → `{ session }`

`session` is the frontend's `SessionRecord`:

```json
{ "workoutId": "TR-…", "date": "2026-09-22T10:00:00.000Z", "durationSec": 3480,
  "exercises": [{ "exerciseName": "Agachamento livre", "sets": [{ "weight": 100, "reps": 5 }] }] }
```

- The session is saved for the student in the token, whatever `studentId` the record contains.
- One row goes to `Historico_Execucao`, and all the sets go to `Historico_Series` in a single
  `setValues` call.
- Each exercise is matched by `exerciseId`, or else by name, first within `workoutId` and then
  within the student's other workouts. Only the student's own workouts and exercises are
  considered.
- `Volume_Total` is recalculated as Σ weight × reps.
- `date` defaults to now. Sets marked `"done": false` are skipped.

### `getStudentStats` → `{ summary, volumeOverTime, exerciseProgress, history }`

```json
{
  "summary": { "totalSessions": 12, "totalVolume": 84210, "totalDurationSec": 41000,
               "averageDurationSec": 3417, "averageVolume": 7017.5, "lastSessionDate": "…" },
  "volumeOverTime": [{ "date": "…", "sessionId": "HS-…", "workoutName": "Treino B - Pernas", "totalVolume": 7010, "durationSec": 3600 }],
  "exerciseProgress": [{
    "exerciseName": "Agachamento livre", "exerciseIds": ["EX-…"], "personalRecord": { "weight": 105, "date": "…" },
    "data": [{ "date": "…", "sessionId": "HS-…", "topWeight": 105, "volume": 1315,
               "totalReps": 13, "sets": 3, "estimated1RM": 116.7 }]
  }],
  "history": [ "SessionRecord, oldest first" ]
}
```

- Progress is grouped by exercise name, so the same lift in two workouts forms one series.
- `estimated1RM` uses the Epley formula.

### `getTrainerDashboard` → `{ trainer, students }`

```json
{
  "trainer": { "id": "US-coach", "name": "Alex Moreira", "role": "trainer", "initials": "AM" },
  "students": [{
    "id": "US-aluno", "name": "…", "role": "student", "trainerId": "US-coach", "initials": "AD",
    "lastActivity": "Treinou hoje", "totalSessions": 12, "daysSinceLastSession": 0,
    "lastSession": { "id": "HS-…", "date": "…", "workoutId": "TR-…", "workoutName": "Treino B - Pernas",
                     "durationSec": 3600, "totalVolume": 7010, "exerciseCount": 4, "setCount": 14 }
  }]
}
```

For a student who has never trained, `lastSession` is `null` and `lastActivity` is left out.

### `saveWorkoutPlan` → `{ workout, created }`

`workout` is the frontend's `Workout`, with `studentId`, `name`, an optional `description`, and
`exercises`.

- `reps` is a list with one target per set. A single string, as older apps send it, applies to
  every set. `sets` decides how many there are: missing targets repeat the last one.

- An `id` that matches a row in `Treinos` updates that workout. Any other `id` (such as the
  builder's temporary `w-<timestamp>`) creates a new one.
- The workout's old exercises are deleted and the new list is inserted (cascade).
- Exercises that already belonged to the workout keep their IDs, so logged history stays linked
  to them.

### `updateWorkoutDescription` → `{ workout }`

Changes only `Treinos.Descricao`, so the workout screen can edit it without sending the whole
plan. An empty description clears it.

### `updateExerciseRest` → `{ exercise }`

Changes only `Exercicios_Treino.Descanso_seg`, so a student can adjust the rest in the middle of a
workout. Negative values become 0.

### `deleteWorkoutPlan` → `{ workoutId, deletedExercises, clearedScheduleEntries }`

Deletes the workout, its exercises, and the Agenda rows that point to it, so those days become
rest. History is kept.

### `updateSchedule` → `{ schedule }`

`schedule` is `{ studentId, days: [{ day | dayNumber, type, workoutId?, label? }] }`.

- `day` is an English weekday name; `dayNumber` is 1–7, with Monday = 1.
- `type` is `workout`, `cardio` or `rest`.
- Only the days sent are replaced.
- A `workout` day must use one of that student's workouts.

### `changePassword` → `{ changed: true }`

Needs the current password. The new one must have at least 6 characters.

## Spreadsheet

| Tab | Columns |
| --- | --- |
| `Usuarios` | `ID_Usuario`, `Nome`, `Login`, `Role`, `ID_Treinador`, `Salt`, `SenhaHash`, `CriadoEm` |
| `Treinos` | `ID_Treino`, `ID_Usuario`, `Nome_do_Treino`, `Descricao` |
| `Exercicios_Treino` | `ID_Exercicio`, `ID_Treino`, `Ordem`, `Nome`, `Series`, `Reps`, `Carga_kg`, `Descanso_seg`, `Link_Video`, `Anotacoes`, `RIR_RPE`, `Exercicio_Substituto`, `Grupo_Muscular`, `Link_Video_Substituto` |
| `Agenda` | `ID_Agenda`, `ID_Usuario`, `Dia_Semana`, `Tipo_Atividade`, `ID_Treino`, `Descricao` |
| `Historico_Execucao` | `ID_Historico`, `ID_Usuario`, `Data`, `Tempo_Duracao_seg`, `Volume_Total`, `ID_Treino` |
| `Historico_Series` | `ID_Historico`, `ID_Exercicio`, `Serie_Num`, `Reps_Feitas`, `Carga_Usada`, `Nome_Exercicio` |

- **Missing tabs and columns.** They are added on first use, at the end of the header row.
  Existing columns can be in any order, and extra columns are left alone.
- **Text columns.** Every non-numeric column is written as plain text, so Sheets does not turn
  `8-12` reps into a date. If you type data by hand, run `setupDatabase` first so those columns
  are already text.
- **Numbers typed as text** are converted when read, including Brazilian formats such as `82,5`
  and `1.234,5`.
- **Reps per set.** `Reps` holds one value for every set (`12`, `8-12`) or one per set separated by
  `;` (`12; 10; Até a falha`). `Series` says how many sets there are; when the list is shorter, the
  last value repeats. `falha`, `F` and `até a falha`, in any case, all mean a set to failure. The
  app writes a single value when every set is the same.
- **Muscle groups.** `Grupo_Muscular` lists them separated by commas (`Peito, Tríceps`). When it is
  empty, the app guesses them from the exercise name and shows the guess; saving the workout in
  the app stores it.
- **Concurrency.** All writes run under `LockService`, so two saves at the same moment cannot
  overwrite each other.

## Security

**What is protected:**

- **Passwords are never stored.** `SenhaHash` is `HMAC(pepper, salt|senha)` repeated 300 times,
  with a random salt per account. The pepper lives in the script properties (`PEPPER_SENHA`),
  not in the spreadsheet, so someone with a copy of the spreadsheet cannot test passwords.
- **Tokens.** A token is `payload.signature`: the payload holds the user ID and the expiry, and
  the signature is an HMAC with a second script-property secret (`SEGREDO_TOKEN`). Editing the
  payload breaks the signature.
- **Identity.** Every action takes the user from the token, and the access rules above limit
  what each role can reach.
- **Brute force.** Five wrong passwords lock a login for 15 minutes.
- **Timing.** Hash and signature comparisons do not stop at the first different character.

**What is not protected:**

- **Signing out does not revoke the token.** Changing a password does not revoke it either.
  Tokens expire after 30 days. To sign everyone out immediately, delete `SEGREDO_TOKEN` in
  **Project Settings → Script properties**. A new secret is created on the next login.
- **Do not delete `PEPPER_SENHA`.** Deleting it makes every password stop working, and they
  would all have to be reset with `redefinirSenha`.
- **Public URL.** The `/exec` URL is public. Without a token it only answers `login` and `ping`.

## Tests

```sh
node --test tests/api.test.js   # from this folder; Node 18+, no dependencies
```

The suite loads `Code.gs` into a V8 context against an in-memory mock of the Apps Script
services. The mock reproduces Sheets' type conversion and range bounds, HMAC with signed bytes,
script properties, and a cache with expiry. It covers:

- hashing, the lockout, and forged or expired tokens;
- the upgrade from plain-text passwords;
- every access rule and every endpoint;
- automatic creation of tabs and columns;
- the protocol, including that `appendRow` and `HtmlService` are never used.
