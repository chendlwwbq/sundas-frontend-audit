import type { ReactNode } from "react";
import { Spin } from "antd";
import { Navigate, useLocation } from "react-router-dom";

import { useAuthStore } from "@/stores/use-auth-store";

export function RequireAuth({ children }: { children: ReactNode }) {
    const user = useAuthStore((state) => state.user);
    const ready = useAuthStore((state) => state.ready);
    const location = useLocation();

    if (!ready) {
        return (
            <div className="flex h-full items-center justify-center">
                <Spin />
            </div>
        );
    }
    if (!user) {
        return <Navigate to={`/login?redirect=${encodeURIComponent(`${location.pathname}${location.search}`)}`} replace />;
    }
    return <>{children}</>;
}
