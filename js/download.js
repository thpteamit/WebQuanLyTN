// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupLogout();
    (async () => {
        // Allow both roles to view downloads; redirect admin to admin page if role is admin.
        if (!window.authGuards || !window.authGuards.requireAuthRole) {
            window.location.href = '../';
            return;
        }

        const user = await window.authGuards.requireAuthRole(null);
        if (!user) return;

        // Determine role from DB
        let role = null;
        try {
            role = window.firebaseDb && window.firebaseDb.getUserRole
                ? await window.firebaseDb.getUserRole(user.uid)
                : null;
        } catch {
            role = null;
        }

        if (role === 'admin') {
            window.location.href = '../admin/';
            return;
        }

        loadDownloads();
        setupSearch();
        setupFilters();
    })();
});

// Resources cache (loaded from Firebase)
let allResources = [];

async function fetchResources() {
    if (!window.firebaseDb) throw new Error('Firebase DB helper not loaded');
    allResources = await window.firebaseDb.listResources();
    return allResources;
}

// Current filter state
let currentFilter = 'all';

// Load and display downloads
async function loadDownloads(searchTerm = '', filter = 'all') {
    const container = document.getElementById('downloadContainer');
    const emptyState = document.getElementById('emptyState');

    let resources;
    try {
        resources = allResources.length ? allResources : await fetchResources();
    } catch (err) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        emptyState.innerHTML = `<p>Không tải được dữ liệu từ Firebase. Vui lòng kiểm tra quyền truy cập Database Rules hoặc kết nối mạng.</p>`;
        return;
    }
    
    let filtered = resources;
    
    // Apply category filter
    const wanted = String(filter || '').trim().toLowerCase();
    if (wanted === 'tool' || wanted === 'file' || wanted === 'other') {
        filtered = resources.filter(r => {
            const cat = String(r.category || 'other').trim().toLowerCase() || 'other';
            return cat === wanted;
        });
    }
    
    // Apply search
    if (searchTerm) {
        filtered = filtered.filter(resource => 
            resource.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (resource.description && resource.description.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }
    
    if (filtered.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    container.innerHTML = filtered.map((resource, index) => `
        <div class="download-card" style="animation-delay: ${index * 0.05}s;">
            <div class="card-badge">${index + 1}</div>
            <h3>${escapeHtml(resource.name)}</h3>
            ${resource.description ? `<p>${escapeHtml(resource.description)}</p>` : '<p style="color: var(--text-secondary);">Không có mô tả</p>'}
            <div class="card-footer">
                <span class="card-date">${formatDate(resource.createdAt)}</span>
                ${resource.storagePath
                    ? `<button type="button" class="btn btn-primary download-btn" data-id="${escapeHtml(resource.id)}">Tải xuống</button>`
                    : (resource.link
                        ? `<a href="${escapeHtml(resource.link)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">Tải xuống</a>`
                        : `<button type="button" class="btn btn-primary" disabled>Không có link</button>`
                    )
                }
            </div>
        </div>
    `).join('');

    setupDownloadButtons();
}

function getStorageBucket() {
    return window.FIREBASE_WEB_CONFIG && window.FIREBASE_WEB_CONFIG.storageBucket
        ? String(window.FIREBASE_WEB_CONFIG.storageBucket)
        : '';
}

async function downloadViaStorageApi(resource) {
    initFirebase();
    const user = firebase.auth().currentUser;
    if (!user) throw new Error('Not signed in');

    const bucket = getStorageBucket();
    if (!bucket) throw new Error('Missing storageBucket in Firebase config');

    const storagePath = String(resource.storagePath || '').trim();
    if (!storagePath) throw new Error('Missing storagePath');

    const idToken = await user.getIdToken();
    const objectPath = encodeURIComponent(storagePath);
    const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${objectPath}?alt=media`;

    const resp = await fetch(url, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${idToken}`
        }
    });

    if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        throw new Error(`Download failed (${resp.status}) ${detail}`);
    }

    const blob = await resp.blob();
    const fileName = String(resource.fileName || resource.name || 'download').trim() || 'download';

    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

function setupDownloadButtons() {
    document.querySelectorAll('.download-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.id : '';
            const resource = allResources.find(r => r.id === id);
            if (!resource) return;

            e.currentTarget.disabled = true;
            const prevText = e.currentTarget.textContent;
            e.currentTarget.textContent = 'Đang tải...';

            try {
                await downloadViaStorageApi(resource);
            } catch {
                alert('Không thể tải file. Kiểm tra đăng nhập hoặc Storage Rules');
            } finally {
                e.currentTarget.disabled = false;
                e.currentTarget.textContent = prevText;
            }
        });
    });
}

// Format date helper
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Hôm nay';
    if (diffDays === 1) return 'Hôm qua';
    if (diffDays < 7) return `${diffDays} ngày trước`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} tuần trước`;
    return date.toLocaleDateString('vi-VN');
}

// Setup search
function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    let timeout;
    
    searchInput.addEventListener('input', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            loadDownloads(e.target.value.trim(), currentFilter);
        }, 300);
    });
}

// Setup filters
function setupFilters() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    const searchInput = document.getElementById('searchInput');
    
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all buttons
            filterBtns.forEach(b => b.classList.remove('active'));
            
            // Add active class to clicked button
            btn.classList.add('active');
            
            // Update current filter
            currentFilter = btn.dataset.filter;
            
            // Reload downloads
            loadDownloads(searchInput.value.trim(), currentFilter);
        });
    });
}

// Utility function
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
