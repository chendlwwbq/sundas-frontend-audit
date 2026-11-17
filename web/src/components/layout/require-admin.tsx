import type { ReactNode } from "react";
import { Spin } from "antd";
import { Navigate } from "react-router-dom";

import { useAuthStore } from "@/stores/use-auth-store";

export function RequireAdmin({ children }: { children: ReactNode }) {
    const user = useAuthStore((state) => state.user);
    const ready = useAuthStore((state) => state.ready);

    if (!ready) {
        return (
            <div className="flex h-dvh items-center justify-center">
                <Spin />
            </div>
        );
    }
    if (!user || user.role !== "admin") return <Navigate to="/" replace />;
    return <>{children}</>;
}
