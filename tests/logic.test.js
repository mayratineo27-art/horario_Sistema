/**
 * Tests unitarios para las funciones de lógica de negocio del proyecto Mya Dynamics
 * Ejecutar con: node tests/logic.test.js
 */

// ============================================================================
// FUNCIONES AUXILIARES (helpers)
// ============================================================================

/**
 * Convierte una hora en formato HH:MM a minutos desde medianoche
 */
function parseMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Convierte minutos desde medianoche a formato HH:MM
 */
function formatMinutes(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ============================================================================
// FUNCIÓN 1: DETECCIÓN DE CONFLICTO DE HORARIO
// ============================================================================

/**
 * Detecta si una nueva actividad entra en conflicto con actividades existentes
 * @param {Array} existingActivities - Actividades existentes en el día
 * @param {string} newStart - Hora de inicio de nueva actividad (HH:MM)
 * @param {string} newEnd - Hora de fin de nueva actividad (HH:MM)
 * @param {string} excludeId - ID de actividad a ignorar (para edición)
 * @param {boolean} isCompleted - Si la nueva actividad está completada
 * @returns {Object|null} La actividad conflictiva o null si no hay conflicto
 */
function detectConflict(existingActivities = [], newStart, newEnd, excludeId = null, isCompleted = false) {
  // Actividades completadas no generan conflictos
  if (isCompleted) return null;

  const newStartMin = parseMinutes(newStart);
  const newEndMin = parseMinutes(newEnd);

  // Buscar overlapping con actividades existentes no completadas
  for (const activity of existingActivities) {
    if (activity.id === excludeId || activity.isCompleted) {
      continue; // Ignorar la actividad excluida o completadas
    }

    const existingStart = parseMinutes(activity.startTime);
    const existingEnd = parseMinutes(activity.endTime);

    // Detectar solapamiento: newStart < existingEnd AND newEnd > existingStart
    if (newStartMin < existingEnd && newEndMin > existingStart) {
      return activity;
    }
  }

  return null;
}

// ============================================================================
// FUNCIÓN 2: AUTOLIMPIEZA DE ACTIVIDADES FIJAS CADUCADAS
// ============================================================================

/**
 * Determina si una actividad debe ocultarse (por ser fija y pasada)
 * @param {Object} activity - Actividad a evaluar
 * @param {number} currentHour - Hora actual (0-23)
 * @param {number} currentMinute - Minuto actual (0-59)
 * @returns {boolean} true si debe ocultarse, false si debe mostrarse
 */
function shouldHideExpiredFixedActivity(activity, currentHour, currentMinute) {
  // Las actividades no fijas NUNCA se ocultan
  if (!activity.isFixed) {
    return false;
  }

  // Las actividades académicas/cursos NUNCA se ocultan
  if (activity.category === 'ACADEMIC' || activity.activityType === 'FIJA_PERMANENTE') {
    return false;
  }

  const [endH, endM] = activity.endTime.split(':').map(Number);
  const endTotalMin = endH * 60 + endM;
  const nowTotalMin = currentHour * 60 + currentMinute;

  // Ocultar solo si es fija, no académica, y su hora fin ha pasado
  return nowTotalMin > endTotalMin;
}

// ============================================================================
// FUNCIÓN 3: CÁLCULO DE VENTANA DE NOTIFICACIÓN
// ============================================================================

/**
 * Calcula si una actividad debe generar notificación y de qué tipo
 * @param {Object} activity - Actividad a evaluar
 * @param {number} currentHour - Hora actual (0-23)
 * @param {number} currentMinute - Minuto actual (0-59)
 * @param {Object} firedNotifications - Map de notificaciones ya dispradas
 * @param {boolean} isCompleted - Si la actividad está completada
 * @returns {string|null} Tipo de notificación ('sound-90-min', 'sound-30-min', 'sound-10-min') o null
 */
function calculateNotificationWindow(activity, currentHour, currentMinute, firedNotifications = {}, isCompleted = false) {
  // No notificar si está completada
  if (isCompleted) {
    return null;
  }

  const [startH, startM] = activity.startTime.split(':').map(Number);
  const startTotalMin = startH * 60 + startM;
  const nowTotalMin = currentHour * 60 + currentMinute;

  // Calcular minutos restantes
  const minutesUntil = startTotalMin - nowTotalMin;

  // Ventanas de notificación: 90, 30, 10 minutos
  const windows = [90, 30, 10];

  for (const windowMin of windows) {
    const key = `${activity.id}_${windowMin}`;

    // Si la ventana coincide exactamente y NO ha sido notificada antes
    if (minutesUntil === windowMin && !firedNotifications[key]) {
      return `sound-${windowMin}-min`;
    }
  }

  return null;
}

// ============================================================================
// TEST SUITE
// ============================================================================

const results = [];

function test(description, assertion, expected, actual) {
  const passed = assertion;
  results.push({
    description,
    expected,
    actual,
    passed,
  });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${description}`);
  if (!passed) {
    console.log(`   Expected: ${JSON.stringify(expected)}`);
    console.log(`   Actual: ${JSON.stringify(actual)}`);
  }
}

// ============================================================================
// PRUEBA 1: DETECCIÓN DE CONFLICTO DE HORARIO
// ============================================================================

console.log('\n═══════════════════════════════════════════════════════');
console.log('PRUEBA 1: Detección de conflicto de horario');
console.log('═══════════════════════════════════════════════════════\n');

// Caso 1: Conflicto detectado (7:00-9:00 vs 8:00-10:00)
let conflict1 = detectConflict(
  [{ id: 'act1', startTime: '07:00', endTime: '09:00', isCompleted: false }],
  '08:00',
  '10:00'
);
test(
  'Caso 1: 7:00-9:00 vs 8:00-10:00 → CONFLICTO detectado',
  conflict1 !== null,
  'Conflicto detectado',
  conflict1 ? 'Conflicto detectado' : 'Sin conflicto'
);

// Caso 2: Sin conflicto (adyacentes 7:00-9:00 vs 9:00-11:00)
let conflict2 = detectConflict(
  [{ id: 'act1', startTime: '07:00', endTime: '09:00', isCompleted: false }],
  '09:00',
  '11:00'
);
test(
  'Caso 2: 7:00-9:00 vs 9:00-11:00 → SIN conflicto (adyacentes)',
  conflict2 === null,
  'Sin conflicto',
  conflict2 === null ? 'Sin conflicto' : 'Conflicto detectado'
);

// Caso 3: Sin conflicto (lejos 7:00-9:00 vs 10:00-12:00)
let conflict3 = detectConflict(
  [{ id: 'act1', startTime: '07:00', endTime: '09:00', isCompleted: false }],
  '10:00',
  '12:00'
);
test(
  'Caso 3: 7:00-9:00 vs 10:00-12:00 → SIN conflicto',
  conflict3 === null,
  'Sin conflicto',
  conflict3 === null ? 'Sin conflicto' : 'Conflicto detectado'
);

// Caso 4: Actividad completada no genera conflicto
let conflict4 = detectConflict(
  [{ id: 'act1', startTime: '08:00', endTime: '09:00', isCompleted: true }],
  '08:00',
  '10:00'
);
test(
  'Caso 4: Actividad completada vs nueva → SIN conflicto',
  conflict4 === null,
  'Sin conflicto',
  conflict4 === null ? 'Sin conflicto' : 'Conflicto detectado'
);

// ============================================================================
// PRUEBA 2: AUTOLIMPIEZA DE ACTIVIDADES FIJAS CADUCADAS
// ============================================================================

console.log('\n═══════════════════════════════════════════════════════');
console.log('PRUEBA 2: Autolimpieza de actividades fijas caducadas');
console.log('═══════════════════════════════════════════════════════\n');

// Caso 1: Actividad fija con hora fin pasada → debe ocultarse
let hide1 = shouldHideExpiredFixedActivity(
  { id: 'act1', isFixed: true, category: 'WELLNESS', endTime: '06:00' },
  8, // hora actual 08:00
  30 // minuto actual 30
);
test(
  'Caso 1: Actividad fija con hora fin pasada (6:00 vs hora actual 8:30) → OCULTAR',
  hide1 === true,
  true,
  hide1
);

// Caso 2: Actividad fija con hora fin futura → no debe ocultarse
let hide2 = shouldHideExpiredFixedActivity(
  { id: 'act1', isFixed: true, category: 'WELLNESS', endTime: '18:00' },
  8, // hora actual 08:00
  30 // minuto actual 30
);
test(
  'Caso 2: Actividad fija con hora fin futura (18:00 vs hora actual 8:30) → NO OCULTAR',
  hide2 === false,
  false,
  hide2
);

// Caso 3: Actividad NO fija con hora pasada → NO debe ocultarse
let hide3 = shouldHideExpiredFixedActivity(
  { id: 'act1', isFixed: false, category: 'WELLNESS', endTime: '06:00' },
  8, // hora actual 08:00
  30 // minuto actual 30
);
test(
  'Caso 3: Actividad NO fija con hora pasada → NO OCULTAR',
  hide3 === false,
  false,
  hide3
);

// Caso 4: Actividad académica/curso → NUNCA debe ocultarse
let hide4 = shouldHideExpiredFixedActivity(
  { id: 'act1', isFixed: true, category: 'ACADEMIC', activityType: 'FIJA_PERMANENTE', endTime: '06:00' },
  8, // hora actual 08:00
  30 // minuto actual 30
);
test(
  'Caso 4: Actividad académica/curso con hora pasada → NUNCA OCULTAR',
  hide4 === false,
  false,
  hide4
);

// ============================================================================
// PRUEBA 3: CÁLCULO DE VENTANA DE NOTIFICACIÓN
// ============================================================================

console.log('\n═══════════════════════════════════════════════════════');
console.log('PRUEBA 3: Cálculo de ventana de notificación');
console.log('═══════════════════════════════════════════════════════\n');

// Caso 1: Faltan exactamente 90 min → sound-90-min
let notif1 = calculateNotificationWindow(
  { id: 'act1', startTime: '10:00' },
  8, // hora actual 08:30
  30, // minuto actual 30 (faltan 90 min hasta las 10:00)
  {} // firedNotifications
);
test(
  'Caso 1: Faltan exactamente 90 min → sound-90-min',
  notif1 === 'sound-90-min',
  'sound-90-min',
  notif1
);

// Caso 2: Faltan exactamente 30 min → sound-30-min
let notif2 = calculateNotificationWindow(
  { id: 'act1', startTime: '09:00' },
  8, // hora actual 08:30
  30, // minuto actual 30 (faltan 30 min hasta las 09:00)
  {} // firedNotifications
);
test(
  'Caso 2: Faltan exactamente 30 min → sound-30-min',
  notif2 === 'sound-30-min',
  'sound-30-min',
  notif2
);

// Caso 3: Faltan exactamente 10 min → sound-10-min
let notif3 = calculateNotificationWindow(
  { id: 'act1', startTime: '08:40' },
  8, // hora actual 08:30
  30, // minuto actual 30 (faltan 10 min hasta las 08:40)
  {} // firedNotifications
);
test(
  'Caso 3: Faltan exactamente 10 min → sound-10-min',
  notif3 === 'sound-10-min',
  'sound-10-min',
  notif3
);

// Caso 4: Faltan 45 min → ninguna notificación
let notif4 = calculateNotificationWindow(
  { id: 'act1', startTime: '09:15' },
  8, // hora actual 08:30
  30, // minuto actual 30 (faltan 45 min hasta las 09:15)
  {} // firedNotifications
);
test(
  'Caso 4: Faltan 45 min → ninguna notificación',
  notif4 === null,
  null,
  notif4
);

// Caso 5: Actividad ya notificada → no repetir
let notif5 = calculateNotificationWindow(
  { id: 'act1', startTime: '10:00' },
  8, // hora actual 08:30
  30, // minuto actual 30 (faltan 90 min)
  { 'act1_90': true } // Ya fue notificada
);
test(
  'Caso 5: Actividad ya notificada → no repetir',
  notif5 === null,
  null,
  notif5
);

// ============================================================================
// REPORTE FINAL
// ============================================================================

console.log('\n═══════════════════════════════════════════════════════');
console.log('REPORTE FINAL');
console.log('═══════════════════════════════════════════════════════\n');

const passed = results.filter(r => r.passed).length;
const total = results.length;

console.log(`Pruebas pasadas: ${passed}/${total}`);

if (passed === total) {
  console.log('\n✅ TODAS LAS PRUEBAS PASARON\n');
} else {
  console.log(`\n❌ ${total - passed} prueba(s) fallaron\n`);
}

// Resumen por grupo de pruebas
const conflict_passed = results.slice(0, 4).filter(r => r.passed).length;
const hide_passed = results.slice(4, 8).filter(r => r.passed).length;
const notif_passed = results.slice(8, 13).filter(r => r.passed).length;

console.log('Resumen por grupo:');
console.log(`✅ PRUEBA 1 - Detección de conflicto: ${conflict_passed}/4 casos pasados`);
console.log(`✅ PRUEBA 2 - Autolimpieza de actividades: ${hide_passed}/4 casos pasados`);
console.log(`✅ PRUEBA 3 - Ventanas de notificación: ${notif_passed}/5 casos pasados`);
console.log(`\nTOTAL: ${passed}/${total} pruebas pasaron\n`);

// Exportar para uso en Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    detectConflict,
    shouldHideExpiredFixedActivity,
    calculateNotificationWindow,
    parseMinutes,
    formatMinutes,
  };
}
