# Gym Training API (Google Apps Script)

Backend for the IronLog app. The frontend (`../Lovable`) is hosted on GitHub Pages. The backend
is a single file, [`Code.gs`](Code.gs): the only file in an Apps Script project bound to a
Google Spreadsheet, whose tabs are the database. The frontend calls the Web App's `/exec` URL.
JSON response shapes match the frontend's `src/lib/types.ts`, so `src/lib/api.ts` can switch
from mock data to `fetch()` without changing the UI code.

```
Code.gs      the whole backend: paste it into the Apps Script editor
README.md    this file
tests/       Node test suite for Code.gs; stays in the repo, never uploaded to Apps Script
```

`Code.gs` is divided into sections: configuration (sheet schema), entry points and routing,
auth, student endpoints, trainer endpoints, setup, data layer, and mappers.

## Deploy

1. Create a Google Spreadsheet and open **Extensions → Apps Script**.
2. Replace the contents of `Code.gs` in the editor with [`Code.gs`](Code.gs) from this folder,
   then save. No other file is needed. Web App settings are chosen in the deploy dialog, and
   the `@OnlyCurrentDoc` line at the top limits the script's access to this one spreadsheet.
3. In the editor, choose `setupDatabase` from the function menu and click **Run**, then approve
   access. This creates the 6 tabs and their headers. Run it again any time; it only adds what
   is missing.
4. Optional: run `seedDemoData` to create a trainer (`coach` / `coach123`), a student
   (`aluno` / `aluno123`), two workouts and a weekly schedule.
5. **Deploy → New deployment → Web app**. Set **Execute as: Me** and **Who has access: Anyone**,
   then copy the `/exec` URL.
6. Check that it works by opening `<URL>?action=ping` in a browser.

After changing `Code.gs`, open **Deploy → Manage deployments → Edit** and choose
**Version: New version**. The `/exec` URL keeps serving the old version until you do this.
The URL itself does not change, so the frontend on GitHub Pages does not need a new build.

## Calling it from the frontend

Apps Script cannot answer CORS preflight (`OPTIONS`) requests. `doOptions` exists, but Google
does not route OPTIONS requests to it. Every POST must therefore be a simple request: send the
JSON body with `Content-Type: text/plain`, never `application/json`, and add no custom headers.
GET requests need nothing special. Google responds with a redirect that `fetch` follows on its
own.

```ts
const API_URL = import.meta.env.VITE_GAS_URL as string; // the /exec URL

export async function gas<T>(
  action: string,
  opts: { params?: Record<string, string>; body?: unknown } = {},
): Promise<T> {
  const url = new URL(API_URL);
  url.searchParams.set("action", action);
  for (const [k, v] of Object.entries(opts.params ?? {})) url.searchParams.set(k, v);

  const res = await fetch(
    url,
    opts.body === undefined
      ? undefined
      : {
          method: "POST",
          // text/plain keeps this a "simple" request, so the browser sends no preflight.
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(opts.body),
        },
  );
  const json = await res.json();
  if (json.status !== "success") throw new Error(json.message);
  return json.data as T;
}

// e.g. gas<{ user: User }>("login", { body: { Login, Senha } })
//      gas("getStudentData", { params: { userId } })
```

How each mock method in `src/lib/api.ts` maps to the API:

| `api.ts` today | Endpoint |
| --- | --- |
| `login` | `POST login`. The UI needs a Login/Senha form instead of the role picker |
| `getUser`, `getStudentWorkouts`, `getSchedule` | `GET getStudentData` → `user`, `workouts`, `schedule` |
| `getWorkout` | `GET getWorkout` → `workout` |
| `getStudents` | `GET getTrainerDashboard` → `students` |
| `getHistory` | `GET getStudentStats` → `history` |
| `saveWorkout` / `deleteWorkout` | `POST saveWorkoutPlan` / `POST deleteWorkoutPlan` |
| `saveSchedule` | `POST updateSchedule` |
| `saveWorkoutSession` | `POST saveWorkoutSession` |

## API reference

Every response is HTTP 200 with one of these bodies (Apps Script cannot set HTTP status codes):

```json
{ "status": "success", "data": { } }
{ "status": "error", "message": "Invalid credentials" }
```

For POST, `action` can be sent in the query string (`?action=login`) or in the JSON body.
POST bodies may also be wrapped in a key: `{ "workout": {...} }`, `{ "schedule": {...} }` or
`{ "session": {...} }`.

### `POST login`

```json
{ "action": "login", "Login": "aluno", "Senha": "aluno123" }
```

Login is case-insensitive. The keys `login` and `password` are also accepted. The response
never contains `Senha`:

```json
{ "user": { "id": "US-aluno", "name": "Aluno Demo", "role": "student", "trainerId": "US-coach", "initials": "AD" },
  "role": "student" }
```

### `GET getStudentData&userId={id}`

```json
{
  "user": { "id": "...", "name": "...", "role": "student", "trainerId": "...", "initials": "AD" },
  "workouts": [{
    "id": "TR-…", "name": "Push A", "studentId": "…", "focus": "Upper push",
    "exercises": [{ "id": "EX-…", "order": 1, "name": "Barbell Bench Press", "sets": 4, "reps": "8",
                    "weight": 80, "restSec": 120, "videoUrl": "…", "notes": "…", "rir": "RIR 2",
                    "substitute": "Dumbbell Bench Press" }]
  }],
  "schedule": { "studentId": "…", "days": [
    { "day": "Monday", "dayNumber": 1, "type": "workout", "workoutId": "TR-…", "workoutName": "Push A" },
    { "day": "Tuesday", "dayNumber": 2, "type": "cardio", "label": "30 min zone 2 bike" },
    { "day": "Sunday", "dayNumber": 7, "type": "rest" }
  ] }
}
```

`sets`, `weight` and `restSec` are always numbers. `reps` is always a string, so ranges like
`"8-12"` work. Empty optional fields are left out. `days` always covers all 7 days: a day with
no Agenda row comes back as `rest`.

### `GET getWorkout&workoutId={id}`

Returns `{ "workout": Workout }` in the same shape as in `getStudentData`, or
`{ "workout": null }` when no workout has that ID.

### `POST saveWorkoutSession`

This is the frontend's `SessionRecord`:

```json
{
  "action": "saveWorkoutSession",
  "studentId": "US-aluno", "workoutId": "TR-…", "date": "2026-09-22T10:00:00.000Z",
  "durationSec": 3480,
  "exercises": [
    { "exerciseName": "Back Squat", "sets": [{ "weight": 100, "reps": 5 }, { "weight": 100, "reps": 5 }] }
  ]
}
```

- The API writes one row to `Historico_Execucao` and all the sets to `Historico_Series`, each
  with a single `setValues` call.
- Each exercise is matched by `exerciseId` if one is sent. Otherwise it is matched by name,
  first within `workoutId` and then within the student's other workouts.
- `Volume_Total` is recalculated on the server as Σ weight × reps. Any `totalVolume` in the
  request is ignored when sets are present.
- `date` defaults to now. Sets with `"done": false` are skipped.

Returns `{ "session": SessionRecord }`, which includes the server-generated `id`.

### `GET getStudentStats&userId={id}`

Returns data ready to chart (for example with Recharts):

```json
{
  "summary": { "totalSessions": 12, "totalVolume": 84210, "totalDurationSec": 41000,
               "averageDurationSec": 3417, "averageVolume": 7017.5, "lastSessionDate": "…" },
  "volumeOverTime": [{ "date": "…", "sessionId": "HS-…", "workoutName": "Legs", "totalVolume": 7010, "durationSec": 3600 }],
  "exerciseProgress": [{
    "exerciseName": "Back Squat", "exerciseIds": ["EX-…"],
    "personalRecord": { "weight": 110, "date": "…" },
    "data": [{ "date": "…", "sessionId": "HS-…", "topWeight": 105, "volume": 1315,
               "totalReps": 13, "sets": 3, "estimated1RM": 116.7 }]
  }],
  "history": [ "SessionRecord, oldest first, the same shape ProgressCharts uses today" ]
}
```

Progress is grouped by exercise name, so the same lift in two different workouts forms one
series. `estimated1RM` uses the Epley formula.

### `GET getTrainerDashboard&trainerId={id}`

```json
{
  "trainer": { "id": "US-coach", "name": "…", "role": "trainer", "initials": "CM" },
  "students": [{
    "id": "US-aluno", "name": "…", "role": "student", "trainerId": "US-coach", "initials": "AD",
    "lastActivity": "Trained today", "totalSessions": 12, "daysSinceLastSession": 0,
    "lastSession": { "id": "HS-…", "date": "…", "workoutId": "TR-…", "workoutName": "Legs",
                     "durationSec": 3600, "totalVolume": 7010, "exerciseCount": 4, "setCount": 14 }
  }]
}
```

The list contains students whose `ID_Treinador` equals `trainerId`, plus students with an
empty `ID_Treinador`. `lastSession` is `null` for students who have never trained, and
`lastActivity` is left out for them.

### `POST saveWorkoutPlan`

This is the frontend's `Workout`:

```json
{
  "action": "saveWorkoutPlan",
  "workout": {
    "id": "TR-… (omit to create)", "studentId": "US-aluno", "name": "Push A", "focus": "Upper push",
    "exercises": [{ "id": "EX-… (optional)", "name": "Bench Press", "sets": 4, "reps": "8",
                    "weight": 80, "restSec": 120, "videoUrl": "", "notes": "", "rir": "", "substitute": "" }]
  }
}
```

- If `id` matches a row in `Treinos`, that row is updated. Any other `id` (for example the
  builder's `w-<timestamp>`) creates a new workout with a server-generated ID.
- The workout's old `Exercicios_Treino` rows are always deleted and the new list is inserted
  (cascade). `Ordem` follows the array order.
- An exercise keeps its ID when that ID already belongs to this workout, so logged history stays
  linked to it. New or temporary IDs are replaced with server IDs.

Returns `{ "workout": Workout, "created": true|false }`.

### `POST deleteWorkoutPlan`

```json
{ "action": "deleteWorkoutPlan", "workoutId": "TR-…" }
```

Deletes the workout, its exercises and any Agenda rows that point to it (those days become
rest). Workout history is kept. Returns
`{ "workoutId", "deletedExercises", "clearedScheduleEntries" }`.

### `POST updateSchedule`

This is the frontend's `Schedule`:

```json
{
  "action": "updateSchedule",
  "schedule": { "studentId": "US-aluno", "days": [
    { "day": "Monday", "type": "workout", "workoutId": "TR-…" },
    { "day": "Tuesday", "type": "cardio", "label": "30 min bike" },
    { "dayNumber": 7, "type": "rest" }
  ] }
}
```

- `day` accepts an English weekday name. `dayNumber` accepts 1–7, with Monday = 1 (ISO-8601).
- Only the days you send are replaced. The rest of the week is left as it is.
- A `workout` day must reference a workout that belongs to this student.

Returns `{ "schedule": { studentId, days } }`.

### `GET ping`

Health check: `{ "service": "gym-training-api", "version": "1.0.0", "time": "…" }`.

## Spreadsheet notes

**Columns.** The API requires the columns defined in the PRD, in any order, and reports an error
naming any that are missing. `setupDatabase()` also adds these optional columns at the end of
their tabs. They fill gaps between the PRD schema and the frontend. The API still works
without them.

| Tab | Optional column | Without it |
| --- | --- | --- |
| `Usuarios` | `ID_Treinador` | Every trainer sees every student |
| `Agenda` | `Descricao` | Cardio days have no `label` (e.g. "30 min bike") |
| `Historico_Execucao` | `ID_Treino` | The workout is inferred from the logged exercises |
| `Historico_Series` | `Nome_Exercicio` | History for an exercise deleted from its plan shows "Unknown exercise" |

**Data rules.**

- **Text columns.** The API formats every non-numeric column as plain text when it writes. This
  stops Sheets from turning `8-12` reps into a date or a `0123` password into `123`. If you type
  data by hand, run `setupDatabase()` first so those columns are already text.
- **Number parsing.** Numbers typed as text, including Brazilian formats like `82,5` or
  `1.234,5`, are converted to numbers when read.
- **IDs.** New IDs look like `TR-3f9a0c1d2b4e`. Rows you add by hand can use any unique value.
- **Concurrency.** All writes run under `LockService`, so two saves at the same moment cannot
  overwrite each other.

## Security

- The Web App is public, and requests are identified only by the `userId` or `trainerId` they
  send, as the PRD specifies (stateless, no tokens). Anyone who has the `/exec` URL and a user
  ID can read that user's data. Keep the URL out of public repositories. If that matters later,
  add a signed session token to `login`.
- Passwords are stored in plain text in `Usuarios.Senha`. Share the spreadsheet only with
  people allowed to see them.

## Tests

```sh
node --test tests/api.test.js   # from this folder; Node 18+, no dependencies
```

The suite loads `Code.gs` into a V8 context against an in-memory mock of `SpreadsheetApp`.
The mock reproduces Sheets' automatic type conversion and its range bounds. The tests cover
every endpoint, cascade deletes, casting, a spreadsheet with only the PRD columns, and a check
that the code never calls `appendRow` or `HtmlService`.
