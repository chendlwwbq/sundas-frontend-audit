import { notification } from "antd";
import i18n from "@/i18n";
import { useAuthStore } from "@/stores/use-auth-store";

const EXT: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "video/x-m4v": "m4v",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/ogg": "ogg",
    // 手机录音多为 m4a/aac，缺映射时会被当成 .bin 上传，服务端与上游都难判断格式。
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aac": "aac",
    "audio/flac": "flac",
    "audio/x-flac": "flac",
    "audio/aiff": "aiff",
};

export function isOwnMediaUrl(value: string) {
    if (value.startsWith("/media/")) return true;
    return typeof window !== "undefined" && value.startsWith(`${window.location.origin}/media/`);
}

export function currentMediaOwner() {
    const auth = useAuthStore.getState();
    return auth.ready ? auth.user?.id ?? null : null;
}

export function assertMediaOwner(owner: string | null, signal?: AbortSignal) {
    if (signal?.aborted || currentMediaOwner() !== owner) throw new DOMException("Account changed or request canceled", "AbortError");
}

export function localMediaKey(prefix: string, owner: string | null, id: string) {
    return owner ? `${prefix}:user:${owner}:${id}` : `${prefix}:unowned:${id}`;
}

export class LocalMediaOwnershipError extends Error {
    name = "LocalMediaOwnershipError";
    constructor() { super("本地素材引用了其他账户的文件，请核对历史素材后重试"); }
}

export class StorageQuotaError extends Error {
    constructor(message: string) { super(message); this.name = "StorageQuotaError"; }
}

export function assertLocalMediaOwner(key: string, owner = currentMediaOwner()) {
    const match = key.match(/^[^:]+:user:([^:]+):/);
    if (match && (!owner || match[1] !== owner)) throw new LocalMediaOwnershipError();
}

export function notifyLocalMediaOnly(owner: string | null) {
    if (!owner || currentMediaOwner() !== owner) return;
    notification.warning({ key: "media-local-only", message: i18n.t("common.mediaLocalOnlyTitle"), description: i18n.t("common.mediaLocalOnlyDescription"), duration: 0 });
}

const UPLOAD_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function isImageUpload(blob: Blob, prefix: string) {
    return blob.type.toLowerCase().startsWith("image/") || ["image", "reference", "promo", "prompts"].includes(prefix);
}

async function normalizeImageForUpload(blob: Blob, prefix: string, force = false) {
    if (!isImageUpload(blob, prefix)) return blob;
    if (!force && UPLOAD_IMAGE_TYPES.has(blob.type.toLowerCase())) return blob;

    let source: ImageBitmap | HTMLImageElement | undefined;
    let bitmap: ImageBitmap | undefined;
    let image: HTMLImageElement | undefined;
    let sourceUrl: string | undefined;
    try {
        if (typeof createImageBitmap === "function") {
            try { bitmap = await createImageBitmap(blob); source = bitmap; } catch { bitmap = undefined; }
        }
        if (!source) {
            sourceUrl = URL.createObjectURL(blob);
            image = new Image();
            image.decoding = "async";
            await new Promise<void>((resolve, reject) => {
                image!.onload = () => resolve();
                image!.onerror = () => reject(new Error("image decode failed"));
                image!.src = sourceUrl!;
            });
            source = image;
        }
        const width = bitmap ? bitmap.width : image?.naturalWidth ?? 0;
        const height = bitmap ? bitmap.height : image?.naturalHeight ?? 0;
        if (!width || !height) throw new Error("image has no dimensions");
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("canvas unavailable");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(source, 0, 0, width, height);
        const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
        if (!jpeg) throw new Error("image conversion failed");
        return new Blob([jpeg], { type: "image/jpeg" });
    } finally {
        if (bitmap) bitmap.close();
        if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    }
}

function uploadWithProgress(url: string, form: FormData, owner: string, signal: AbortSignal, onProgress: (progress: number) => void) {
    return new Promise<Response>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const cleanup = () => signal.removeEventListener("abort", abort);
        const abort = () => xhr.abort();
        xhr.open("POST", url);
        xhr.withCredentials = true;
        xhr.setRequestHeader("X-Sundas-User", owner);
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && event.total > 0) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
        };
        xhr.onload = () => resolve(new Response(xhr.responseText, { status: xhr.status, headers: { "content-type": xhr.getResponseHeader("content-type") || "" } }));
        xhr.onerror = () => reject(new TypeError("Network request failed"));
        xhr.onabort = () => reject(new DOMException("Upload aborted", "AbortError"));
        xhr.ontimeout = () => reject(new DOMException("Upload timed out", "AbortError"));
        xhr.onloadend = cleanup;
        if (signal.aborted) {
            cleanup();
            reject(new DOMException("Upload aborted", "AbortError"));
            return;
        }
        signal.addEventListener("abort", abort, { once: true });
        onProgress(0);
        xhr.send(form);
    });
}

export async function uploadBlobToServer(blob: Blob, prefix: string, expectedOwner = currentMediaOwner(), signal?: AbortSignal, reportError = false, normalize = true, onProgress?: (progress: number) => void) {
    if (!blob.size) return null;
    const owner = expectedOwner;
    assertMediaOwner(owner, signal);
    if (!owner) return null;
    const notifyUnsupported = () => notification.error({ key: "image-format-unsupported", message: i18n.t("common.unsupportedImageFormatTitle"), description: i18n.t("common.unsupportedImageFormatDescription") });
    let upload: Blob = blob;
    if (normalize) {
        try { upload = await normalizeImageForUpload(blob, prefix); }
        catch { notifyUnsupported(); return null; }
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    const timer = window.setTimeout(() => controller.abort(), 180_000);
    const send = async (body: Blob) => {
        if (!['promo', 'prompts', 'prompt-video'].includes(prefix)) {
            const { tryDirectMediaUpload } = await import('@/services/api/media-upload');
            const direct = await tryDirectMediaUpload(body, { owner, signal: controller.signal, onProgress });
            assertMediaOwner(owner, controller.signal);
            if (direct) return direct;
        }
        const form = new FormData();
        form.append("file", body, `${prefix}.${EXT[body.type] ?? "bin"}`);
        const url = prefix === 'promo' ? '/api/admin/promo/upload' : ['prompts', 'prompt-video'].includes(prefix) ? '/api/admin/prompts/upload' : '/api/uploads';
        return onProgress ? uploadWithProgress(url, form, owner, controller.signal, onProgress) : fetch(url, { method: "POST", body: form, credentials: "include", headers: { "X-Sundas-User": owner }, signal: controller.signal });
    };
    assertMediaOwner(owner, signal);
    let response: Response;
    try {
        response = await send(upload);
        if (response.status === 400 && !response.headers.get("content-type")?.includes("application/json")) {
            response = await send(upload);
        }
        if (normalize && response.status === 415 && isImageUpload(blob, prefix)) {
            try {
                const converted = await normalizeImageForUpload(blob, prefix, true);
                if (converted !== upload) response = await send(converted);
            } catch { notifyUnsupported(); return null; }
        }
    } catch (error) {
        if (signal?.aborted) throw error;
        if (controller.signal.aborted) throw new DOMException("Upload timed out", "AbortError");
        throw error;
    } finally {
        window.clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
    }
    if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: unknown; errorCode?: unknown } | null;
        if (body?.errorCode === "STORAGE_QUOTA_EXCEEDED") {
            void useAuthStore.getState().refreshWallet().catch(() => undefined);
            throw new StorageQuotaError(typeof body.message === "string" ? body.message : i18n.t("home.materialUploadFailed"));
        }
        if (reportError) {
            throw new Error(typeof body?.message === "string" ? body.message : i18n.t("home.materialUploadFailed"));
        }
        return null;
    }
    const result = (await response.json()) as { url: string; mime: string; bytes: number };
    assertMediaOwner(owner, signal);
    return result;
}

