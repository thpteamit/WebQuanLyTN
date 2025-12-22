// Firebase Realtime Database (REST) helper
// Base URL is taken from window.FIREBASE_WEB_CONFIG.databaseURL if available.
const FALLBACK_DB_BASE_URL = 'https://quanlytnweb-default-rtdb.asia-southeast1.firebasedatabase.app';

function normalizeBaseUrl(url) {
    return String(url || '').replace(/\/+$/, '');
}

function getDbBaseUrl() {
    const fromConfig = window.FIREBASE_WEB_CONFIG && window.FIREBASE_WEB_CONFIG.databaseURL;
    return normalizeBaseUrl(fromConfig || FALLBACK_DB_BASE_URL);
}

function buildDbUrl(path, authToken) {
    const base = getDbBaseUrl();
    const cleanPath = String(path || '').replace(/^\/+/, '').replace(/\.json$/, '');
    const url = `${base}/${cleanPath}.json`;
    if (!authToken) return url;
    const join = url.includes('?') ? '&' : '?';
    return `${url}${join}auth=${encodeURIComponent(authToken)}`;
}

async function fetchJson(url, options) {
    const response = await fetch(url, {
        headers: {
            'Content-Type': 'application/json'
        },
        ...options
    });

    if (!response.ok) {
        let detail = '';
        try {
            detail = await response.text();
        } catch {
            // ignore
        }
        throw new Error(`Firebase request failed (${response.status}): ${detail || response.statusText}`);
    }

    // Some responses can be empty (204)
    const text = await response.text();
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

async function getIdToken() {
    // If Firebase Auth is present, attach the user's ID token so Rules can protect data
    try {
        if (!window.firebase || !firebase.auth) return null;
        const currentUser = firebase.auth().currentUser;
        if (!currentUser) return null;
        return await currentUser.getIdToken();
    } catch {
        return null;
    }
}

function coerceString(value) {
    if (value == null) return '';
    return String(value);
}

function mapResource(id, raw) {
    const resource = raw || {};
    return {
        id: coerceString(id),
        name: coerceString(resource.name),
        link: coerceString(resource.link),
        description: coerceString(resource.description || ''),
        createdAt: coerceString(resource.createdAt || ''),
        updatedAt: coerceString(resource.updatedAt || '')
    };
}

async function listResources() {
    const token = await getIdToken();
    const data = await fetchJson(buildDbUrl('resources', token), { method: 'GET' });
    if (!data) return [];

    return Object.entries(data)
        .map(([id, value]) => mapResource(id, value))
        .filter(r => r.name && r.link);
}

async function createResource(resource) {
    const token = await getIdToken();
    const payload = {
        name: coerceString(resource.name).trim(),
        link: coerceString(resource.link).trim(),
        description: coerceString(resource.description || '').trim(),
        createdAt: resource.createdAt || new Date().toISOString()
    };

    const result = await fetchJson(buildDbUrl('resources', token), {
        method: 'POST',
        body: JSON.stringify(payload)
    });

    // Firebase returns { name: "-Nk..." }
    const id = result && result.name ? result.name : '';
    return mapResource(id, payload);
}

async function updateResource(id, patch) {
    const cleanId = coerceString(id);
    if (!cleanId) throw new Error('Missing resource id');

    const token = await getIdToken();

    const payload = {
        ...patch,
        updatedAt: new Date().toISOString()
    };

    await fetchJson(buildDbUrl(`resources/${cleanId}`, token), {
        method: 'PATCH',
        body: JSON.stringify(payload)
    });
}

async function deleteResource(id) {
    const cleanId = coerceString(id);
    if (!cleanId) throw new Error('Missing resource id');

    const token = await getIdToken();

    await fetchJson(buildDbUrl(`resources/${cleanId}`, token), { method: 'DELETE' });
}

async function getUserRole(uid) {
    const cleanUid = coerceString(uid);
    if (!cleanUid) return null;
    const token = await getIdToken();
    const raw = await fetchJson(buildDbUrl(`userRoles/${cleanUid}`, token), { method: 'GET' });
    if (!raw) return null;

    // Allow either a plain string ("admin") or an object ({ role: "admin" })
    const roleValue = (typeof raw === 'object' && raw !== null && 'role' in raw) ? raw.role : raw;
    const normalized = coerceString(roleValue).trim().toLowerCase();
    return normalized || null;
}

function getUsernameFromEmail(email) {
    const value = coerceString(email).trim();
    if (!value) return '';
    const atIndex = value.indexOf('@');
    return atIndex === -1 ? value : value.slice(0, atIndex);
}

async function upsertOwnUserProfile(extra = {}) {
    if (!window.firebase || !firebase.auth) throw new Error('Firebase Auth not loaded');
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) throw new Error('Not signed in');

    const token = await getIdToken();
    if (!token) throw new Error('Missing ID token');

    const uid = currentUser.uid;
    const payload = {
        uid,
        username: getUsernameFromEmail(currentUser.email || ''),
        email: coerceString(currentUser.email || ''),
        lastLoginAt: new Date().toISOString(),
        ...extra
    };

    await fetchJson(buildDbUrl(`userProfiles/${uid}`, token), {
        method: 'PATCH',
        body: JSON.stringify(payload)
    });
}

// Expose a minimal API
window.firebaseDb = {
    listResources,
    createResource,
    updateResource,
    deleteResource,
    getUserRole,
    upsertOwnUserProfile
};
