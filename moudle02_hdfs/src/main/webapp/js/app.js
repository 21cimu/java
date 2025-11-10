// Personal Cloud Drive Application
class CloudDrive {
    constructor() {
        this.currentPath = '/';
        this.selectedItems = new Set();
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadDirectory(this.currentPath);
    }

    setupEventListeners() {
        // Upload button
        document.getElementById('uploadBtn').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });

        document.getElementById('fileInput').addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files);
        });

        // New folder button
        document.getElementById('newFolderBtn').addEventListener('click', () => {
            this.createNewFolder();
        });

        // Delete button
        document.getElementById('deleteBtn').addEventListener('click', () => {
            this.deleteSelected();
        });

        // Refresh button
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadDirectory(this.currentPath);
        });

        // Search button
        document.getElementById('searchBtn').addEventListener('click', () => {
            this.performSearch();
        });

        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.performSearch();
            }
        });

        // Select all checkbox
        document.getElementById('selectAll').addEventListener('change', (e) => {
            this.selectAll(e.target.checked);
        });
    }

    showLoading() {
        document.getElementById('loadingOverlay').style.display = 'flex';
    }

    hideLoading() {
        document.getElementById('loadingOverlay').style.display = 'none';
    }

    async loadDirectory(path) {
        this.currentPath = path;
        this.showLoading();
        
        try {
            const response = await fetch(`/api/directory?action=list&path=${encodeURIComponent(path)}`);
            const data = await response.json();
            
            if (data.success) {
                this.renderFileList(data.items);
                this.updateBreadcrumb(path);
            } else {
                this.showError(data.message);
            }
        } catch (error) {
            this.showError('加载目录失败: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    renderFileList(items) {
        const tbody = document.getElementById('fileListBody');
        tbody.innerHTML = '';
        
        if (items.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4">
                        <div class="empty-state">
                            <div class="icon">📂</div>
                            <p>此文件夹为空</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        items.forEach(item => {
            const row = document.createElement('tr');
            const icon = item.isDirectory ? '📁' : '📄';
            
            row.innerHTML = `
                <td><input type="checkbox" class="item-checkbox" data-path="${item.path}"></td>
                <td>
                    <div class="file-name" data-path="${item.path}" data-isdir="${item.isDirectory}">
                        <span class="file-icon">${icon}</span>
                        <span>${item.name}</span>
                    </div>
                </td>
                <td>${item.type === 'directory' ? '文件夹' : '文件'}</td>
                <td>
                    <div class="file-actions">
                        ${!item.isDirectory ? `<button class="btn" onclick="cloudDrive.downloadFile('${item.path}')">下载</button>` : ''}
                        <button class="btn btn-danger" onclick="cloudDrive.deleteItem('${item.path}', ${item.isDirectory})">删除</button>
                    </div>
                </td>
            `;
            
            // Add click handler for file/folder name
            const fileName = row.querySelector('.file-name');
            fileName.addEventListener('click', () => {
                if (item.isDirectory) {
                    this.loadDirectory(item.path);
                }
            });

            // Add checkbox handler
            const checkbox = row.querySelector('.item-checkbox');
            checkbox.addEventListener('change', () => {
                this.handleCheckboxChange();
            });
            
            tbody.appendChild(row);
        });
    }

    updateBreadcrumb(path) {
        const breadcrumb = document.getElementById('breadcrumb');
        breadcrumb.innerHTML = '';
        
        const parts = path.split('/').filter(p => p);
        
        // Add root
        const rootItem = document.createElement('span');
        rootItem.className = 'breadcrumb-item';
        rootItem.setAttribute('data-path', '/');
        rootItem.innerHTML = '<span class="icon">🏠</span> 我的云盘';
        rootItem.addEventListener('click', () => this.loadDirectory('/'));
        breadcrumb.appendChild(rootItem);
        
        // Add path parts
        let currentPath = '';
        parts.forEach(part => {
            currentPath += '/' + part;
            const item = document.createElement('span');
            item.className = 'breadcrumb-item';
            item.setAttribute('data-path', currentPath);
            item.textContent = part;
            item.addEventListener('click', () => this.loadDirectory(currentPath));
            breadcrumb.appendChild(item);
        });
    }

    async handleFileUpload(files) {
        if (files.length === 0) return;
        
        this.showLoading();
        
        for (const file of files) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('path', this.currentPath);
            
            try {
                const response = await fetch('/api/file?action=upload', {
                    method: 'POST',
                    body: formData
                });
                
                const data = await response.json();
                
                if (!data.success) {
                    this.showError(`上传 ${file.name} 失败: ${data.message}`);
                }
            } catch (error) {
                this.showError(`上传 ${file.name} 失败: ${error.message}`);
            }
        }
        
        // Clear file input
        document.getElementById('fileInput').value = '';
        
        // Reload directory
        await this.loadDirectory(this.currentPath);
        this.hideLoading();
    }

    async createNewFolder() {
        const folderName = prompt('请输入文件夹名称:');
        if (!folderName) return;
        
        const newPath = this.currentPath.endsWith('/') 
            ? this.currentPath + folderName 
            : this.currentPath + '/' + folderName;
        
        this.showLoading();
        
        try {
            const response = await fetch(`/api/directory?action=create&path=${encodeURIComponent(newPath)}`, {
                method: 'POST'
            });
            
            const data = await response.json();
            
            if (data.success) {
                await this.loadDirectory(this.currentPath);
            } else {
                this.showError(data.message);
            }
        } catch (error) {
            this.showError('创建文件夹失败: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async deleteItem(path, isDirectory) {
        if (!confirm(`确定要删除吗?`)) return;
        
        this.showLoading();
        
        try {
            const endpoint = isDirectory ? '/api/directory' : '/api/file';
            const response = await fetch(`${endpoint}?action=delete&path=${encodeURIComponent(path)}&recursive=true`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (data.success) {
                await this.loadDirectory(this.currentPath);
            } else {
                this.showError(data.message);
            }
        } catch (error) {
            this.showError('删除失败: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async deleteSelected() {
        const checkboxes = document.querySelectorAll('.item-checkbox:checked');
        if (checkboxes.length === 0) return;
        
        if (!confirm(`确定要删除选中的 ${checkboxes.length} 项吗?`)) return;
        
        this.showLoading();
        
        for (const checkbox of checkboxes) {
            const path = checkbox.getAttribute('data-path');
            try {
                // Try both endpoints since we don't know the type
                await fetch(`/api/file?action=delete&path=${encodeURIComponent(path)}&recursive=true`, {
                    method: 'DELETE'
                });
            } catch (error) {
                console.error('Delete error:', error);
            }
        }
        
        await this.loadDirectory(this.currentPath);
        this.hideLoading();
    }

    downloadFile(path) {
        window.location.href = `/api/file?action=download&path=${encodeURIComponent(path)}`;
    }

    async performSearch() {
        const searchTerm = document.getElementById('searchInput').value.trim();
        if (!searchTerm) {
            this.loadDirectory(this.currentPath);
            return;
        }
        
        this.showLoading();
        
        try {
            const response = await fetch(`/api/directory?action=search&startDir=${encodeURIComponent(this.currentPath)}&name=${encodeURIComponent(searchTerm)}`);
            const data = await response.json();
            
            if (data.success) {
                // Convert search results to item format
                const items = data.results.map(path => {
                    const name = path.substring(path.lastIndexOf('/') + 1);
                    return {
                        name: name,
                        path: path,
                        isDirectory: false,
                        type: 'file'
                    };
                });
                this.renderFileList(items);
            } else {
                this.showError(data.message);
            }
        } catch (error) {
            this.showError('搜索失败: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    handleCheckboxChange() {
        const checkboxes = document.querySelectorAll('.item-checkbox:checked');
        document.getElementById('deleteBtn').disabled = checkboxes.length === 0;
    }

    selectAll(checked) {
        const checkboxes = document.querySelectorAll('.item-checkbox');
        checkboxes.forEach(cb => cb.checked = checked);
        this.handleCheckboxChange();
    }

    showError(message) {
        alert('错误: ' + message);
    }
}

// Initialize the application
let cloudDrive;
document.addEventListener('DOMContentLoaded', () => {
    cloudDrive = new CloudDrive();
});
