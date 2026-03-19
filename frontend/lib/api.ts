const DEFAULT_API_PORT = process.env.NEXT_PUBLIC_API_PORT || "8080";

function trimTrailingSlash(value: string) {
    return value.replace(/\/+$/, "");
}

export function getApiUrl() {
    const configuredUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
    if (configuredUrl) {
        return trimTrailingSlash(configuredUrl);
    }

    if (typeof window !== "undefined") {
        const { hostname, protocol } = window.location;
        return `${protocol}//${hostname}:${DEFAULT_API_PORT}`;
    }

    return `http://localhost:${DEFAULT_API_PORT}`;
}

export const API_URL = trimTrailingSlash(process.env.NEXT_PUBLIC_API_URL?.trim() || `http://localhost:${DEFAULT_API_PORT}`);

export async function apiRequest(endpoint: string, method: string, body?: unknown) {
    const token = localStorage.getItem("token");
    const apiUrl = getApiUrl();

    const headers: HeadersInit = {
        "Content-Type": "application/json",
    };

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(`${apiUrl}${endpoint}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            cache: "no-store",
        });

        // Check if response has content
        const contentType = response.headers.get("content-type");
        const text = await response.text();

        // Only try to parse JSON if content-type is JSON and text is not empty
        let data;
        if (contentType?.includes("application/json") && text) {
            try {
                data = JSON.parse(text);
            } catch {
                console.error("Failed to parse JSON:", text);
                throw new Error("Invalid JSON response from server");
            }
        } else if (text) {
            // Non-JSON response (might be HTML error page)
            console.error("Non-JSON response:", text);
            throw new Error("Server returned non-JSON response");
        } else {
            // Empty response
            data = {};
        }

        if (!response.ok) {
            if (response.status === 401 && endpoint !== "/login" && endpoint !== "/signup") {
                // Token invalid or expired
                localStorage.removeItem("token");
                localStorage.removeItem("role");
                if (window.location.pathname !== "/login") {
                    window.location.href = "/login";
                }
                throw new Error("Session expired. Please login again.");
            }
            throw new Error(data?.error || data?.message || `Request failed with status ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error("API Request Error:", error);

        if (error instanceof TypeError) {
            throw new Error(`Could not reach the backend at ${apiUrl}. Check NEXT_PUBLIC_API_URL, your backend server, and local CORS settings.`);
        }

        throw error;
    }
}
