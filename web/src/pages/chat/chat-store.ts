import { clearCreationDrafts } from "@/components/creation/creation-drafts";
import { create } from "zustand";
import { lazyStore } from "@/lib/localforage-store";
import type { CreationContextRecord } from "@/components/creation/creation-context";

export type ChatEntry = { id: string; role: "user" | "assistant"; text: string; error?: string; complete?: boolean };
export type CreationThread = { contextCleared?: boolean; id: string; title: string; createdAt: number; updatedAt: number; messages: ChatEntry[]; draft: string; records: CreationContextRecord[] };
type Saved = { threads: CreationThread[]; activeId: string };
const cache = lazyStore("creation_conversations");
export const useCreationChat = create<Saved & { owner: string; ready: boolean; error: string }>(() => ({ owner: "", ready: false, error: "", threads: [], activeId: "" }));
let loading: Promise<void> | undefined;
let writes = Promise.resolve();
function persist() {
    const { owner, threads, activeId } = useCreationChat.getState();
    if (!owner) return;
    const snapshot = structuredClone({ threads, activeId });
    writes = writes.then(() => cache.setItem(owner, snapshot)).then(() => undefined).catch(() => {
        if (useCreationChat.getState().owner === owner) useCreationChat.setState({ error: "浏览器保存失败，请检查可用存储空间；当前内容仍保留在页面中。" });
    });
}
export async function loadCreationChats(owner: string) {
    const state = useCreationChat.getState();
    if (state.owner === owner) { if (!state.ready) await loading; return; }
    useCreationChat.setState({ owner, ready: false, error: "", threads: [], activeId: "" });
    loading = (async () => {
        try {
            await writes;
            const saved = await cache.getItem<Saved>(owner);
            if (useCreationChat.getState().owner !== owner) return;
            const threads = (saved?.threads ?? []).map(thread => ({ ...thread, messages: thread.messages.map(item => item.role === "assistant" && !item.complete && !item.error ? { ...item, error: "上次回复已中断，可继续提问。" } : item) }));
            useCreationChat.setState({ threads, activeId: saved?.activeId ?? "", ready: true });
        } catch { if (useCreationChat.getState().owner === owner) useCreationChat.setState({ ready: true, error: "浏览器聊天记录读取失败，请刷新重试。" }); }
    })();
    await loading;
}
export function newCreationThread(owner: string, clearContext = true) {
    if (useCreationChat.getState().owner !== owner || !useCreationChat.getState().ready) return "";
    if (clearContext) clearCreationDrafts();
    const id = crypto.randomUUID(), now = Date.now();
    useCreationChat.setState(state => ({ activeId: id, threads: [...state.threads, { id, contextCleared: clearContext, title: "新对话", createdAt: now, updatedAt: now, messages: [], draft: "", records: [] }] }));
    persist(); return id;
}
export async function ensureCreationThread(owner: string) {
    await loadCreationChats(owner);
    const state = useCreationChat.getState();
    if (state.owner !== owner) throw new Error("账户已变化");
    return state.threads.some(t => t.id === state.activeId) ? state.activeId : newCreationThread(owner, false);
}
export function openCreationThread(owner: string, id: string) {
    const state = useCreationChat.getState();
    if (state.owner !== owner || !state.threads.some(t => t.id === id)) return false;
    useCreationChat.setState({ activeId: id }); persist(); return true;
}
export function patchCreationThread(owner: string, id: string, patch: Partial<CreationThread>, save = true) {
    if (useCreationChat.getState().owner !== owner) return;
    useCreationChat.setState(state => ({ threads: state.threads.map(t => t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t) }));
    if (save) persist();
}
export function saveCreationRecord(owner: string, record: CreationContextRecord, threadId?: string) {
    const state = useCreationChat.getState();
    if (state.owner !== owner) return;
    const thread = state.threads.find(t => t.records.some(r => r.id === record.id)) ?? state.threads.find(t => t.id === threadId);
    if (!thread) return;
    const imageRef = (image: NonNullable<CreationContextRecord["images"]>[number]) => image.storageKey ? { ...image, dataUrl: "", url: "" } : image;
    const storedRecord = { ...record, images: record.images?.map(imageRef), references: record.references?.map(imageRef) };
    const records = [...thread.records.filter(r => r.id !== record.id), storedRecord].sort((a,b) => a.createdAt-b.createdAt);
    patchCreationThread(owner, thread.id, { records, contextCleared: false, ...(thread.title === "新对话" ? { title: record.prompt.slice(0, 40) || "创作对话" } : {}) });
}

export async function handoffCreationToChat(owner: string, record?: CreationContextRecord) {
    await loadCreationChats(owner);
    const state = useCreationChat.getState();
    if (state.owner !== owner) throw new Error("账户已变化");
    const existing = record && state.threads.find(t => t.records.some(r => r.id === record.id));
    const id = existing?.id ?? await ensureCreationThread(owner);
    if (record) saveCreationRecord(owner, record, id);
    openCreationThread(owner, id);
    return id;
}
