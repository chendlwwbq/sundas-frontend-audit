import { useMemo } from "react";
import { ApiError, apiRequest, type ApiRequestInit } from "@/services/api/client";
import { useAuthStore } from "@/stores/use-auth-store";
import { matchesCanvasSession } from "@/lib/canvas/canvas-session";

export function createAdminRequest(owner: string | null, epoch: number) {
    const check = () => {
        const auth = useAuthStore.getState();
        if (!owner || auth.user?.role !== "admin" || !matchesCanvasSession(owner, epoch, auth)) throw new Error("管理员会话已变化，请重新操作");
    };
    return async <T = unknown>(path: string, init: ApiRequestInit = {}): Promise<T> => {
        check();
        const headers = new Headers(init.headers);
        headers.set("X-Sundas-User", owner!);
        let result: T;
        try {
            result = await apiRequest<T>(path, { ...init, headers: Object.fromEntries(headers.entries()) });
        } catch (error) {
            if (error instanceof ApiError && error.status === 403 && path !== "/api/admin/me") window.dispatchEvent(new Event("sundas-admin-permissions-changed"));
            throw error;
        }
        check();
        return result;
    };
}

export function useAdminRequest() {
    const owner = useAuthStore((state) => state.user?.id ?? null);
    const epoch = useAuthStore((state) => state.sessionEpoch);
    return useMemo(() => createAdminRequest(owner, epoch), [owner, epoch]);
}

export function useAdminScope() {
    const owner = useAuthStore((state) => state.user?.id ?? null);
    const epoch = useAuthStore((state) => state.sessionEpoch);
    return useMemo(() => ({ owner, current: () => {
        const auth = useAuthStore.getState();
        return Boolean(owner && auth.user?.role === "admin" && matchesCanvasSession(owner, epoch, auth));
    } }), [owner, epoch]);
}
