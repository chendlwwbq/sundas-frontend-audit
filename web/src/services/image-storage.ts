
import { nanoid } from "nanoid";
import i18n from "@/i18n";
import { assertLocalMediaOwner, assertMediaOwner, currentMediaOwner, isOwnMediaUrl, localMediaKey, notifyLocalMediaOnly, StorageQuotaError, uploadBlobToServer } from "@/services/cloud-media";
import { lazyStore } from "@/lib/localforage-store";
import { withLocalProxy } from "@/stores/use-config-store";
import { createImageThumbnail } from "@/lib/image-thumbnail";
import { MediaObjectUrls, registerSessionMediaCache } from "@/lib/media-object-urls";

export type UploadedImage = {
    url: string;
    storageKey?: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
    /** 仅为兼容从 BeefTV 平移过来的调用方：sundas 没有远端待上传态，恒为 false。 */
    pendingRemoteUpload?: boolean;
};

const store = lazyStore("image_files");
const previewStore = lazyStore("image_previews");
const imageLogStore = lazyStore("image_generation_logs");
const videoLogStore = lazyStore("video_generation_logs");
const objectUrls = registerSessionMediaCache(new MediaObjectUrls());
const previewUrls = registerSessionMediaCache(new MediaObjectUrls(() => {
    previewRevision += 1;
    previewListeners.forEach((listener) => listener());
}));
const previewListeners = new Set<() => void>();
let previewRevision = 0;
let previewQueue: Promise<unknown> = Promise.resolve();
const IMAGE_PREVIEW_VERSION = 1;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 10 * 60_000;
const IMAGE_REMOTE_LOAD_TIMEOUT_MS = 10 * 60_000;
const IMAGE_DECODE_TIMEOUT_MS = 10_000;
const IMAGE_RESPONSE_ERROR = "ImageResponseError";
const IMAGE_TIMEOUT_ERROR = "ImageTimeoutError";

type StoredImagePreview = { version: number; blob?: Blob };

type ImageReadOptions = { signal?: AbortSignal; expectedOwner?: string | null; onProgress?: (progress: number) => void };

export async function uploadImage(input: string | Blob, options?: ImageReadOptions): Promise<UploadedImage> {
    const owner = options?.expectedOwner === undefined ? currentMediaOwner() : options.expectedOwner;
    assertMediaOwner(owner, options?.signal);
    options = { ...options, expectedOwner: owner };
    if (typeof input !== "string") {
        try {
            return await storeImage(input, options);
        } catch (error) {
            if (error instanceof StorageQuotaError) throw error;
            const uploaded = await uploadBlobToServer(input, "image", owner, options?.signal, true, false, options?.onProgress).catch(() => null);
            if (!uploaded) throw error;
            const meta = await loadImageMeta(uploaded.url, options).catch(() => null);
            return { url: uploaded.url, width: meta?.width ?? 0, height: meta?.height ?? 0, bytes: uploaded.bytes, mimeType: uploaded.mime };
        }
    }
    if (isOwnMediaUrl(input)) {
        const meta = await loadImageMeta(input, options);
        assertMediaOwner(owner, options?.signal);
        if (!meta) throw new Error(i18n.t("common.imageReadFailed"));
        return { url: input, width: meta.width, height: meta.height, bytes: 0, mimeType: "" };
    }

    let blob: Blob;
    try {
        blob = await fetchImageBlob(input, options);
    } catch (error) {
        if (options?.signal?.aborted || isNamedError(error, IMAGE_RESPONSE_ERROR) || isNamedError(error, IMAGE_TIMEOUT_ERROR) || !/^https?:\/\//i.test(input)) throw error;
        const meta = await loadImageMeta(input, options, IMAGE_REMOTE_LOAD_TIMEOUT_MS);
        if (!meta) throw error;
        assertMediaOwner(owner, options?.signal);
        return { url: input, width: meta.width, height: meta.height, bytes: 0, mimeType: "" };
    }
    return storeImage(blob, options);
}

async function storeImage(blob: Blob, options?: ImageReadOptions): Promise<UploadedImage> {
    const owner = options?.expectedOwner === undefined ? currentMediaOwner() : options.expectedOwner;
    assertMediaOwner(owner, options?.signal);
    const storageKey = localMediaKey("image", owner, nanoid());
    const url = URL.createObjectURL(blob);
    try {
        const meta = await loadImageMeta(url, options);
        if (!meta) throw new Error(i18n.t("common.imageReadFailed"));
        throwIfAborted(options?.signal);

        const uploaded = await uploadBlobToServer(blob, "image", owner, options?.signal, false, false, options?.onProgress).catch((error) => { if (error instanceof StorageQuotaError) throw error; return null; });
        assertMediaOwner(owner, options?.signal);
        if (uploaded) {
            URL.revokeObjectURL(url);
            return { url: uploaded.url, width: meta.width, height: meta.height, bytes: blob.size, mimeType: blob.type.startsWith("image/") ? blob.type : "" };
        }

        await store.setItem(storageKey, blob);
        assertMediaOwner(owner, options?.signal);
        throwIfAborted(options?.signal);
        objectUrls.set(storageKey, url);
        await storeImagePreview(storageKey, blob);
        assertMediaOwner(owner, options?.signal);
        notifyLocalMediaOnly(owner);
        return { url, storageKey, width: meta.width, height: meta.height, bytes: blob.size, mimeType: blob.type.startsWith("image/") ? blob.type : "" };
    } catch (error) {
        objectUrls.delete(storageKey);
        URL.revokeObjectURL(url);
        await deleteImagePreview(storageKey);
        await store.removeItem(storageKey).catch(() => undefined);
        throw error;
    }
}

async function fetchImageBlob(url: string, options?: ImageReadOptions) {
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    if (options?.signal?.aborted) abort();
    else options?.signal?.addEventListener("abort", abort, { once: true });
    const timer = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, IMAGE_DOWNLOAD_TIMEOUT_MS);
    try {
        const response = await fetch(withLocalProxy(url), { signal: controller.signal });
        if (!response.ok) throw namedError(IMAGE_RESPONSE_ERROR);
        return await response.blob();
    } catch (error) {
        if (timedOut) throw namedError(IMAGE_TIMEOUT_ERROR);
        if (options?.signal?.aborted) throw abortReason(options.signal);
        throw error;
    } finally {
        window.clearTimeout(timer);
        options?.signal?.removeEventListener("abort", abort);
    }
}

function loadImageMeta(url: string, options?: ImageReadOptions, timeoutMs = IMAGE_DECODE_TIMEOUT_MS) {
    return new Promise<{ width: number; height: number } | null>((resolve, reject) => {
        if (options?.signal?.aborted) return reject(abortReason(options.signal));
        const image = new Image();
        let settled = false;
        const finish = (value: { width: number; height: number } | null) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            options?.signal?.removeEventListener("abort", abort);
            image.onload = null;
            image.onerror = null;
            resolve(value);
        };
        const abort = () => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            image.onload = null;
            image.onerror = null;
            reject(abortReason(options!.signal!));
        };
        const timer = window.setTimeout(() => finish(null), timeoutMs);
        options?.signal?.addEventListener("abort", abort, { once: true });
        image.onload = () => finish(image.naturalWidth && image.naturalHeight ? { width: image.naturalWidth, height: image.naturalHeight } : null);
        image.onerror = () => finish(null);
        image.src = url;
    });
}

function namedError(name: string) {
    const error = new Error(i18n.t("common.imageReadFailed"));
    error.name = name;
    return error;
}

function isNamedError(error: unknown, name: string) {
    return error instanceof Error && error.name === name;
}

function abortReason(signal: AbortSignal) {
    return signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError");
}

function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw abortReason(signal);
}

type ImageHydration = { owner?: string; isActive?: () => boolean; cacheMiss?: boolean };

export async function resolveImageUrl(storageKey?: string, fallback = "", hydration?: ImageHydration) {
    if (!storageKey) return fallback;
    const owner = hydration?.owner ?? currentMediaOwner();
    assertLocalMediaOwner(storageKey, owner);
    const assertActive = () => {
        if (hydration?.isActive) {
            if (!hydration.isActive()) throw new DOMException("账户数据加载已中断", "AbortError");
        } else assertMediaOwner(owner);
    };
    assertActive();
    // Refresh a stale cover URL while concurrent refreshes still share one read.
    if (hydration?.cacheMiss && objectUrls.get(storageKey)) objectUrls.delete(storageKey);
    const url = await objectUrls.resolve(storageKey, async () => {
        const blob = await store.getItem<Blob>(storageKey);
        assertActive();
        return blob;
    });
    assertActive();
    return url || fallback;
}

/** 优先返回本地缩略图，没有则回落到原图 URL —— 对齐 BeefTV 的封面解析语义。 */
export async function resolvePreviewImageUrl(storageKey?: string, fallback = "", hydration?: ImageHydration) {
    if (!storageKey) return fallback;
    const owner = hydration?.owner ?? currentMediaOwner();
    assertLocalMediaOwner(storageKey, owner);
    if (hydration?.isActive) {
        if (!hydration.isActive()) throw new DOMException("账户数据加载已中断", "AbortError");
    } else assertMediaOwner(owner);
    const preview = hydration?.cacheMiss ? undefined : previewUrlFor(storageKey);
    if (preview) return preview;
    return resolveImageUrl(storageKey, fallback, hydration);
}

export async function getImageBlob(storageKey: string) {
    const owner = currentMediaOwner();
    assertLocalMediaOwner(storageKey, owner);
    const blob = await store.getItem<Blob>(storageKey);
    assertMediaOwner(owner);
    return blob;
}

// 缩略图按图片的 storageKey 另存一份 WebP，只放在本地 IndexedDB 里，不写进节点数据，也不参与导出。
export function previewUrlFor(storageKey?: string) {
    if (!storageKey) return undefined;
    try { assertLocalMediaOwner(storageKey); } catch { return undefined; }
    return previewUrls.get(storageKey);
}

// 缩略图在后台补，生成完成后再让用到它的界面重渲染一次。
export function subscribeImagePreviews(listener: () => void) {
    previewListeners.add(listener);
    return () => {
        previewListeners.delete(listener);
    };
}

export function getImagePreviewRevision() {
    return previewRevision;
}

export async function ensureImagePreview(storageKey?: string) {
    if (!storageKey) return undefined;
    const owner = currentMediaOwner();
    try { assertLocalMediaOwner(storageKey, owner); } catch { return undefined; }
    return previewUrls.resolve(storageKey, async (isCurrent) => {
        const stored = await previewStore.getItem<StoredImagePreview>(storageKey).catch(() => null);
        if (currentMediaOwner() !== owner || !isCurrent()) return undefined;
        if (stored?.version === IMAGE_PREVIEW_VERSION) return stored.blob;
        // Keep the existing serial decoder queue; duplicate requests share this complete operation.
        const result = previewQueue.then(async () => {
            if (currentMediaOwner() !== owner || !isCurrent()) return undefined;
            const original = await getImageBlob(storageKey);
            return original ? createStoredImagePreview(storageKey, original, () => currentMediaOwner() === owner && isCurrent()) : undefined;
        });
        previewQueue = result.catch(() => undefined);
        return result;
    }).catch(() => undefined);
}

async function storeImagePreview(storageKey: string, original: Blob) {
    const owner = currentMediaOwner();
    return previewUrls.resolve(storageKey, (isCurrent) => createStoredImagePreview(storageKey, original, () => currentMediaOwner() === owner && isCurrent())).catch(() => undefined);
}

async function createStoredImagePreview(storageKey: string, original: Blob, isCurrent: () => boolean) {
    // Decode errors must remain retryable rather than being persisted as a successful empty preview.
    const preview = await createImageThumbnail(original);
    if (!isCurrent()) return undefined;
    await previewStore.setItem<StoredImagePreview>(storageKey, { version: IMAGE_PREVIEW_VERSION, blob: preview }).catch(() => undefined);
    return isCurrent() ? preview : undefined;
}

async function deleteImagePreview(storageKey: string) {
    previewUrls.delete(storageKey);
    await previewStore.removeItem(storageKey).catch(() => undefined);
}

export async function setImageBlob(storageKey: string, blob: Blob) {
    await store.setItem(storageKey, blob);
    await deleteImagePreview(storageKey);
    await storeImagePreview(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function retryLocalImage(storageKey: string, options?: ImageReadOptions): Promise<UploadedImage> {
    const owner = options?.expectedOwner === undefined ? currentMediaOwner() : options.expectedOwner;
    assertMediaOwner(owner, options?.signal);
    const blob = await getImageBlob(storageKey);
    if (!blob?.size) throw new Error(i18n.t("common.imageReadFailed"));
    const uploaded = await uploadBlobToServer(blob, "image", owner, options?.signal, true, false, options?.onProgress);
    if (!uploaded) throw new Error(i18n.t("common.imageReadFailed"));
    const meta = await loadImageMeta(uploaded.url, options).catch(() => null);
    return { url: uploaded.url, width: meta?.width ?? 0, height: meta?.height ?? 0, bytes: uploaded.bytes, mimeType: uploaded.mime };
}

export async function imageToDataUrl(image: { url?: string; dataUrl?: string; storageKey?: string }, options?: ImageReadOptions) {
    const owner = options?.expectedOwner === undefined ? currentMediaOwner() : options.expectedOwner;
    assertMediaOwner(owner, options?.signal);
    if (image.storageKey) assertLocalMediaOwner(image.storageKey, owner);
    const url = image.dataUrl || (await resolveImageUrl(image.storageKey, image.url || ""));
    if (!url || url.startsWith("data:")) { assertMediaOwner(owner, options?.signal); return url; }
    const result = await blobToDataUrl(await fetchImageBlob(url, options));
    assertMediaOwner(owner, options?.signal);
    return result;
}

export async function deleteStoredImages(keys: Iterable<string>) {
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            objectUrls.delete(key);
            await deleteImagePreview(key);
            await store.removeItem(key);
        }),
    );
}

export async function cleanupUnusedImages(usedData: unknown) {
    const usedKeys = collectImageStorageKeys(usedData);
    await Promise.all([
        imageLogStore.iterate((value) => {
            collectImageStorageKeys(value, usedKeys);
        }),
        videoLogStore.iterate((value) => {
            collectImageStorageKeys(value, usedKeys);
        }),
    ]);
    const unused: string[] = [];
    await store.iterate((_value, key) => {
        if (!usedKeys.has(key)) unused.push(key);
    });
    const orphanPreviews: string[] = [];
    await previewStore.iterate((_value, key) => {
        if (!usedKeys.has(key)) orphanPreviews.push(key);
    });
    await Promise.all([deleteStoredImages(unused), ...orphanPreviews.map(deleteImagePreview)]);
}

export function collectImageStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.startsWith("image:")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectImageStorageKeys(child, keys)) : collectImageStorageKeys(item, keys)));
    return keys;
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error(i18n.t("common.imageReadFailed")));
        reader.readAsDataURL(blob);
    });
}
