# Auditoría Técnica — Problemas detectados

Se documentan dos problemas analizados en el repositorio y las acciones recomendadas/implementadas.

---

═══════════════════════════════════
PROBLEMA: Suscripción push no se guarda en backend
═══════════════════════════════════

📋 PLAN:
1. Archivo(s) auditado(s): `src/push.ts`, `src/App.tsx`, `server/index.ts`, `server/supabase.ts`
2. Causa raíz encontrada: `getApiBaseUrl()` en `src/push.ts` devolvía `http://localhost:8787` en desarrollo, mientras que el backend corre en `port 10000` (ver `server/index.ts`). Las peticiones de registro de suscripción iban a un puerto donde no había servidor, por lo que la suscripción nunca alcanzaba el endpoint `/api/push/subscribe`.
3. Línea(s) problemática(s):
   - `src/push.ts`:
     ```js
     if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
       return 'http://localhost:8787';
     }
     ```
4. Impacto: Las llamadas a `syncSubscriptionToBackend(...)` fallaban (network error / endpoint no encontrado) y la suscripción no se persistía en `user_configs` de Supabase ni en el fallback local.
5. Solución propuesta: Cambiar la URL de desarrollo a `http://localhost:10000` (puerto donde corre el backend en este proyecto). Alternativamente, derivar dinámicamente del `process.env` o `window.location.port` cuando aplique. Implementé el cambio directo al puerto 10000 para coherencia con el entorno local.

💻 IMPLEMENTACIÓN:
// ANTES: `src/push.ts`
```js
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  return 'http://localhost:8787';
}
```
// DESPUÉS: `src/push.ts`
```js
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  // Backend dev server runs on port 10000 by default in this workspace
  // keep hostname deterministic instead of relying on an unused port 8787
  return 'http://localhost:10000';
}
```
// RAZÓN: El front en `localhost` intentaba comunicarse con un puerto incorrecto; redirigiendo al puerto 10000 las llamadas alcanzan el backend que implementa `/api/push/subscribe`, por lo que la suscripción ahora puede guardarse correctamente.

---

═══════════════════════════════════
PROBLEMA: Modal de edición de actividades tiene fondo transparente
═══════════════════════════════════

📋 PLAN:
1. Archivo(s) auditado(s): `src/App.tsx`, `src/index.css`
2. Causa raíz encontrada: El overlay del modal usaba la clase Tailwind `bg-slate-950/70` para crear el fondo semitransparente. En algunos entornos (purge / generación de clases Tailwind) la clase puede no generarse o puede haber un conflicto de estilos que deje el fondo transparente. Para eliminar variabilidad en la generación de clases CSS y asegurar el fondo, añadí un `style` inline con `backgroundColor: 'rgba(15,23,42,0.7)'` en el overlay.
3. Línea(s) problemática(s):
   - `src/App.tsx` overlay:
     ```jsx
     className="fixed inset-0 bg-slate-950/70 z-[110] flex items-center justify-center p-6"
     ```
4. Impacto: El modal aparecía sin overlay oscuro de fondo, provocando malas UX y pérdida de foco visual en la edición de actividades.
5. Solución propuesta: Forzar color de fondo inline en el `motion.div` que actúa como overlay para evitar problemas de Tailwind CSS JIT / purge. Mantener el modal interior con `bg-white` y `id="modal-editar-actividad"`.

💻 IMPLEMENTACIÓN:
// ANTES: `src/App.tsx`
```jsx
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  className="fixed inset-0 bg-slate-950/70 z-[110] flex items-center justify-center p-6"
  onClick={requestCloseEditor}
>
```
// DESPUÉS: `src/App.tsx`
```jsx
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  className="fixed inset-0 z-[110] flex items-center justify-center p-6"
  // Add an explicit inline background color to avoid Tailwind class generation / purge edge-cases
  style={{ backgroundColor: 'rgba(15,23,42,0.7)' }}
  onClick={requestCloseEditor}
>
```
// RAZÓN: Un `style` inline garantiza que el overlay tenga siempre un fondo semitransparente independiente de la generación de clases CSS. El modal interior mantiene `bg-white` y el `id` `modal-editar-actividad` para estilos adicionales.

---

Acciones realizadas en el repo:
- Patch aplicado a `src/push.ts` (fix puerto desarrollo)
- Patch aplicado a `src/App.tsx` (fondo overlay inline)
- Creado este archivo `AUDITORIA_TECNICA.md` con el resumen y evidencia

Si deseas, puedo también:
- Cambiar `getApiBaseUrl()` para leer `VITE_API_BASE_URL` o `VITE_API_PORT` de forma parametrizable (mejor para CI/entornos locales),
- Añadir tests unitarios o e2e para ruta `/api/push/subscribe`,
- Verificar en tu entorno local (ejecutar `npm run dev:all`) y reproducir el flujo de registro de suscripción.

Archivo generado automáticamente: AUDITORIA_TECNICA.md
