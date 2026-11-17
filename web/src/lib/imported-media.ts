import { nanoid } from "nanoid";

import { currentMediaOwner, localMediaKey, notifyLocalMediaOnly, uploadBlobToServer } from "@/services/cloud-media";
import { setImageBlob } from "@/services/image-storage";
import { setMediaBlob } from "@/services/file-storage";

type MediaFile = { storageKey: string; path: string; mimeType: string };
export type ImportedMedia = Map<string, { key: string; url: string }>;

export async function importMediaFiles(zip: Map<string, Blob>, files: MediaFile[], owner: string, checkSession: () => void = () => {}): Promise<ImportedMedia> {
    checkSession();
    if (!owner || currentMediaOwner() !== owner) throw new Error("登录账户已变化，请重新导入");
    const sources = new Map<string, { file: MediaFile; blob: Blob }>();
    for (const file of files) {
        const blob = zip.get(file.path);
        if (!blob) throw new Error("导入文件缺少媒体内容");
        const existing = sources.get(file.storageKey);
        if (existing) {
            const [a, b] = await Promise.all([existing.blob.arrayBuffer(), blob.arrayBuffer()]);
            const first = new Uint8Array(a), second = new Uint8Array(b);
            if (first.length !== second.length || first.some((value, index) => value !== second[index])) throw new Error("导入文件含有冲突的媒体键");
        } else sources.set(file.storageKey, { file, blob });
    }
    const result: ImportedMedia = new Map();
    for (const [oldKey, { file, blob }] of sources) {
        checkSession();
        if (currentMediaOwner() !== owner) throw new Error("登录账户已变化，请重新导入");
        const prefix = oldKey.startsWith('/media/') ? file.mimeType.startsWith('image/') ? 'image' : file.mimeType.startsWith('audio/') ? 'audio' : 'video' : oldKey.startsWith("image:") ? "image" : oldKey.split(":")[0];
        const typed = blob.type ? blob : blob.slice(0, blob.size, file.mimeType);
        const uploaded = await uploadBlobToServer(typed, prefix, owner).catch(() => null);
        checkSession();
        if (currentMediaOwner() !== owner) throw new Error("登录账户已变化，请重新导入");
        if (uploaded) {
            result.set(oldKey, { key: "", url: uploaded.url });
            continue;
        }
        const key = localMediaKey(prefix, owner, nanoid());
        const url = prefix === 'image' ? await setImageBlob(key, typed) : await setMediaBlob(key, typed);
        checkSession();
        notifyLocalMediaOnly(owner);
        result.set(oldKey, { key, url });
    }
    checkSession();
    if (currentMediaOwner() !== owner) throw new Error("登录账户已变化，请重新导入");
    return result;
}

export function remapImportedMedia<T>(value: T, media: ImportedMedia): T {
    if (Array.isArray(value)) return value.map((item) => remapImportedMedia(item, media)) as T;
    if (!value || typeof value !== "object") return value;
    const source = value as Record<string, unknown>;
    const data = source.data && typeof source.data === "object" ? source.data as Record<string, unknown> : null;
    const storageKey = typeof source.storageKey === "string" ? source.storageKey : typeof data?.storageKey === "string" ? data.storageKey : null;
    const mapped = storageKey ? media.get(storageKey) : undefined;
    if (storageKey && !mapped) throw new Error("导入文件缺少媒体内容");
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(source)) {
        if (key === "storageKey" && mapped) output[key] = mapped.key;
        else if (mapped && ["content", "url", "dataUrl", "coverUrl", "previewUrl"].includes(key) && typeof item === "string" && (item.startsWith("blob:") || item.startsWith("data:"))) output[key] = mapped.url;
        else output[key] = remapImportedMedia(item, media);
    }
    return output as T;
}
