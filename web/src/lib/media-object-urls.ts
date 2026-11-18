/** Memory-only URLs for stable resource keys. Concurrent reads share one load and one URL. */
const sessionCaches = new Set<MediaObjectUrls>();
export function registerSessionMediaCache(cache: MediaObjectUrls) { sessionCaches.add(cache); return cache; }
export function clearSessionMediaCaches() { sessionCaches.forEach(cache => cache.clear()); }

export class MediaObjectUrls {
    private urls = new Map<string, string>();
    private pending = new Map<string, Promise<string | undefined>>();
    private changed: () => void;

    constructor(changed: () => void = () => {}) { this.changed = changed; }

    get(key: string) { return this.urls.get(key); }

    set(key: string, url: string) {
        const old = this.urls.get(key);
        this.pending.delete(key);
        if (old && old !== url) URL.revokeObjectURL(old);
        this.urls.set(key, url);
        if (old !== url) this.changed();
    }

    resolve(key: string, load: (isCurrent: () => boolean) => Promise<Blob | null | undefined>): Promise<string | undefined> {
        const cached = this.urls.get(key);
        if (cached) return Promise.resolve(cached);
        const existing = this.pending.get(key);
        if (existing) return existing;
        const current = () => this.pending.get(key) === request;
        const request = Promise.resolve().then(() => load(current)).then((blob) => {
            if (!blob || !current()) return undefined;
            const url = URL.createObjectURL(blob);
            this.urls.set(key, url);
            this.changed();
            return url;
        }).finally(() => { if (current()) this.pending.delete(key); });
        this.pending.set(key, request);
        return request;
    }

    delete(key: string) {
        this.pending.delete(key);
        const url = this.urls.get(key);
        if (url) { URL.revokeObjectURL(url); this.urls.delete(key); this.changed(); }
    }

    clear() {
        this.pending.clear();
        if (!this.urls.size) return;
        this.urls.forEach((url) => URL.revokeObjectURL(url));
        this.urls.clear();
        this.changed();
    }
}
