async function checkAuth() {
    try {
        if (!supabaseClient || SUPABASE_URL === 'YOUR_SUPABASE_URL') {
            return null;
        }

        const { data: { session } } = await supabaseClient.auth.getSession();
        
        const rawPath = window.location.pathname.replace(/\/$/, '');
        const page = (rawPath.split('/').pop() || 'index.html').toLowerCase().replace(/\.html$/, '');
        const isPublicPage = page === '' || page === 'index' || page === 'public';
        const isLoginPage = page === '' || page === 'index';

        if (!session) {
            if (!isPublicPage) {
                window.location.href = 'index.html';
            }
            return null;
        }

        if (isLoginPage) {
            window.location.href = 'dashboard.html';
            return null;
        }

        return session.user;
    } catch (err) {
        console.error('Auth check error:', err);
        return null;
    }
}

async function getCurrentUser() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        return user;
    } catch {
        return null;
    }
}

async function logout() {
    try {
        await supabaseClient.auth.signOut();
    } catch (err) {
        console.error('Logout error:', err);
    }
    window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        if (supabaseClient) {
            supabaseClient.auth.getSession().then(({ data: { session } }) => {
                if (session) window.location.href = 'dashboard.html';
            });
        }

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorDiv = document.getElementById('loginError');
            errorDiv.classList.add('hidden');
            errorDiv.textContent = '';

            if (!supabaseClient) {
                const detail = window._supabaseInitError ? ` (${window._supabaseInitError})` : '';
                errorDiv.textContent = 'Koneksi Supabase belum aktif' + detail + '. Pastikan SUPABASE_ANON_KEY di js/config.js menggunakan API Key "anon public" (yang diawali "eyJ...") dari dashboard Supabase.';
                errorDiv.classList.remove('hidden');
                return;
            }

            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value;
            const btn = document.getElementById('loginBtn');

            btn.disabled = true;
            btn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px;"></span> Memproses...';

            try {
                const { data, error } = await supabaseClient.auth.signInWithPassword({
                    email, password
                });

                if (error) throw error;
                window.location.href = 'dashboard.html';
            } catch (err) {
                errorDiv.textContent = err.message === 'Invalid login credentials'
                    ? 'Email atau password salah.'
                    : (err.message || 'Terjadi kesalahan. Silakan coba lagi.');
                errorDiv.classList.remove('hidden');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<span class="material-icons-outlined">login</span> Masuk';
            }
        });
    }

    const hamburger = document.getElementById('hamburger');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (hamburger && sidebar) {
        hamburger.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            if (overlay) overlay.classList.toggle('active');
        });

        if (overlay) {
            overlay.addEventListener('click', () => {
                sidebar.classList.remove('active');
                overlay.classList.remove('active');
            });
        }
    }

    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', logout);
    }
});
