import { useAuthStore } from "@/stores/use-auth-store";
import { matchesCanvasSession } from "@/lib/canvas/canvas-session";

export function captureAccountSession() {
    const current = useAuthStore.getState();
    const owner = current.user?.id ?? null, epoch = current.sessionEpoch;
    const check = () => { if (!matchesCanvasSession(owner, epoch, useAuthStore.getState())) throw new Error("登录会话已变化，请重试"); };
    check();
    return { owner, check };
}
