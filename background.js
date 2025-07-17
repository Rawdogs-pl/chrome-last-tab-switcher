// Keys for storing state in storage
const STORAGE_KEYS = {
    lastTabId: 'lastTabId',
    currentTabId: 'currentTabId'
};

// Helper function to retrieve state from storage
async function getTabState() {
    try {
        const result = await chrome.storage.session.get([STORAGE_KEYS.lastTabId, STORAGE_KEYS.currentTabId]);
        return {
            lastTabId: result[STORAGE_KEYS.lastTabId] || null,
            currentTabId: result[STORAGE_KEYS.currentTabId] || null
        };
    } catch (error) {
        console.error('Error getting tab state:', error);
        return { lastTabId: null, currentTabId: null };
    }
}

// Helper function to save state to storage
async function saveTabState(lastTabId, currentTabId) {
    try {
        await chrome.storage.session.set({
            [STORAGE_KEYS.lastTabId]: lastTabId,
            [STORAGE_KEYS.currentTabId]: currentTabId
        });
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

// Initialization at service worker startup
async function initializeExtension() {
    try {
        // Pobierz aktualnie aktywną kartę
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0) {
            const state = await getTabState();
            // Jeśli mamy zapisany currentTabId, ale jest inny niż aktualny, zapisz go jako lastTabId
            if (state.currentTabId && state.currentTabId !== tabs[0].id) {
                // Sprawdź czy poprzednia karta nadal istnieje
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

// Zapamiętuj aktywne karty
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        const state = await getTabState();
        
        // Jeśli zmieniliśmy kartę, zapisz poprzednią jako ostatnią
        if (state.currentTabId && activeInfo.tabId !== state.currentTabId) {
            await saveTabState(state.currentTabId, activeInfo.tabId);
        } else {
            await saveTabState(state.lastTabId, activeInfo.tabId);
        }
    } catch (error) {
        console.error('Error handling tab activation:', error);
    }
});

// Obsługa usuwania kart
chrome.tabs.onRemoved.addListener(async (tabId) => {
    try {
        const state = await getTabState();
        
        // Jeśli usunięto ostatnią zapamiętaną kartę, wyczyść ją
        if (state.lastTabId === tabId) {
            await saveTabState(null, state.currentTabId);
        }
        
        // Jeśli usunięto aktualną kartę, znajdź nową aktywną
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

// Reakcja na skrót klawiszowy
chrome.commands.onCommand.addListener(async (command) => {
    if (command === "switch-last-tab") {
        try {
            const state = await getTabState();
            
            if (!state.lastTabId) {
                console.log('No last tab ID available');
                return;
            }
            
            // Sprawdź czy ostatnia karta nadal istnieje
            const isValid = await isTabValid(state.lastTabId);
            if (!isValid) {
                console.log('Last tab no longer exists, clearing from storage');
                await saveTabState(null, state.currentTabId);
                return;
            }
            
            // Przełącz na ostatnią kartę
            await chrome.tabs.update(state.lastTabId, { active: true });
            
        } catch (error) {
            console.error('Error switching to last tab:', error);
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
        <p>✅ Rekomendowany skrót to: <strong>Ctrl + E</strong> (Windows) lub <strong>⌘ Cmd + E</strong> (Mac) - musisz go ustawić na stronie <code>chrome://extensions/shortcuts</code> (skopiuj ten link i wklej w pasek adresu przeglądarki).</p>
        <p>Dziękujemy za korzystanie!</p>
      </body>
      </html>
    `;

        chrome.tabs.create({
            url: "data:text/html;charset=utf-8," + encodeURIComponent(instructionHtml)
        });
    }
    
    // Zainicjalizuj rozszerzenie po instalacji lub aktualizacji
    initializeExtension();
});

// Zainicjalizuj rozszerzenie przy starcie service worker
initializeExtension();
