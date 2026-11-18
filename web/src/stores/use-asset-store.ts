import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";
import { nextUpdatedAt } from "@/lib/next-updated-at";
import { createSerializedWriter } from "@/lib/serialized-writer";
import { ensureImagePreview, previewUrlFor, resolveImageUrl, uploadImage } from "@/services/image-storage";
import { resolveMediaUrl } from "@/services/file-storage";

export type AssetKind = "text" | "image" | "video" | "audio" | "model";
export type TextAsset = AssetBase<"text"> & { data: { content: string } };
export type ImageAsset = AssetBase<"image"> & { data: { dataUrl: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type VideoAsset = AssetBase<"video"> & { data: { url: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
/** 3D 模型（.glb/.gltf）：给导演台把上传的自定义演员/道具存进素材库。 */
export type ModelAsset = AssetBase<"model"> & { data: { url: string; storageKey?: string; bytes: number; mimeType: string; fileName?: string } };
export type AudioAsset = AssetBase<"audio"> & { data: { url: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string; durationMs?: number } };
export type Asset = AudioAsset | TextAsset | ImageAsset | VideoAsset | ModelAsset;

type AssetBase<T extends AssetKind> = {
    id: string;
    kind: T;
    title: string;
    coverUrl: string;
    tags: string[];
    source?: string;
    note?: string;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, unknown>;
};

type AssetStore = {
    hydrated: boolean;
    assets: Asset[];
    deletedAssets: string[];
    addAsset: (asset: Omit<Asset, "id" | "createdAt" | "updatedAt">) => string;
    updateAsset: (id: string, patch: Partial<Omit<Asset, "id" | "createdAt">>) => void;
    removeAsset: (id: string) => void;
    clearDeletedAssets: (ids: string[]) => void;
    replaceAssets: (assets: Asset[]) => void;
    cleanupImages: (extra?: unknown) => void;
};

// 卡片用缩略图渲染，自定义封面（远程地址或单独上传的封面）保持原样。
export function assetCoverUrl(asset: Asset) {
    const own = asset.kind === "image" ? asset.data.dataUrl : "";
    const cover = asset.coverUrl || own;
    return asset.kind === "image" && cover === own ? previewUrlFor(asset.data.storageKey) || cover : cover;
}

const ASSET_STORE_KEY = "sundas:asset_store";
export function isAssetAccountActive(userId: string | null) {
    return useAssetStore.persist.getOptions().name === (userId ? `${ASSET_STORE_KEY}:${userId}` : ASSET_STORE_KEY);
}
let switchingAssets = false;
let assetHydrationError: unknown;
const assetWrites = createSerializedWriter();

const assetStorage: PersistStorage<AssetStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const owner = name.startsWith(`${ASSET_STORE_KEY}:`) ? name.slice(ASSET_STORE_KEY.length + 1) : "";
        const hydration = { owner, isActive: () => switchingAssets && useAssetStore.persist.getOptions().name === name };
        const parsed = JSON.parse(value) as StorageValue<AssetStore>;
        parsed.state.assets = await Promise.all(
            parsed.state.assets.map(async (asset) => {
                if ((asset.kind === "video" || asset.kind === "audio") && asset.data.storageKey) return { ...asset, data: { ...asset.data, url: await resolveMediaUrl(asset.data.storageKey, asset.data.url, hydration) } };
                if (asset.kind !== "image") return asset;
                if (asset.data.storageKey) {
                    void ensureImagePreview(asset.data.storageKey);
                    return {
                        ...asset,
                        coverUrl: asset.coverUrl?.startsWith("blob:") ? await resolveImageUrl(asset.data.storageKey, asset.coverUrl, hydration) : asset.coverUrl,
                        data: { ...asset.data, dataUrl: await resolveImageUrl(asset.data.storageKey, asset.data.dataUrl, hydration) },
                    };
                }
                if (!asset.data.dataUrl?.startsWith("data:image/")) return asset;
                const image = await uploadImage(asset.data.dataUrl);
                return { ...asset, coverUrl: asset.coverUrl?.startsWith("data:image/") ? image.url : asset.coverUrl, data: { ...asset.data, dataUrl: image.url, storageKey: image.storageKey, bytes: image.bytes, mimeType: image.mimeType } };
            }),
        );
        return parsed;
    },
    setItem: (name, value) => {
        if (switchingAssets) return;
        const encoded = JSON.stringify(value);
        const write = assetWrites.write(() => localForageStorage.setItem(name, encoded));
        void write.catch((error) => console.error("素材本地保存失败", error));
        return write;
    },
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useAssetStore = create<AssetStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            assets: [],
            deletedAssets: [],
            addAsset: (asset) => {
                const now = new Date().toISOString();
                const id = crypto.randomUUID();
                set((state) => ({ assets: [{ ...asset, id, createdAt: now, updatedAt: now } as Asset, ...state.assets] }));
                return id;
            },
            updateAsset: (id, patch) =>
                set((state) => ({
                    assets: state.assets.map((asset) => (asset.id === id ? ({ ...asset, ...patch, updatedAt: nextUpdatedAt(asset.updatedAt) } as Asset) : asset)),
                })),
            removeAsset: (id) =>
                set((state) => {
                    const assets = state.assets.filter((asset) => asset.id !== id);
                    get().cleanupImages({ assets });
                    return { assets, deletedAssets: [...new Set([...state.deletedAssets, id])] };
                }),
            clearDeletedAssets: (ids) => set((state) => ({ deletedAssets: state.deletedAssets.filter((id) => !ids.includes(id)) })),
            replaceAssets: (assets) => set({ assets }),
            // 媒体文件存储仍被所有账户共享，不能按当前账户引用删除其他账户的离线文件。
            cleanupImages: () => {},
        }),
        {
            name: ASSET_STORE_KEY,
            skipHydration: true,
            storage: assetStorage,
            partialize: (state) => ({ assets: state.assets, deletedAssets: state.deletedAssets }) as StorageValue<AssetStore>["state"],
            onRehydrateStorage: () => (_state, error) => {
                assetHydrationError = error;
                if (!error) useAssetStore.setState({ hydrated: true });
            },
        },
    ),
);

export async function flushAssetAccount() {
    await assetWrites.flush();
    const previous = useAssetStore.persist.getOptions().name;
    if (!previous?.trim()) throw new Error("资产缓存标识缺失，已停止保存和切换账户");
    if (previous !== ASSET_STORE_KEY && useAssetStore.getState().hydrated) {
        const { assets, deletedAssets } = useAssetStore.getState();
        await assetWrites.write(() => localForageStorage.setItem(previous, JSON.stringify({ state: { assets, deletedAssets }, version: 0 })));
    }
}

export async function switchAssetAccount(userId: string | null, alreadyFlushed = false) {
    if (!alreadyFlushed) await flushAssetAccount();
    switchingAssets = true;
    try {
        useAssetStore.setState({ assets: [], deletedAssets: [], hydrated: false });
        useAssetStore.persist.setOptions({ name: userId ? `${ASSET_STORE_KEY}:${userId}` : ASSET_STORE_KEY });
        if (userId) {
            assetHydrationError = undefined;
            await useAssetStore.persist.rehydrate();
            if (assetHydrationError) throw assetHydrationError;
        }
    } finally {
        switchingAssets = false;
    }
}
