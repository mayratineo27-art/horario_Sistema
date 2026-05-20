export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    return null;
  }

  const registration = await navigator.serviceWorker.register('/sw.js');
  return registration;
}

async function getApiBaseUrl() {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {};
  
  // 1. Check if explicitly configured in .env (VITE_API_BASE_URL)
  if (env.VITE_API_BASE_URL) {
    return env.VITE_API_BASE_URL;
  }

  // 2. In development (localhost), use local backend
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    // Backend dev server runs on port 10000 by default in this workspace
    // keep hostname deterministic instead of relying on an unused port 8787
    return 'http://localhost:10000';
  }

  // 3. Default to Render backend for production (Vercel, etc)
  return 'https://horarioapp-ows5.onrender.com';
}

async function getApiToken() {
  const env = (import.meta as any).env || {};
  return env.VITE_PUSH_API_TOKEN || 'mya_2026_9fJ2kL8pQw7xZr4nT6yV3bH1';
}

async function buildHeaders(extraHeaders: Record<string, string> = {}) {
  const token = await getApiToken();
  return {
    ...extraHeaders,
    ...(token ? { 'x-mya-push-token': token } : {}),
  };
}

export async function getVapidPublicKey(): Promise<string> {
  const baseUrl = await getApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/push/public-key`);
  if (!res.ok) {
    throw new Error('No se pudo leer la VAPID key del backend.');
  }
  const data = (await res.json()) as { publicKey: string };
  return data.publicKey;
}

export async function subscribeToPush(registration: ServiceWorkerRegistration): Promise<PushSubscription> {
  const vapidPublicKey = await getVapidPublicKey();
  const convertedKey = urlBase64ToUint8Array(vapidPublicKey);

  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    return existing;
  }

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: convertedKey as BufferSource,
  });
}

export async function syncSubscriptionToBackend(payload: {
  subscription: PushSubscription;
  timezone: string;
  schedule: unknown;
  userId?: string;
}) {
  const baseUrl = await getApiBaseUrl();
  
  // Serialize PushSubscription completely to preserve all fields
  const serializedPayload = {
    subscription: {
      endpoint: payload.subscription.endpoint,
      keys: {
  p256dh: payload.subscription.getKey?.('p256dh')
    ? btoa(String.fromCharCode(...new Uint8Array(payload.subscription.getKey('p256dh')!)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    : '',
  auth: payload.subscription.getKey?.('auth')
    ? btoa(String.fromCharCode(...new Uint8Array(payload.subscription.getKey('auth')!)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    : '',
},
      expirationTime: payload.subscription.expirationTime || null,
    },
    timezone: payload.timezone,
    schedule: payload.schedule,
    userId: payload.userId,
  };

  const res = await fetch(`${baseUrl}/api/push/subscribe`, {
    method: 'POST',
    headers: await buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(serializedPayload),
  });

  if (!res.ok) {
    const error = await res.text();
    console.error('[Push] Backend error:', error);
    throw new Error('No se pudo guardar la suscripcion en backend.');
  }
  
  const result = await res.json();
  console.log('[Push] Subscription registered:', result.message);
}

export async function syncNotificationHours(notificationHourStart: number, notificationHourEnd: number, userId?: string) {
  const baseUrl = await getApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/push/notification-hours`, {
    method: 'POST',
    headers: await buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ notificationHourStart, notificationHourEnd, userId }),
  });

  if (!res.ok) {
    throw new Error('No se pudieron guardar las horas de notificacion en backend.');
  }
}

export async function syncReminderSettingsToBackend(payload: {
  userId?: string;
  reminder_morning: string;
  reminder_afternoon: string;
  reminder_evening: string;
  reminder_morning_enabled: boolean;
  reminder_afternoon_enabled: boolean;
  reminder_evening_enabled: boolean;
}) {
  const baseUrl = await getApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/push/reminder-settings`, {
    method: 'POST',
    headers: await buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[Push] Reminder settings backend error:', errorText);
    throw new Error('No se pudieron guardar los recordatorios en backend.');
  }
}

export async function syncScheduleToBackend(payload: { timezone: string; schedule: unknown; userId?: string }) {
  const baseUrl = await getApiBaseUrl();
  await fetch(`${baseUrl}/api/push/schedule`, {
    method: 'POST',
    headers: await buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
}

export async function scheduleNewNotification(payload: { timezone: string; schedule: unknown; userId?: string }) {
  return syncScheduleToBackend(payload);
}

export async function sendTestPush(userId?: string) {
  const baseUrl = await getApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/push/test`, {
    method: 'POST',
    headers: await buildHeaders({ 'Content-Type': 'application/json' }),
    body: userId ? JSON.stringify({ userId }) : undefined,
  });
  if (!res.ok) {
    throw new Error('No se pudo enviar la notificacion de prueba.');
  }
}

export async function loadCoursesFromBackend(userId?: string) {
  const baseUrl = await getApiBaseUrl();
  const url = userId ? `${baseUrl}/api/courses?userId=${encodeURIComponent(userId)}` : `${baseUrl}/api/courses`;
  const res = await fetch(url, {
    headers: await buildHeaders(),
  });

  if (!res.ok) {
    throw new Error('No se pudieron cargar los cursos.');
  }

  return res.json();
}

export async function syncCoursesToBackend(payload: { courses: unknown }) {
  const baseUrl = await getApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/courses/sync`, {
    method: 'POST',
    headers: await buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error('No se pudieron sincronizar los cursos.');
  }
}

export async function saveCourseChecklistToBackend(courseCode: string, items: unknown, completed = false, userId?: string) {
  const baseUrl = await getApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/courses/${encodeURIComponent(courseCode)}/checklist`, {
    method: 'PUT',
    headers: await buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ items, completed, userId }),
  });

  if (!res.ok) {
    throw new Error('No se pudo guardar la lista del curso.');
  }

  return res.json();
}

/**
 * Plays an audio cue based on the notification type and time window
 * 90 min before: gentle beep
 * 30 min before: medium alert tone
 * 10 min before: urgent alarm tone
 * For exercise: higher pitch / longer duration
 */
export function playNotificationSound(soundTag: string, isExercise: boolean = false): void {
  try {
    // Create audio context and oscillators for different sound cues
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = audioContext.currentTime;

    const playTone = (frequency: number, duration: number, volume: number = 0.3, delay: number = 0) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();

      osc.connect(gain);
      gain.connect(audioContext.destination);

      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.01, now + delay + duration);

      osc.start(now + delay);
      osc.stop(now + delay + duration);
    };

    if (soundTag === 'sound-90-min') {
      // Gentle beep: 400Hz, 300ms
      playTone(400, 0.3, 0.2);
    } else if (soundTag === 'sound-30-min') {
      // Medium alert: 600Hz, 400ms + repeat
      playTone(600, 0.2, 0.3);
      playTone(600, 0.2, 0.3, 0.3); // Second beep after 300ms
    } else if (soundTag === 'sound-10-min') {
      // Urgent alarm: 800Hz with variations
      if (isExercise) {
        // Extra urgent for exercise
        playTone(800, 0.15, 0.5);
        playTone(900, 0.15, 0.5, 0.15);
        playTone(800, 0.15, 0.5, 0.3);
      } else {
        playTone(800, 0.2, 0.4);
        playTone(800, 0.2, 0.4, 0.2);
        playTone(800, 0.2, 0.4, 0.4);
      }
    }
  } catch (error) {
    console.warn('[Audio] Could not play notification sound:', error);
  }
}

/**
 * Sets up a listener for messages from the Service Worker
 * Called when the SW wants to play a sound notification
 */
export function setupServiceWorkerMessageListener(
  onSoundMessage: (data: { soundTag: string; isExercise: boolean; minutesUntil: number }) => void
): void {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  navigator.serviceWorker.addEventListener('message', (event) => {
    const { type, soundTag, isExercise, minutesUntil } = event.data || {};

    if (type === 'play-sound') {
      console.log('[Client] SW message received: play-sound', { soundTag, isExercise, minutesUntil });
      onSoundMessage({ soundTag: soundTag || 'sound-default', isExercise: !!isExercise, minutesUntil: minutesUntil || 0 });
    }
  });
}

