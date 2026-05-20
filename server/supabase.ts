import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { INITIAL_SCHEDULE } from '../src/constants.ts';

dotenv.config({ override: true });

function sanitizeEnv(value: string): string {
  return value.trim().replace(/^['\"]+|['\"]+$/g, '');
}

const SUPABASE_URL = sanitizeEnv(process.env.SUPABASE_URL || '');
const SUPABASE_ANON_KEY = sanitizeEnv(process.env.SUPABASE_ANON_KEY || '');
const STORAGE_MODE = (process.env.STORAGE_MODE || (SUPABASE_URL && SUPABASE_ANON_KEY ? 'supabase' : 'local')).toLowerCase();
const SUPABASE_CONFIGURED = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
const USE_SUPABASE = SUPABASE_CONFIGURED;

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const DATA_FILE = path.join(DATA_DIR, 'user-config.json');
const COURSE_DATA_FILE = path.join(DATA_DIR, 'course-store.json');
const COURSE_USER_KEY = process.env.COURSE_USER_KEY || 'anonimo';

const COURSE_TABLES = {
  fixedCourses: 'fixed_courses',
  courseChecklists: 'course_checklists',
} as const;

const COURSE_COLS = {
  id: 'id',
  userKey: 'user_key',
  courseCode: 'course_code',
  name: 'name',
  category: 'category',
  dayOfWeek: 'day_of_week',
  startTime: 'start_time',
  endTime: 'end_time',
  esFijo: 'es_fijo',
  isExercise: 'is_exercise',
  emoji: 'emoji',
  checklist: 'checklist',
  customColor: 'custom_color',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  courseId: 'course_id',
  items: 'items',
  completed: 'completed',
} as const;

export let supabase: ReturnType<typeof createClient> | null = null;

function validateSupabaseUrl(urlValue: string): void {
  try {
    const parsed = new URL(urlValue);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error(`Unsupported protocol: ${parsed.protocol}`);
    }
  } catch {
    throw new Error(`Invalid SUPABASE_URL value: ${urlValue || '(empty)'}`);
  }
}

function getOrCreateSupabaseClient() {
  if (!USE_SUPABASE) {
    return null;
  }
  if (supabase) {
    return supabase;
  }

  validateSupabaseUrl(SUPABASE_URL);
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    // Node runtimes can miss a global WebSocket constructor for realtime.
    realtime: {
      transport: WebSocket as any,
    } as any,
  });
  return supabase;
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(getDefaultConfig(), null, 2), 'utf-8');
  }
}

function loadConfigFromFile(): UserConfig {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as UserConfig;
    return {
      ...getDefaultConfig(),
      ...parsed,
      sentByDate: parsed.sentByDate || {},
      schedule: normalizeScheduleCourseDuplicates(parsed.schedule || []),
      subscription: parsed.subscription || null,
      timezone: parsed.timezone || 'America/Santo_Domingo',
    };
  } catch {
    return getDefaultConfig();
  }
}

function saveConfigToFile(config: UserConfig) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

function ensureCourseDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(COURSE_DATA_FILE)) {
    fs.writeFileSync(COURSE_DATA_FILE, JSON.stringify({ fixedCourses: [], courseChecklists: {} }, null, 2), 'utf-8');
  }
}

function loadCourseStore() {
  ensureCourseDataFile();
  try {
    const raw = fs.readFileSync(COURSE_DATA_FILE, 'utf-8');
    return JSON.parse(raw) as { fixedCourses: FixedCourseRow[]; courseChecklists: Record<string, CourseChecklistRow> };
  } catch {
    return { fixedCourses: [], courseChecklists: {} };
  }
}

function saveCourseStore(store: { fixedCourses: FixedCourseRow[]; courseChecklists: Record<string, CourseChecklistRow> }) {
  ensureCourseDataFile();
  fs.writeFileSync(COURSE_DATA_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

function isMissingSchemaError(error: any) {
  return error?.code === 'PGRST204' || error?.code === 'PGRST205';
}

export async function initializeDatabase() {
  if (!USE_SUPABASE) {
    ensureDataFile();
    ensureCourseDataFile();
    console.log('✓ Local storage mode enabled (server/data/user-config.json)');
    console.log(`Storage diagnostics: STORAGE_MODE=${STORAGE_MODE}, SUPABASE_URL=${SUPABASE_URL ? 'set' : 'missing'}, SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY ? 'set' : 'missing'}`);
    return;
  }

  try {
    getOrCreateSupabaseClient();
  } catch (error) {
    console.error('Supabase client init failed:', error);
    throw error;
  }

  if (!supabase) {
    throw new Error('Supabase is configured but the client could not be initialized. Check SUPABASE_URL and SUPABASE_ANON_KEY.');
  }

  console.log('✓ Supabase client initialized');
  console.log(`Storage diagnostics: STORAGE_MODE=${STORAGE_MODE}, SUPABASE_URL=${SUPABASE_URL ? 'set' : 'missing'}, SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY ? 'set' : 'missing'}`);
}

export interface Activity {
  id: string;
  name: string;
  category?: string;
  startTime: string;
  endTime: string;
  isFixed?: boolean;
  esFijo?: boolean;
  courseId?: string;
  emoji?: string;
  customColor?: string;
}

export interface DaySchedule {
  day: string;
  activities: Activity[];
}

export interface UserConfig {
  timezone: string;
  schedule: DaySchedule[];
  subscription: unknown | null;
  sentByDate: Record<string, Record<string, boolean>>;
  notificationHourStart: number;
  notificationHourEnd: number;
}

export interface CourseTaskItem {
  id: string;
  text: string;
  done: boolean;
}

export interface FixedCourseRow {
  id?: string;
  user_key: string;
  course_code: string;
  name: string;
  category: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  es_fijo: boolean;
  is_exercise: boolean;
  emoji: string;
  checklist: CourseTaskItem[] | string[];
  custom_color?: string | null;
  updated_at?: string;
}

export interface CourseChecklistRow {
  id?: string;
  user_key: string;
  course_id?: string;
  course_code: string;
  items: CourseTaskItem[];
  completed: boolean;
  updated_at?: string;
}

export interface CourseRecord {
  id?: string;
  courseCode: string;
  name: string;
  category: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  esFijo: boolean;
  isExercise: boolean;
  emoji: string;
  checklist: CourseTaskItem[];
  customColor?: string | null;
  completed: boolean;
}

function normalizeTasks(value: unknown): CourseTaskItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (typeof item === 'string') {
        return { id: `task-${index}`, text: item, done: false } satisfies CourseTaskItem;
      }
      if (item && typeof item === 'object') {
        const candidate = item as Partial<CourseTaskItem>;
        return {
          id: candidate.id || `task-${index}`,
          text: candidate.text || '',
          done: !!candidate.done,
        } satisfies CourseTaskItem;
      }
      return null;
    })
    .filter((item): item is CourseTaskItem => !!item && !!item.text.trim());
}

function extractCourseCode(value: string): string | null {
  const codeMatch = value.match(/\bIS-\d+\b/);
  if (codeMatch) {
    return codeMatch[0];
  }

  const parenMatch = value.match(/\((IS-\d+)\)/);
  return parenMatch ? parenMatch[1] : null;
}

function buildCoursesFromSchedule(schedule: DaySchedule[]): CourseRecord[] {
  const courseMap = new Map<string, CourseRecord>();

  for (const day of schedule) {
    for (const activity of day.activities) {
      const courseCode = activity.name.includes('IS-') || activity.courseId
        ? (activity.courseId || extractCourseCode(activity.name))
        : null;

      if (!courseCode || courseMap.has(courseCode)) {
        continue;
      }

      courseMap.set(courseCode, {
        id: undefined,
        courseCode,
        name: activity.name.replace(/\s*\(IS-\d+\)/, '').trim(),
        category: activity.category || 'Académico',
        dayOfWeek: day.day,
        startTime: activity.startTime,
        endTime: activity.endTime,
        esFijo: !!activity.isFixed || !!activity.esFijo,
        isExercise: activity.name.toLowerCase().includes('ejercicio') || activity.emoji === '💪',
        emoji: activity.emoji || '📘',
        checklist: [],
        customColor: (activity as any).customColor || null,
        completed: false,
      });
    }
  }

  return Array.from(courseMap.values());
}

function courseRowToRecord(course: FixedCourseRow, checklist: CourseChecklistRow | null): CourseRecord {
  return {
    id: course.id,
    courseCode: course.course_code,
    name: course.name,
    category: course.category,
    dayOfWeek: course.day_of_week,
    startTime: course.start_time,
    endTime: course.end_time,
    esFijo: course.es_fijo,
    isExercise: course.is_exercise,
    emoji: course.emoji,
    checklist: checklist ? checklist.items : normalizeTasks(course.checklist),
    customColor: (course as any).custom_color || null,
    completed: checklist ? checklist.completed : false,
  };
}

export async function loadCourses(userKey?: string): Promise<CourseRecord[]> {
  const resolvedUserKey = (userKey || COURSE_USER_KEY).trim() || 'anonimo';

  if (!USE_SUPABASE || !supabase) {
    const localStore = loadCourseStore();
    if (localStore.fixedCourses.length > 0) {
      return localStore.fixedCourses.map(course => courseRowToRecord(course, localStore.courseChecklists[course.course_code] || null));
    }

    const config = loadConfigFromFile();
    const scheduleSource = Array.isArray(config.schedule) && config.schedule.length > 0 ? config.schedule : INITIAL_SCHEDULE;
    const seedCourses = buildCoursesFromSchedule(scheduleSource as DaySchedule[]);
    if (seedCourses.length > 0) {
      await saveCourses(seedCourses);
      return seedCourses;
    }

    return [];
  }

  try {
    const { data: fixedCourses, error: fixedCoursesError } = await supabase
      .from(COURSE_TABLES.fixedCourses)
      .select('*')
      .order(COURSE_COLS.courseCode, { ascending: true });

    if (fixedCoursesError) throw fixedCoursesError;

    const { data: checklists, error: checklistsError } = await supabase
      .from(COURSE_TABLES.courseChecklists)
      .select('*')
      .eq(COURSE_COLS.userKey, resolvedUserKey);

    if (checklistsError) throw checklistsError;

    if (!fixedCourses || fixedCourses.length === 0) {
      const scheduleSource = INITIAL_SCHEDULE;
      const seedCourses = buildCoursesFromSchedule(scheduleSource as DaySchedule[]);
      if (seedCourses.length > 0) {
        await saveCourses(seedCourses);
        return seedCourses;
      }
    }

    const checklistsByCode = new Map<string, CourseChecklistRow>();
    for (const row of checklists || []) {
      checklistsByCode.set(row.course_code, {
        id: row[COURSE_COLS.id],
        user_key: row[COURSE_COLS.userKey],
        course_id: row[COURSE_COLS.courseId],
        course_code: row[COURSE_COLS.courseCode],
        items: normalizeTasks(row[COURSE_COLS.items]),
        completed: !!row[COURSE_COLS.completed],
        updated_at: row[COURSE_COLS.updatedAt],
      });
    }

    return (fixedCourses || []).map((course: any) =>
      courseRowToRecord(
        {
          id: course[COURSE_COLS.id],
          user_key: course[COURSE_COLS.userKey],
          course_code: course[COURSE_COLS.courseCode],
          name: course[COURSE_COLS.name],
          category: course[COURSE_COLS.category],
          day_of_week: course[COURSE_COLS.dayOfWeek],
          start_time: course[COURSE_COLS.startTime],
          end_time: course[COURSE_COLS.endTime],
          es_fijo: course[COURSE_COLS.esFijo],
          is_exercise: course[COURSE_COLS.isExercise],
          emoji: course[COURSE_COLS.emoji],
          checklist: normalizeTasks(course[COURSE_COLS.checklist]),
          updated_at: course[COURSE_COLS.updatedAt],
        },
        checklistsByCode.get(course.course_code) || null,
      ),
    );
  } catch (error) {
    if (isMissingSchemaError(error)) {
      console.error('Supabase schema missing for courses. Local fallback is disabled in Supabase mode.');
    }
    console.error('Error loading courses:', error);
    throw error;
  }
}

export async function saveCourses(courses: CourseRecord[]): Promise<void> {
  if (!USE_SUPABASE || !supabase) {
    const store = loadCourseStore();
    const nextFixedCourses: FixedCourseRow[] = [];
    const nextChecklists: Record<string, CourseChecklistRow> = { ...store.courseChecklists };

    for (const course of courses) {
      const row: FixedCourseRow = {
        id: store.fixedCourses.find(item => item.course_code === course.courseCode)?.id,
        user_key: COURSE_USER_KEY,
        course_code: course.courseCode,
        name: course.name,
        category: course.category,
        day_of_week: course.dayOfWeek,
        start_time: course.startTime,
        end_time: course.endTime,
        es_fijo: course.esFijo,
        is_exercise: course.isExercise,
        emoji: course.emoji,
        checklist: course.checklist,
        custom_color: course.customColor || null,
        updated_at: new Date().toISOString(),
      };
      nextFixedCourses.push(row);
      nextChecklists[course.courseCode] = {
        id: nextChecklists[course.courseCode]?.id,
        user_key: COURSE_USER_KEY,
        course_code: course.courseCode,
        items: course.checklist,
        completed: course.completed,
        updated_at: new Date().toISOString(),
      };
    }

    saveCourseStore({ fixedCourses: nextFixedCourses, courseChecklists: nextChecklists });
    return;
  }

  try {
    for (const course of courses) {
      const existingCourse = await supabase
        .from(COURSE_TABLES.fixedCourses)
        .select(COURSE_COLS.id)
        .eq(COURSE_COLS.courseCode, course.courseCode)
        .maybeSingle();

      let courseId = existingCourse.data?.[COURSE_COLS.id] || null;

      if (courseId) {
        const { error } = await supabase.from(COURSE_TABLES.fixedCourses).update({
          [COURSE_COLS.name]: course.name,
          [COURSE_COLS.category]: course.category,
          [COURSE_COLS.dayOfWeek]: course.dayOfWeek,
          [COURSE_COLS.startTime]: course.startTime,
          [COURSE_COLS.endTime]: course.endTime,
          [COURSE_COLS.esFijo]: course.esFijo,
          [COURSE_COLS.isExercise]: course.isExercise,
          [COURSE_COLS.emoji]: course.emoji,
          [COURSE_COLS.checklist]: course.checklist,
          [COURSE_COLS.customColor]: course.customColor || null,
          [COURSE_COLS.updatedAt]: new Date().toISOString(),
        }).eq(COURSE_COLS.id, courseId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase.from(COURSE_TABLES.fixedCourses).insert({
          [COURSE_COLS.userKey]: 'shared',
          [COURSE_COLS.courseCode]: course.courseCode,
          [COURSE_COLS.name]: course.name,
          [COURSE_COLS.category]: course.category,
          [COURSE_COLS.dayOfWeek]: course.dayOfWeek,
          [COURSE_COLS.startTime]: course.startTime,
          [COURSE_COLS.endTime]: course.endTime,
          [COURSE_COLS.esFijo]: course.esFijo,
          [COURSE_COLS.isExercise]: course.isExercise,
          [COURSE_COLS.emoji]: course.emoji,
          [COURSE_COLS.checklist]: course.checklist,
          [COURSE_COLS.customColor]: course.customColor || null,
          [COURSE_COLS.updatedAt]: new Date().toISOString(),
        }).select('id').single();

        if (error) throw error;
        courseId = data[COURSE_COLS.id];
      }

      const { error: checklistError } = await supabase.from(COURSE_TABLES.courseChecklists).upsert({
        [COURSE_COLS.userKey]: 'shared',
        [COURSE_COLS.courseId]: courseId,
        [COURSE_COLS.courseCode]: course.courseCode,
        [COURSE_COLS.items]: course.checklist,
        [COURSE_COLS.completed]: course.completed,
        [COURSE_COLS.updatedAt]: new Date().toISOString(),
      }, { onConflict: `${COURSE_COLS.userKey},${COURSE_COLS.courseId}` });

      if (checklistError) throw checklistError;
    }
  } catch (error) {
    if (isMissingSchemaError(error)) {
      console.error('Supabase schema missing for courses. Local fallback is disabled in Supabase mode.');
    }

    console.error('Error saving courses:', error);
    throw error;
  }
}

export async function saveCourseChecklist(courseCode: string, items: CourseTaskItem[], completed = false, userKey: string): Promise<void> {
  const resolvedUserKey = userKey.trim() || 'anonimo';

  console.log(`[saveCourseChecklist] start user=${resolvedUserKey} course=${courseCode} items=${Array.isArray(items) ? items.length : 0} completed=${!!completed}`);

  if (!USE_SUPABASE || !supabase) {
    const store = loadCourseStore();
    const fixedCourse = store.fixedCourses.find(course => course.course_code === courseCode);
    store.courseChecklists[courseCode] = {
      id: store.courseChecklists[courseCode]?.id,
      user_key: resolvedUserKey,
      course_code: courseCode,
      course_id: fixedCourse?.id,
      items,
      completed,
      updated_at: new Date().toISOString(),
    };
    saveCourseStore(store);
    return;
  }

  try {
    const { data: fixedCourses, error: fixedCourseError } = await supabase
      .from(COURSE_TABLES.fixedCourses)
      .select(COURSE_COLS.id)
      .eq(COURSE_COLS.courseCode, courseCode)
      .order(COURSE_COLS.updatedAt, { ascending: false })
      .limit(1);

    if (fixedCourseError) throw fixedCourseError;

    const fixedCourse = Array.isArray(fixedCourses) ? fixedCourses[0] : null;

    if (!fixedCourse?.[COURSE_COLS.id]) {
      throw new Error(`Course not found: ${courseCode}`);
    }

    const { data: upsertData, error: upsertError } = await supabase.from(COURSE_TABLES.courseChecklists).upsert({
      [COURSE_COLS.userKey]: resolvedUserKey,
      [COURSE_COLS.courseId]: fixedCourse[COURSE_COLS.id],
      [COURSE_COLS.courseCode]: courseCode,
      [COURSE_COLS.items]: items,
      [COURSE_COLS.completed]: completed,
      [COURSE_COLS.updatedAt]: new Date().toISOString(),
    }, { onConflict: `${COURSE_COLS.userKey},${COURSE_COLS.courseId}` }).select();

    console.log('[saveCourseChecklist] upsert result', { upsertError, returnedRows: Array.isArray(upsertData) ? upsertData.length : null });

    if (upsertError) throw upsertError;
  } catch (error) {
    if (isMissingSchemaError(error)) {
      console.error('Supabase schema missing for course checklists. Local fallback is disabled in Supabase mode.');
    }

    console.error('Error saving course checklist:', error instanceof Error ? error.message : error);
    throw error;
  }
}

const TABLE_NAME = 'user_configs';

export async function loadConfig(userKey?: string): Promise<UserConfig> {
  if (!USE_SUPABASE || !supabase) {
    return loadConfigFromFile();
  }

  try {
    const query = supabase.from(TABLE_NAME).select('*');
    const { data, error } = userKey
      ? await query.eq('user_key', userKey).single()
      : await query.limit(1).single();

    if (error && error.code === 'PGRST116') {
      // No rows found, return default
      return getDefaultConfig();
    }

    if (error) {
      console.error('Error loading config from Supabase:', error);
      return getDefaultConfig();
    }

    return {
      timezone: data.timezone || 'America/Santo_Domingo',
      schedule: normalizeScheduleCourseDuplicates(data.schedule || []),
      subscription: data.subscription || null,
      sentByDate: data.sent_by_date || {},
      notificationHourStart: data.notification_hour_start ?? 7,
      notificationHourEnd: data.notification_hour_end ?? 22,
    };
  } catch (error) {
    if (isMissingSchemaError(error)) {
      console.error('Supabase schema missing for config. Local fallback is disabled in Supabase mode.');
    }
    console.error('Error loading config:', error);
    throw error;
  }
}

export async function saveConfig(config: UserConfig, userKey?: string): Promise<void> {
  if (!USE_SUPABASE || !supabase) {
    saveConfigToFile({ ...config, schedule: normalizeScheduleCourseDuplicates(config.schedule || []) });
    return;
  }

  try {
    const normalizedSchedule = normalizeScheduleCourseDuplicates(config.schedule || []);
    const payload = userKey
      ? {
          user_key: userKey,
          timezone: config.timezone,
          schedule: normalizedSchedule,
          subscription: config.subscription,
          sent_by_date: config.sentByDate,
          notification_hour_start: config.notificationHourStart,
          notification_hour_end: config.notificationHourEnd,
          updated_at: new Date().toISOString(),
        }
      : {
          id: 1,
          timezone: config.timezone,
          schedule: normalizedSchedule,
          subscription: config.subscription,
          sent_by_date: config.sentByDate,
          notification_hour_start: config.notificationHourStart,
          notification_hour_end: config.notificationHourEnd,
          updated_at: new Date().toISOString(),
        };

    const { error: upsertError } = await supabase.from(TABLE_NAME).upsert(payload, { onConflict: userKey ? 'user_key' : 'id' });

    if (upsertError) {
      console.error('Error saving config to Supabase:', upsertError);
      throw upsertError;
    }
  } catch (error) {
    console.error('Error saving config:', error);
    throw error;
  }
}

function getDefaultConfig(): UserConfig {
  return {
    timezone: 'America/Santo_Domingo',
    schedule: [],
    subscription: null,
    sentByDate: {},
    notificationHourStart: 7,
    notificationHourEnd: 22,
  };
}

function getCourseCodeFromActivity(activity: any): string | null {
  const courseId = typeof activity?.courseId === 'string' ? activity.courseId.trim() : '';
  const name = typeof activity?.name === 'string' ? activity.name : '';
  const codeMatch = name.match(/\bIS-\d+\b/);
  const parenMatch = name.match(/\((IS-\d+)\)/);
  const courseCode = courseId || (codeMatch ? codeMatch[0] : parenMatch ? parenMatch[1] : '');
  return courseCode ? courseCode.toUpperCase() : null;
}

function isCourseLikeActivity(activity: any): boolean {
  const name = typeof activity?.name === 'string' ? activity.name : '';
  const category = typeof activity?.category === 'string' ? activity.category : '';
  return !!getCourseCodeFromActivity(activity) && (
    activity?.isCourseMarked === true
    || activity?.isAcademic === true
    || activity?.activityType === 'FIJA_PERMANENTE'
    || activity?.activityType === 'FIJA_AJUSTABLE'
    || /\bIS-\d+\b/.test(name)
    || /\bLab\b/i.test(name)
    || category === 'ACADEMIC'
  );
}

function normalizeScheduleCourseDuplicates(schedule: DaySchedule[]): DaySchedule[] {
  return (Array.isArray(schedule) ? schedule : []).map(day => {
    const courseActivities = new Map<string, Activity>();
    const otherActivities: Activity[] = [];

    for (const activity of day.activities || []) {
      if (!isCourseLikeActivity(activity)) {
        otherActivities.push(activity);
        continue;
      }

      const courseCode = getCourseCodeFromActivity(activity);
      if (!courseCode) {
        otherActivities.push(activity);
        continue;
      }

      courseActivities.set(courseCode, activity);
    }

    return {
      ...day,
      activities: [...courseActivities.values(), ...otherActivities].sort((left, right) => left.startTime.localeCompare(right.startTime)),
    };
  });
}

export type PushSubscriptionPayload = {
  endpoint: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
  expirationTime?: number | null;
};

export interface UserConfigWithTimestamp {
  user_key: string;
  subscription?: PushSubscriptionPayload | null;
  timezone: string;
  notification_hour_start?: number;
  notification_hour_end?: number;
  last_reset_date?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Saves or updates a push subscription in Supabase user_configs table using upsert.
 * Guarantees the subscription is properly persisted with user_key as unique identifier.
 */
export async function saveSubscriptionToSupabase(
  userKey: string,
  subscription: PushSubscriptionPayload,
  timezone: string = 'America/Santo_Domingo'
): Promise<void> {
  if (!USE_SUPABASE || !supabase) {
    console.log('[✓] Local storage mode: subscription persisted to user-config.json');
    const config = loadConfigFromFile();
    config.subscription = subscription;
    config.timezone = timezone;
    saveConfigToFile(config);
    return;
  }

  try {
    // Normalize subscription to ensure clean JSON storage
    const normalizedSubscription: PushSubscriptionPayload = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys?.p256dh || '',
        auth: subscription.keys?.auth || '',
      },
      expirationTime: subscription.expirationTime || null,
    };

    const { error } = await supabase
      .from('user_configs')
      .upsert(
        {
          user_key: userKey,
          subscription: normalizedSubscription,
          timezone,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_key' }
      );

    if (error) throw error;
    console.log(`[✓] Subscription saved to Supabase for user: ${userKey}`);
  } catch (error) {
    console.error('Error saving subscription to Supabase:', error);
    throw error;
  }
}

// === BLOQUE 2: User Data Tables Functions ===

const USER_TABLES = {
  schedules: 'user_schedules',
  settings: 'user_settings',
  exceptions: 'user_exceptions',
} as const;

const USER_COLS = {
  userId: 'user_id',
  schedule: 'schedule',
  timezone: 'timezone',
  notificationHourStart: 'notification_hour_start',
  notificationHourEnd: 'notification_hour_end',
  onboardingCompleted: 'onboarding_completed',
  userName: 'user_name',
  reminderMorning: 'reminder_morning',
  reminderAfternoon: 'reminder_afternoon',
  reminderEvening: 'reminder_evening',
  reminderMorningEnabled: 'reminder_morning_enabled',
  reminderAfternoonEnabled: 'reminder_afternoon_enabled',
  reminderEveningEnabled: 'reminder_evening_enabled',
  reminderConfig: 'reminder_config',
  updatedAt: 'updated_at',
  weekKey: 'week_key',
  activityId: 'activity_id',
  modifiedData: 'modified_data',
} as const;

/**
 * Load user schedule from Supabase
 */
export async function loadUserSchedule(userId: string): Promise<DaySchedule[] | null> {
  if (!USE_SUPABASE || !supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from(USER_TABLES.schedules)
      .select(USER_COLS.schedule)
      .eq(USER_COLS.userId, userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // 116 = no rows found
    return data?.[USER_COLS.schedule] || null;
  } catch (error) {
    console.error('Error loading user schedule:', error);
    return null;
  }
}

/**
 * Save user schedule to Supabase
 */
export async function saveUserSchedule(userId: string, schedule: DaySchedule[], timezone: string = 'America/Lima'): Promise<void> {
  if (!USE_SUPABASE || !supabase) {
    return;
  }

  try {
    const { error } = await supabase
      .from(USER_TABLES.schedules)
      .upsert(
        {
          [USER_COLS.userId]: userId,
          [USER_COLS.schedule]: schedule,
          [USER_COLS.timezone]: timezone,
          [USER_COLS.updatedAt]: new Date().toISOString(),
        },
        { onConflict: USER_COLS.userId }
      );

    if (error) throw error;
    console.log(`[✓] User schedule saved for user: ${userId}`);
  } catch (error) {
    console.error('Error saving user schedule:', error);
  }
}

/**
 * Load completion history for a specific date
 */
export async function loadUserCompletions(userId: string, date: string): Promise<Record<string, boolean>> {
  if (!USE_SUPABASE || !supabase) {
    return {};
  }

  try {
    const { data, error } = await supabase
      .from('user_completions')
      .select('completed_ids')
      .eq('user_id', userId)
      .eq('date', date)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data?.completed_ids || {};
  } catch (error) {
    console.error('Error loading user completions:', error);
    return {};
  }
}

/**
 * Save completion history for a date
 */
export async function saveUserCompletions(userId: string, date: string, completedIds: Record<string, boolean>): Promise<void> {
  if (!USE_SUPABASE || !supabase) {
    return;
  }

  try {
    const { error } = await supabase
      .from('user_completions')
      .upsert(
        {
          user_id: userId,
          date,
          completed_ids: completedIds,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,date' }
      );

    if (error) throw error;
  } catch (error) {
    console.error('Error saving user completions:', error);
  }
}

/**
 * Load weekly exceptions for an activity
 */
export async function loadUserException(userId: string, weekKey: string, activityId: string): Promise<any | null> {
  if (!USE_SUPABASE || !supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from(USER_TABLES.exceptions)
      .select(USER_COLS.modifiedData)
      .eq(USER_COLS.userId, userId)
      .eq(USER_COLS.weekKey, weekKey)
      .eq(USER_COLS.activityId, activityId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data?.[USER_COLS.modifiedData] || null;
  } catch (error) {
    console.error('Error loading user exception:', error);
    return null;
  }
}

/**
 * Save weekly exception for an activity
 */
export async function saveUserException(userId: string, weekKey: string, activityId: string, modifiedData: any): Promise<void> {
  if (!USE_SUPABASE || !supabase) {
    return;
  }

  try {
    const { error } = await supabase
      .from(USER_TABLES.exceptions)
      .upsert(
        {
          [USER_COLS.userId]: userId,
          [USER_COLS.weekKey]: weekKey,
          [USER_COLS.activityId]: activityId,
          [USER_COLS.modifiedData]: modifiedData,
          [USER_COLS.updatedAt]: new Date().toISOString(),
        },
        { onConflict: `${USER_COLS.userId},${USER_COLS.weekKey},${USER_COLS.activityId}` }
      );

    if (error) throw error;
  } catch (error) {
    console.error('Error saving user exception:', error);
  }
}

/**
 * Delete expired weekly exceptions (older than current week)
 */
export async function deleteExpiredExceptions(userId: string, currentWeekKey: string): Promise<void> {
  if (!USE_SUPABASE || !supabase) {
    return;
  }

  try {
    const { error } = await supabase
      .from(USER_TABLES.exceptions)
      .delete()
      .eq(USER_COLS.userId, userId)
      .lt(USER_COLS.weekKey, currentWeekKey);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting expired exceptions:', error);
  }
}

/**
 * Load user settings
 */
export async function loadUserSettings(userId: string): Promise<any | null> {
  if (!USE_SUPABASE || !supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from(USER_TABLES.settings)
      .select('*')
      .eq(USER_COLS.userId, userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return null;

    return {
      notification_hour_start: data[USER_COLS.notificationHourStart],
      notification_hour_end: data[USER_COLS.notificationHourEnd],
      onboarding_completed: data[USER_COLS.onboardingCompleted],
      user_name: data[USER_COLS.userName],
      reminder_morning: data[USER_COLS.reminderConfig]?.morning || data[USER_COLS.reminderMorning] || '08:00',
      reminder_afternoon: data[USER_COLS.reminderConfig]?.afternoon || data[USER_COLS.reminderAfternoon] || '15:00',
      reminder_evening: data[USER_COLS.reminderConfig]?.evening || data[USER_COLS.reminderEvening] || '18:00',
      reminder_morning_enabled: data[USER_COLS.reminderConfig]?.morning_enabled ?? data[USER_COLS.reminderMorningEnabled] ?? true,
      reminder_afternoon_enabled: data[USER_COLS.reminderConfig]?.afternoon_enabled ?? data[USER_COLS.reminderAfternoonEnabled] ?? true,
      reminder_evening_enabled: data[USER_COLS.reminderConfig]?.evening_enabled ?? data[USER_COLS.reminderEveningEnabled] ?? true,
    };
  } catch (error) {
    console.error('Error loading user settings:', error);
    return null;
  }
}

/**
 * Save user settings
 */
export async function saveUserSettings(userId: string, settings: any): Promise<void> {
  if (!USE_SUPABASE || !supabase) {
    return;
  }

  try {
    const { error } = await supabase
      .from(USER_TABLES.settings)
      .upsert(
        {
          [USER_COLS.userId]: userId,
          [USER_COLS.updatedAt]: new Date().toISOString(),
          ...(settings.notification_hour_start !== undefined ? { [USER_COLS.notificationHourStart]: settings.notification_hour_start } : {}),
          ...(settings.notification_hour_end !== undefined ? { [USER_COLS.notificationHourEnd]: settings.notification_hour_end } : {}),
          ...(settings.onboarding_completed !== undefined ? { [USER_COLS.onboardingCompleted]: settings.onboarding_completed } : {}),
          ...(settings.user_name !== undefined ? { [USER_COLS.userName]: settings.user_name } : {}),
          ...(settings.reminder_morning !== undefined || settings.reminder_afternoon !== undefined || settings.reminder_evening !== undefined || settings.reminder_morning_enabled !== undefined || settings.reminder_afternoon_enabled !== undefined || settings.reminder_evening_enabled !== undefined
            ? {
                [USER_COLS.reminderConfig]: {
                  morning: settings.reminder_morning,
                  afternoon: settings.reminder_afternoon,
                  evening: settings.reminder_evening,
                  morning_enabled: settings.reminder_morning_enabled,
                  afternoon_enabled: settings.reminder_afternoon_enabled,
                  evening_enabled: settings.reminder_evening_enabled,
                },
              }
            : {}),
        },
        { onConflict: USER_COLS.userId }
      );

    if (error) throw error;
  } catch (error) {
    console.error('Error saving user settings:', error);
  }
}

/**
 * Retrieves the last reset date for a user (for Monday resets at 05:00).
 */
export async function getLastResetDate(userKey: string): Promise<string | null> {
  if (!USE_SUPABASE || !supabase) {
    const config = loadConfigFromFile();
    // Store in sentByDate for now in local mode
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('user_configs')
      .select('last_reset_date')
      .eq('user_key', userKey)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[✗] Error fetching reset date:', error);
      return null;
    }

    return data?.last_reset_date || null;
  } catch (error) {
    console.error('[✗] Error getting last reset date:', error);
    return null;
  }
}

/**
 * Updates the last reset date for a user (called after resetting activities on Monday 05:00).
 */
export async function updateLastResetDate(userKey: string, resetDate: string = new Date().toISOString().split('T')[0]): Promise<void> {
  if (!USE_SUPABASE || !supabase) {
    console.log(`[✓] Local mode: reset date updated to ${resetDate}`);
    return;
  }

  try {
    const { error } = await supabase
      .from('user_configs')
      .update({
        last_reset_date: resetDate,
        updated_at: new Date().toISOString(),
      })
      .eq('user_key', userKey);

    if (error) {
      console.error('[✗] Error updating reset date:', error);
      return;
    }

    console.log(`[✓] Reset date updated for user: ${userKey} -> ${resetDate}`);
  } catch (error) {
    console.error('[✗] Failed to update reset date:', error);
  }
}
