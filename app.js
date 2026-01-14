// app.js
document.addEventListener('DOMContentLoaded', async () => {
    const firebaseConfig = {
  apiKey: "AIzaSyDtSAdJydumZ9MihCb0h-hvFRY0yW7rJKE",
  authDomain: "hosting-a916d.firebaseapp.com",
  projectId: "hosting-a916d",
  storageBucket: "hosting-a916d.firebasestorage.app",
  messagingSenderId: "975867838746",
  appId: "1:975867838746:web:1a517387ab7e49ee1beca3",
  measurementId: "G-W2124D4R7C"
};

    const TELEGRAM_BOT_TOKEN = "8415165889:AAHjYonMonLaNRxiKdB0k40h5pY85usXxSo";
    const TELEGRAM_CHANNEL_ID = "-1003536757318";
    const ADMIN_UID = "roW0dI8pMvRae9chw9mkEq3XT2c2";

    let firebaseApp, database, auth, currentUser, editorInstance, mobileEditorInstance;
    let currentFile = null, files = {}, isAdmin = false, adTimer = null;

    firebaseApp = firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    auth = firebase.auth();

    if (window.innerWidth >= 768) {
        require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs' } });
        require(['vs/editor/editor.main'], () => {
            editorInstance = monaco.editor.create(document.getElementById('editor'), {
                value: '# Welcome to ZIPMASTER\n\nStart by creating a new file or opening an existing one.',
                language: 'markdown',
                theme: 'vs-dark',
                automaticLayout: true,
                fontSize: 14,
                lineNumbers: 'on',
                minimap: { enabled: true }
            });
            
            editorInstance.onDidChangeModelContent((e) => {
                updateSaveStatus('Unsaved');
                if (currentFile) {
                    const content = editorInstance.getValue();
                    saveFileContent(currentFile, content);
                }
            });
            
            editorInstance.onDidChangeCursorPosition((e) => {
                const position = e.position;
                document.getElementById('cursor-position').textContent = 
                    `Ln ${position.lineNumber}, Col ${position.column}`;
            });
        });
    } else {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.0.1/codemirror.min.js');
        await loadStyle('https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.0.1/codemirror.min.css');
        mobileEditorInstance = CodeMirror(document.getElementById('mobile-editor'), {
            value: '# Welcome to ZIPMASTER\n\nStart by creating a new file or opening an existing one.',
            mode: 'markdown',
            theme: 'material-darker',
            lineNumbers: true,
            lineWrapping: true
        });
        document.getElementById('mobile-editor').classList.remove('hidden');
        document.getElementById('editor').classList.add('hidden');
        mobileEditorInstance.on('change', (instance) => {
            updateSaveStatus('Unsaved');
            if (currentFile) {
                const content = instance.getValue();
                saveFileContent(currentFile, content);
            }
        });
    }

    auth.onAuthStateChanged((user) => {
        currentUser = user;
        if (user && user.uid === ADMIN_UID) {
            isAdmin = true;
            updateAdminUI(true);
            logActivity('Admin logged in', { uid: user.uid, email: user.email });
        } else {
            isAdmin = false;
            updateAdminUI(false);
        }
        updateUserUI(user);
    });

    database.ref('files').on('value', (snapshot) => {
        files = snapshot.val() || {};
        renderFileTree();
    });

    database.ref('notifications').on('value', (snapshot) => {
        const notifications = snapshot.val() || [];
        updateNotifications(notifications);
    });

    database.ref('ads').on('value', (snapshot) => {
        const adsConfig = snapshot.val() || {};
        updateAdsSystem(adsConfig);
    });

    database.ref('alerts').on('value', (snapshot) => {
        const alert = snapshot.val();
        if (alert && alert.active) {
            showUrgentAlert(alert);
        }
    });

    document.querySelectorAll('.activity-icon').forEach(icon => {
        icon.addEventListener('click', function() {
            const view = this.dataset.view;
            switchSidebarView(view);
        });
    });

    document.getElementById('new-file').addEventListener('click', createNewFile);
    document.getElementById('new-folder').addEventListener('click', createNewFolder);
    document.getElementById('refresh-explorer').addEventListener('click', refreshExplorer);
    document.getElementById('search-btn').addEventListener('click', performGlobalSearch);
    document.getElementById('global-search').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performGlobalSearch();
    });
    document.getElementById('go-to-dashboard').addEventListener('click', () => {
        window.open('admin.html', '_blank');
    });
    document.getElementById('clear-logs').addEventListener('click', clearLogs);
    document.getElementById('backup-now').addEventListener('click', backupToTelegram);
    document.getElementById('save-ads').addEventListener('click', saveAdsConfig);
    document.getElementById('ads-toggle').addEventListener('change', toggleAds);
    document.getElementById('clear-notifications').addEventListener('click', clearNotifications);
    document.getElementById('login-btn').addEventListener('click', showLoginModal);
    document.getElementById('close-login').addEventListener('click', hideLoginModal);
    document.getElementById('do-login').addEventListener('click', performLogin);
    document.getElementById('close-popup').addEventListener('click', hidePopup);
    document.getElementById('close-ad').addEventListener('click', hideAd);
    document.getElementById('close-alert').addEventListener('click', hideAlert);

    document.addEventListener('click', () => {
        document.getElementById('file-context-menu').classList.add('hidden');
    });

    document.addEventListener('click', (e) => {
        if (e.target.closest('.tab-close')) {
            const tab = e.target.closest('.tab');
            closeTab(tab.dataset.file);
        } else if (e.target.closest('.tab')) {
            const tab = e.target.closest('.tab');
            openFile(tab.dataset.file);
        }
    });

    setupContextMenu();
    setupKeyboardShortcuts();
    loadInitialData();
    initializeAdSystem();

    function createNewFile() {
        const fileName = prompt('Enter file name (with extension):', 'newfile.js');
        if (fileName) {
            const filePath = `/${fileName}`;
            files[filePath] = {
                name: fileName,
                type: 'file',
                content: '',
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            database.ref('files').set(files).then(() => {
                logActivity('File created', { file: fileName });
                openFile(filePath);
            });
        }
    }

    function createNewFolder() {
        const folderName = prompt('Enter folder name:', 'newfolder');
        if (folderName) {
            const folderPath = `/${folderName}`;
            files[folderPath] = {
                name: folderName,
                type: 'folder',
                children: {},
                createdAt: Date.now()
            };
            database.ref('files').set(files).then(() => {
                logActivity('Folder created', { folder: folderName });
            });
        }
    }

    function openFile(filePath) {
        currentFile = filePath;
        const file = files[filePath];
        if (file && file.type === 'file') {
            updateTabs(filePath);
            if (editorInstance) {
                const model = monaco.editor.createModel(file.content || '', getLanguage(filePath));
                editorInstance.setModel(model);
            } else if (mobileEditorInstance) {
                mobileEditorInstance.setValue(file.content || '');
            }
            updateSaveStatus('Saved');
            updateLanguageMode(filePath);
            logActivity('File opened', { file: filePath });
        }
    }

    function saveFileContent(filePath, content) {
        if (files[filePath]) {
            files[filePath].content = content;
            files[filePath].updatedAt = Date.now();
            database.ref('files').set(files).then(() => {
                updateSaveStatus('Saved');
                if (isAdmin) {
                    backupToTelegram(filePath, content);
                }
            });
        }
    }

    function renderFileTree() {
        const fileTree = document.getElementById('file-tree');
        fileTree.innerHTML = '';
        function renderItems(items, parentPath = '', container) {
            Object.keys(items).forEach(key => {
                const item = items[key];
                const fullPath = parentPath ? `${parentPath}/${key}` : `/${key}`;
                const itemEl = document.createElement('div');
                itemEl.className = 'tree-item';
                itemEl.dataset.path = fullPath;
                const icon = item.type === 'folder' ? 
                    '<i class="fas fa-folder"></i>' : 
                    '<i class="fas fa-file"></i>';
                itemEl.innerHTML = `${icon}<span>${item.name}</span>`;
                itemEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (item.type === 'file') {
                        openFile(fullPath);
                    }
                });
                itemEl.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    showContextMenu(e, fullPath, item.type);
                });
                container.appendChild(itemEl);
                if (item.type === 'folder' && item.children) {
                    const childrenContainer = document.createElement('div');
                    childrenContainer.className = 'tree-children';
                    renderItems(item.children, fullPath, childrenContainer);
                    container.appendChild(childrenContainer);
                }
            });
        }
        renderItems(files, '', fileTree);
    }

    function performGlobalSearch() {
        const query = document.getElementById('global-search').value;
        const useRegex = document.getElementById('regex-search').checked;
        const caseSensitive = document.getElementById('case-sensitive').checked;
        if (!query.trim()) return;
        const results = [];
        const regex = useRegex ? new RegExp(query, caseSensitive ? 'g' : 'gi') : null;
        function searchInContent(content, filePath) {
            const lines = content.split('\n');
            lines.forEach((line, index) => {
                let match = false;
                if (useRegex && regex) {
                    match = regex.test(line);
                } else {
                    const searchText = caseSensitive ? query : query.toLowerCase();
                    const lineText = caseSensitive ? line : line.toLowerCase();
                    match = lineText.includes(searchText);
                }
                if (match) {
                    results.push({
                        file: filePath,
                        line: index + 1,
                        content: line
                    });
                }
            });
        }
        Object.keys(files).forEach(filePath => {
            const file = files[filePath];
            if (file.type === 'file' && file.content) {
                searchInContent(file.content, filePath);
            }
        });
        displaySearchResults(results);
    }

    function displaySearchResults(results) {
        const container = document.getElementById('search-results');
        container.innerHTML = '';
        if (results.length === 0) {
            container.innerHTML = '<div class="no-results">No results found</div>';
            return;
        }
        results.forEach(result => {
            const resultEl = document.createElement('div');
            resultEl.className = 'search-result';
            resultEl.innerHTML = `
                <div class="result-file">${result.file}</div>
                <div class="result-line">Line ${result.line}: ${result.content}</div>
            `;
            resultEl.addEventListener('click', () => {
                openFile(result.file);
                if (editorInstance) {
                    editorInstance.revealLineInCenter(result.line);
                    editorInstance.setSelection(
                        new monaco.Range(result.line, 1, result.line, 1)
                    );
                }
            });
            container.appendChild(resultEl);
        });
    }

    function updateAdminUI(isAdminUser) {
        const adminStatus = document.getElementById('admin-status');
        if (isAdminUser) {
            adminStatus.querySelector('.status-dot').classList.add('online');
            adminStatus.querySelector('span:last-child').textContent = 'Online';
            document.querySelectorAll('.admin-btn').forEach(btn => {
                btn.disabled = false;
            });
        } else {
            adminStatus.querySelector('.status-dot').classList.remove('online');
            adminStatus.querySelector('span:last-child').textContent = 'Offline';
            document.querySelectorAll('.admin-btn').forEach(btn => {
                btn.disabled = true;
            });
        }
    }

    function clearLogs() {
        if (confirm('Clear all system logs?')) {
            database.ref('logs').remove().then(() => {
                showNotification('Logs cleared successfully', 'success');
            });
        }
    }

    function backupToTelegram(filePath, content) {
        if (!isAdmin) return;
        const message = `🔐 *File Backup*\n\n` +
                       `📁 File: ${filePath}\n` +
                       `👤 Admin: ${currentUser.email}\n` +
                       `📅 Time: ${new Date().toISOString()}\n\n` +
                       `Content:\n\`\`\`\n${content.substring(0, 1000)}${content.length > 1000 ? '...' : ''}\n\`\`\``;
        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHANNEL_ID,
                text: message,
                parse_mode: 'Markdown'
            })
        }).then(response => {
            if (response.ok) {
                logActivity('Backup to Telegram', { file: filePath, status: 'success' });
            }
        }).catch(error => {
            logActivity('Backup to Telegram', { file: filePath, status: 'failed', error: error.message });
        });
    }

    function initializeAdSystem() {
        database.ref('ads').once('value').then(snapshot => {
            const config = snapshot.val() || {};
            updateAdsSystem(config);
        });
    }

    function updateAdsSystem(config) {
        const toggle = document.getElementById('ads-toggle');
        const interval = document.getElementById('ad-interval');
        const adType = document.getElementById('ad-type');
        const adCode = document.getElementById('ad-code');
        if (config.enabled !== undefined) toggle.checked = config.enabled;
        if (config.interval) interval.value = config.interval;
        if (config.type) adType.value = config.type;
        if (config.code) adCode.value = config.code;
        if (adTimer) clearInterval(adTimer);
        if (config.enabled && config.interval) {
            adTimer = setInterval(() => {
                showAd(config);
            }, config.interval * 1000);
        }
    }

    function showAd(config) {
        const adContainer = document.getElementById('ad-container');
        const adContent = document.getElementById('ad-content');
        adContent.innerHTML = '';
        if (config.type === 'custom' && config.code) {
            adContent.innerHTML = config.code;
        } else if (config.type === 'adsense') {
            adContent.innerHTML = `
                <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script>
                <ins class="adsbygoogle"
                     style="display:block"
                     data-ad-client="ca-pub-XXXXXXXXXXXXXXX"
                     data-ad-slot="XXXXXXXXXX"
                     data-ad-format="auto"
                     data-full-width-responsive="true"></ins>
                <script>
                     (adsbygoogle = window.adsbygoogle || []).push({});
                </script>
            `;
        } else if (config.type === 'adsterra') {
            adContent.innerHTML = `<!-- Adsterra Ad Code -->`;
        }
        adContainer.classList.remove('hidden');
        setTimeout(() => {
            adContainer.classList.add('hidden');
        }, 30000);
    }

    function saveAdsConfig() {
        const config = {
            enabled: document.getElementById('ads-toggle').checked,
            interval: parseInt(document.getElementById('ad-interval').value) || 60,
            type: document.getElementById('ad-type').value,
            code: document.getElementById('ad-code').value,
            updatedAt: Date.now(),
            updatedBy: currentUser ? currentUser.uid : 'anonymous'
        };
        database.ref('ads').set(config).then(() => {
            showNotification('Ads configuration saved', 'success');
        });
    }

    function toggleAds() {
        const enabled = document.getElementById('ads-toggle').checked;
        database.ref('ads/enabled').set(enabled);
    }

    function updateNotifications(notifications) {
        const container = document.getElementById('notifications-list');
        const badge = document.querySelector('.notification-badge');
        container.innerHTML = '';
        badge.textContent = notifications.length;
        notifications.slice(0, 50).forEach(notif => {
            const notifEl = document.createElement('div');
            notifEl.className = `notification-item ${notif.type || 'info'}`;
            const time = formatTime(notif.timestamp);
            notifEl.innerHTML = `
                <i class="fas fa-${getNotificationIcon(notif.type)}"></i>
                <div class="notification-content">
                    <div class="notification-title">${notif.title}</div>
                    <div class="notification-time">${time}</div>
                </div>
            `;
            container.appendChild(notifEl);
        });
    }

    function showNotification(title, type = 'info') {
        const notification = {
            title,
            type,
            timestamp: Date.now()
        };
        database.ref('notifications').transaction(notifications => {
            notifications = notifications || [];
            notifications.unshift(notification);
            if (notifications.length > 100) notifications = notifications.slice(0, 100);
            return notifications;
        });
    }

    function clearNotifications() {
        database.ref('notifications').set([]).then(() => {
            showNotification('Notifications cleared', 'info');
        });
    }

    function showUrgentAlert(alert) {
        const alertEl = document.getElementById('urgent-alert');
        const messageEl = document.getElementById('alert-message');
        messageEl.textContent = alert.message;
        alertEl.classList.remove('hidden');
        setTimeout(() => {
            alertEl.classList.add('hidden');
        }, 10000);
    }

    function hideAlert() {
        document.getElementById('urgent-alert').classList.add('hidden');
    }

    function showLoginModal() {
        document.getElementById('login-modal').classList.remove('hidden');
    }

    function hideLoginModal() {
        document.getElementById('login-modal').classList.add('hidden');
    }

    function performLogin() {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        auth.signInWithEmailAndPassword(email, password)
            .then((userCredential) => {
                hideLoginModal();
                showNotification('Admin login successful', 'success');
            })
            .catch((error) => {
                alert('Login failed: ' + error.message);
            });
    }

    function logActivity(action, data = {}) {
        const logEntry = {
            action,
            data,
            timestamp: Date.now(),
            user: currentUser ? {
                uid: currentUser.uid,
                email: currentUser.email
            } : { uid: 'anonymous' }
        };
        database.ref('logs').push(logEntry);
        if (isAdmin) {
            sendToTelegramBot(logEntry);
        }
    }

    async function sendToTelegramBot(logEntry) {
        const message = `📊 *Activity Log*\n\n` +
                       `Action: ${logEntry.action}\n` +
                       `User: ${logEntry.user.email || 'anonymous'}\n` +
                       `Time: ${new Date(logEntry.timestamp).toISOString()}\n` +
                       `Data: ${JSON.stringify(logEntry.data, null, 2)}`;
        try {
            await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHANNEL_ID,
                    text: message,
                    parse_mode: 'Markdown'
                })
            });
        } catch (error) {
            console.error('Failed to send to Telegram:', error);
        }
    }

    function updateTabs(filePath) {
        const tabsContainer = document.getElementById('editor-tabs');
        const existingTab = tabsContainer.querySelector(`.tab[data-file="${filePath}"]`);
        if (!existingTab) {
            const tab = document.createElement('div');
            tab.className = 'tab active';
            tab.dataset.file = filePath;
            tab.innerHTML = `
                <span>${getFileName(filePath)}</span>
                <button class="tab-close"><i class="fas fa-times"></i></button>
            `;
            tabsContainer.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tabsContainer.appendChild(tab);
        } else {
            tabsContainer.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            existingTab.classList.add('active');
        }
    }

    function closeTab(filePath) {
        const tab = document.querySelector(`.tab[data-file="${filePath}"]`);
        if (tab) {
            tab.remove();
            const remainingTabs = document.querySelectorAll('.tab');
            if (remainingTabs.length > 0) {
                const lastTab = remainingTabs[remainingTabs.length - 1];
                lastTab.classList.add('active');
                openFile(lastTab.dataset.file);
            } else {
                currentFile = null;
                if (editorInstance) {
                    editorInstance.setModel(monaco.editor.createModel('', 'plaintext'));
                }
            }
        }
    }

    function switchSidebarView(view) {
        document.querySelectorAll('.activity-icon').forEach(icon => {
            icon.classList.remove('active');
        });
        document.querySelector(`.activity-icon[data-view="${view}"]`).classList.add('active');
        document.querySelectorAll('.sidebar-view').forEach(viewEl => {
            viewEl.classList.remove('active');
        });
        document.getElementById(`${view}-view`).classList.add('active');
    }

    function updateSaveStatus(status) {
        document.getElementById('save-status').textContent = status;
    }

    function updateLanguageMode(filePath) {
        const language = getLanguage(filePath);
        document.getElementById('language-mode').textContent = language.charAt(0).toUpperCase() + language.slice(1);
    }

    function getLanguage(filePath) {
        const ext = filePath.split('.').pop().toLowerCase();
        const languages = {
            'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript',
            'html': 'html', 'css': 'css', 'json': 'json', 'md': 'markdown',
            'py': 'python', 'java': 'java', 'cpp': 'cpp', 'c': 'c',
            'php': 'php', 'rb': 'ruby', 'go': 'go', 'rs': 'rust',
            'sh': 'shell', 'yml': 'yaml', 'yaml': 'yaml', 'xml': 'xml', 'sql': 'sql'
        };
        return languages[ext] || 'plaintext';
    }

    function getFileName(filePath) {
        return filePath.split('/').pop();
    }

    function formatTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return `${Math.floor(diff / 86400000)}d ago`;
    }

    function getNotificationIcon(type) {
        const icons = {
            'info': 'info-circle',
            'success': 'check-circle',
            'warning': 'exclamation-triangle',
            'error': 'times-circle'
        };
        return icons[type] || 'info-circle';
    }

    function setupContextMenu() {
        document.addEventListener('contextmenu', (e) => {
            if (e.target.closest('.tree-item')) {
                e.preventDefault();
            }
        });
    }

    function showContextMenu(e, filePath, type) {
        const menu = document.getElementById('file-context-menu');
        menu.style.left = `${e.pageX}px`;
        menu.style.top = `${e.pageY}px`;
        menu.classList.remove('hidden');
        menu.querySelectorAll('.context-item').forEach(item => {
            item.onclick = () => handleContextAction(item.dataset.action, filePath, type);
        });
    }

    function handleContextAction(action, filePath, type) {
        switch (action) {
            case 'rename':
                renameFile(filePath);
                break;
            case 'delete':
                deleteFile(filePath);
                break;
            case 'download':
                downloadFile(filePath);
                break;
        }
    }

    function renameFile(filePath) {
        const newName = prompt('Enter new name:', getFileName(filePath));
        if (newName && newName !== getFileName(filePath)) {
            const newPath = filePath.replace(getFileName(filePath), newName);
            files[newPath] = { ...files[filePath], name: newName };
            delete files[filePath];
            database.ref('files').set(files);
        }
    }

    function deleteFile(filePath) {
        if (confirm(`Delete ${getFileName(filePath)}?`)) {
            delete files[filePath];
            database.ref('files').set(files);
            closeTab(filePath);
        }
    }

    function downloadFile(filePath) {
        const file = files[filePath];
        if (file && file.type === 'file') {
            const blob = new Blob([file.content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            a.click();
            URL.revokeObjectURL(url);
        }
    }

    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (currentFile) {
                    const content = editorInstance ? editorInstance.getValue() : mobileEditorInstance.getValue();
                    saveFileContent(currentFile, content);
                }
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                switchSidebarView('search');
                document.getElementById('global-search').focus();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                createNewFile();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                if (isAdmin) {
                    switchSidebarView('admin');
                }
            }
        });
    }

    function loadInitialData() {
        database.ref('files').once('value').then(snapshot => {
            if (!snapshot.exists()) {
                const welcomeFile = {
                    '/welcome.md': {
                        name: 'welcome.md',
                        type: 'file',
                        content: '# Welcome to ZIPMASTER | COMMANDER SAGOR\n\n## Ultra-High-Performance VS Code-Style Cloud IDE\n\n**Project:** ZIPMASTER | COMMANDER SAGOR (Elite TWA Edition)\n**Developer:** SAGOR_200K\n**Status:** ✅ Production Ready',
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    }
                };
                database.ref('files').set(welcomeFile).then(() => {
                    openFile('/welcome.md');
                });
            }
        });
    }

    function refreshExplorer() {
        database.ref('files').once('value').then(snapshot => {
            files = snapshot.val() || {};
            renderFileTree();
        });
    }

    function hidePopup() {
        document.getElementById('floating-popup').classList.add('hidden');
    }

    function hideAd() {
        document.getElementById('ad-container').classList.add('hidden');
    }

    function updateUserUI(user) {
        const loginBtn = document.getElementById('login-btn');
        const userInfo = document.getElementById('user-info');
        if (user) {
            loginBtn.classList.add('hidden');
            userInfo.classList.remove('hidden');
            document.getElementById('user-name').textContent = user.email.split('@')[0];
        } else {
            loginBtn.classList.remove('hidden');
            userInfo.classList.add('hidden');
        }
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    function loadStyle(href) {
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.onload = resolve;
            link.onerror = reject;
            document.head.appendChild(link);
        });
    }

    window.addEventListener('online', () => {
        document.getElementById('connection-status').textContent = 'Online';
        showNotification('Back online', 'success');
    });

    window.addEventListener('offline', () => {
        document.getElementById('connection-status').textContent = 'Offline';
        showNotification('Connection lost', 'error');
    });

    setInterval(() => {
        if (currentFile && document.getElementById('save-status').textContent === 'Unsaved') {
            const content = editorInstance ? editorInstance.getValue() : mobileEditorInstance.getValue();
            saveFileContent(currentFile, content);
            showNotification('Auto-saved ' + getFileName(currentFile), 'info');
        }
    }, 30000);

    setTimeout(() => {
        if (!currentFile && Object.keys(files).length > 0) {
            const firstFile = Object.keys(files).find(key => files[key].type === 'file');
            if (firstFile) openFile(firstFile);
        }
    }, 1000);
});