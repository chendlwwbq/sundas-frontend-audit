import { uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { uploadImage, type UploadedImage } from "@/services/image-storage";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";

export type DirectorCanvasImageHandoff = {
    assetId?: string;
    persisted?: boolean;
};

export type DirectorLibraryPersistResult = {
    assetId: string;
    created: boolean;
    confirmed: boolean;
};

/** 素材草稿：与 useAssetStore.addAsset 的入参一致。 */
type NewAsset = Omit<Asset, "id" | "createdAt" | "updatedAt">;

function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw new DOMException("导演台会话已结束", "AbortError");
}

function storageKeyOf(asset: NewAsset) {
    return "storageKey" in asset.data ? asset.data.storageKey : undefined;
}

/**
 * BeefTV 这一层是「浏览器本地 IndexedDB + 桌面/托管工作区远端」双写；
 * sundas 的素材库本身就是 localforage 单机存储，因此这里以本地写入为权威：
 * 有 storageKey 视为已落盘（confirmed），没有则保持未确认，调用方照常提示。
 */
export function isDirectorCanonicalPersistSource(input: { storageKey?: string; pendingRemoteUpload?: boolean }) {
    return Boolean(input.storageKey) && !input.pendingRemoteUpload;
}

export function findWorkspaceAssetIdByStorageKey(storageKey?: string) {
    const key = storageKey?.trim();
    if (!key) return undefined;
    return useAssetStore.getState().assets.find((asset) => "storageKey" in asset.data && asset.data.storageKey === key)?.id;
}

export async function persistDirectorLibraryAsset(input: {
    asset: NewAsset;
    signal?: AbortSignal;
    existingAssetId?: string;
    existingPersisted?: boolean;
    /** BeefTV 的远端待上传标记；sundas 全部本地落盘，保留参数只为调用方零改动。 */
    pendingRemoteUpload?: boolean;
}): Promise<DirectorLibraryPersistResult> {
    const { signal } = input;
    throwIfAborted(signal);

    const existingId = input.existingAssetId?.trim();
    if (existingId) {
        const live = useAssetStore.getState().assets.find((item) => item.id === existingId);
        if (live) {
            throwIfAborted(signal);
            return { assetId: live.id, created: false, confirmed: isDirectorCanonicalPersistSource({ storageKey: storageKeyOf(input.asset) }) };
        }
    }

    const assetId = useAssetStore.getState().addAsset(input.asset);
    const asset = useAssetStore.getState().assets.find((item) => item.id === assetId);
    if (!asset) throw new Error("素材写入本地失败");
    throwIfAborted(signal);
    return { assetId, created: true, confirmed: isDirectorCanonicalPersistSource({ storageKey: storageKeyOf(input.asset) }) };
}

/** 先上传，再落素材库。 */
export async function persistDirectorImageUpload(input: {
    source: string | Blob;
    signal?: AbortSignal;
    toAsset: (uploaded: UploadedImage) => NewAsset;
    existingAssetId?: string;
    existingPersisted?: boolean;
    onProgress?: (uploadedBytes: number, totalBytes: number) => void;
}): Promise<{ uploaded: UploadedImage; persist: DirectorLibraryPersistResult }> {
    throwIfAborted(input.signal);
    const uploaded = await uploadImage(input.source, { signal: input.signal });
    throwIfAborted(input.signal);
    const persist = await persistDirectorLibraryAsset({
        asset: input.toAsset(uploaded),
        signal: input.signal,
        existingAssetId: input.existingAssetId,
        existingPersisted: input.existingPersisted,
    });
    return { uploaded, persist };
}

export async function persistDirectorMediaUpload(input: {
    source: Blob;
    prefix: string;
    signal?: AbortSignal;
    toAsset: (uploaded: UploadedFile) => NewAsset;
    existingAssetId?: string;
    existingPersisted?: boolean;
    onProgress?: (uploadedBytes: number, totalBytes: number) => void;
}): Promise<{ uploaded: UploadedFile; persist: DirectorLibraryPersistResult }> {
    throwIfAborted(input.signal);
    const uploaded = await uploadMediaFile(input.source, input.prefix, { signal: input.signal });
    throwIfAborted(input.signal);
    const persist = await persistDirectorLibraryAsset({
        asset: input.toAsset(uploaded),
        signal: input.signal,
        existingAssetId: input.existingAssetId,
        existingPersisted: input.existingPersisted,
    });
    return { uploaded, persist };
}
