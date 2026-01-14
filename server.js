// server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const cron = require('node-cron');
const admin = require('firebase-admin');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const PORT = process.env.PORT || 3000;

const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://next-generationbd-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();

const TELEGRAM_BOT_TOKEN = "8415165889:AAHjYonMonLaNRxiKdB0k40h5pY85usXxSo";
const TELEGRAM_CHANNEL_ID = "-1003536757318";
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

app.post('/api/telegram/send', async (req, res) => {
  try {
    const { message, chatId = TELEGRAM_CHANNEL_ID } = req.body;
    const result = await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown'
    });
    res.json({ success: true, messageId: result.message_id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/backup', async (req, res) => {
  try {
    const { filePath, content, userId } = req.body;
    await db.ref(`backups/${Date.now()}`).set({
      filePath,
      content,
      userId,
      timestamp: Date.now()
    });
    
    const truncatedContent = content.length > 1000 ? content.substring(0, 1000) + '...' : content;
    const message = `📦 *Backup Created*\n\n` +
                   `📁 File: ${filePath}\n` +
                   `👤 User: ${userId}\n` +
                   `📏 Size: ${content.length} bytes\n\n` +
                   `Content:\n\`\`\`\n${truncatedContent}\n\`\`\``;
    
    await bot.sendMessage(TELEGRAM_CHANNEL_ID, message, {
      parse_mode: 'Markdown'
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/logs', async (req, res) => {
  try {
    const snapshot = await db.ref('logs').orderByChild('timestamp').limitToLast(100).once('value');
    const logs = [];
    snapshot.forEach(child => {
      logs.push({ id: child.key, ...child.val() });
    });
    res.json({ success: true, logs: logs.reverse() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/notification', async (req, res) => {
  try {
    const { title, message, type = 'info' } = req.body;
    const notification = {
      title,
      message,
      type,
      timestamp: Date.now(),
      read: false
    };
    
    await db.ref('notifications').push(notification);
    await db.ref('lastNotification').set(notification);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const [filesSnapshot, usersSnapshot, logsSnapshot] = await Promise.all([
      db.ref('files').once('value'),
      db.ref('users').once('value'),
      db.ref('logs').once('value')
    ]);
    
    const stats = {
      files: filesSnapshot.numChildren(),
      users: usersSnapshot.numChildren(),
      logs: logsSnapshot.numChildren(),
      uptime: process.uptime(),
      timestamp: Date.now()
    };
    
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '🤖 *ZIPMASTER Bot*\n\nCommands:\n/status - System status\n/logs - Recent logs\n/backup - Force backup\n/alert <message> - Send alert', {
    parse_mode: 'Markdown'
  });
});

bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  
  const [filesSnapshot, logsSnapshot] = await Promise.all([
    db.ref('files').once('value'),
    db.ref('logs').orderByChild('timestamp').limitToLast(5).once('value')
  ]);
  
  const recentLogs = [];
  logsSnapshot.forEach(child => {
    recentLogs.push(child.val());
  });
  
  const message = `📊 *System Status*\n\n` +
                 `📁 Files: ${filesSnapshot.numChildren()}\n` +
                 `📈 Uptime: ${Math.floor(process.uptime() / 3600)}h\n` +
                 `🔄 Last 5 actions:\n${recentLogs.map(log => `• ${log.action}`).join('\n')}`;
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

bot.onText(/\/alert (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const alertMessage = match[1];
  
  if (chatId.toString() !== TELEGRAM_CHANNEL_ID.replace('-100', '-100')) {
    return bot.sendMessage(chatId, '⚠️ Unauthorized');
  }
  
  const alert = {
    message: alertMessage,
    active: true,
    timestamp: Date.now()
  };
  
  await db.ref('alerts').set(alert);
  bot.sendMessage(chatId, '🚨 Alert sent to all users!');
});

cron.schedule('0 2 * * *', async () => {
  console.log('Running daily backup...');
  
  try {
    const snapshot = await db.ref('files').once('value');
    const files = snapshot.val() || {};
    
    let backupSummary = `📦 *Daily Backup Report*\n\n`;
    backupSummary += `Date: ${new Date().toISOString().split('T')[0]}\n`;
    backupSummary += `Total Files: ${Object.keys(files).length}\n\n`;
    
    let fileCount = 0;
    for (const [path, file] of Object.entries(files)) {
      if (file.type === 'file') {
        fileCount++;
        const truncatedContent = file.content ? 
          (file.content.length > 500 ? file.content.substring(0, 500) + '...' : file.content) :
          'Empty file';
        
        await bot.sendMessage(TELEGRAM_CHANNEL_ID, 
          `📄 *File Backup*\n\nPath: ${path}\nSize: ${file.content?.length || 0} bytes\n\n\`\`\`\n${truncatedContent}\n\`\`\``,
          { parse_mode: 'Markdown' }
        );
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    backupSummary += `Backed up: ${fileCount} files`;
    await bot.sendMessage(TELEGRAM_CHANNEL_ID, backupSummary, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Backup failed:', error);
    await bot.sendMessage(TELEGRAM_CHANNEL_ID, `❌ Backup failed: ${error.message}`);
  }
});

cron.schedule('0 3 * * 0', async () => {
  console.log('Running database cleanup...');
  
  try {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const logsSnapshot = await db.ref('logs').orderByChild('timestamp').endAt(thirtyDaysAgo).once('value');
    
    const updates = {};
    logsSnapshot.forEach(child => {
      updates[`logs/${child.key}`] = null;
    });
    
    await db.ref().update(updates);
    
    await bot.sendMessage(TELEGRAM_CHANNEL_ID, 
      `🧹 *Database Cleanup*\n\nRemoved ${logsSnapshot.numChildren()} old logs\nTimestamp: ${new Date().toISOString()}`,
      { parse_mode: 'Markdown' }
    );
    
  } catch (error) {
    console.error('Cleanup failed:', error);
  }
});

cron.schedule('0 * * * *', async () => {
  try {
    const healthCheck = {
      timestamp: Date.now(),
      status: 'healthy',
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      database: 'connected'
    };
    
    await db.ref('system/health').set(healthCheck);
    
  } catch (error) {
    console.error('Health check failed:', error);
    await bot.sendMessage(TELEGRAM_CHANNEL_ID, `⚠️ Health check failed: ${error.message}`);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 ZIPMASTER server running on port ${PORT}`);
  
  bot.sendMessage(TELEGRAM_CHANNEL_ID, 
    `✅ *ZIPMASTER Server Started*\n\nPort: ${PORT}\nTime: ${new Date().toISOString()}\nNode: ${process.version}`,
    { parse_mode: 'Markdown' }
  );
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  
  await bot.sendMessage(TELEGRAM_CHANNEL_ID, 
    `🛑 *Server Shutting Down*\n\nTime: ${new Date().toISOString()}`,
    { parse_mode: 'Markdown' }
  );
  
  process.exit(0);
});