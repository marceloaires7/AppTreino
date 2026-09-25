/** @OnlyCurrentDoc */

/**
 * Gym Training API: Google Apps Script backend for the AppTreino app (frontend on GitHub Pages).
 *
 * This is the only file in the Apps Script project. Paste it into Code.gs of the script bound
 * to the spreadsheet (Extensions > Apps Script), then:
 *   1. Create the accounts: edit the list in cadastrarUsuarios() and run it from the editor, or
 *      run seedDemoData() for a demo trainer (coach / coach123) and student (aluno / aluno123).
 *      Tabs and columns are created on first use; setupDatabase() also formats them.
 *   2. Deploy > New deployment > Web app, Execute as: Me, Who has access: Anyone.
 *   3. Put the /exec URL in the frontend. After editing this file, publish a new version in
 *      Deploy > Manage deployments, or the URL keeps serving the old code.
 *
 * Protocol (the one from the TreinoFácil app): the frontend POSTs { acao, args, token } as
 * text/plain and gets { ok: true, dados } or { ok: false, erro, codigo? }. Only "login" and
 * "ping" work without a token. Every other action receives the signed-in user, taken from the
 * token, as its first argument: the client never says who it is.
 *
 * Passwords are never stored. Usuarios keeps a per-account Salt and
 * SenhaHash = HMAC(pepper, salt|senha) repeated 300 times; the pepper lives in the script
 * properties, outside the spreadsheet. A token is "payload.signature", signed with another
 * script-property secret, and lasts 30 days. Five wrong passwords lock a login for 15 minutes.
 * The full API reference is in backend/README.md in the app repository.
 */

// ===============================================================================================
// CONFIGURATION: sheet schema and constants
// ===============================================================================================

const API_VERSION = '2.1.0';

const SESSION_DAYS = 30;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 15 * 60;
const HASH_ITERATIONS = 300;
const MIN_PASSWORD_LENGTH = 6;
// Error code the frontend reacts to by signing the user out.
const SESSION_INVALID = 'SESSAO_INVALIDA';

const SHEET = {
  USERS: 'Usuarios',
  WORKOUTS: 'Treinos',
  EXERCISES: 'Exercicios_Treino',
  SCHEDULE: 'Agenda',
  SESSIONS: 'Historico_Execucao',
  SETS: 'Historico_Series',
};

/**
 * Columns each tab must have. Missing tabs and columns are added automatically on first use.
 * Columns not listed in `numeric` are written as plain text, so values like "8-12" reps or a
 * login such as "0123" are not turned into dates or numbers by Sheets.
 * Usuarios may also have a legacy plain-text Senha column; see passwordMatches_().
 */
const SCHEMA = {
  [SHEET.USERS]: {
    columns: ['ID_Usuario', 'Nome', 'Login', 'Role', 'ID_Treinador', 'Salt', 'SenhaHash', 'CriadoEm'],
    numeric: [],
  },
  [SHEET.WORKOUTS]: {
    columns: ['ID_Treino', 'ID_Usuario', 'Nome_do_Treino', 'Descricao'],
    numeric: [],
  },
  [SHEET.EXERCISES]: {
    columns: [
      'ID_Exercicio', 'ID_Treino', 'Ordem', 'Nome', 'Series', 'Reps', 'Carga_kg', 'Descanso_seg',
      'Link_Video', 'Anotacoes', 'RIR_RPE', 'Exercicio_Substituto', 'Grupo_Muscular', 'Link_Video_Substituto',
    ],
    numeric: ['Ordem', 'Series', 'Carga_kg', 'Descanso_seg'],
  },
  [SHEET.SCHEDULE]: {
    columns: ['ID_Agenda', 'ID_Usuario', 'Dia_Semana', 'Tipo_Atividade', 'ID_Treino', 'Descricao'],
    numeric: ['Dia_Semana'],
  },
  [SHEET.SESSIONS]: {
    columns: ['ID_Historico', 'ID_Usuario', 'Data', 'Tempo_Duracao_seg', 'Volume_Total', 'ID_Treino'],
    numeric: ['Tempo_Duracao_seg', 'Volume_Total'],
  },
  [SHEET.SETS]: {
    columns: ['ID_Historico', 'ID_Exercicio', 'Serie_Num', 'Reps_Feitas', 'Carga_Usada', 'Nome_Exercicio'],
    numeric: ['Serie_Num', 'Reps_Feitas', 'Carga_Usada'],
  },
};

// Dia_Semana follows ISO-8601: 1 = Monday ... 7 = Sunday.
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// API value -> value stored in Agenda.Tipo_Atividade.
const ACTIVITY_TO_SHEET = { workout: 'Workout', cardio: 'Cardio', rest: 'Rest' };

// Target of a set taken to failure, in the API and in Exercicios_Treino.Reps. Typing "falha" or
// "F" in the sheet means the same; see normalizeReps_().
const FAILURE_REPS = 'Até a falha';
// Separates each set's target in Exercicios_Treino.Reps: "12; 10; Até a falha".
const REPS_SEPARATOR = ';';

// ===============================================================================================
// ENTRY POINTS AND ROUTING
// ===============================================================================================

/** An error whose message is safe to return to the client, with an optional machine code. */
class ApiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ApiError';
    this.code = code || '';
  }
}

/**
 * Everything callable from outside. `public` actions need no token; the others get the signed-in
 * user as their first argument. `write` actions run under the script lock.
 */
const ACTIONS = {
  ping: { public: true, run: ping_ },
  login: { public: true, run: login_ },
  changePassword: { write: true, run: changePassword_ },
  getStudentData: { run: getStudentData_ },
  getWorkout: { run: getWorkout_ },
  getStudentStats: { run: getStudentStats_ },
  getTrainerDashboard: { run: getTrainerDashboard_ },
  saveWorkoutSession: { write: true, run: saveWorkoutSession_ },
  saveWorkoutPlan: { write: true, run: saveWorkoutPlan_ },
  updateWorkoutDescription: { write: true, run: updateWorkoutDescription_ },
  updateExerciseRest: { write: true, run: updateExerciseRest_ },
  deleteWorkoutPlan: { write: true, run: deleteWorkoutPlan_ },
  updateSchedule: { write: true, run: updateSchedule_ },
};

/** The app calls everything by POST, with the body { acao, args, token } sent as text/plain. */
function doPost(e) {
  return respond_(() => {
    const body = parseBody_(e);
    return execute_(body.acao, body.args, body.token);
  });
}

/** GET only answers "ping", to check a deployment from the browser. Tokens never go in URLs. */
function doGet(e) {
  return respond_(() => {
    const action = str_(e && e.parameter && e.parameter.acao) || 'ping';
    if (action !== 'ping') throw new ApiError('Use POST com { acao, args, token }');
    return execute_('ping', [], '');
  });
}

/**
 * Apps Script does not currently route OPTIONS requests to scripts, so browsers must avoid
 * preflights (send POST bodies as text/plain). Kept so a preflight gets an empty success if
 * the platform ever starts forwarding them.
 */
function doOptions() {
  return jsonResponse_({ ok: true, dados: {} });
}

/** Runs an allowed action; every action but the public ones needs a valid token. */
function execute_(action, args, token) {
  resetTableCache_();
  action = str_(action);
  args = Array.isArray(args) ? args : [];
  if (!action) throw new ApiError('Falta a "acao"');
  if (!hasOwn_(ACTIONS, action)) throw new ApiError(`Ação desconhecida: "${action}"`);

  const def = ACTIONS[action];
  const run = () => (def.public ? def.run.apply(null, args) : def.run.apply(null, [validateToken_(token)].concat(args)));
  return def.write ? withLock_(run) : run();
}

/** Wraps a result as { ok: true, dados } or an error as { ok: false, erro, codigo? }. */
function respond_(fn) {
  let payload;
  try {
    payload = { ok: true, dados: fn() };
  } catch (err) {
    if (err instanceof ApiError) {
      payload = { ok: false, erro: err.message };
      if (err.code) payload.codigo = err.code;
    } else {
      console.error(err && err.stack ? err.stack : err);
      payload = { ok: false, erro: 'Erro interno: ' + (err && err.message ? err.message : err) };
    }
  }
  return jsonResponse_(payload);
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    throw new ApiError('O corpo da requisição precisa ser um JSON válido');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError('O corpo da requisição precisa ser um objeto JSON');
  }
  return body;
}

// The script lock is not reentrant, so nested calls (a write that creates a missing column, a
// login that upgrades a legacy password) reuse the lock this execution already holds.
let lockDepth_ = 0;

function withLock_(fn) {
  if (lockDepth_ > 0) return fn();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new ApiError('A planilha está ocupada. Tente de novo em alguns segundos');
  lockDepth_++;
  try {
    const result = fn();
    // Commit pending writes before the next request waiting on the lock reads the sheets.
    SpreadsheetApp.flush();
    return result;
  } finally {
    lockDepth_--;
    lock.releaseLock();
  }
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function ping_() {
  return { service: 'gym-training-api', version: API_VERSION, time: new Date().toISOString() };
}

// ===============================================================================================
// AUTH: passwords, tokens and access rules
// ===============================================================================================

/** A secret generated on first use and kept in the script properties, outside the spreadsheet. */
function secret_(key) {
  const props = PropertiesService.getScriptProperties();
  return (
    props.getProperty(key) ||
    withLock_(() => {
      // Re-check under the lock so two first requests cannot create different secrets.
      let value = props.getProperty(key);
      if (!value) {
        value = Utilities.getUuid() + Utilities.getUuid();
        props.setProperty(key, value);
      }
      return value;
    })
  );
}

/** Apps Script bytes (-128..127) -> hex text. */
function bytesToHex_(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = (bytes[i] + 256) % 256;
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}

function hmac_(text, key) {
  return bytesToHex_(Utilities.computeHmacSha256Signature(text, key, Utilities.Charset.UTF_8));
}

function hashPassword_(password, salt) {
  const pepper = secret_('PEPPER_SENHA');
  let hash = hmac_(salt + '|' + password, pepper);
  for (let i = 0; i < HASH_ITERATIONS; i++) hash = hmac_(hash + '|' + salt, pepper);
  return hash;
}

/** Compares without stopping at the first different character, so timing leaks nothing. */
function safeEqual_(a, b) {
  a = String(a);
  b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function sessionError_() {
  return new ApiError('Sua sessão expirou. Entre de novo', SESSION_INVALID);
}

function createToken_(userId) {
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = Utilities.base64EncodeWebSafe(userId + '|' + expiresAt);
  return { token: payload + '.' + hmac_(payload, secret_('SEGREDO_TOKEN')), expiresAt: expiresAt };
}

/** Returns the user who owns the token, or throws SESSAO_INVALIDA. */
function validateToken_(token) {
  const parts = str_(token).split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw sessionError_();
  if (!safeEqual_(hmac_(parts[0], secret_('SEGREDO_TOKEN')), parts[1])) throw sessionError_();

  let payload;
  try {
    payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString();
  } catch (err) {
    throw sessionError_();
  }
  const sep = payload.lastIndexOf('|');
  const userId = payload.slice(0, sep);
  const expiresAt = Number(payload.slice(sep + 1));
  if (sep < 1 || !(expiresAt > Date.now())) throw sessionError_();

  const row = findUserById_(userId);
  if (!row) throw sessionError_(); // account deleted after signing in
  const user = toUser_(row);
  if (!user.role) throw sessionError_();
  return user;
}

function normalizeLogin_(value) {
  return str_(value).toLowerCase();
}

function findUserByLogin_(login) {
  const wanted = normalizeLogin_(login);
  return readTable_(SHEET.USERS).rows.find((r) => normalizeLogin_(r.Login) === wanted) || null;
}

function findUserById_(id) {
  return readTable_(SHEET.USERS).rows.find((r) => sameId_(r.ID_Usuario, id)) || null;
}

/**
 * POST acao=login, args [login, senha]  (public)
 * Data: { token, expiresAt, user: { id, name, role, trainerId?, initials } }
 * The same message answers an unknown login and a wrong password, and both take as long.
 */
function login_(login, password) {
  login = normalizeLogin_(login);
  password = password == null ? '' : String(password);
  if (!login || !password) throw new ApiError('Informe usuário e senha');

  const cache = CacheService.getScriptCache();
  const failuresKey = 'login-failures:' + login;
  const failures = Number(cache.get(failuresKey) || 0);
  if (failures >= MAX_LOGIN_ATTEMPTS) throw new ApiError('Muitas tentativas. Aguarde 15 minutos e tente de novo');

  const row = findUserByLogin_(login);
  let matches = false;
  if (row) matches = passwordMatches_(row, password);
  else hashPassword_(password, 'no-such-account');

  if (!matches) {
    cache.put(failuresKey, String(failures + 1), LOCKOUT_SECONDS);
    throw new ApiError('Usuário ou senha incorretos');
  }
  cache.remove(failuresKey);

  const user = toUser_(row);
  if (!user.role) throw new ApiError('Esta conta não tem um Role válido (use Trainer ou Student)');
  const session = createToken_(user.id);
  return { token: session.token, expiresAt: session.expiresAt, user: user };
}

/**
 * Checks a password against the account's Salt + SenhaHash. Accounts from before hashing still
 * have a plain-text Senha: it is accepted once and immediately replaced by Salt + SenhaHash.
 */
function passwordMatches_(row, password) {
  const hash = str_(row.SenhaHash);
  if (hash) return safeEqual_(hashPassword_(password, str_(row.Salt)), hash);

  const legacy = str_(row.Senha);
  if (!legacy || !safeEqual_(legacy, str_(password))) {
    hashPassword_(password, 'no-such-account'); // same timing as a real check
    return false;
  }
  setPassword_(str_(row.ID_Usuario), str_(password));
  return true;
}

/** Stores a new Salt + SenhaHash for the account and blanks any legacy plain-text Senha. */
function setPassword_(userId, password) {
  withLock_(() => {
    delete tableCache_[SHEET.USERS];
    const row = findUserById_(userId);
    if (!row) throw new ApiError(`Usuário "${userId}" não encontrado`);
    const salt = Utilities.getUuid();
    updateRecord_(SHEET.USERS, row, { Salt: salt, SenhaHash: hashPassword_(password, salt), Senha: '' });
  });
}

/**
 * POST acao=changePassword, args [senhaAtual, senhaNova]
 * Data: { changed: true }
 */
function changePassword_(user, currentPassword, newPassword) {
  const next = newPassword == null ? '' : String(newPassword);
  if (next.length < MIN_PASSWORD_LENGTH) {
    throw new ApiError(`A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);
  }
  const row = findUserById_(user.id);
  if (!row || !passwordMatches_(row, currentPassword == null ? '' : String(currentPassword))) {
    throw new ApiError('A senha atual não confere');
  }
  setPassword_(user.id, next);
  return { changed: true };
}

/**
 * Creates an account from { login, senha, nome, role, treinador? } (treinador = the trainer's
 * login). Only reachable from the editor functions below: the app has no sign-up, because the
 * API URL is public and anyone who found it could fill the spreadsheet with accounts.
 */
function createUser_(account) {
  const login = normalizeLogin_(account.login);
  const password = account.senha == null ? '' : String(account.senha);
  const name = str_(account.nome) || login;
  const role = normalizeRole_(account.role);
  if (!/^[a-z0-9._-]{3,30}$/.test(login)) {
    throw new ApiError(`O usuário "${login}" precisa ter de 3 a 30 caracteres: letras minúsculas, números, ponto, traço ou sublinhado`);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ApiError(`A senha de "${login}" precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);
  }
  if (!role) throw new ApiError(`O Role de "${login}" precisa ser Trainer ou Student`);

  return withLock_(() => {
    delete tableCache_[SHEET.USERS];
    if (findUserByLogin_(login)) throw new ApiError(`Já existe o usuário "${login}"`);
    let trainerId = '';
    if (str_(account.treinador)) {
      const trainer = findUserByLogin_(account.treinador);
      if (!trainer || normalizeRole_(trainer.Role) !== 'trainer') {
        throw new ApiError(`Personal "${account.treinador}" não encontrado`);
      }
      trainerId = str_(trainer.ID_Usuario);
    }
    let id = `US-${login}`;
    if (findUserById_(id)) id = generateId_('US');
    const salt = Utilities.getUuid();
    const record = {
      ID_Usuario: id,
      Nome: name,
      Login: login,
      Role: role === 'trainer' ? 'Trainer' : 'Student',
      ID_Treinador: trainerId,
      Salt: salt,
      SenhaHash: hashPassword_(password, salt),
      CriadoEm: new Date().toISOString(),
    };
    appendRecords_(SHEET.USERS, [record]);
    return toUser_(record);
  });
}

/** Loads a user by ID and checks its role. `paramName` is only used in error messages. */
function requireUser_(id, role, paramName) {
  if (!str_(id)) throw new ApiError(`Falta o parâmetro "${paramName}"`);
  const row = findUserById_(id);
  if (!row) throw new ApiError(`Usuário "${id}" não encontrado`);
  const user = toUser_(row);
  if (role && user.role !== role) throw new ApiError(`O usuário "${id}" não é ${role === 'trainer' ? 'personal' : 'aluno'}`);
  return user;
}

function requireRole_(user, role) {
  if (user.role !== role) throw new ApiError(role === 'trainer' ? 'Só o personal pode fazer isso' : 'Só o aluno pode fazer isso');
}

/**
 * The student a request is about. Students only ever get themselves; trainers get a student
 * assigned to them, or one with no trainer yet (the same students their dashboard lists).
 */
function accessibleStudent_(user, studentId) {
  if (user.role === 'student') {
    if (str_(studentId) && !sameId_(studentId, user.id)) throw noAccessError_();
    return user;
  }
  const student = requireUser_(studentId, 'student', 'studentId');
  if (student.trainerId && student.trainerId !== user.id) throw noAccessError_();
  return student;
}

function noAccessError_() {
  return new ApiError('Você não tem acesso a este aluno');
}

// ===============================================================================================
// STUDENT ENDPOINTS
// ===============================================================================================

/**
 * POST acao=getStudentData, args [studentId]  (students may omit it: they always get themselves)
 * Data: { user, workouts: Workout[] (exercises nested, sorted by Ordem), schedule: { studentId, days } }
 */
function getStudentData_(user, studentId) {
  const student = accessibleStudent_(user, studentId);
  return {
    user: student,
    workouts: listWorkouts_(student.id),
    schedule: buildSchedule_(student.id),
  };
}

/**
 * POST acao=getWorkout, args [workoutId]
 * Data: { workout: Workout | null }   (null when no workout has that ID)
 */
function getWorkout_(user, workoutId) {
  if (!str_(workoutId)) throw new ApiError('Falta o parâmetro "workoutId"');
  const row = readTable_(SHEET.WORKOUTS).rows.find((r) => sameId_(r.ID_Treino, workoutId));
  if (!row) return { workout: null };
  accessibleStudent_(user, str_(row.ID_Usuario));
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
 * POST acao=saveWorkoutSession, args [session]  (students only; saved for the signed-in student)
 * session is the frontend's SessionRecord:
 * {
 *   "workoutId": "...", "date": "ISO (optional, defaults to now)", "durationSec": 3600,
 *   "exercises": [{ "exerciseId": "EX-..." | "exerciseName": "Back Squat", "sets": [{ "weight": 100, "reps": 5 }] }]
 * }
 * Each exercise is matched by exerciseId, else by name within the workout (then within the
 * student's other workouts). Volume_Total is recomputed server-side from the sets.
 * Data: { session: SessionRecord }
 */
function saveWorkoutSession_(user, session) {
  requireRole_(user, 'student');
  const input = session || {};
  const studentId = user.id;
  const exercises = input.exercises || [];
  if (!Array.isArray(exercises)) throw new ApiError('"exercises" precisa ser uma lista');

  // A workout that is not the student's own is ignored; it is then inferred from the exercises.
  let workoutId = str_(input.workoutId);
  const ownWorkout = readTable_(SHEET.WORKOUTS).rows.find((r) => sameId_(r.ID_Treino, workoutId));
  if (!ownWorkout || !sameId_(ownWorkout.ID_Usuario, studentId)) workoutId = '';
  const findExercise = exerciseResolver_(studentId, workoutId);
  const sessionId = generateId_('HS');
  const setRecords = [];

  exercises.forEach((ex, i) => {
    const name = str_(ex && (ex.exerciseName || ex.name));
    const match = findExercise(str_(ex && ex.exerciseId), name);
    if (!match && !name) throw new ApiError(`exercises[${i}] precisa de "exerciseId" ou "exerciseName"`);
    if (!Array.isArray(ex.sets)) throw new ApiError(`exercises[${i}].sets precisa ser uma lista`);
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
    // Only the student's own exercises count, whatever ID the client sends.
    if (exerciseId && byId[exerciseId] && studentWorkouts[str_(byId[exerciseId].ID_Treino)]) return byId[exerciseId];
    if (!name) return null;
    const key = name.toLowerCase();
    const sameName = planned.filter((r) => str_(r.Nome).toLowerCase() === key && studentWorkouts[str_(r.ID_Treino)]);
    return sameName.find((r) => workoutId && sameId_(r.ID_Treino, workoutId)) || sameName[0] || null;
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
    const name = plan ? str_(plan.Nome) : str_(r.Nome_Exercicio) || 'Exercício removido';
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
 * POST acao=getStudentStats, args [studentId]  (students may omit it)
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
function getStudentStats_(user, studentId) {
  const student = accessibleStudent_(user, studentId);
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
 * POST acao=getTrainerDashboard, args []  (trainers only; the trainer comes from the token)
 * Students are those whose Usuarios.ID_Treinador is this trainer, plus those with no trainer.
 * Data: {
 *   trainer: User,
 *   students: [User & { lastActivity, totalSessions, daysSinceLastSession,
 *               lastSession: { id, date, workoutId, workoutName, durationSec, totalVolume, exerciseCount, setCount } | null }]
 * }
 */
function getTrainerDashboard_(user) {
  requireRole_(user, 'trainer');
  const trainer = user;
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
  if (daysSince <= 0) return 'Treinou hoje';
  if (daysSince === 1) return 'Treinou ontem';
  return `Há ${daysSince} dias`;
}

/**
 * POST acao=saveWorkoutPlan, args [workout]  (trainers for their students; students for themselves)
 * workout is the frontend's Workout:
 * { "id"?: "TR-...", "studentId": "...", "name": "...", "description"?: "...",
 *   "exercises": [{ "id"?, "name", "sets", "reps": ["12", "10", "Até a falha"], "weight", "restSec",
 *                   "videoUrl"?, "notes"?, "rir"?, "muscleGroups"?: ["Peito"], "substitute"?,
 *                   "substituteVideoUrl"? }] }
 * `reps` may also be one string for every set ("8-12"), as older versions of the app send it.
 * An `id` that matches an existing Treinos row updates it; otherwise a new workout is created.
 * The workout's old Exercicios_Treino rows are always deleted and the list re-inserted (cascade).
 * Exercise IDs already belonging to this workout are kept so logged history stays linked.
 * Data: { workout: Workout, created: boolean }
 */
function saveWorkoutPlan_(user, workout) {
  const input = workout || {};
  const studentId = accessibleStudent_(user, str_(input.studentId)).id;
  const name = str_(input.name);
  if (!name) throw new ApiError('Informe o nome do treino');
  const exercises = input.exercises || [];
  if (!Array.isArray(exercises)) throw new ApiError('"exercises" precisa ser uma lista');
  exercises.forEach((ex, i) => {
    if (!str_(ex && ex.name)) throw new ApiError(`O exercício ${i + 1} está sem nome`);
  });

  const existing = str_(input.id)
    ? readTable_(SHEET.WORKOUTS).rows.find((r) => sameId_(r.ID_Treino, input.id))
    : null;
  // Editing someone else's workout requires access to its current owner too.
  if (existing) accessibleStudent_(user, str_(existing.ID_Usuario));
  const workoutId = existing ? str_(existing.ID_Treino) : generateId_('TR');
  const workoutRecord = {
    ID_Treino: workoutId,
    ID_Usuario: studentId,
    Nome_do_Treino: name,
    // "focus" is what versions before 2.1.0 called the description.
    Descricao: str_(input.description !== undefined ? input.description : input.focus),
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
    const reps = setReps_(ex.reps, Math.max(0, int_(ex.sets)));
    return {
      ID_Exercicio: id,
      ID_Treino: workoutId,
      Ordem: i + 1,
      Nome: str_(ex.name),
      Series: reps.length,
      Reps: repsCell_(reps),
      Carga_kg: Math.max(0, num_(ex.weight)),
      Descanso_seg: Math.max(0, int_(ex.restSec)),
      Link_Video: str_(ex.videoUrl),
      Anotacoes: str_(ex.notes),
      RIR_RPE: str_(ex.rir),
      Exercicio_Substituto: str_(ex.substitute),
      Grupo_Muscular: muscleGroups_(ex.muscleGroups).join(', '),
      Link_Video_Substituto: str_(ex.substituteVideoUrl),
    };
  });
  replaceRecords_(SHEET.EXERCISES, (r) => sameId_(r.ID_Treino, workoutId), exerciseRecords);

  return { workout: toWorkout_(workoutRecord, exerciseRecords), created: !existing };
}

/**
 * POST acao=updateWorkoutDescription, args [workoutId, description]  (same access as saveWorkoutPlan)
 * Changes only Treinos.Descricao, so the workout screen can edit it without resending the plan.
 * Data: { workout: Workout }
 */
function updateWorkoutDescription_(user, workoutId, description) {
  const row = requireWorkout_(user, workoutId);
  updateRecord_(SHEET.WORKOUTS, row, { Descricao: str_(description) });
  return getWorkout_(user, str_(row.ID_Treino));
}

/**
 * POST acao=updateExerciseRest, args [exerciseId, restSec]  (same access as saveWorkoutPlan)
 * Changes only Exercicios_Treino.Descanso_seg, so a student can adjust it mid-workout.
 * Data: { exercise: Exercise }
 */
function updateExerciseRest_(user, exerciseId, restSec) {
  const id = str_(exerciseId);
  if (!id) throw new ApiError('Falta o parâmetro "exerciseId"');
  const row = readTable_(SHEET.EXERCISES).rows.find((r) => sameId_(r.ID_Exercicio, id));
  if (!row) throw new ApiError(`Exercício "${id}" não encontrado`);
  requireWorkout_(user, str_(row.ID_Treino));
  const seconds = Math.max(0, int_(restSec));
  updateRecord_(SHEET.EXERCISES, row, { Descanso_seg: seconds });
  return { exercise: toExercise_(Object.assign({}, row, { Descanso_seg: seconds })) };
}

/** Loads a Treinos row the user may edit: their own (students) or one of their students' (trainers). */
function requireWorkout_(user, workoutId) {
  const id = str_(workoutId);
  if (!id) throw new ApiError('Falta o parâmetro "workoutId"');
  const row = readTable_(SHEET.WORKOUTS).rows.find((r) => sameId_(r.ID_Treino, id));
  if (!row) throw new ApiError(`Treino "${id}" não encontrado`);
  accessibleStudent_(user, str_(row.ID_Usuario));
  return row;
}

/**
 * POST acao=deleteWorkoutPlan, args [workoutId]  (trainers for their students; students for themselves)
 * Deletes the Treinos row, its Exercicios_Treino rows and any Agenda rows pointing to it
 * (those days fall back to rest). Workout history is kept.
 * Data: { workoutId, deletedExercises, clearedScheduleEntries }
 */
function deleteWorkoutPlan_(user, workoutId) {
  const id = str_(requireWorkout_(user, workoutId).ID_Treino);
  const matches = (r) => sameId_(r.ID_Treino, id);
  replaceRecords_(SHEET.WORKOUTS, matches, []);
  return {
    workoutId: id,
    deletedExercises: replaceRecords_(SHEET.EXERCISES, matches, []),
    clearedScheduleEntries: replaceRecords_(SHEET.SCHEDULE, matches, []),
  };
}

/**
 * POST acao=updateSchedule, args [schedule]  (trainers for their students; students for themselves)
 * schedule is the frontend's Schedule:
 * { "studentId": "...", "days": [{ "day": "Monday" | "dayNumber": 1, "type": "workout|cardio|rest",
 *                                  "workoutId"?: "TR-...", "label"?: "30 min bike" }] }
 * Only the days present in `days` are replaced; other days keep their current entries.
 * Sending two entries for the same day (e.g. workout + cardio) stores both.
 * Data: { schedule: { studentId, days } }
 */
function updateSchedule_(user, schedule) {
  const input = schedule || {};
  const studentId = accessibleStudent_(user, str_(input.studentId)).id;
  const days = input.days;
  if (!Array.isArray(days) || !days.length) throw new ApiError('"days" precisa ser uma lista com pelo menos um dia');

  const workouts = indexBy_(readTable_(SHEET.WORKOUTS).rows, (r) => str_(r.ID_Treino));
  const records = days.map((d, i) => {
    d = d || {};
    const rawDay = d.dayNumber !== undefined ? d.dayNumber : d.day;
    const dayNumber = dayNumber_(rawDay);
    if (!dayNumber) throw new ApiError(`days[${i}]: dia inválido "${str_(rawDay)}" (use 1 a 7, segunda = 1, ou o nome do dia em inglês)`);
    const type = normalizeActivity_(d.type);
    if (!hasOwn_(ACTIVITY_TO_SHEET, type)) throw new ApiError(`days[${i}]: tipo inválido "${str_(d.type)}" (use workout, cardio ou rest)`);

    let workoutId = '';
    if (type === 'workout') {
      workoutId = str_(d.workoutId);
      const workout = workouts[workoutId];
      if (!workout) throw new ApiError(`days[${i}]: treino "${workoutId}" não encontrado`);
      if (!sameId_(workout.ID_Usuario, studentId)) throw new ApiError(`days[${i}]: o treino "${workoutId}" é de outro aluno`);
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
// EDITOR FUNCTIONS: run by hand from the Apps Script editor (not exposed over HTTP)
// Pick the function in the toolbar and click Run. Results appear in the execution log.
// ===============================================================================================

/**
 * Creates the accounts. Edit the list, run this function once, then DELETE THE PASSWORDS from
 * the code: the spreadsheet only keeps their hash, and the app never needs them again.
 * role: 'Trainer' or 'Student'. treinador: the trainer's login (students only, optional).
 */
function cadastrarUsuarios() {
  const accounts = [
    { login: 'marcelo', senha: 'troque-esta-senha', nome: 'Marcelo', role: 'Trainer' },
    { login: 'aluno1', senha: 'troque-esta-senha', nome: 'Primeiro Aluno', role: 'Student', treinador: 'marcelo' },
  ];
  resetTableCache_();
  accounts.forEach((account) => {
    if (account.senha === 'troque-esta-senha') {
      console.log(`Pulei "${account.login}": troque a senha de exemplo antes de rodar.`);
      return;
    }
    try {
      const user = createUser_(account);
      console.log(`Criado ${user.role === 'trainer' ? 'o personal' : 'o aluno'} "${account.login}" (${user.name}), ID ${user.id}.`);
    } catch (err) {
      console.log(`Erro em "${account.login}": ${err.message}`);
    }
  });
}

/**
 * Sets a new password for an existing account (e.g. a forgotten one). Fill in the two values,
 * run once, then clear the password from the code. The account keeps its ID and all its data.
 */
function redefinirSenha() {
  const LOGIN = 'aluno1';
  const NOVA_SENHA = 'troque-esta-senha';
  if (NOVA_SENHA === 'troque-esta-senha') {
    console.log('Troque NOVA_SENHA antes de rodar.');
    return;
  }
  if (NOVA_SENHA.length < MIN_PASSWORD_LENGTH) {
    console.log(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    return;
  }
  resetTableCache_();
  const row = findUserByLogin_(LOGIN);
  if (!row) {
    console.log(`Usuário "${LOGIN}" não encontrado.`);
    return;
  }
  setPassword_(str_(row.ID_Usuario), NOVA_SENHA);
  CacheService.getScriptCache().remove('login-failures:' + normalizeLogin_(LOGIN));
  console.log(`Nova senha salva para "${LOGIN}".`);
}

/**
 * Creates any missing tab or column, bolds and freezes the header rows, formats non-numeric
 * columns as plain text and replaces any plain-text Senha left from older versions with
 * Salt + SenhaHash. Existing data is kept, so it is safe to run again at any time.
 */
function setupDatabase() {
  resetTableCache_();
  Object.keys(SCHEMA).forEach((name) => {
    const sheet = getSheet_(name);
    addMissingColumns_(sheet, name);
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map((h) => String(h).trim());
    sheet.getRange(1, 1, 1, lastCol).setFontWeight('bold');
    sheet.setFrozenRows(1);

    const maxRows = sheet.getMaxRows();
    const textColumns = [];
    headers.forEach((h, i) => {
      if (h && SCHEMA[name].numeric.indexOf(h) === -1) textColumns.push(columnRangeA1_(i + 1, 2, maxRows));
    });
    if (maxRows > 1 && textColumns.length) sheet.getRangeList(textColumns).setNumberFormat('@');
    console.log(`${name}: ok`);
  });
  const migrated = migratePlainTextPasswords_();
  console.log(`${migrated} senha(s) em texto puro trocada(s) por hash.`);
}

/** Hashes every legacy plain-text Senha and blanks it. Returns how many were converted. */
function migratePlainTextPasswords_() {
  resetTableCache_();
  const pending = readTable_(SHEET.USERS).rows.filter((r) => str_(r.Senha) && !str_(r.SenhaHash));
  pending.forEach((r) => setPassword_(str_(r.ID_Usuario), str_(r.Senha)));
  return pending.length;
}

/**
 * Fills an empty database with one trainer, one student, two workouts and a weekly schedule,
 * so the API can be tested right after deploying. Does nothing if Usuarios already has users.
 *   Trainer login: coach / coach123     Student login: aluno / aluno123
 */
function seedDemoData() {
  setupDatabase();
  if (readTable_(SHEET.USERS).rows.length) {
    console.log('A aba Usuarios já tem dados; o exemplo não foi criado.');
    return;
  }
  const coach = createUser_({ login: 'coach', senha: 'coach123', nome: 'Alex Moreira', role: 'Trainer' });
  const student = createUser_({ login: 'aluno', senha: 'aluno123', nome: 'Aluno Demo', role: 'Student', treinador: 'coach' });

  const push = saveWorkoutPlan_(coach, {
    studentId: student.id,
    name: 'Treino A - Peito e Ombros',
    description: 'Superiores (empurrar). Aqueça os ombros antes do supino.',
    exercises: [
      { name: 'Supino reto com barra', sets: 4, reps: '8', weight: 80, restSec: 120, rir: 'RIR 2',
        muscleGroups: ['Peito', 'Tríceps'], videoUrl: 'https://www.youtube.com/watch?v=rT7DgCr-3pg',
        substitute: 'Supino reto com halteres', notes: 'Peito aberto e escápulas retraídas.' },
      { name: 'Supino inclinado com halteres', sets: 3, reps: '8-10', weight: 28, restSec: 90, muscleGroups: ['Peito', 'Ombros'] },
      { name: 'Tríceps na polia', sets: 3, reps: ['15', '12', FAILURE_REPS], weight: 30, restSec: 60, muscleGroups: ['Tríceps'] },
    ],
  }).workout;
  const legs = saveWorkoutPlan_(coach, {
    studentId: student.id,
    name: 'Treino B - Pernas',
    description: 'Inferiores',
    exercises: [
      { name: 'Agachamento livre', sets: 5, reps: '5', weight: 100, restSec: 180, rir: 'RPE 8',
        muscleGroups: ['Quadríceps', 'Glúteos'], videoUrl: 'https://www.youtube.com/watch?v=ultWZbUMPL8' },
      { name: 'Levantamento terra romeno', sets: 3, reps: '10', weight: 70, restSec: 120, muscleGroups: ['Posterior'] },
    ],
  }).workout;

  updateSchedule_(coach, {
    studentId: student.id,
    days: [
      { day: 'Monday', type: 'workout', workoutId: push.id },
      { day: 'Tuesday', type: 'cardio', label: '30 min de bike (zona 2)' },
      { day: 'Wednesday', type: 'workout', workoutId: legs.id },
      { day: 'Thursday', type: 'rest' },
      { day: 'Friday', type: 'workout', workoutId: push.id },
      { day: 'Saturday', type: 'cardio', label: '45 min de corrida' },
      { day: 'Sunday', type: 'rest' },
    ],
  });
  SpreadsheetApp.flush();
  console.log(`Criados o personal ${coach.id} e o aluno ${student.id}.`);
}

// ===============================================================================================
// DATA LAYER: whole-sheet reads, bulk writes with setValues, casting and ID helpers
// ===============================================================================================

// Per-request memo of parsed sheets; reset at the start of every request and after each write.
let tableCache_ = {};

function resetTableCache_() {
  tableCache_ = {};
}

/** Returns the tab, creating it with its header row the first time it is needed. */
function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return (
    ss.getSheetByName(name) ||
    withLock_(() => {
      let sheet = ss.getSheetByName(name);
      if (!sheet) {
        sheet = ss.insertSheet(name);
        const columns = SCHEMA[name].columns;
        sheet.getRange(1, 1, 1, columns.length).setValues([columns]).setFontWeight('bold');
        sheet.setFrozenRows(1);
      }
      return sheet;
    })
  );
}

/** Appends any schema column missing from row 1 (a sheet from an older version, or made by hand). */
function addMissingColumns_(sheet, name) {
  withLock_(() => {
    const lastCol = sheet.getLastColumn();
    const headers = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map((h) => String(h).trim()) : [];
    const missing = SCHEMA[name].columns.filter((c) => headers.indexOf(c) === -1);
    if (!missing.length) return;
    const needed = headers.length + missing.length;
    if (needed > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), needed - sheet.getMaxColumns());
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
  });
}

/**
 * Returns { name, sheet, headers, rows, lastRow }. Each row object has one key per header plus
 * __rowNumber (1-based sheet row) and __raw (the original cell array), used for in-place writes.
 */
function readTable_(name) {
  if (tableCache_[name]) return tableCache_[name];
  const sheet = getSheet_(name);
  let values = sheet.getDataRange().getValues();
  let headers = values[0].map((h) => String(h).trim());
  if (SCHEMA[name].columns.some((c) => headers.indexOf(c) === -1)) {
    addMissingColumns_(sheet, name);
    values = sheet.getDataRange().getValues();
    headers = values[0].map((h) => String(h).trim());
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

/**
 * One target per set, from the API's list or from the Reps column. "12; 10; Até a falha" lists each
 * set; a single value ("12", "8-12") is every set's. `sets` says how many there are: missing
 * values repeat the last one and extra ones are dropped. With no `sets`, there is one per value.
 */
function setReps_(value, sets) {
  let list;
  if (Array.isArray(value)) list = value.map(normalizeReps_);
  else list = str_(value) ? str_(value).split(REPS_SEPARATOR).map(normalizeReps_) : [];
  const count = sets > 0 ? sets : list.length;
  return Array.from({ length: count }, (_, i) => (list.length ? list[Math.min(i, list.length - 1)] : ''));
}

/** The Reps cell for a list of targets: "12" when every set is the same, else "12; 10; Até a falha". */
function repsCell_(reps) {
  if (reps.every((r) => r === reps[0])) return reps[0] || '';
  return reps.join(REPS_SEPARATOR + ' ');
}

/** "falha", "F", "até a falha" or "failure", in any case, become FAILURE_REPS; the rest stays as typed. */
function normalizeReps_(value) {
  const s = str_(value);
  return /^((at[eé]\s+a\s+)?falha|f|failure)$/i.test(s) ? FAILURE_REPS : s;
}

/** Grupo_Muscular holds "Peito, Tríceps"; the API uses ["Peito", "Tríceps"]. Accepts either. */
function muscleGroups_(value) {
  const list = Array.isArray(value) ? value.map(str_) : str_(value).split(/[,;]/).map(str_);
  return list.filter((g, i) => g && list.indexOf(g) === i);
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

/** Whitelisted fields only: Login, Salt, SenhaHash and any legacy Senha are never serialized. */
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
  const reps = setReps_(row.Reps, int_(row.Series));
  const muscleGroups = muscleGroups_(row.Grupo_Muscular);
  return {
    id: str_(row.ID_Exercicio),
    order: int_(row.Ordem),
    name: str_(row.Nome),
    sets: reps.length,
    reps: reps,
    weight: num_(row.Carga_kg),
    restSec: int_(row.Descanso_seg),
    videoUrl: optStr_(row.Link_Video),
    notes: optStr_(row.Anotacoes),
    rir: optStr_(row.RIR_RPE),
    muscleGroups: muscleGroups.length ? muscleGroups : undefined,
    substitute: optStr_(row.Exercicio_Substituto),
    substituteVideoUrl: optStr_(row.Link_Video_Substituto),
  };
}

function toWorkout_(row, exerciseRows) {
  return {
    id: str_(row.ID_Treino),
    name: str_(row.Nome_do_Treino),
    studentId: str_(row.ID_Usuario),
    description: optStr_(row.Descricao),
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
