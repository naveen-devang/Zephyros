let tabs = [];
let activeTab = null;
let bookmarks = [];
let cookieManagerOpen = false;
let historyPanelOpen = false;
let menuOpen = false;

// Load saved bookmarks
async function loadBookmarks() {
  try {
    bookmarks = await window.electronAPI.getBookmarks();
    renderBookmarks();
  } catch (e) {
    console.error('Error loading bookmarks:', e);
  }
}

async function createTab(url = 'https://www.google.com') {
  const tabId = await window.electronAPI.createTab(url);
  
  // Create tab button
  const tabButton = document.createElement('div');
  tabButton.className = 'tab flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-t-lg cursor-pointer transition-colors';
  tabButton.draggable = true; // Make tab draggable
  tabButton.dataset.tabId = tabId;
  tabButton.innerHTML = `
      <span class="tab-media-indicator hidden">
        <button class="media-mute-button p-1 hover:bg-slate-300 rounded-full transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="volume-icon">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path class="volume-waves" d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
          </svg>
        </button>
      </span>
      <span class="tab-favicon hidden"></span>
      <span class="tab-title text-sm truncate max-w-[140px]">New Tab</span>
      <button class="tab-close flex items-center justify-center w-5 h-5 rounded-full hover:bg-slate-300 transition-colors" onclick="event.stopPropagation(); closeTab('${tabId}')">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
      </button>
  `;

  // Add event listeners
  tabButton.querySelector('.tab-close').onclick = (e) => {
    e.stopPropagation();
    closeTab(tabId);
  };

  tabButton.addEventListener('dragstart', handleDragStart);
  tabButton.addEventListener('dragend', handleDragEnd);
  tabButton.addEventListener('dragover', handleDragOver);
  tabButton.addEventListener('drop', handleDrop);
  tabButton.addEventListener('dragenter', handleDragEnter);
  tabButton.addEventListener('dragleave', handleDragLeave);
  tabButton.onclick = () => activateTab(tabId);

  // Add mute button click handler
  const muteButton = tabButton.querySelector('.media-mute-button');
  muteButton.onclick = (e) => {
    e.stopPropagation();
    toggleMute(tabId);
  };
  
  // Get the tab bar
  const tabBar = document.getElementById('tab-bar');
  
  // Add the new tab before the plus button
  const plusButton = tabBar.querySelector('.plus-button');
  if (plusButton) {
    tabBar.insertBefore(tabButton, plusButton);
  } else {
    tabBar.appendChild(tabButton);
    
    const newPlusButton = document.createElement('button');
    newPlusButton.className = 'plus-button flex items-center justify-center w-8 h-8 rounded-full hover:bg-slate-200 transition-colors ml-1';
    newPlusButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    `;
    newPlusButton.onclick = () => createTab();
    tabBar.appendChild(newPlusButton);
  }

  // Create webview
  const webview = document.createElement('webview');
  webview.id = tabId;
  webview.src = url;
  webview.setAttribute('allowfullscreen', 'true');
  document.getElementById('webviews').appendChild(webview);

  // Create tab object immediately but mark it as not ready
  const tab = { id: tabId, webview, button: tabButton, isReady: false, title: 'New Tab', isAudioPlaying: false, isMuted: false };
  tabs.push(tab);

  // Add audio event listeners
  webview.addEventListener('media-started-playing', () => {
    updateTabAudioState(tabId, true);
  });

  webview.addEventListener('media-paused', () => {
    updateTabAudioState(tabId, false);
  });
  

  // Add fullscreen event listeners
  webview.addEventListener('enter-html-full-screen', () => {
    document.body.classList.add('fullscreen-mode');
    webview.focus();
  });

  webview.addEventListener('leave-html-full-screen', () => {
    document.body.classList.remove('fullscreen-mode');
  });

  const originalCreateTab = createTab;
  createTab = async function(url) {
    const tabId = await originalCreateTab(url);
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      setupCookieListeners(tab.webview);
    }
    return tabId;
  }
  

  // Set up dom-ready handler
  webview.addEventListener('dom-ready', () => {
    tab.isReady = true;
    
    // Update page title when it changes
    webview.addEventListener('page-title-updated', (e) => {
      if (e.title) {
        tab.title = e.title;
        tabButton.querySelector('.tab-title').textContent = e.title;
        if (tabId === activeTab) {
          document.title = e.title;
        }
      }
    });

    webview.addEventListener('page-favicon-updated', (e) => {
      if (e.favicons && e.favicons.length > 0) {
        const favicon = document.createElement('img');
        favicon.src = e.favicons[0];
        favicon.className = 'tab-favicon';
        favicon.style.width = '16px';
        favicon.style.height = '16px';
        favicon.style.marginRight = '5px';
        
        const existingFavicon = tabButton.querySelector('.tab-favicon');
        if (existingFavicon) {
          existingFavicon.remove();
        }
        
        const titleSpan = tabButton.querySelector('.tab-title');
        titleSpan.parentNode.insertBefore(favicon, titleSpan);
      }
    });
    
    // Update URL bar when the page starts loading
    webview.addEventListener('did-start-loading', () => {
      if (tabId === activeTab && tab.isReady) {
        const currentUrl = webview.getURL();
        if (currentUrl) {
          document.getElementById('url-bar').value = currentUrl;
        }
      }
      tabButton.classList.add('loading');
    });

    // Update URL bar when navigation happens
    webview.addEventListener('did-navigate', (e) => {
      if (tabId === activeTab) {
        document.getElementById('url-bar').value = e.url;
        updateBookmarkIcon();
        addHistoryEntry(e.url, webview.getTitle() || 'Untitled');
      }
    });

    webview.addEventListener('did-navigate-in-page', (e) => {
      if (tabId === activeTab) {
        document.getElementById('url-bar').value = e.url;
        updateBookmarkIcon();
      }
    });

    webview.addEventListener('did-redirect-navigation', (e) => {
      if (tabId === activeTab) {
        document.getElementById('url-bar').value = e.url;
      }
    });

    webview.addEventListener('did-stop-loading', () => {
      tabButton.classList.remove('loading');
    });

    // If this is the only tab, activate it
    if (tabs.length === 1 || !activeTab) {
      activateTab(tabId);
    }
  });

  return tabId;
}

let draggedTab = null;
let dropIndicator = null;

function createDropIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'drop-indicator';
  indicator.style.cssText = `
    position: absolute;
    width: 2px;
    height: 36px;
    background-color: #3b82f6;
    transition: all 0.2s ease;
    pointer-events: none;
    display: none;
  `;
  document.getElementById('tab-bar').appendChild(indicator);
  return indicator;
}

function handleDragStart(e) {
  draggedTab = e.target;
  e.target.style.opacity = '0.5';
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', ''); // Required for Firefox
  
  // Create drop indicator if it doesn't exist
  if (!dropIndicator) {
    dropIndicator = createDropIndicator();
  }
}

function handleDragEnd(e) {
  draggedTab.style.opacity = '1';
  draggedTab = null;
  
  // Hide drop indicator
  if (dropIndicator) {
    dropIndicator.style.display = 'none';
  }
  
  // Remove any drag-over classes
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.classList.remove('drag-over');
  });
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDragEnter(e) {
  const tab = e.target.closest('.tab');
  if (tab && tab !== draggedTab) {
    tab.classList.add('drag-over');
    
    // Position drop indicator
    const rect = tab.getBoundingClientRect();
    const tabBar = document.getElementById('tab-bar');
    const tabBarRect = tabBar.getBoundingClientRect();
    
    // Determine if we should show indicator before or after the tab
    const mouseX = e.clientX;
    const tabCenterX = rect.left + rect.width / 2;
    
    if (mouseX < tabCenterX) {
      dropIndicator.style.left = `${rect.left - tabBarRect.left}px`;
    } else {
      dropIndicator.style.left = `${rect.right - tabBarRect.left}px`;
    }
    
    dropIndicator.style.top = `${rect.top - tabBarRect.top}px`;
    dropIndicator.style.display = 'block';
  }
}

function handleDragLeave(e) {
  const tab = e.target.closest('.tab');
  if (tab) {
    tab.classList.remove('drag-over');
  }
}

function handleDrop(e) {
  e.stopPropagation();
  e.preventDefault();
  
  const tab = e.target.closest('.tab');
  if (!draggedTab || !tab || tab === draggedTab) {
    return;
  }
  
  // Determine drop position
  const mouseX = e.clientX;
  const rect = tab.getBoundingClientRect();
  const tabCenterX = rect.left + rect.width / 2;
  const dropAfter = mouseX > tabCenterX;
  
  // Get indices
  const tabElements = Array.from(document.querySelectorAll('.tab'));
  const fromIndex = tabElements.indexOf(draggedTab);
  let toIndex = tabElements.indexOf(tab);
  
  if (dropAfter) {
    toIndex++;
  }
  
  // Update DOM
  const tabBar = document.getElementById('tab-bar');
  const plusButton = tabBar.querySelector('.plus-button');
  tabBar.innerHTML = '';
  
  // Reorder tab elements
  const reorderedElements = [...tabElements];
  reorderedElements.splice(fromIndex, 1);
  reorderedElements.splice(toIndex, 0, draggedTab);
  reorderedElements.forEach(tab => tabBar.appendChild(tab));
  tabBar.appendChild(plusButton);
  
  // Update tabs array order
  const newTabs = [];
  reorderedElements.forEach(tabElement => {
    const tabId = tabElement.dataset.tabId;
    const originalTab = tabs.find(t => t.id === tabId);
    if (originalTab) {
      newTabs.push(originalTab);
    }
  });
  tabs = newTabs;
  
  // Clean up
  tab.classList.remove('drag-over');
  if (dropIndicator) {
    dropIndicator.style.display = 'none';
  }
}

function updateTabAudioState(tabId, isPlaying) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  tab.isAudioPlaying = isPlaying;
  
  const mediaIndicator = tab.button.querySelector('.tab-media-indicator');
  const favicon = tab.button.querySelector('.tab-favicon');
  const volumeIcon = mediaIndicator.querySelector('.volume-icon');
  
  if (isPlaying || tab.isMuted) {
    mediaIndicator.classList.remove('hidden');
    favicon.classList.add('hidden');
    
    // Update volume icon based on muted state
    if (tab.isMuted) {
      volumeIcon.innerHTML = `
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <line x1="22" y1="2" x2="16" y2="8"></line>
        <line x1="16" y1="2" x2="22" y2="8"></line>
      `;
    } else {
      volumeIcon.innerHTML = `
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <path class="volume-waves" d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
      `;
    }
  } else {
    mediaIndicator.classList.add('hidden');
    if (favicon.src) {
      favicon.classList.remove('hidden');
    }
  }
}

function toggleMute(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  tab.isMuted = !tab.isMuted;
  tab.webview.setAudioMuted(tab.isMuted);
  updateTabAudioState(tabId, tab.isAudioPlaying);
}

function activateTab(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  tabs.forEach(t => {
    t.webview.classList.remove('active');
    t.button.classList.remove('active');
  });

  tab.webview.classList.add('active');
  tab.button.classList.add('active');
  activeTab = tabId;

  // Update window title to match active tab
  document.title = tab.title || 'New Tab';

  if (tab.isReady) {
    try {
      const currentUrl = tab.webview.getURL();
      if (currentUrl) {
        document.getElementById('url-bar').value = currentUrl;
        updateBookmarkIcon();
      }
    } catch (e) {
      console.warn('Could not get URL for tab:', e);
    }
    tab.webview.focus();
  }
}

async function toggleCookieManager() {
  const cookieManager = document.getElementById('cookie-manager');
  const bookmarksSection = document.getElementById('bookmarks-section');
  const backdrop = document.getElementById('backdrop');
  
  if (!cookieManagerOpen) {
    await updateCookieList();
  }
  
  if (bookmarksSection.classList.contains('open')) {
    bookmarksSection.classList.remove('open');
  }

  cookieManager.classList.toggle('open');
  backdrop.classList.toggle('active');
  cookieManagerOpen = !cookieManagerOpen;
}

async function updateCookieList() {
  const webview = getActiveWebview();
  if (!webview) return;
  
  const url = webview.getURL();
  const cookies = await window.electronAPI.getAllCookies(url);
  
  // Group cookies by domain
  const cookiesByDomain = cookies.reduce((acc, cookie) => {
    if (!acc[cookie.domain]) {
      acc[cookie.domain] = [];
    }
    acc[cookie.domain].push(cookie);
    return acc;
  }, {});

  // Get or create header elements
  const cookieManager = document.getElementById('cookie-manager');
  
  // Clear existing header content
  const existingHeader = cookieManager.querySelector('.cookie-header-content');
  if (existingHeader) {
    existingHeader.remove();
  }
  
  // Clear existing filter
  const existingFilter = cookieManager.querySelector('.cookie-filter');
  if (existingFilter) {
    existingFilter.remove();
  }

  // Create header content
  const headerContent = document.createElement('div');
  headerContent.className = 'cookie-header-content p-4 border-b';
  
  const totalDomains = Object.keys(cookiesByDomain).length;
  const totalCookies = cookies.length;
  
  headerContent.innerHTML = `
    <h2 class="text-lg font-medium">Saved Cookies</h2>
    <div class="text-sm text-slate-500 mt-1">
      Browser currently stores ${totalCookies} cookie entries from ${totalDomains} domains.
    </div>
  `;

  // Add filter input
  const filterContainer = document.createElement('div');
  filterContainer.className = 'cookie-filter p-4 border-b';
  filterContainer.innerHTML = `
    <input 
      type="text" 
      placeholder="Filter by domain"
      class="w-full p-2 rounded-lg bg-slate-100 border border-slate-200"
    >
  `;

  // Insert header and filter at the top
  const firstChild = cookieManager.firstChild;
  cookieManager.insertBefore(filterContainer, firstChild);
  cookieManager.insertBefore(headerContent, filterContainer);

  // Setup filter functionality
  const filterInput = filterContainer.querySelector('input');
  filterInput.onkeyup = (e) => filterCookies(e.target.value);

  // Clear and update cookie list
  const container = document.getElementById('cookie-list');
  container.innerHTML = Object.entries(cookiesByDomain).map(([domain, domainCookies]) => `
    <div class="cookie-domain-group mb-4 px-4" data-domain="${domain}">
      <div class="flex items-center gap-2 mb-2">
        <img src="${getFaviconFromDomain(domain)}" 
             class="w-4 h-4" 
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22><circle cx=%2212%22 cy=%2212%22 r=%2210%22 fill=%22%23ddd%22/></svg>'"
             alt="${domain} favicon">
        <div class="font-medium flex-1">${domain}</div>
        <div class="text-sm text-slate-500">${domainCookies.length}</div>
      </div>
      <div class="pl-6 space-y-2">
        ${domainCookies.map(cookie => `
          <div class="cookie-item flex items-center gap-2 p-2 rounded-lg hover:bg-slate-100 group">
            <div class="flex-1">
              <div class="font-medium text-sm">${cookie.name}</div>
              <div class="text-xs text-slate-500">
                Expires: ${cookie.expirationDate ? new Date(cookie.expirationDate * 1000).toLocaleDateString() : 'Session'} |
                Secure: ${cookie.secure ? 'Yes' : 'No'} |
                HttpOnly: ${cookie.httpOnly ? 'Yes' : 'No'}
              </div>
            </div>
            <button 
              onclick="removeCookie('${cookie.name}', '${domain}')"
              class="delete-cookie opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 rounded transition-opacity"
              title="Delete cookie">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-red-500">
                <path d="M3 6h18"></path>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
              </svg>
            </button>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function getFaviconFromDomain(domain) {
  const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
  return `https://${cleanDomain}/favicon.ico`;
}

function filterCookies(searchTerm) {
  const groups = document.querySelectorAll('.cookie-domain-group');
  searchTerm = searchTerm.toLowerCase();
  
  groups.forEach(group => {
    const domain = group.dataset.domain.toLowerCase();
    if (domain.includes(searchTerm)) {
      group.style.display = 'block';
    } else {
      group.style.display = 'none';
    }
  });
}

function toggleMenu() {
  const dropdown = document.getElementById('menu-dropdown');
  menuOpen = !menuOpen;
  
  if (menuOpen) {
    dropdown.classList.remove('hidden');
    // Close menu when clicking outside
    document.addEventListener('click', closeMenuOnClickOutside);
  } else {
    dropdown.classList.add('hidden');
    document.removeEventListener('click', closeMenuOnClickOutside);
  }
}

function closeMenuOnClickOutside(event) {
  const menuButton = document.getElementById('menu-button');
  const dropdown = document.getElementById('menu-dropdown');
  
  if (!menuButton.contains(event.target) && !dropdown.contains(event.target)) {
    dropdown.classList.add('hidden');
    menuOpen = false;
    document.removeEventListener('click', closeMenuOnClickOutside);
  }
}


async function removeCookie(name, domain) {
  const webview = getActiveWebview();
  if (!webview) return;
  
  const url = `https://${domain}`;
  await window.electronAPI.removeCookie({ url, name });
  await updateCookieList();
}

async function removeAllCookies() {
  if (confirm('Are you sure you want to remove all cookies? This will sign you out of most websites.')) {
    await window.electronAPI.removeAllCookies();
    await updateCookieList();
  }
}

async function setCookieRules(rules) {
  await window.electronAPI.setCookieRules(rules);
}

// Add event listener to update cookies when page loads
function setupCookieListeners(webview) {
  webview.addEventListener('did-finish-load', () => {
    if (cookieManagerOpen) {
      updateCookieList();
    }
  });
}

function setupWebviewContainer() {
  const webviewsContainer = document.getElementById('webviews');
  webviewsContainer.addEventListener('click', (e) => {
    const activeWebview = getActiveWebview();
    if (activeWebview && e.target === webviewsContainer) {
      activeWebview.focus();
    }
  });
}

// Toggle history panel
function toggleHistory() {
  const historyPanel = document.getElementById('history-panel');
  const backdrop = document.getElementById('backdrop');
  const bookmarksSection = document.getElementById('bookmarks-section');
  const cookieManager = document.getElementById('cookie-manager');
  
  // Close other panels if open
  if (bookmarksSection.classList.contains('open')) {
    bookmarksSection.classList.remove('open');
  }
  if (cookieManager.classList.contains('open')) {
    cookieManager.classList.remove('open');
  }
  
  historyPanel.classList.toggle('translate-x-0');
  backdrop.classList.toggle('active');
  historyPanelOpen = !historyPanelOpen;
  
  if (historyPanelOpen) {
    loadHistory();
  }
}

// Add history entry
async function addHistoryEntry(url, title) {
  const entry = {
    url,
    title,
    timestamp: new Date().toISOString(),
  };
  await window.electronAPI.addHistoryEntry(entry);
}

// Load and render history
async function loadHistory(searchQuery = '') {
  const entries = searchQuery ? 
    await window.electronAPI.searchHistory(searchQuery) :
    await window.electronAPI.getHistory();
  
  const container = document.getElementById('history-entries');
  
  // Group entries by date
  const groupedEntries = groupEntriesByDate(entries);
  
  container.innerHTML = Object.entries(groupedEntries).map(([date, entries]) => `
    <div class="mb-6">
      <h4 class="text-sm font-medium text-slate-500 mb-2">${date}</h4>
      ${entries.map(entry => `
        <div class="history-entry flex items-center gap-2 p-2 rounded-lg hover:bg-slate-100 cursor-pointer group"
             onclick="navigateToHistoryEntry('${entry.url}')"
             title="${entry.url}">
          <div class="history-icon w-6 h-6 flex items-center justify-center bg-slate-200 rounded">
            <img src="${getFaviconUrl(entry.url)}"
                 onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22><path fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22 d=%22M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z%22/></svg>'"
                 class="w-4 h-4"
                 alt="${entry.title}">
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm truncate">${entry.title}</div>
            <div class="text-xs text-slate-500 truncate">${entry.url}</div>
          </div>
          <button 
            onclick="event.stopPropagation(); deleteHistoryEntry('${entry.url}')"
            class="delete-history ml-2 opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 rounded transition-opacity"
            title="Delete from history">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-red-500">
              <path d="M3 6h18"></path>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
            </svg>
          </button>
        </div>
      `).join('')}
    </div>
  `).join('');
}

// Group history entries by date
function groupEntriesByDate(entries) {
  const groups = {};
  const today = new Date().toLocaleDateString();
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString();
  
  entries.forEach(entry => {
    const date = new Date(entry.timestamp);
    const dateStr = date.toLocaleDateString();
    
    let groupKey;
    if (dateStr === today) {
      groupKey = 'Today';
    } else if (dateStr === yesterday) {
      groupKey = 'Yesterday';
    } else {
      groupKey = dateStr;
    }
    
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(entry);
  });
  
  return groups;
}

// Navigate to history entry
async function navigateToHistoryEntry(url) {
  const webview = getActiveWebview();
  if (webview) {
    await window.electronAPI.navigateToUrl(activeTab, url);
    webview.loadURL(url);
    toggleHistory();
  }
}

// Delete history entry
async function deleteHistoryEntry(url) {
  await window.electronAPI.deleteHistoryEntry(url);
  loadHistory();
}

// Clear all history
async function clearHistory() {
  if (confirm('Are you sure you want to clear all browsing history?')) {
    await window.electronAPI.clearHistory();
    loadHistory();
  }
}

async function closeTab(tabId) {
  const index = tabs.findIndex(tab => tab.id === tabId);
  if (index === -1) return;

  const tab = tabs[index];
  await window.electronAPI.closeTab(tabId);
  
  // Remove DOM elements
  tab.webview.remove();
  tab.button.remove();
  
  // Remove from tabs array
  tabs.splice(index, 1);

  // Handle tab activation after closing
  if (tabs.length === 0) {
    createTab();
  } else if (activeTab === tabId) {
    // Activate the next tab, or the previous if we closed the last tab
    const newIndex = index === tabs.length ? index - 1 : index;
    activateTab(tabs[newIndex].id);
  }
}

function getActiveWebview() {
  const tab = tabs.find(tab => tab.id === activeTab);
  return tab && tab.isReady ? tab.webview : null;
}

async function navigateBack() {
  const webview = getActiveWebview();
  if (webview && webview.canGoBack()) {
    await window.electronAPI.navigateBack(activeTab);
    webview.goBack();
  }
}

async function navigateForward() {
  const webview = getActiveWebview();
  if (webview && webview.canGoForward()) {
    await window.electronAPI.navigateForward(activeTab);
    webview.goForward();
  }
}

async function refresh() {
  const webview = getActiveWebview();
  if (webview) {
    await window.electronAPI.refresh(activeTab);
    webview.reload();
  }
}

function handleUrl(event) {
  if (event.key === 'Enter') {
    navigateToUrl(event.target.value);
  }
}

async function navigateToUrl(input) {
  const webview = getActiveWebview();
  if (webview) {
    try {
      const processedUrl = await window.electronAPI.navigateToUrl(activeTab, input);
      webview.loadURL(processedUrl);
    } catch (err) {
      console.error('Failed to load URL:', err);
      // If https fails, try http
      if (processedUrl.startsWith('https://')) {
        const httpUrl = processedUrl.replace('https://', 'http://');
        webview.loadURL(httpUrl);
      }
    }
  }
}

function handleBackdropClick(event) {
  const historyPanel = document.getElementById('history-panel');
  const bookmarksSection = document.getElementById('bookmarks-section');
  const cookieManager = document.getElementById('cookie-manager');
  const backdrop = document.getElementById('backdrop');
  const dropdown = document.getElementById('menu-dropdown');
  
  // Close the menu dropdown if it's open
  if (menuOpen) {
    dropdown.classList.add('hidden');
    menuOpen = false;
  }
  
  // Check which panel is open and close it
  if (historyPanel.classList.contains('translate-x-0')) {
    toggleHistory();
  }
  if (bookmarksSection.classList.contains('open')) {
    toggleBookmarks();
  }
  if (cookieManager.classList.contains('open')) {
    toggleCookieManager();
  }
}



function toggleBookmarks() {
  const bookmarksSection = document.getElementById('bookmarks-section');
  const cookieManager = document.getElementById('cookie-manager');
  const backdrop = document.getElementById('backdrop');
  
  // If cookie manager is open, close it first
  if (cookieManager.classList.contains('open')) {
    cookieManager.classList.remove('open');
  }
  
  bookmarksSection.classList.toggle('open');
  backdrop.classList.toggle('active');
}

function isCurrentUrlBookmarked() {
  const webview = getActiveWebview();
  if (!webview) return false;
  const currentUrl = webview.getURL();
  return bookmarks.some(b => b.url === currentUrl);
}

// Add this function to update bookmark icon state
function updateBookmarkIcon() {
  const bookmarkButton = document.querySelector('.bookmark-button');
  if (!bookmarkButton) return;
  
  if (isCurrentUrlBookmarked()) {
    bookmarkButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="#3B82F6" viewBox="0 0 24 24" stroke="#3B82F6" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>`;
  } else {
    bookmarkButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>`;
  }
}

async function addBookmark() {
  const webview = getActiveWebview();
  if (webview) {
    const url = webview.getURL();
    const title = webview.getTitle();
    
    if (!bookmarks.some(b => b.url === url)) {
      await window.electronAPI.addBookmark(url, title);
      bookmarks = await window.electronAPI.getBookmarks();
      renderBookmarks();
    } else {
      // If already bookmarked, remove it
      await window.electronAPI.deleteBookmark(url);
      bookmarks = await window.electronAPI.getBookmarks();
      renderBookmarks();
    }
    updateBookmarkIcon();
  }
}

async function deleteBookmark(event, url) {
  event.stopPropagation(); // Prevent navigation when clicking delete
  await window.electronAPI.deleteBookmark(url);
  bookmarks = await window.electronAPI.getBookmarks();
  renderBookmarks();
}

function renderBookmarks() {
  const container = document.getElementById('bookmarks');
  container.innerHTML = bookmarks.map(bookmark => `
    <div class="bookmark flex items-center gap-2 p-2 rounded-lg hover:bg-slate-100 cursor-pointer group" 
         onclick="navigateToBookmark('${bookmark.url}')" 
         title="${bookmark.url}">
      <div class="bookmark-icon w-6 h-6 flex items-center justify-center bg-slate-200 rounded">
        <img src="${getFaviconUrl(bookmark.url)}" 
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22><path d=%22M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z%22/></svg>'"
             class="w-4 h-4"
             alt="${bookmark.title}">
      </div>
      <span class="bookmark-title text-sm truncate">${bookmark.title}</span>
      <button 
        onclick="deleteBookmark(event, '${bookmark.url}')"
        class="delete-bookmark ml-auto opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 rounded transition-opacity"
        title="Delete bookmark">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-red-500">
          <path d="M3 6h18"></path>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    </div>
  `).join('');
}

function getFaviconUrl(url) {
  try {
    const urlObj = new URL(url);
    // Return the favicon URL with the same protocol as the original URL
    return `${urlObj.protocol}//${urlObj.hostname}/favicon.ico`;
  } catch (e) {
    // Return a fallback data URL for invalid URLs
    return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
  }
}

async function navigateToBookmark(url) {
  const webview = getActiveWebview();
  if (webview) {
    await window.electronAPI.navigateToUrl(activeTab, url);
    webview.loadURL(url);
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  loadBookmarks();
  createTab();
  setupWebviewContainer;
  
  const urlBar = document.getElementById('url-bar');
  urlBar.addEventListener('click', () => {
    urlBar.select();
  });

  const historySearch = document.getElementById('history-search');
  historySearch.addEventListener('input', (e) => {
    loadHistory(e.target.value);
  });
  
  urlBar.form?.addEventListener('submit', (e) => {
    e.preventDefault();
    navigateToUrl(urlBar.value);
  });

  updateBookmarkIcon();
});

// Handle window resize
window.addEventListener('resize', () => {
  const webviews = document.getElementById('webviews');
  webviews.style.height = `${window.innerHeight - 90}px`;
});