let lastTabId = null;
let currentTabId = null;

// Zapamiętuj aktywne karty
chrome.tabs.onActivated.addListener(activeInfo => {
    if (currentTabId && activeInfo.tabId !== currentTabId) {
        lastTabId = currentTabId;
    }
    currentTabId = activeInfo.tabId;
});

// Reakcja na skrót klawiszowy
chrome.commands.onCommand.addListener(command => {
    if (command === "switch-last-tab" && lastTabId !== null) {
        chrome.tabs.get(lastTabId, tab => {
            if (chrome.runtime.lastError || !tab) return;
            chrome.tabs.update(lastTabId, { active: true });
        });
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
});
