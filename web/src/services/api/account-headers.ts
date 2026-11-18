export function expectedAccountHeaders(requestUrl: string, expectedUserId?: string): Record<string, string> {
    if (!expectedUserId || typeof window === "undefined") return {};
    try {
        const url = new URL(requestUrl, window.location.origin);
        if (url.origin === window.location.origin && /^\/api\/v1(?:\/|$)/.test(url.pathname)) {
            return { "X-Sundas-User": expectedUserId };
        }
    } catch { /* 无效地址会由请求处理报告 */ }
    return {};
}
