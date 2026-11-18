import type { ApiRequestInit } from "../client";
type Request = <T = unknown>(path: string, init?: ApiRequestInit) => Promise<T>;
export type UserDetails = { user: { id: string; email: string; displayName: string; role: string; status: string; createdAt: string; lastLoginAt: string | null }; wallet: Record<string, unknown> | null; subscriptions: Record<string, unknown>[] };
export const adminUserApi = (request: Request) => ({
    detail: (id: string) => request<UserDetails>(`/api/admin/users/${encodeURIComponent(id)}`),
    records: (id: string, kind: string, page: number) => request<{ items: Record<string, unknown>[]; total: number; pageSize: number }>(`/api/admin/users/${encodeURIComponent(id)}/records/${kind}?page=${page}`),
    nickname: (id: string, displayName: string) => request(`/api/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", json: { displayName } }),
    resetPassword: (id: string, password: string, note: string) => request(`/api/admin/users/${encodeURIComponent(id)}/reset-password`, { method: "POST", json: { password, note } }),
});
