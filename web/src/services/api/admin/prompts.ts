import type { ApiRequestInit } from "../client";

type Request = <T = unknown>(path: string, init?: ApiRequestInit) => Promise<T>;
export type PromptSource = { id: string; name: string; url: string; homepage: string; enabled: boolean; promptCount: number; lastSyncAt: string | null; lastError: string };
export type PromptJob = { id: string; trigger: string; status: string; createdAt: string; startedAt: string | null; finishedAt: string | null; error: string; requestedByEmail: string | null };
export type PromptJobSource = { sourceId: string; sourceName: string; status: string; fetched: number; kept: number; filtered: number; error: string; startedAt: string | null; finishedAt: string | null };
export const promptAdminApi = (request: Request) => ({
    save: (source: { id: string; name: string; url: string; homepage: string; enabled: boolean }, creating: boolean) => request(creating ? '/api/admin/prompt-sources' : `/api/admin/prompt-sources/${encodeURIComponent(source.id)}`, { method: creating ? 'POST' : 'PATCH', json: source }),
    sources: () => request<{ sources: PromptSource[] }>("/api/admin/prompt-sources"),
    enable: (id: string, enabled: boolean) => request(`/api/admin/prompt-sources/${encodeURIComponent(id)}`, { method: "PATCH", json: { enabled } }),
    sync: (sourceId?: string) => request<{ jobId: string; status: string; reused: boolean; existingJobIds: string[] }>("/api/admin/prompt-syncs", { method: "POST", json: sourceId ? { sourceId } : {} }),
    jobs: (page: number, sourceId = "", status = "") => request<{ items: PromptJob[]; total: number; pageSize: number }>(`/api/admin/prompt-syncs?${new URLSearchParams({ page: String(page), sourceId, status })}`),
    job: (id: string) => request<{ job: PromptJob; sources: PromptJobSource[] }>(`/api/admin/prompt-syncs/${encodeURIComponent(id)}`),
});
