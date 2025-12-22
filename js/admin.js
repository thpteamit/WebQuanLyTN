// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupLogout();
    (async () => {
        if (!window.authGuards || !window.authGuards.requireAuthRole) {
            window.location.href = '../';
            return;
        }

        const user = await window.authGuards.requireAuthRole('admin');
        if (!user) return;

        await refreshAndRender();
        setupAddForm();
        setupEditForm();
        setupSearch();
        setupSort();
    })();
});

// Resources cache (loaded from Firebase)
let allResources = [];

async function fetchResources() {
    if (!window.firebaseDb) throw new Error('Firebase DB helper not loaded');
    allResources = await window.firebaseDb.listResources();
    return allResources;
}

async function refreshAndRender() {
    try {
        await fetchResources();
        loadResources();
    } catch (err) {
        const container = document.getElementById('resourcesContainer');
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 40px;">Không tải được dữ liệu từ Firebase. Vui lòng kiểm tra Database Rules hoặc kết nối mạng.</p>';
        document.getElementById('totalResources').textContent = '0';
        document.getElementById('todayAdded').textContent = '0';
        document.getElementById('totalLinks').textContent = '0';
    }
}

function ensureStorageAvailable() {
    try {
        initFirebase();
    } catch {
        throw new Error('Firebase not initialized');
    }
    if (!window.firebase || !firebase.storage) {
        throw new Error('Firebase Storage SDK not loaded');
    }
    return firebase.storage();
}

function sanitizeFileName(fileName) {
    return String(fileName || '')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

async function uploadResourceFile(file, preferredName = '') {
    if (!file) throw new Error('Missing file');
    const storage = ensureStorageAvailable();

    const safeName = sanitizeFileName(file.name || preferredName || 'file');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const path = `resources/${ts}_${safeName}`;

    const ref = storage.ref(path);
    await ref.put(file, {
        contentType: file.type || undefined
    });

    return {
        storagePath: path,
        fileName: file.name || safeName,
        fileSize: file.size || 0
    };
}

async function deleteStorageObject(storagePath) {
    const cleanPath = String(storagePath || '').trim();
    if (!cleanPath) return;
    try {
        const storage = ensureStorageAvailable();
        await storage.ref(cleanPath).delete();
    } catch {
        // best-effort
    }
}

// Update stats
function updateStats() {
    const resources = allResources;
    document.getElementById('totalResources').textContent = resources.length;
    
    // Count today's additions
    const today = new Date().toDateString();
    const todayAdded = resources.filter(r => {
        const createdDate = new Date(r.createdAt).toDateString();
        return createdDate === today;
    }).length;
    document.getElementById('todayAdded').textContent = todayAdded;
    
    document.getElementById('totalLinks').textContent = resources.length;
}

// Load and display resources
function loadResources(searchTerm = '', sortBy = 'newest') {
    const resources = allResources;
    const container = document.getElementById('resourcesContainer');
    
    if (resources.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 40px;">Chưa có tài nguyên nào</p>';
        updateStats();
        return;
    }
    
    // Filter by search term
    let filtered = resources;
    if (searchTerm) {
        filtered = resources.filter(resource => 
            resource.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (resource.description && resource.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
            resource.link.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }
    
    // Sort resources
    filtered = [...filtered].sort((a, b) => {
        switch(sortBy) {
            case 'oldest':
                return new Date(a.createdAt) - new Date(b.createdAt);
            case 'name':
                return a.name.localeCompare(b.name);
            case 'newest':
            default:
                return new Date(b.createdAt) - new Date(a.createdAt);
        }
    });
    
    if (filtered.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 40px;">Không tìm thấy tài nguyên nào</p>';
        return;
    }
    
    container.innerHTML = filtered.map(resource => `
        <div class="resource-item" data-id="${resource.id}">
            <div class="resource-header">
                <div class="resource-info">
                    <h3>${escapeHtml(resource.name)}</h3>
                    ${resource.description ? `<p>${escapeHtml(resource.description)}</p>` : ''}
                    ${resource.storagePath
                        ? `<div class="resource-link">Storage: ${escapeHtml(resource.storagePath)}</div>`
                        : (resource.link ? `<a href="${escapeHtml(resource.link)}" target="_blank" rel="noopener noreferrer" class="resource-link">${escapeHtml(resource.link)}</a>` : '')
                    }
                </div>
                <div class="resource-actions">
                    <button class="btn btn-success edit-btn" data-id="${resource.id}">Sửa</button>
                    <button class="btn btn-danger delete-btn" data-id="${resource.id}">Xóa</button>
                </div>
            </div>
        </div>
    `).join('');
    
    // Setup event listeners
    setupResourceActions();
    updateStats();
}

// Setup add form
function setupAddForm() {
    const form = document.getElementById('addResourceForm');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('resourceName').value.trim();
        const link = document.getElementById('resourceLink').value.trim();
        const description = document.getElementById('resourceDescription').value.trim();
        const fileInput = document.getElementById('resourceFile');
        const file = fileInput && fileInput.files ? fileInput.files[0] : null;

        if (!file && !link) {
            showSuccessMessage('Hãy chọn file hoặc nhập link ngoài');
            return;
        }

        let fileInfo = null;
        if (file) {
            try {
                fileInfo = await uploadResourceFile(file, name);
            } catch {
                showSuccessMessage('Không thể upload file. Kiểm tra Firebase Storage Rules/SDK');
                return;
            }
        }

        try {
            await window.firebaseDb.createResource({
                name,
                link: fileInfo ? '' : link,
                storagePath: fileInfo ? fileInfo.storagePath : '',
                fileName: fileInfo ? fileInfo.fileName : '',
                fileSize: fileInfo ? fileInfo.fileSize : 0,
                description,
                createdAt: new Date().toISOString()
            });
        } catch (err) {
            showSuccessMessage('Không thể thêm tài nguyên. Vui lòng kiểm tra Firebase Database Rules');
            return;
        }
        
        // Reset form
        form.reset();
        
        // Reload resources
        await refreshAndRender();
        
        // Show success message
        showSuccessMessage('Đã thêm tài nguyên thành công');
    });
}

// Setup edit form
function setupEditForm() {
    const form = document.getElementById('editResourceForm');
    const modal = document.getElementById('editModal');
    const closeBtn = document.getElementById('closeModal');
    
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('show');
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('editResourceId').value;
        const name = document.getElementById('editResourceName').value.trim();
        const link = document.getElementById('editResourceLink').value.trim();
        const description = document.getElementById('editResourceDescription').value.trim();
        const fileInput = document.getElementById('editResourceFile');
        const file = fileInput && fileInput.files ? fileInput.files[0] : null;

        const existing = allResources.find(r => r.id === id);

        let fileInfo = null;
        if (file) {
            try {
                fileInfo = await uploadResourceFile(file, name);
            } catch {
                showSuccessMessage('Không thể upload file. Kiểm tra Firebase Storage Rules/SDK');
                return;
            }
        }
        
        try {
            await window.firebaseDb.updateResource(id, {
                name,
                link: fileInfo ? '' : link,
                storagePath: fileInfo ? fileInfo.storagePath : (existing ? (existing.storagePath || '') : ''),
                fileName: fileInfo ? fileInfo.fileName : (existing ? (existing.fileName || '') : ''),
                fileSize: fileInfo ? fileInfo.fileSize : (existing ? (existing.fileSize || 0) : 0),
                description
            });

            if (fileInfo && existing && existing.storagePath) {
                await deleteStorageObject(existing.storagePath);
            }

            await refreshAndRender();
            modal.classList.remove('show');
            showSuccessMessage('Đã cập nhật tài nguyên thành công');
        } catch (err) {
            showSuccessMessage('Không thể cập nhật. Vui lòng kiểm tra Firebase Database Rules');
        }
    });
}

// Setup resource actions (edit and delete)
function setupResourceActions() {
    // Edit buttons
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            const resource = allResources.find(r => r.id === id);
            
            if (resource) {
                document.getElementById('editResourceId').value = resource.id;
                document.getElementById('editResourceName').value = resource.name;
                document.getElementById('editResourceLink').value = resource.link;
                document.getElementById('editResourceDescription').value = resource.description || '';
                const fileInput = document.getElementById('editResourceFile');
                if (fileInput) fileInput.value = '';
                document.getElementById('editModal').classList.add('show');
            }
        });
    });
    
    // Delete buttons
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            const resource = allResources.find(r => r.id === id);
            
            if (confirm('Bạn có chắc chắn muốn xóa tài nguyên này?')) {
                try {
                    await window.firebaseDb.deleteResource(id);
                    if (resource && resource.storagePath) {
                        await deleteStorageObject(resource.storagePath);
                    }
                    await refreshAndRender();
                    showSuccessMessage('Đã xóa tài nguyên thành công');
                } catch (err) {
                    showSuccessMessage('Không thể xóa. Vui lòng kiểm tra Firebase Database Rules');
                }
            }
        });
    });
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showSuccessMessage(message) {
    const existing = document.querySelector('.success-message');
    if (existing) existing.remove();
    
    const msg = document.createElement('div');
    msg.className = 'success-message';
    msg.textContent = message;
    
    const container = document.querySelector('.admin-panel');
    container.insertBefore(msg, container.firstChild);
    
    setTimeout(() => {
        msg.remove();
    }, 3000);
}

// Setup search functionality
function setupSearch() {
    const searchInput = document.getElementById('adminSearchInput');
    const sortSelect = document.getElementById('sortSelect');
    let timeout;
    
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                loadResources(e.target.value, sortSelect.value);
            }, 300);
        });
    }
}

// Setup sort functionality
function setupSort() {
    const sortSelect = document.getElementById('sortSelect');
    const searchInput = document.getElementById('adminSearchInput');
    
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            loadResources(searchInput.value, e.target.value);
        });
    }
}
