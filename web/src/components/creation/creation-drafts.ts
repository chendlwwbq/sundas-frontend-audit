import { lazyStore } from "@/lib/localforage-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

export type Continuation = { title: string; prompt: string };

export type CreationDraft = {
    continuation?: Continuation;
    prompt: string;
    references: ReferenceImage[];
    videos: ReferenceVideo[];
    audios: ReferenceAudio[];
    updatedAt?: number;
};

export type DraftSaveStatus = {
    state: "idle" | "saving" | "saved" | "error";
    savedAt?: number;
    error?: string;
};

const draftStore = lazyStore("creation_drafts");
let session = "";
const drafts: Partial<Record<"image" | "video", CreationDraft>> = {};

function forSession(owner: string, epoch: number) {
    const next = `${owner}:${epoch}`;
    if (session === next) return;
    session = next;
    delete drafts.image;
    delete drafts.video;
}

function storageKey(mode: "image" | "video", owner: string) {
    return `draft:${owner}:${mode}`;
}

function sanitizeImageRef(item: ReferenceImage): ReferenceImage {
    const transientBlob = item.dataUrl.startsWith("blob:");
    return {
        ...item,
        dataUrl: transientBlob ? "" : item.dataUrl,
        queued: false,
        uploading: false,
        progress: item.storageKey || !transientBlob ? item.progress : 0,
        error: item.error || (transientBlob && !item.storageKey ? "上次上传未完成，请重新上传" : undefined),
    };
}

function sanitizeDraft(draft: CreationDraft): CreationDraft {
    return {
        continuation: draft.continuation ? { ...draft.continuation } : undefined,
        prompt: draft.prompt,
        references: draft.references.map(sanitizeImageRef),
        // Drop unuploaded local blob references for video/audio since blob: URLs expire on reload.
        videos: draft.videos.filter((item) => !item.url.startsWith("blob:") || Boolean(item.storageKey)).map((item) => ({ ...item, url: item.url.startsWith("blob:") ? "" : item.url })),
        audios: draft.audios.filter((item) => !item.url.startsWith("blob:") || Boolean(item.storageKey)).map((item) => ({ ...item, url: item.url.startsWith("blob:") ? "" : item.url })),
        updatedAt: Date.now(),
    };
}

export function isCreationDraftEmpty(draft: CreationDraft) {
    return !draft.continuation && !draft.prompt.trim() && draft.references.length === 0 && draft.videos.length === 0 && draft.audios.length === 0;
}

export function readCreationDraft(mode: "image" | "video", owner: string, epoch: number) {
    forSession(owner, epoch);
    return drafts[mode];
}

export async function loadCreationDraft(mode: "image" | "video", owner: string, epoch: number): Promise<CreationDraft | undefined> {
    forSession(owner, epoch);
    if (drafts[mode]) return drafts[mode];
    const stored = await draftStore.getItem<CreationDraft>(storageKey(mode, owner));
    if (!stored || session !== `${owner}:${epoch}`) return drafts[mode];
    if (!drafts[mode] && !isCreationDraftEmpty(stored)) {
        drafts[mode] = sanitizeDraft(stored);
    }
    return drafts[mode];
}

export async function saveCreationDraft(mode: "image" | "video", owner: string, epoch: number, draft: CreationDraft): Promise<DraftSaveStatus> {
    forSession(owner, epoch);
    const sanitized = sanitizeDraft(draft);
    if (isCreationDraftEmpty(sanitized)) {
        delete drafts[mode];
        try {
            await draftStore.removeItem(storageKey(mode, owner));
            return { state: "idle" };
        } catch (error) {
            return { state: "error", error: error instanceof Error ? error.message : String(error) };
        }
    }
    drafts[mode] = sanitized;
    try {
        await draftStore.setItem(storageKey(mode, owner), sanitized);
        return { state: "saved", savedAt: sanitized.updatedAt };
    } catch (error) {
        return { state: "error", error: error instanceof Error ? error.message : String(error) };
    }
}

export function clearCreationDrafts() {
    delete drafts.image;
    delete drafts.video;
}
