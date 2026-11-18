import { Suspense, lazy, useEffect, useState } from "react";
import { create } from "zustand";

import { useAuthDialogStore } from "@/stores/use-auth-dialog-store";
import { useConfigStore } from "@/stores/use-config-store";
import { usePromoContactStore } from "@/stores/use-promo-contact-store";

/**
 * 全局浮层（登录弹窗 / 系统配置弹窗 / 推广与联系弹窗）按需加载并执行优先级队列互斥：
 * 优先级：AuthDialog > AppConfigModal > PromoContactDialog > PromoPopup
 * 同一时刻只允许渲染最高优先级的一个模态框，避免双层黑底遮罩叠加。
 */
const AuthDialog = lazy(() => import("@/components/auth/auth-dialog").then((module) => ({ default: module.AuthDialog })));
const AppConfigModal = lazy(() => import("@/components/layout/app-config-modal").then((module) => ({ default: module.AppConfigModal })));
const PromoContactDialog = lazy(() => import("@/components/promo/promo-contact-dialog").then((module) => ({ default: module.PromoContactDialog })));

type OverlayKind = "auth" | "config" | "promo-contact" | "promo-popup";

const usePromoPopupQueueStore = create<{ requested: boolean; setRequested: (requested: boolean) => void }>((set) => ({
    requested: false,
    setRequested: (requested) => set({ requested }),
}));

export function usePromoPopupSlot(wantOpen: boolean): boolean {
    const setRequested = usePromoPopupQueueStore((state) => state.setRequested);
    useEffect(() => {
        setRequested(wantOpen);
        return () => setRequested(false);
    }, [setRequested, wantOpen]);
    return useActiveOverlay() === "promo-popup" && wantOpen;
}

function useActiveOverlay(): OverlayKind | null {
    const authOpen = useAuthDialogStore((state) => state.mode !== null);
    const configOpen = useConfigStore((state) => state.isConfigOpen);
    const promoContactOpen = usePromoContactStore((state) => state.open);
    const promoPopupOpen = usePromoPopupQueueStore((state) => state.requested);
    if (authOpen) return "auth";
    if (configOpen) return "config";
    if (promoContactOpen) return "promo-contact";
    if (promoPopupOpen) return "promo-popup";
    return null;
}

function useKeepMountedWhen(open: boolean) {
    const [mounted, setMounted] = useState(open);
    useEffect(() => {
        if (open) setMounted(true);
    }, [open]);
    return mounted;
}

export function AuthDialogHost() {
    const active = useActiveOverlay() === "auth";
    const mounted = useKeepMountedWhen(active);
    if (!mounted || !active) return null;
    return (
        <Suspense fallback={null}>
            <AuthDialog />
        </Suspense>
    );
}

export function AppConfigModalHost() {
    const active = useActiveOverlay() === "config";
    const mounted = useKeepMountedWhen(active);
    if (!mounted || !active) return null;
    return (
        <Suspense fallback={null}>
            <AppConfigModal />
        </Suspense>
    );
}

export function PromoContactDialogHost() {
    const active = useActiveOverlay() === "promo-contact";
    const mounted = useKeepMountedWhen(active);
    if (!mounted || !active) return null;
    return (
        <Suspense fallback={null}>
            <PromoContactDialog />
        </Suspense>
    );
}
