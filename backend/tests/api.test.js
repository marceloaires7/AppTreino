'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
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
  assert.equal(res.status, 'success', `expected success, got: ${res.message}`);
  return res.data;
}

function fail(res, pattern) {
  assert.equal(res.status, 'error');
  assert.match(res.message, pattern);
}

/** Seeded database: coach (trainer), aluno (student) with Push/Legs workouts and a full week. */
function seeded() {
  const gas = createGas();
  gas.context.seedDemoData();
  const data = ok(gas.get({ action: 'getStudentData', userId: 'US-aluno' }));
  const push = data.workouts.find((w) => w.name.startsWith('Push'));
  const legs = data.workouts.find((w) => w.name.startsWith('Legs'));
  return { gas, push, legs };
}

function squatSession(legs, weight, date) {
  return {
    action: 'saveWorkoutSession',
    studentId: 'US-aluno',
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

test('setupDatabase creates every tab with PRD + optional headers and is idempotent', () => {
  const gas = createGas();
  gas.context.setupDatabase();
  gas.context.setupDatabase();
  for (const [name, headers] of Object.entries(PRD_HEADERS)) {
    const row1 = gas.sheet(name).getRange(1, 1, 1, gas.sheet(name).getLastColumn()).getValues()[0];
    assert.deepEqual(row1.slice(0, headers.length), headers, name);
  }
  assert.deepEqual(gas.sheet('Usuarios').getRange(1, 6).getValues()[0], ['ID_Treinador']);
  assert.equal(gas.sheet('Usuarios').formats.get('2,4'), '@', 'Senha column is plain text');
  assert.equal(gas.sheet('Exercicios_Treino').formats.get('2,7'), undefined, 'Carga_kg stays numeric');
});

test('login returns the user and role, never the password', () => {
  const { gas } = seeded();
  const res = gas.post({ action: 'login', Login: 'Coach', Senha: 'coach123' });
  const data = ok(res);
  assert.equal(data.role, 'trainer');
  assert.deepEqual(data.user, { id: 'US-coach', name: 'Coach Alex Moreira', role: 'trainer', initials: 'CM' });
  assert.ok(!JSON.stringify(res).includes('coach123'));
  assert.ok(!JSON.stringify(res).includes('Senha'));

  // Action may also come from the query string, as in "POST ?action=login".
  assert.equal(ok(gas.post({ Login: 'aluno', Senha: 'aluno123' }, { action: 'login' })).role, 'student');

  fail(gas.post({ action: 'login', Login: 'coach', Senha: 'wrong' }), /^Invalid credentials$/);
  fail(gas.post({ action: 'login', Login: 'nobody', Senha: 'coach123' }), /^Invalid credentials$/);
  fail(gas.post({ action: 'login', Login: 'coach' }), /required/);
});

test('numeric-looking passwords keep leading zeros because Senha is stored as text', () => {
  const { gas } = seeded();
  gas.context.resetTableCache_();
  gas.context.appendRecords_('Usuarios', [{ ID_Usuario: '0042', Nome: 'Zero Pad', Login: 'zero', Senha: '0123', Role: 'Student' }]);
  const row = gas.sheet('Usuarios').records().find((r) => r.Login === 'zero');
  assert.equal(row.Senha, '0123');
  assert.equal(row.ID_Usuario, '0042');
  assert.equal(ok(gas.post({ action: 'login', Login: 'zero', Senha: '0123' })).user.id, '0042');
});

test('getStudentData nests workouts, exercises and a full 7-day schedule', () => {
  const { gas, push, legs } = seeded();
  const data = ok(gas.get({ action: 'getStudentData', userId: 'US-aluno' }));

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

  assert.deepEqual(ok(gas.get({ action: 'getWorkout', workoutId: push.id })).workout, push);
  assert.equal(ok(gas.get({ action: 'getWorkout', workoutId: 'nope' })).workout, null);
  fail(gas.get({ action: 'getWorkout' }), /workoutId/);

  fail(gas.get({ action: 'getStudentData', userId: 'US-coach' }), /not a student/);
  fail(gas.get({ action: 'getStudentData', userId: 'ghost' }), /not found/);
  fail(gas.get({ action: 'getStudentData' }), /userId/);
});

test('values typed as text in the sheet are cast to numbers (including pt-BR decimals)', () => {
  const { gas, push } = seeded();
  const sheet = gas.sheet('Exercicios_Treino');
  const rowNumber = sheet.records().findIndex((r) => r.ID_Exercicio === push.exercises[0].id) + 2;
  sheet.setRaw(rowNumber, 5, ' 4 '); // Series
  sheet.setRaw(rowNumber, 7, '82,5'); // Carga_kg
  sheet.setRaw(rowNumber, 8, '1.234,0'); // Descanso_seg
  const bench = ok(gas.get({ action: 'getStudentData', userId: 'US-aluno' }))
    .workouts.find((w) => w.id === push.id).exercises[0];
  assert.strictEqual(bench.sets, 4);
  assert.strictEqual(bench.weight, 82.5);
  assert.strictEqual(bench.restSec, 1234);
});

test('saveWorkoutPlan creates, then updates with cascade and stable exercise IDs', () => {
  const { gas, push } = seeded();
  const exercisesBefore = gas.sheet('Exercicios_Treino').records().length;

  // Create: client-side temp IDs are replaced by server IDs.
  const created = ok(gas.post({
    action: 'saveWorkoutPlan',
    workout: {
      id: 'w-1712345678',
      studentId: 'US-aluno',
      name: 'Pull B',
      focus: 'Upper pull',
      exercises: [
        { id: 'ex-tmp1', name: 'Deadlift', sets: '4', reps: '5', weight: '120', restSec: 180 },
        { id: 'ex-tmp2', name: 'Pull-Up', sets: 4, reps: '8', weight: 0, restSec: 120 },
      ],
    },
  }));
  assert.equal(created.created, true);
  assert.match(created.workout.id, /^TR-[0-9a-f]{12}$/);
  assert.ok(created.workout.exercises.every((e) => /^EX-/.test(e.id)));
  assert.strictEqual(created.workout.exercises[0].sets, 4);
  assert.strictEqual(created.workout.exercises[0].weight, 120);

  // Update Push: keep bench (same id), drop the other two, add a new one, rename.
  const bench = push.exercises[0];
  const updated = ok(gas.post({
    action: 'saveWorkoutPlan',
    id: push.id,
    studentId: 'US-aluno',
    name: 'Push A v2',
    exercises: [
      { id: 'ex-new', name: 'Dips', sets: 3, reps: '10', weight: 0, restSec: 90 },
      { ...bench, weight: 85 },
    ],
  }));
  assert.equal(updated.created, false);
  assert.equal(updated.workout.id, push.id);
  assert.equal(updated.workout.exercises[1].id, bench.id, 'existing exercise keeps its ID');
  assert.equal(updated.workout.exercises[1].order, 2);
  assert.notEqual(updated.workout.exercises[0].id, 'ex-new');

  const rows = gas.sheet('Exercicios_Treino').records();
  assert.equal(rows.filter((r) => r.ID_Treino === push.id).length, 2, 'old exercises were removed');
  assert.equal(rows.length, exercisesBefore + 2 - 1, '+2 new workout, push went 3 -> 2');
  assert.equal(gas.sheet('Treinos').records().filter((r) => r.ID_Treino === push.id).length, 1);
  assert.equal(gas.sheet('Treinos').records().find((r) => r.ID_Treino === push.id).Nome_do_Treino, 'Push A v2');

  fail(gas.post({ action: 'saveWorkoutPlan', studentId: 'US-aluno', exercises: [] }), /name/);
  fail(gas.post({ action: 'saveWorkoutPlan', studentId: 'US-aluno', name: 'X', exercises: [{ sets: 3 }] }), /exercises\[0\]/);
  fail(gas.post({ action: 'saveWorkoutPlan', studentId: 'US-coach', name: 'X' }), /not a student/);
});

test('saveWorkoutSession accepts the frontend SessionRecord and bulk-inserts the sets', () => {
  const { gas, legs } = seeded();
  const seriesSheet = gas.sheet('Historico_Series');
  const callsBefore = seriesSheet.setValuesCalls;

  const session = ok(gas.post(squatSession(legs, 100, '2026-09-20T12:00:00.000Z'))).session;

  assert.equal(seriesSheet.setValuesCalls - callsBefore, 1, 'all sets written with one setValues');
  assert.match(session.id, /^HS-/);
  assert.equal(session.workoutId, legs.id);
  assert.equal(session.workoutName, legs.name);
  assert.equal(session.date, '2026-09-20T12:00:00.000Z');
  assert.strictEqual(session.totalVolume, 100 * 5 * 2 + 105 * 3 + 70 * 10);
  assert.equal(session.exercises[0].exerciseId, legs.exercises[0].id, 'resolved by name');
  assert.deepEqual(session.exercises[0].sets.map((s) => s.setNumber), [1, 2, 3]);

  const header = gas.sheet('Historico_Execucao').records()[0];
  assert.strictEqual(header.Volume_Total, 2015);
  assert.strictEqual(header.Tempo_Duracao_seg, 3600);
  assert.equal(header.Data, '2026-09-20T12:00:00.000Z');
  const sets = seriesSheet.records();
  assert.equal(sets.length, 4);
  assert.ok(sets.every((s) => s.ID_Historico === session.id));

  assert.ok(gas.stats.locks > 0 && gas.stats.locks === gas.stats.releases, 'writes run under a released lock');
  fail(gas.post({ action: 'saveWorkoutSession', studentId: 'US-aluno', exercises: [{ sets: [] }] }), /exerciseName/);
});

test('many sets grow the sheet beyond its initial size', () => {
  const { gas, legs } = seeded();
  const sets = Array.from({ length: 40 }, (_, i) => ({ weight: 60 + i, reps: 5 }));
  ok(gas.post({ action: 'saveWorkoutSession', studentId: 'US-aluno', workoutId: legs.id, durationSec: 10,
    exercises: [{ exerciseId: legs.exercises[0].id, sets }] }));
  assert.equal(gas.sheet('Historico_Series').records().length, 40);
});

test('getStudentStats aggregates history into chart-ready series', () => {
  const { gas, legs } = seeded();
  ok(gas.post(squatSession(legs, 105, '2026-09-15T12:00:00.000Z')));
  ok(gas.post(squatSession(legs, 100, '2026-09-08T12:00:00.000Z')));

  const stats = ok(gas.get({ action: 'getStudentStats', userId: 'US-aluno' }));
  assert.equal(stats.summary.totalSessions, 2);
  assert.equal(stats.summary.lastSessionDate, '2026-09-15T12:00:00.000Z');
  assert.deepEqual(stats.history.map((h) => h.date), ['2026-09-08T12:00:00.000Z', '2026-09-15T12:00:00.000Z']);
  assert.equal(stats.volumeOverTime.length, 2);

  const squat = stats.exerciseProgress.find((e) => e.exerciseName === 'Back Squat');
  assert.deepEqual(squat.data.map((d) => d.topWeight), [105, 110]);
  assert.deepEqual(squat.personalRecord, { weight: 110, date: '2026-09-15T12:00:00.000Z' });
  assert.strictEqual(squat.data[0].totalReps, 13);
  assert.strictEqual(squat.data[0].estimated1RM, 116.7); // 100 * (1 + 5/30), beats 105 * (1 + 3/30)
  assert.deepEqual(squat.exerciseIds, [legs.exercises[0].id]);

  const empty = createGas();
  empty.context.seedDemoData();
  assert.deepEqual(ok(empty.get({ action: 'getStudentStats', userId: 'US-aluno' })).summary.totalSessions, 0);
});

test('getTrainerDashboard lists this trainer\'s students with their latest session', () => {
  const { gas, legs } = seeded();
  gas.context.resetTableCache_();
  gas.context.appendRecords_('Usuarios', [
    { ID_Usuario: 'US-t2', Nome: 'Other Coach', Login: 't2', Senha: 'x', Role: 'Trainer' },
    { ID_Usuario: 'US-s2', Nome: 'Bianca Ferraz', Login: 's2', Senha: 'x', Role: 'Student', ID_Treinador: 'US-t2' },
    { ID_Usuario: 'US-s3', Nome: 'Unassigned Student', Login: 's3', Senha: 'x', Role: 'Student' },
  ]);
  ok(gas.post(squatSession(legs, 100, '2026-01-01T12:00:00.000Z')));
  ok(gas.post(squatSession(legs, 105, new Date().toISOString())));

  const data = ok(gas.get({ action: 'getTrainerDashboard', trainerId: 'US-coach' }));
  assert.equal(data.trainer.id, 'US-coach');
  assert.deepEqual(data.students.map((s) => s.id), ['US-aluno', 'US-s3']);

  const aluno = data.students[0];
  assert.equal(aluno.totalSessions, 2);
  assert.equal(aluno.lastActivity, 'Trained today');
  assert.equal(aluno.daysSinceLastSession, 0);
  assert.equal(aluno.lastSession.workoutName, legs.name);
  assert.equal(aluno.lastSession.exerciseCount, 2);
  assert.equal(aluno.lastSession.setCount, 4);
  assert.ok(!JSON.stringify(data).includes('Senha'));

  const unassigned = data.students[1];
  assert.equal(unassigned.lastSession, null);
  assert.equal(unassigned.totalSessions, 0);
  assert.ok(!('lastActivity' in unassigned));

  fail(gas.get({ action: 'getTrainerDashboard', trainerId: 'US-aluno' }), /not a trainer/);
});

test('updateSchedule replaces only the days sent and validates workouts', () => {
  const { gas, push, legs } = seeded();
  const schedule = ok(gas.post({
    action: 'updateSchedule',
    schedule: { studentId: 'US-aluno', days: [{ day: 'Tuesday', type: 'workout', workoutId: legs.id }, { dayNumber: 7, type: 'cardio', label: 'Walk' }] },
  })).schedule;
  assert.equal(schedule.days[0].workoutId, push.id, 'Monday untouched');
  assert.deepEqual(schedule.days[1], { day: 'Tuesday', dayNumber: 2, type: 'workout', workoutId: legs.id, workoutName: legs.name });
  assert.deepEqual(schedule.days[6], { day: 'Sunday', dayNumber: 7, type: 'cardio', label: 'Walk' });
  assert.equal(gas.sheet('Agenda').records().length, 7, 'rows replaced, not duplicated');
  assert.ok(gas.sheet('Agenda').records().every((r) => ['Workout', 'Cardio', 'Rest'].includes(r.Tipo_Atividade)));

  // Full week from the frontend shape (trainer.student.$id.tsx sends all 7 days).
  const week = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => ({ day, type: 'rest' }));
  ok(gas.post({ action: 'updateSchedule', studentId: 'US-aluno', days: week }));
  assert.equal(gas.sheet('Agenda').records().length, 7);

  fail(gas.post({ action: 'updateSchedule', studentId: 'US-aluno', days: [{ day: 'Funday', type: 'rest' }] }), /invalid day/);
  fail(gas.post({ action: 'updateSchedule', studentId: 'US-aluno', days: [{ day: 1, type: 'swim' }] }), /invalid type/);
  fail(gas.post({ action: 'updateSchedule', studentId: 'US-aluno', days: [{ day: 1, type: 'workout', workoutId: 'nope' }] }), /not found/);
});

test('updateSchedule rejects a workout owned by another student', () => {
  const { gas, push } = seeded();
  gas.context.resetTableCache_();
  gas.context.appendRecords_('Usuarios', [{ ID_Usuario: 'US-s2', Nome: 'B', Login: 's2', Senha: 'x', Role: 'Student' }]);
  fail(
    gas.post({ action: 'updateSchedule', studentId: 'US-s2', days: [{ day: 1, type: 'workout', workoutId: push.id }] }),
    /another student/,
  );
});

test('deleteWorkoutPlan cascades to exercises and agenda but keeps history readable', () => {
  const { gas, legs } = seeded();
  ok(gas.post(squatSession(legs, 100, '2026-09-20T12:00:00.000Z')));
  const result = ok(gas.post({ action: 'deleteWorkoutPlan', workoutId: legs.id }));
  assert.deepEqual(result, { workoutId: legs.id, deletedExercises: 2, clearedScheduleEntries: 1 });

  assert.ok(!gas.sheet('Treinos').records().some((r) => r.ID_Treino === legs.id));
  assert.ok(!gas.sheet('Exercicios_Treino').records().some((r) => r.ID_Treino === legs.id));
  const data = ok(gas.get({ action: 'getStudentData', userId: 'US-aluno' }));
  assert.equal(data.schedule.days[2].type, 'rest', 'Wednesday fell back to rest');

  const stats = ok(gas.get({ action: 'getStudentStats', userId: 'US-aluno' }));
  assert.deepEqual(stats.exerciseProgress.map((e) => e.exerciseName), ['Back Squat', 'Romanian Deadlift']);
  fail(gas.post({ action: 'deleteWorkoutPlan', workoutId: legs.id }), /not found/);
});

test('works on a sheet with only the PRD columns (no optional columns)', () => {
  const gas = createGas({ newSheetRows: 1000 });
  gas.ss.addTable('Usuarios', PRD_HEADERS.Usuarios, [
    [1, 'Trainer One', 'coach', 1234, 'Trainer'],
    [2, 'Student One', 'aluno', 'abc', 'student'],
  ]);
  for (const name of Object.keys(PRD_HEADERS).slice(1)) gas.ss.addTable(name, PRD_HEADERS[name]);

  assert.equal(ok(gas.post({ action: 'login', Login: 'coach', Senha: '1234' })).user.id, '1');
  const workout = ok(gas.post({ action: 'saveWorkoutPlan', studentId: 2, name: 'A', exercises: [{ name: 'Squat', sets: 3, reps: '5', weight: 50, restSec: 60 }] })).workout;
  ok(gas.post({ action: 'updateSchedule', studentId: '2', days: [{ day: 'Monday', type: 'cardio', label: 'ignored without column' }] }));
  ok(gas.post({ action: 'saveWorkoutSession', studentId: '2', workoutId: workout.id, durationSec: 60, exercises: [{ exerciseName: 'squat', sets: [{ weight: 50, reps: 5 }] }] }));

  assert.deepEqual(gas.sheet('Historico_Series').getRange(1, 1, 1, gas.sheet('Historico_Series').getLastColumn()).getValues()[0], PRD_HEADERS.Historico_Series);
  const dashboard = ok(gas.get({ action: 'getTrainerDashboard', trainerId: '1' }));
  assert.deepEqual(dashboard.students.map((s) => s.id), ['2']);
  assert.equal(dashboard.students[0].lastSession.workoutName, 'A', 'workout derived from the logged exercises');
  const stats = ok(gas.get({ action: 'getStudentStats', userId: '2' }));
  assert.equal(stats.exerciseProgress[0].exerciseName, 'Squat');
  const monday = ok(gas.get({ action: 'getStudentData', userId: '2' })).schedule.days[0];
  assert.deepEqual(monday, { day: 'Monday', dayNumber: 1, type: 'cardio' });
});

test('routing, method checks and malformed input return the error envelope', () => {
  const { gas } = seeded();
  fail(gas.get({}), /Missing "action"/);
  fail(gas.get({ action: 'login' }), /must be called with POST/);
  fail(gas.post({ action: 'getStudentData' }), /must be called with GET/);
  fail(gas.get({ action: 'dropTables' }), /Unknown GET action/);
  fail(gas.post('{not json', { action: 'login' }), /valid JSON/);
  fail(gas.post('[1,2]', { action: 'login' }), /JSON object/);
  // Keys inherited from Object.prototype must not resolve to routes or valid values.
  fail(gas.get({ action: 'toString' }), /Unknown GET action/);
  fail(gas.post({ action: 'constructor' }), /Unknown POST action/);
  fail(gas.post({ action: 'updateSchedule', studentId: 'US-aluno', days: [{ day: 1, type: 'constructor' }] }), /invalid type/);
  fail(gas.post({ action: 'updateSchedule', studentId: 'US-aluno', days: [{ day: 1, type: 'workout', workoutId: 'constructor' }] }), /not found/);
  const odd = ok(gas.post({ action: 'saveWorkoutPlan', studentId: 'US-aluno', name: 'Odd', exercises: [{ id: 'constructor', name: 'Row' }] }));
  assert.match(odd.workout.exercises[0].id, /^EX-/);

  assert.deepEqual(gas.options(), { status: 'success', data: {} });
  assert.equal(ok(gas.get({ action: 'ping' })).service, 'gym-training-api');

  const missing = createGas();
  fail(missing.get({ action: 'getStudentData', userId: 'x' }), /Sheet "Usuarios" not found/);
});

test('Code.gs never calls appendRow or HtmlService', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  assert.ok(!/\.appendRow\(/.test(code), 'uses appendRow');
  assert.ok(!/HtmlService/.test(code), 'uses HtmlService');
});
