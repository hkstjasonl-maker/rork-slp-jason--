import { createClient } from '@supabase/supabase-js';

// These are public-facing Supabase credentials intended for client-side use.
// The anon key is safe to expose in a React Native app because Supabase enforces
// Row Level Security (RLS) on the database — the key alone cannot bypass any
// access policies. All data access is governed by RLS rules you configure in
// your Supabase dashboard. Do NOT use the service_role key here.
const SUPABASE_URL = 'https://ssygervjixmrbyghuzhu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzeWdlcnZqaXhtcmJ5Z2h1emh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNzcxMzAsImV4cCI6MjA4Nzk1MzEzMH0.DzUqOjubFugAcqB5ULetFqdsok63wd4bl7Y9VqEscZw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
