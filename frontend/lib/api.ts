import toast from "react-hot-toast";

const DEFAULT_API_PORT = process.env.NEXT_PUBLIC_API_PORT || "8080";

function trimTrailingSlash(value: string) {
    return value.replace(/\/+$/, "");
}

function trimTrailingApi(value: string) {
    return value.replace(/\/api$/, "");
}

function buildBaseUrl() {
    const raw = process.env.NEXT_PUBLIC_API_URL?.trim() || `http://localhost:${DEFAULT_API_PORT}`;
    return trimTrailingApi(trimTrailingSlash(raw));
}

export function getApiUrl() {
    return buildBaseUrl();
}

export const API_URL = buildBaseUrl();

async function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function apiRequest(endpoint: string, method: string, body?: unknown, retries = 2) {
    const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
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

        const contentType = response.headers.get("content-type");
        const text = await response.text();

        let data: any;
        if (contentType?.includes("application/json") && text) {
            try {
                data = JSON.parse(text);
            } catch {
                console.error("Failed to parse JSON:", text);
                throw new Error("Invalid JSON response from server");
            }
        } else {
            data = text ? { message: text } : {};
        }

        if (!response.ok) {
            // Handle 401 specifically
            if (response.status === 401 && endpoint !== "/login" && endpoint !== "/signup") {
                if (typeof window !== 'undefined') {
                    localStorage.removeItem("token");
                    localStorage.removeItem("role");
                    if (window.location.pathname !== "/login") {
                        window.location.href = "/login";
                    }
                }
                throw new Error("Session expired. Please login again.");
            }

            // Retry for 5xx errors if method is GET
            if (response.status >= 500 && method === "GET" && retries > 0) {
                console.warn(`Server error ${response.status}. Retrying... (${retries} left)`);
                await delay(1000 * (3 - retries));
                return apiRequest(endpoint, method, body, retries - 1);
            }

            const errorMsg = data?.error || data?.message || `Request failed with status ${response.status}`;
            toast.error(errorMsg, { id: endpoint }); // Use endpoint as id to prevent duplicate toasts
            throw new Error(errorMsg);
        }

        // Return the full data to maintain compatibility with existing logic
        return data;
    } catch (error) {
        console.error("API Request Error:", error);

        if (error instanceof TypeError && (error.message === "Failed to fetch" || error.message.includes("NetworkError"))) {
            if (method === "GET" && retries > 0) {
                console.warn(`Network error. Retrying... (${retries} left)`);
                await delay(1500 * (3 - retries));
                return apiRequest(endpoint, method, body, retries - 1);
            }
            const msg = "Network error. Please check your internet connection.";
            toast.error(msg, { id: "network-error" });
            throw new Error(msg);
        }

        throw error;
    }
}
