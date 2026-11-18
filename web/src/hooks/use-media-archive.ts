import { useEffect, useRef, useState } from "react";
import { App } from "antd";
import { useAuthStore } from "@/stores/use-auth-store";
import { captureAccountSession } from "@/lib/account-session";
import { archiveObjectKey, mediaArchive, type MediaArchiveState } from "@/services/api/media-archive";

export function useMediaArchive(url?: string) {
    const key = archiveObjectKey(url);
    const epoch = useAuthStore(state => state.sessionEpoch);
    const { message } = App.useApp();
    const [state, setState] = useState<MediaArchiveState>();
    const [busy, setBusy] = useState(false);
    const request = useRef<AbortController | null>(null);
    useEffect(() => {
        setState(undefined); setBusy(false);
        return () => { request.current?.abort(); request.current = null; };
    }, [key, epoch]);
    const label = busy ? "正在查询…" : state?.state === "completed" ? "已保存到我的存储"
        : state?.state === "waiting" || state?.state === "saving" ? "保存中 · 刷新状态"
        : state?.state === "failed" ? "重试保存到我的存储" : "保存到我的存储";
    return key ? { key: "archive", label, disabled: busy || state?.state === "completed", run: async () => {
        if (request.current) return;
        const session = captureAccountSession();
        if (!session.owner) return;
        const controller = new AbortController(); request.current = controller; setBusy(true);
        try {
            let result = await mediaArchive(key, session.owner, controller.signal);
            session.check();
            if (["external", "failed", "cancelled"].includes(result.state)) {
                result = await mediaArchive(key, session.owner, controller.signal, true);
                session.check();
            }
            if (controller.signal.aborted) return;
            setState(result);
            message.info(result.state === "completed" ? "视频已保存到我的存储" : "保存处理中，原视频仍可使用；可再次点击刷新状态");
        } catch (error) {
            if (!controller.signal.aborted) {
                try { session.check(); message.error(error instanceof Error ? error.message : "保存未完成，请重试"); } catch { /* Account changed. */ }
            }
        } finally {
            if (request.current === controller) { request.current = null; setBusy(false); }
        }
    } } : undefined;
}
