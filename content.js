// Content script to handle scroll position capture and restoration

// Helper function to get current scroll position
function getScrollPosition() {
    return {
        x: window.scrollX,
        y: window.scrollY
    };
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getScrollPosition') {
        // Get current scroll position
        // Wait for document to be loaded if necessary
        if (document.readyState === 'loading') {
            const sendScrollPositionOnReady = () => {
                const scrollPosition = getScrollPosition();
                sendResponse(scrollPosition);
            };
            document.addEventListener('DOMContentLoaded', sendScrollPositionOnReady, { once: true });
            return true; // Required for async response
        } else {
            const scrollPosition = getScrollPosition();
            sendResponse(scrollPosition);
            return true; // Keep message channel open
        }
    } else if (message.action === 'setScrollPosition') {
        // Set scroll position
        if (message.position && 
            typeof message.position.x === 'number' && 
            typeof message.position.y === 'number' &&
            !isNaN(message.position.x) &&
            !isNaN(message.position.y)) {
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
            sendResponse({ success: false, error: 'Invalid or missing position data' });
            return true; // Keep message channel open
        }
    }
});
