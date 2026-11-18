import type { ApiRequestInit } from "../client";
type Request = <T = unknown>(path: string, init?: ApiRequestInit) => Promise<T>;
export type AdminRole = { id: string; code: string; name: string; description: string; isSystem: boolean; permissions: string[]; userCount: number };
export type Administrator = { id: string; email: string; displayName: string; status: string; roleIds: string[]; roleNames: string[] };
export const accessApi = (request: Request) => ({
    me: () => request<{ permissions: string[] }>("/api/admin/me"),
    roles: () => request<{ roles: AdminRole[]; permissions: string[] }>("/api/admin/roles"),
    administrators: () => request<{ administrators: Administrator[] }>("/api/admin/administrators"),
    saveRole: (id: string | undefined, body: unknown) => request(id ? `/api/admin/roles/${id}` : "/api/admin/roles", { method: id ? "PATCH" : "POST", json: body }),
    deleteRole: (id: string) => request(`/api/admin/roles/${id}`, { method: "DELETE" }),
    addAdmin: (userId: string, roles: string[]) => request("/api/admin/administrators", { method: "POST", json: { userId, roles } }),
    assign: (id: string, roles: string[]) => request(`/api/admin/administrators/${id}/roles`, { method: "PUT", json: { roles } }),
    remove: (id: string) => request(`/api/admin/administrators/${id}`, { method: "DELETE" }),
});
