// Content script to handle scroll position capture and restoration

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getScrollPosition') {
        // Get current scroll position
        // Wait for document to be loaded if necessary
        if (document.readyState === 'loading') {
            const sendScrollPositionOnReady = () => {
                const scrollPosition = {
                    x: window.scrollX,
                    y: window.scrollY
                };
                sendResponse(scrollPosition);
            };
            document.addEventListener('DOMContentLoaded', sendScrollPositionOnReady, { once: true });
            return true; // Required for async response
        } else {
            const scrollPosition = {
                x: window.scrollX,
                y: window.scrollY
            };
            sendResponse(scrollPosition);
            return true; // Keep message channel open
        }
    } else if (message.action === 'setScrollPosition') {
        // Set scroll position
        if (message.position) {
            // Wait for document to be ready before scrolling
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    window.scrollTo(message.position.x, message.position.y);
                    sendResponse({ success: true });
                }, { once: true });
                return true; // Required for async response
            } else {
                window.scrollTo(message.position.x, message.position.y);
                sendResponse({ success: true });
                return true; // Keep message channel open
            }
        } else {
            sendResponse({ success: false, error: 'No position provided' });
            return true; // Keep message channel open
        }
    }
});
