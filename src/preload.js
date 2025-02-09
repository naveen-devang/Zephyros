const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'electronAPI', {
    // Tab management
    createTab: (url) => ipcRenderer.invoke('create-tab', url),
    closeTab: (tabId) => ipcRenderer.invoke('close-tab', tabId),
    
    // Navigation
    navigateBack: (tabId) => ipcRenderer.invoke('navigate-back', tabId),
    navigateForward: (tabId) => ipcRenderer.invoke('navigate-forward', tabId),
    navigateToUrl: (tabId, url) => ipcRenderer.invoke('navigate-to-url', tabId, url),
    refresh: (tabId) => ipcRenderer.invoke('refresh', tabId),
    
    // Bookmark management
    getBookmarks: () => ipcRenderer.invoke('get-bookmarks'),
    addBookmark: (url, title) => ipcRenderer.invoke('add-bookmark', url, title),
    deleteBookmark: (url) => ipcRenderer.invoke('delete-bookmark', url), 
    
    // Listeners
    onTitleUpdate: (callback) => ipcRenderer.on('page-title-updated', callback),
    onFaviconUpdate: (callback) => ipcRenderer.on('page-favicon-updated', callback),
    onLoadingStateChange: (callback) => ipcRenderer.on('loading-state-changed', callback),
    onNavigationStateChange: (callback) => ipcRenderer.on('navigation-state-changed', callback),

    // Cookie management
    getAllCookies: (url) => ipcRenderer.invoke('get-all-cookies', url),
    getCookie: (details) => ipcRenderer.invoke('get-cookie', details),
    setCookie: (details) => ipcRenderer.invoke('set-cookie', details),
    removeCookie: (details) => ipcRenderer.invoke('remove-cookie', details),
    removeAllCookies: () => ipcRenderer.invoke('remove-all-cookies'),
    setCookieRules: (rules) => ipcRenderer.invoke('set-cookie-rules', rules),

    // History management
    addHistoryEntry: (entry) => ipcRenderer.invoke('add-history-entry', entry),
    getHistory: () => ipcRenderer.invoke('get-history'),
    clearHistory: () => ipcRenderer.invoke('clear-history'),
    deleteHistoryEntry: (url) => ipcRenderer.invoke('delete-history-entry', url),
    searchHistory: (query) => ipcRenderer.invoke('search-history', query),

    clearCache: () => ipcRenderer.invoke('clear-cache'),
    clearStorageData: (options) => ipcRenderer.invoke('clear-storage-data', options),

    // Extension management
    installExtension: (extensionId) => ipcRenderer.invoke('install-extension', extensionId),
    uninstallExtension: (extensionId) => ipcRenderer.invoke('uninstall-extension', extensionId),
    getInstalledExtensions: () => ipcRenderer.invoke('get-installed-extensions'),
    enableExtension: (extensionId) => ipcRenderer.invoke('enable-extension', extensionId),
    disableExtension: (extensionId) => ipcRenderer.invoke('disable-extension', extensionId),
    openChromeWebStore: () => ipcRenderer.invoke('open-chrome-web-store'),
  },
);