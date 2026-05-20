/**
 * Supabase Authentication Service
 * Handles Google OAuth login, session management, and user data
 */

import { createClient } from '@supabase/supabase-js';

// Use Vite's import.meta.env for environment variables
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '') as string;
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '') as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('⚠️ Supabase credentials missing. Auth will not work. Check .env file.');
}

// If credentials are present, create a real Supabase client. Otherwise export a minimal
// mock client that prevents runtime crashes in the browser during local development.
let supabaseClient: any;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  supabaseClient = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      signInWithOAuth: async () => ({ error: new Error('Supabase not configured') }),
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  };
}

export const supabase = supabaseClient;

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  created_at?: string;
}

/**
 * Get the current session
 */
export const getSession = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Error getting session:', error);
    return null;
  }
  return data.session;
};

/**
 * Convert Supabase auth user to our User interface
 */
export const convertAuthToUser = (authUser: any): User | null => {
  if (!authUser) return null;

  return {
    id: authUser.id,
    email: authUser.email || '',
    name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'Usuario',
    avatar_url: authUser.user_metadata?.avatar_url,
    created_at: authUser.created_at,
  };
};

/**
 * Sign in with Google
 */
export const signInWithGoogle = async () => {
  // If Supabase isn't configured, perform a fallback navigation for local testing.
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    await signInWithGoogleFallback();
    return;
  }

  // Prefer canonical app URL when configured to avoid accidental localhost callbacks.
  const configuredAppUrl = (import.meta.env.VITE_APP_URL || '').trim();
  const fallbackAppUrl = 'https://horario-two-blue.vercel.app';

  let redirectUrl = fallbackAppUrl;
  try {
    const resolved = new URL(configuredAppUrl || (typeof window !== 'undefined' ? window.location.origin : fallbackAppUrl));
    if (resolved.hostname !== 'localhost' && resolved.hostname !== '127.0.0.1') {
      redirectUrl = resolved.origin;
    }
  } catch {
    redirectUrl = fallbackAppUrl;
  }

  try {
    const res = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
      },
    });

    if (res?.error) {
      console.error('Error signing in with Google:', res.error);
      await signInWithGoogleFallback();
    }
  } catch (e) {
    console.error('Error signing in with Google:', e);
    await signInWithGoogleFallback();
  }
};

// If Supabase is not configured, provide a lightweight fallback that navigates
// to the public fallback URL so the button still triggers a navigation during
// local development/testing.
export const signInWithGoogleFallback = async () => {
  try {
    const configuredAppUrl = (import.meta.env.VITE_APP_URL || '').trim();
    const fallbackAppUrl = 'https://horario-two-blue.vercel.app';
    let redirectUrl = fallbackAppUrl;
    try {
      const resolved = new URL(configuredAppUrl || (typeof window !== 'undefined' ? window.location.origin : fallbackAppUrl));
      if (resolved.hostname !== 'localhost' && resolved.hostname !== '127.0.0.1') {
        redirectUrl = resolved.origin;
      }
    } catch {
      redirectUrl = fallbackAppUrl;
    }

    if (typeof window !== 'undefined') {
      window.location.href = redirectUrl;
    }
  } catch (e) {
    console.error('Fallback sign-in navigation failed:', e);
  }
};

/**
 * Sign out the user
 */
export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};

/**
 * Listen to authentication state changes
 */
export const onAuthStateChange = (callback: (user: User | null, event?: string) => void) => {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(async (event, session) => {
    const user = session?.user;
    const convertedUser = convertAuthToUser(user);
    callback(convertedUser, event);
  });

  return subscription;
};
