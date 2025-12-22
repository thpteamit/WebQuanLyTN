function initFirebase() {
    if (window.__firebaseAppInitialized) return;
    if (!window.firebase || !firebase.initializeApp) {
        throw new Error('Firebase SDK not loaded');
    }
    if (!window.FIREBASE_WEB_CONFIG || !window.FIREBASE_WEB_CONFIG.apiKey) {
        throw new Error('Missing FIREBASE_WEB_CONFIG. Update js/firebaseConfig.js');
    }

    // Guard against placeholder values copied from the template
    const cfg = window.FIREBASE_WEB_CONFIG;
    const looksLikePlaceholder = (v) => typeof v === 'string' && v.includes('PASTE_YOUR_');
    if (
        looksLikePlaceholder(cfg.apiKey) ||
        looksLikePlaceholder(cfg.authDomain) ||
        looksLikePlaceholder(cfg.projectId) ||
        looksLikePlaceholder(cfg.appId)
    ) {
        throw new Error('Firebase config is still placeholder. Paste real values into js/firebaseConfig.js');
    }

    firebase.initializeApp(window.FIREBASE_WEB_CONFIG);
    window.__firebaseAppInitialized = true;
}

function getAppBasePath() {
    // GitHub Pages: https://<user>.github.io/<repo>/...
    // Detect base path as '/<repo>/' for github.io, else '/'.
    const host = String(window.location.hostname || '');
    const path = String(window.location.pathname || '/');
    if (host.endsWith('github.io')) {
        const parts = path.split('/').filter(Boolean);
        if (parts.length > 0) return `/${parts[0]}/`;
    }
    return '/';
}

function appUrl(relativePath) {
    const base = getAppBasePath();
    const clean = String(relativePath || '').replace(/^\//, '');
    return base + clean;
}

// Theme Toggle
function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;

    // Prevent duplicate initialization (admin/download pages call initTheme from multiple scripts)
    if (window.__themeInitialized) {
        const isDark = document.documentElement.classList.contains('dark-mode') || document.body.classList.contains('dark-mode');
        const span = themeToggle.querySelector('span');
        const label = isDark ? 'Chế độ sáng' : 'Chế độ tối';
        if (span) span.textContent = label;
        else themeToggle.textContent = label;
        return;
    }
    window.__themeInitialized = true;

    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const currentTheme = savedTheme || (prefersDark ? 'dark' : 'light');

    const setThemeLabel = (isDark) => {
        if (!themeToggle) return;
        const label = isDark ? 'Chế độ sáng' : 'Chế độ tối';
        const span = themeToggle.querySelector('span');
        if (span) span.textContent = label;
        else themeToggle.textContent = label;
    };
    
    const applyTheme = (theme) => {
        const isDark = theme === 'dark';
        document.body.classList.toggle('dark-mode', isDark);
        document.documentElement.classList.toggle('dark-mode', isDark);
        setThemeLabel(isDark);
    };

    applyTheme(currentTheme);
    
    themeToggle.addEventListener('click', () => {
            const isDarkNow = !(document.documentElement.classList.contains('dark-mode') || document.body.classList.contains('dark-mode'));
            const next = isDarkNow ? 'dark' : 'light';
            localStorage.setItem('theme', next);
            applyTheme(next);
    });

    // If user hasn't chosen manually, follow system changes
    if (!savedTheme && window.matchMedia) {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = (e) => applyTheme(e.matches ? 'dark' : 'light');
        try {
            mq.addEventListener('change', handler);
        } catch {
            // Safari fallback
            mq.addListener(handler);
        }
    }
}

async function getCurrentUserRole() {
    initFirebase();

    const currentUser = firebase.auth().currentUser;
    if (!currentUser) return null;

    // Role is stored at: /userRoles/{uid} => "admin" | "download"
    if (!window.firebaseDb || !window.firebaseDb.getUserRole) {
        // Fallback to email-based role if the DB helper is not present on login page
        return null;
    }
    return await window.firebaseDb.getUserRole(currentUser.uid);
}

function waitForAuthState() {
    initFirebase();
    return new Promise((resolve) => {
        const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
            unsubscribe();
            resolve(user || null);
        });
    });
}

// Guard pages that require auth + role
async function requireAuthRole(requiredRole = null) {
    const user = await waitForAuthState();
    if (!user) {
        window.location.href = appUrl('');
        return null;
    }

    if (!requiredRole) return user;

    // If role mapping is not available, deny by default
    if (!window.firebaseDb || !window.firebaseDb.getUserRole) {
        await firebase.auth().signOut();
        window.location.href = appUrl('');
        return null;
    }

    const role = await window.firebaseDb.getUserRole(user.uid);
    if (role !== requiredRole) {
        await firebase.auth().signOut();
        window.location.href = appUrl('');
        return null;
    }

    return user;
}

// Login Form Handler
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;

    // If already logged in, redirect based on role
    (async () => {
        try {
            initFirebase();
        } catch {
            return;
        }

        const user = await waitForAuthState();
        if (!user) return;

        // Role mapping requires DB helper, but index.html doesn't load it.
        // We redirect to download page by default; it will guard and redirect again if needed.
        window.location.href = appUrl('download/');
    })();
    
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        const errorMessage = document.getElementById('errorMessage');

        try {
            initFirebase();
        } catch (err) {
            showError(errorMessage, 'Thiếu cấu hình Firebase. Hãy cập nhật js/firebaseConfig.js');
            return;
        }
        
        const domain = window.FIREBASE_USERNAME_EMAIL_DOMAIN || 'users.local';
        const loginEmail = username.includes('@') ? username : `${username}@${domain}`;

        try {
            await firebase.auth().signInWithEmailAndPassword(loginEmail, password);

            // Store non-sensitive account metadata in Realtime Database for easier management
            try {
                if (window.firebaseDb && window.firebaseDb.upsertOwnUserProfile) {
                    await window.firebaseDb.upsertOwnUserProfile({
                        username: username
                    });
                }
            } catch {
                // Do not block login if profile sync fails
            }

            window.location.href = appUrl('download/');
        } catch (err) {
            showError(errorMessage, 'Tài khoản hoặc mật khẩu không đúng');
        }
    });
});

function showError(element, message) {
    element.textContent = message;
    element.classList.add('show');
    
    setTimeout(() => {
        element.classList.remove('show');
    }, 3000);
}

// Logout Handler
function setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                initFirebase();
                await firebase.auth().signOut();
            } finally {
                window.location.href = appUrl('');
            }
        });
    }
}

// Expose guards for other scripts
window.authGuards = {
    requireAuthRole
};
