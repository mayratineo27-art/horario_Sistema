# Arquitectura del Sistema — Mya Dynamics

## Resumen ejecutivo
- Tipo: Single Page Application (frontend React + Vite) con un backend Node/Express que actúa como sincronizador, proxy y dispatcher de notificaciones.
- Persistencia: Supabase (Postgres + RLS). Modo local de respaldo (server/data/*.json) si las variables de entorno no están presentes.

## Stack y versiones (extraídas de package.json)
- Frontend: React 19.0.1
- Bundler / Dev: Vite 6.2.3, @vitejs/plugin-react
- Backend runtime / herramientas: Node (runtime), Express 4.x, tsx (dev), node-cron, web-push
- DB client: @supabase/supabase-js ^2.x
- TypeScript: ~5.8.2

## Componentes principales
- Frontend (SPA)
  - `src/App.tsx` — Componente raíz, gestión del estado de sesión, navegación principal, drawer/menu lateral y vistas (`horario` / `mis-cursos`). Referencia: [src/App.tsx](src/App.tsx#L166), [src/App.tsx](src/App.tsx#L1740).
  - `src/components/WelcomeScreen.tsx` — Pantalla inicial / login.
  - `src/components/Onboarding.tsx` — Flujo de onboarding.
  - `src/push.ts` + `public/sw.js` — Registro de Service Worker, suscripción Push y manejo de mensajes en cliente y worker.
  - `src/services/supabaseAuth.ts` — Cliente supabase en cliente, flujos de sign-in (incluye fallback anónimo en desarrollo).

- Backend (API + jobs)
  - `server/index.ts` — API REST (endpoints para cursos, checklist, sincronización push) y cron jobs que ejecutan envío de notificaciones y sincronizaciones periódicas. Ejemplo de cron: [server/index.ts](server/index.ts#L389).
  - `server/supabase.ts` — Wrapper de acceso a Supabase, abstracción para modo local y operaciones CRUD principales.

- Persistencia
  - Supabase (Postgres) con tablas visibles en `supabase/schema.sql` y migraciones en `supabase/migrations/`.
  - Modo fallback: `server/data/*.json` cuando no hay credenciales.

## Diagrama de alto nivel (flujo de datos)

```mermaid
flowchart LR
  U[Usuario (Browser)] -->|Interacciones UI| SPA[src/App.tsx]
  SPA -->|API calls| API[Node/Express - server/index.ts]
  API -->|DB queries| DB[(Supabase / Postgres)]
  API -->|Push send| WebPush[web-push (VAPID)]
  WebPush -->|Push Message| SW[Service Worker - public/sw.js]
  SW -->|Notification| U
  SPA -->|Registro Push| SW
  classDef infra fill:#f8f9fa,stroke:#ddd
  class API,DB,WebPush,SW infra
```

## Detalle: menú lateral (drawer)
- Ubicación: implementado dentro de `src/App.tsx` (estado y renderizado del drawer están alrededor de [src/App.tsx](src/App.tsx#L166) y la plantilla visual en [src/App.tsx](src/App.tsx#L1740)).
- Secciones:
  - Navegación (botones): `Horario` y `Mis Cursos` — cambian `drawerView` y cierran el drawer.
  - Acciones de sistema: `Activar campana` (invoca `handleEnableNotifications`) y `Horas de aviso` (abre modal `showNotificationHoursModal`).
  - Estado / Sincronización: muestra `courseSyncStatus` y `scheduleSyncStatus`.
  - Área de usuario: avatar, nombre, correo, botón `Cerrar sesión` (invoca `signOut()` desde `src/services/supabaseAuth.ts`).
  - Recordatorios: toggles y time inputs que invocan funciones locales para persistir cambios (`guardarConfiguracionRecordatorios()` en `App.tsx`).

- Estados React relevantes que gobiernan el drawer:
  - `drawerOpen: boolean` — controla visibilidad.
  - `drawerView: 'horario'|'mis-cursos'` — controla la vista seleccionada.
  - `courseSyncStatus` / `scheduleSyncStatus` — indicadores de estado de sincronización.
  - `currentUser` — perfil del usuario (avatar_url, name, email).
  - `reminder*` (reminderMorningEnabled, reminderMorningTime, etc.) — configuración de recordatorios.

- Navegación programática:
  - Los botones del drawer llaman `setDrawerView(...)` y `setDrawerOpen(false)` para navegar y cerrar.
  - El header contiene un botón para abrir el drawer (`setDrawerOpen(true)`).

## Backend: cron jobs y envío de notificaciones
- Cron jobs definidos con `node-cron` en `server/index.ts` (ej.: `cron.schedule('* * * * *', ...)`) y corren en el proceso backend. Ver: [server/index.ts](server/index.ts#L389).
- Flujo de notificación:
  1. Cron lee `user_configs` / `user_settings` / tablas de schedule en Supabase.
  2. Calcula qué notificaciones están pendientes según timezone y ventanas.
  3. Usa `web-push` con VAPID keys para enviar notificaciones a la suscripción guardada en `user_configs.subscription`.
- Seguridad: RLS en tablas críticas (`fixed_courses`, `course_checklists`, `user_configs`, etc.) (ver `supabase/schema.sql`).

## Recomendaciones y riesgos observados
- Verificar que las migraciones en `supabase/migrations` se apliquen en el proyecto de Supabase (actualmente hay errores `PGRST205` por tablas faltantes).
- Registrar VAPID keys en `.env` para habilitar envío push real (generar con `npx web-push generate-vapid-keys`).
- Corregir errores TypeScript en `server/supabase.ts` para garantizar `npm run lint` / `tsc --noEmit` limpios.
- Considerar separar cron jobs en un worker dedicado si la carga crece (evita afectar latencia de API).

---
Archivo generado automáticamente: ARQUITECTURA_SISTEMA.md
