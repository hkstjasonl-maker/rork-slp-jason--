import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://pfgtnrlgetomfmrzbxgb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmZ3RucmxnZXRvbWZtcnpieGdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2Mzc5NjcsImV4cCI6MjA4ODIxMzk2N30.pmYusCbBGFuHe_Gy-Fvac3LUwqyLZgR0srhrARhr7Uk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
