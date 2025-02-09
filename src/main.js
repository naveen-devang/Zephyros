const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');

// Initialize storage
const userDataPath = app.getPath('userData');
const storePath = path.join(userDataPath, 'bookmarks.json');
const historyStorePath = path.join(userDataPath, 'history.json');

// Helper functions for storage
function readStore() {
  try {
    if (fs.existsSync(storePath)) {
      const data = fs.readFileSync(storePath, 'utf8');
      return JSON.parse(data);
    }
    return { bookmarks: [] };
  } catch (error) {
    console.error('Error reading store:', error);
    return { bookmarks: [] };
  }
 }

function writeStore(data) {
  try {
    fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing store:', error);
  }
}

function readHistory() {
  try {
    if (fs.existsSync(historyStorePath)) {
      const data = fs.readFileSync(historyStorePath, 'utf8');
      return JSON.parse(data);
    }
    return { entries: [] };
  } catch (error) {
    console.error('Error reading history:', error);
    return { entries: [] };
  }
}

function writeHistory(data) {
  try {
    fs.writeFileSync(historyStorePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing history:', error);
  }
}

async function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    autoHideMenuBar: true
  });

  mainWindow.loadFile('src/index.html');
}

// Handle IPC calls
ipcMain.handle('add-history-entry', async (event, entry) => {
  const history = readHistory();
  history.entries.unshift(entry); // Add to beginning of array
  writeHistory(history);
  return true;
});

ipcMain.handle('get-history', async () => {
  const history = readHistory();
  return history.entries;
});

ipcMain.handle('clear-history', async () => {
  writeHistory({ entries: [] });
  return true;
});

ipcMain.handle('delete-history-entry', async (event, url) => {
  const history = readHistory();
  history.entries = history.entries.filter(entry => entry.url !== url);
  writeHistory(history);
  return true;
});

ipcMain.handle('search-history', async (event, query) => {
  const history = readHistory();
  query = query.toLowerCase();
  return history.entries.filter(entry => 
    entry.title.toLowerCase().includes(query) || 
    entry.url.toLowerCase().includes(query)
  );
});

ipcMain.handle('create-tab', async (event, url) => {
  return 'tab-' + Date.now();
});

ipcMain.handle('close-tab', async (event, tabId) => {
  return true;
});

ipcMain.handle('navigate-forward', async (event, tabId) => {
  return true;
})

ipcMain.handle('navigate-back', async (event, tabId) => {
  return true;
})

ipcMain.handle('refresh', async (event, tabId) => {
  return true;
})

ipcMain.handle('navigate-to-url', async (event, tabId, url) => {
  try {
    // Check if the URL starts with http:// or https://
    if (!/^https?:\/\//i.test(url)) {
      // Check if it's a valid domain-like input
      if (/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}/.test(url)) {
        url = 'https://' + url;
      } else {
        // If not a valid domain, perform a Google search
        return `https://www.google.com/search?q=${encodeURIComponent(url)}`;
      }
    }
    
    // Validate the URL
    const processedUrl = new URL(url);
    return processedUrl.toString();
  } catch {
    // If URL parsing fails, do a Google search
    return `https://www.google.com/search?q=${encodeURIComponent(url)}`;
  }
});

ipcMain.handle('get-bookmarks', async () => {
  const store = readStore();
  return store.bookmarks;
});

ipcMain.handle('add-bookmark', async (event, url, title) => {
  const store = readStore();
  
  // Add new bookmark if it doesn't exist
  if (!store.bookmarks.some(b => b.url === url)) {
    store.bookmarks.push({ url, title });
    writeStore(store);
  }
  
  return true;
});

// New handler for deleting bookmarks
ipcMain.handle('delete-bookmark', async (event, url) => {
  const store = readStore();
  store.bookmarks = store.bookmarks.filter(b => b.url !== url);
  writeStore(store);
  return true;
});

ipcMain.handle('get-all-cookies', async (event, url) => {
  try {
    const cookies = await session.defaultSession.cookies.get({ url });
    return cookies;
  } catch (error) {
    console.error('Error getting cookies:', error);
    return [];
  }
});

// Get specific cookie
ipcMain.handle('get-cookie', async (event, { url, name }) => {
  try {
    const cookies = await session.defaultSession.cookies.get({ url, name });
    return cookies[0];
  } catch (error) {
    console.error('Error getting cookie:', error);
    return null;
  }
});

// Set cookie
ipcMain.handle('set-cookie', async (event, cookieDetails) => {
  try {
    await session.defaultSession.cookies.set(cookieDetails);
    return true;
  } catch (error) {
    console.error('Error setting cookie:', error);
    return false;
  }
});

// Remove cookie
ipcMain.handle('remove-cookie', async (event, { url, name }) => {
  try {
    await session.defaultSession.cookies.remove(url, name);
    return true;
  } catch (error) {
    console.error('Error removing cookie:', error);
    return false;
  }
});

// Remove all cookies
ipcMain.handle('remove-all-cookies', async () => {
  try {
    await session.defaultSession.cookies.clearStorageData();
    return true;
  } catch (error) {
    console.error('Error clearing cookies:', error);
    return false;
  }
});

// Block cookies for specific domains
ipcMain.handle('set-cookie-rules', async (event, rules) => {
  try {
    await session.defaultSession.cookies.setPermissionLevel(rules);
    return true;
  } catch (error) {
    console.error('Error setting cookie rules:', error);
    return false;
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});