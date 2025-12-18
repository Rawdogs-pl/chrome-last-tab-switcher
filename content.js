// Content script to handle scroll position capture and restoration

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getScrollPosition') {
        // Get current scroll position
        const scrollPosition = {
            x: window.scrollX,
            y: window.scrollY
        };
        sendResponse(scrollPosition);
    } else if (message.action === 'setScrollPosition') {
        // Set scroll position
        if (message.position) {
            window.scrollTo(message.position.x, message.position.y);
            sendResponse({ success: true });
        } else {
            sendResponse({ success: false, error: 'No position provided' });
        }
    }
    return true; // Required for async response
});
