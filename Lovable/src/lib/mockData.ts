import type { Schedule, SessionRecord, User, Workout } from "./types";

export const mockUsers: User[] = [
  { id: "t1", name: "Coach Alex Moreira", role: "trainer", initials: "AM" },
  {
    id: "s1",
    name: "Marcelo Aires",
    role: "student",
    trainerId: "t1",
    initials: "MA",
    lastActivity: "Trained today",
  },
  {
    id: "s2",
    name: "Bianca Ferraz",
    role: "student",
    trainerId: "t1",
    initials: "BF",
    lastActivity: "2 days ago",
  },
  {
    id: "s3",
    name: "Diego Nunes",
    role: "student",
    trainerId: "t1",
    initials: "DN",
    lastActivity: "6 days ago",
  },
];

export const mockWorkouts: Workout[] = [
  {
    id: "w1",
    name: "Push A — Chest & Shoulders",
    studentId: "s1",
    focus: "Upper push",
    exercises: [
      {
        id: "e1",
        name: "Barbell Bench Press",
        sets: 4,
        reps: "8",
        weight: 80,
        restSec: 120,
        videoUrl: "https://www.youtube.com/watch?v=rT7DgCr-3pg",
        notes: "Keep chest up, shoulder blades retracted.",
        rir: "RIR 2",
        substitute: "Dumbbell Bench Press",
      },
      {
        id: "e2",
        name: "Incline Dumbbell Press",
        sets: 3,
        reps: "10",
        weight: 28,
        restSec: 90,
        videoUrl: "https://www.youtube.com/watch?v=8iPEnn-ltC8",
        notes: "Control the eccentric for 2 seconds.",
        rir: "RIR 1",
      },
      {
        id: "e3",
        name: "Seated Shoulder Press",
        sets: 3,
        reps: "12",
        weight: 22,
        restSec: 75,
        videoUrl: "https://www.youtube.com/watch?v=qEwKCR5JCog",
        notes: "Don't flare the elbows.",
      },
      {
        id: "e4",
        name: "Cable Triceps Pushdown",
        sets: 3,
        reps: "15",
        weight: 30,
        restSec: 60,
        videoUrl: "https://www.youtube.com/watch?v=2-LAMcpzODU",
        notes: "Elbows pinned to the ribs.",
      },
    ],
  },
  {
    id: "w2",
    name: "Pull B — Back & Biceps",
    studentId: "s1",
    focus: "Upper pull",
    exercises: [
      {
        id: "e5",
        name: "Deadlift",
        sets: 4,
        reps: "5",
        weight: 120,
        restSec: 180,
        videoUrl: "https://www.youtube.com/watch?v=op9kVnSso6Q",
        notes: "Brace hard before every rep.",
        rir: "RIR 2",
      },
      {
        id: "e6",
        name: "Pull-Up",
        sets: 4,
        reps: "8",
        weight: 0,
        restSec: 120,
        videoUrl: "https://www.youtube.com/watch?v=eGo4IYlbE5g",
        notes: "Full stretch at the bottom.",
        substitute: "Lat Pulldown",
      },
      {
        id: "e7",
        name: "Barbell Row",
        sets: 3,
        reps: "10",
        weight: 60,
        restSec: 90,
        videoUrl: "https://www.youtube.com/watch?v=vT2GjY_Umpw",
        notes: "Torso at 45 degrees.",
      },
      {
        id: "e8",
        name: "Dumbbell Curl",
        sets: 3,
        reps: "12",
        weight: 14,
        restSec: 60,
        videoUrl: "https://www.youtube.com/watch?v=ykJmrZ5v0Oo",
      },
    ],
  },
  {
    id: "w3",
    name: "Legs — Squat Focus",
    studentId: "s1",
    focus: "Lower body",
    exercises: [
      {
        id: "e9",
        name: "Back Squat",
        sets: 5,
        reps: "5",
        weight: 100,
        restSec: 180,
        videoUrl: "https://www.youtube.com/watch?v=ultWZbUMPL8",
        notes: "Knees track over the toes.",
        rir: "RIR 1",
      },
      {
        id: "e10",
        name: "Romanian Deadlift",
        sets: 3,
        reps: "10",
        weight: 70,
        restSec: 120,
        videoUrl: "https://www.youtube.com/watch?v=jEy_czb3RKA",
        notes: "Hinge, don't squat.",
      },
      {
        id: "e11",
        name: "Leg Press",
        sets: 3,
        reps: "12",
        weight: 160,
        restSec: 90,
        videoUrl: "https://www.youtube.com/watch?v=IZxyjW7MPJQ",
      },
    ],
  },
  {
    id: "w4",
    name: "Full Body Starter",
    studentId: "s2",
    focus: "Foundation",
    exercises: [
      {
        id: "e12",
        name: "Goblet Squat",
        sets: 3,
        reps: "12",
        weight: 20,
        restSec: 75,
        videoUrl: "https://www.youtube.com/watch?v=MeIiIdhvXT4",
        notes: "Elbows inside the knees.",
      },
      {
        id: "e13",
        name: "Lat Pulldown",
        sets: 3,
        reps: "12",
        weight: 45,
        restSec: 75,
        videoUrl: "https://www.youtube.com/watch?v=CAwf7n6Luuc",
      },
      {
        id: "e14",
        name: "Dumbbell Bench Press",
        sets: 3,
        reps: "12",
        weight: 18,
        restSec: 75,
        videoUrl: "https://www.youtube.com/watch?v=VmB1G1K7v94",
      },
    ],
  },
  {
    id: "w5",
    name: "Conditioning Circuit",
    studentId: "s3",
    focus: "Conditioning",
    exercises: [
      {
        id: "e15",
        name: "Kettlebell Swing",
        sets: 4,
        reps: "20",
        weight: 24,
        restSec: 60,
        videoUrl: "https://www.youtube.com/watch?v=YSxHifyI6s8",
        notes: "Snap the hips, arms stay relaxed.",
      },
      {
        id: "e16",
        name: "Walking Lunge",
        sets: 3,
        reps: "16",
        weight: 16,
        restSec: 60,
        videoUrl: "https://www.youtube.com/watch?v=L8fvypPrzzs",
      },
    ],
  },
];

export const mockSchedules: Schedule[] = [
  {
    studentId: "s1",
    days: [
      { day: "Monday", type: "workout", workoutId: "w1" },
      { day: "Tuesday", type: "workout", workoutId: "w2" },
      { day: "Wednesday", type: "cardio", label: "30 min zone 2 bike" },
      { day: "Thursday", type: "workout", workoutId: "w3" },
      { day: "Friday", type: "workout", workoutId: "w1" },
      { day: "Saturday", type: "cardio", label: "45 min trail run" },
      { day: "Sunday", type: "rest" },
    ],
  },
  {
    studentId: "s2",
    days: [
      { day: "Monday", type: "workout", workoutId: "w4" },
      { day: "Tuesday", type: "rest" },
      { day: "Wednesday", type: "workout", workoutId: "w4" },
      { day: "Thursday", type: "rest" },
      { day: "Friday", type: "workout", workoutId: "w4" },
      { day: "Saturday", type: "cardio", label: "20 min walk" },
      { day: "Sunday", type: "rest" },
    ],
  },
  {
    studentId: "s3",
    days: [
      { day: "Monday", type: "workout", workoutId: "w5" },
      { day: "Tuesday", type: "rest" },
      { day: "Wednesday", type: "workout", workoutId: "w5" },
      { day: "Thursday", type: "rest" },
      { day: "Friday", type: "cardio", label: "Intervals 10x400m" },
      { day: "Saturday", type: "rest" },
      { day: "Sunday", type: "rest" },
    ],
  },
];

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function buildHistory(): SessionRecord[] {
  const progression = [
    { offset: 42, bench: 70, squat: 90, dl: 105 },
    { offset: 35, bench: 72.5, squat: 92.5, dl: 110 },
    { offset: 28, bench: 72.5, squat: 95, dl: 112.5 },
    { offset: 21, bench: 75, squat: 95, dl: 115 },
    { offset: 14, bench: 77.5, squat: 97.5, dl: 117.5 },
    { offset: 7, bench: 80, squat: 100, dl: 120 },
  ];

  return progression.flatMap((p, i) => {
    const bench: SessionRecord = {
      id: `h-push-${i}`,
      studentId: "s1",
      workoutId: "w1",
      workoutName: "Push A — Chest & Shoulders",
      date: daysAgo(p.offset),
      durationSec: 3300 + i * 60,
      totalVolume: 0,
      exercises: [
        {
          exerciseName: "Barbell Bench Press",
          sets: Array.from({ length: 4 }, () => ({ weight: p.bench, reps: 8 })),
        },
        {
          exerciseName: "Incline Dumbbell Press",
          sets: Array.from({ length: 3 }, () => ({ weight: 24 + i, reps: 10 })),
        },
        {
          exerciseName: "Seated Shoulder Press",
          sets: Array.from({ length: 3 }, () => ({ weight: 18 + i, reps: 12 })),
        },
      ],
    };
    const legs: SessionRecord = {
      id: `h-legs-${i}`,
      studentId: "s1",
      workoutId: "w3",
      workoutName: "Legs — Squat Focus",
      date: daysAgo(p.offset - 3),
      durationSec: 3900 + i * 45,
      totalVolume: 0,
      exercises: [
        {
          exerciseName: "Back Squat",
          sets: Array.from({ length: 5 }, () => ({ weight: p.squat, reps: 5 })),
        },
        {
          exerciseName: "Deadlift",
          sets: Array.from({ length: 4 }, () => ({ weight: p.dl, reps: 5 })),
        },
      ],
    };
    for (const s of [bench, legs]) {
      s.totalVolume = s.exercises.reduce(
        (sum, ex) => sum + ex.sets.reduce((v, st) => v + st.weight * st.reps, 0),
        0,
      );
    }
    return [bench, legs];
  });
}

export const mockHistory: SessionRecord[] = buildHistory();
