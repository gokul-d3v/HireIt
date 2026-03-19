export async function copyToClipboard(text: string): Promise<boolean> {
    // If we're in a secure context or localhost, use the modern API
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.error('Async: Could not copy text: ', err);
            // Fall through to legacy method
        }
    }

    // Fallback for non-secure contexts (HTTP) using the legacy textarea method
    try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        
        // Ensure the textarea is not visible but still part of the DOM
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        
        textArea.focus();
        textArea.select();
        
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (successful) return true;
        
        // Final fallback: use a prompt if all else fails
        window.prompt("Copy this link:", text);
        return true;
    } catch (err) {
        console.error('Fallback: Unable to copy', err);
        return false;
    }
}
