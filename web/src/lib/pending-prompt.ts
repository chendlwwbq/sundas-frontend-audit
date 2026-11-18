export type PendingPromptMode = "image" | "video";
export type PendingMaterialKind = "image" | "video" | "audio";

export type PendingReference = {
    id?: string;
    kind?: PendingMaterialKind;
    name: string;
    type: string;
    dataUrl: string;
    storageKey?: string;
};

export type PendingPromptPayload = {
    prompt: string;
    references: PendingReference[];
    appendReferences?: boolean;
};

const PENDING_PROMPT_KEY = "sundas:pending-workbench-prompt";
export const GUEST_DRAFT_KEY = "sundas:guest-creation-draft";
// SPA 跳转先用内存交接；sessionStorage 负责刷新恢复，禁用存储时也不能丢素材。
const pendingTransfers = new Map<string, { mode: PendingPromptMode } & PendingPromptPayload>();

export function removePromptParameter(params: URLSearchParams) {
    const remaining = new URLSearchParams(params);
    remaining.delete("prompt");
    return remaining;
}

export function storePendingPrompt(mode: PendingPromptMode, prompt: string, references: PendingReference[], owner: string, options?: { appendReferences?: boolean }) {
    const key = `${PENDING_PROMPT_KEY}:${encodeURIComponent(owner)}`;
    const value = { mode, prompt, references: references.map(reference => ({ ...reference })), appendReferences: options?.appendReferences };
    pendingTransfers.set(key, value);
    try {
        sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Storage can be unavailable in private or restricted contexts.
    }
}

export function takePendingPrompt(mode: PendingPromptMode, owner: string): PendingPromptPayload | null {
    const key = `${PENDING_PROMPT_KEY}:${encodeURIComponent(owner)}`;
    const transfer = pendingTransfers.get(key);
    if (transfer) {
        if (transfer.mode !== mode) return null;
        pendingTransfers.delete(key);
        try { sessionStorage.removeItem(key); } catch { /* 内存交接不依赖浏览器存储权限。 */ }
        return { prompt: transfer.prompt, references: transfer.references, appendReferences: transfer.appendReferences };
    }
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        const value = JSON.parse(raw) as { mode?: PendingPromptMode; prompt?: string; references?: PendingReference[]; appendReferences?: boolean };
        if (value.mode !== mode || typeof value.prompt !== "string") return null;
        sessionStorage.removeItem(key);
        return { prompt: value.prompt, references: Array.isArray(value.references) ? value.references : [], appendReferences: value.appendReferences };
    } catch {
        return null;
    }
}
