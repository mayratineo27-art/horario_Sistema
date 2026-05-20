## 1. REQUISITOS FUNCIONALES (RF)

1. RF-01: Gestión de horario semanal por día
- Descripción: Permite definir un horario semanal compuesto por días (Lunes–Domingo), cada uno con una lista de actividades con hora de inicio/fin, categoría y tipo de actividad. El sistema genera un `INITIAL_SCHEDULE` con actividades fijas (por ejemplo el bloque matutino) y lo utiliza como fuente por defecto.
- Archivo fuente: [src/constants.ts](src/constants.ts#L80-L110)

2. RF-02: Autolimpieza de actividades fijas caducadas
- Descripción: Tarea programada que ejecuta una "limpieza" semanal (reset) para actividades fijas; actualiza la fecha de último reset y registra la operación para mantener consistencia del estado local/Remoto.
- Archivo fuente: [server/index.ts](server/index.ts#L649-L662)

3. RF-03: Sistema de notificaciones push con ventanas de 90, 30 y 10 minutos
- Descripción: Envía notificaciones push a los usuarios en ventanas de tiempo antes de la actividad (90, 30, 10 minutos). El backend mantiene la lista de usuarios suscritos y dispara las notificaciones; el Service Worker y el cliente reproducen sonidos/vibraciones distintas según ventana.
- Archivo fuente: [server/index.ts](server/index.ts#L29), [public/sw.js](public/sw.js#L1-L40), [src/push.ts](src/push.ts#L1-L40)

4. RF-04: Persistencia de checklists de cursos en Supabase
- Descripción: Las listas de verificación (checklists) de cada curso se guardan/actualizan en la tabla `course_checklists` de Supabase mediante endpoints y funciones de persistencia en el servidor.
- Archivo fuente: [server/supabase.ts](server/supabase.ts#L520-L528), [server/index.ts](server/index.ts#L380-L381), [src/push.ts](src/push.ts#L211-L219)

5. RF-05: Detección y resolución de conflictos de horario
- Descripción: Al crear/editar una actividad se detectan solapamientos (conflictos) con actividades existentes (salvo si la nueva es `FLEXIBLE`) y se sugiere una franja alternativa (mejor hueco) calculada por distancia al horario deseado.
- Archivo fuente: [src/App.tsx](src/App.tsx#L405-L422), [src/App.tsx](src/App.tsx#L387-L402)

6. RF-06: Autenticación con Google via Supabase Auth
- Descripción: El cliente se integra con Supabase Auth para gestionar sesión de usuario y cambios de estado de autenticación (flujo OAuth); el código espera un proveedor (Google) configurado en el Dashboard de Supabase.
- Archivo fuente: [src/App.tsx](src/App.tsx#L60-L67)

7. RF-07: Recordatorios de tareas pendientes (mañana, tarde, noche)
- Descripción: Recordatorios programados en tres ventanas (mañana/afternoon/evening). El backend consulta la configuración del usuario y envía notificaciones resumidas de tareas pendientes según la hora configurada.
- Archivo fuente: [server/index.ts](server/index.ts#L614-L636)

8. RF-08: Registro y sincronización de suscripción push desde cliente
- Descripción: El cliente registra el `ServiceWorker`, suscribe al push con la VAPID key y sincroniza la suscripción hacia el endpoint `/api/push/subscribe` del backend con el `userId` y `timezone`.
- Archivo fuente: [src/push.ts](src/push.ts#L1-L40), [src/push.ts](src/push.ts#L60-L95)

9. RF-09: Reproducción de señales sonoras diferenciadas por ventana
- Descripción: Cliente y Service Worker definen tags de sonido para 90/30/10 minutos y el cliente reproduce tonos distintos (gentle, medium, urgent) según `soundTag` enviado desde el SW.
- Archivo fuente: [src/push.ts](src/push.ts#L211-L260), [public/sw.js](public/sw.js#L20-L50)

10. RF-10: Sincronización del horario del usuario con backend
- Descripción: El cliente puede sincronizar el `schedule` del usuario al backend mediante endpoint `/api/push/schedule` para persistencia remota.
- Archivo fuente: [src/push.ts](src/push.ts#L140-L156), [server/index.ts](server/index.ts#L73-L82)


## 2. REQUISITOS NO FUNCIONALES (RNF)

1. RNF-01: Disponibilidad / Cron frecuente
- Descripción: El backend ejecuta tareas cada minuto para evaluar y enviar notificaciones, buscando alta puntualidad en el despacho de alertas.
- Evidencia en código: [server/index.ts](server/index.ts#L389) (cron.schedule('* * * * *', ...))

2. RNF-02: Seguridad en endpoints push
- Descripción: Endpoints de push requieren un token en la cabecera `x-mya-push-token` para autorizar peticiones, proporcionando un control de acceso básico.
- Evidencia en código: [server/index.ts](server/index.ts#L85)

3. RNF-03: Resiliencia / Verificación de VAPID
- Descripción: El sistema valida la presencia de claves VAPID y evita fallos silenciosos; si faltan, emite advertencia y protege llamadas que dependen de ellas.
- Evidencia en código: [server/index.ts](server/index.ts#L18-L26)

4. RNF-04: Idempotencia en persistencia (UPSERT / onConflict)
- Descripción: Uso de `upsert` y `onConflict` en operaciones Supabase para evitar duplicados y permitir reintentos seguros.
- Evidencia en código: [server/supabase.ts](server/supabase.ts#L506-L516), [server/supabase.ts](server/supabase.ts#L648)

5. RNF-05: Offline/Progressive Web App support
- Descripción: Incluye Service Worker que muestra notificaciones, gestiona vibración y comunica con clientes mediante `postMessage`, facilitando comportamiento en segundo plano.
- Evidencia en código: [public/sw.js](public/sw.js#L1-L30), [src/push.ts](src/push.ts#L1-L12)

6. RNF-06: Usabilidad — señales diferenciadas
- Descripción: Diferenciación sonora y de vibración según ventana y si la actividad es ejercicio; mejora la interpretabilidad de alertas.
- Evidencia en código: [src/push.ts](src/push.ts#L230-L260), [public/sw.js](public/sw.js#L1-L25)

7. RNF-07: Rendimiento — cálculo de huecos óptimos
- Descripción: Cálculo de huecos (`gaps`) ordenado por distancia para sugerir la mejor franja, algoritmo O(n log n) en el número de actividades del día.
- Evidencia en código: [src/App.tsx](src/App.tsx#L387-L402)


## 3. REGLAS DE NEGOCIO (RN)

- RN-01: Autolimpieza de actividades fijas (función m3 o equivalente)
  - Definición: Cada Lunes a las 05:00 AM se ejecuta un proceso que marca el `last reset` y realiza las acciones necesarias para limpiar/renovar actividades fijas.
  - Evidencia: [server/index.ts](server/index.ts#L649-L662)

- RN-02: Inamovilidad de actividades FIJA_PERMANENTE
  - Definición: Actividades marcadas como `FIJA_PERMANENTE` no deben considerarse en conflictos para ser movidas; son inamovibles por diseño.
  - Evidencia: [src/constants.ts](src/constants.ts#L1-L30) (definición `ActivityType.FIJA_PERMANENTE`) y [src/App.tsx](src/App.tsx#L405-L422) (detectar conflictos ignorando `FLEXIBLE`).

- RN-03: Ventanas de notificación [90, 30, 10] minutos
  - Definición: Las notificaciones deben actuar en ventanas predefinidas de 90, 30 y 10 minutos antes de la actividad, aplicando reglas de envío, sonido y vibración.
  - Evidencia: [server/index.ts](server/index.ts#L29), [src/App.tsx](src/App.tsx#L1117), [public/sw.js](public/sw.js#L10-L25)

- RN-04: Persistencia obligatoria de tareas de cursos en Supabase
  - Definición: Las listas de verificación de cursos se deben guardar en la tabla `course_checklists` y no depender únicamente del almacenamiento local.
  - Evidencia: [server/supabase.ts](server/supabase.ts#L520-L528), [supabase/schema.sql](supabase/schema.sql#L24-L38)

- RN-05: Conflicto de horario con sugerencia automática
  - Definición: Cuando se detecta un conflicto de horario, el sistema debe calcular y proponer la mejor franja alternativa (mejor hueco) basada en proximidad al horario deseado.
  - Evidencia: [src/App.tsx](src/App.tsx#L387-L402), [src/App.tsx](src/App.tsx#L405-L422)


## 4. HISTORIAS DE USUARIO (HU)

1. "Como estudiante, quiero gestionar mi horario semanal por día para ver mis actividades organizadas y planificar mi semana."
2. "Como usuario, quiero recibir notificaciones 90/30/10 minutos antes de una actividad para prepararme con suficiente antelación."
3. "Como usuario, quiero que las actividades académicas fijas no se muevan automáticamente para preservar mis clases programadas."
4. "Como usuario, quiero que las listas de tareas de mis cursos se guarden en la nube para acceder desde diferentes dispositivos."
5. "Como usuario, quiero que el sistema detecte conflictos y me sugiera una franja alternativa para reubicar la actividad rápidamente."
6. "Como administrador, quiero que las actividades fijas se limpien semanalmente para mantener el estado actualizado sin intervención manual."
7. "Como usuario, quiero recordatorios de tareas pendientes por la mañana, tarde y noche para mantener el progreso en mis entregas."
8. "Como usuario móvil, quiero que las notificaciones reproduzcan un sonido y vibren distinto según la urgencia, para identificar rápidamente la importancia."
9. "Como usuario, quiero poder sincronizar mi horario con el servidor para tener copia de seguridad y activar notificaciones desde el backend."
10. "Como desarrollador, quiero que las llamadas al backend de notificaciones requieran un token (`x-mya-push-token`) para evitar uso no autorizado."

