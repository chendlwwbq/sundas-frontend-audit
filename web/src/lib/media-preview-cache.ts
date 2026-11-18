type Snapshot = { url?: string; error?: string };
type Entry = { snapshot: Snapshot; listeners: Set<(value: Snapshot) => void>; controller: AbortController; pending?: Promise<void> };

// Visible consumers share one request and object URL; the last release aborts/revokes it.
export class MediaPreviewCache {
    private entries = new Map<string, Entry>();
    acquire(key: string, load: (signal: AbortSignal, manual: boolean) => Promise<Blob>, changed: (value: Snapshot) => void) {
        let entry = this.entries.get(key);
        if (!entry) { entry = { snapshot: {}, listeners: new Set(), controller: new AbortController() }; this.entries.set(key, entry); }
        const current = entry;
        current.listeners.add(changed);
        const publish = () => current.listeners.forEach(listener => listener(current.snapshot));
        const retry = (manual = true) => {
            if (current.pending || current.snapshot.url || current.controller.signal.aborted) return;
            current.snapshot = {}; publish();
            current.pending = load(current.controller.signal, manual).then(blob => {
                if (this.entries.get(key) === current && !current.controller.signal.aborted) current.snapshot = { url: URL.createObjectURL(blob) };
            }).catch(error => {
                if (!current.controller.signal.aborted) current.snapshot = { error: error instanceof Error ? error.message : '预览加载失败' };
            }).finally(() => { current.pending = undefined; publish(); });
        };
        changed(current.snapshot);
        retry(false);
        return { retry, release: () => {
            current.listeners.delete(changed);
            if (!current.listeners.size) {
                current.controller.abort();
                if (current.snapshot.url) URL.revokeObjectURL(current.snapshot.url);
                if (this.entries.get(key) === current) this.entries.delete(key);
            }
        } };
    }
}

export function ownedPreviewKey(value: string | undefined, origin: string) {
    if (!value) return undefined;
    try {
        const url = new URL(value, origin);
        return url.origin === origin && url.pathname.startsWith('/media/private/') ? decodeURIComponent(url.pathname.slice(7)) : undefined;
    } catch { return undefined; }
}
