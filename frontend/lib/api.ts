const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export async function apiRequest(endpoint: string, method: string, body?: unknown) {
    const token = localStorage.getItem("token");

    const headers: HeadersInit = {
        "Content-Type": "application/json",
    };

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
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
            throw new Error(data?.error || data?.message || `Request failed with status ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error("API Request Error:", error);
        throw error;
    }
}
