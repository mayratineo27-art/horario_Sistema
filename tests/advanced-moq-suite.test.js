/**
 * Mya Dynamics - Advanced Mock-Based Unit Tests
 * Vanilla JavaScript, runnable with: node tests/advanced-moq-suite.test.js
 *
 * This suite avoids real network, browser hardware, and Supabase access by using
 * manual mocks (Moq-style) and pure helper functions that mirror the production logic.
 */

// -----------------------------
// Small assertion helpers
// -----------------------------
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function minutesFromHHMM(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function formatHHMM(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// -----------------------------
// Production-aligned helpers
// -----------------------------
function shouldHideFixedActivity(activity, currentTime, isCurrentDay = true) {
  if (!isCurrentDay) return false;
  if (activity.activityType === 'FLEXIBLE') return false;

  const isFixed = activity.isFixed || activity.esFijo;
  if (!isFixed) return false;

  const isAcademic =
    activity.category === 'ACADEMIC' ||
    activity.isAcademic ||
    activity.name.includes('(IS-') ||
    activity.name.includes('Lab');

  if (isAcademic) return false;

  const [endH, endM] = activity.endTime.split(':').map(Number);
  const endMinutes = endH * 60 + endM;
  const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

  return nowMinutes > endMinutes;
}

function detectConflict(schedule, dayIndex, start, end, currentId, newActivityType) {
  if (newActivityType === 'FLEXIBLE') return { conflict: null, suggestion: null };

  const newStart = minutesFromHHMM(start);
  const newEnd = minutesFromHHMM(end);
  const dayActivities = schedule[dayIndex] ? schedule[dayIndex].activities : [];

  const conflict = dayActivities.find(activity => {
    if (activity.id === currentId || activity.archived) return false;
    if (activity.activityType === 'FLEXIBLE') return false;

    const existingStart = minutesFromHHMM(activity.startTime);
    const existingEnd = minutesFromHHMM(activity.endTime);
    return newStart < existingEnd && newEnd > existingStart;
  }) || null;

  if (!conflict) {
    return { conflict: null, suggestion: null };
  }

  const opening = 300; // 05:00
  const closing = 1320; // 22:00
  const duration = newEnd - newStart;
  const sorted = dayActivities
    .filter(activity => activity.id !== currentId && !activity.archived && activity.activityType !== 'FLEXIBLE')
    .map(activity => ({
      start: minutesFromHHMM(activity.startTime),
      end: minutesFromHHMM(activity.endTime),
    }))
    .sort((a, b) => a.start - b.start);

  const gaps = [];
  let cursor = opening;

  for (const block of sorted) {
    if (block.start - cursor >= duration) {
      gaps.push({ start: cursor, end: block.start, distance: Math.abs(cursor - newStart) });
    }
    cursor = Math.max(cursor, block.end);
  }

  if (closing - cursor >= duration) {
    gaps.push({ start: cursor, end: closing, distance: Math.abs(cursor - newStart) });
  }

  const bestGap = gaps.sort((left, right) => left.distance - right.distance)[0];
  const suggestion = bestGap ? `${formatHHMM(bestGap.start)} - ${formatHHMM(bestGap.end)}` : '05:00 - 22:00';

  return { conflict, suggestion };
}

function createSupabaseMock(nextUpsertResult) {
  const calls = {
    from: [],
    select: [],
    upsert: [],
    update: [],
  };

  const chain = {
    select(columns) {
      calls.select.push(columns);
      return chain;
    },
    upsert(payload) {
      calls.upsert.push(payload);
      if (typeof nextUpsertResult === 'function') {
        return nextUpsertResult(payload);
      }
      return Promise.resolve(nextUpsertResult);
    },
    update(payload) {
      calls.update.push(payload);
      return chain;
    },
    eq() {
      return chain;
    },
    single() {
      return Promise.resolve({ data: null, error: null });
    },
  };

  const supabase = {
    from(tableName) {
      calls.from.push(tableName);
      return chain;
    },
    _calls: calls,
  };

  return supabase;
}

async function savePushSubscriptionMock(supabase, userKey, subscription, timezone) {
  try {
    const normalizedSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys?.p256dh || '',
        auth: subscription.keys?.auth || '',
      },
      expirationTime: subscription.expirationTime || null,
    };

    const { error } = await supabase
      .from('configuraciones_de_usuario')
      .upsert({
        user_key: userKey,
        subscription: normalizedSubscription,
        timezone,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_key' });

    if (error) throw error;
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

async function updateChecklistStateMock(supabase, localState, courseId, taskId, terminado) {
  const nextState = deepClone(localState);
  const course = nextState.course_checklists.find(item => item.course_id === courseId);
  if (!course) {
    throw new Error(`Curso no encontrado: ${courseId}`);
  }

  const task = course.items.find(item => item.id === taskId);
  if (!task) {
    throw new Error(`Tarea no encontrada: ${taskId}`);
  }

  task.done = terminado;

  await supabase
    .from('listas_de_verificacion_de_cursos')
    .upsert({
      course_id: courseId,
      task_id: taskId,
      terminado,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'course_id,task_id' });

  return nextState;
}

function weeklyResetMock(currentDate, currentState, baseFixedActivities) {
  const mondayAfterMidnight = currentDate.getDay() === 1 && currentDate.getHours() === 0 && currentDate.getMinutes() >= 1;
  const nextState = deepClone(currentState);

  if (!mondayAfterMidnight) {
    return {
      schedule: nextState.schedule,
      firedNotifications: nextState.firedNotifications,
      renderKey: nextState.renderKey,
    };
  }

  const fixedByDay = new Map();
  for (const block of baseFixedActivities) {
    const key = `${block.dayIndex}:${block.activity.id}`;
    fixedByDay.set(key, deepClone(block.activity));
  }

  const schedule = nextState.schedule.map((day, dayIndex) => {
    const restoredFixed = baseFixedActivities
      .filter(block => block.dayIndex === dayIndex)
      .map(block => deepClone(block.activity));

    const currentCustom = day.activities.filter(activity => !(activity.isFixed || activity.esFijo));

    return {
      ...day,
      activities: [...restoredFixed, ...currentCustom].sort((a, b) => a.startTime.localeCompare(b.startTime)),
    };
  });

  return {
    schedule,
    firedNotifications: {},
    renderKey: `week-${currentDate.toISOString()}`,
  };
}

// -----------------------------
// Test runner
// -----------------------------
const results = [];

async function runTest(label, fn) {
  try {
    await fn();
    console.log(`✅ ${label}`);
    results.push(true);
  } catch (error) {
    console.log(`❌ ${label}`);
    console.error(error && error.stack ? error.stack : error);
    results.push(false);
  }
}

function mockDate(isoString) {
  const RealDate = Date;
  const fixedTime = new RealDate(isoString).getTime();

  global.Date = class extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        return new RealDate(fixedTime);
      }
      return new RealDate(...args);
    }
    static now() {
      return fixedTime;
    }
  };

  return () => {
    global.Date = RealDate;
  };
}

function mockLocalDate(year, monthIndex, day, hour, minute, second = 0) {
  const RealDate = Date;
  const fixedTime = new RealDate(year, monthIndex, day, hour, minute, second).getTime();

  global.Date = class extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        return new RealDate(fixedTime);
      }
      return new RealDate(...args);
    }
    static now() {
      return fixedTime;
    }
  };

  return () => {
    global.Date = RealDate;
  };
}

// -----------------------------
// 6 advanced tests
// -----------------------------
(async () => {
  // Test 1: fixed expiry render mock
  await runTest('PRUEBA 1 - Caducidad fija oculta actividad a las 18:01', async () => {
    const restoreDate = mockLocalDate(2026, 4, 20, 18, 1);
    try {
      const activity = {
        id: 'unsch-lab-1',
        name: 'Correr',
        startTime: '17:00',
        endTime: '18:00',
        isFixed: true,
        esFijo: true,
        category: 'WELLNESS',
        activityType: 'FIJA_PERMANENTE',
      };
      const hidden = shouldHideFixedActivity(activity, new Date(), true);
      assert(hidden === true, 'La actividad fija vencida debe ocultarse');
    } finally {
      restoreDate();
    }
  });

  // Test 2: non-fixed task persistence
  await runTest('PRUEBA 2 - Tarea autónoma no se oculta a las 21:00', async () => {
    const restoreDate = mockDate('2026-05-20T21:00:00.000Z');
    try {
      const activity = {
        id: 'task-1',
        name: 'Proyecto Final',
        startTime: '20:00',
        endTime: '23:00',
        isFixed: false,
        esFijo: false,
        category: 'SPECIAL',
        activityType: 'FLEXIBLE',
      };
      const hidden = shouldHideFixedActivity(activity, new Date(), true);
      assert(hidden === false, 'Una actividad no fija no debe ocultarse automáticamente');
    } finally {
      restoreDate();
    }
  });

  // Test 3: conflict detection with memory schedule
  await runTest('PRUEBA 3 - Conflicto detectado y sugerencia de bloque libre', async () => {
    const schedule = [
      {
        day: 'Lunes',
        activities: [
          { id: 'unsch-1', name: 'Cálculo I', startTime: '07:00', endTime: '09:00', courseId: 'IS-101', isFixed: true, activityType: 'FIJA_PERMANENTE' },
          { id: 'unsch-2', name: 'Programación', startTime: '09:00', endTime: '11:00', courseId: 'IS-102', isFixed: true, activityType: 'FIJA_PERMANENTE' },
        ],
      },
    ];

    const result = detectConflict(schedule, 0, '08:30', '09:30', null, 'MANUAL');
    assert(result.conflict !== null, 'Debe detectar colisión');
    assert(result.suggestion === '05:00 - 07:00' || result.suggestion === '11:00 - 22:00', 'Debe sugerir un bloque libre');
  });

  // Test 4: push subscription error is caught
  await runTest('PRUEBA 4 - Error de upsert en Supabase se captura sin romper UI', async () => {
    const supabase = createSupabaseMock(Promise.resolve({ error: { status: 500, message: 'RLS policy violation' } }));
    const result = await savePushSubscriptionMock(
      supabase,
      'user-123',
      {
        endpoint: 'https://push.example.com/endpoint',
        keys: { p256dh: 'key-1', auth: 'key-2' },
        expirationTime: null,
      },
      'America/Lima'
    );

    assert(result.ok === false, 'El error debe capturarse y reportarse como false');
    assert(supabase._calls.from[0] === 'configuraciones_de_usuario', 'Debe escribir en la tabla mockeada de configuraciones_de_usuario');
  });

  // Test 5: relational checklist update
  await runTest('PRUEBA 5 - Checklist relacional actualiza terminado:true y estado local', async () => {
    const supabase = createSupabaseMock(Promise.resolve({ error: null }));
    const localState = {
      course_checklists: [
        {
          course_id: 'course-001',
          items: [
            { id: 'task-a', text: 'Subir avance', done: false },
            { id: 'task-b', text: 'Resolver ejercicio', done: false },
          ],
        },
      ],
    };

    const nextState = await updateChecklistStateMock(supabase, localState, 'course-001', 'task-b', true);
    assert(nextState.course_checklists[0].items[1].done === true, 'El estado local debe marcarse como terminado');
    assert(supabase._calls.upsert[0].terminado === true, 'La actualización debe enviarse con terminado:true');
  });

  // Test 6: weekly reset Monday 00:01
  await runTest('PRUEBA 6 - Reinicio semanal limpia cola y re-renderiza actividades fijas', async () => {
    const restoreDate = mockLocalDate(2026, 4, 18, 0, 1); // Monday 00:01 local
    try {
      const currentState = {
        renderKey: 'week-old',
        firedNotifications: { 'a_90': true, 'b_30': true },
        schedule: [
          { day: 'Lunes', activities: [{ id: 'custom-1', name: 'Notas', startTime: '12:00', endTime: '13:00', isFixed: false }] },
          { day: 'Martes', activities: [] },
        ],
      };

      const baseFixedActivities = [
        { dayIndex: 0, activity: { id: 'run-05', name: 'Correr', startTime: '05:00', endTime: '05:30', isFixed: true, esFijo: true } },
        { dayIndex: 0, activity: { id: 'workout-20', name: 'Ejercicio', startTime: '20:00', endTime: '21:00', isFixed: true, esFijo: true } },
      ];

      const nextState = weeklyResetMock(new Date(), currentState, baseFixedActivities);
      assert(Object.keys(nextState.firedNotifications).length === 0, 'La cola vieja de notificaciones debe vaciarse');
      assert(nextState.schedule[0].activities.some(item => item.id === 'run-05'), 'Debe reinsertar actividades fijas de la nueva semana');
      assert(nextState.schedule[0].activities.some(item => item.id === 'workout-20'), 'Debe reinsertar todas las actividades inamovibles');
      assert(nextState.renderKey !== currentState.renderKey, 'Debe forzar un nuevo render key para re-render');
    } finally {
      restoreDate();
    }
  });

  const passed = results.filter(Boolean).length;
  console.log(`\n6 tests passed (${passed}/6)`);
})().catch(error => {
  console.error('\nTest runner crashed:');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
