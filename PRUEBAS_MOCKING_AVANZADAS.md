# Pruebas Unitarias Avanzadas con Mocking — Mya Dynamics

Este documento resume la suite de pruebas avanzadas basada en simulación manual de dependencias, diseñada para validar la lógica crítica de la aplicación sin usar red real, hardware del dispositivo ni Supabase en vivo.

## Enfoque de aislamiento

La suite implementa un enfoque tipo Moq / Jest Mocks usando JavaScript vanilla. Cada dependencia externa fue reemplazada por mocks controlados:

- Supabase: simulación de `.from().upsert()`, `.select()`, `.update()` y retorno de errores o éxito.
- Reloj del sistema: sustitución del objeto `Date` para forzar horarios y cambios de fecha.
- Cola de notificaciones: modelo en memoria para comprobar limpieza semanal.
- Estado local: objetos planos clonados para simular memoria de UI sin montar React ni navegar por la red.

## Archivo de pruebas

- [tests/advanced-moq-suite.test.js](tests/advanced-moq-suite.test.js)

## Cómo ejecutar

```bash
node tests/advanced-moq-suite.test.js
```

Salida esperada de consola:

```text
✅ PRUEBA 1 - Caducidad fija oculta actividad a las 18:01
✅ PRUEBA 2 - Tarea autónoma no se oculta a las 21:00
✅ PRUEBA 3 - Conflicto detectado y sugerencia de bloque libre
✅ PRUEBA 4 - Error de upsert en Supabase se captura sin romper UI
✅ PRUEBA 5 - Checklist relacional actualiza terminado:true y estado local
✅ PRUEBA 6 - Reinicio semanal limpia cola y re-renderiza actividades fijas

6 tests passed (6/6)
```

---

## Escenario 1: Caducidad fija

### Objetivo
Comprobar que una actividad fija cuya hora final ya pasó se oculta automáticamente al renderizar.

### Mock aplicado
- Se reemplazó `Date` para fijar la hora a `18:01`.
- Se usó una actividad fija no académica con `endTime: '18:00'`.

### Resultado esperado
- La función de visibilidad retorna `true`.
- La actividad no se renderiza en la UI.

### Resultado real en la suite
- `✅ PASA`

---

## Escenario 2: Persistencia de tareas no fijas

### Objetivo
Comprobar que una actividad tipo tarea o proyecto, al no ser fija, permanece visible aunque el reloj avance.

### Mock aplicado
- Se fijó la hora del sistema a `21:00`.
- Se simuló una actividad `es_fijo: false` con categoría `SPECIAL`.

### Resultado esperado
- La función de visibilidad retorna `false`.
- La actividad permanece visible.

### Resultado real en la suite
- `✅ PASA`

---

## Escenario 3: Validación de conflictos

### Objetivo
Verificar que una nueva actividad manual colisiona con un bloque académico existente y que se produce una sugerencia de horario libre.

### Mock aplicado
- Se cargó un arreglo en memoria con cursos fijos.
- Se simuló un curso de la UNSCH como bloque ocupando `07:00-09:00`.
- Se intentó insertar una actividad manual en `08:30-09:30`.

### Resultado esperado
- Se detecta conflicto.
- La inserción se aborta.
- Se devuelve una sugerencia de bloque libre.

### Resultado real en la suite
- `✅ PASA`

---

## Escenario 4: Error en suscripción push

### Objetivo
Simular un fallo en Supabase al hacer upsert de una PushSubscription y comprobar que la UI no se rompe.

### Mock aplicado
- Se simuló el cliente Supabase con `.from('configuraciones_de_usuario').upsert(...)` devolviendo un error 500 / RLS.
- Se atrapó el error dentro de un bloque `try/catch`.

### Resultado esperado
- El error se captura de forma controlada.
- La ejecución continúa sin colapsar el hilo principal.

### Resultado real en la suite
- `✅ PASA`

---

## Escenario 5: Checklist relacional

### Objetivo
Validar que al marcar una tarea vinculada a un curso se dispare la actualización relacional y se marque el estado local como terminado.

### Mock aplicado
- Se simuló la tabla `listas_de_verificacion_de_cursos`.
- Se modeló el estado local en memoria como una lista de cursos con tareas.
- Se interceptó el `upsert` con el parámetro `terminado: true`.

### Resultado esperado
- La tarea local cambia a `done: true`.
- El upsert se llama con `terminado: true`.

### Resultado real en la suite
- `✅ PASA`

---

## Escenario 6: Reinicio semanal a las 00:01

### Objetivo
Verificar que al iniciar una nueva semana el sistema limpie la cola de notificaciones antiguas y reconstruya el conjunto de actividades fijas.

### Mock aplicado
- Se forzó la fecha a lunes `00:01`.
- Se simuló una cola de notificaciones ya disparadas.
- Se usaron actividades fijas inamovibles como `Correr` y `Ejercicio`.

### Resultado esperado
- La cola vieja de notificaciones se vacía.
- Las actividades fijas se reinsertan para la nueva semana.
- Se fuerza un nuevo render key o equivalente.

### Resultado real en la suite
- `✅ PASA`

---

## Evidencia de ejecución

Comando utilizado:

```bash
node tests/advanced-moq-suite.test.js
```

Resultado validado:

```text
6 tests passed (6/6)
```

## Conclusión

La suite cubre la lógica crítica de tiempo, conflictos, persistencia y comportamiento PWA usando mocks aislados. Esto permite repetir las pruebas sin dependencias de Supabase real, backend en vivo o hardware móvil, lo cual es adecuado para el laboratorio y la documentación académica.
