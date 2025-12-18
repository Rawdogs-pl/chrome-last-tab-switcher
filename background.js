// Keys for storing state in storage
const STORAGE_KEYS = {
    lastTabId: 'lastTabId',
    currentTabId: 'currentTabId',
    lastTabScrollPosition: 'lastTabScrollPosition'
};

// Helper function to retrieve state from storage
async function getTabState() {
    try {
        const result = await chrome.storage.session.get([
            STORAGE_KEYS.lastTabId,
            STORAGE_KEYS.currentTabId,
            STORAGE_KEYS.lastTabScrollPosition
        ]);
        return {
            lastTabId: result[STORAGE_KEYS.lastTabId] || null,
            currentTabId: result[STORAGE_KEYS.currentTabId] || null,
            lastTabScrollPosition: result[STORAGE_KEYS.lastTabScrollPosition] || null
        };
    } catch (error) {
        console.error('Error getting tab state:', error);
        return { lastTabId: null, currentTabId: null, lastTabScrollPosition: null };
    }
}

// Helper function to save state to storage
async function saveTabState(lastTabId, currentTabId, lastTabScrollPosition = undefined) {
    try {
        const data = {
            [STORAGE_KEYS.lastTabId]: lastTabId,
            [STORAGE_KEYS.currentTabId]: currentTabId
        };
        
        // Only update scroll position if explicitly provided
        if (lastTabScrollPosition !== undefined) {
            data[STORAGE_KEYS.lastTabScrollPosition] = lastTabScrollPosition;
        }
        
        await chrome.storage.session.set(data);
    } catch (error) {
        console.error('Error saving tab state:', error);
    }
}

// Helper function to check if a tab still exists
async function isTabValid(tabId) {
    if (!tabId) return false;
    try {
        await chrome.tabs.get(tabId);
        return true;
    } catch (error) {
        return false;
    }
}

// Helper function to get scroll position from a tab
async function getScrollPositionFromTab(tabId) {
    try {
        // Check if tab exists and is a valid web page
        const tab = await chrome.tabs.get(tabId);
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
            return null;
        }
        
        const response = await chrome.tabs.sendMessage(tabId, { action: 'getScrollPosition' });
        return response;
    } catch (error) {
        // Content script might not be injected yet or tab doesn't support it
        console.error('Error getting scroll position from tab:', error);
        return null;
    }
}

// Helper function to set scroll position in a tab
async function setScrollPositionInTab(tabId, position) {
    try {
        // Check if tab exists and is a valid web page
        const tab = await chrome.tabs.get(tabId);
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
            return false;
        }
        
        await chrome.tabs.sendMessage(tabId, { action: 'setScrollPosition', position: position });
        return true;
    } catch (error) {
        // Content script might not be injected yet or tab doesn't support it
        console.error('Error setting scroll position in tab:', error);
        return false;
    }
}

// Initialization at service worker startup
async function initializeExtension() {
    try {
        // Get currently active tab
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0) {
            const state = await getTabState();
            // If we have saved currentTabId, but it's different from actual, save it as lastTabId
            if (state.currentTabId && state.currentTabId !== tabs[0].id) {
                // Check if the previous tab still exists
                const isValid = await isTabValid(state.currentTabId);
                if (isValid) {
                    await saveTabState(state.currentTabId, tabs[0].id);
                } else {
                    await saveTabState(null, tabs[0].id);
                }
            } else {
                await saveTabState(state.lastTabId, tabs[0].id);
            }
        }
    } catch (error) {
        console.error('Error initializing extension:', error);
    }
}

// Remember active tabs
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        const state = await getTabState();
        
        // If we changed tab, save previous as last
        if (state.currentTabId && activeInfo.tabId !== state.currentTabId) {
            // Try to get scroll position from the tab we're leaving
            const scrollPosition = await getScrollPositionFromTab(state.currentTabId);
            await saveTabState(state.currentTabId, activeInfo.tabId, scrollPosition);
        } else {
            await saveTabState(state.lastTabId, activeInfo.tabId);
        }
    } catch (error) {
        console.error('Error handling tab activation:', error);
    }
});

// Handle tab removal
chrome.tabs.onRemoved.addListener(async (tabId) => {
    try {
        const state = await getTabState();
        
        // If the last remembered tab was removed, clear it
        if (state.lastTabId === tabId) {
            await saveTabState(null, state.currentTabId);
        }
        
        // If current tab was removed, find new active one
        if (state.currentTabId === tabId) {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length > 0) {
                await saveTabState(state.lastTabId, tabs[0].id);
            }
        }
    } catch (error) {
        console.error('Error handling tab removal:', error);
    }
});

// Reaction to keyboard shortcut
chrome.commands.onCommand.addListener(async (command) => {
    if (command === "switch-last-tab") {
        try {
            const state = await getTabState();
            
            if (!state.lastTabId) {
                console.log('No last tab ID available');
                return;
            }
            
            // Check if last tab still exists
            const isValid = await isTabValid(state.lastTabId);
            if (!isValid) {
                console.log('Last tab no longer exists, clearing from storage');
                await saveTabState(null, state.currentTabId);
                return;
            }
            
            // Switch to last tab
            await chrome.tabs.update(state.lastTabId, { active: true });
            
        } catch (error) {
            console.error('Error switching to last tab:', error);
        }
    } else if (command === "sync-scroll-position") {
        try {
            const state = await getTabState();
            
            if (!state.lastTabScrollPosition) {
                console.log('No scroll position available from last tab');
                return;
            }
            
            // Get current active tab
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length === 0) {
                console.log('No active tab found');
                return;
            }
            
            // Set scroll position in current tab to match last tab's scroll position
            const success = await setScrollPositionInTab(tabs[0].id, state.lastTabScrollPosition);
            if (success) {
                console.log('Scroll position synced successfully');
            } else {
                console.log('Failed to sync scroll position');
            }
            
        } catch (error) {
            console.error('Error syncing scroll position:', error);
        }
    }
});

// Otwórz stronę skrótów i instrukcję po instalacji
chrome.runtime.onInstalled.addListener(details => {
    if (details.reason === "install") {

        const instructionHtml = `
      <!DOCTYPE html>
      <html lang="pl">
      <head>
        <meta charset="UTF-8">
        <title>Last Tab Switcher</title>
        <style>
          body { font-family: sans-serif; padding: 2em; max-width: 700px; line-height: 1.6; }
          code { background: #eee; padding: 2px 4px; border-radius: 4px; }
          h2 { color: #2c3e50; }
        </style>
      </head>
      <body>
        <h2>🎉 Rozszerzenie „Last Tab Switcher” zostało zainstalowane!</h2>
        <p><strong>⚠️ WAŻNE:</strong> Musisz ustawić skróty klawiszowe ręcznie!</p>
        <p>Przejdź na stronę <code>chrome://extensions/shortcuts</code> (skopiuj i wklej w pasek adresu) i ustaw:</p>
        <ul>
          <li><strong>Ctrl + E</strong> (Windows/Linux) lub <strong>⌘ Cmd + E</strong> (Mac) - przełącz na ostatnio aktywną kartę</li>
          <li><strong>Ctrl + Shift + E</strong> (Windows/Linux) lub <strong>⌘ Cmd + Shift + E</strong> (Mac) - zescrolluj do pozycji z ostatniej karty</li>
        </ul>
        <p>💡 Możesz wybrać inne kombinacje klawiszy, jeśli te są już zajęte.</p>
        <p>Dziękujemy za korzystanie!</p>
      </body>
      </html>
    `;

        chrome.tabs.create({
            url: "data:text/html;charset=utf-8," + encodeURIComponent(instructionHtml)
        });
    }
    
    // Initialize the extension after installation or update
    initializeExtension();
});

// Initialize the extension at service worker startup
initializeExtension();
