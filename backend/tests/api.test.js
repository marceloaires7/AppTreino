'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createGas } = require('./gas-mock');

const PRD_HEADERS = {
  Usuarios: ['ID_Usuario', 'Nome', 'Login', 'Senha', 'Role'],
  Treinos: ['ID_Treino', 'ID_Usuario', 'Nome_do_Treino', 'Descricao'],
  Exercicios_Treino: [
    'ID_Exercicio', 'ID_Treino', 'Ordem', 'Nome', 'Series', 'Reps', 'Carga_kg', 'Descanso_seg',
    'Link_Video', 'Anotacoes', 'RIR_RPE', 'Exercicio_Substituto',
  ],
  Agenda: ['ID_Agenda', 'ID_Usuario', 'Dia_Semana', 'Tipo_Atividade', 'ID_Treino'],
  Historico_Execucao: ['ID_Historico', 'ID_Usuario', 'Data', 'Tempo_Duracao_seg', 'Volume_Total'],
  Historico_Series: ['ID_Historico', 'ID_Exercicio', 'Serie_Num', 'Reps_Feitas', 'Carga_Usada'],
};

function ok(res) {
  assert.equal(res.ok, true, `expected ok, got: ${res.erro}`);
  return res.dados;
}

function fail(res, pattern, code) {
  assert.equal(res.ok, false, 'expected an error');
  assert.match(res.erro, pattern);
  if (code !== undefined) assert.equal(res.codigo, code);
}

const token = (gas, login, password) => ok(gas.call('login', [login, password])).token;

/** Seeded database: coach (trainer) and aluno (student) with Push/Legs workouts and a full week. */
function seeded() {
  const gas = createGas();
  gas.context.seedDemoData();
  const coach = token(gas, 'coach', 'coach123');
  const aluno = token(gas, 'aluno', 'aluno123');
  const data = ok(gas.call('getStudentData', [], aluno));
  const push = data.workouts.find((w) => w.name.startsWith('Push'));
  const legs = data.workouts.find((w) => w.name.startsWith('Legs'));
  return { gas, coach, aluno, push, legs };
}

/** Adds accounts through the same code path as the editor's cadastrarUsuarios(). */
function addUsers(gas, accounts) {
  gas.context.resetTableCache_();
  accounts.forEach((a) => gas.context.createUser_(a));
}

/** Signs a token payload with the deployment's real secret, as createToken_ does. */
function signToken(gas, payload) {
  const encoded = Buffer.from(payload, 'utf8').toString('base64url');
  return `${encoded}.${crypto.createHmac('sha256', gas.props.SEGREDO_TOKEN).update(encoded).digest('hex')}`;
}

function squatSession(legs, weight, date) {
  return {
    workoutId: legs.id,
    date,
    durationSec: 3600,
    totalVolume: 999999, // the server must ignore this and recompute
    exercises: [
      { exerciseName: 'Back Squat', sets: [{ weight, reps: 5 }, { weight, reps: 5 }, { weight: weight + 5, reps: 3 }] },
      { exerciseName: 'Romanian Deadlift', sets: [{ weight: 70, reps: 10 }] },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------------------------

test('setupDatabase creates every tab and column, formats text columns and is idempotent', () => {
  const gas = createGas();
  gas.context.setupDatabase();
  gas.context.setupDatabase();
  for (const [name, prd] of Object.entries(PRD_HEADERS)) {
    const row1 = gas.sheet(name).getRange(1, 1, 1, gas.sheet(name).getLastColumn()).getValues()[0];
    for (const column of prd.filter((c) => c !== 'Senha')) assert.ok(row1.includes(column), `${name}.${column}`);
  }
  const users = gas.sheet('Usuarios').getRange(1, 1, 1, gas.sheet('Usuarios').getLastColumn()).getValues()[0];
  assert.deepEqual(users, ['ID_Usuario', 'Nome', 'Login', 'Role', 'ID_Treinador', 'Salt', 'SenhaHash', 'CriadoEm']);
  assert.ok(!users.includes('Senha'), 'new sheets have no plain-text password column');
  assert.equal(gas.sheet('Usuarios').formats.get('2,3'), '@', 'Login column is plain text');
  assert.equal(gas.sheet('Exercicios_Treino').formats.get('2,7'), undefined, 'Carga_kg stays numeric');
});

test('tabs and columns are created on first use, without running setupDatabase', () => {
  const gas = createGas();
  fail(gas.call('login', ['nobody', 'whatever']), /^Invalid credentials$/);
  assert.ok(gas.sheet('Usuarios'), 'Usuarios was created by the login');

  // A PRD-era tab gains the new columns and keeps its data.
  const old = createGas({ newSheetRows: 1000 });
  old.ss.addTable('Usuarios', PRD_HEADERS.Usuarios, [['1', 'Old Coach', 'coach', 'secret1', 'Trainer']]);
  assert.equal(ok(old.call('login', ['coach', 'secret1'])).user.id, '1');
  const headers = old.sheet('Usuarios').getRange(1, 1, 1, old.sheet('Usuarios').getLastColumn()).getValues()[0];
  assert.deepEqual(headers, [...PRD_HEADERS.Usuarios, 'ID_Treinador', 'Salt', 'SenhaHash', 'CriadoEm']);
});

// ---------------------------------------------------------------------------------------------
// Passwords, login and tokens
// ---------------------------------------------------------------------------------------------

test('passwords are stored only as salted, peppered hashes', () => {
  const { gas } = seeded();
  addUsers(gas, [
    { login: 'ana', senha: 'same-password', nome: 'Ana', role: 'Student' },
    { login: 'bia', senha: 'same-password', nome: 'Bia', role: 'Student' },
  ]);
  const rows = gas.sheet('Usuarios').records();
  const dump = JSON.stringify(rows);
  for (const secret of ['coach123', 'aluno123', 'same-password']) assert.ok(!dump.includes(secret), `${secret} in sheet`);
  for (const r of rows) {
    assert.match(r.SenhaHash, /^[0-9a-f]{64}$/);
    assert.match(r.Salt, /^[0-9a-f-]{36}$/);
  }
  const [ana, bia] = ['ana', 'bia'].map((l) => rows.find((r) => r.Login === l));
  assert.notEqual(ana.SenhaHash, bia.SenhaHash, 'same password, different salt, different hash');
  assert.ok(gas.props.PEPPER_SENHA && !dump.includes(gas.props.PEPPER_SENHA), 'pepper lives outside the sheet');
});

test('login returns a token and the user, never secrets', () => {
  const { gas } = seeded();
  const res = gas.call('login', ['Coach', 'coach123']);
  const data = ok(res);
  assert.match(data.token, /^[A-Za-z0-9_-]+={0,2}\.[0-9a-f]{64}$/);
  assert.ok(data.expiresAt > Date.now() + 29 * 864e5);
  assert.deepEqual(data.user, { id: 'US-coach', name: 'Coach Alex Moreira', role: 'trainer', initials: 'CM' });
  for (const word of ['coach123', 'Salt', 'SenhaHash', 'Senha']) assert.ok(!JSON.stringify(res).includes(word), word);

  fail(gas.call('login', ['coach', 'wrong']), /^Invalid credentials$/);
  fail(gas.call('login', ['nobody', 'coach123']), /^Invalid credentials$/);
  fail(gas.call('login', ['coach']), /Enter your login and password/);
});

test('five wrong passwords lock that login for 15 minutes', () => {
  const { gas } = seeded();
  for (let i = 0; i < 4; i++) fail(gas.call('login', ['aluno', 'nope']), /Invalid credentials/);
  ok(gas.call('login', ['aluno', 'aluno123'])); // a success resets the counter
  for (let i = 0; i < 5; i++) fail(gas.call('login', ['aluno', 'nope']), /Invalid credentials/);
  fail(gas.call('login', ['aluno', 'aluno123']), /Too many attempts/);
  ok(gas.call('login', ['coach', 'coach123'])); // other logins are unaffected
  gas.expireCache();
  ok(gas.call('login', ['aluno', 'aluno123']));
});

test('only a valid, unexpired token signed by this deployment is accepted', () => {
  const { gas, aluno } = seeded();
  ok(gas.call('getStudentData', [], aluno));
  const SESSION = 'SESSAO_INVALIDA';
  fail(gas.call('getStudentData', []), /session has expired/, SESSION);
  fail(gas.call('getStudentData', [], 'garbage'), /session has expired/, SESSION);
  fail(gas.call('getStudentData', [], 'a.b.c'), /session has expired/, SESSION);

  // Swapping the user inside the payload breaks the signature.
  const [payload, signature] = aluno.split('.');
  const forgedPayload = Buffer.from(Buffer.from(payload, 'base64url').toString().replace('US-aluno', 'US-coach')).toString('base64url');
  fail(gas.call('getTrainerDashboard', [], `${forgedPayload}.${signature}`), /session/, SESSION);

  // Signed with another secret, or expired.
  const otherDeployment = `${forgedPayload}.${crypto.createHmac('sha256', 'other').update(forgedPayload).digest('hex')}`;
  fail(gas.call('getTrainerDashboard', [], otherDeployment), /session/, SESSION);
  fail(gas.call('getStudentData', [], signToken(gas, `US-aluno|${Date.now() - 1000}`)), /session/, SESSION);
  ok(gas.call('getStudentData', [], signToken(gas, `US-aluno|${Date.now() + 60000}`)));

  // An account deleted after signing in loses its sessions.
  const sheet = gas.sheet('Usuarios');
  const rowNumber = sheet.records().findIndex((r) => r.Login === 'aluno') + 2;
  sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).clearContent();
  fail(gas.call('getStudentData', [], aluno), /session/, SESSION);
});

test('plain-text passwords from older sheets are hashed on first login or by setupDatabase', () => {
  const gas = createGas({ newSheetRows: 1000 });
  gas.ss.addTable('Usuarios', [...PRD_HEADERS.Usuarios, 'ID_Treinador'], [
    ['US-t', 'Trainer', 'coach', 'coach123', 'Trainer', ''],
    ['US-s', 'Student', 'aluno', 1234, 'Student', 'US-t'], // typed as a number in the sheet
  ]);
  fail(gas.call('login', ['coach', 'wrong']), /Invalid credentials/);
  ok(gas.call('login', ['coach', 'coach123']));
  let coach = gas.sheet('Usuarios').records().find((r) => r.Login === 'coach');
  assert.equal(coach.Senha, '', 'plain text removed');
  assert.match(coach.SenhaHash, /^[0-9a-f]{64}$/);
  ok(gas.call('login', ['coach', 'coach123'])); // now checked against the hash

  gas.context.setupDatabase();
  const aluno = gas.sheet('Usuarios').records().find((r) => r.Login === 'aluno');
  assert.equal(aluno.Senha, '');
  assert.match(aluno.SenhaHash, /^[0-9a-f]{64}$/);
  ok(gas.call('login', ['aluno', '1234']));
});

test('changePassword needs the current password and replaces the hash', () => {
  const { gas, aluno } = seeded();
  fail(gas.call('changePassword', ['wrong', 'new-password'], aluno), /current password is incorrect/);
  fail(gas.call('changePassword', ['aluno123', '123'], aluno), /at least 6 characters/);
  assert.deepEqual(ok(gas.call('changePassword', ['aluno123', 'new-password'], aluno)), { changed: true });
  fail(gas.call('login', ['aluno', 'aluno123']), /Invalid credentials/);
  ok(gas.call('login', ['aluno', 'new-password']));
  ok(gas.call('getStudentData', [], aluno)); // existing sessions stay valid
});

test('createUser_ validates accounts and links students to their trainer', () => {
  const { gas } = seeded();
  const create = (a) => {
    gas.context.resetTableCache_();
    try {
      gas.context.createUser_(a);
      return 'created';
    } catch (err) {
      return err.message;
    }
  };
  assert.match(create({ login: 'A B', senha: 'secret1', role: 'Student' }), /3-30 characters/);
  assert.match(create({ login: 'short', senha: '123', role: 'Student' }), /at least 6/);
  assert.match(create({ login: 'norole', senha: 'secret1', role: 'Admin' }), /Trainer or Student/);
  assert.match(create({ login: 'COACH', senha: 'secret1', role: 'Trainer' }), /already exists/);
  assert.match(create({ login: 'orphan', senha: 'secret1', role: 'Student', treinador: 'ghost' }), /Trainer "ghost" not found/);
  assert.equal(create({ login: 'maria', senha: 'secret1', nome: 'Maria', role: 'Student', treinador: 'coach' }), 'created');
  const maria = gas.sheet('Usuarios').records().find((r) => r.Login === 'maria');
  assert.equal(maria.ID_Usuario, 'US-maria');
  assert.equal(maria.ID_Treinador, 'US-coach');

  // The editor function refuses its placeholder passwords.
  const before = gas.sheet('Usuarios').records().length;
  gas.context.cadastrarUsuarios();
  assert.equal(gas.sheet('Usuarios').records().length, before);
});

// ---------------------------------------------------------------------------------------------
// Access rules: the user always comes from the token
// ---------------------------------------------------------------------------------------------

test('students only reach their own data and cannot use trainer actions', () => {
  const { gas, aluno, coach, push } = seeded();
  addUsers(gas, [{ login: 'other', senha: 'secret1', nome: 'Other', role: 'Student', treinador: 'coach' }]);
  const theirWorkout = ok(gas.call('saveWorkoutPlan', [{ studentId: 'US-other', name: 'Theirs', exercises: [] }], coach)).workout;

  fail(gas.call('getStudentData', ['US-other'], aluno), /no access|do not have access/);
  fail(gas.call('getStudentStats', ['US-other'], aluno), /do not have access/);
  fail(gas.call('getWorkout', [theirWorkout.id], aluno), /do not have access/);
  assert.equal(ok(gas.call('getWorkout', [push.id], aluno)).workout.id, push.id);
  assert.equal(ok(gas.call('getStudentData', ['US-aluno'], aluno)).user.id, 'US-aluno');

  fail(gas.call('getTrainerDashboard', [], aluno), /Only trainers/);
  fail(gas.call('saveWorkoutPlan', [{ studentId: 'US-aluno', name: 'Mine' }], aluno), /Only trainers/);
  fail(gas.call('deleteWorkoutPlan', [push.id], aluno), /Only trainers/);
  fail(gas.call('updateSchedule', [{ studentId: 'US-aluno', days: [{ day: 1, type: 'rest' }] }], aluno), /Only trainers/);

  // Sessions are always saved for the token's student, whatever the payload says.
  const saved = ok(gas.call('saveWorkoutSession', [{ studentId: 'US-other', workoutId: theirWorkout.id, durationSec: 60, exercises: [] }], aluno)).session;
  assert.equal(saved.studentId, 'US-aluno');
  assert.equal(saved.workoutId, undefined, "another student's workout is not linked");
});

test('trainers reach their own and unassigned students, not other trainers\' students', () => {
  const { gas, coach, aluno, push } = seeded();
  addUsers(gas, [
    { login: 'coach2', senha: 'secret1', nome: 'Other Coach', role: 'Trainer' },
    { login: 'theirs', senha: 'secret1', nome: 'Their Student', role: 'Student', treinador: 'coach2' },
    { login: 'free', senha: 'secret1', nome: 'Unassigned', role: 'Student' },
  ]);
  const coach2 = token(gas, 'coach2', 'secret1');

  ok(gas.call('getStudentData', ['US-aluno'], coach));
  ok(gas.call('getStudentData', ['US-free'], coach));
  fail(gas.call('getStudentData', ['US-theirs'], coach), /do not have access/);
  fail(gas.call('getStudentStats', ['US-aluno'], coach2), /do not have access/);
  fail(gas.call('getWorkout', [push.id], coach2), /do not have access/);
  fail(gas.call('saveWorkoutPlan', [{ studentId: 'US-theirs', name: 'X' }], coach), /do not have access/);
  fail(gas.call('deleteWorkoutPlan', [push.id], coach2), /do not have access/);
  fail(gas.call('updateSchedule', [{ studentId: 'US-aluno', days: [{ day: 1, type: 'rest' }] }], coach2), /do not have access/);
  // Moving another trainer's workout to one of your students is refused too.
  fail(gas.call('saveWorkoutPlan', [{ id: push.id, studentId: 'US-theirs', name: 'Hijack' }], coach2), /do not have access/);
  fail(gas.call('getStudentData', [], coach), /studentId/);
  fail(gas.call('saveWorkoutSession', [{ exercises: [] }], coach), /Only students/);
  ok(gas.call('getStudentData', [], aluno));
});

// ---------------------------------------------------------------------------------------------
// Data endpoints
// ---------------------------------------------------------------------------------------------

test('getStudentData nests workouts, exercises and a full 7-day schedule', () => {
  const { gas, aluno, coach, push, legs } = seeded();
  const data = ok(gas.call('getStudentData', [], aluno));

  assert.equal(data.user.id, 'US-aluno');
  assert.equal(data.user.trainerId, 'US-coach');
  assert.equal(data.workouts.length, 2);
  assert.equal(push.focus, 'Upper push');
  assert.deepEqual(push.exercises.map((e) => e.order), [1, 2, 3]);

  const bench = push.exercises[0];
  assert.equal(bench.name, 'Barbell Bench Press');
  assert.strictEqual(bench.sets, 4);
  assert.strictEqual(bench.weight, 80);
  assert.strictEqual(bench.restSec, 120);
  assert.strictEqual(bench.reps, '8');
  assert.equal(bench.substitute, 'Dumbbell Bench Press');
  assert.strictEqual(push.exercises[1].reps, '8-10', 'rep ranges survive as text');
  assert.ok(!('videoUrl' in push.exercises[1]), 'blank optional fields are omitted');

  const days = data.schedule.days;
  assert.deepEqual(days.map((d) => d.day), ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
  assert.deepEqual(days[0], { day: 'Monday', dayNumber: 1, type: 'workout', workoutId: push.id, workoutName: push.name });
  assert.deepEqual(days[1], { day: 'Tuesday', dayNumber: 2, type: 'cardio', label: '30 min zone 2 bike' });
  assert.equal(days[2].workoutId, legs.id);
  assert.equal(days[6].type, 'rest');

  assert.deepEqual(ok(gas.call('getWorkout', [push.id], aluno)).workout, push);
  assert.equal(ok(gas.call('getWorkout', ['nope'], coach)).workout, null);
  fail(gas.call('getWorkout', [], aluno), /workoutId/);
});

test('values typed as text in the sheet are cast to numbers (including pt-BR decimals)', () => {
  const { gas, aluno, push } = seeded();
  const sheet = gas.sheet('Exercicios_Treino');
  const rowNumber = sheet.records().findIndex((r) => r.ID_Exercicio === push.exercises[0].id) + 2;
  sheet.setRaw(rowNumber, 5, ' 4 '); // Series
  sheet.setRaw(rowNumber, 7, '82,5'); // Carga_kg
  sheet.setRaw(rowNumber, 8, '1.234,0'); // Descanso_seg
  const bench = ok(gas.call('getStudentData', [], aluno)).workouts.find((w) => w.id === push.id).exercises[0];
  assert.strictEqual(bench.sets, 4);
  assert.strictEqual(bench.weight, 82.5);
  assert.strictEqual(bench.restSec, 1234);
});

test('saveWorkoutPlan creates, then updates with cascade and stable exercise IDs', () => {
  const { gas, coach, push } = seeded();
  const exercisesBefore = gas.sheet('Exercicios_Treino').records().length;

  const created = ok(gas.call('saveWorkoutPlan', [{
    id: 'w-1712345678',
    studentId: 'US-aluno',
    name: 'Pull B',
    focus: 'Upper pull',
    exercises: [
      { id: 'ex-tmp1', name: 'Deadlift', sets: '4', reps: '5', weight: '120', restSec: 180 },
      { id: 'ex-tmp2', name: 'Pull-Up', sets: 4, reps: '8', weight: 0, restSec: 120 },
    ],
  }], coach));
  assert.equal(created.created, true);
  assert.match(created.workout.id, /^TR-[0-9a-f]{12}$/);
  assert.ok(created.workout.exercises.every((e) => /^EX-/.test(e.id)));
  assert.strictEqual(created.workout.exercises[0].sets, 4);
  assert.strictEqual(created.workout.exercises[0].weight, 120);

  const bench = push.exercises[0];
  const updated = ok(gas.call('saveWorkoutPlan', [{
    id: push.id,
    studentId: 'US-aluno',
    name: 'Push A v2',
    exercises: [{ id: 'ex-new', name: 'Dips', sets: 3, reps: '10', weight: 0, restSec: 90 }, { ...bench, weight: 85 }],
  }], coach));
  assert.equal(updated.created, false);
  assert.equal(updated.workout.id, push.id);
  assert.equal(updated.workout.exercises[1].id, bench.id, 'existing exercise keeps its ID');
  assert.notEqual(updated.workout.exercises[0].id, 'ex-new');

  const rows = gas.sheet('Exercicios_Treino').records();
  assert.equal(rows.filter((r) => r.ID_Treino === push.id).length, 2, 'old exercises were removed');
  assert.equal(rows.length, exercisesBefore + 2 - 1);
  assert.equal(gas.sheet('Treinos').records().find((r) => r.ID_Treino === push.id).Nome_do_Treino, 'Push A v2');

  fail(gas.call('saveWorkoutPlan', [{ studentId: 'US-aluno', exercises: [] }], coach), /name/);
  fail(gas.call('saveWorkoutPlan', [{ studentId: 'US-aluno', name: 'X', exercises: [{ sets: 3 }] }], coach), /exercises\[0\]/);
  fail(gas.call('saveWorkoutPlan', [{ studentId: 'US-coach', name: 'X' }], coach), /not a student/);
});

test('saveWorkoutSession accepts the frontend SessionRecord and bulk-inserts the sets', () => {
  const { gas, aluno, legs } = seeded();
  const seriesSheet = gas.sheet('Historico_Series');
  const callsBefore = seriesSheet.setValuesCalls;

  const session = ok(gas.call('saveWorkoutSession', [squatSession(legs, 100, '2026-09-20T12:00:00.000Z')], aluno)).session;

  assert.equal(seriesSheet.setValuesCalls - callsBefore, 1, 'all sets written with one setValues');
  assert.match(session.id, /^HS-/);
  assert.equal(session.studentId, 'US-aluno');
  assert.equal(session.workoutId, legs.id);
  assert.equal(session.workoutName, legs.name);
  assert.strictEqual(session.totalVolume, 100 * 5 * 2 + 105 * 3 + 70 * 10);
  assert.equal(session.exercises[0].exerciseId, legs.exercises[0].id, 'resolved by name');

  const header = gas.sheet('Historico_Execucao').records()[0];
  assert.strictEqual(header.Volume_Total, 2015);
  assert.equal(header.Data, '2026-09-20T12:00:00.000Z');
  assert.equal(seriesSheet.records().length, 4);
  assert.ok(gas.stats.locks > 0 && gas.stats.locks === gas.stats.releases, 'writes run under a released lock');
  fail(gas.call('saveWorkoutSession', [{ exercises: [{ sets: [] }] }], aluno), /exerciseName/);

  // Many sets grow the sheet beyond its initial size.
  const sets = Array.from({ length: 40 }, (_, i) => ({ weight: 60 + i, reps: 5 }));
  ok(gas.call('saveWorkoutSession', [{ workoutId: legs.id, durationSec: 10, exercises: [{ exerciseId: legs.exercises[0].id, sets }] }], aluno));
  assert.equal(seriesSheet.records().length, 44);
});

test('getStudentStats aggregates history into chart-ready series', () => {
  const { gas, aluno, coach, legs } = seeded();
  ok(gas.call('saveWorkoutSession', [squatSession(legs, 105, '2026-09-15T12:00:00.000Z')], aluno));
  ok(gas.call('saveWorkoutSession', [squatSession(legs, 100, '2026-09-08T12:00:00.000Z')], aluno));

  const stats = ok(gas.call('getStudentStats', [], aluno));
  assert.equal(stats.summary.totalSessions, 2);
  assert.deepEqual(stats.history.map((h) => h.date), ['2026-09-08T12:00:00.000Z', '2026-09-15T12:00:00.000Z']);
  const squat = stats.exerciseProgress.find((e) => e.exerciseName === 'Back Squat');
  assert.deepEqual(squat.data.map((d) => d.topWeight), [105, 110]);
  assert.deepEqual(squat.personalRecord, { weight: 110, date: '2026-09-15T12:00:00.000Z' });
  assert.strictEqual(squat.data[0].estimated1RM, 116.7); // 100 * (1 + 5/30), beats 105 * (1 + 3/30)
  assert.deepEqual(ok(gas.call('getStudentStats', ['US-aluno'], coach)).summary, stats.summary, 'the trainer sees the same');
});

test('getTrainerDashboard lists the trainer\'s students with their latest session', () => {
  const { gas, coach, aluno, legs } = seeded();
  addUsers(gas, [
    { login: 'coach2', senha: 'secret1', nome: 'Other Coach', role: 'Trainer' },
    { login: 'bianca', senha: 'secret1', nome: 'Bianca Ferraz', role: 'Student', treinador: 'coach2' },
    { login: 'free', senha: 'secret1', nome: 'Unassigned Student', role: 'Student' },
  ]);
  ok(gas.call('saveWorkoutSession', [squatSession(legs, 100, '2026-01-01T12:00:00.000Z')], aluno));
  ok(gas.call('saveWorkoutSession', [squatSession(legs, 105, new Date().toISOString())], aluno));

  const data = ok(gas.call('getTrainerDashboard', [], coach));
  assert.equal(data.trainer.id, 'US-coach');
  assert.deepEqual(data.students.map((s) => s.id), ['US-aluno', 'US-free']);
  const student = data.students[0];
  assert.equal(student.totalSessions, 2);
  assert.equal(student.lastActivity, 'Trained today');
  assert.equal(student.lastSession.workoutName, legs.name);
  assert.equal(student.lastSession.setCount, 4);
  assert.equal(data.students[1].lastSession, null);
  assert.ok(!/Senha|Salt|coach123/.test(JSON.stringify(data)));
});

test('updateSchedule replaces only the days sent and validates workouts', () => {
  const { gas, coach, push, legs } = seeded();
  const schedule = ok(gas.call('updateSchedule', [{
    studentId: 'US-aluno',
    days: [{ day: 'Tuesday', type: 'workout', workoutId: legs.id }, { dayNumber: 7, type: 'cardio', label: 'Walk' }],
  }], coach)).schedule;
  assert.equal(schedule.days[0].workoutId, push.id, 'Monday untouched');
  assert.deepEqual(schedule.days[1], { day: 'Tuesday', dayNumber: 2, type: 'workout', workoutId: legs.id, workoutName: legs.name });
  assert.deepEqual(schedule.days[6], { day: 'Sunday', dayNumber: 7, type: 'cardio', label: 'Walk' });
  assert.equal(gas.sheet('Agenda').records().length, 7, 'rows replaced, not duplicated');

  addUsers(gas, [{ login: 'other', senha: 'secret1', nome: 'Other', role: 'Student', treinador: 'coach' }]);
  const bad = (days) => gas.call('updateSchedule', [{ studentId: 'US-aluno', days }], coach);
  fail(bad([{ day: 'Funday', type: 'rest' }]), /invalid day/);
  fail(bad([{ day: 1, type: 'swim' }]), /invalid type/);
  fail(bad([{ day: 1, type: 'workout', workoutId: 'nope' }]), /not found/);
  fail(gas.call('updateSchedule', [{ studentId: 'US-other', days: [{ day: 1, type: 'workout', workoutId: push.id }] }], coach), /another student/);
});

test('deleteWorkoutPlan cascades to exercises and agenda but keeps history readable', () => {
  const { gas, coach, aluno, legs } = seeded();
  ok(gas.call('saveWorkoutSession', [squatSession(legs, 100, '2026-09-20T12:00:00.000Z')], aluno));
  assert.deepEqual(ok(gas.call('deleteWorkoutPlan', [legs.id], coach)), { workoutId: legs.id, deletedExercises: 2, clearedScheduleEntries: 1 });
  assert.ok(!gas.sheet('Exercicios_Treino').records().some((r) => r.ID_Treino === legs.id));
  assert.equal(ok(gas.call('getStudentData', [], aluno)).schedule.days[2].type, 'rest');
  const stats = ok(gas.call('getStudentStats', [], aluno));
  assert.deepEqual(stats.exerciseProgress.map((e) => e.exerciseName), ['Back Squat', 'Romanian Deadlift']);
  fail(gas.call('deleteWorkoutPlan', [legs.id], coach), /not found/);
});

// ---------------------------------------------------------------------------------------------
// Protocol
// ---------------------------------------------------------------------------------------------

test('the protocol is POST { acao, args, token } -> { ok, dados } / { ok: false, erro, codigo }', () => {
  const { gas, coach } = seeded();
  fail(gas.post({}), /Missing "acao"/);
  fail(gas.call('dropTables'), /Unknown action "dropTables"/);
  fail(gas.post('{not json'), /valid JSON/);
  fail(gas.post('[1,2]'), /JSON object/);
  assert.equal(ok(gas.call('ping')).service, 'gym-training-api');

  // GET only answers ping, so tokens never end up in URLs.
  assert.equal(ok(gas.get({})).service, 'gym-training-api');
  assert.equal(ok(gas.get({ acao: 'ping' })).service, 'gym-training-api');
  fail(gas.get({ acao: 'getTrainerDashboard', token: coach }), /Use POST/);
  assert.deepEqual(gas.options(), { ok: true, dados: {} });

  // Keys inherited from Object.prototype are not actions, types or IDs.
  fail(gas.call('toString'), /Unknown action/);
  fail(gas.call('constructor'), /Unknown action/);
  fail(gas.call('updateSchedule', [{ studentId: 'US-aluno', days: [{ day: 1, type: 'constructor' }] }], coach), /invalid type/);
  fail(gas.call('updateSchedule', [{ studentId: 'US-aluno', days: [{ day: 1, type: 'workout', workoutId: 'constructor' }] }], coach), /not found/);
  const odd = ok(gas.call('saveWorkoutPlan', [{ studentId: 'US-aluno', name: 'Odd', exercises: [{ id: 'constructor', name: 'Row' }] }], coach));
  assert.match(odd.workout.exercises[0].id, /^EX-/);
});

test('Code.gs never calls appendRow or HtmlService', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  assert.ok(!/\.appendRow\(/.test(code), 'uses appendRow');
  assert.ok(!/HtmlService/.test(code), 'uses HtmlService');
});
