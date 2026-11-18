import { apiRequest } from "./client";

export type StorageCategoryKey = "generated_images" | "generated_videos" | "history_uploads";

export type StorageSummary = {
    usedBytes: number;
    limitBytes: number;
    cleanableFiles: number;
    cleanableBytes: number;
    categories: Array<{ key: StorageCategoryKey; files: number; bytes: number }>;
};

export type StorageItem = {
    id: string;
    name: string;
    kind: string;
    mime: string;
    bytes: number;
    createdAt: string;
    pinned: boolean;
    url: string;
    canDelete: boolean;
};

export type StoragePage = {
    total: number;
    page: number;
    pageSize: number;
    category: StorageCategoryKey;
    items: StorageItem[];
};

export function fetchStorageSummary() {
    return apiRequest<StorageSummary>("/api/storage");
}

export function fetchStorageItems(category: StorageCategoryKey, page = 1, pageSize = 20, protectedOnly = false) {
    return apiRequest<StoragePage>(`/api/storage/items?${new URLSearchParams({ category, page: String(page), pageSize: String(pageSize), protected: String(protectedOnly) })}`);
}

export function deleteStorageMedia(id: string) {
    return apiRequest<{ ok: true }>(`/api/storage/media/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function cleanupHistoryStorage() {
    return apiRequest<{ deleted: number; bytes: number; failed: number }>("/api/storage/cleanup-history", { method: "POST" });
}

export type StorageSource = {kind:string;owner:string;project:string|null;title:string;releasable:boolean;draft:boolean};
export function storageSources(id:string) {
    return apiRequest<{sources:StorageSource[];pinned:boolean;active:boolean;disputed:boolean}>(`/api/storage/media/${encodeURIComponent(id)}/sources`);
}
export function releaseStorageSource(id:string, source:StorageSource) {
    return apiRequest(`/api/storage/media/${encodeURIComponent(id)}/sources/release`, {method:'POST',json:{kind:source.kind,owner:source.owner,project:source.project}});
}
