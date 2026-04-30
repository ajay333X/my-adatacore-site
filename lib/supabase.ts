import { createClient } from '@supabase/supabase-js';

// आपकी Supabase डिटेल्स जो आपने पहले शेयर की थीं
const supabaseUrl = "https://llmhyezgcnbognmmsnzq.supabase.co";
const supabaseAnonKey = "sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml";

// क्लाइंट बनाना
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
