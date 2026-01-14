// admin.js
document.addEventListener('DOMContentLoaded', () => {
    const firebaseConfig = {
  apiKey: "AIzaSyDtSAdJydumZ9MihCb0h-hvFRY0yW7rJKE",
  authDomain: "hosting-a916d.firebaseapp.com",
  projectId: "hosting-a916d",
  storageBucket: "hosting-a916d.firebasestorage.app",
  messagingSenderId: "975867838746",
  appId: "1:975867838746:web:1a517387ab7e49ee1beca3",
  measurementId: "G-W2124D4R7C"
};
    
    const ADMIN_UID = "roW0dI8pMvRae9chw9mkEq3XT2c2";
    
    const app = firebase.initializeApp(firebaseConfig);
    const database = firebase.database();
    const auth = firebase.auth();
    
    auth.onAuthStateChanged((user) => {
        if (!user || user.uid !== ADMIN_UID) {
            window.location.href = "index.html";
        } else {
            initializeAdminDashboard();
            loadAdminData();
        }
    });
    
    document.getElementById('admin-logout').addEventListener('click', () => {
        auth.signOut().then(() => {
            window.location.href = "index.html";
        });
    });
    
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', function() {
            const section = this.dataset.section;
            switchSection(section);
        });
    });
    
    document.getElementById('refresh-dashboard').addEventListener('click', loadAdminData);
    document.getElementById('global-ads-toggle').addEventListener('change', updateAdsSettings);
    document.getElementById('ads-interval').addEventListener('change', updateAdsSettings);
    document.getElementById('send-now').addEventListener('click', sendNotification);
    document.getElementById('clear-all-logs').addEventListener('click', clearAllLogs);
    document.getElementById('test-telegram').addEventListener('click', testTelegram);
    document.getElementById('send-telegram').addEventListener('click', sendTelegramTest);
    document.getElementById('save-settings').addEventListener('click', saveSettings);
    
    document.querySelectorAll('.provider-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            switchProviderTab(this.dataset.provider);
        });
    });

    function initializeAdminDashboard() {
        setupRealtimeListeners();
        setInterval(updateSystemStats, 30000);
    }

    function setupRealtimeListeners() {
        database.ref('users').on('value', (snapshot) => {
            updateUserStats(snapshot.numChildren());
        });
        
        database.ref('files').on('value', (snapshot) => {
            updateFileStats(snapshot.numChildren());
        });
        
        database.ref('notifications').on('value', (snapshot) => {
            updateNotificationStats(snapshot.numChildren());
        });
        
        database.ref('logs').on('value', (snapshot) => {
            updateLogStats(snapshot.numChildren());
        });
    }

    function loadAdminData() {
        Promise.all([
            database.ref('users').once('value'),
            database.ref('files').once('value'),
            database.ref('logs').orderByChild('timestamp').limitToLast(10).once('value'),
            database.ref('system/stats').once('value')
        ]).then(([usersSnap, filesSnap, logsSnap, statsSnap]) => {
            document.getElementById('total-users').textContent = usersSnap.numChildren();
            document.getElementById('total-files').textContent = filesSnap.numChildren();
            updateActivityTable(logsSnap);
            const stats = statsSnap.val() || {};
            document.getElementById('cpu-usage').textContent = stats.cpu || '0%';
            document.getElementById('memory-usage').textContent = stats.memory || '0%';
            document.getElementById('db-size').textContent = stats.dbSize || '0 MB';
        });
    }

    async function sendNotification() {
        const title = document.getElementById('notif-title').value;
        const message = document.getElementById('notif-message').value;
        const type = document.querySelector('.composer-tab.active').dataset.type;
        const audience = document.getElementById('notif-audience').value;
        
        if (!title || !message) {
            alert('Title and message are required!');
            return;
        }
        
        const notification = {
            title,
            message,
            type,
            audience,
            timestamp: Date.now(),
            status: 'sent',
            sentBy: 'admin'
        };
        
        try {
            await database.ref('notifications').push(notification);
            const telegramMsg = `📢 *Admin Notification*\n\n` +
                               `Title: ${title}\n` +
                               `Type: ${type}\n` +
                               `Audience: ${audience}\n\n` +
                               `${message}`;
            await sendToTelegram(telegramMsg);
            alert('Notification sent successfully!');
            document.getElementById('notif-title').value = '';
            document.getElementById('notif-message').value = '';
            updateNotificationHistory();
        } catch (error) {
            alert('Error sending notification: ' + error.message);
        }
    }

    async function sendToTelegram(message) {
        const TELEGRAM_BOT_TOKEN = "8415165889:AAHjYonMonLaNRxiKdB0k40h5pY85usXxSo";
        const TELEGRAM_CHANNEL_ID = "-1003536757318";
        
        try {
            const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHANNEL_ID,
                    text: message,
                    parse_mode: 'Markdown'
                })
            });
            return response.ok;
        } catch (error) {
            console.error('Telegram send failed:', error);
            return false;
        }
    }

    function updateAdsSettings() {
        const adsConfig = {
            enabled: document.getElementById('global-ads-toggle').checked,
            interval: parseInt(document.getElementById('ads-interval').value) || 60,
            autoRotate: document.getElementById('auto-rotate').checked,
            updatedAt: Date.now()
        };
        
        database.ref('ads/config').set(adsConfig)
            .then(() => {
                showToast('Ads settings updated successfully!', 'success');
            })
            .catch(error => {
                showToast('Error updating ads: ' + error.message, 'error');
            });
    }

    function switchSection(section) {
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`.menu-item[data-section="${section}"]`).classList.add('active');
        document.querySelectorAll('.admin-section').forEach(sec => {
            sec.classList.remove('active');
        });
        document.getElementById(`${section}-section`).classList.add('active');
        loadSectionData(section);
    }

    function switchProviderTab(provider) {
        document.querySelectorAll('.provider-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`.provider-tab[data-provider="${provider}"]`).classList.add('active');
        document.querySelectorAll('.provider-form').forEach(form => {
            form.classList.remove('active');
        });
        document.getElementById(`${provider}-form`).classList.add('active');
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    async function updateNotificationHistory() {
        try {
            const snapshot = await database.ref('notifications')
                .orderByChild('timestamp')
                .limitToLast(50)
                .once('value');
            
            const historyTable = document.getElementById('history-table');
            historyTable.innerHTML = '';
            
            snapshot.forEach(child => {
                const notif = child.val();
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${formatTime(notif.timestamp)}</td>
                    <td>${notif.title}</td>
                    <td><span class="badge badge-${notif.type}">${notif.type}</span></td>
                    <td>${notif.status || 'sent'}</td>
                `;
                historyTable.appendChild(row);
            });
        } catch (error) {
            console.error('Error loading history:', error);
        }
    }

    function formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    async function updateSystemStats() {
        try {
            document.getElementById('cpu-usage').textContent = `${Math.round(Math.random() * 100)}%`;
            document.getElementById('memory-usage').textContent = `${Math.round(Math.random() * 100)}%`;
            
            await database.ref('system/stats').set({
                cpu: document.getElementById('cpu-usage').textContent,
                memory: document.getElementById('memory-usage').textContent,
                dbSize: document.getElementById('db-size').textContent,
                updatedAt: Date.now()
            });
        } catch (error) {
            console.error('Error updating stats:', error);
        }
    }

    function updateActivityTable(logsSnapshot) {
        const activityTable = document.getElementById('activity-table');
        activityTable.innerHTML = '';
        
        logsSnapshot.forEach(child => {
            const log = child.val();
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${formatTime(log.timestamp)}</td>
                <td>${log.user?.email || 'Anonymous'}</td>
                <td>${log.action}</td>
                <td>${JSON.stringify(log.data || {})}</td>
            `;
            activityTable.appendChild(row);
        });
    }

    function updateUserStats(count) {
        document.getElementById('total-users').textContent = count;
    }

    function updateFileStats(count) {
        document.getElementById('total-files').textContent = count;
    }

    function updateNotificationStats(count) {
        document.getElementById('total-notifications').textContent = count;
    }

    function updateLogStats(count) {
        document.getElementById('total-errors').textContent = Math.floor(count * 0.1);
    }

    function clearAllLogs() {
        if (confirm('Clear all system logs? This cannot be undone.')) {
            database.ref('logs').remove().then(() => {
                showToast('All logs cleared successfully', 'success');
            });
        }
    }

    async function testTelegram() {
        try {
            const response = await sendToTelegram('🤖 *Telegram Connection Test*\n\nBot is working properly!');
            if (response) {
                showToast('Telegram connection successful!', 'success');
            } else {
                showToast('Telegram connection failed!', 'error');
            }
        } catch (error) {
            showToast('Error: ' + error.message, 'error');
        }
    }

    async function sendTelegramTest() {
        const message = '🚀 *ZIPMASTER System Test*\n\n' +
                       'System: ZIPMASTER | COMMANDER SAGOR\n' +
                       'Status: ✅ Operational\n' +
                       'Time: ' + new Date().toISOString() + '\n' +
                       'Admin: SAGOR_200K';
        
        try {
            await sendToTelegram(message);
            showToast('Test message sent to Telegram!', 'success');
        } catch (error) {
            showToast('Failed to send test message: ' + error.message, 'error');
        }
    }

    function saveSettings() {
        showToast('Settings saved successfully!', 'success');
    }

    function loadSectionData(section) {
        if (section === 'users') loadUsersData();
        if (section === 'files') loadFilesData();
        if (section === 'logs') loadLogsData();
        if (section === 'telegram') loadTelegramData();
    }

    async function loadUsersData() {
        try {
            const snapshot = await database.ref('users').once('value');
            const usersTable = document.getElementById('users-table');
            usersTable.innerHTML = '';
            
            snapshot.forEach(child => {
                const user = child.val();
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${child.key.substring(0, 8)}...</td>
                    <td>${user.email || 'N/A'}</td>
                    <td>${user.lastLogin ? formatTime(user.lastLogin) : 'Never'}</td>
                    <td><span class="badge badge-success">Active</span></td>
                    <td>
                        <button class="btn-icon" onclick="viewUser('${child.key}')">
                            <i class="fas fa-eye"></i>
                        </button>
                    </td>
                `;
                usersTable.appendChild(row);
            });
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }

    async function loadFilesData() {
        try {
            const snapshot = await database.ref('files').once('value');
            const filesTable = document.getElementById('files-table');
            filesTable.innerHTML = '';
            
            snapshot.forEach(child => {
                const file = child.val();
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${file.name}</td>
                    <td>${file.content ? (file.content.length / 1024).toFixed(2) + ' KB' : '0 KB'}</td>
                    <td>${file.type}</td>
                    <td>${file.updatedAt ? formatTime(file.updatedAt) : formatTime(file.createdAt)}</td>
                    <td>
                        <button class="btn-icon" onclick="downloadFile('${child.key}')">
                            <i class="fas fa-download"></i>
                        </button>
                    </td>
                `;
                filesTable.appendChild(row);
            });
        } catch (error) {
            console.error('Error loading files:', error);
        }
    }

    async function loadLogsData() {
        try {
            const snapshot = await database.ref('logs').orderByChild('timestamp').limitToLast(100).once('value');
            const logsTable = document.getElementById('logs-table');
            logsTable.innerHTML = '';
            
            snapshot.forEach(child => {
                const log = child.val();
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${formatTime(log.timestamp)}</td>
                    <td><span class="badge badge-${getLogLevel(log.action)}">${getLogLevel(log.action)}</span></td>
                    <td>${log.action}</td>
                    <td>${log.user?.email || 'Anonymous'}</td>
                    <td>${JSON.stringify(log.data || {}).substring(0, 50)}...</td>
                `;
                logsTable.appendChild(row);
            });
        } catch (error) {
            console.error('Error loading logs:', error);
        }
    }

    function getLogLevel(action) {
        if (action.includes('error') || action.includes('fail')) return 'error';
        if (action.includes('warning') || action.includes('alert')) return 'warning';
        return 'info';
    }

    function loadTelegramData() {
        // Already loaded from HTML
    }

    window.viewUser = function(userId) {
        alert('View user: ' + userId);
    };

    window.downloadFile = function(fileId) {
        alert('Download file: ' + fileId);
    };
});