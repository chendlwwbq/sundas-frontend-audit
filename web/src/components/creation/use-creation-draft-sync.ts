import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { removePromptParameter, takePendingPrompt, type PendingReference } from "@/lib/pending-prompt";
import { ensureImagePreview } from "@/services/image-storage";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import {
    isCreationDraftEmpty,
    loadCreationDraft,
    readCreationDraft,
    saveCreationDraft,
    type Continuation,
    type CreationDraft,
    type DraftSaveStatus,
} from "./creation-drafts";

const DRAFT_SAVE_DEBOUNCE_MS = 500;

type UseCreationDraftSyncOptions = {
    mode: "image" | "video";
    userId?: string;
    sessionEpoch: number;
    viewOwner?: string;
    viewEpoch?: number;
    accountEpochRef: React.MutableRefObject<number>;
    isCurrentUser: (owner: string, epoch: number) => boolean;
    continuation?: Continuation;
    prompt: string;
    references: ReferenceImage[];
    videos?: ReferenceVideo[];
    audios?: ReferenceAudio[];
    onRestoreDraft: (draft: CreationDraft) => void;
    onApplyInitialPrompt: (payload: { prompt: string; references: PendingReference[]; appendReferences?: boolean; hasPending: boolean }) => boolean | void;
};

type PendingWrite = {
    mode: "image" | "video";
    userId: string;
    sessionEpoch: number;
    epoch: number;
    draft: CreationDraft;
};

export function useCreationDraftSync({
    mode,
    userId,
    sessionEpoch,
    viewOwner,
    viewEpoch,
    accountEpochRef,
    isCurrentUser,
    continuation,
    prompt,
    references,
    videos = [],
    audios = [],
    onRestoreDraft,
    onApplyInitialPrompt,
}: UseCreationDraftSyncOptions) {
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();

    const [draftStatus, setDraftStatus] = useState<DraftSaveStatus>({ state: "idle" });
    const [compositionSeq, setCompositionSeq] = useState(0);
    const composingRef = useRef(false);
    const hydratedDraftKeyRef = useRef("");
    const userEditedBeforeHydrateRef = useRef(false);
    const appliedInitialPromptRef = useRef<string | undefined>(undefined);
    const debounceTimerRef = useRef<number | null>(null);
    const idleCallbackRef = useRef<number | null>(null);
    const pendingWriteRef = useRef<PendingWrite | null>(null);
    const callbacksRef = useRef({ onRestoreDraft, onApplyInitialPrompt, isCurrentUser });
    callbacksRef.current = { onRestoreDraft, onApplyInitialPrompt, isCurrentUser };

    const clearScheduledWrite = useCallback(() => {
        if (debounceTimerRef.current !== null) {
            window.clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }
        if (idleCallbackRef.current !== null) {
            if (typeof window.cancelIdleCallback === "function") {
                window.cancelIdleCallback(idleCallbackRef.current);
            } else {
                window.clearTimeout(idleCallbackRef.current);
            }
            idleCallbackRef.current = null;
        }
    }, []);

    const flush = useCallback(() => {
        clearScheduledWrite();
        const pending = pendingWriteRef.current;
        if (!pending) return;
        pendingWriteRef.current = null;
        void saveCreationDraft(pending.mode, pending.userId, pending.sessionEpoch, pending.draft).then((status) => {
            if (callbacksRef.current.isCurrentUser(pending.userId, pending.sessionEpoch) && accountEpochRef.current === pending.epoch) {
                setDraftStatus(status);
            }
        });
    }, [accountEpochRef, clearScheduledWrite]);

    // 账户或会话切换时，先落盘上一会话挂起草稿，再恢复当前账号本地草稿。
    const hydrateForSession = useCallback(
        (epoch: number) => {
            flush();
            setDraftStatus({ state: "idle" });
            hydratedDraftKeyRef.current = "";
            userEditedBeforeHydrateRef.current = false;
            const sessionKey = userId ? `${userId}:${sessionEpoch}` : "";
            const syncDraft = userId ? readCreationDraft(mode, userId, sessionEpoch) : undefined;
            if (syncDraft) {
                hydratedDraftKeyRef.current = sessionKey;
                callbacksRef.current.onRestoreDraft(syncDraft);
                setDraftStatus({ state: "saved", savedAt: syncDraft.updatedAt });
                return;
            }
            callbacksRef.current.onRestoreDraft({ continuation: undefined, prompt: "", references: [], videos: [], audios: [] });
            if (!userId) return;
            void loadCreationDraft(mode, userId, sessionEpoch).then((loaded) => {
                if (!callbacksRef.current.isCurrentUser(userId, sessionEpoch) || accountEpochRef.current !== epoch) return;
                hydratedDraftKeyRef.current = sessionKey;
                if (!loaded || appliedInitialPromptRef.current?.startsWith(`${sessionKey}:`) || userEditedBeforeHydrateRef.current) return;
                loaded.references.forEach((item) => {
                    if (item.storageKey) void ensureImagePreview(item.storageKey);
                });
                callbacksRef.current.onRestoreDraft(loaded);
                setDraftStatus({ state: "saved", savedAt: loaded.updatedAt });
            });
        },
        [accountEpochRef, flush, mode, sessionEpoch, userId],
    );

    // 恢复来自首页、提示词库或 URL ?prompt= 的跨页创作指令。
    useEffect(() => {
        const navKey = `${userId}:${sessionEpoch}:${location.key}`;
        if (!userId || viewOwner !== userId || viewEpoch !== sessionEpoch || !callbacksRef.current.isCurrentUser(userId, sessionEpoch) || appliedInitialPromptRef.current === navKey) return;
        const pending = takePendingPrompt(mode, userId);
        const initialPrompt = pending?.prompt || searchParams.get("prompt") || "";
        if (searchParams.has("prompt")) {
            const rest = removePromptParameter(searchParams).toString();
            navigate({ pathname: location.pathname, search: rest ? `?${rest}` : "", hash: location.hash }, { replace: true });
        }
        if (!initialPrompt && !pending?.references.length) return;
        const applied = callbacksRef.current.onApplyInitialPrompt({
            prompt: initialPrompt,
            references: pending?.references ?? [],
            appendReferences: pending?.appendReferences,
            hasPending: Boolean(pending),
        });
        if (applied !== false) appliedInitialPromptRef.current = navKey;
    }, [searchParams, mode, userId, viewOwner, viewEpoch, sessionEpoch, navigate, location.pathname, location.hash, location.key]);

    // 跟踪 IME 组合输入态，避免拼音候选期间每次击键触发草稿状态抖动与定时器重建。
    useEffect(() => {
        const handleCompositionStart = () => {
            composingRef.current = true;
        };
        const handleCompositionEnd = () => {
            if (!composingRef.current) return;
            composingRef.current = false;
            setCompositionSeq((seq) => seq + 1);
        };
        document.addEventListener("compositionstart", handleCompositionStart, true);
        document.addEventListener("compositionend", handleCompositionEnd, true);
        return () => {
            document.removeEventListener("compositionstart", handleCompositionStart, true);
            document.removeEventListener("compositionend", handleCompositionEnd, true);
        };
    }, []);

    // 500ms 防抖 + 浏览器空闲帧（requestIdleCallback）写盘，避免每次按键同步序列化写库。
    useEffect(() => {
        if (!userId || viewOwner !== userId || viewEpoch !== sessionEpoch) return;
        const sessionKey = `${userId}:${sessionEpoch}`;
        if (hydratedDraftKeyRef.current !== sessionKey) return;
        const draft: CreationDraft = { continuation, prompt, references, videos, audios };
        const epoch = accountEpochRef.current;
        pendingWriteRef.current = { mode, userId, sessionEpoch, epoch, draft };
        if (composingRef.current) return;
        if (!isCreationDraftEmpty(draft)) setDraftStatus({ state: "saving" });

        clearScheduledWrite();
        debounceTimerRef.current = window.setTimeout(() => {
            debounceTimerRef.current = null;
            const runWrite = () => {
                idleCallbackRef.current = null;
                const current = pendingWriteRef.current;
                if (!current) return;
                pendingWriteRef.current = null;
                void saveCreationDraft(current.mode, current.userId, current.sessionEpoch, current.draft).then((status) => {
                    if (callbacksRef.current.isCurrentUser(current.userId, current.sessionEpoch) && accountEpochRef.current === current.epoch) {
                        setDraftStatus(status);
                    }
                });
            };
            if (typeof window.requestIdleCallback === "function") {
                idleCallbackRef.current = window.requestIdleCallback(() => runWrite(), { timeout: 1500 });
            } else {
                idleCallbackRef.current = window.setTimeout(runWrite, 0);
            }
        }, DRAFT_SAVE_DEBOUNCE_MS);
    }, [accountEpochRef, audios, clearScheduledWrite, compositionSeq, continuation, mode, prompt, references, sessionEpoch, userId, videos, viewEpoch, viewOwner]);

    // 页面切入后台、关闭或路由卸载时兜底立即 flush 未写盘的草稿。
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") flush();
        };
        const handlePageHide = () => flush();
        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("pagehide", handlePageHide);
        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("pagehide", handlePageHide);
            flush();
        };
    }, [flush]);

    const markUserEdited = useCallback(() => {
        userEditedBeforeHydrateRef.current = true;
    }, []);

    return { draftStatus, hydrateForSession, markUserEdited, flushDraft: flush };
}
