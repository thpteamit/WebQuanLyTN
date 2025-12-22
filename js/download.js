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
    
    // Apply filter
    if (filter === 'recent') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        filtered = resources.filter(r => new Date(r.createdAt) > sevenDaysAgo);
    } else if (filter === 'popular') {
        // Sort by name (as we don't have view count)
        filtered = [...resources].sort((a, b) => a.name.localeCompare(b.name));
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
                <a href="${escapeHtml(resource.link)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">Tải xuống</a>
            </div>
        </div>
    `).join('');
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
