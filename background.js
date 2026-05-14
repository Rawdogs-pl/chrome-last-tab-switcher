// Keys for storing state in storage
const STORAGE_KEYS = {
    secondToLastTabId: 'secondToLastTabId',
    lastTabId: 'lastTabId',
    currentTabId: 'currentTabId',
    lastTabScrollPosition: 'lastTabScrollPosition'
};

// Helper function to retrieve state from storage
async function getTabState() {
    try {
        const result = await chrome.storage.session.get([
            STORAGE_KEYS.secondToLastTabId,
            STORAGE_KEYS.lastTabId,
            STORAGE_KEYS.currentTabId,
            STORAGE_KEYS.lastTabScrollPosition
        ]);
        return {
            secondToLastTabId: result[STORAGE_KEYS.secondToLastTabId] || null,
            lastTabId: result[STORAGE_KEYS.lastTabId] || null,
            currentTabId: result[STORAGE_KEYS.currentTabId] || null,
            lastTabScrollPosition: result[STORAGE_KEYS.lastTabScrollPosition] || null
        };
    } catch (error) {
        console.error('Error getting tab state:', error);
        return { secondToLastTabId: null, lastTabId: null, currentTabId: null, lastTabScrollPosition: null };
    }
}

// Helper function to save state to storage
async function saveTabState(secondToLastTabId, lastTabId, currentTabId, lastTabScrollPosition = null) {
    try {
        const data = {
            [STORAGE_KEYS.secondToLastTabId]: secondToLastTabId,
            [STORAGE_KEYS.lastTabId]: lastTabId,
            [STORAGE_KEYS.currentTabId]: currentTabId
        };

        if (lastTabScrollPosition !== null &&
            typeof lastTabScrollPosition === 'object' &&
            typeof lastTabScrollPosition.x === 'number' &&
            typeof lastTabScrollPosition.y === 'number') {
            data[STORAGE_KEYS.lastTabScrollPosition] = lastTabScrollPosition;
            await chrome.storage.session.set(data);
        } else {
            await chrome.storage.session.set(data);
            await chrome.storage.session.remove(STORAGE_KEYS.lastTabScrollPosition);
        }
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

// Helper function to check if URL is a valid web page that supports content scripts
function isValidWebPageUrl(url) {
    if (!url) return false;
    return !url.startsWith('chrome://') &&
           !url.startsWith('chrome-extension://') &&
           !url.startsWith('about:') &&
           !url.startsWith('data:') &&
           !url.startsWith('javascript:') &&
           !url.startsWith('vbscript:') &&
           !url.startsWith('file://');
}

// Helper function to ensure content script is injected
async function ensureContentScriptInjected(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!isValidWebPageUrl(tab.url)) {
            return false;
        }
        
        // Try to ping the content script
        try {
            await chrome.tabs.sendMessage(tabId, { action: 'ping' });
            return true; // Content script is already injected
        } catch (error) {
            // Content script not responding, try to inject it
            console.log('Content script not found, attempting injection for tab:', tabId);
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js']
            });
            
            // Verify injection with retries using exponential backoff
            const maxRetries = 3;
            const baseDelay = 50; // Start with 50ms
            
            for (let i = 0; i < maxRetries; i++) {
                await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(2, i)));
                try {
                    await chrome.tabs.sendMessage(tabId, { action: 'ping' });
                    console.log('Content script successfully injected and verified for tab:', tabId);
                    return true;
                } catch (pingError) {
                    if (i === maxRetries - 1) {
                        console.error('Content script injection verification failed after retries for tab:', tabId);
                        return false;
                    }
                }
            }
        }
    } catch (error) {
        console.error('Failed to ensure content script injection:', error);
        return false;
    }
}

// Helper function to get scroll position from a tab
async function getScrollPositionFromTab(tabId) {
    try {
        // Check if tab exists and is a valid web page
        const tab = await chrome.tabs.get(tabId);
        if (!isValidWebPageUrl(tab.url)) {
            return null;
        }

        // Ensure content script is injected
        const injected = await ensureContentScriptInjected(tabId);
        if (!injected) {
            console.log('Unable to inject content script for tab:', tabId);
            return null;
        }

        const response = await chrome.tabs.sendMessage(tabId, { action: 'getScrollPosition' });
        return response;
    } catch (error) {
        // Content script might not be injected yet or tab doesn't support it
        // This is expected behavior for certain pages or during navigation
        if (!error.message.includes('Could not establish connection') &&
            !error.message.includes('Receiving end does not exist')) {
            console.error('Error getting scroll position from tab:', error);
        }
        return null;
    }
}

// Helper function to set scroll position in a tab
async function setScrollPositionInTab(tabId, position) {
    try {
        // Check if tab exists and is a valid web page
        const tab = await chrome.tabs.get(tabId);
        if (!isValidWebPageUrl(tab.url)) {
            return false;
        }

        // Ensure content script is injected
        const injected = await ensureContentScriptInjected(tabId);
        if (!injected) {
            console.log('Unable to inject content script for tab:', tabId);
            return false;
        }

        await chrome.tabs.sendMessage(tabId, { action: 'setScrollPosition', position: position });
        return true;
    } catch (error) {
        // Content script might not be injected yet or tab doesn't support it
        // This is expected behavior for certain pages or during navigation
        if (!error.message.includes('Could not establish connection') &&
            !error.message.includes('Receiving end does not exist')) {
            console.error('Error setting scroll position in tab:', error);
        }
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
                    await saveTabState(state.lastTabId, state.currentTabId, tabs[0].id);
                } else {
                    await saveTabState(state.secondToLastTabId, state.lastTabId, tabs[0].id);
                }
            } else {
                await saveTabState(state.secondToLastTabId, state.lastTabId, tabs[0].id);
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
            await saveTabState(state.lastTabId, state.currentTabId, activeInfo.tabId, scrollPosition);
        } else {
            await saveTabState(state.secondToLastTabId, state.lastTabId, activeInfo.tabId);
        }
    } catch (error) {
        console.error('Error handling tab activation:', error);
    }
});

// Handle tab removal
chrome.tabs.onRemoved.addListener(async (tabId) => {
    try {
        const state = await getTabState();

        // If the second-to-last remembered tab was removed, clear it
        if (state.secondToLastTabId === tabId) {
            await saveTabState(null, state.lastTabId, state.currentTabId);
            return;
        }

        // If the last remembered tab was removed, promote second-to-last
        if (state.lastTabId === tabId) {
            await saveTabState(null, state.secondToLastTabId, state.currentTabId);
            return;
        }

        // If current tab was removed, find new active one
        if (state.currentTabId === tabId) {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length > 0) {
                await saveTabState(state.secondToLastTabId, state.lastTabId, tabs[0].id);
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
                await saveTabState(null, state.secondToLastTabId, state.currentTabId);
                return;
            }

            // Switch to last tab
            await chrome.tabs.update(state.lastTabId, { active: true });

        } catch (error) {
            console.error('Error switching to last tab:', error);
        }
    } else if (command === "switch-second-to-last-tab") {
        try {
            const state = await getTabState();

            if (!state.secondToLastTabId) {
                console.log('No second-to-last tab ID available');
                return;
            }

            // Check if second-to-last tab still exists
            const isValid = await isTabValid(state.secondToLastTabId);
            if (!isValid) {
                console.log('Second-to-last tab no longer exists, clearing from storage');
                await saveTabState(null, state.lastTabId, state.currentTabId);
                return;
            }

            // Switch to second-to-last tab
            await chrome.tabs.update(state.secondToLastTabId, { active: true });

        } catch (error) {
            console.error('Error switching to second-to-last tab:', error);
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
          <li><strong>Alt + Q</strong> (Windows/Linux) lub <strong>⌥ Option + Q</strong> (Mac) - przełącz na przedostatnią aktywną kartę</li>
          <li><strong>Ctrl + M</strong> (Windows/Linux) lub <strong>⌘ Cmd + M</strong> (Mac) - zescrolluj do pozycji z ostatniej karty</li>
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
