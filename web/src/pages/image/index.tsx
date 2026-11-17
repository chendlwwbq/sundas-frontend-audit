import { useCreationChat, handoffCreationToChat, ensureCreationThread, newCreationThread, saveCreationRecord } from "@/pages/chat/chat-store";
import { RecordActions } from "@/components/creation/record-actions";
import { CreationToolbar } from "@/components/creation/creation-toolbar";
import { Button as ActionButton } from "@astryxdesign/core/Button";
import { CreationRequest, ContinuationNotice, continuationPrompt } from "@/components/creation/creation-conversation";
import { isCreationDraftEmpty, loadCreationDraft, readCreationDraft, saveCreationDraft, type Continuation, type DraftSaveStatus } from "@/components/creation/creation-drafts";
import { PromptOptimizationEstimate } from "@/components/creation/prompt-optimization-estimate";
import { OtherCreationRecord, useOtherCreationHistory } from "@/components/creation/mixed-creation-history";
import { ChatComposer } from "@astryxdesign/core/Chat";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import { Lightbox } from "@astryxdesign/core/Lightbox";
import { CreationStream } from "@/components/creation/creation-stream";
import { CreationRecordsRail, useNarrowRecords } from "@/components/creation/creation-records-rail";
import { CreditEstimate } from "@/components/creation/credit-estimate";
import { useCreationHistory } from "@/components/creation/creation-history";
import { useVisibleRecords } from "@/components/creation/use-visible-records";
import { useReferenceTransfer } from "@/components/creation/use-reference-transfer";
import { creationStatus } from "@/components/creation/creation-status";
import { GenerationHistoryPager, mergeGenerationHistory, generationTaskIds, hideGenerationHistory } from "@/services/api/generation-history";
import { ArrowLeft, ArrowRight, BookOpen, CheckSquare, ClipboardPaste, Download, FolderPlus, History, LoaderCircle, PenLine, Plus, SlidersHorizontal, Sparkles, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { App, Button, Checkbox, Drawer, Empty, Input, Modal, Tag, Tooltip, Typography } from "antd";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { removePromptParameter, storePendingPrompt, takePendingPrompt } from "@/lib/pending-prompt";
import { imageLogStorage } from "@/lib/image-log-storage";

import { ImageSettingsPanel } from "@/components/image-settings-panel";
import { PromptOptimizeButton } from "@/components/prompt-optimize-button";
import { ModelPicker } from "@/components/model-picker";
import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { canvasThemes } from "@/lib/canvas-theme";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { mediaFileKind } from "@/lib/media-file";
import { modelOptionLabel, normalizeModelOptionValue, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { nanoid } from "nanoid";
import { formatBytes, formatDuration } from "@/lib/image-utils";
import { imageTaskIdFromError, requestEdit, requestGeneration } from "@/services/api/image";
import { ensureImagePreview, getImagePreviewRevision, previewUrlFor, resolveImageUrl, retryLocalImage, subscribeImagePreviews, uploadImage } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";
import type { ReferenceImage } from "@/types/image";
import i18n from "@/i18n";

type GeneratedImage = {
    taskId?: string;
    id: string;
    dataUrl: string;
    storageKey?: string;
    durationMs: number;
    width: number;
    height: number;
    bytes: number;
    mimeType?: string;
};

type ImageRequestSnapshot = {
    text: string;
    model: string;
    config: AiConfig;
    references: ReferenceImage[];
};

type GenerationResult = {
    id: string;
    status: "pending" | "success" | "failed";
    image?: GeneratedImage;
    error?: string;
    snapshot?: ImageRequestSnapshot;
};

type GenerationLog = {
    serverTaskIds?: string[];
    id: string;
    createdAt: number;
    title: string;
    prompt: string;
    time: string;
    model: string;
    config: GenerationLogConfig;
    references: ReferenceImage[];
    durationMs: number;
    successCount: number;
    failCount: number;
    imageCount: number;
    size: string;
    quality: string;
    status: "success" | "failed" | "pending" | "unavailable";
    images: GeneratedImage[];
    error?: string;
    creditsCharged?: number;
    reconciliationRequired?: boolean;
    referenceHistoryUnknown?: boolean;
};

type GenerationLogConfig = Pick<AiConfig, "model" | "imageModel" | "quality" | "size" | "count"> & Partial<Pick<AiConfig, "background">>;

type UpdateAiConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;

const RESULT_ACTION_BUTTON_CLASS = "min-w-0 px-1.5 [&_.ant-btn-icon]:shrink-0 [&>span:last-child]:min-w-0 [&>span:last-child]:truncate";

export default function ImagePage() {
    const { message } = App.useApp();
    const { run: transferReference, isTransferring } = useReferenceTransfer();
    const reportMediaError = (error: unknown) => { if (!(error instanceof Error && error.name === "AbortError")) message.error(error instanceof Error ? error.message : String(error)); };
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragDepthRef = useRef(0);
    const accountEpochRef = useRef(0);
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const addAsset = useAssetStore((state) => state.addAsset);
    const userId = useAuthStore((state) => state.ready ? state.user?.id : undefined);
    const sessionEpoch = useAuthStore((state) => state.sessionEpoch);
    const [viewOwner, setViewOwner] = useState<string | undefined>();
    const [viewEpoch, setViewEpoch] = useState<number | undefined>();
    const isCurrentView = () => Boolean(userId && viewOwner === userId && viewEpoch === sessionEpoch && isCurrentUser(userId, sessionEpoch));
    const [prompt, setPrompt] = useState("");
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();
    const appliedInitialPrompt = useRef<string | undefined>(undefined);
    const [references, setReferences] = useState<ReferenceImage[]>([]);
    const [continuation, setContinuation] = useState<Continuation>();
    const [submittedPrompt, setSubmittedPrompt] = useState("");
    const [draftStatus, setDraftStatus] = useState<DraftSaveStatus>({ state: "idle" });
    const hydratedDraftKeyRef = useRef("");
    const userEditedBeforeHydrateRef = useRef(false);
    useEffect(() => {
        if (!userId || viewOwner !== userId || viewEpoch !== sessionEpoch) return;
        const sessionKey = `${userId}:${sessionEpoch}`;
        if (hydratedDraftKeyRef.current !== sessionKey) return;
        const draft = { continuation, prompt, references, videos: [], audios: [] };
        const epoch = accountEpochRef.current;
        if (!isCreationDraftEmpty(draft)) setDraftStatus({ state: "saving" });
        void saveCreationDraft("image", userId, sessionEpoch, draft).then((status) => {
            if (isCurrentUser(userId, sessionEpoch) && accountEpochRef.current === epoch) setDraftStatus(status);
        });
    }, [userId, viewOwner, viewEpoch, sessionEpoch, continuation, prompt, references]);
    const [results, setResults] = useState<GenerationResult[]>([]);
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const requestedRecord = searchParams.get("record");
    const targetRecord = logs.find((log) => log.id === requestedRecord || (requestedRecord && generationTaskIds(log).includes(requestedRecord)))?.id;

    const otherHistory = useOtherCreationHistory(userId, sessionEpoch, "video");
    const mixedLogs = [...logs.map(log => ({ id: log.id, kind: "active" as const, log })), ...otherHistory.logs.map(log => ({ id: log.id, kind: "other" as const, log }))].sort((a, b) => b.log.createdAt - a.log.createdAt);
    const visibleHistory = useVisibleRecords(mixedLogs, userId, targetRecord ?? requestedRecord);

    const mixedRecords = visibleHistory.records;
    const locatedRecordRef = useRef("");
    const historyPagerRef = useRef<GenerationHistoryPager | null>(null);
    const [historyHasMore, setHistoryHasMore] = useState(false);
    const [loadingEarlier, setLoadingEarlier] = useState(false);
    useEffect(() => {
        const pager = historyPagerRef.current;
        if (!userId || viewOwner !== userId || viewEpoch !== sessionEpoch || !pager || !requestedRecord || targetRecord || !/^[0-9a-f-]{36}$/i.test(requestedRecord)) return;
        let active = true;
        void pager.loadRecord(requestedRecord).then(async snapshot => {
            if (!active || historyPagerRef.current !== pager) return;
            if (!snapshot.logs.some(log => log.id === requestedRecord)) { message.info("该记录不存在或已隐藏"); return; }
            const { items, hasMore } = await readStoredLogs(userId, pager);
            if (active && historyPagerRef.current === pager) { setLogs(items); setHistoryHasMore(hasMore); }
        }).catch(() => { if (active) message.error("记录加载失败，请重试"); });
        return () => { active = false; };
    }, [userId, sessionEpoch, viewOwner, viewEpoch, requestedRecord, targetRecord]);

    useEffect(() => {
        if (!userId || viewOwner !== userId || viewEpoch !== sessionEpoch) return;
        useCreationHistory.getState().update(`${userId}:${sessionEpoch}`, "image", logs.map((log) => ({ id: log.id, title: log.title, createdAt: log.createdAt, mode: "image" })));
    }, [logs, userId, viewOwner, viewEpoch, sessionEpoch]);
    useEffect(() => {
        const id = targetRecord;
        const navigation = `${userId}:${sessionEpoch}:${location.key}:${id}`;
        if (id && locatedRecordRef.current !== navigation && logs.some((log) => log.id === id)) {
            requestAnimationFrame(() => requestAnimationFrame(() => {
                const record = document.getElementById(`creation-record-${id}`);
                if (record && locatedRecordRef.current !== navigation) { locatedRecordRef.current = navigation; record.scrollIntoView({ block: "center" }); }
            }));
        }
    }, [logs, targetRecord, location.key, userId, sessionEpoch]);
    const [running, setRunning] = useState(false);
    const [logsOpen, setLogsOpen] = useState(false);
    // 宽屏把「生成记录」停靠在右侧，窄屏仍走底部抽屉
    const [recordsRailOpen, setRecordsRailOpen] = useState(false);
    const narrowRecords = useNarrowRecords();
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [referenceOpen, setReferenceOpen] = useState(false);
    const [promptDialogOpen, setPromptDialogOpen] = useState(false);

    useEffect(() => {
        if (!userId || viewOwner !== userId || viewEpoch !== sessionEpoch || !isCurrentUser(userId, sessionEpoch) || appliedInitialPrompt.current === `${userId}:${sessionEpoch}:${location.key}`) return;
        const pending = takePendingPrompt("image", userId);
        if (pending) setContinuation(undefined);
        const initialPrompt = pending?.prompt || searchParams.get("prompt") || "";
        if (searchParams.has("prompt")) {
            const rest = removePromptParameter(searchParams).toString();
            navigate({ pathname: location.pathname, search: rest ? `?${rest}` : "", hash: location.hash }, { replace: true });
        }
        const pendingImages = pending?.references.filter((reference) => !reference.kind || reference.kind === "image") ?? [];
        if (!initialPrompt && !pendingImages.length) return;
        appliedInitialPrompt.current = `${userId}:${sessionEpoch}:${location.key}`;
        if (initialPrompt) setPrompt(initialPrompt);
        if (pending) setReferences(pendingImages.map((reference) => ({ id: nanoid(), name: reference.name, type: reference.type, dataUrl: reference.dataUrl, storageKey: reference.storageKey })));
    }, [searchParams, userId, viewOwner, viewEpoch, sessionEpoch, navigate, location.pathname, location.hash, location.key]);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [startedAt, setStartedAt] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
    const [previewLog, setPreviewLog] = useState<GenerationLog | null>(null);
    const [detailsLog, setDetailsLog] = useState<GenerationLog | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [isReferenceDragActive, setIsReferenceDragActive] = useState(false);
    const [autoRunToken, setAutoRunToken] = useState(0);
    const imageCommand = useWorkbenchAgentStore((state) => state.imageCommand);
    const clearImageCommand = useWorkbenchAgentStore((state) => state.clearImageCommand);
    const updateAgentTask = useWorkbenchAgentStore((state) => state.updateTask);
    const processedCommandRef = useRef(0);
    const agentTaskIdRef = useRef<string | undefined>(undefined);

    const model = effectiveConfig.imageModel || effectiveConfig.model;
    const canGenerate = Boolean(prompt.trim());
    const generationCount = Math.max(1, Math.min(10, Number(config.count) || 1));

    useEffect(() => {
        if (!running || !startedAt) return;
        const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 1000);
        return () => window.clearInterval(timer);
    }, [running, startedAt]);

    useEffect(() => {
        const epoch = accountEpochRef.current + 1;
        accountEpochRef.current = epoch;
        historyPagerRef.current = userId ? new GenerationHistoryPager(userId, "image") : null;
        setHistoryHasMore(false); setLoadingEarlier(false);
        agentTaskIdRef.current = undefined;
        setAutoRunToken(0);
        setLogs([]); setResults([]); setPreviewLog(null); setDetailsLog(null); setSelectedLogIds([]); setRunning(false); setStartedAt(0);
        setDraftStatus({ state: "idle" });
        hydratedDraftKeyRef.current = "";
        userEditedBeforeHydrateRef.current = false;
        const sessionKey = userId ? `${userId}:${sessionEpoch}` : "";
        const draft = userId ? readCreationDraft("image", userId, sessionEpoch) : undefined;
        setContinuation(draft?.continuation); setPrompt(draft?.prompt ?? ""); setReferences(draft?.references ?? []);
        if (draft) {
            hydratedDraftKeyRef.current = sessionKey;
            setDraftStatus({ state: "saved", savedAt: draft.updatedAt });
        }
        setViewOwner(userId); setViewEpoch(sessionEpoch);
        if (userId) {
            void refreshLogs();
            if (!draft) {
                void loadCreationDraft("image", userId, sessionEpoch).then((loaded) => {
                    if (!isCurrentUser(userId, sessionEpoch) || accountEpochRef.current !== epoch) return;
                    hydratedDraftKeyRef.current = sessionKey;
                    if (!loaded || appliedInitialPrompt.current?.startsWith(`${sessionKey}:`) || userEditedBeforeHydrateRef.current) return;
                    loaded.references.forEach((item) => { if (item.storageKey) void ensureImagePreview(item.storageKey); });
                    setContinuation(loaded.continuation);
                    setPrompt(loaded.prompt);
                    setReferences(loaded.references);
                    setDraftStatus({ state: "saved", savedAt: loaded.updatedAt });
                });
            }
        }
    }, [userId, sessionEpoch]);

    const addReferences = async (files?: FileList | null) => {
        const owner = userId, epoch = accountEpochRef.current;
        if (!owner || !isCurrentUser(owner, sessionEpoch)) return;
        const selected = Array.from(files || []);
        const imageFiles = selected.filter((file) => mediaFileKind(file) === "image");
        if (imageFiles.length < selected.length) message.warning(t("imageWorkbench.unsupportedFiles"));
        if (!imageFiles.length) return;
        const queued = imageFiles.map((file) => ({ id: nanoid(), file, previewUrl: URL.createObjectURL(file) }));
        setReferences((value) => [...value, ...queued.map(({ id, file, previewUrl }) => ({ id, name: file.name, type: file.type, dataUrl: previewUrl, queued: true, progress: 0 }))]);
        let succeeded = 0;
        for (const item of queued) {
            if (!isCurrentUser(owner, sessionEpoch) || accountEpochRef.current !== epoch) return;
            setReferences((value) => value.map((ref) => (ref.id === item.id ? { ...ref, queued: false, uploading: true, progress: 0 } : ref)));
            try {
                const image = await uploadImage(item.file, {
                    expectedOwner: owner,
                    onProgress: (progress) => setReferences((value) => value.map((ref) => (ref.id === item.id ? { ...ref, progress } : ref))),
                });
                succeeded += 1;
                setReferences((value) => value.map((ref) => (ref.id === item.id ? { ...ref, dataUrl: image.url, type: image.mimeType, storageKey: image.storageKey, uploading: false, queued: false, progress: 100, error: undefined } : ref)));
                if (image.url !== item.previewUrl) window.setTimeout(() => URL.revokeObjectURL(item.previewUrl), 1000);
            } catch (error) {
                setReferences((value) => value.map((ref) => (ref.id === item.id ? { ...ref, uploading: false, queued: false, progress: 0, error: error instanceof Error ? error.message : String(error) } : ref)));
                reportMediaError(error);
            }
        }
        if (succeeded) message.success(t("imageWorkbench.referenceAdded", { count: succeeded }));
    };
    const retryReference = async (item: ReferenceImage) => {
        if (!item.storageKey || item.uploading) return;
        const owner = userId, epoch = accountEpochRef.current;
        if (!owner || !isCurrentUser(owner, sessionEpoch)) return;
        setReferences((value) => value.map((ref) => ref.id === item.id ? { ...ref, uploading: true, queued: false, progress: 0, error: undefined } : ref));
        try {
            const image = await retryLocalImage(item.storageKey, {
                expectedOwner: owner,
                onProgress: (progress) => setReferences((value) => value.map((ref) => ref.id === item.id ? { ...ref, progress } : ref)),
            });
            if (!isCurrentUser(owner, sessionEpoch) || accountEpochRef.current !== epoch) return;
            setReferences((value) => value.map((ref) => ref.id === item.id ? { ...ref, dataUrl: image.url, type: image.mimeType, storageKey: undefined, uploading: false, queued: false, progress: 100, error: undefined } : ref));
            if (item.dataUrl.startsWith("blob:")) window.setTimeout(() => URL.revokeObjectURL(item.dataUrl), 1000);
        } catch (error) {
            setReferences((value) => value.map((ref) => ref.id === item.id ? { ...ref, uploading: false, queued: false, progress: 0, error: error instanceof Error ? error.message : String(error) } : ref));
            reportMediaError(error);
        }
    };

    const addReferencesFromClipboard = async () => {
        const owner = userId, epoch = accountEpochRef.current;
        if (!owner || !isCurrentUser(owner, sessionEpoch)) return;
        try {
            const items = await navigator.clipboard.read();
            const blobs = await Promise.all(items.flatMap((item) => item.types.filter((type) => type.startsWith("image/")).map((type) => item.getType(type))));
            if (!blobs.length) {
                message.error(t("imageWorkbench.clipboardEmpty"));
                return;
            }
            const nextReferences = await Promise.all(
                blobs.map(async (blob, index) => {
                    const image = await uploadImage(blob, { expectedOwner: owner });
                    return { id: nanoid(), name: `clipboard-${index + 1}.png`, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
                }),
            );
            if (!isCurrentUser(owner, sessionEpoch) || accountEpochRef.current !== epoch) return;
            setReferences((value) => [...value, ...nextReferences]);
            message.success(t("imageWorkbench.clipboardAdded", { count: nextReferences.length }));
        } catch {
            if (isCurrentUser(owner, sessionEpoch) && accountEpochRef.current === epoch) message.error(t("imageWorkbench.clipboardEmpty"));
        }
    };

    const generationThread = useRef("");
    const generate = async () => {
        const owner = userId;
        if (!owner || !isCurrentView()) return;
        const epoch = accountEpochRef.current;
        const active = () => isCurrentUser(owner, sessionEpoch) && accountEpochRef.current === epoch;
        const agentTaskId = agentTaskIdRef.current;
        agentTaskIdRef.current = undefined;
        const text = continuationPrompt(prompt, continuation);
        if (!text) {
            message.error(t("imageWorkbench.promptRequired"));
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("imageWorkbench.promptRequired") });
            return;
        }
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("workbench.configFirst"));
            openConfigDialog(true);
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("imageWorkbench.configIncomplete") });
            return;
        }

        const snapshot = buildRequestSnapshot();
        if (!snapshot) {
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("imageWorkbench.invalidParams") });
            return;
        }

        generationThread.current = await ensureCreationThread(owner);
        if (!active()) return;
        setElapsedMs(0);
        setSubmittedPrompt(snapshot.text);
        setRunning(true);
        if (agentTaskId) updateAgentTask(agentTaskId, { status: "running", error: undefined });
        setPreviewLog(null);
        setResults(Array.from({ length: generationCount }, () => ({ id: nanoid(), status: "pending", snapshot })));
        const batchStartedAt = performance.now();
        setStartedAt(batchStartedAt);

        const tasks = Array.from({ length: generationCount }, (_, index) => runGenerationSlot(index, snapshot, owner, active));

        const result = await Promise.allSettled(tasks);
        if (!active()) return;
        const successImages = result.filter((item): item is PromiseFulfilledResult<GeneratedImage> => item.status === "fulfilled").map((item) => item.value);
        const successCount = successImages.length;
        const failCount = generationCount - successCount;
        const failedReasons = [...new Set(result.filter((item): item is PromiseRejectedResult => item.status === "rejected").map((item) => item.reason instanceof Error ? item.reason.message : String(item.reason || t("workbench.generationFailed"))).filter(Boolean))];
        const failedTaskIds = result.flatMap((item) => item.status === "rejected" ? [imageTaskIdFromError(item.reason)].filter((id): id is string => Boolean(id)) : []);
        const error = failedReasons.join("；") || (failCount ? t("workbench.generationFailed") : undefined);
        if (agentTaskId) updateAgentTask(agentTaskId, { status: successCount ? "succeeded" : "failed", successCount, failCount, error: successCount ? undefined : error });

        try {
            saveLog(
                buildLog({
                    prompt: snapshot.text,
                    model: snapshot.model,
                    config: { ...snapshot.config, count: String(generationCount) },
                    references: snapshot.references,
                    durationMs: performance.now() - batchStartedAt,
                    successCount,
                    failCount,
                    status: successCount ? "success" : "failed",
                    images: successImages,
                    taskIds: failedTaskIds,
                    error,
                }),
            );
            successCount ? message.success(t("imageWorkbench.generated")) : message.error(error || t("workbench.generationFailed"));
        } finally {
            setRunning(false);
        }
    };

    // Handle image-generation commands from the Agent panel by setting the prompt and optionally starting generation.
    useEffect(() => {
        if (!userId || viewOwner !== userId || viewEpoch !== sessionEpoch || !isCurrentUser(userId, sessionEpoch) || !imageCommand || imageCommand.nonce === processedCommandRef.current) return;
        processedCommandRef.current = imageCommand.nonce;
        clearImageCommand();
        if (typeof imageCommand.prompt === "string") setPrompt(imageCommand.prompt);
        if (imageCommand.run && running) {
            if (imageCommand.taskId) updateAgentTask(imageCommand.taskId, { status: "failed", error: t("imageWorkbench.busy") });
            return;
        }
        if (imageCommand.run) {
            agentTaskIdRef.current = imageCommand.taskId;
            setAutoRunToken((value) => value + 1);
        }
    }, [imageCommand, clearImageCommand, running, updateAgentTask, userId, viewOwner, viewEpoch, sessionEpoch]);

    useEffect(() => {
        if (!autoRunToken || !userId || !isCurrentUser(userId, sessionEpoch) || viewOwner !== userId || viewEpoch !== sessionEpoch) return;
        void generate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoRunToken]);

    const downloadImage = (image: GeneratedImage, index: number) => {
        if (!isCurrentView()) return;
        saveAs(image.dataUrl, `image-${index + 1}.png`);
    };

    const useImageForVideo = (image: GeneratedImage, index: number) => {
        if (!userId || !isCurrentView()) return;
        if (isTransferring) { message.warning("参考素材正在处理，请等待完成后再切换页面"); return; }
        storePendingPrompt("video", "", [{ kind: "image", name: `image-${index + 1}`, type: image.mimeType || "image/png", dataUrl: image.dataUrl, storageKey: image.storageKey }], userId, { appendReferences: true });
        navigate("/create?mode=video");
    };

    const addResultToReferences = async (image: GeneratedImage, index: number) => {
        const owner = userId, epoch = accountEpochRef.current;
        if (!owner || !isCurrentView()) return;
        const stored = await uploadImage(image.dataUrl, { expectedOwner: owner });
        if (!isCurrentUser(owner, sessionEpoch) || accountEpochRef.current !== epoch) return;
        setReferences((value) => [...value, { id: nanoid(), name: `result-${index + 1}.png`, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey }]);
        message.success(t("imageWorkbench.addedReference"));
    };

    const continueImage = async (image: GeneratedImage, index: number) => {
        const owner = userId, epoch = accountEpochRef.current;
        if (!owner || !isCurrentView() || running) return;
        const stored = await uploadImage(image.dataUrl, { expectedOwner: owner });
        if (!isCurrentUser(owner, sessionEpoch) || accountEpochRef.current !== epoch) return;
        const source = logs.find(log => log.images.some(item => item.id === image.id));
        setReferences([{ id: nanoid(), name: `result-${index + 1}.png`, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey }]);
        setContinuation({ title: source?.title || "选中图片", prompt: source?.prompt || "根据参考图片创作" });
        setPrompt("");
        setPreviewLog(null);
    };

    const saveResultToAssets = async (image: GeneratedImage, index: number) => {
        const owner = userId, epoch = accountEpochRef.current;
        if (!owner || !isCurrentView()) return;
        const stored = await uploadImage(image.dataUrl, { expectedOwner: owner });
        if (!isCurrentUser(owner, sessionEpoch) || accountEpochRef.current !== epoch) return;
        addAsset({
            kind: "image",
            title: t("imageWorkbench.resultTitle", { count: index + 1 }),
            coverUrl: stored.url,
            tags: [],
            source: t("imageWorkbench.source"),
            data: { dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType },
            metadata: { source: "image-page", prompt },
        });
        message.success(t("common.addedToAssets"));
    };

    const insertPickedAsset = async (payload: InsertAssetPayload) => {
        const owner = userId, epoch = accountEpochRef.current;
        if (!owner || !isCurrentView()) return;
        if (payload.kind === "text") {
            setPrompt(payload.content);
        } else if (payload.kind === "image") {
            const stored = await uploadImage(payload.dataUrl, { expectedOwner: owner });
            if (!isCurrentUser(owner, sessionEpoch) || accountEpochRef.current !== epoch) return;
            setReferences((value) => [...value, { id: nanoid(), name: payload.title, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey }]);
        } else {
            message.warning(t("imageWorkbench.unsupportedAsset"));
        }
        setAssetPickerOpen(false);
    };

    const openChat = async () => {
        if (!userId || !isCurrentView()) return;
        const threadId = await ensureCreationThread(userId);
        if (!isCurrentView()) return;
        const selected = previewLog ?? logs.find(log => log.id === requestedRecord || (requestedRecord && generationTaskIds(log).includes(requestedRecord)));
        const images = results.flatMap(result => result.image ? [result.image] : []);
        const generated = images.length ? logs.find(log => log.images.some(image => images.some(result => result.id === image.id))) : undefined;
        const activeThread = useCreationChat.getState().threads.find(t => t.id === threadId);
        const displayedImage = !activeThread?.records.length && !activeThread?.contextCleared && !images.length && !references.length ? logs.find(log => log.images.length > 0) : undefined;
        const record = selected ?? generated ?? displayedImage ?? (images.length || references.length ? { id: `draft-image-${threadId}`, createdAt: Date.now(), prompt: submittedPrompt || prompt, model, status: "success", images, references } : undefined);
        return handoffCreationToChat(userId, record);
    };

    const createSession = () => {
        if (!isCurrentView()) return;
        if (isTransferring) { message.warning("参考素材正在处理，请等待完成后再新建创作"); return; }
        userEditedBeforeHydrateRef.current = true;
        if (userId) newCreationThread(userId);
        setContinuation(undefined);
        setPrompt("");
        setReferences([]);
        setResults([]);
        setElapsedMs(0);
        setStartedAt(0);
        setSelectedLogIds([]);
        setPreviewLog(null);
    };

    const deleteSelectedLogs = () => {
        if (!userId || !isCurrentView()) return;
        void hideGenerationHistory(userId, logs.filter(log => selectedLogIds.includes(log.id)).flatMap(generationTaskIds)).then(() => Promise.all(selectedLogIds.map((id) => imageLogStorage.remove(userId, id)))).then(() => { if (!isCurrentUser(userId, sessionEpoch)) return; historyPagerRef.current = new GenerationHistoryPager(userId, "image"); return refreshLogs(); }).catch(error => message.error(error instanceof Error ? error.message : String(error)));
        if (previewLog && selectedLogIds.includes(previewLog.id)) {
            setPreviewLog(null);
            setResults([]);
        }
        setSelectedLogIds([]);
        setDeleteConfirmOpen(false);
    };

    const saveLog = (log: GenerationLog) => {
        if (!userId || !isCurrentUser(userId, sessionEpoch)) return;
        saveCreationRecord(userId, log, generationThread.current);
        const epoch = accountEpochRef.current;
        void imageLogStorage.set(userId, log.id, serializeLog(log)).then(() => { if (isCurrentUser(userId, sessionEpoch) && accountEpochRef.current === epoch) void refreshLogs(); });
    };

    const refreshLogs = async () => {
        if (!userId) return;
        const epoch = accountEpochRef.current;
        const pager = historyPagerRef.current;
        if (!pager) return;
        const { items, hasMore } = await readStoredLogs(userId, pager);
        if (isCurrentUser(userId, sessionEpoch) && accountEpochRef.current === epoch && historyPagerRef.current === pager) { setLogs(items); setHistoryHasMore(hasMore); }
    };

    const showEarlierRecords = async () => {
        if (visibleHistory.hasEarlier) { visibleHistory.showEarlier(); return; }
        const pager = historyPagerRef.current;
        if (!userId || !pager || (!historyHasMore && !otherHistory.more) || loadingEarlier) return;
        const epoch = accountEpochRef.current;
        setLoadingEarlier(true);
        try {
            const [{ items, hasMore }] = await Promise.all([
                historyHasMore ? readStoredLogs(userId, pager, true) : Promise.resolve({ items: logs, hasMore: false }),
                otherHistory.more ? otherHistory.loadMore() : Promise.resolve(),
            ]);
            if (!isCurrentUser(userId, sessionEpoch) || accountEpochRef.current !== epoch || historyPagerRef.current !== pager) return;
            setLogs(items); setHistoryHasMore(hasMore); visibleHistory.showEarlier();
        } catch (error) { reportMediaError(error); }
        finally { if (historyPagerRef.current === pager) setLoadingEarlier(false); }
    };

    const previewGenerationLog = async (log: GenerationLog) => {
        if (!isCurrentView()) return;
        if (isTransferring) { message.warning("参考素材正在处理，请等待完成后再回填记录"); return; }
        setPreviewLog(log);
        setLogsOpen(false);
        setContinuation(undefined);
        setPrompt(log.prompt);
        setReferences(log.references || []);
        if (log.config.imageModel || log.model) updateConfig("imageModel", normalizeModelOptionValue(log.config.imageModel || log.model, effectiveConfig.channels));
        if (log.config.quality) updateConfig("quality", log.config.quality);
        if (log.config.size) updateConfig("size", log.config.size);
        if (log.config.background) updateConfig("background", log.config.background);
        if (log.config.count) updateConfig("count", log.config.count);
        setResults(log.images.map((image) => ({ id: image.id, status: "success", image })));
        const missing = imageHistoryGaps(log);
        if (missing.length) message.warning(`${missing.join("；")}，请检查后再生成`);
        return missing.length > 0;
    };

    const buildRequestSnapshot = () => {
        const text = continuationPrompt(prompt, continuation);
        if (!text) {
            message.error(t("imageWorkbench.promptRequired"));
            return null;
        }
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("workbench.configFirst"));
            openConfigDialog(true);
            return null;
        }
        return { text, model, config: { ...effectiveConfig, model, count: "1" }, references: references.map((item) => ({ ...item })) };
    };

    const runGenerationSlot = async (index: number, snapshot: ImageRequestSnapshot, owner: string, active: () => boolean) => {
        const itemStartedAt = performance.now();
        try {
            const result = snapshot.references.length ? await requestEdit(snapshot.config, snapshot.text, snapshot.references, { expectedUserId: owner }) : await requestGeneration(snapshot.config, snapshot.text, { expectedUserId: owner });
            if (!active()) throw new Error("账户已切换");
            const image = result[0];
            if (!image) throw new Error(t("imageWorkbench.missingResult"));
            const stored = await uploadImage(image.dataUrl, { expectedOwner: owner });
            if (!active()) throw new Error("账户已切换");
            const nextImage: GeneratedImage = { taskId: 'taskId' in image && typeof image.taskId === 'string' ? image.taskId : undefined, id: image.id, dataUrl: stored.url, ...(stored.storageKey ? { storageKey: stored.storageKey } : {}), durationMs: performance.now() - itemStartedAt, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType };
            setResults((value) => updateResultAt(value, index, { status: "success", image: nextImage }));
            return nextImage;
        } catch (error) {
            if (active()) setResults((value) => updateResultAt(value, index, { status: "failed", error: error instanceof Error ? error.message : t("workbench.generationFailed") }));
            throw error;
        }
    };

    const retryResult = async (index: number) => {
        const owner = userId;
        if (!owner) return;
        const epoch = accountEpochRef.current;
        const active = () => isCurrentUser(owner, sessionEpoch) && accountEpochRef.current === epoch;
        const snapshot = results[index]?.snapshot ?? buildRequestSnapshot();
        if (!snapshot) return;
        generationThread.current = await ensureCreationThread(owner);
        if (!active()) return;
        setPreviewLog(null);
        setResults((value) => updateResultAt(value, index, { status: "pending", error: undefined, image: undefined, snapshot }));
        const retryStartedAt = performance.now();
        try {
            const image = await runGenerationSlot(index, snapshot, owner, active);
            if (!active()) return;
            saveLog(
                buildLog({
                    prompt: snapshot.text,
                    model: snapshot.model,
                    config: { ...snapshot.config, count: "1" },
                    references: snapshot.references,
                    durationMs: performance.now() - retryStartedAt,
                    successCount: 1,
                    failCount: 0,
                    status: "success",
                    images: [image],
                }),
            );
            message.success(t("workbench.retrySuccess"));
        } catch (error) {
            const retryError = error instanceof Error ? error.message : t("workbench.generationFailed");
            if (active()) {
                saveLog(
                    buildLog({
                        prompt: snapshot.text,
                        model: snapshot.model,
                        config: { ...snapshot.config, count: "1" },
                        references: snapshot.references,
                        durationMs: performance.now() - retryStartedAt,
                        successCount: 0,
                        failCount: 1,
                        status: "failed",
                        images: [],
                        taskIds: [imageTaskIdFromError(error)].filter((id): id is string => Boolean(id)),
                        error: retryError,
                    }),
                );
            }
        }
    };

    const editedNavigation = useRef("");
    useEffect(() => {
        if (!["edit", "continue"].includes(searchParams.get("action") || "") || !targetRecord || !isCurrentView() || isTransferring) return;
        const key = `${userId}:${sessionEpoch}:${location.key}`;
        if (editedNavigation.current === key) return;
        const log = logs.find(item => item.id === targetRecord);
        if (!log) return;
        editedNavigation.current = key;
        if (searchParams.get("action") === "continue") {
            const index = Number(searchParams.get("image") || 0);
            if (log.images[index]) void transferReference(() => continueImage(log.images[index], index)).catch(reportMediaError);
        } else void previewGenerationLog(log);
        const params = new URLSearchParams(searchParams);
        params.delete("action");
        params.delete("image");
        navigate({ pathname: location.pathname, search: `?${params}`, hash: location.hash }, { replace: true });
    }, [targetRecord, logs, searchParams, location.key, userId, sessionEpoch, viewOwner, viewEpoch, isTransferring]);
    if (!userId || viewOwner !== userId || viewEpoch !== sessionEpoch) return null;
    const previewGaps = previewLog ? imageHistoryGaps(previewLog) : [];

    return (
        <div className="flex h-full flex-col overflow-hidden bg-muted text-foreground dark:bg-background dark:text-foreground page-surface">
            <div className="flex min-h-0 flex-1">
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="creation-top-actions flex shrink-0 items-center justify-between gap-2 px-4 py-2">
                    <div className="flex items-center gap-2">
                        <ActionButton variant="ghost" size="sm" label="新建创作" icon={<Plus className="size-4" />} isDisabled={isTransferring} onClick={createSession} />
                        {draftStatus.state !== "idle" ? <span title={draftStatus.error} className={`text-xs ${draftStatus.state === "error" ? "text-amber-500" : "text-muted-foreground"}`}>{draftStatus.state === "saving" ? "草稿保存中…" : draftStatus.state === "error" ? "草稿本地保存失败" : "草稿已保存在本地"}</span> : null}
                    </div>
                    {/* 宽屏入口在右侧停靠栏，顶栏不再放重复按钮；窄屏没有停靠栏，仍保留 */}
                    {narrowRecords ? <ActionButton variant="ghost" size="sm" label="生成记录" icon={<History className="size-4" />} onClick={() => setLogsOpen(true)} /> : null}
                </div>
                <CreationStream tasks={mixedLogs.map(entry => ({ id: entry.id, status: entry.log.status }))} onScrollTop={() => void showEarlierRecords()} composer={
                    <div className="creation-composer mx-auto w-full max-w-[960px]">
                        {previewGaps.length > 0 && <div role="status" className="mb-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-300">{previewGaps.join("；")}，请核对后再生成。</div>}
                        <ChatComposer
                            value={prompt}
                            onSubmit={() => void generate()}
                            elevation="none"
                            input={<div className="thin-scrollbar max-h-[30dvh] space-y-2 overflow-y-auto" onDragOver={(event) => { if (!referenceOpen && !references.length) event.preventDefault(); }} onDrop={(event) => { if (!referenceOpen && !references.length) { event.preventDefault(); void transferReference(() => addReferences(event.dataTransfer.files)).catch(reportMediaError); } }}>
                        <ContinuationNotice value={continuation} mode="image" onCancel={() => { setContinuation(undefined); }} />
                                <div className="relative">
                                    <Input.TextArea className="!pb-9 !pr-10" value={prompt} onChange={(event) => { userEditedBeforeHydrateRef.current = true; setPrompt(event.target.value); }} autoSize={{ minRows: 2, maxRows: 5 }} placeholder={continuation ? "例如：衣服换成红色，其他保持不变…" : "描述你想生成的图片，或选择一张作品继续修改…"} />
                                    <PromptOptimizeButton prompt={prompt} model={model} capability="image" disabled={running} onOptimized={setPrompt} />
                                </div>
                                {(referenceOpen || references.length > 0) && (
                                    <div className="min-w-0">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <span className="text-base font-semibold">{t("imageWorkbench.references")}</span>
                                    <div className="flex gap-2">
                                        <Button size="small" icon={<ClipboardPaste className="size-3.5" />} onClick={() => void transferReference(addReferencesFromClipboard)}>
                                            {t("workbench.clipboard")}
                                        </Button>
                                        <Button size="small" icon={<Upload className="size-3.5" />} onClick={() => fileInputRef.current?.click()}>
                                            {t("workbench.upload")}
                                        </Button>
                                    </div>
                                </div>
                                <div
                                    className={`hover-scrollbar hover-scrollbar-hint relative flex min-h-24 w-full min-w-0 max-w-full gap-2 overflow-x-scroll overflow-y-hidden rounded-lg border border-dashed p-2 pb-3 overscroll-x-contain transition-colors ${isReferenceDragActive ? "border-foreground bg-muted/80 dark:border-white/20 dark:bg-muted/80" : "border-border dark:border-border"}`}
                                    onDragEnter={(event) => {
                                        event.preventDefault();
                                        dragDepthRef.current += 1;
                                        if (event.dataTransfer.types.includes("Files")) setIsReferenceDragActive(true);
                                    }}
                                    onDragOver={(event) => {
                                        event.preventDefault();
                                        event.dataTransfer.dropEffect = "copy";
                                    }}
                                    onDragLeave={(event) => {
                                        event.preventDefault();
                                        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
                                        if (!dragDepthRef.current) setIsReferenceDragActive(false);
                                    }}
                                    onDrop={(event) => {
                                        event.preventDefault();
                                        dragDepthRef.current = 0;
                                        setIsReferenceDragActive(false);
                                        void transferReference(() => addReferences(event.dataTransfer.files)).catch(reportMediaError);
                                    }}
                                    onWheel={(event) => {
                                        if (event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) return;
                                        event.preventDefault();
                                        event.currentTarget.scrollLeft += event.deltaY;
                                    }}
                                >
                                    {references.map((item, index) => (
                                        <div key={item.id} className={`group relative size-20 shrink-0 overflow-hidden rounded-md border ${item.storageKey ? "border-amber-500" : "border-border"}`} title={item.storageKey ? t("common.localOnlyHint") : undefined}>
                                            <Thumbnail src={previewUrlFor(item.storageKey) || item.dataUrl} alt={item.name} label={item.name} className="size-full" />
                                            <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{imageReferenceLabel(index)}</span>
                                            {item.storageKey && !item.uploading && !item.queued ? <button type="button" className="absolute left-1 top-7 z-30 rounded bg-amber-600/90 px-1.5 py-0.5 text-[9px] font-medium text-white" onClick={(event) => { event.stopPropagation(); void transferReference(() => retryReference(item)); }} title={t("common.retryUpload")}>{t("common.retryUpload")}</button> : null}
                                            {!item.uploading && !item.queued && !item.error ? <ReferenceOrderButtons index={index} total={references.length} onMove={(offset) => setReferences((value) => moveListItem(value, index, offset))} /> : null}
                                            <button
                                                type="button"
                                                className="absolute right-1 top-1 z-30 flex size-7 items-center justify-center rounded-full bg-black/70 text-white shadow-sm"
                                                onClick={() => setReferences((value) => value.filter((ref) => ref.id !== item.id))}
                                                aria-label={t("imageWorkbench.removeReference")}
                                            >
                                                <Trash2 className="size-3.5" />
                                            </button>
                                            {item.uploading || item.queued || item.error ? (
                                                <div className="absolute inset-x-0 bottom-0 z-20 bg-black/70 px-1.5 py-1" title={item.error}>
                                                    {item.error ? <div className="text-center text-[9px] font-medium text-red-300">{t("common.uploadFailedStatus")}</div> : <>
                                                        <div className="h-1 overflow-hidden rounded-full bg-white/25"><div className="h-full rounded-full bg-[#D8FF3E] transition-[width]" style={{ width: `${item.queued ? 0 : item.progress ?? 0}%` }} /></div>
                                                        <div className="mt-0.5 text-center text-[9px] text-white">{item.queued ? t("common.waitingStatus") : `${t("common.uploadingStatus")} ${item.progress ?? 0}%`}</div>
                                                    </>}
                                                </div>
                                            ) : null}
                                        </div>
                                    ))}
                                    {!references.length ? <div className="flex min-w-full items-center justify-center text-sm text-muted-foreground">{isReferenceDragActive ? t("imageWorkbench.dropReferences") : t("imageWorkbench.noReferences")}</div> : null}
                                </div>
                            </div>
                                )}
                            </div>}
                            footerActions={<div className="creation-actions w-full min-w-0"><CreationToolbar mode="image" onChat={openChat} busy={isTransferring || running} referencesOpen={referenceOpen} onSettings={() => setSettingsOpen(true)} onUpload={() => fileInputRef.current?.click()} onReferences={() => setReferenceOpen(value => !value)} onPrompts={() => setPromptDialogOpen(true)} onAssets={() => setAssetPickerOpen(true)} modelPicker={<ModelPicker config={config} value={model} capability="image" placeholder="选择图片模型" onChange={(value) => updateConfig("imageModel", value)} />} /></div>}
                            sendActions={<div className="creation-costs"><PromptOptimizationEstimate mode="image" /><CreditEstimate mode="image" /></div>}
                            sendButton={<ActionButton variant="primary" size="lg" label={running ? "生成中" : continuation ? "生成新版本" : "开始生成"} icon={<Sparkles className="size-4" />} isLoading={running} isDisabled={!canGenerate || running || isTransferring} onClick={() => void generate()} />}

                        />
                    </div>
                }>
                    <div className="mx-auto w-full max-w-[960px] px-2 pb-8 pt-6">
                        {(visibleHistory.hasEarlier || historyHasMore || otherHistory.more) && <Button type="text" className="creation-load-earlier" loading={loadingEarlier} onClick={() => void showEarlierRecords()}>加载更早记录</Button>}
                        {otherHistory.error && <p className="mb-4 text-sm text-muted-foreground">{otherHistory.error}</p>}
                        {mixedRecords.map((entry) => entry.kind === "other" ? <OtherCreationRecord disabled={isTransferring} key={entry.log.id} log={entry.log} mode="video" /> : ((log: GenerationLog) => (
                        <article id={`creation-record-${log.id}`} key={log.id} className="astryx-chat-message mb-12 max-w-[620px]">
                            <CreationRequest prompt={log.prompt} />
                            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">图片生成</span><span>{modelOptionLabel(effectiveConfig, log.model)}</span><span>{log.time}</span><span>{log.reconciliationRequired ? "待核对" : creationStatus(log.status)}</span></div>
                            {log.images.length > 0 && <div className={`grid gap-3 ${log.images.length > 1 ? "sm:grid-cols-2" : ""}`}>{log.images.map((image, index) => <ResultImageCard key={image.id} image={image} gallery={log.images} index={index} onEdit={(item, i) => void transferReference(() => addResultToReferences(item, i)).catch(reportMediaError)} onDownload={downloadImage} onSaveAsset={(item, i) => void saveResultToAssets(item, i).catch(reportMediaError)} onVideo={useImageForVideo} onContinue={(item, i) => void transferReference(() => continueImage(item, i)).catch(reportMediaError)} />)}</div>}
                            {log.failCount > 0 && <div className="mt-2 text-sm text-red-500 dark:text-red-400">失败 {log.failCount} 张{log.error ? `：${log.error}` : "（可在「生成详情」查看并按原参数重新生成）"}</div>}
                            <RecordActions secondary={{ key: "details", label: "生成详情", run: () => setDetailsLog(log) }} label="更多生成记录操作" more={[
                                { key: "edit", label: "编辑原描述与参数", disabled: isTransferring, run: () => { void previewGenerationLog(log); } },
                                { key: "again", label: "按原参数再次生成", disabled: isTransferring, run: () => { void previewGenerationLog(log).then(missing => { if (missing === false) message.info("已回填原参数，请核对当前积分后点击开始生成"); }); } },
                            ]} />
                        </article>
                    ))(entry.log))}
                        {(running || (!logs.length && !otherHistory.logs.length) || (!previewLog && results.some((result) => result.status === "failed" || (result.image && !logs.some((log) => log.images.some((image) => image.id === result.image?.id)))))) && (<div className={!running && !results.length ? "creation-empty-wrap" : "max-w-[620px]"}>
                        {running && submittedPrompt && !logs.some(log => log.prompt === submittedPrompt) && <CreationRequest prompt={submittedPrompt} />}
                        <div className={running || results.length ? "mb-4 flex items-center justify-between gap-3" : "hidden"}>
                            <div>
                                <h2 className="text-sm text-muted-foreground">{running ? "正在生成图片…" : "生成结果"}</h2>
                            </div>
                            {running ? <Tag className="m-0 px-2 py-1">{t("workbench.waiting", { time: formatDuration(elapsedMs) })}</Tag> : null}
                        </div>
                        {results.length ? (
                            <div className={`grid gap-4 ${results.length > 1 ? "sm:grid-cols-2" : ""}`}>
                                {results.map((result, index) =>
                                    result.status === "success" && result.image ? (
                                        <ResultImageCard key={result.id} image={result.image} index={index} onEdit={(image, index) => void transferReference(() => addResultToReferences(image, index)).catch(reportMediaError)} onDownload={downloadImage} onSaveAsset={(image, index) => void saveResultToAssets(image, index).catch(reportMediaError)} onVideo={useImageForVideo} onContinue={(item, i) => void transferReference(() => continueImage(item, i)).catch(reportMediaError)} />
                                    ) : result.status === "failed" ? (
                                        <FailedImageCard key={result.id} error={result.error || t("workbench.generationFailed")} onRetry={() => retryResult(index)} />
                                    ) : (
                                        <PendingImageCard key={result.id} />
                                    ),
                                )}
                            </div>
                        ) : (
                            <div className="flex min-h-32 flex-col items-center justify-center text-center">
                                <div className="creation-empty"><span className="creation-empty-icon"><Sparkles /></span><h2>从一个画面开始</h2><p>描述你的想法，或添加参考图片。<br />每一次创作，都从这里展开。</p></div>
                            </div>
                        )}
                    </div>)}
                    </div>
                </CreationStream>
                </div>
                {/* 宽屏：生成记录停靠右侧，不再盖住合成器 */}
                <CreationRecordsRail open={recordsRailOpen} count={logs.length} onToggle={() => setRecordsRailOpen((value) => !value)}>
                    <LogPanel
                        logs={logs}
                        selectedLogIds={selectedLogIds}
                        activeLogId={previewLog?.id}
                        onSelectedLogIdsChange={setSelectedLogIds}
                        onCreateSession={createSession}
                        onDeleteSelected={() => setDeleteConfirmOpen(true)}
                        onPreviewLog={(log) => void previewGenerationLog(log)}
                    />
                </CreationRecordsRail>
            </div>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                    void transferReference(() => addReferences(event.target.files)).catch(reportMediaError);
                    event.target.value = "";
                }}
            />
            <Drawer title={t("workbench.logs")} placement="bottom" size="large" open={logsOpen} onClose={() => setLogsOpen(false)}>
                <LogPanel
                    logs={logs}
                    selectedLogIds={selectedLogIds}
                    activeLogId={previewLog?.id}
                    onSelectedLogIdsChange={setSelectedLogIds}
                    onCreateSession={createSession}
                    onDeleteSelected={() => setDeleteConfirmOpen(true)}
                    onPreviewLog={(log) => void previewGenerationLog(log)}
                />
            </Drawer>
            <Drawer title={t("workbench.settings")} placement="bottom" height="82vh" rootClassName="creation-settings-drawer" open={settingsOpen} onClose={() => setSettingsOpen(false)}>
                <div className="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2">
                    <GenerationSettings config={effectiveConfig} model={model} updateConfig={updateConfig} openConfigDialog={openConfigDialog} />
                </div>
            </Drawer>
            <Drawer title="生成详情" open={Boolean(detailsLog)} onClose={() => setDetailsLog(null)}>
                {detailsLog && <div className="mb-4 space-y-2 text-sm"><p>背景：{detailsLog.config.background || "未记录"}</p>{detailsLog.referenceHistoryUnknown && <p className="text-muted-foreground">云端历史未保存参考素材信息</p>}</div>}
                {detailsLog && <dl className="space-y-4 text-sm"><div><dt className="text-muted-foreground">提示词</dt><dd className="mt-1 whitespace-pre-wrap break-words">{detailsLog.prompt}</dd></div><div><dt className="text-muted-foreground">模型与参数</dt><dd className="mt-1">{modelOptionLabel(effectiveConfig, detailsLog.model)} · {detailsLog.size} · {detailsLog.quality} · {detailsLog.imageCount} 张</dd></div><div><dt className="text-muted-foreground">参考素材</dt><dd className="mt-1 break-words">{detailsLog.references.length ? detailsLog.references.map((item) => item.name).join("、") : "暂无可展示的参考素材"}</dd></div><div><dt className="text-muted-foreground">时间与状态</dt><dd className="mt-1">{detailsLog.time} · {detailsLog.reconciliationRequired ? "待核对" : creationStatus(detailsLog.status)}</dd></div>{(detailsLog.error || detailsLog.failCount > 0) ? <div><dt className="text-muted-foreground">失败详情</dt><dd className="mt-1 whitespace-pre-wrap break-words text-red-500 dark:text-red-400">{detailsLog.error || `共失败 ${detailsLog.failCount} 张；历史记录未保留更细错误信息，可通过「按原参数再次生成」重试`}</dd></div> : null}{detailsLog.serverTaskIds?.length ? <div><dt className="text-muted-foreground">任务编号</dt><dd className="mt-1 break-all text-xs text-muted-foreground">{detailsLog.serverTaskIds.join("、")}</dd></div> : null}<div><dt className="text-muted-foreground">实际积分</dt><dd className="mt-1">{detailsLog.creditsCharged == null ? "尚未结算或暂不可用" : `${detailsLog.creditsCharged} 积分`}</dd></div></dl>}
            </Drawer>
            <PromptSelectDialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen} onSelect={setPrompt} />
            <AssetPickerModal open={assetPickerOpen} defaultTab="my-assets" acceptedKinds={["text", "image"]} onInsert={(payload) => void transferReference(() => insertPickedAsset(payload)).catch(reportMediaError)} onClose={() => setAssetPickerOpen(false)} />
            <Modal title={t("workbench.deleteLogs")} open={deleteConfirmOpen} onCancel={() => setDeleteConfirmOpen(false)} onOk={deleteSelectedLogs} okText={t("common.delete")} okButtonProps={{ danger: true }} cancelText={t("common.cancel")}>
                {t("workbench.deleteLogsConfirm", { count: selectedLogIds.length })}
            </Modal>
        </div>
    );
}

function GenerationSettings({ config, model, updateConfig, openConfigDialog }: { config: AiConfig; model: string; updateConfig: UpdateAiConfig; openConfigDialog: (shouldPromptContinue?: boolean) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { t } = useTranslation();

    return (
        <>
            <label className="col-span-2 block min-w-0 sm:col-span-1">
                <span className="mb-1.5 block text-sm font-semibold sm:mb-2 sm:text-base">{t("workbench.model")}</span>
                <ModelPicker config={config} value={model} onChange={(value) => updateConfig("imageModel", value)} capability="image" fullWidth onMissingConfig={() => openConfigDialog(false)} />
            </label>
            <div className="col-span-2">
                <ImageSettingsPanel config={{ ...config, model }} onConfigChange={(key, value) => updateConfig(key, value)} theme={theme} showTitle={false} className="space-y-4" maxCount={10} />
            </div>
        </>
    );
}

function ResultImageCard({
    image,
    gallery,
    index,
    onEdit,
    onDownload,
    onSaveAsset,
    onVideo,
    onContinue,
}: {
    image: GeneratedImage;
    gallery?: GeneratedImage[];
    index: number;
    onEdit: (image: GeneratedImage, index: number) => void;
    onDownload: (image: GeneratedImage, index: number) => void;
    onSaveAsset: (image: GeneratedImage, index: number) => void;
    onVideo: (image: GeneratedImage, index: number) => void; onContinue: (image: GeneratedImage, index: number) => void;
}) {
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const [previewOpen, setPreviewOpen] = useState(false);
    return (
        <div className="creation-result-card overflow-hidden rounded-2xl border border-border bg-background dark:border-border">
            <button type="button" className="block w-full" onClick={() => setPreviewOpen(true)} aria-label={t("imageWorkbench.resultAlt", { count: index + 1 })}>
                <img loading="lazy" width={image.width || undefined} height={image.height || undefined} src={previewUrlFor(image.storageKey) || image.dataUrl} alt={t("imageWorkbench.resultAlt", { count: index + 1 })} className="h-auto max-h-[65vh] w-full object-contain" />
            </button>
            {previewOpen && <Lightbox isOpen={previewOpen} onOpenChange={setPreviewOpen} media={(gallery || [image]).map((item, i) => ({ src: item.dataUrl, alt: t("imageWorkbench.resultAlt", { count: i + 1 }) }))} defaultIndex={gallery ? index : 0} hasZoom />}
            <div className="space-y-2 border-t border-border px-3 py-2.5 dark:border-border">
                <div className="flex min-w-0 gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    {image.width > 0 && image.height > 0 && <span>{image.width}x{image.height}</span>}
                    {image.bytes > 0 && <span>{formatBytes(image.bytes)}</span>}
                    <span>{formatDuration(image.durationMs)}</span>
                </div>
                <RecordActions primary={{ key: "edit", label: "继续改图", icon: <PenLine className="size-3.5" />, run: () => onContinue(image, index) }} secondary={{ key: "video", label: "生成视频", run: () => onVideo(image, index) }} more={[
                    { key: "download", label: "下载图片", icon: <Download className="size-4" />, run: () => onDownload(image, index) },
                    { key: "asset", label: "加入素材库", icon: <FolderPlus className="size-4" />, run: () => onSaveAsset(image, index) },
                    { key: "reference", label: "添加为参考图", icon: <PenLine className="size-4" />, run: () => onEdit(image, index) },
                ]} />
            </div>
        </div>
    );
}

function PendingImageCard() {
    const { t } = useTranslation();
    return (
        <div className="relative aspect-square overflow-hidden rounded-lg border border-dashed border-border bg-muted dark:border-border dark:bg-muted">
            <div
                className="absolute inset-0 opacity-60"
                style={{
                    backgroundImage: "radial-gradient(circle, rgba(120,113,108,0.35) 1.4px, transparent 1.6px)",
                    backgroundSize: "16px 16px",
                }}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-6 animate-spin" />
                <span>{t("workbench.generating")}</span>
            </div>
        </div>
    );
}

function FailedImageCard({ error, onRetry }: { error: string; onRetry: () => void }) {
    const { t } = useTranslation();
    return (
        <div className="overflow-hidden rounded-2xl border border-red-200 bg-red-50 dark:border-red-950 dark:bg-red-950/20">
            <div className="flex aspect-square flex-col items-center justify-center gap-3 p-5 text-center">
                <div className="text-sm font-medium text-red-600 dark:text-red-300">{t("workbench.failed")}</div>
                <Typography.Paragraph ellipsis={{ rows: 4 }} className="!mb-0 !text-xs !text-red-500 dark:!text-red-300">
                    {error}
                </Typography.Paragraph>
            </div>
            <div className="flex justify-end border-t border-red-200 p-3 dark:border-red-950">
                <Button size="small" danger onClick={onRetry}>
                    {t("workbench.retry")}
                </Button>
            </div>
        </div>
    );
}

function updateResultAt(results: GenerationResult[], index: number, next: Partial<GenerationResult>) {
    return results.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item));
}

function LogPanel({
    logs,
    selectedLogIds,
    activeLogId,
    onSelectedLogIdsChange,
    onCreateSession,
    onDeleteSelected,
    onPreviewLog,
}: {
    logs: GenerationLog[];
    selectedLogIds: string[];
    activeLogId?: string;
    onSelectedLogIdsChange: (ids: string[]) => void;
    onCreateSession: () => void;
    onDeleteSelected: () => void;
    onPreviewLog: (log: GenerationLog) => void;
}) {
    const { t } = useTranslation();
    const allSelected = Boolean(logs.length) && selectedLogIds.length === logs.length;
    const toggleAll = () => onSelectedLogIdsChange(allSelected ? [] : logs.map((log) => log.id));

    return (
        <>
            {/* 标题/计数已移到停靠面板头部，这里只留吸顶工具栏 */}
            <div className="crec-toolbar">
                <Button size="small" icon={<Plus className="size-3.5" />} onClick={onCreateSession}>
                    {t("workbench.new")}
                </Button>
                <Button size="small" icon={<CheckSquare className="size-3.5" />} disabled={!logs.length} onClick={toggleAll}>
                    {allSelected ? t("common.cancel") : t("workbench.selectAll")}
                </Button>
                <Button size="small" danger icon={<Trash2 className="size-3.5" />} disabled={!selectedLogIds.length} onClick={onDeleteSelected}>
                    {t("common.delete")}
                </Button>
            </div>
            <div className="space-y-3">
                {logs.map((log) => (
                    <LogCard
                        key={log.id}
                        log={log}
                        selected={selectedLogIds.includes(log.id)}
                        active={activeLogId === log.id}
                        onSelectedChange={(checked) => onSelectedLogIdsChange(checked ? [...selectedLogIds, log.id] : selectedLogIds.filter((id) => id !== log.id))}
                        onClick={() => onPreviewLog(log)}
                    />
                ))}
                {!logs.length ? <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-border text-center text-sm text-muted-foreground dark:border-border">{t("workbench.noLogs")}</div> : null}
            </div>
        </>
    );
}

function LogCard({ log, selected, active, onSelectedChange, onClick }: { log: GenerationLog; selected: boolean; active: boolean; onSelectedChange: (checked: boolean) => void; onClick: () => void }) {
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const thumbnails = log.images.filter((image) => image.dataUrl).slice(0, 4);

    return (
        <button
            type="button"
            className={`block w-full rounded-lg border p-2 text-left transition ${active ? "border-foreground bg-brand-soft dark:bg-brand-soft" : "border-border bg-background hover:bg-muted dark:border-border dark:hover:bg-accent"}`}
            onClick={onClick}
        >
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2">
                <Checkbox className="mt-0.5" checked={selected} onClick={(event) => event.stopPropagation()} onChange={(event) => onSelectedChange(event.target.checked)} />
                <div className="min-w-0">
                    <div className="truncate text-sm font-semibold leading-5">{log.title}</div>
                    {thumbnails.length ? (
                        <div className="mt-2 flex gap-1 overflow-hidden">
                            {thumbnails.map((image) => (
                                <img key={image.id} src={previewUrlFor(image.storageKey) || image.dataUrl} alt="" className="size-8 shrink-0 rounded-md object-cover" />
                            ))}
                        </div>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1">
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{t("workbench.itemCount", { count: log.imageCount })}</Tag>
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.time}</Tag>
                    </div>
                </div>
                <div className="grid max-w-[150px] min-w-0 justify-items-end gap-1">
                    <div className="flex min-w-0 flex-wrap justify-end gap-1">
                        {log.status === 'pending' ? <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color="processing">{t('workbench.generating')}</Tag> : log.status === 'unavailable' ? <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color="warning">结果不可用</Tag> : null}
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color="blue">
                            {t("workbench.successCount", { count: log.successCount ?? log.imageCount })}
                        </Tag>
                        {log.failCount ? (
                            <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color="red">
                                {t("workbench.failCount", { count: log.failCount })}
                            </Tag>
                        ) : null}
                    </div>
                    <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color="green">
                        {formatDuration(log.durationMs)}
                    </Tag>
                </div>
            </div>
        </button>
    );
}

function isCurrentUser(owner: string, sessionEpoch: number) {
    const auth = useAuthStore.getState();
    return auth.ready && auth.user?.id === owner && auth.sessionEpoch === sessionEpoch;
}

async function readStoredLogs(owner: string, pager: GenerationHistoryPager, loadMore = false) {
    if (typeof window === "undefined") return { items: [] as GenerationLog[], hasMore: false };
    const local = await imageLogStorage.list<GenerationLog>(owner).catch(() => [] as GenerationLog[]);
    try {
        const cloud = loadMore ? await pager.loadMore() : await pager.refresh();
        const remote = cloud.logs as unknown as GenerationLog[];
        return { items: await Promise.all(mergeGenerationHistory(local, remote, cloud.hiddenTaskIds).map(normalizeLog)), hasMore: cloud.hasMore };
    } catch {
        if (loadMore) throw new Error("加载更早记录失败，请重试");
        return { items: (await Promise.all(local.map(normalizeLog))).sort((a,b)=>b.createdAt-a.createdAt), hasMore: false };
    }
}

async function normalizeLog(log: Partial<GenerationLog>): Promise<GenerationLog> {
    const references = await Promise.all(
        (log.references || []).map(async (item) => {
            void ensureImagePreview(item.storageKey);
            return { ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl) };
        }),
    );
    const images = await Promise.all(
        (log.images || []).map(async (item) => {
            void ensureImagePreview(item.storageKey);
            return { ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl) };
        }),
    );
    const config = normalizeLogConfig(log);
    return {
        serverTaskIds: log.serverTaskIds,
        creditsCharged: log.creditsCharged,
        reconciliationRequired: log.reconciliationRequired,
        referenceHistoryUnknown: log.referenceHistoryUnknown,
        id: log.id || nanoid(),
        createdAt: log.createdAt || Date.now(),
        title: log.title || log.model || i18n.t("workbench.untitled"),
        prompt: log.prompt || log.title || "",
        time: log.time || new Date().toLocaleString(i18n.resolvedLanguage, { hour12: false }),
        model: log.model || config.imageModel || "",
        config,
        references,
        durationMs: log.durationMs || 0,
        successCount: log.successCount ?? log.imageCount ?? 0,
        failCount: log.failCount || 0,
        imageCount: log.imageCount || log.successCount || 0,
        size: log.size || config.size || "",
        quality: log.quality || config.quality || "",
        status: log.status || "success",
        images,
        ...(log.error ? { error: log.error } : {}),
    };
}

function serializeLog(log: GenerationLog): GenerationLog {
    return {
        ...log,
        references: log.references.map((item) => ({ ...item, dataUrl: item.storageKey ? "" : item.dataUrl })),
        images: log.images.map((image) => ({ ...image, dataUrl: image.storageKey ? "" : image.dataUrl })),
    };
}

function normalizeLogConfig(log: Partial<GenerationLog>): GenerationLogConfig {
    return {
        model: log.config?.model || log.model || "",
        imageModel: log.config?.imageModel || log.model || "",
        quality: log.config?.quality || log.quality || "",
        size: log.config?.size || log.size || "",
        background: log.config?.background,
        count: log.config?.count || String(log.imageCount || log.successCount || 1),
    };
}

function imageHistoryGaps(log: GenerationLog) {
    const missing: string[] = [];
    if (!log.config.size || !log.config.quality || !log.config.background) missing.push("部分历史参数未保存");
    if (log.referenceHistoryUnknown) missing.push("云端历史未保存参考素材信息");
    return missing;
}

function moveListItem<T>(items: T[], index: number, offset: number) {
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= items.length) return items;
    const next = [...items];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    return next;
}

function ReferenceOrderButtons({ index, total, onMove }: { index: number; total: number; onMove: (offset: number) => void }) {
    if (total <= 1) return null;
    return (
        <div className="absolute inset-x-1 bottom-1 flex justify-between">
            <Button size="small" className="!h-6 !w-6 !min-w-6 !rounded-full !bg-white/85 !p-0 !shadow-sm" icon={<ArrowLeft className="size-3" />} disabled={index <= 0} onClick={() => onMove(-1)} />
            <Button size="small" className="!h-6 !w-6 !min-w-6 !rounded-full !bg-white/85 !p-0 !shadow-sm" icon={<ArrowRight className="size-3" />} disabled={index >= total - 1} onClick={() => onMove(1)} />
        </div>
    );
}

function buildLog({
    prompt,
    model,
    config,
    references,
    durationMs,
    successCount,
    failCount,
    status,
    images,
    taskIds = [],
    error,
}: {
    prompt: string;
    model: string;
    config: GenerationLogConfig;
    references: ReferenceImage[];
    durationMs: number;
    successCount: number;
    failCount: number;
    status: GenerationLog["status"];
    images: GeneratedImage[];
    taskIds?: string[];
    error?: string;
}): GenerationLog {
    const logConfig = {
        model: config.model,
        imageModel: config.imageModel,
        quality: config.quality,
        size: config.size,
        background: config.background,
        count: config.count,
    };
    return {
        id: nanoid(),
        createdAt: Date.now(),
        title: prompt.slice(0, 12) || i18n.t("workbench.untitled"),
        prompt,
        time: new Date().toLocaleString(i18n.resolvedLanguage, { hour12: false }),
        model,
        config: logConfig,
        references,
        durationMs,
        successCount,
        failCount,
        serverTaskIds: [...new Set([...taskIds, ...images.flatMap(image => image.taskId ? [image.taskId] : [])])],
        imageCount: Number(logConfig.count) || successCount,
        size: logConfig.size,
        quality: logConfig.quality,
        status,
        images,
        ...(error ? { error } : {}),
    };
}
