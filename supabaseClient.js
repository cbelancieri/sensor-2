// Configuração do projeto Supabase (SensorControl)
const SUPABASE_URL = 'https://bfymigfllxxzpsjyrnkt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2Hz_WRHTgYAec-vCHZwchg_vBg2co10';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
