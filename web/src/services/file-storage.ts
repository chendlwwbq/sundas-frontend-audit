import { nanoid } from "nanoid";

import { assertLocalMediaOwner, assertMediaOwner, currentMediaOwner, isOwnMediaUrl, localMediaKey, notifyLocalMediaOnly, StorageQuotaError, uploadBlobToServer } from "@/services/cloud-media";
import { lazyStore } from "@/lib/localforage-store";
import { withLocalProxy } from "@/stores/use-config-store";
import { MediaObjectUrls, registerSessionMediaCache } from "@/lib/media-object-urls";

export type UploadedFile = { mediaId?: string; taskId?: string; objectKey?: string; url: string; storageKey: string; bytes: number; mimeType: string; width?: number; height?: number; durationMs?: number };

const store = lazyStore("media_files");
const objectUrls = registerSessionMediaCache(new MediaObjectUrls());

export class InvalidMediaResponseError extends Error {
    constructor() { super("媒体地址返回了错误或无效内容，请检查来源后重试"); this.name = "InvalidMediaResponseError"; }
}

export async function uploadMediaFile(input: string | Blob, prefix = "file", options?: { expectedOwner?: string | null; signal?: AbortSignal }): Promise<UploadedFile> {
    const owner = options?.expectedOwner === undefined ? currentMediaOwner() : options.expectedOwner;
    assertMediaOwner(owner, options?.signal);
    if (typeof input === "string" && isOwnMediaUrl(input)) {
        const meta = await readMediaMetaByUrl(input);
        assertMediaOwner(owner, options?.signal);
        return { url: input, storageKey: "", bytes: 0, mimeType: "", ...meta };
    }

    let blob: Blob;
    if (typeof input === "string") {
        const response = await fetch(withLocalProxy(input), { signal: options?.signal });
        const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
        if (!response.ok || contentType.startsWith("text/") || contentType === "application/json" || contentType.endsWith("+json")) throw new InvalidMediaResponseError();
        blob = await response.blob();
        if (!blob.size) throw new InvalidMediaResponseError();
    } else blob = input;
    assertMediaOwner(owner, options?.signal);
    const uploaded = await uploadBlobToServer(blob, prefix, owner, options?.signal).catch((error) => { if (error instanceof StorageQuotaError) throw error; return null; });
    assertMediaOwner(owner, options?.signal);
    const probeUrl = URL.createObjectURL(blob);
    const meta = blob.type.startsWith("video/") ? await readVideoMeta(probeUrl) : blob.type.startsWith("audio/") ? await readAudioMeta(probeUrl) : {};
    URL.revokeObjectURL(probeUrl);
    assertMediaOwner(owner, options?.signal);

    if (uploaded) {
        return { url: uploaded.url, storageKey: "", bytes: blob.size, mimeType: blob.type || "application/octet-stream", ...meta };
    }

    const storageKey = localMediaKey(prefix, owner, nanoid());
    await store.setItem(storageKey, blob);
    try { assertMediaOwner(owner, options?.signal); } catch (error) { await store.removeItem(storageKey); throw error; }
    notifyLocalMediaOnly(owner);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return { url, storageKey, bytes: blob.size, mimeType: blob.type || "application/octet-stream", ...meta };
}

function readMediaMetaByUrl(url: string) {
    if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return readVideoMeta(url);
    if (/\.(mp3|wav|ogg|m4a|aac|flac)(\?|$)/i.test(url)) return readAudioMeta(url);
    return Promise.resolve({});
}

export async function resolveMediaUrl(storageKey?: string, fallback = "", hydration?: { owner: string; isActive: () => boolean }) {
    if (!storageKey) return fallback;
    const owner = hydration?.owner ?? currentMediaOwner();
    assertLocalMediaOwner(storageKey, owner);
    if (hydration && !hydration.isActive()) throw new DOMException("账户数据加载已中断", "AbortError");
    const url = await objectUrls.resolve(storageKey, async () => {
        const blob = await store.getItem<Blob>(storageKey);
        if (hydration) { if (!hydration.isActive()) throw new DOMException("账户数据加载已中断", "AbortError"); }
        else assertMediaOwner(owner);
        return blob;
    });
    if (hydration) { if (!hydration.isActive()) throw new DOMException("账户数据加载已中断", "AbortError"); }
    else assertMediaOwner(owner);
    return url || fallback;
}

export async function getMediaBlob(storageKey: string) {
    const owner = currentMediaOwner();
    assertLocalMediaOwner(storageKey, owner);
    const blob = await store.getItem<Blob>(storageKey);
    assertMediaOwner(owner);
    return blob;
}

export async function setMediaBlob(storageKey: string, blob: Blob) {
    await store.setItem(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function deleteStoredMedia(keys: Iterable<string>) {
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            objectUrls.delete(key);
            await store.removeItem(key);
        }),
    );
}

export async function cleanupUnusedMedia(usedData: unknown) {
    const usedKeys = collectMediaStorageKeys(usedData);
    const unused: string[] = [];
    await store.iterate((_value, key) => {
        if (!usedKeys.has(key)) unused.push(key);
    });
    await deleteStoredMedia(unused);
}

export function collectMediaStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.includes(":")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectMediaStorageKeys(child, keys)) : collectMediaStorageKeys(item, keys)));
    return keys;
}

function readVideoMeta(url: string) {
    return new Promise<{ width: number; height: number; durationMs?: number }>((resolve) => {
        const video = document.createElement("video");
        const done = () => {
            const meta = { width: video.videoWidth || 1280, height: video.videoHeight || 720, durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined };
            video.onloadedmetadata = null;
            video.onerror = null;
            video.removeAttribute("src");
            video.load();
            resolve(meta);
        };
        video.onloadedmetadata = done;
        video.onerror = done;
        video.preload = "metadata";
        video.src = url;
    });
}

function readAudioMeta(url: string) {
    return new Promise<{ durationMs?: number }>((resolve) => {
        const audio = document.createElement("audio");
        const done = () => {
            const meta = { durationMs: Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : undefined };
            audio.onloadedmetadata = null;
            audio.onerror = null;
            audio.removeAttribute("src");
            audio.load();
            resolve(meta);
        };
        audio.onloadedmetadata = done;
        audio.onerror = done;
        audio.preload = "metadata";
        audio.src = url;
    });
}
