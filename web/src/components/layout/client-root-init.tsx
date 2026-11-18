import { useEffect } from "react";
import type { ReactNode } from "react";
import { App } from "antd";

import { useCloudSync } from "@/hooks/use-cloud-sync";
import { applyServerModels, type ServerModel } from "@/lib/server-models";
import { apiRequest } from "@/services/api/client";
import { useAuthStore } from "@/stores/use-auth-store";
import { subscribeSessionChanges } from "@/lib/session-broadcast";

export function ClientRootInit({ children }: { children: ReactNode }) {
    const { message } = App.useApp();
    useCloudSync();

    useEffect(() => {
        void useAuthStore.getState().hydrate().catch((error) => message.error(error instanceof Error ? error.message : "无法确认登录状态"));
        return subscribeSessionChanges(() => { void useAuthStore.getState().externalSessionChanged().catch((error) => message.error(error instanceof Error ? error.message : "无法确认登录状态")); });
    }, []);

    useEffect(() => {
        const refresh = () => { if (document.visibilityState === "visible") void useAuthStore.getState().refreshWallet().catch(() => undefined); };
        document.addEventListener("visibilitychange", refresh);
        window.addEventListener("online", refresh);
        return () => { document.removeEventListener("visibilitychange", refresh); window.removeEventListener("online", refresh); };
    }, []);

    useEffect(() => {
        let cancelled = false;
        apiRequest<{ models: ServerModel[] }>("/api/models")
            .then((data) => {
                if (!cancelled && data.models.length) applyServerModels(data.models);
            })
            .catch(() => {
                // 模型列表拉取失败时保留本地缓存，登录后还会再拉一次。
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return <>{children}</>;
}
