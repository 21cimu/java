// Personal Cloud Drive Application
class CloudDrive {
    constructor() {
        this.currentPath = '/';
        this.selectedItems = new Set();
        this.currentView = 'files'; // 'files' or 'trash'
        // Sorting state: key can be 'name'|'type'|'size'|'time', order 'asc'|'desc' or null
        this.sortKey = null;
        this.sortOrder = null;
        // View mode: 'list' | 'grid-compact' | 'grid-large' (persisted)
        this.viewMode = localStorage.getItem('viewMode') || 'list';
        // Cache last fetched items to enable instant re-rendering (sort/view switch without refetch)
        this.lastItems = null;
        // Determine application base path so requests go to the current webapp context
        // e.g. if index served at /myapp/index.html, base will be '/myapp'
        // Use absolute origin + path to avoid fetch resolving incorrectly in some environments
        const ctx = window.location.pathname.replace(/\/[^/]*$/, '') || '';
        this.base = window.location.origin + ctx;
        this.init();
    }

    init() {
        this.setupEventListeners();
        try { window.__appTrace && window.__appTrace('app.init: setupEventListeners done'); } catch(e){}
        // setup sortable headers after DOM ready
        this.setupSortableHeaders();
        try { window.__appTrace && window.__appTrace('app.init: setupSortableHeaders done'); } catch(e){}
        // setup view toggle/menu
        this.setupViewToggle();
        try { window.__appTrace && window.__appTrace('app.init: setupViewToggle done'); } catch(e){}
        // Initialize AI first so sidebar handlers can call hideAIPanel()
        this.initAI();
        this.initSidebar();
        // initialize auth UI (avatar, user center)
        try { window.__appTrace && window.__appTrace('app.init: calling initAuth'); } catch(e){}
        this.initAuth().then(() => {
            try { window.__appTrace && window.__appTrace('app.init: initAuth resolved'); } catch(e){}
            this.loadDirectory(this.currentPath);
        });
    }

    // ----------------- Authentication / User center -----------------
    async initAuth() {
        try { window.__appTrace && window.__appTrace('initAuth: start'); } catch(e){}
        try {
            const resp = await fetch(`${this.base}/api/auth?action=current`);
            try { window.__appTrace && window.__appTrace('initAuth: fetched /api/auth, status=' + resp.status); } catch(e){}
            // 先读取文本，避免 parseJson 在非 JSON 响应时抛出并终止流程
            const respText = await resp.text();
            let data = null;
            try { data = JSON.parse(respText); } catch (e) { data = null; }
            try { window.__appTrace && window.__appTrace('initAuth: parsed respText -> ' + (data ? 'json' : 'no-json')); } catch(e){}
             const avatarImg = document.getElementById('userAvatarImg');
             const avatarBtn = document.getElementById('userAvatarBtn');
             // 如果后端返回了用户信息且用户名为 root，则将用户引导到管理员控制台
             try {
                // 抽取可能包含用户名的字段，兼容多种后端返回格式；实现递归搜索以便在任意嵌套 JSON 中找到用户名
                function extractUsernameFromJson(obj) {
                    if (!obj || typeof obj !== 'object') return null;
                    const keys = Object.keys(obj);
                    for (let k of keys) {
                        try {
                            const v = obj[k];
                            if (k.toLowerCase() === 'username' || k === 'userName' || k.toLowerCase() === 'name') {
                                if (typeof v === 'string' && v.trim().length > 0) return v;
                            }
                            if (v && typeof v === 'object') {
                                const found = extractUsernameFromJson(v);
                                if (found) return found;
                            }
                        } catch (e) { /* ignore */ }
                    }
                    return null;
                }

                let uname = null;
                if (data) {
                    uname = extractUsernameFromJson(data);
                }
                if (!uname && respText) {
                    // 常见 JSON 字段匹配（文本回退）
                    const m = respText.match(/"username"\s*:\s*"([^\"]+)"/i) || respText.match(/"userName"\s*:\s*"([^\"]+)"/i) || respText.match(/"name"\s*:\s*"([^\"]+)"/i);
                    if (m) uname = m[1];
                }
                 // 调试输出：便于后端接口适配问题排查
                 console.debug('initAuth: resp.status=', resp.status, 'parsedJson=', !!data, 'resolved username=', uname);
                 // 兼容通过角色标识管理员的后端（例如 role: 'admin' 或 roles: ['admin']）
                 let isAdmin = false;
                 if (typeof uname === 'string' && uname.toLowerCase() === 'root') isAdmin = true;
                 if (data && data.user && typeof data.user === 'object') {
                     const ur = data.user.role || data.user.roles || data.user.rolesList || null;
                     if (typeof ur === 'string' && ['admin','administrator','root','super'].includes(ur.toLowerCase())) isAdmin = true;
                     if (Array.isArray(ur) && ur.map(x=>String(x).toLowerCase()).some(x=>['admin','administrator','root','super'].includes(x))) isAdmin = true;
                     // some backends return roles under 'roles' array on top-level
                     if (Array.isArray(data.user.roles) && data.user.roles.map(x=>String(x).toLowerCase()).some(x=>['admin','administrator','root','super'].includes(x))) isAdmin = true;
                 }
                 if (isAdmin) {
                     const ctx = window.location.pathname.replace(/\/[^/]*$/, '') || '';
                     window.location.href = window.location.origin + ctx + '/admin.html';
                     return; // 停止后续初始化
                 }
             } catch (e) {
                 // ignore parsing error
             }

            // 若能解析出 JSON，则使用 JSON 字段判断登录状态；否则以 HTTP 状态作为次优判断
            const loggedIn = (data && (data.loggedIn || data.logged_in || data.logged)) || resp.ok;
            if (loggedIn) {
                if (avatarImg && data.avatar) avatarImg.src = data.avatar;
                if (avatarImg && !data.avatar) {
                    // leave default
                }
                if (avatarBtn) avatarBtn.addEventListener('click', () => this.showUserCenter());
            } else {
                // if not logged in, queue a notify for the login page and redirect
                try { localStorage.setItem('lastNotify', JSON.stringify({ type: 'error', message: '请先登录' })); } catch (e) { /* ignore */ }
                window.location.href = this.base + '/login.html';
            }
            // wire logout inside user center modal
            const logoutBtn = document.getElementById('userCenterLogout');
            if (logoutBtn) logoutBtn.addEventListener('click', async () => {
                const body = new URLSearchParams(); body.append('action','logout');
                await fetch(this.base + '/api/auth', { method: 'POST', body });
                window.location.href = this.base + '/login.html';
            });

            // wire cancel/save buttons
            const cancelBtn = document.getElementById('userCenterCancel');
            if (cancelBtn) cancelBtn.addEventListener('click', () => { document.getElementById('userCenterModal').style.display='none'; });
            const saveBtn = document.getElementById('userCenterSave');
            if (saveBtn) saveBtn.addEventListener('click', () => this.saveUserCenter());
        } catch (e) {
            console.debug('initAuth failed', e);
        }
    }

    async showUserCenter() {
        // 打开单独的用户中心页面（保持与 webapp 上下文一致）
        try {
            const ctx = window.location.pathname.replace(/\/[^/]*$/, '') || '';
            window.location.href = window.location.origin + ctx + '/user.html';
        } catch (e) {
            console.debug('跳转到用户中心页面失败', e);
        }
    }

    async saveUserCenter() {
        if (!this._userCenter) return;
        const id = this._userCenter.id;
        const username = this._userCenter.unameEl.value.trim();
        const password = this._userCenter.pwdEl.value;
        const avatar = this._userCenter.avatarPreview.getAttribute('data-durl') || this._userCenter.avatarPreview.src || null;
        // Only include password when user actually provided a non-empty value
        const payload = { username, avatar };
        if (password && password.trim().length > 0) payload.password = password;
        try {
            const resp = await fetch(this.base + '/api/user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await this.parseJson(resp);
            if (data && data.success) {
                // update header avatar
                const headerImg = document.getElementById('userAvatarImg');
                const serverAvatar = data.avatar || avatar;
                if (headerImg && serverAvatar) headerImg.src = serverAvatar;
                document.getElementById('userCenterModal').style.display = 'none';
                try { window.notify && window.notify.success('保存成功'); } catch (e) { await this.alertModal('保存成功'); }
            } else {
                try { window.notify && window.notify.error('保存失败: ' + (data && data.message ? data.message : '未知错误')); } catch (e) { this.alertModal('保存失败: ' + (data && data.message ? data.message : '未知错误')); }
            }
        } catch (e) {
            try { window.notify && window.notify.error('保存失败: ' + e.message); } catch (err) { this.alertModal('保存失败: ' + e.message); }
        }
    }

    /* Modal helpers: alertModal, confirmModal, promptModal
       These use the #appModal DOM added to index.html and return Promises.
    */
    openModal(title, bodyHtml, buttons=[]) {
        return new Promise(resolve => {
            const modal = document.getElementById('appModal');
            const titleEl = document.getElementById('appModalTitle');
            const bodyEl = document.getElementById('appModalBody');
            const footerEl = document.getElementById('appModalFooter');
            if (!modal || !titleEl || !bodyEl || !footerEl) {
                // Fallback to native alert/confirm/prompt
                const fallback = buttons.length === 0 ? null : buttons[0].id;
                resolve(fallback);
                return;
            }
            titleEl.textContent = title || '';
            if (typeof bodyHtml === 'string') bodyEl.innerHTML = bodyHtml;
            else { bodyEl.innerHTML = ''; bodyEl.appendChild(bodyHtml); }
            footerEl.innerHTML = '';

            // create buttons
            buttons.forEach(b => {
                const btn = document.createElement('button');
                btn.className = 'btn ' + (b.className || '');
                btn.textContent = b.label || 'OK';
                btn.addEventListener('click', () => {
                    modal.style.display = 'none';
                    modal.setAttribute('aria-hidden', 'true');
                    // cleanup listeners
                    modal.removeEventListener('click', backdropHandler);
                    document.removeEventListener('keydown', keyHandler);
                    resolve(b.value);
                });
                footerEl.appendChild(btn);
            });

            // show modal
            modal.style.display = 'flex';
            modal.setAttribute('aria-hidden', 'false');
            // focus first button for accessibility
            const firstBtn = footerEl.querySelector('button');
            if (firstBtn) firstBtn.focus();

            // allow clicking backdrop (modal element) to cancel/close
            function backdropHandler(ev) {
                if (ev.target === modal) {
                    modal.style.display = 'none';
                    modal.setAttribute('aria-hidden', 'true');
                    modal.removeEventListener('click', backdropHandler);
                    document.removeEventListener('keydown', keyHandler);
                    // resolve with first button id or null
                    const fallback = buttons.length === 0 ? null : buttons[0].id;
                    resolve(fallback);
                }
            }
            modal.addEventListener('click', backdropHandler);

            // allow ESC to close modal
            function keyHandler(ev) {
                if (ev.key === 'Escape' || ev.key === 'Esc') {
                    if (modal.style.display === 'flex') {
                        modal.style.display = 'none';
                        modal.setAttribute('aria-hidden', 'true');
                        modal.removeEventListener('click', backdropHandler);
                        document.removeEventListener('keydown', keyHandler);
                        const fallback = buttons.length === 0 ? null : buttons[0].id;
                        resolve(fallback);
                    }
                }
            }
            document.addEventListener('keydown', keyHandler);
        });
    }

    alertModal(message, title='提示') {
        const p = this.openModal(title, `<div>${message}</div>`, [ { id: 'ok', label: '确定', value: true, className: 'btn-primary' } ]);
        // auto-close alert modal after 4s to avoid blocking the UI in error scenarios
        setTimeout(() => {
            try {
                const modal = document.getElementById('appModal');
                if (modal && modal.style.display === 'flex') {
                    const okBtn = modal.querySelector('button.btn-primary');
                    if (okBtn) okBtn.click();
                }
            } catch (e) { /* ignore */ }
        }, 4000);
        return p;
    }

    confirmModal(message, title='确认') {
        return this.openModal(title, `<div>${message}</div>`, [
            { id: 'cancel', label: '取消', value: false },
            { id: 'ok', label: '确定', value: true, className: 'btn-primary' }
        ]);
    }

    promptModal(message, defaultValue = '', title='输入') {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = defaultValue || '';
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                // trigger ok programmatically
                const okBtn = document.querySelector('#appModalFooter button.btn-primary');
                if (okBtn) okBtn.click();
            }
        });
        const wrapper = document.createElement('div');
        const label = document.createElement('div');
        label.style.marginBottom = '8px';
        label.textContent = message;
        wrapper.appendChild(label);
        wrapper.appendChild(input);

        return new Promise(resolve => {
            this.openModal(title, wrapper, [
                { id: 'cancel', label: '取消', value: null },
                { id: 'ok', label: '确定', value: 'ok', className: 'btn-primary' }
            ]).then(res => {
                if (res === 'ok') resolve(input.value);
                else resolve(null);
            });
            // focus the input after small delay
            setTimeout(() => input.focus(), 50);
        });
    }

    initSidebar() {
        const navFiles = document.getElementById('nav-files');
        const navTrash = document.getElementById('nav-trash');
        const navShare = document.getElementById('nav-share');
        const navAi = document.getElementById('nav-ai');
        const navImages = document.getElementById('nav-images');
        const navVideos = document.getElementById('nav-videos');
        const navDocuments = document.getElementById('nav-documents');
        const navArchives = document.getElementById('nav-archives');
        const filesToggle = document.getElementById('filesToggle');
        const filesChildren = document.getElementById('filesChildren');

        // Clear active state on all sidebar anchor items
        const clearAllSidebarActive = () => {
            document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
        };

        // Ensure filesChildren exists; if not, fallback to previous flat structure
        if (filesChildren) {
            // default collapsed state: expanded
            filesChildren.classList.remove('collapsed');
            if (filesToggle) {
                // ensure button reflects collapsed state
                filesToggle.classList.remove('collapsed');
                filesToggle.addEventListener('click', () => {
                    const collapsed = filesChildren.classList.toggle('collapsed');
                    if (collapsed) {
                        filesToggle.classList.add('collapsed');
                        filesToggle.textContent = '▸';
                    } else {
                        filesToggle.classList.remove('collapsed');
                        filesToggle.textContent = '▾';
                    }
                });
            }
        }

        if (navFiles) {
            navFiles.addEventListener('click', () => {
                if (this.hideAIPanel) this.hideAIPanel();
                this.currentView = 'files';
                // clear all active states and mark files as active
                clearAllSidebarActive();
                navFiles.classList.add('active');
                if (filesChildren) {
                    // expand child list when selecting top-level files
                    filesChildren.classList.remove('collapsed');
                    if (filesToggle) {
                        filesToggle.classList.remove('collapsed');
                        filesToggle.textContent = '▾';
                    }
                }
                this.updateToolbarForView();
                this.loadDirectory('/');
            });
        }
        if (navTrash) {
            navTrash.addEventListener('click', () => {
                if (this.hideAIPanel) this.hideAIPanel();
                this.currentView = 'trash';
                clearAllSidebarActive();
                navTrash.classList.add('active');
                this.updateToolbarForView();
                this.loadTrash();
            });
        }
        if (navShare) {
            navShare.addEventListener('click', async () => {
                if (this.hideAIPanel) this.hideAIPanel();
                this.currentView = 'share';
                clearAllSidebarActive();
                navShare.classList.add('active');
                this.updateToolbarForView();
                await this.loadShares();
            });
        }
        if (navImages) navImages.addEventListener('click', () => { if (this.hideAIPanel) this.hideAIPanel(); clearAllSidebarActive(); this.loadType('images', navImages); });
        if (navVideos) navVideos.addEventListener('click', () => { if (this.hideAIPanel) this.hideAIPanel(); clearAllSidebarActive(); this.loadType('videos', navVideos); });
        if (navDocuments) navDocuments.addEventListener('click', () => { if (this.hideAIPanel) this.hideAIPanel(); clearAllSidebarActive(); this.loadType('documents', navDocuments); });
        if (navArchives) navArchives.addEventListener('click', () => { if (this.hideAIPanel) this.hideAIPanel(); clearAllSidebarActive(); this.loadType('archives', navArchives); });
        // navAi handling is managed in initAI() to avoid duplicate/contradictory handlers
    }

    async loadType(typeKey, el) {
        // set view to types so toolbar behaves like files
        this.currentView = 'types';
        // clear active on other sidebar items (include both top-level and child lists)
        document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
        if (el) el.classList.add('active');
        this.updateToolbarForView();
        await this.loadDirectory('/.type/' + typeKey);
    }

    async loadTrash() {
        // show top-level trash folders
        this.currentPath = '/.trash';
        this.updateToolbarForView();
        this.startTrashWatcher();
        await this.loadDirectory(this.currentPath);
    }

    // Start periodic purge/check when in trash view
    startTrashWatcher() {
        if (this._trashPurgeTimer) return;
        // immediate attempt to purge once
        this.doPurge().catch(e => console.debug('initial purge failed', e));
        // call backend purge every 30s
        this._trashPurgeTimer = setInterval(() => {
            this.doPurge().catch(e => console.debug('purge failed', e));
        }, 30*1000);
        // update countdown display every 60s
        this._trashRefreshTimer = setInterval(() => {
            if (this.currentPath && this.currentPath.startsWith('/.trash') && this.lastItems) {
                const sorted = this.applySortToItems(this.lastItems);
                this.renderFileList(sorted);
            }
        }, 60*1000);
    }

    stopTrashWatcher() {
        if (this._trashPurgeTimer) { clearInterval(this._trashPurgeTimer); this._trashPurgeTimer = null; }
        if (this._trashRefreshTimer) { clearInterval(this._trashRefreshTimer); this._trashRefreshTimer = null; }
        this.clearNextPurge();
    }

    async doPurge() {
        try {
            const resp = await fetch(`${this.base}/api/directory?action=purge`);
            const data = await this.parseJson(resp);
            if (data && data.success && Array.isArray(data.purged) && data.purged.length > 0) {
                console.debug('purged items:', data.purged);
                // reload to reflect removed items
                await this.loadDirectory(this.currentPath);
            }
            return data;
        } catch (e) {
            console.debug('doPurge error', e);
            throw e;
        }
    }

    // Update toolbar for view
    updateToolbarForView() {
        // Hide upload/new-folder/select-all/search when in trash view
        const uploadBtn = document.getElementById('uploadBtn');
        const newFolderBtn = document.getElementById('newFolderBtn');
        const fileInput = document.getElementById('fileInput');
        const selectAll = document.getElementById('selectAll');
        const searchInput = document.getElementById('searchInput');
        const searchBtn = document.getElementById('searchBtn');
        const restoreSelectedBtn = document.getElementById('restoreSelectedBtn');
        const shareBtn = document.getElementById('shareBtn');
        const cancelShareBtn = document.getElementById('cancelShareBtn');

        if (this.currentView === 'trash') {
            if (uploadBtn) uploadBtn.style.display = 'none';
            if (newFolderBtn) newFolderBtn.style.display = 'none';
            if (fileInput) fileInput.style.display = 'none';
            // keep selectAll visible in trash so users can batch-select items there
            if (selectAll) selectAll.style.display = '';
            if (searchInput) searchInput.style.display = 'none';
            if (searchBtn) searchBtn.style.display = 'none';
            if (restoreSelectedBtn) restoreSelectedBtn.style.display = '';
            // change delete button text to '永久删除' to make intent clear
            const deleteBtn = document.getElementById('deleteBtn');
            if (deleteBtn) deleteBtn.textContent = '永久删除';
            if (shareBtn) shareBtn.style.display = 'none';
            if (cancelShareBtn) cancelShareBtn.style.display = 'none';
        } else if (this.currentView === 'share') {
            // In share view: hide file/directory actions and show share-related actions
            if (uploadBtn) uploadBtn.style.display = 'none';
            if (newFolderBtn) newFolderBtn.style.display = 'none';
            if (fileInput) fileInput.style.display = 'none';
            // allow selectAll in share list for batch operations
            if (selectAll) selectAll.style.display = '';
            if (searchInput) searchInput.style.display = 'none';
            if (searchBtn) searchBtn.style.display = 'none';
            if (restoreSelectedBtn) restoreSelectedBtn.style.display = 'none';
            // remove the general delete button from the share view to avoid confusion
            const deleteBtn2 = document.getElementById('deleteBtn');
            if (deleteBtn2) deleteBtn2.style.display = 'none';
            if (shareBtn) shareBtn.style.display = 'none';
            if (cancelShareBtn) cancelShareBtn.style.display = '';
        } else {
            if (uploadBtn) uploadBtn.style.display = '';
            if (newFolderBtn) newFolderBtn.style.display = '';
            if (fileInput) fileInput.style.display = '';
            if (selectAll) selectAll.style.display = '';
            if (restoreSelectedBtn) restoreSelectedBtn.style.display = 'none';
            if (searchInput) searchInput.style.display = '';
            if (searchBtn) searchBtn.style.display = '';
            const deleteBtn = document.getElementById('deleteBtn');
            if (deleteBtn) deleteBtn.textContent = '删除';
            if (shareBtn) shareBtn.style.display = '';
            if (cancelShareBtn) cancelShareBtn.style.display = 'none';
        }
    }

    // Synchronize sidebar active states based on currentView/currentPath.
    syncSidebarActive() {
        try {
            // clear all
            document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
            const navFiles = document.getElementById('nav-files');
            const navTrash = document.getElementById('nav-trash');
            const navShare = document.getElementById('nav-share');
            const navAi = document.getElementById('nav-ai');
            const navImages = document.getElementById('nav-images');
            const navVideos = document.getElementById('nav-videos');
            const navDocuments = document.getElementById('nav-documents');
            const navArchives = document.getElementById('nav-archives');

            if (this.currentView === 'trash') {
                if (navTrash) navTrash.classList.add('active');
                return;
            }
            if (this.currentView === 'ai') {
                if (navAi) navAi.classList.add('active');
                return;
            }
            if (this.currentView === 'share') {
                if (navShare) navShare.classList.add('active');
                return;
            }
            if (this.currentView === 'types') {
                // try to infer type key from currentPath (e.g. /.type/images)
                if (this.currentPath && this.currentPath.startsWith('/.type/')) {
                    const parts = this.currentPath.split('/').filter(p => p.length>0);
                    const key = parts.length >= 2 ? parts[1] : null; // parts[0] is '.type'
                    if (key) {
                        const el = document.getElementById('nav-' + key);
                        if (el) { el.classList.add('active'); return; }
                    }
                }
                // fallback to files group
                if (navFiles) navFiles.classList.add('active');
                return;
            }
            // default: files view
            if (navFiles) navFiles.classList.add('active');
        } catch (e) {
            console.debug('syncSidebarActive error', e);
        }
    }

    // Render breadcrumb for current path or special views
    updateBreadcrumb(path) {
        const bc = document.getElementById('breadcrumb');
        if (!bc) return;
        bc.innerHTML = '';
        if (this.currentView === 'share') {
            const span = document.createElement('span');
            span.className = 'breadcrumb-item';
            span.textContent = '分享';
            bc.appendChild(span);
            return;
        }
        // render path segments, home as 我的云盘
        const home = document.createElement('span');
        home.className = 'breadcrumb-item';
        home.setAttribute('data-path', '/');
        home.innerHTML = '<span class="icon">🏠</span> 我的云盘';
        home.addEventListener('click', () => { this.loadDirectory('/'); });
        bc.appendChild(home);

        if (!path || path === '/' ) return;
        const parts = path.split('/').filter(p => p.length>0);
        let accum = '';
        parts.forEach((p) => {
             accum += '/' + p;
             const item = document.createElement('span');
             item.className = 'breadcrumb-item';
             item.setAttribute('data-path', accum);
             item.textContent = p;
             item.style.cursor = 'pointer';
             item.addEventListener('click', () => { this.loadDirectory(accum); });
             bc.appendChild(item);
         });
    }

    setupEventListeners() {
        // Upload button
        const uploadBtnEl = document.getElementById('uploadBtn');
        if (uploadBtnEl) uploadBtnEl.addEventListener('click', () => {
            const fileInputEl = document.getElementById('fileInput');
            if (fileInputEl) fileInputEl.click();
        });

        const fileInputEl = document.getElementById('fileInput');
        if (fileInputEl) fileInputEl.addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files);
        });

        // Restore selected button (batch restore in trash view)
        const restoreSelectedBtn = document.getElementById('restoreSelectedBtn');
        if (restoreSelectedBtn) {
            restoreSelectedBtn.addEventListener('click', () => this.restoreSelected());
        }

        // New folder button
        const newFolderBtnEl = document.getElementById('newFolderBtn');
        if (newFolderBtnEl) newFolderBtnEl.addEventListener('click', () => {
            this.createNewFolder();
        });

        // Delete button
        const deleteBtnEl = document.getElementById('deleteBtn');
        if (deleteBtnEl) deleteBtnEl.addEventListener('click', () => {
            this.deleteSelected();
        });

        // Refresh button
        const refreshBtnEl = document.getElementById('refreshBtn');
        if (refreshBtnEl) refreshBtnEl.addEventListener('click', () => {
            this.loadDirectory(this.currentPath);
        });

        // Search button
        const searchBtnEl = document.getElementById('searchBtn');
        if (searchBtnEl) searchBtnEl.addEventListener('click', () => {
            this.performSearch();
        });

        const searchInputEl = document.getElementById('searchInput');
        if (searchInputEl) searchInputEl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.performSearch();
            }
        });

        // Select all checkbox
        const selectAllEl = document.getElementById('selectAll');
        if (selectAllEl) selectAllEl.addEventListener('change', (e) => {
            this.selectAll(e.target.checked);
        });

        // Share toolbar button (if present)
        const shareBtnEl = document.getElementById('shareBtn');
        if (shareBtnEl) shareBtnEl.addEventListener('click', () => {
            if (this.selectedItems.size === 1) {
                const path = Array.from(this.selectedItems)[0];
                this.openShareModal(path);
            } else {
                this.alertModal('请先选择单个文件进行分享');
            }
        });

        // Cancel share (batch) button
        const cancelShareBtn = document.getElementById('cancelShareBtn');
        if (cancelShareBtn) cancelShareBtn.addEventListener('click', () => this.cancelSelectedShares());
    }

    // Bulk cancel shares: collect selected checkboxes' data-id and call backend
    async cancelSelectedShares() {
        // only valid in share view
        if (this.currentView !== 'share') return;
        const cbs = Array.from(document.querySelectorAll('.item-checkbox:checked'));
        if (cbs.length === 0) {
            this.alertModal('请先选择要取消的分享');
            return;
        }
        const ids = cbs.map(cb => cb.getAttribute('data-id')).filter(Boolean);
        if (ids.length === 0) {
            this.alertModal('选中的行未包含分享 id，无法取消分享');
            return;
        }
        const ok = await this.confirmModal(`确定要取消选中的 ${ids.length} 个分享吗？`);
        if (!ok) return;
        this.showLoading();
        try {
            const results = {};
            for (let id of ids) {
                try {
                    const resp = await fetch(`${this.base}/api/share?action=remove&id=${encodeURIComponent(id)}`, { method: 'POST' });
                    const data = await this.parseJson(resp);
                    results[id] = !!(data && data.success);
                } catch (e) {
                    results[id] = false;
                }
            }
            const failed = Object.keys(results).filter(k => !results[k]);
            if (failed.length === 0) {
                await this.alertModal('取消分享成功', '完成');
            } else {
                await this.alertModal('部分取消失败:\n' + failed.join('\n'));
            }
            await this.loadShares();
        } catch (err) {
            this.showError('取消分享失败: ' + err.message);
        } finally {
            this.hideLoading();
        }
    }

    showLoading() {
        document.getElementById('loadingOverlay').style.display = 'flex';
    }

    hideLoading() {
        document.getElementById('loadingOverlay').style.display = 'none';
    }

    // Robust JSON parser: if server returned HTML (e.g. index.html) we'll return a failure object instead of throwing
    async parseJson(response) {
        const contentType = response.headers.get('content-type') || '';
        const text = await response.text();
        // If server sets application/json, try to parse normally
        if (contentType.includes('application/json')) {
            try {
                return JSON.parse(text);
            } catch (e) {
                console.debug('parseJson: content-type=application/json but parse failed:', e);
                try { window.__appTrace && window.__appTrace('parseJson: json parse failed'); } catch(ex){}
                // return an object indicating parse failure so callers can handle gracefully
                return { success: false, __parseError: true, message: '服务器返回了 application/json 但解析失败', raw: text };
            }
        }
        // If content-type is missing or incorrect, try to parse the body as JSON anyway (tolerant)
        try {
            return JSON.parse(text);
        } catch (e) {
            const preview = text.length > 800 ? text.substring(0,800) + '...' : text;
            console.debug('parseJson: response not JSON, preview:', preview);
            try { window.__appTrace && window.__appTrace('parseJson: response not JSON, length=' + text.length); } catch(ex){}
            // Return a failure object rather than throwing so UI can remain interactive
            return { success: false, __parseError: true, message: '服务器未返回 JSON，可能是 HTML 页面或重定向', raw: preview };
        }
    }

    async loadDirectory(path) {
        try { window.__appTrace && window.__appTrace('loadDirectory: start path=' + path); } catch(e){}
         this.currentPath = path;
         this.showLoading();
         // update list status
         const statusEl = document.getElementById('listStatus');
         if (statusEl) statusEl.textContent = '加载中...';

         try {
            const url = `${this.base}/api/directory?action=list&path=${encodeURIComponent(path)}`;
            console.debug('loadDirectory fetching URL:', url);
            const response = await fetch(url);
            try { window.__appTrace && window.__appTrace('loadDirectory: fetch returned status=' + response.status); } catch(e){}
            console.debug('loadDirectory got response status:', response.status, 'content-type:', response.headers.get('content-type'));
            const data = await this.parseJson(response);
            try { window.__appTrace && window.__appTrace('loadDirectory: parseJson returned, success=' + (!!data && !!data.success)); } catch(e){}

            console.debug('loadDirectory response data:', data);
            // (previous debug panel removed) — proceed normally

            if (data.success) {
                // normalize items: support data.items or data.results
                let rawItems = data.items || data.results || [];

                // If server returned an object with path/name only (older format), or a list of strings
                if (Array.isArray(rawItems) && rawItems.length > 0 && typeof rawItems[0] === 'string') {
                    rawItems = rawItems.map(p => ({ path: p, name: p.substring(p.lastIndexOf('/') + 1), isDirectory: false, type: 'file' }));
                } else if (!Array.isArray(rawItems)) {
                    rawItems = [];
                }

                // Ensure each item has expected fields
                const items = rawItems.map(it => {
                     if (typeof it === 'string') return { path: it, name: it.substring(it.lastIndexOf('/') + 1), isDirectory: false, type: 'file' };
                     const path = it.path || it.fullPath || it.name || '';
                     const name = it.name || (path ? path.substring(path.lastIndexOf('/') + 1) : it.label || '');
                     const isDirectory = !!it.isDirectory || it.type === 'directory' || (it.type === 'dir');
                     const type = isDirectory ? 'directory' : (it.type || 'file');
                     const size = (typeof it.size === 'number') ? it.size : (it.length || 0);
                     const modificationTime = it.modificationTime || it.mtime || it.lastModified || 0;
                     // originalPath might be provided by trash API
                     const originalPath = it.originalPath || it.origPath || it.sourcePath || null;
                     // expireAt may be provided by trash API (milliseconds since epoch). Normalize to Number (0 means perpetual)
                     const expireAt = (typeof it.expireAt !== 'undefined' && it.expireAt !== null) ? Number(it.expireAt) : 0;
                     return { path, name, isDirectory, type, size, modificationTime, originalPath, expireAt };
                 });

                console.debug('loadDirectory normalized items:', items);
                // cache items for quick re-render on view/sort changes
                this.lastItems = items;
                // if we're viewing trash, check for already-expired items and schedule precise purge at next expiry
                if (this.currentPath && this.currentPath.startsWith('/.trash')) {
                    try {
                        const now = Date.now();
                        const expired = this.lastItems.filter(it => (typeof it.expireAt !== 'undefined') && it.expireAt > 0 && it.expireAt <= now);
                        if (expired.length > 0) {
                            // trigger immediate purge; doPurge will reload if it removed anything
                            const purged = await this.doPurge();
                            if (purged && purged.success && Array.isArray(purged.purged) && purged.purged.length > 0) {
                                return; // refreshed by doPurge
                            }
                        }
                    } catch (e) { console.debug('immediate purge check failed', e); }
                    this.scheduleNextPurge();
                } else {
                    this.clearNextPurge();
                }
                // apply client-side sorting if set
                const sorted = this.applySortToItems(items);
                this.renderFileList(sorted);
                // synchronize sidebar active state after rendering so highlight reflects current view
                try { if (typeof this.syncSidebarActive === 'function') this.syncSidebarActive(); } catch(e){ console.debug('syncSidebarActive failed', e); }
                // update status with item count
                // 不再显示“共 n 项”的文本（根据需求移除）
                if (statusEl) statusEl.textContent = '';
                console.debug('about to call updateBreadcrumb, typeof:', typeof this.updateBreadcrumb);
                if (typeof this.updateBreadcrumb === 'function') {
                    this.updateBreadcrumb(path);
                } else {
                    console.error('updateBreadcrumb is not a function on this:', this);
                    // don't throw; show a helpful message in console and continue
                }
                // show small success notification for directory load
                try { if (window.notify) window.notify.success('加载成功'); } catch (e) { /* ignore */ }
            } else {
                // If backend returned success=false, try a debug fetch to obtain stack trace
                this.showError(data.message);
                try {
                    const debugUrl = url + '&debug=true';
                    console.debug('Attempting debug fetch:', debugUrl);
                    const debugResp = await fetch(debugUrl);
                    const debugData = await this.parseJson(debugResp);
                    if (debugData && debugData.stack) {
                        // show stack in modal for easier debugging
                        await this.alertModal('服务器列目录出错: ' + debugData.message + '\n\n' + debugData.stack, '调试信息');
                    }
                } catch (dbgErr) {
                    console.debug('Debug fetch failed:', dbgErr.message);
                }
            }
         } catch (error) {
            // If parseJson fails (likely non-JSON), try a debug fetch to get server JSON stack
            this.showError('加载目录失败: ' + error.message);
            const statusEl2 = document.getElementById('listStatus');
            if (statusEl2) statusEl2.textContent = '加载失败: ' + error.message;
            try {
                // use the same 'list' action but request debug output from server
                const debugUrl = `${this.base}/api/directory?action=list&path=${encodeURIComponent(path)}&debug=true`;
                console.debug('Attempting debug fetch on exception (list+debug):', debugUrl);
                const debugResp = await fetch(debugUrl);
                // parse as text first so we can log if non-json; parseJson will throw if not JSON
                const debugText = await debugResp.text();
                // debug panel removed; log preview to console for developer
                console.debug('debug fetch text preview:', debugText.substring(0,1000));
                try {
                    const debugData = JSON.parse(debugText);
                    if (debugData && debugData.stack) {
                        await this.alertModal('服务器列目录异常详情:\n' + debugData.stack, '调试信息');
                    } else {
                        console.debug('Debug fetch returned JSON without stack:', debugData);
                        await this.alertModal('服务器返回调试信息（无 stack）:\n' + JSON.stringify(debugData, null, 2), '调试信息');
                    }
                } catch (e) {
                    // debug response was not JSON (likely an HTML error page) — show a short preview
                    const preview = debugText.length > 1000 ? debugText.substring(0, 1000) + '...' : debugText;
                    console.debug('Debug fetch returned non-JSON response preview:', preview);
                    await this.alertModal('调试请求没有返回 JSON，返回内容预览:\n' + preview, '调试信息');
                }
            } catch (dbgErr) {
                console.debug('Debug fetch after exception failed:', dbgErr.message);
            }
         } finally {
             this.hideLoading();
         }
     }

    // Open preview in a new window for images/videos/documents
    openPreview(item) {
        // build preview URL to preview.html under same context
        const ctx = window.location.pathname.replace(/\/[^/]*$/, '') || '';
        const base = window.location.origin + ctx;
        const params = new URLSearchParams({ path: item.path || '', name: item.name || '', type: item.isDirectory ? 'directory' : (item.type || 'file') });
        const url = base + '/preview.html?' + params.toString();
        window.open(url, '_blank');
    }

    // Upload files to currentPath
    async handleFileUpload(fileList) {
        if (!fileList || fileList.length === 0) return;
        this.showLoading();
        try {
            for (let i = 0; i < fileList.length; i++) {
                const file = fileList[i];
                const form = new FormData();
                form.append('file', file, file.name);
                // put path into form body (some servlet containers need multipart form field)
                form.append('path', this.currentPath);
                const url = `${this.base}/api/file?action=upload`;
                const resp = await fetch(url, { method: 'POST', body: form });
                const data = await this.parseJson(resp);
                if (!data.success) {
                    // show error notify
                    try { window.notify && window.notify.error('上传文件失败: ' + (data.message || '未知错误')); } catch (e) {}
                }
            }
            // clear input
            const fileInput = document.getElementById('fileInput');
            if (fileInput) fileInput.value = '';
            await this.loadDirectory(this.currentPath);
        } catch (err) {
            try { window.notify && window.notify.error('上传失败: ' + err.message); } catch (e) { this.showError('上传失败: ' + err.message); }
        } finally {
            this.hideLoading();
        }
    }

    // Create new folder under current path
    async createNewFolder() {
        const name = await this.promptModal('输入新建文件夹名称:');
        if (!name) return;
        const parent = this.currentPath === '/' ? '/' : this.currentPath;
        const target = parent === '/' ? '/' + name : parent + '/' + name;
        this.showLoading();
        try {
            // DirectoryServlet expects action=create (POST) with parameter path. Send as form body for compatibility.
            const url = `${this.base}/api/directory?action=create`;
            const body = new URLSearchParams();
            body.append('path', target);
            const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
            const data = await this.parseJson(resp);
            if (data.success) {
                try { window.notify && window.notify.success('新建文件夹成功'); } catch (e) {}
                await this.loadDirectory(this.currentPath);
            } else {
                try { window.notify && window.notify.error('新建文件夹失败: ' + (data.message || '未知错误')); } catch (e) { this.showError('新建文件夹失败: ' + (data.message || '未知错误')); }
            }
        } catch (err) {
            try { window.notify && window.notify.error('新建文件夹失败: ' + err.message); } catch (e) { this.showError('新建文件夹失败: ' + err.message); }
        } finally {
            this.hideLoading();
        }
    }

    // Trigger browser download by opening file download URL
    downloadFile(path) {
        if (!path) return;
        const url = `${this.base}/api/file?action=download&path=${encodeURIComponent(path)}`;
        // create temporary anchor and trigger click to reduce popup blocking
        try {
            const a = document.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.download = path.substring(path.lastIndexOf('/') + 1);
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => a.remove(), 1000);
        } catch (e) {
            // fallback
            window.open(url, '_blank');
        }
    }

    // Delete single item (UI trash or permanent if in trash view)
    async deleteItem(path, isDirectory) {
        const inTrash = this.currentPath && this.currentPath.startsWith('/.trash');
        if (inTrash) {
            const ok = await this.confirmModal('确定要永久删除此项吗？该操作不可恢复。');
            if (!ok) return;
        } else {
            // ask retention days
            const days = await this.showRetentionModal('7');
            if (days === null) return; // cancelled
            if (days === '0') {
                // immediate permanent delete
                const ok = await this.confirmModal('确定要立即永久删除此项吗？该操作不可恢复。');
                if (!ok) return;
                this._pendingDeletePermanent = true;
            } else {
                // confirm moving to trash with retention
                const ok = await this.confirmModal(`将移入垃圾箱，保留 ${days + ' 天'}，确定？`);
                if (!ok) return;
                // attach days param below
                this._pendingDeleteDays = days;
                this._pendingDeletePermanent = false;
            }
        }
        this.showLoading();
        try {
            // FileServlet expects DELETE with query params 'path', 'permanent' and 'recursive'
            let permanent = inTrash ? 'true' : 'false';
            if (!inTrash && this._pendingDeletePermanent) permanent = 'true';
            const recursive = isDirectory ? 'true' : 'false';
            let url = `${this.base}/api/file?action=delete&path=${encodeURIComponent(path)}&permanent=${permanent}&recursive=${recursive}`;
            if (!inTrash && !this._pendingDeletePermanent && this._pendingDeleteDays != null) {
                url += `&days=${encodeURIComponent(this._pendingDeleteDays)}`;
                this._pendingDeleteDays = null;
            }
            // clear transient flag
            this._pendingDeletePermanent = false;
            const resp = await fetch(url, { method: 'DELETE' });
            const data = await this.parseJson(resp);
            if (data.success) {
                try { window.notify && window.notify.success('删除成功'); } catch (e) {}
                await this.loadDirectory(this.currentPath);
            } else {
                try { window.notify && window.notify.error('删除失败: ' + (data.message || '未知错误')); } catch (e) { this.showError('删除失败: ' + (data.message || '未知错误')); }
            }
        } catch (err) {
            this.showError('删除失败: ' + err.message);
        } finally {
            this.hideLoading();
        }
    }

    // Batch delete selected items (move to trash or permanent)
    async deleteSelected() {
        const sel = Array.from(document.querySelectorAll('.item-checkbox:checked')).map(cb => cb.getAttribute('data-path'));
        if (sel.length === 0) return;
        const inTrash = this.currentPath && this.currentPath.startsWith('/.trash');
        let days = null;
        if (!inTrash) {
            // ask retention days for batch
            days = await this.showRetentionModal('7');
            if (days === null) return; // cancelled
        }
        // if user selected immediate delete for batch (days==='0'), confirm immediate permanent delete
        if (!inTrash && days === '0') {
            const ok = await this.confirmModal(`确定要立即永久删除选中的 ${sel.length} 项吗？该操作不可恢复。`);
            if (!ok) return;
        } else {
            const ok = await this.confirmModal(inTrash ? `确定要永久删除选中的 ${sel.length} 项吗？` : `确定要将选中的 ${sel.length} 项移入垃圾箱吗？`);
            if (!ok) return;
        }
        this.showLoading();
        try {
            // perform sequential deletes to get nicer error messages
            for (let p of sel) {
                let permanent = inTrash ? 'true' : 'false';
                if (!inTrash && days === '0') permanent = 'true';
                let url = `${this.base}/api/file?action=delete&path=${encodeURIComponent(p)}&permanent=${permanent}`;
                if (!inTrash && days != null && days !== '0') url += `&days=${encodeURIComponent(days)}`;
                const resp = await fetch(url, { method: 'DELETE' });
                const data = await this.parseJson(resp);
                if (!data.success) {
                    await this.alertModal('部分删除失败: ' + (data.message || p));
                }
            }
            await this.loadDirectory(this.currentPath);
        } catch (err) {
            try { window.notify && window.notify.error('批量删除失败: ' + err.message); } catch (e) { this.showError('批量删除失败: ' + err.message); }
        } finally {
            this.hideLoading();
        }
    }

    // Simple search: try directory search endpoint then fallback to client-side (not implemented)
    async performSearch() {
        const qEl = document.getElementById('searchInput');
        if (!qEl) return;
        const q = qEl.value && qEl.value.trim();
        if (!q) {
            return this.loadDirectory(this.currentPath);
        }
        this.showLoading();
        try {
            // DirectoryServlet.handleSearch expects startDir and name parameters
            const url = `${this.base}/api/directory?action=search&startDir=${encodeURIComponent(this.currentPath)}&name=${encodeURIComponent(q)}`;
            const resp = await fetch(url);
            const data = await this.parseJson(resp);
            if (data.success) {
                const items = data.items || data.results || [];
                // normalize like loadDirectory
                const normalized = (items || []).map(it => {
                    if (typeof it === 'string') return { path: it, name: it.substring(it.lastIndexOf('/')+1), isDirectory: false, type: 'file' };
                    const path = it.path || it.fullPath || it.name || '';
                    const name = it.name || (path ? path.substring(path.lastIndexOf('/')+1) : it.label || '');
                    const isDirectory = !!it.isDirectory || it.type === 'directory' || (it.type === 'dir');
                    const size = it.size || it.length || 0;
                    const modificationTime = it.modificationTime || it.mtime || it.lastModified || 0;
                    return { path, name, isDirectory, type: isDirectory ? 'directory' : (it.type||'file'), size, modificationTime };
                });
                this.renderFileList(normalized);
            } else {
                this.showError('搜索失败: ' + (data.message || '无结果'));
            }
        } catch (err) {
            this.showError('搜索失败: ' + err.message);
        } finally {
            this.hideLoading();
        }
    }

    // Generic error display using modal
    showError(message) {
        // try to use UI modal; fallback to alert
        try { this.alertModal(message, '错误'); } catch (e) { alert(message); }
    }

    // Human-readable bytes
    formatBytes(bytes) {
        if (bytes == null) return '';
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B','KB','MB','GB','TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Format epoch millis to local string
    formatTime(millis) {
        if (!millis) return '';
        const d = new Date(millis);
        return d.toLocaleString();
    }

    // Show a modal to let the user pick retention days before moving to trash.
    // Returns number of days (as a string) or null if cancelled. '0' indicates 永久 (no expiry).
    async showRetentionModal(defaultDays = '7') {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.gap = '8px';
        const label = document.createElement('div');
        label.textContent = '选择保留天数（到期后将自动永久删除；或选择“立即永久删除”）：';
        wrapper.appendChild(label);
        const opts = ['3','7','30','0'];
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.gap = '12px';
        opts.forEach(v => {
            const lbl = document.createElement('label');
            lbl.style.display = 'flex';
            lbl.style.alignItems = 'center';
            const r = document.createElement('input');
            r.type = 'radio';
            r.name = 'trashDays';
            r.value = v;
            if (v === defaultDays) r.checked = true;
            lbl.appendChild(r);
            const txt = document.createElement('span');
            txt.style.marginLeft = '6px';
            txt.textContent = v === '0' ? '立即永久删除' : (v + ' 天');
            lbl.appendChild(txt);
            container.appendChild(lbl);
        });
        wrapper.appendChild(container);

        const res = await this.openModal('移入垃圾箱 - 选择保留天数', wrapper, [ { id: 'cancel', label: '取消', value: null }, { id: 'ok', label: '确定', value: 'ok', className: 'btn-primary' } ]);
        if (res !== 'ok') return null;
        const chosen = Array.from(document.querySelectorAll('input[name="trashDays"]')).find(x => x.checked);
        return chosen ? chosen.value : null;
    }

    // Return an icon (emoji) based on file extension
    getIconForFile(name) {
        if (!name) return '📄';
        const ext = (name.split('.').length > 1) ? name.split('.').pop().toLowerCase() : '';
        const imgExt = ['png','jpg','jpeg','gif','bmp','webp','svg','ico'];
        const videoExt = ['mp4','mkv','avi','mov','wmv','flv','webm'];
        const docExt = ['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','md','csv'];
        const archiveExt = ['zip','rar','7z','tar','gz','bz2'];
        if (imgExt.includes(ext)) return '🖼️';
        if (videoExt.includes(ext)) return '🎬';
        if (docExt.includes(ext)) return '📄';
        if (archiveExt.includes(ext)) return '🗜️';
        if (ext === 'js' || ext === 'json') return '📜';
        if (ext === 'html' || ext === 'htm') return '🌐';
        if (ext === 'mp3' || ext === 'wav' || ext === 'flac') return '🎵';
        return '📄';
    }

    // 返回基于文件名扩展名的人类可读类型标签
    getTypeLabel(name, isDirectory, type) {
        if (isDirectory) return '文件夹';
        const ext = (name && name.indexOf('.') !== -1) ? name.split('.').pop().toLowerCase() : '';
        const imgExt = ['png','jpg','jpeg','gif','bmp','webp','svg','ico'];
        const videoExt = ['mp4','mkv','avi','mov','wmv','flv','webm'];
        const docExt = ['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','md','csv'];
        const archiveExt = ['zip','rar','7z','tar','gz','bz2'];
        const audioExt = ['mp3','wav','flac','aac','ogg'];
        const codeExt = ['js','json','java','py','c','cpp','html','css','sh','bat'];
        if (imgExt.includes(ext)) return '图片';
        if (videoExt.includes(ext)) return '视频';
        if (audioExt.includes(ext)) return '音频';
        if (docExt.includes(ext)) return '文档';
        if (archiveExt.includes(ext)) return '压缩包';
        if (ext === 'html' || ext === 'htm') return '网页';
        if (['js','json'].includes(ext)) return '脚本/数据';
        if (codeExt.includes(ext)) return '源码';
        // fallback: if server supplied a type like 'directory' or 'file' we can show '文件'
        return (type && type !== 'file') ? type : '文件';
    }

    // Setup clickable headers and inject sort indicator UI
    setupSortableHeaders() {
        try {
            const headerMap = {
                name: { selector: 'th:nth-child(2)', key: 'name' },
                type: { selector: 'th:nth-child(3)', key: 'type' },
                size: { selector: 'th:nth-child(4)', key: 'size' },
                time: { selector: 'th:nth-child(5)', key: 'time' }
            };
            Object.keys(headerMap).forEach(k => {
                const info = headerMap[k];
                const th = document.querySelector(`#fileTable thead ${info.selector}`);
                if (!th) return;
                th.style.cursor = 'pointer';
                // ensure we only attach once
                if (th.getAttribute('data-sortable') === 'true') return;
                th.setAttribute('data-sortable', 'true');
                // append sort icon container
                const icon = document.createElement('span');
                icon.className = 'sort-icon';
                icon.style.marginLeft = '8px';
                icon.setAttribute('data-key', info.key);
                icon.innerHTML = '▿'; // neutral glyph
                th.appendChild(icon);
                th.addEventListener('click', () => {
                     // toggle sort state
                     const key = info.key;
                     if (this.sortKey === key) {
                         // cycle: asc -> desc -> none
                         if (this.sortOrder === 'asc') this.sortOrder = 'desc';
                         else if (this.sortOrder === 'desc') { this.sortKey = null; this.sortOrder = null; }
                         else this.sortOrder = 'asc';
                     } else {
                         this.sortKey = key;
                         this.sortOrder = 'asc';
                     }
                     // update UI icons
                     this.updateHeaderSortUI();
                     // Re-render using cached items if present to avoid extra fetch
                     if (this.lastItems) {
                         const sortedItems = this.applySortToItems(this.lastItems);
                         this.renderFileList(sortedItems);
                     } else {
                         this.loadDirectory(this.currentPath);
                     }
                 });
            });
        } catch (e) {
            console.debug('setupSortableHeaders failed:', e.message);
        }
    }

    // Setup view mode toggle menu and wire interactions
    setupViewToggle() {
        const toggle = document.getElementById('viewToggle');
        const menu = document.getElementById('viewMenu');
        const container = document.querySelector('.file-list');
        const thumbContainer = document.getElementById('thumbContainer');
        if (!toggle || !menu || !container) return;
        // apply initial classes
        container.classList.toggle('list-mode', this.viewMode === 'list');
        container.classList.toggle('grid-mode', this.viewMode !== 'list');
        if (thumbContainer) {
            thumbContainer.classList.remove('grid-compact','grid-large');
            if (this.viewMode === 'grid-compact') thumbContainer.classList.add('grid-compact');
            if (this.viewMode === 'grid-large') thumbContainer.classList.add('grid-large');
        }

        toggle.addEventListener('click', (e) => { e.stopPropagation(); const visible = menu.style.display === 'block'; menu.style.display = visible ? 'none' : 'block'; toggle.setAttribute('aria-expanded', (!visible).toString()); });
        menu.querySelectorAll('.view-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const mode = opt.getAttribute('data-mode');
                if (!mode) return;
                this.viewMode = mode;
                localStorage.setItem('viewMode', mode);
                container.classList.toggle('list-mode', mode === 'list');
                container.classList.toggle('grid-mode', mode !== 'list');
                if (thumbContainer) {
                    thumbContainer.classList.remove('grid-compact','grid-large');
                    if (mode === 'grid-compact') thumbContainer.classList.add('grid-compact');
                    if (mode === 'grid-large') thumbContainer.classList.add('grid-large');
                }
                menu.style.display = 'none';
                toggle.setAttribute('aria-expanded', 'false');
                // re-render using cached data when possible to avoid network roundtrip
                if (this.lastItems) {
                    const sorted = this.applySortToItems(this.lastItems);
                    this.renderFileList(sorted);
                } else {
                    this.loadDirectory(this.currentPath);
                }
             });
         });
        // close on outside click
        document.addEventListener('click', () => { menu.style.display = 'none'; toggle.setAttribute('aria-expanded', 'false'); });
    }

    // Update header icon visuals based on current sortKey/sortOrder
    updateHeaderSortUI() {
        const ths = document.querySelectorAll('#fileTable thead th');
        ths.forEach(th => {
            const icon = th.querySelector('.sort-icon');
            if (!icon) return;
            const key = icon.getAttribute('data-key');
            if (!key) { icon.style.visibility = 'hidden'; return; }
            icon.style.visibility = 'visible';
            if (this.sortKey !== key) {
                icon.textContent = '▿'; // neutral
                icon.style.opacity = '0.4';
            } else {
                icon.style.opacity = '1';
                icon.textContent = this.sortOrder === 'asc' ? '▴' : (this.sortOrder === 'desc' ? '▾' : '▿');
            }
        });
    }

    // Apply current sortKey/sortOrder to items array (non-mutating)
    applySortToItems(items) {
        if (!this.sortKey || !this.sortOrder) return items;
        const key = this.sortKey;
        const order = this.sortOrder === 'asc' ? 1 : -1;
        // create shallow copy
        const arr = items.slice();
        arr.sort((a, b) => {
            try {
                if (key === 'name') {
                    const na = (a.name || '').toLowerCase();
                    const nb = (b.name || '').toLowerCase();
                    return na < nb ? -1 * order : (na > nb ? 1 * order : 0);
                } else if (key === 'type') {
                    const ta = a.isDirectory ? '0' : (a.type || 'file');
                    const tb = b.isDirectory ? '0' : (b.type || 'file');
                    return ta < tb ? -1 * order : (ta > tb ? 1 * order : 0);
                } else if (key === 'size') {
                    const sa = typeof a.size === 'number' ? a.size : 0;
                    const sb = typeof b.size === 'number' ? b.size : 0;
                    return (sa - sb) * order;
                } else if (key === 'time') {
                    const ta = a.modificationTime || 0;
                    const tb = b.modificationTime || 0;
                    return (ta - tb) * order;
                }
            } catch (e) { return 0; }
            return 0;
        });
        return arr;
    }

    renderFileList(items) {
        console.debug('renderFileList called, items:', items);
        const statusEl = document.getElementById('listStatus');
        const tbody = document.getElementById('fileListBody');
        const thumbContainer = document.getElementById('thumbContainer');
        if (!tbody) {
            console.error('fileListBody element not found');
            this.alertModal('页面错误: 找不到 fileListBody 元素，渲染失败', '渲染错误');
            return;
        }
        tbody.innerHTML = '';
        if (thumbContainer) thumbContainer.innerHTML = '';

        if (!items || items.length === 0) {
            // show empty state for either view
            if (this.viewMode === 'list') {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6">
                            <div class="empty-state">
                                <div class="icon">📂</div>
                                <p>此文件夹为空</p>
                            </div>
                        </td>
                    </tr>
                `;
            } else if (thumbContainer) {
                thumbContainer.innerHTML = `<div class="empty-state"><div class="icon">📂</div><p>此文件夹为空</p></div>`;
            }
            // 不再显示项数
            if (statusEl) statusEl.textContent = '';
            return;
        }

        if (this.viewMode === 'list') {
            // render the traditional table rows
            items.forEach(item => {
                const row = document.createElement('tr');
                const icon = item.isDirectory ? '📁' : this.getIconForFile(item.name);
                let displayOriginal = '';
                if (item.originalPath) displayOriginal = item.originalPath;
                else if (this.currentPath && this.currentPath.startsWith('/.trash')) {
                    displayOriginal = item.path && item.path.startsWith('/.trash') ? item.path.substring('/.trash'.length) : item.path;
                    if (!displayOriginal) displayOriginal = '/';
                }
                const sizeText = item.size != null ? this.formatBytes(item.size) : '';
                const timeText = item.modificationTime ? this.formatTime(item.modificationTime) : '';
                // show expireAt for trash entries
                let expireHtml = '';
                if (this.currentPath && this.currentPath.startsWith('/.trash')) {
                    const exp = (typeof item.expireAt !== 'undefined' && item.expireAt != null) ? Number(item.expireAt) : 0;
                    if (!exp || exp === 0) {
                        expireHtml = `<div class="expire-info">永久</div>`;
                    } else {
                        const now = Date.now();
                        if (exp <= now) {
                            // if somehow an expired item appeared, request an immediate purge and do not render expired marker
                            expireHtml = `<div class="expire-info expired">已到期</div>`;
                        } else {
                            const diff = exp - now;
                            const days = Math.floor(diff / (24*3600*1000));
                            const hours = Math.floor((diff % (24*3600*1000)) / (3600*1000));
                            const mins = Math.floor((diff % (3600*1000)) / (60*1000));
                            expireHtml = `<div class="expire-info">剩余 ${days} 天 ${hours} 小时 ${mins} 分</div>`;
                        }
                    }
                }

                row.innerHTML = `
                    <td><input type="checkbox" class="item-checkbox" data-path="${item.path}"></td>
                    <td>
                        <div class="file-name" data-path="${item.path}" data-isdir="${item.isDirectory}">
                            <span class="file-icon">${icon}</span>
                            <div class="file-main">
                                <span>${item.name}</span>
                                ${displayOriginal ? `<div class="original-path">原始位置: ${displayOriginal}</div>` : ''}
                                ${expireHtml}
                            </div>
                        </div>
                    </td>
                    <td>${this.getTypeLabel(item.name, item.isDirectory, item.type)}</td>
                    <td class="size-cell">${sizeText}</td>
                    <td class="time-cell">${timeText}</td>
                    <td>
                        <div class="file-actions">
                            ${!item.isDirectory ? `<button class="icon-btn download-btn" title="下载">⬇</button>` : ''}
                            <button class="icon-btn delete-btn" title="删除">🗑</button>
                            ${this.currentPath.startsWith('/.trash') ? `<button class="icon-btn" style="background:#4caf50;color:white" data-action="restore" title="恢复">↩</button>` : ''}
                            ${!item.isDirectory ? `<button class="icon-btn copy-btn" title="复制">⎘</button>` : ''}
                            ${!item.isDirectory ? `<button class="icon-btn share-btn" title="分享">🔗</button>` : ''}
                            <button class="icon-btn rename-btn" title="重命名">✎</button>
                        </div>
                    </td>
                `;

                // click name
                const fileName = row.querySelector('.file-name');
                if (fileName) fileName.addEventListener('click', () => {
                    if (item.isDirectory) {
                        if (!this.currentPath.startsWith('/.trash')) this.loadDirectory(item.path);
                    } else {
                        this.openPreview(item);
                    }
                });

                // checkbox
                const checkbox = row.querySelector('.item-checkbox');
                if (checkbox) checkbox.addEventListener('change', () => { this.handleCheckboxChange(); });

                // actions
                const downloadBtn = row.querySelector('.download-btn'); if (downloadBtn) downloadBtn.addEventListener('click', (ev) => { ev.stopPropagation(); this.downloadFile(item.path); });
                const deleteBtn = row.querySelector('.delete-btn'); if (deleteBtn) deleteBtn.addEventListener('click', (ev) => { ev.stopPropagation(); this.deleteItem(item.path, item.isDirectory); });
                const restoreBtn = row.querySelector('button[data-action="restore"]'); if (restoreBtn) restoreBtn.addEventListener('click', (ev) => { ev.stopPropagation(); this.restoreItem(item.path); });
                const copyBtn = row.querySelector('.copy-btn'); if (copyBtn) copyBtn.addEventListener('click', (ev) => { ev.stopPropagation(); this.copyItem(item); });
                const renameBtn = row.querySelector('.rename-btn'); if (renameBtn) renameBtn.addEventListener('click', (ev) => { ev.stopPropagation(); this.renameItem(item); });
                const shareBtn = row.querySelector('.share-btn'); if (shareBtn) shareBtn.addEventListener('click', (ev) => { ev.stopPropagation(); this.openShareModal(item.path); });

                tbody.appendChild(row);
            });
            // 不显示项数
            if (statusEl) statusEl.textContent = '';
         } else if (thumbContainer) {
            // grid rendering
            thumbContainer.innerHTML = '';
            items.forEach(item => {
                const card = document.createElement('div');
                card.className = 'thumb-item';
                const icon = item.isDirectory ? '📁' : this.getIconForFile(item.name);
                const sizeText = item.size != null ? this.formatBytes(item.size) : '';
                const timeText = item.modificationTime ? this.formatTime(item.modificationTime) : '';
                // include a checkbox in the thumbnail card for selection and relative expire text
                let expireShort = '';
                if (this.currentPath && this.currentPath.startsWith('/.trash')) {
                    const exp = (typeof item.expireAt !== 'undefined' && item.expireAt != null) ? Number(item.expireAt) : 0;
                    if (!exp || exp === 0) expireShort = '永久';
                    else {
                        const now = Date.now();
                        if (exp <= now) expireShort = '已到期';
                        else {
                            const diff = exp - now;
                            const days = Math.floor(diff / (24*3600*1000));
                            const hours = Math.floor((diff % (24*3600*1000)) / (3600*1000));
                            expireShort = `剩余 ${days} 天 ${hours} 小时`;
                        }
                    }
                }
                card.innerHTML = `
                    <div class="thumb-checkbox"><input type="checkbox" class="item-checkbox" data-path="${item.path}"></div>
                    <div class="thumb-icon">${icon}</div>
                    <div class="thumb-name" title="${item.name}">${item.name}</div>
                    <div class="thumb-meta">${timeText}${sizeText ? ' · ' + sizeText : ''}${expireShort ? ' · ' + expireShort : ''}</div>
                `;
                // click card
                card.addEventListener('click', () => {
                    if (item.isDirectory) {
                        if (!this.currentPath.startsWith('/.trash')) this.loadDirectory(item.path);
                    } else {
                        this.openPreview(item);
                    }
                });
                // wire checkbox in thumbnail (prevent card click)
                const thumbCb = card.querySelector('.item-checkbox');
                if (thumbCb) {
                    thumbCb.addEventListener('click', (ev) => { ev.stopPropagation(); this.handleCheckboxChange(); });
                }
                // actions bar
                const actions = document.createElement('div'); actions.className = 'file-actions'; actions.style.marginTop = '8px';
                if (!item.isDirectory) { const dl = document.createElement('button'); dl.className = 'icon-btn download-btn'; dl.title='下载'; dl.textContent='⬇'; dl.addEventListener('click', (ev) => { ev.stopPropagation(); this.downloadFile(item.path); }); actions.appendChild(dl); }
                const delBtn = document.createElement('button'); delBtn.className='icon-btn delete-btn'; delBtn.title='删除'; delBtn.textContent='🗑'; delBtn.addEventListener('click', (ev) => { ev.stopPropagation(); this.deleteItem(item.path, item.isDirectory); }); actions.appendChild(delBtn);
                if (!item.isDirectory) { const sh = document.createElement('button'); sh.className='icon-btn share-btn'; sh.title='分享'; sh.textContent='🔗'; sh.addEventListener('click', (ev)=> { ev.stopPropagation(); this.openShareModal(item.path); }); actions.appendChild(sh); }
                card.appendChild(actions);
                thumbContainer.appendChild(card);
            });
            // 不显示项数
            if (statusEl) statusEl.textContent = '';
         }
         // ensure header UI reflects current sort
         this.updateHeaderSortUI();
    }

    // List shares from backend and render
    async loadShares() {
        this.showLoading();
        try {
            const url = `${this.base}/api/share?action=list`;
            const resp = await fetch(url);
            const data = await this.parseJson(resp);
            if (data.success) {
                const items = (data.items || []).map(it => ({ id: it.id, path: it.path, name: it.name, createdAt: it.createdAt, expireAt: it.expireAt }));
                this.renderShareList(items);
            } else {
                this.showError('获取分享列表失败: ' + (data.message || '未知错误'));
            }
        } catch (err) {
            this.showError('获取分享列表失败: ' + err.message);
        } finally { this.hideLoading(); }
    }

    renderShareList(items) {
        const tbody = document.getElementById('fileListBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!items || items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">暂无分享内容</td></tr>';
            return;
        }
        items.forEach(it => {
            const row = document.createElement('tr');
            // expireAt is available but will be shown in share view details; not required in this row
             // try to fetch parent dir metadata to show size/mtime
             let sizeText = '';
             let timeText = '';
            (async () => {
                try {
                    const parent = it.path.substring(0, it.path.lastIndexOf('/')) || '/';
                    const listResp = await fetch(`${this.base}/api/directory?action=list&path=${encodeURIComponent(parent)}`);
                    const listData = await this.parseJson(listResp);
                    if (listData && listData.items) {
                        var found = (listData.items || []).find(x => x.path === it.path || x.name === (it.path.substring(it.path.lastIndexOf('/')+1)));
                        if (found) {
                            sizeText = found.size ? this.formatBytes(found.size) : '';
                            timeText = found.modificationTime ? this.formatTime(found.modificationTime) : '';
                        }
                    }
                } catch (e) { /* ignore */ }
                // determine icon and type: prefer server-provided metadata (found), otherwise infer from name
                const displayName = it.name || it.path.substring(it.path.lastIndexOf('/')+1);
                const isDirFound = !!(typeof found !== 'undefined' && (found.isDirectory || found.type === 'directory'));
                const icon = isDirFound ? '📁' : this.getIconForFile(displayName);
                const typeLabel = isDirFound ? '目录' : '文件';

                // populate row HTML after possible metadata fetched
                row.innerHTML = `
                    <td><input type="checkbox" class="item-checkbox" data-path="${it.path}" data-id="${it.id}"></td>
                    <td>
                      <div class="file-name"><span class="file-icon">${icon}</span><div class="file-main"><span>${displayName}</span><div class="original-path">路径: ${it.path}</div></div></div>
                    </td>
                    <td>${typeLabel}</td>
                    <td class="size-cell">${sizeText}</td>
                    <td class="time-cell">${timeText}</td>
                    <td>
                      <div class="file-actions">
                        <button class="icon-btn open-share" data-id="${it.id}">打开</button>
                        <button class="icon-btn copy-share" data-id="${it.id}">复制链接</button>
                      </div>
                `;

                // wire checkbox handler: reuse existing handler to keep selectedItems logic consistent
                const cb = row.querySelector('.item-checkbox');
                if (cb) cb.addEventListener('change', () => {
                    this.handleCheckboxChange();
                });

                row.querySelector('.open-share').addEventListener('click', async () => {
                    const id = it.id;
                    // verify share exists before opening to avoid raw 404 in new window
                    try {
                        const check = await fetch(`${this.base}/api/share/public?id=${encodeURIComponent(id)}`);
                        if (!check.ok) {
                            if (check.status === 404) {
                                await this.alertModal('分享不存在或已过期（404）');
                                return;
                            }
                            await this.alertModal('检查分享链接时服务器返回状态: ' + check.status);
                            return;
                        }
                        // open the share view
                        const url = `${this.base}/share.html?id=${encodeURIComponent(it.id)}`;
                        window.open(url, '_blank');
                    } catch (err) {
                        this.showError('无法打开分享: ' + err.message);
                    }
                });

                row.querySelector('.copy-share').addEventListener('click', async () => {
                    const id = it.id;
                    const url = `${this.base}/share.html?id=${encodeURIComponent(id)}`;
                    try {
                        await navigator.clipboard.writeText(url);
                        try { window.notify && window.notify.success('分享链接已复制到剪贴板'); } catch (e) { await this.alertModal('分享链接已复制到剪贴板'); }
                    } catch (e) {
                        prompt('请复制链接', url);
                    }
                });
            })();
             tbody.appendChild(row);
         });
    }

    // Open share creation modal for a given path
    async openShareModal(selectedPath) {
        const tmpl = document.getElementById('shareModalTemplate');
        const content = tmpl.content.cloneNode(true);
        const wrapper = document.createElement('div');
        wrapper.appendChild(content);
        const res = await this.openModal('创建分享', wrapper, [ { id: 'cancel', label: '取消', value: null }, { id: 'ok', label: '生成链接', value: 'ok', className: 'btn-primary' } ]);
        if (res !== 'ok') return;
        // read radio value
        const radios = document.querySelectorAll('#shareDaysSelect input[name="shareDays"]');
        let days = '0';
        radios.forEach(r => { if (r.checked) days = r.value; });
        const nameEl = document.getElementById('shareNameInput');
        const name = nameEl ? nameEl.value : '';
         this.showLoading();
         try {
             const params = new URLSearchParams();
             params.append('action', 'create');
             params.append('path', selectedPath);
             params.append('days', days);
             params.append('name', name);
             const resp = await fetch(`${this.base}/api/share`, { method: 'POST', body: params });
             const data = await this.parseJson(resp);
             if (data.success) {
                 const link = data.link || (`${this.base}/api/share/public?id=${encodeURIComponent(data.item.id)}`);
                 try { window.notify && window.notify.success('分享已创建'); } catch (e) {}
                 await this.alertModal('分享已创建，链接如下:\n' + link, '分享成功');
                 if (this.currentView === 'share') await this.loadShares();
             } else {
                 try { window.notify && window.notify.error('创建分享失败: ' + (data.message || '未知错误')); } catch (e) { this.showError('创建分享失败: ' + (data.message || '未知错误')); }
             }
         } catch (e) { this.showError('创建分享失败: ' + e.message); }
         finally { this.hideLoading(); }
    }

    async restoreItem(path) {
        const ok = await this.confirmModal('确定要恢复此项吗?');
        if (!ok) return;
        this.showLoading();
        try {
            const response = await fetch(`${this.base}/api/file?action=restore&path=${encodeURIComponent(path)}`, {
                method: 'POST'
            });
            const data = await this.parseJson(response);
            if (data.success) {
                try { window.notify && window.notify.success('恢复成功'); } catch (e) {}
                // reload trash view
                await this.loadDirectory(this.currentPath);
            } else {
                try { window.notify && window.notify.error(data.message || '恢复失败'); } catch (e) { this.showError(data.message); }
            }
        } catch (error) {
            try { window.notify && window.notify.error('恢复失败: ' + error.message); } catch (e) { this.showError('恢复失败: ' + error.message); }
        } finally {
            this.hideLoading();
        }
    }

    // Batch restore selected items from UI trash
    async restoreSelected() {
        const checkboxes = document.querySelectorAll('.item-checkbox:checked');
        if (checkboxes.length === 0) return;
        const ok = await this.confirmModal(`确定要恢复选中的 ${checkboxes.length} 项吗?`);
        if (!ok) return;

        const paths = Array.from(checkboxes).map(cb => cb.getAttribute('data-path'));

        this.showLoading();
        try {
            const response = await fetch(`${this.base}/api/directory?action=restoreBatch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paths: paths })
            });

            const data = await this.parseJson(response);
            if (data.success) {
                // optionally show summary of results
                const results = data.results || {};
                const failed = Object.keys(results).filter(p => !results[p]);
                if (failed.length > 0) {
                    await this.alertModal('以下项恢复失败:\n' + failed.join('\n'));
                }
                await this.loadDirectory(this.currentPath);
            } else {
                try { window.notify && window.notify.error(data.message || '批量恢复失败'); } catch (e) { this.showError(data.message || '批量恢复失败'); }
            }
        } catch (err) {
            this.showError('批量恢复失败: ' + err.message);
        } finally {
            this.hideLoading();
        }
    }

    // Rename (move) an item within the same directory or to another path
    async renameItem(item) {
        const src = item.path;
        const oldName = item.name;
        const newName = await this.promptModal('输入新名称:', oldName);
        if (!newName || newName === oldName) return;

        const parent = src.substring(0, src.lastIndexOf('/')) || '/';
        const dst = parent === '/' ? '/' + newName : parent + '/' + newName;

        this.showLoading();
        try {
            const body = new URLSearchParams();
            body.append('action', 'move');
            body.append('src', src);
            body.append('dst', dst);
            const response = await fetch(`${this.base}/api/file`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString()
            });
             const data = await this.parseJson(response);
             if (data.success) {
                 try { window.notify && window.notify.success('重命名成功'); } catch (e) {}
                 await this.loadDirectory(this.currentPath);
             } else {
                 this.showError(data.message);
             }
         } catch (error) {
             this.showError('重命名失败: ' + error.message);
         } finally {
             this.hideLoading();
         }
     }

    // Copy a file within the same directory, naming the copy as "原名 副本.ext"
    async copyItem(item) {
        if (!item || !item.path) return;
        const src = item.path;
        const name = item.name || src.substring(src.lastIndexOf('/') + 1);
        const parent = src.substring(0, src.lastIndexOf('/')) || '/';
        // split name and ext
        const dot = name.lastIndexOf('.');
        const baseName = dot > 0 ? name.substring(0, dot) : name;
        const ext = dot > 0 ? name.substring(dot) : '';
        const newName = baseName + ' 副本' + ext;
        const dst = (parent === '/' ? '/' + newName : parent + '/' + newName);

        const ok = await this.confirmModal(`确定要在当前目录创建文件副本: ${newName} ?`);
        if (!ok) return;
        this.showLoading();
        try {
            const body = new URLSearchParams();
            body.append('action', 'copy');
            body.append('src', src);
            body.append('dst', dst);
            const resp = await fetch(`${this.base}/api/file`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
            const data = await this.parseJson(resp);
            if (data.success) {
                try { window.notify && window.notify.success('复制成功'); } catch (e) {}
                await this.loadDirectory(this.currentPath);
            } else {
                try { window.notify && window.notify.error('复制失败: ' + (data.message || '未知错误')); } catch (e) { this.showError('复制失败: ' + (data.message || '未知错误')); }
            }
        } catch (err) {
            this.showError('复制失败: ' + err.message);
        } finally {
            this.hideLoading();
        }
    }

    // Select or deselect all visible items
    selectAll(checked) {
        this.selectedItems.clear();
        const items = Array.from(document.querySelectorAll('.item-checkbox'));
        items.forEach(cb => {
            cb.checked = !!checked;
            const p = cb.getAttribute('data-path') || cb.getAttribute('data-id');
            if (checked && p) this.selectedItems.add(p);
        });
        // update toolbar state
        const deleteBtn = document.getElementById('deleteBtn');
        if (deleteBtn) deleteBtn.disabled = (this.selectedItems.size === 0);
    }

    // Called when any single checkbox changes
    handleCheckboxChange() {
        this.selectedItems.clear();
        const checked = Array.from(document.querySelectorAll('.item-checkbox:checked'));
        checked.forEach(cb => {
            const p = cb.getAttribute('data-path') || cb.getAttribute('data-id');
            if (p) this.selectedItems.add(p);
        });
        const deleteBtn = document.getElementById('deleteBtn');
        if (deleteBtn) deleteBtn.disabled = (this.selectedItems.size === 0);
        const selectAllEl = document.getElementById('selectAll');
        const all = document.querySelectorAll('.item-checkbox');
        if (selectAllEl) selectAllEl.checked = (all.length > 0 && checked.length === all.length);
    }

    // Schedule a one-shot timer to call purge exactly when the next trash item expires
    scheduleNextPurge() {
        try {
            this.clearNextPurge();
            if (!this.lastItems || !Array.isArray(this.lastItems)) return;
            const now = Date.now();
            let minMs = Infinity;
            this.lastItems.forEach(it => {
                const exp = it.expireAt ? Number(it.expireAt) : 0;
                if (exp && exp > now) {
                    const diff = exp - now;
                    if (diff < minMs) minMs = diff;
                }
            });
            if (!isFinite(minMs)) return;
            // schedule a little after expiry to avoid race
            const delay = Math.max(0, minMs + 500);
            this._trashExactTimer = setTimeout(async () => {
                try {
                    await this.doPurge();
                } catch (e) { console.debug('exact purge failed', e); }
                // reload list to reflect changes
                if (this.currentPath && this.currentPath.startsWith('/.trash')) await this.loadDirectory(this.currentPath);
            }, delay);
        } catch (e) { console.debug('scheduleNextPurge error', e); }
    }

    clearNextPurge() {
        if (this._trashExactTimer) { clearTimeout(this._trashExactTimer); this._trashExactTimer = null; }
    }

    // Initialize AI assistant UI bindings
    initAI() {
        // track whether we've already shown the welcome message to avoid duplicates
        this._aiGreeted = this._aiGreeted || false;
        const navAi = document.getElementById('nav-ai');
        const aiPanel = document.getElementById('aiPanel');
        const aiSendBtn = document.getElementById('aiSendBtn');
        const aiInput = document.getElementById('aiInput');

        // render/hide helpers
        this.showAIPanel = () => {
            // hide file list and show AI panel
            document.querySelector('.file-list').style.display = 'none';
            // hide toolbar and breadcrumb
            const toolbar = document.querySelector('.toolbar'); if (toolbar) toolbar.style.display = 'none';
            const bc = document.querySelector('.breadcrumb'); if (bc) bc.style.display = 'none';
            if (aiPanel) aiPanel.style.display = 'block';
            // mark sidebar active
            document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
            if (navAi) navAi.classList.add('active');
            this.currentView = 'ai';
            this.updateToolbarForView();

            // 自动发送欢迎词（仅在第一次打开 AI 面板时发送）
            try {
                if (!this._aiGreeted) {
                    this._aiGreeted = true;
                    // 使用 renderAIMessage 渲染 welcome 文本（已在方法内做必要的转义）
                    this.renderAIMessage('ai', '您好，我是您的个人网盘助手，有什么可以帮助您的');
                }
            } catch (e) {
                console.debug('自动发送 AI 欢迎词失败', e);
            }
        };
        this.hideAIPanel = () => {
            document.querySelector('.file-list').style.display = '';
            // restore toolbar and breadcrumb
            const toolbar = document.querySelector('.toolbar'); if (toolbar) toolbar.style.display = '';
            const bc = document.querySelector('.breadcrumb'); if (bc) bc.style.display = '';
            if (aiPanel) aiPanel.style.display = 'none';
            if (navAi) navAi.classList.remove('active');
            this.currentView = 'files';
            this.updateToolbarForView();
            // restore sidebar files active
            const navFiles = document.getElementById('nav-files'); if (navFiles) navFiles.classList.add('active');
        };

        if (navAi) navAi.addEventListener('click', (ev) => {
            ev.preventDefault();
            // toggle
            if (aiPanel && aiPanel.style.display === 'block') this.hideAIPanel(); else this.showAIPanel();
        });

        if (aiSendBtn) aiSendBtn.addEventListener('click', () => { this.sendAIMessage(); });
        if (aiInput) aiInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { this.sendAIMessage(); } });
    }

    // Render a message in AI panel. kind = 'user' or 'ai'
    renderAIMessage(kind, htmlOrText) {
        const messages = document.getElementById('aiMessages');
        if (!messages) return;
        const row = document.createElement('div');
        row.className = 'ai-msg ' + kind;
        const avatar = document.createElement('div'); avatar.className = 'avatar';
        const img = document.createElement('img');
        img.alt = kind === 'user' ? '你' : 'AI';
        img.src = kind === 'user' ? 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="%231976D2"/><text x="12" y="16" font-size="11" fill="white" text-anchor="middle">U</text></svg>' : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="%232196F3"/><text x="12" y="16" font-size="11" fill="white" text-anchor="middle">AI</text></svg>';
        avatar.appendChild(img);
        const bubble = document.createElement('div'); bubble.className = 'bubble';
        bubble.innerHTML = htmlOrText;
        // structure: avatar + bubble, order controlled by CSS
        row.appendChild(avatar);
        row.appendChild(bubble);
        messages.appendChild(row);
        messages.scrollTop = messages.scrollHeight;
        return bubble;
    }

    // Send current aiInput value to backend and stream response
    async sendAIMessage() {
        const aiInput = document.getElementById('aiInput');
        if (!aiInput) return;
        const text = aiInput.value && aiInput.value.trim();
        if (!text) return;
        // render user message
        this.renderAIMessage('user', text.replace(/&/g,'&amp;').replace(/</g,'&lt;'));
        aiInput.value = '';

        // prepare payload
        const payload = {
            model: 'qwen-plus',
            messages: [ { role: 'system', content: '你是网盘的 AI 助手，回答简明并给出可执行的 HDFS 建议。' }, { role: 'user', content: text } ],
            stream: true,
            max_tokens: 1024
        };

        // placeholder bubble for AI response (append empty initially)
        const aiBubbleEl = this.renderAIMessage('ai', '');

        try {
            const resp = await fetch(this.base + '/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!resp.ok) {
                const t = await resp.text(); aiBubbleEl.innerHTML = '错误: ' + resp.status + '<br>' + t; return;
            }
            const reader = resp.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let done = false;
            while (!done) {
                const { value, done: rdone } = await reader.read();
                if (rdone) { done = true; break; }
                const chunk = decoder.decode(value, { stream: true });
                // append raw text (server already parsed SSE and returned clean content)
                aiBubbleEl.innerHTML += chunk.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>');
                aiBubbleEl.parentElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }
        } catch (e) {
            aiBubbleEl.innerHTML = '请求失败: ' + e.message;
        }
    }
}

// Instantiate application when DOM ready so it begins loading data
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.app = new CloudDrive();
        console.debug('CloudDrive initialized');
    } catch (e) {
        console.error('Failed to initialize CloudDrive:', e);
    }
});
