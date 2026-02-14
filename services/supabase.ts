
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ybmykrxyowcdzutsufiv.supabase.co';
const supabaseAnonKey = 'sb_publishable_LbzZbLeP6-x4cyDk7At5Aw_24004LgO';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
