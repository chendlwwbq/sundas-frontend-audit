const RELOAD_KEY = "sundas:chunk-reload";

function isChunkLoadError(value: unknown) {
    const message = value instanceof Error ? `${value.name}: ${value.message}` : String(value ?? "");
    return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i.test(message);
}

function reloadOnce() {
    try {
        if (sessionStorage.getItem(RELOAD_KEY)) return;
        sessionStorage.setItem(RELOAD_KEY, "1");
    } catch {
        // Storage can be unavailable in private mode; a reload is still safer than the raw error page.
    }
    window.location.reload();
}

/** Reload once when a deploy replaced a lazy-loaded chunk under an open tab. */
export function initChunkReloadGuard() {
    if (typeof window === "undefined") return;
    const onPreloadError = (event: Event) => {
        event.preventDefault();
        reloadOnce();
    };
    const onRejection = (event: PromiseRejectionEvent) => {
        if (!isChunkLoadError(event.reason)) return;
        event.preventDefault();
        reloadOnce();
    };
    const onError = (event: ErrorEvent) => {
        if (isChunkLoadError(event.error ?? event.message)) reloadOnce();
    };
    window.addEventListener("vite:preloadError", onPreloadError);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    // Allow a later deployment in the same tab to trigger another one-shot reload.
    window.setTimeout(() => {
        try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* ignore */ }
    }, 15_000);
}
