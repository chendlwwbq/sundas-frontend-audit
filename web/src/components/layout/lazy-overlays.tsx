import { Suspense, lazy, useEffect, useState } from "react";

import { useAuthDialogStore } from "@/stores/use-auth-dialog-store";
import { useConfigStore } from "@/stores/use-config-store";

/**
 * 全局浮层（登录弹窗 / 偏好设置弹窗）按需加载：
 * 这两块只在用户主动触发时才出现，但会静态带进 antd 的 Form / Modal / Select / Radio / Switch，
 * 是首屏包最大的一块业务开销。默认不挂载 → chunk 不下载；
 * 首次打开后保持挂载，关闭动画与内部状态与原来一致。
 */
const AuthDialog = lazy(() => import("@/components/auth/auth-dialog").then((module) => ({ default: module.AuthDialog })));
const AppConfigModal = lazy(() => import("@/components/layout/app-config-modal").then((module) => ({ default: module.AppConfigModal })));

function useKeepMountedWhen(open: boolean) {
    const [mounted, setMounted] = useState(open);
    useEffect(() => {
        if (open) setMounted(true);
    }, [open]);
    return mounted;
}

export function AuthDialogHost() {
    const open = useAuthDialogStore((state) => state.mode !== null);
    const mounted = useKeepMountedWhen(open);
    if (!mounted) return null;
    return (
        <Suspense fallback={null}>
            <AuthDialog />
        </Suspense>
    );
}

export function AppConfigModalHost() {
    const open = useConfigStore((state) => state.isConfigOpen);
    const mounted = useKeepMountedWhen(open);
    if (!mounted) return null;
    return (
        <Suspense fallback={null}>
            <AppConfigModal />
        </Suspense>
    );
}
