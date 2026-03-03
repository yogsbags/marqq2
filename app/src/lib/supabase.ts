import { createClient } from '@supabase/supabase-js';

// Supabase configuration
// These should be set as environment variables in production
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Warning: Supabase environment variables not set. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY'
  );
}

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

