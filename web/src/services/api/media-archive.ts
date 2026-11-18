import { apiRequest } from "./client";

export type MediaArchiveState = { state: "external" | "waiting" | "saving" | "failed" | "completed" | "cancelled"; error?: string; enabled: boolean };
export function archiveObjectKey(value?: string) {
    if (!value) return undefined;
    try {
        const url = new URL(value, window.location.origin);
        if (url.origin !== window.location.origin) return undefined;
        const key = decodeURIComponent(url.pathname.replace(/^\/media\//, ""));
        return url.pathname.startsWith("/media/private/") && /^private\/[A-Za-z0-9/_.-]+$/.test(key) ? key : undefined;
    } catch { return undefined; }
}
export function mediaArchive(key: string, owner: string, signal: AbortSignal, submit = false) {
    return apiRequest<MediaArchiveState>(submit ? "/api/media/archive" : `/api/media/archive?objectKey=${encodeURIComponent(key)}`, {
        method: submit ? "POST" : "GET", json: submit ? { objectKey: key } : undefined,
        headers: { "X-Sundas-User": owner }, signal,
    });
}
