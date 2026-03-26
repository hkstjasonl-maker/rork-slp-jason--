import { createClient } from '@supabase/supabase-js';

// These are public-facing Supabase credentials intended for client-side use.
// The anon key is safe to expose in a React Native app because Supabase enforces
// Row Level Security (RLS) on the database — the key alone cannot bypass any
// access policies. All data access is governed by RLS rules you configure in
// your Supabase dashboard. Do NOT use the service_role key here.
const SUPABASE_URL = 'https://pfgtnrlgetomfmrzbxgb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmZ3RucmxnZXRvbWZtcnpieGdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2Mzc5NjcsImV4cCI6MjA4ODIxMzk2N30.pmYusCbBGFuHe_Gy-Fvac3LUwqyLZgR0srhrARhr7Uk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
