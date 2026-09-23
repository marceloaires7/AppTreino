/** @OnlyCurrentDoc */

/**
 * Gym Training API: Google Apps Script backend for the IronLog app (frontend on GitHub Pages).
 *
 * This is the only file in the Apps Script project. Paste it into Code.gs of the script bound
 * to the spreadsheet (Extensions > Apps Script), then:
 *   1. Run setupDatabase() once from the editor to create the tabs and headers. Optionally run
 *      seedDemoData() for a demo trainer (coach / coach123) and student (aluno / aluno123).
 *   2. Deploy > New deployment > Web app, Execute as: Me, Who has access: Anyone.
 *   3. Put the /exec URL in the frontend. After editing this file, publish a new version in
 *      Deploy > Manage deployments, or the URL keeps serving the old code.
 *
 * Routing uses an `action` parameter: query string for GET, query string or JSON body for POST.
 * Every response is JSON: { status: "success", data } or { status: "error", message }.
 * The full API reference is in backend/README.md in the app repository.
 */

// ===============================================================================================
// CONFIGURATION: sheet schema and constants
// ===============================================================================================

const API_VERSION = '1.0.0';

const SHEET = {
  USERS: 'Usuarios',
  WORKOUTS: 'Treinos',
  EXERCISES: 'Exercicios_Treino',
  SCHEDULE: 'Agenda',
  SESSIONS: 'Historico_Execucao',
  SETS: 'Historico_Series',
};

/**
 * `columns` must exist in row 1 of the tab. `optional` columns are used when present
 * (setupDatabase() creates them) and ignored otherwise. Columns not listed in `numeric` are
 * written as plain text, so values like "8-12" reps or a "0123" password are not turned into
 * dates or numbers by Sheets.
 */
const SCHEMA = {
  [SHEET.USERS]: {
    columns: ['ID_Usuario', 'Nome', 'Login', 'Senha', 'Role'],
    optional: ['ID_Treinador'],
    numeric: [],
  },
  [SHEET.WORKOUTS]: {
    columns: ['ID_Treino', 'ID_Usuario', 'Nome_do_Treino', 'Descricao'],
    optional: [],
    numeric: [],
  },
  [SHEET.EXERCISES]: {
    columns: [
      'ID_Exercicio', 'ID_Treino', 'Ordem', 'Nome', 'Series', 'Reps', 'Carga_kg', 'Descanso_seg',
      'Link_Video', 'Anotacoes', 'RIR_RPE', 'Exercicio_Substituto',
    ],
    optional: [],
    numeric: ['Ordem', 'Series', 'Carga_kg', 'Descanso_seg'],
  },
  [SHEET.SCHEDULE]: {
    columns: ['ID_Agenda', 'ID_Usuario', 'Dia_Semana', 'Tipo_Atividade', 'ID_Treino'],
    optional: ['Descricao'],
    numeric: ['Dia_Semana'],
  },
  [SHEET.SESSIONS]: {
    columns: ['ID_Historico', 'ID_Usuario', 'Data', 'Tempo_Duracao_seg', 'Volume_Total'],
    optional: ['ID_Treino'],
    numeric: ['Tempo_Duracao_seg', 'Volume_Total'],
  },
  [SHEET.SETS]: {
    columns: ['ID_Historico', 'ID_Exercicio', 'Serie_Num', 'Reps_Feitas', 'Carga_Usada'],
    optional: ['Nome_Exercicio'],
    numeric: ['Serie_Num', 'Reps_Feitas', 'Carga_Usada'],
  },
};

// Dia_Semana follows ISO-8601: 1 = Monday ... 7 = Sunday.
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// API value -> value stored in Agenda.Tipo_Atividade.
const ACTIVITY_TO_SHEET = { workout: 'Workout', cardio: 'Cardio', rest: 'Rest' };

// ===============================================================================================
// ENTRY POINTS AND ROUTING
// ===============================================================================================

/** An error whose message is safe to return to the client. */
class ApiError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ApiError';
  }
}

const GET_ROUTES = {
  ping: () => ({ service: 'gym-training-api', version: API_VERSION, time: new Date().toISOString() }),
  getStudentData: (params) => getStudentData_(params.userId),
  getWorkout: (params) => getWorkout_(params.workoutId),
  getStudentStats: (params) => getStudentStats_(params.userId),
  getTrainerDashboard: (params) => getTrainerDashboard_(params.trainerId),
};

// `write: true` routes run under a script lock so concurrent saves cannot interleave.
const POST_ROUTES = {
  login: { write: false, run: login_ },
  saveWorkoutSession: { write: true, run: saveWorkoutSession_ },
  saveWorkoutPlan: { write: true, run: saveWorkoutPlan_ },
  deleteWorkoutPlan: { write: true, run: deleteWorkoutPlan_ },
  updateSchedule: { write: true, run: updateSchedule_ },
};

function doGet(e) {
  return handleRequest_('GET', e);
}

function doPost(e) {
  return handleRequest_('POST', e);
}

/**
 * Apps Script does not currently route OPTIONS requests to scripts, so browsers must avoid
 * preflights (send POST bodies as text/plain). Kept so a preflight gets an empty success if
 * the platform ever starts forwarding them.
 */
function doOptions() {
  return jsonResponse_({ status: 'success', data: {} });
}

function handleRequest_(method, e) {
  resetTableCache_();
  try {
    const params = (e && e.parameter) || {};
    const body = method === 'POST' ? parseBody_(e) : {};
    const action = str_(params.action || body.action);
    let data;
    if (method === 'GET') {
      if (!hasOwn_(GET_ROUTES, action)) throw new ApiError(unknownActionMessage_(method, action));
      data = GET_ROUTES[action](params);
    } else {
      const route = hasOwn_(POST_ROUTES, action) ? POST_ROUTES[action] : null;
      if (!route) throw new ApiError(unknownActionMessage_(method, action));
      data = route.write ? withLock_(() => route.run(body)) : route.run(body);
    }
    return jsonResponse_({ status: 'success', data: data });
  } catch (err) {
    if (err instanceof ApiError) return jsonResponse_({ status: 'error', message: err.message });
    console.error(err && err.stack ? err.stack : err);
    return jsonResponse_({ status: 'error', message: 'Internal error: ' + (err && err.message ? err.message : err) });
  }
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    throw new ApiError('Request body must be valid JSON');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError('Request body must be a JSON object');
  }
  return body;
}

function unknownActionMessage_(method, action) {
  if (!action) return 'Missing "action" parameter';
  const other = method === 'GET' ? POST_ROUTES : GET_ROUTES;
  if (hasOwn_(other, action)) return `Action "${action}" must be called with ${method === 'GET' ? 'POST' : 'GET'}`;
  const available = Object.keys(method === 'GET' ? GET_ROUTES : POST_ROUTES).join(', ');
  return `Unknown ${method} action "${action}". Available: ${available}`;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new ApiError('Server is busy, please try again');
  try {
    const result = fn();
    // Commit pending writes before the next request waiting on the lock reads the sheets.
    SpreadsheetApp.flush();
    return result;
  } finally {
    lock.releaseLock();
  }
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

// ===============================================================================================
// AUTH
// ===============================================================================================

/**
 * POST action=login
 * Body: { "Login": "...", "Senha": "..." }   (also accepts login / password)
 * Data: { user: { id, name, role, trainerId?, initials }, role }
 */
function login_(body) {
  const login = str_(body.Login !== undefined ? body.Login : body.login).toLowerCase();
  const password = str_(body.Senha !== undefined ? body.Senha : body.password);
  if (!login || !password) throw new ApiError('Login and Senha are required');

  const row = readTable_(SHEET.USERS).rows.find((r) => str_(r.Login).toLowerCase() === login);
  if (!row || str_(row.Senha) !== password) throw new ApiError('Invalid credentials');

  const user = toUser_(row);
  if (!user.role) throw new ApiError('This account has no valid Role (expected Trainer or Student)');
  return { user: user, role: user.role };
}

/** Loads a user by ID and checks its role. `paramName` is only used in error messages. */
function requireUser_(id, role, paramName) {
  if (!str_(id)) throw new ApiError(`Missing required parameter "${paramName}"`);
  const row = readTable_(SHEET.USERS).rows.find((r) => sameId_(r.ID_Usuario, id));
  if (!row) throw new ApiError(`User "${id}" not found`);
  const user = toUser_(row);
  if (role && user.role !== role) throw new ApiError(`User "${id}" is not a ${role}`);
  return user;
}

// ===============================================================================================
// STUDENT ENDPOINTS
// ===============================================================================================

/**
 * GET action=getStudentData&userId={id}
 * Data: { user, workouts: Workout[] (exercises nested, sorted by Ordem), schedule: { studentId, days } }
 */
function getStudentData_(userId) {
  const student = requireUser_(userId, 'student', 'userId');
  return {
    user: student,
    workouts: listWorkouts_(student.id),
    schedule: buildSchedule_(student.id),
  };
}

/**
 * GET action=getWorkout&workoutId={id}
 * Data: { workout: Workout | null }   (null when no workout has that ID)
 */
function getWorkout_(workoutId) {
  if (!str_(workoutId)) throw new ApiError('Missing required parameter "workoutId"');
  const row = readTable_(SHEET.WORKOUTS).rows.find((r) => sameId_(r.ID_Treino, workoutId));
  if (!row) return { workout: null };
  const exercises = readTable_(SHEET.EXERCISES).rows.filter((r) => sameId_(r.ID_Treino, workoutId));
  return { workout: toWorkout_(row, exercises) };
}

function listWorkouts_(studentId) {
  const exercisesByWorkout = groupBy_(readTable_(SHEET.EXERCISES).rows, (r) => str_(r.ID_Treino));
  return readTable_(SHEET.WORKOUTS).rows
    .filter((r) => sameId_(r.ID_Usuario, studentId))
    .map((r) => toWorkout_(r, exercisesByWorkout[str_(r.ID_Treino)] || []));
}

/**
 * One entry per Agenda row, sorted Monday -> Sunday. Days without any row are returned as
 * { type: "rest" } so the week always has all 7 days.
 */
function buildSchedule_(studentId) {
  const workouts = indexBy_(readTable_(SHEET.WORKOUTS).rows, (r) => str_(r.ID_Treino));
  const days = readTable_(SHEET.SCHEDULE).rows
    .filter((r) => sameId_(r.ID_Usuario, studentId))
    .map(toScheduleDay_)
    .filter((d) => d.dayNumber > 0);
  days.forEach((d) => {
    const workout = d.workoutId && workouts[d.workoutId];
    if (workout) d.workoutName = str_(workout.Nome_do_Treino);
  });
  DAY_NAMES.forEach((day, i) => {
    if (!days.some((d) => d.dayNumber === i + 1)) days.push({ day: day, dayNumber: i + 1, type: 'rest' });
  });
  days.sort((a, b) => a.dayNumber - b.dayNumber);
  return { studentId: studentId, days: days };
}

/**
 * POST action=saveWorkoutSession
 * Body (the frontend's SessionRecord, optionally wrapped in "session"):
 * {
 *   "studentId": "...", "workoutId": "...", "date": "ISO (optional, defaults to now)",
 *   "durationSec": 3600,
 *   "exercises": [{ "exerciseId": "EX-..." | "exerciseName": "Back Squat", "sets": [{ "weight": 100, "reps": 5 }] }]
 * }
 * Each exercise is matched by exerciseId, else by name within the workout (then within the
 * student's other workouts). Volume_Total is recomputed server-side from the sets.
 * Data: { session: SessionRecord }
 */
function saveWorkoutSession_(body) {
  const input = body.session || body;
  const studentId = str_(input.studentId || input.userId);
  requireUser_(studentId, 'student', 'studentId');
  const exercises = input.exercises || [];
  if (!Array.isArray(exercises)) throw new ApiError('"exercises" must be an array');

  let workoutId = str_(input.workoutId);
  const findExercise = exerciseResolver_(studentId, workoutId);
  const sessionId = generateId_('HS');
  const setRecords = [];

  exercises.forEach((ex, i) => {
    const name = str_(ex && (ex.exerciseName || ex.name));
    const match = findExercise(str_(ex && ex.exerciseId), name);
    if (!match && !name) throw new ApiError(`exercises[${i}] needs "exerciseId" or "exerciseName"`);
    if (!Array.isArray(ex.sets)) throw new ApiError(`exercises[${i}].sets must be an array`);
    if (!workoutId && match) workoutId = str_(match.ID_Treino);

    ex.sets
      .filter((s) => s && s.done !== false)
      .forEach((s, j) => {
        setRecords.push({
          ID_Historico: sessionId,
          ID_Exercicio: match ? str_(match.ID_Exercicio) : '',
          Serie_Num: j + 1,
          Reps_Feitas: Math.max(0, int_(s.reps)),
          Carga_Usada: Math.max(0, num_(s.weight)),
          // Snapshot kept so history still has a name if the exercise is later removed from the plan.
          Nome_Exercicio: match ? str_(match.Nome) : name,
        });
      });
  });

  const computedVolume = setRecords.reduce((v, s) => v + s.Reps_Feitas * s.Carga_Usada, 0);
  const sessionRecord = {
    ID_Historico: sessionId,
    ID_Usuario: studentId,
    Data: (parseDate_(input.date) || new Date()).toISOString(),
    Tempo_Duracao_seg: Math.max(0, int_(input.durationSec)),
    Volume_Total: round_(setRecords.length ? computedVolume : Math.max(0, num_(input.totalVolume))),
    ID_Treino: workoutId,
  };

  appendRecords_(SHEET.SESSIONS, [sessionRecord]);
  appendRecords_(SHEET.SETS, setRecords);
  return { session: attachSets_([toSession_(sessionRecord)], setRecords)[0] };
}

/** Returns (exerciseId, name) => Exercicios_Treino row or null. */
function exerciseResolver_(studentId, workoutId) {
  const planned = readTable_(SHEET.EXERCISES).rows;
  const byId = indexBy_(planned, (r) => str_(r.ID_Exercicio));
  const studentWorkouts = Object.create(null);
  readTable_(SHEET.WORKOUTS).rows.forEach((r) => {
    if (sameId_(r.ID_Usuario, studentId)) studentWorkouts[str_(r.ID_Treino)] = true;
  });
  return (exerciseId, name) => {
    if (exerciseId && byId[exerciseId]) return byId[exerciseId];
    if (!name) return null;
    const key = name.toLowerCase();
    const sameName = planned.filter((r) => str_(r.Nome).toLowerCase() === key);
    return (
      sameName.find((r) => workoutId && sameId_(r.ID_Treino, workoutId)) ||
      sameName.find((r) => studentWorkouts[str_(r.ID_Treino)]) ||
      null
    );
  };
}

/** All sessions (headers only) belonging to the given student IDs. */
function loadSessions_(studentIds) {
  const wanted = Object.create(null);
  studentIds.forEach((id) => (wanted[str_(id)] = true));
  return readTable_(SHEET.SESSIONS).rows.filter((r) => wanted[str_(r.ID_Usuario)]).map(toSession_);
}

/**
 * Fills each session's `exercises` from Historico_Series (grouped per exercise, in logged
 * order) and resolves workoutId/workoutName. Exercise names come from the current plan, falling
 * back to the Nome_Exercicio snapshot for exercises that no longer exist.
 */
function attachSets_(sessions, setRows) {
  if (!sessions.length) return sessions;
  const sessionsById = {};
  sessions.forEach((s) => (sessionsById[s.id] = { session: s, byExercise: {} }));
  const planned = indexBy_(readTable_(SHEET.EXERCISES).rows, (r) => str_(r.ID_Exercicio));
  const workouts = indexBy_(readTable_(SHEET.WORKOUTS).rows, (r) => str_(r.ID_Treino));

  (setRows || readTable_(SHEET.SETS).rows).forEach((r) => {
    const entry = sessionsById[str_(r.ID_Historico)];
    if (!entry) return;
    const exerciseId = str_(r.ID_Exercicio);
    const plan = planned[exerciseId];
    const name = plan ? str_(plan.Nome) : str_(r.Nome_Exercicio) || 'Unknown exercise';
    if (!entry.session.workoutId && plan) entry.session.workoutId = str_(plan.ID_Treino);

    const key = exerciseId || name.toLowerCase();
    let exercise = entry.byExercise[key];
    if (!exercise) {
      exercise = { exerciseId: exerciseId || undefined, exerciseName: name, sets: [] };
      entry.byExercise[key] = exercise;
      entry.session.exercises.push(exercise);
    }
    exercise.sets.push({ setNumber: int_(r.Serie_Num), weight: num_(r.Carga_Usada), reps: int_(r.Reps_Feitas) });
  });

  sessions.forEach((s) => {
    s.exercises.forEach((ex) => ex.sets.sort((a, b) => a.setNumber - b.setNumber));
    const workout = s.workoutId && workouts[s.workoutId];
    if (workout) s.workoutName = str_(workout.Nome_do_Treino);
  });
  return sessions;
}

/**
 * GET action=getStudentStats&userId={id}
 * Data:
 * {
 *   summary: { totalSessions, totalVolume, totalDurationSec, averageDurationSec, averageVolume, lastSessionDate },
 *   volumeOverTime: [{ date, sessionId, workoutName, totalVolume, durationSec }],
 *   exerciseProgress: [{ exerciseName, exerciseIds, personalRecord: { weight, date },
 *                        data: [{ date, sessionId, topWeight, volume, totalReps, sets, estimated1RM }] }],
 *   history: SessionRecord[]            // oldest first, same shape the frontend charts use today
 * }
 * Progress is grouped by exercise name, so the same lift in two workouts is one series.
 */
function getStudentStats_(userId) {
  const student = requireUser_(userId, 'student', 'userId');
  const history = attachSets_(loadSessions_([student.id])).sort((a, b) => dateMs_(a.date) - dateMs_(b.date));

  const totalVolume = history.reduce((v, s) => v + s.totalVolume, 0);
  const totalDurationSec = history.reduce((v, s) => v + s.durationSec, 0);
  const count = history.length;

  const progress = {};
  const order = [];
  history.forEach((s) => {
    s.exercises.forEach((ex) => {
      if (!ex.sets.length) return;
      const key = ex.exerciseName.toLowerCase();
      if (!progress[key]) {
        progress[key] = { exerciseName: ex.exerciseName, exerciseIds: [], personalRecord: null, data: [] };
        order.push(key);
      }
      const series = progress[key];
      if (ex.exerciseId && series.exerciseIds.indexOf(ex.exerciseId) === -1) series.exerciseIds.push(ex.exerciseId);

      const topWeight = Math.max.apply(null, ex.sets.map((x) => x.weight));
      series.data.push({
        date: s.date,
        sessionId: s.id,
        topWeight: topWeight,
        volume: round_(ex.sets.reduce((v, x) => v + x.weight * x.reps, 0)),
        totalReps: ex.sets.reduce((v, x) => v + x.reps, 0),
        sets: ex.sets.length,
        // Epley formula; sets with 0 reps are ignored.
        estimated1RM: round_(Math.max.apply(null, ex.sets.map((x) => (x.reps > 0 ? x.weight * (1 + x.reps / 30) : 0))), 1),
      });
      if (!series.personalRecord || topWeight > series.personalRecord.weight) {
        series.personalRecord = { weight: topWeight, date: s.date };
      }
    });
  });

  return {
    summary: {
      totalSessions: count,
      totalVolume: round_(totalVolume),
      totalDurationSec: totalDurationSec,
      averageDurationSec: count ? Math.round(totalDurationSec / count) : 0,
      averageVolume: count ? round_(totalVolume / count) : 0,
      lastSessionDate: count ? history[count - 1].date : null,
    },
    volumeOverTime: history.map((s) => ({
      date: s.date,
      sessionId: s.id,
      workoutName: s.workoutName || null,
      totalVolume: s.totalVolume,
      durationSec: s.durationSec,
    })),
    exerciseProgress: order.map((k) => progress[k]),
    history: history,
  };
}

// ===============================================================================================
// TRAINER ENDPOINTS
// ===============================================================================================

/**
 * GET action=getTrainerDashboard&trainerId={id}
 * Students are those whose Usuarios.ID_Treinador equals trainerId. Students with no trainer
 * (or a sheet without that column) are shown to every trainer.
 * Data: {
 *   trainer: User,
 *   students: [User & { lastActivity, totalSessions, daysSinceLastSession,
 *               lastSession: { id, date, workoutId, workoutName, durationSec, totalVolume, exerciseCount, setCount } | null }]
 * }
 */
function getTrainerDashboard_(trainerId) {
  const trainer = requireUser_(trainerId, 'trainer', 'trainerId');
  const students = readTable_(SHEET.USERS).rows
    .map(toUser_)
    .filter((u) => u.role === 'student' && (!u.trainerId || u.trainerId === trainer.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const latest = {};
  const counts = {};
  loadSessions_(students.map((s) => s.id)).forEach((s) => {
    counts[s.studentId] = (counts[s.studentId] || 0) + 1;
    if (!latest[s.studentId] || dateMs_(s.date) > dateMs_(latest[s.studentId].date)) latest[s.studentId] = s;
  });
  attachSets_(Object.keys(latest).map((id) => latest[id]));

  const now = new Date();
  return {
    trainer: trainer,
    students: students.map((student) => {
      const last = latest[student.id] || null;
      const daysSince = last ? calendarDaysBetween_(last.date, now) : null;
      return Object.assign({}, student, {
        lastActivity: describeActivity_(daysSince),
        totalSessions: counts[student.id] || 0,
        daysSinceLastSession: daysSince,
        lastSession: last && {
          id: last.id,
          date: last.date,
          workoutId: last.workoutId || null,
          workoutName: last.workoutName || null,
          durationSec: last.durationSec,
          totalVolume: last.totalVolume,
          exerciseCount: last.exercises.length,
          setCount: last.exercises.reduce((n, ex) => n + ex.sets.length, 0),
        },
      });
    }),
  };
}

/** Whole calendar days between two instants, in the script's time zone. */
function calendarDaysBetween_(fromIso, to) {
  const from = parseDate_(fromIso);
  if (!from) return null;
  const tz = Session.getScriptTimeZone();
  const day = (d) => Date.parse(Utilities.formatDate(d, tz, 'yyyy-MM-dd'));
  return Math.round((day(to) - day(from)) / 86400000);
}

function describeActivity_(daysSince) {
  if (daysSince === null) return undefined;
  if (daysSince <= 0) return 'Trained today';
  if (daysSince === 1) return 'Trained yesterday';
  return `${daysSince} days ago`;
}

/**
 * POST action=saveWorkoutPlan
 * Body (the frontend's Workout, optionally wrapped in "workout"):
 * { "id"?: "TR-...", "studentId": "...", "name": "...", "focus"?: "...",
 *   "exercises": [{ "id"?, "name", "sets", "reps", "weight", "restSec", "videoUrl"?, "notes"?, "rir"?, "substitute"? }] }
 * An `id` that matches an existing Treinos row updates it; otherwise a new workout is created.
 * The workout's old Exercicios_Treino rows are always deleted and the list re-inserted (cascade).
 * Exercise IDs already belonging to this workout are kept so logged history stays linked.
 * Data: { workout: Workout, created: boolean }
 */
function saveWorkoutPlan_(body) {
  const input = body.workout || body;
  const studentId = str_(input.studentId || input.userId);
  requireUser_(studentId, 'student', 'studentId');
  const name = str_(input.name);
  if (!name) throw new ApiError('Workout "name" is required');
  const exercises = input.exercises || [];
  if (!Array.isArray(exercises)) throw new ApiError('"exercises" must be an array');
  exercises.forEach((ex, i) => {
    if (!str_(ex && ex.name)) throw new ApiError(`exercises[${i}] is missing "name"`);
  });

  const existing = str_(input.id)
    ? readTable_(SHEET.WORKOUTS).rows.find((r) => sameId_(r.ID_Treino, input.id))
    : null;
  const workoutId = existing ? str_(existing.ID_Treino) : generateId_('TR');
  const workoutRecord = {
    ID_Treino: workoutId,
    ID_Usuario: studentId,
    Nome_do_Treino: name,
    Descricao: str_(input.focus !== undefined ? input.focus : input.description),
  };
  if (existing) updateRecord_(SHEET.WORKOUTS, existing, workoutRecord);
  else appendRecords_(SHEET.WORKOUTS, [workoutRecord]);

  const previousIds = Object.create(null);
  readTable_(SHEET.EXERCISES).rows.forEach((r) => {
    if (sameId_(r.ID_Treino, workoutId)) previousIds[str_(r.ID_Exercicio)] = true;
  });
  const usedIds = Object.create(null);
  const exerciseRecords = exercises.map((ex, i) => {
    // Client-side temp IDs (e.g. "ex-k3j2") and duplicates get a fresh server ID.
    let id = str_(ex.id);
    if (!previousIds[id] || usedIds[id]) id = generateId_('EX');
    usedIds[id] = true;
    return {
      ID_Exercicio: id,
      ID_Treino: workoutId,
      Ordem: i + 1,
      Nome: str_(ex.name),
      Series: Math.max(0, int_(ex.sets)),
      Reps: str_(ex.reps),
      Carga_kg: Math.max(0, num_(ex.weight)),
      Descanso_seg: Math.max(0, int_(ex.restSec)),
      Link_Video: str_(ex.videoUrl),
      Anotacoes: str_(ex.notes),
      RIR_RPE: str_(ex.rir),
      Exercicio_Substituto: str_(ex.substitute),
    };
  });
  replaceRecords_(SHEET.EXERCISES, (r) => sameId_(r.ID_Treino, workoutId), exerciseRecords);

  return { workout: toWorkout_(workoutRecord, exerciseRecords), created: !existing };
}

/**
 * POST action=deleteWorkoutPlan
 * Body: { "workoutId": "TR-..." }
 * Deletes the Treinos row, its Exercicios_Treino rows and any Agenda rows pointing to it
 * (those days fall back to rest). Workout history is kept.
 * Data: { workoutId, deletedExercises, clearedScheduleEntries }
 */
function deleteWorkoutPlan_(body) {
  const workoutId = str_(body.workoutId || body.id);
  if (!workoutId) throw new ApiError('Missing required field "workoutId"');
  const matches = (r) => sameId_(r.ID_Treino, workoutId);
  if (!replaceRecords_(SHEET.WORKOUTS, matches, [])) throw new ApiError(`Workout "${workoutId}" not found`);
  return {
    workoutId: workoutId,
    deletedExercises: replaceRecords_(SHEET.EXERCISES, matches, []),
    clearedScheduleEntries: replaceRecords_(SHEET.SCHEDULE, matches, []),
  };
}

/**
 * POST action=updateSchedule
 * Body (the frontend's Schedule, optionally wrapped in "schedule"):
 * { "studentId": "...", "days": [{ "day": "Monday" | "dayNumber": 1, "type": "workout|cardio|rest",
 *                                  "workoutId"?: "TR-...", "label"?: "30 min bike" }] }
 * Only the days present in `days` are replaced; other days keep their current entries.
 * Sending two entries for the same day (e.g. workout + cardio) stores both.
 * Data: { schedule: { studentId, days } }
 */
function updateSchedule_(body) {
  const input = body.schedule || body;
  const studentId = str_(input.studentId || input.userId);
  requireUser_(studentId, 'student', 'studentId');
  const days = input.days;
  if (!Array.isArray(days) || !days.length) throw new ApiError('"days" must be a non-empty array');

  const workouts = indexBy_(readTable_(SHEET.WORKOUTS).rows, (r) => str_(r.ID_Treino));
  const records = days.map((d, i) => {
    d = d || {};
    const rawDay = d.dayNumber !== undefined ? d.dayNumber : d.day;
    const dayNumber = dayNumber_(rawDay);
    if (!dayNumber) throw new ApiError(`days[${i}]: invalid day "${str_(rawDay)}" (use 1-7, Monday = 1, or an English weekday name)`);
    const type = normalizeActivity_(d.type);
    if (!hasOwn_(ACTIVITY_TO_SHEET, type)) throw new ApiError(`days[${i}]: invalid type "${str_(d.type)}" (use workout, cardio or rest)`);

    let workoutId = '';
    if (type === 'workout') {
      workoutId = str_(d.workoutId);
      const workout = workouts[workoutId];
      if (!workout) throw new ApiError(`days[${i}]: workout "${workoutId}" not found`);
      if (!sameId_(workout.ID_Usuario, studentId)) throw new ApiError(`days[${i}]: workout "${workoutId}" belongs to another student`);
    }
    return {
      ID_Agenda: generateId_('AG'),
      ID_Usuario: studentId,
      Dia_Semana: dayNumber,
      Tipo_Atividade: ACTIVITY_TO_SHEET[type],
      ID_Treino: workoutId,
      Descricao: str_(d.label),
    };
  });

  const touchedDays = {};
  records.forEach((r) => (touchedDays[r.Dia_Semana] = true));
  replaceRecords_(
    SHEET.SCHEDULE,
    (r) => sameId_(r.ID_Usuario, studentId) && touchedDays[dayNumber_(r.Dia_Semana)],
    records,
  );
  return { schedule: buildSchedule_(studentId) };
}

// ===============================================================================================
// SETUP: run by hand from the Apps Script editor (not exposed over HTTP)
// ===============================================================================================

/**
 * Creates any missing tab or column (optional columns included), bolds and freezes the header
 * row and formats non-numeric columns as plain text. Existing data is never touched, so it is
 * safe to run again at any time.
 */
function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SCHEMA).forEach((name) => {
    const schema = SCHEMA[name];
    const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    const lastCol = sheet.getLastColumn();
    const headers = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map((h) => String(h).trim()) : [];
    const missing = schema.columns.concat(schema.optional).filter((c) => headers.indexOf(c) === -1);
    const all = headers.concat(missing);

    if (all.length > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), all.length - sheet.getMaxColumns());
    if (missing.length) sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
    sheet.getRange(1, 1, 1, all.length).setFontWeight('bold');
    sheet.setFrozenRows(1);

    const maxRows = sheet.getMaxRows();
    const textColumns = [];
    all.forEach((h, i) => {
      if (h && schema.numeric.indexOf(h) === -1) textColumns.push(columnRangeA1_(i + 1, 2, maxRows));
    });
    if (maxRows > 1 && textColumns.length) sheet.getRangeList(textColumns).setNumberFormat('@');

    console.log(`${name}: ${missing.length ? 'added ' + missing.join(', ') : 'ok'}`);
  });
  resetTableCache_();
}

/**
 * Fills an empty database with one trainer, one student, two workouts and a weekly schedule,
 * so the API can be tested right after deploying. Does nothing if Usuarios already has users.
 *   Trainer login: coach / coach123     Student login: aluno / aluno123
 */
function seedDemoData() {
  setupDatabase();
  if (readTable_(SHEET.USERS).rows.length) {
    console.log('Usuarios already has data; seed skipped.');
    return;
  }
  const trainerId = 'US-coach';
  const studentId = 'US-aluno';
  appendRecords_(SHEET.USERS, [
    { ID_Usuario: trainerId, Nome: 'Coach Alex Moreira', Login: 'coach', Senha: 'coach123', Role: 'Trainer' },
    { ID_Usuario: studentId, Nome: 'Aluno Demo', Login: 'aluno', Senha: 'aluno123', Role: 'Student', ID_Treinador: trainerId },
  ]);

  const push = saveWorkoutPlan_({
    studentId: studentId,
    name: 'Push A - Chest & Shoulders',
    focus: 'Upper push',
    exercises: [
      { name: 'Barbell Bench Press', sets: 4, reps: '8', weight: 80, restSec: 120, rir: 'RIR 2',
        videoUrl: 'https://www.youtube.com/watch?v=rT7DgCr-3pg', substitute: 'Dumbbell Bench Press',
        notes: 'Keep chest up, shoulder blades retracted.' },
      { name: 'Incline Dumbbell Press', sets: 3, reps: '8-10', weight: 28, restSec: 90 },
      { name: 'Cable Triceps Pushdown', sets: 3, reps: '12-15', weight: 30, restSec: 60 },
    ],
  }).workout;
  const legs = saveWorkoutPlan_({
    studentId: studentId,
    name: 'Legs - Squat Focus',
    focus: 'Lower body',
    exercises: [
      { name: 'Back Squat', sets: 5, reps: '5', weight: 100, restSec: 180, rir: 'RPE 8',
        videoUrl: 'https://www.youtube.com/watch?v=ultWZbUMPL8' },
      { name: 'Romanian Deadlift', sets: 3, reps: '10', weight: 70, restSec: 120 },
    ],
  }).workout;

  updateSchedule_({
    studentId: studentId,
    days: [
      { day: 'Monday', type: 'workout', workoutId: push.id },
      { day: 'Tuesday', type: 'cardio', label: '30 min zone 2 bike' },
      { day: 'Wednesday', type: 'workout', workoutId: legs.id },
      { day: 'Thursday', type: 'rest' },
      { day: 'Friday', type: 'workout', workoutId: push.id },
      { day: 'Saturday', type: 'cardio', label: '45 min run' },
      { day: 'Sunday', type: 'rest' },
    ],
  });
  SpreadsheetApp.flush();
  console.log(`Seeded trainer ${trainerId} and student ${studentId}.`);
}

// ===============================================================================================
// DATA LAYER: whole-sheet reads, bulk writes with setValues, casting and ID helpers
// ===============================================================================================

// Per-request memo of parsed sheets; reset at the start of every request and after each write.
let tableCache_ = {};

function resetTableCache_() {
  tableCache_ = {};
}

function getSheet_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new ApiError(`Sheet "${name}" not found. Run setupDatabase() from the Apps Script editor`);
  return sheet;
}

/**
 * Returns { name, sheet, headers, rows, lastRow }. Each row object has one key per header plus
 * __rowNumber (1-based sheet row) and __raw (the original cell array), used for in-place writes.
 */
function readTable_(name) {
  if (tableCache_[name]) return tableCache_[name];
  const sheet = getSheet_(name);
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map((h) => String(h).trim());
  const missing = SCHEMA[name].columns.filter((c) => headers.indexOf(c) === -1);
  if (missing.length) {
    throw new ApiError(`Sheet "${name}" is missing column(s): ${missing.join(', ')}. Run setupDatabase()`);
  }
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const raw = values[i];
    if (raw.every(isBlank_)) continue;
    const row = { __rowNumber: i + 1, __raw: raw };
    headers.forEach((h, c) => {
      if (h) row[h] = raw[c];
    });
    rows.push(row);
  }
  const table = { name: name, sheet: sheet, headers: headers, rows: rows, lastRow: values.length };
  tableCache_[name] = table;
  return table;
}

/** Appends records (objects keyed by header) in a single setValues call. */
function appendRecords_(name, records) {
  if (!records.length) return;
  const table = readTable_(name);
  writeBlock_(table, table.lastRow + 1, records.map((r) => toRow_(table.headers, r)));
  delete tableCache_[name];
}

/** Overwrites the given fields of an existing row, keeping any other cells as they are. */
function updateRecord_(name, row, record) {
  const table = readTable_(name);
  writeBlock_(table, row.__rowNumber, [toRow_(table.headers, record, row.__raw)]);
  delete tableCache_[name];
}

/**
 * Deletes every row matching `shouldRemove` and appends `newRecords`, in one bulk rewrite of
 * the data block (row-by-row deleteRow calls are slow in Apps Script). This is the cascade
 * primitive: e.g. drop a workout's old exercises and insert the new ones together.
 * Returns the number of removed rows.
 */
function replaceRecords_(name, shouldRemove, newRecords) {
  const table = readTable_(name);
  const kept = table.rows.filter((r) => !shouldRemove(r));
  const removed = table.rows.length - kept.length;
  if (removed === 0) {
    appendRecords_(name, newRecords);
    return 0;
  }
  const matrix = kept.map((r) => r.__raw).concat(newRecords.map((r) => toRow_(table.headers, r)));
  const oldDataRows = table.lastRow - 1;
  writeBlock_(table, 2, matrix);
  if (oldDataRows > matrix.length) {
    table.sheet.getRange(2 + matrix.length, 1, oldDataRows - matrix.length, table.headers.length).clearContent();
  }
  delete tableCache_[name];
  return removed;
}

function toRow_(headers, record, base) {
  return headers.map((h, i) => {
    if (h && hasOwn_(record, h)) {
      const v = record[h];
      return v === null || v === undefined ? '' : v;
    }
    return base ? base[i] : '';
  });
}

function writeBlock_(table, startRow, matrix) {
  if (!matrix.length) return;
  const sheet = table.sheet;
  const lastNeeded = startRow + matrix.length - 1;
  const maxRows = sheet.getMaxRows();
  if (lastNeeded > maxRows) sheet.insertRowsAfter(maxRows, lastNeeded - maxRows);

  const numeric = SCHEMA[table.name].numeric;
  const textRanges = [];
  table.headers.forEach((h, i) => {
    if (h && numeric.indexOf(h) === -1) textRanges.push(columnRangeA1_(i + 1, startRow, lastNeeded));
  });
  if (textRanges.length) sheet.getRangeList(textRanges).setNumberFormat('@');

  sheet.getRange(startRow, 1, matrix.length, table.headers.length).setValues(matrix);
}

function columnRangeA1_(col, fromRow, toRow) {
  let letters = '';
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return `${letters}${fromRow}:${letters}${toRow}`;
}

// ---------------------------------------------------------------------------------------------
// IDs and casting. Sheets hands back numbers, strings or Date objects depending on how a cell
// was typed, so every value read from a sheet goes through one of these before reaching JSON.
// ---------------------------------------------------------------------------------------------

/** Short unique ID such as "TR-3f9a0c1d2b4e". The letter prefix stops Sheets reading it as a number. */
function generateId_(prefix) {
  return `${prefix}-${Utilities.getUuid().replace(/-/g, '').slice(0, 12)}`;
}

function isBlank_(v) {
  return v === '' || v === null || v === undefined;
}

function str_(v) {
  if (isBlank_(v)) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

/** Like str_, but blank becomes undefined so the key is dropped from the JSON output. */
function optStr_(v) {
  const s = str_(v);
  return s === '' ? undefined : s;
}

/** Parses numbers stored as numbers or text, including pt-BR "80,5" and "1.234,5". */
function num_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = str_(v).replace(/\s/g, '');
  if (s.indexOf(',') !== -1) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  }
  const n = Number(s);
  return s !== '' && isFinite(n) ? n : 0;
}

function int_(v) {
  return Math.round(num_(v));
}

function round_(n, decimals) {
  const f = Math.pow(10, decimals === undefined ? 2 : decimals);
  return Math.round(n * f) / f;
}

function sameId_(a, b) {
  const id = str_(a);
  return id !== '' && id === str_(b);
}

/** Returns a Date for Date objects, ISO strings and timestamps, or null when unparseable. */
function parseDate_(v) {
  if (isBlank_(v)) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function dateMs_(iso) {
  const d = parseDate_(iso);
  return d ? d.getTime() : 0;
}

/** True when `key` is an own property (so IDs like "constructor" never hit Object.prototype). */
function hasOwn_(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function indexBy_(rows, keyFn) {
  const index = Object.create(null);
  rows.forEach((r) => {
    const key = keyFn(r);
    if (key !== '' && !index[key]) index[key] = r;
  });
  return index;
}

function groupBy_(rows, keyFn) {
  const groups = Object.create(null);
  rows.forEach((r) => {
    const key = keyFn(r);
    (groups[key] = groups[key] || []).push(r);
  });
  return groups;
}

// ===============================================================================================
// MAPPERS: sheet rows -> the JSON shapes in the frontend's src/lib/types.ts
// ===============================================================================================

function normalizeRole_(value) {
  const role = str_(value).toLowerCase();
  return role === 'trainer' || role === 'student' ? role : '';
}

function normalizeActivity_(value) {
  return str_(value).toLowerCase();
}

/** Accepts 1-7, "1"-"7" or an English weekday name. Returns 0 when invalid. */
function dayNumber_(value) {
  const s = str_(value);
  const byName = DAY_NAMES.map((d) => d.toLowerCase()).indexOf(s.toLowerCase());
  if (byName !== -1) return byName + 1;
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= 7 ? n : 0;
}

function initials_(name) {
  const parts = str_(name).split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (first + last).toUpperCase();
}

/** Whitelisted fields only: Senha and Login are never serialized. */
function toUser_(row) {
  const name = str_(row.Nome);
  return {
    id: str_(row.ID_Usuario),
    name: name,
    role: normalizeRole_(row.Role),
    trainerId: optStr_(row.ID_Treinador),
    initials: initials_(name),
  };
}

function toExercise_(row) {
  return {
    id: str_(row.ID_Exercicio),
    order: int_(row.Ordem),
    name: str_(row.Nome),
    sets: int_(row.Series),
    reps: str_(row.Reps),
    weight: num_(row.Carga_kg),
    restSec: int_(row.Descanso_seg),
    videoUrl: optStr_(row.Link_Video),
    notes: optStr_(row.Anotacoes),
    rir: optStr_(row.RIR_RPE),
    substitute: optStr_(row.Exercicio_Substituto),
  };
}

function toWorkout_(row, exerciseRows) {
  return {
    id: str_(row.ID_Treino),
    name: str_(row.Nome_do_Treino),
    studentId: str_(row.ID_Usuario),
    focus: optStr_(row.Descricao),
    exercises: exerciseRows.map(toExercise_).sort((a, b) => a.order - b.order),
  };
}

function toScheduleDay_(row) {
  const dayNumber = dayNumber_(row.Dia_Semana);
  return {
    day: dayNumber ? DAY_NAMES[dayNumber - 1] : '',
    dayNumber: dayNumber,
    type: normalizeActivity_(row.Tipo_Atividade),
    workoutId: optStr_(row.ID_Treino),
    label: optStr_(row.Descricao),
  };
}

/** Session header only; attachSets_() fills `exercises` and resolves the workout. */
function toSession_(row) {
  const date = parseDate_(row.Data);
  return {
    id: str_(row.ID_Historico),
    studentId: str_(row.ID_Usuario),
    workoutId: optStr_(row.ID_Treino),
    workoutName: undefined,
    date: date ? date.toISOString() : str_(row.Data),
    durationSec: int_(row.Tempo_Duracao_seg),
    totalVolume: num_(row.Volume_Total),
    exercises: [],
  };
}
