const SUPABASE_URL = 'https://rktlszpgyzdcoiaeqyiu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_wVjumDg98FxvBQzucEXrWw_OsBqSnfP';

let supabaseClient = null;
if (window.supabase) {
    try {
        const cleanUrl = (SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
        if (cleanUrl && cleanUrl.startsWith('http')) {
            supabaseClient = window.supabase.createClient(cleanUrl, SUPABASE_ANON_KEY);
        } else {
            console.warn('Supabase URL belum diatur dengan benar di js/config.js');
        }
    } catch (e) {
        console.error('Gagal menginisialisasi Supabase client:', e);
        window._supabaseInitError = e.message;
    }
}

const APP_CONFIG = {
    churchName: 'BKPN Botohilitano',
    rolesPerSunday: {
        Liturgos: 1,
        Kolektan: 2,
        Singer: 3
    },
    totalPerSunday: 6
};
