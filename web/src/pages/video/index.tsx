import { handoffCreationToChat, ensureCreationThread, newCreationThread, saveCreationRecord } from "@/pages/chat/chat-store";
import { RecordActions } from "@/components/creation/record-actions";
import { CreationToolbar } from "@/components/creation/creation-toolbar";
import { Button as ActionButton } from "@astryxdesign/core/Button";
import { CreationRequest, ContinuationNotice, continuationPrompt } from "@/components/creation/creation-conversation";
import type { Continuation } from "@/components/creation/creation-drafts";
import { PromptOptimizationEstimate } from "@/components/creation/prompt-optimization-estimate";
import { OtherCreationRecord, useOtherCreationHistory } from "@/components/creation/mixed-creation-history";
import { ChatComposer } from "@astryxdesign/core/Chat";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import { CreationStream } from "@/components/creation/creation-stream";
import { CreationRecordsRail, useNarrowRecords } from "@/components/creation/creation-records-rail";
import { CreditEstimate } from "@/components/creation/credit-estimate";
import { readCreationDraft, saveCreationDraft } from "@/components/creation/creation-drafts";
import { useCreationHistory } from "@/components/creation/creation-history";
import { useVisibleRecords } from "@/components/creation/use-visible-records";
import { useReferenceTransfer } from "@/components/creation/use-reference-transfer";
import { creationStatus } from "@/components/creation/creation-status";
import { downloadCloudMedia, refreshExpiredMedia } from "@/services/media-download";
import { GenerationHistoryPager, mergeGenerationHistory, generationTaskIds, hideGenerationHistory } from "@/services/api/generation-history";
import { ArrowLeft, ArrowRight, BookOpen, CheckSquare, ClipboardPaste, Download, FolderPlus, History, Plus, SlidersHorizontal, Sparkles, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent } from "react";
import { App, Button, Checkbox, Drawer, Empty, Modal, Tag, Typography } from "antd";
import { nanoid } from "nanoid";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { mediaFileKind } from "@/lib/media-file";
import { removePromptParameter, takePendingPrompt } from "@/lib/pending-prompt";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { videoLogStorage } from "@/lib/video-log-storage";

import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { CanvasPromptChipInput } from "@/components/canvas/canvas-prompt-chip-input";
import { PromptOptimizeButton } from "@/components/prompt-optimize-button";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { ModelPicker } from "@/components/model-picker";
import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import { VideoSettingsPanel, normalizeVideoResolutionValue, normalizeVideoSizeValue, videoModeLabel, videoSizeLabel } from "@/components/video-settings-panel";
import { canvasThemes } from "@/lib/canvas-theme";
import { clampVideoSeconds, formatVideoResolution } from "@/lib/media-size";
import { formatBytes, formatDuration } from "@/lib/image-utils";
import { resolveMediaUrl, uploadMediaFile } from "@/services/file-storage";
import { resolveImageUrl, ensureImagePreview, getImagePreviewRevision, previewUrlFor, retryLocalImage, subscribeImagePreviews, uploadImage } from "@/services/image-storage";
import { createVideoGenerationTask, isVideoInsufficientCredits, isVideoSubmissionRejected, pollVideoGenerationTask, storeGeneratedVideo, type VideoGenerationTask } from "@/services/api/video";
import { useAssetStore } from "@/stores/use-asset-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";
import { boolConfig, modelOptionLabel, modelOptionName, normalizeModelOptionValue, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import i18n from "@/i18n";

type GeneratedVideo = {
    id: string;
    url: string;
    storageKey: string;
    durationMs: number;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

type GenerationResult = {
    id: string;
    status: "pending" | "success" | "failed" | "unavailable";
    video?: GeneratedVideo;
    error?: string;
    statusMessage?: string;
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
    referenceVideos?: ReferenceVideo[];
    referenceAudios?: ReferenceAudio[];
    referenceCount?: number;
    creditsCharged?: number;
    reconciliationRequired?: boolean;
    durationMs: number;
    size: string;
    resolution: string;
    seconds: string;
    status: "pending" | "success" | "failed" | "unavailable";
    task?: VideoGenerationTask;
    video?: GeneratedVideo;
    error?: string;
};

type GenerationLogConfig = Pick<AiConfig, "model" | "videoModel" | "videoRouteId" | "size" | "vquality" | "videoSeconds" | "videoGenerateAudio" | "videoWatermark" | "videoMode">;

type UpdateAiConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;

export default function VideoPage() {
    const { message } = App.useApp();
    const { run: transferReference, isTransferring } = useReferenceTransfer();
    const reportMediaError = (error: unknown) => { if (!(error instanceof Error && error.name === "AbortError")) message.error(error instanceof Error ? error.message : String(error)); };
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragDepthRef = useRef(0);
    const activeLogIdsRef = useRef<Set<string>>(new Set());
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
    const [referenceVideos, setReferenceVideos] = useState<ReferenceVideo[]>([]);
    const [referenceAudios, setReferenceAudios] = useState<ReferenceAudio[]>([]);
    useEffect(() => {
        if (!userId || viewOwner !== userId || viewEpoch !== sessionEpoch) return;
        saveCreationDraft("video", userId, sessionEpoch, { continuation, prompt, references, videos: referenceVideos, audios: referenceAudios });
    }, [userId, viewOwner, viewEpoch, sessionEpoch, continuation, prompt, references, referenceVideos, referenceAudios]);
    const [results, setResults] = useState<GenerationResult[]>([]);
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const requestedRecord = searchParams.get("record");
    const targetRecord = logs.find((log) => log.id === requestedRecord || (requestedRecord && generationTaskIds(log).includes(requestedRecord)))?.id;

    const otherHistory = useOtherCreationHistory(userId, sessionEpoch, "image");
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
        useCreationHistory.getState().update(`${userId}:${sessionEpoch}`, "video", logs.map((log) => ({ id: log.id, title: log.title, createdAt: log.createdAt, mode: "video" })));
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
        accountEpochRef.current += 1;
        agentTaskIdRef.current = undefined;
        setAutoRunToken(0);
    }, [userId, sessionEpoch]);

    useEffect(() => {
        if (!userId || viewOwner !== userId || viewEpoch !== sessionEpoch || !isCurrentUser(userId, sessionEpoch) || appliedInitialPrompt.current === `${userId}:${sessionEpoch}:${location.key}`) return;
        const pending = takePendingPrompt("video", userId);
        if (pending) setContinuation(undefined);
        const initialPrompt = pending?.prompt || searchParams.get("prompt") || "";
        if (searchParams.has("prompt")) {
            const rest = removePromptParameter(searchParams).toString();
            navigate({ pathname: location.pathname, search: rest ? `?${rest}` : "", hash: location.hash }, { replace: true });
        }
        const pendingImages = pending?.references.filter((reference) => !reference.kind || reference.kind === "image") ?? [];
        const pendingVideos = pending?.references.filter((reference) => reference.kind === "video") ?? [];
        const pendingAudios = pending?.references.filter((reference) => reference.kind === "audio") ?? [];
        if (!initialPrompt && !pending?.references.length) return;
        appliedInitialPrompt.current = `${userId}:${sessionEpoch}:${location.key}`;
        if (initialPrompt) setPrompt(initialPrompt);
        if (pending) {
            const images = pendingImages.map((reference) => ({ id: nanoid(), name: reference.name, type: reference.type, dataUrl: reference.dataUrl, storageKey: reference.storageKey }));
            setReferences((current) => pending.appendReferences ? [...current, ...images.filter((image) => !current.some((item) => image.storageKey ? item.storageKey === image.storageKey : item.dataUrl === image.dataUrl))] : images);
            if (!pending.appendReferences) {
                setReferenceVideos(pendingVideos.map((reference) => ({ id: nanoid(), name: reference.name, type: reference.type, url: reference.dataUrl, storageKey: reference.storageKey })));
                setReferenceAudios(pendingAudios.map((reference) => ({ id: nanoid(), name: reference.name, type: reference.type, url: reference.dataUrl, storageKey: reference.storageKey })));
            }
        }
    }, [searchParams, userId, viewOwner, viewEpoch, sessionEpoch, navigate, location.pathname, location.hash, location.key]);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [startedAt, setStartedAt] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
    const [previewLog, setPreviewLog] = useState<GenerationLog | null>(null);
    const [detailsLog, setDetailsLog] = useState<GenerationLog | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [referenceDragTarget, setReferenceDragTarget] = useState(false);
    const [autoRunToken, setAutoRunToken] = useState(0);
    const videoCommand = useWorkbenchAgentStore((state) => state.videoCommand);
    const clearVideoCommand = useWorkbenchAgentStore((state) => state.clearVideoCommand);
    const updateAgentTask = useWorkbenchAgentStore((state) => state.updateTask);
    const processedCommandRef = useRef(0);
    const agentTaskIdRef = useRef<string | undefined>(undefined);

    const model = effectiveConfig.videoModel || effectiveConfig.model;
    const serverModels = useConfigStore((state) => state.serverModels);
    const selectedModel = serverModels.find((item) => item.id === modelOptionName(model));
    const configuredLimits = selectedModel?.metadata?.referenceLimits as { images?: number; videos?: number; audios?: number } | undefined;
    const isFl2v = /minimax[-_]?h3[-_]?fl2v/i.test(selectedModel?.upstreamName || "");
    const limits = { images: isFl2v ? 2 : configuredLimits?.images ?? 7, videos: isFl2v ? 0 : configuredLimits?.videos ?? 3, audios: isFl2v ? 0 : configuredLimits?.audios ?? 3 };
    const canGenerate = Boolean(prompt.trim());
    const promptReferences = useMemo<CanvasResourceReference[]>(() => [...references.map((item, index) => ({
        id: `video:${item.id}`,
        nodeId: `video:${item.id}`,
        kind: "image",
        label: `@${imageReferenceLabel(index)}`,
        title: item.name || imageReferenceLabel(index),
        previewUrl: previewUrlFor(item.storageKey) || item.dataUrl,
        active: true,
    } as CanvasResourceReference)), ...referenceVideos.map((item, index): CanvasResourceReference => ({
        id: `video-ref:${item.id}`, nodeId: `video-ref:${item.id}`, kind: "video", label: `@视频${index + 1}`,
        title: item.name || `视频${index + 1}`, active: true,
    })), ...referenceAudios.map((item, index): CanvasResourceReference => ({
        id: `audio-ref:${item.id}`, nodeId: `audio-ref:${item.id}`, kind: "audio", label: `@音频${index + 1}`,
        title: item.name || `音频${index + 1}`, active: true,
    }))], [references, referenceVideos, referenceAudios]);

    useEffect(() => {
        if (!running || !startedAt) return;
        const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 1000);
        return () => window.clearInterval(timer);
    }, [running, startedAt]);

    useEffect(() => {
        historyPagerRef.current = userId ? new GenerationHistoryPager(userId, "video") : null;
        setHistoryHasMore(false); setLoadingEarlier(false);
        setLogs([]); setResults([]); setPreviewLog(null); setDetailsLog(null); setSelectedLogIds([]); setRunning(false); setStartedAt(0);
        const draft = userId ? readCreationDraft("video", userId, sessionEpoch) : undefined;
        setContinuation(draft?.continuation); setPrompt(draft?.prompt ?? ""); setReferences(draft?.references ?? []); setReferenceVideos(draft?.videos ?? []); setReferenceAudios(draft?.audios ?? []);
        setViewOwner(userId); setViewEpoch(sessionEpoch);
        if (userId) void refreshLogs();
    }, [userId, sessionEpoch]);

    const addReferences = async (files?: FileList | null) => {
        const owner = userId, epoch = accountEpochRef.current;
        if (!owner || !isCurrentView()) return;
        const active = () => isCurrentUser(owner, sessionEpoch) && accountEpochRef.current === epoch;
        if (!active()) return;
        const selectedFiles = Array.from(files || []);
        const supported = selectedFiles.map((file) => ({ file, kind: mediaFileKind(file) })).filter((item): item is { file: File; kind: NonNullable<ReturnType<typeof mediaFileKind>> } => Boolean(item.kind));
        if (supported.length !== selectedFiles.length) message.warning(t("videoWorkbench.unsupportedFiles"));
        const imageFiles = supported.filter((item) => item.kind === "image").map((item) => item.file).slice(0, Math.max(0, limits.images - references.length));
        const videoFiles = supported.filter((item) => item.kind === "video").map((item) => item.file).slice(0, Math.max(0, limits.videos - referenceVideos.length));
        const audioFiles = supported.filter((item) => item.kind === "audio").map((item) => item.file).slice(0, Math.max(0, limits.audios - referenceAudios.length));
        if (imageFiles.length + videoFiles.length + audioFiles.length < supported.length) message.warning(`当前模型最多支持 ${limits.images} 张图片、${limits.videos} 个视频和 ${limits.audios} 个音频`);
        const queuedImages = imageFiles.map((file) => ({ id: nanoid(), file, previewUrl: URL.createObjectURL(file) }));
        if (queuedImages.length) setReferences((value) => [...value, ...queuedImages.map(({ id, file, previewUrl }) => ({ id, name: file.name, type: file.type, dataUrl: previewUrl, queued: true, progress: 0 }))]);
        const nextVideos: ReferenceVideo[] = [];
        const nextAudios: ReferenceAudio[] = [];
        let failed: unknown;
        for (const item of queuedImages) {
            if (!active()) return;
            setReferences((value) => value.map((ref) => (ref.id === item.id ? { ...ref, queued: false, uploading: true, progress: 0 } : ref)));
            try {
                const image = await uploadImage(item.file, {
                    expectedOwner: owner,
                    onProgress: (progress) => setReferences((value) => value.map((ref) => (ref.id === item.id ? { ...ref, progress } : ref))),
                });
                setReferences((value) => value.map((ref) => (ref.id === item.id ? { ...ref, dataUrl: image.url, type: image.mimeType, storageKey: image.storageKey, uploading: false, queued: false, progress: 100, error: undefined } : ref)));
                if (image.url !== item.previewUrl) window.setTimeout(() => URL.revokeObjectURL(item.previewUrl), 1000);
            } catch (error) {
                setReferences((value) => value.map((ref) => (ref.id === item.id ? { ...ref, uploading: false, queued: false, progress: 0, error: error instanceof Error ? error.message : String(error) } : ref)));
                failed ??= error;
            }
            if (!active()) return;
        }
        for (const file of videoFiles) {
            if (file.size > 200 * 1024 * 1024) {
                message.warning(t("videoWorkbench.videoTooLarge"));
                continue;
            }
            try {
                const media = await uploadMediaFile(file, "video", { expectedOwner: owner });
                nextVideos.push({ id: nanoid(), name: file.name, type: media.mimeType || file.type, url: media.url, storageKey: media.storageKey, bytes: media.bytes, width: media.width, height: media.height, durationMs: media.durationMs });
            } catch (error) {
                failed ??= error;
            }
            if (!active()) return;
        }
        for (const file of audioFiles) {
            if (file.size > 15 * 1024 * 1024) {
                message.warning(t("videoWorkbench.audioTooLarge"));
                continue;
            }
            try {
                const media = await uploadMediaFile(file, "audio", { expectedOwner: owner });
                nextAudios.push({ id: nanoid(), name: file.name, type: media.mimeType || file.type, url: media.url, storageKey: media.storageKey, durationMs: media.durationMs });
            } catch (error) {
                failed ??= error;
            }
            if (!active()) return;
        }
        if (failed !== undefined) reportMediaError(failed);
        if (nextVideos.length) setReferenceVideos((value) => [...value, ...nextVideos].slice(0, limits.videos));
        if (nextAudios.length) setReferenceAudios((value) => [...value, ...nextAudios].slice(0, limits.audios));
    };

    const handleReferenceDragEnter = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepthRef.current += 1;
        if (event.dataTransfer.types.includes("Files")) setReferenceDragTarget(true);
    };

    const handleReferenceDragLeave = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (!dragDepthRef.current) setReferenceDragTarget(false);
    };

    const handleReferenceDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepthRef.current = 0;
        setReferenceDragTarget(false);
        void transferReference(() => addReferences(event.dataTransfer.files)).catch(reportMediaError);
    };

    const retryReference = async (item: ReferenceImage) => {
        if (!item.storageKey || item.uploading) return;
        const owner = userId, epoch = accountEpochRef.current;
        if (!owner || !isCurrentView()) return;
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
        if (!owner || !isCurrentView()) return;
        const active = () => isCurrentUser(owner, sessionEpoch) && accountEpochRef.current === epoch;
        if (!active()) return;
        try {
            const items = await navigator.clipboard.read();
            const blobs = await Promise.all(items.flatMap((item) => item.types.filter((type) => type.startsWith("image/")).map((type) => item.getType(type))));
            if (!active()) return;
            if (!blobs.length) {
                message.error(t("videoWorkbench.clipboardEmpty"));
                return;
            }
            const nextReferences = await Promise.all(
                blobs.slice(0, Math.max(0, limits.images - references.length)).map(async (blob, index) => {
                    const image = await uploadImage(blob, { expectedOwner: owner });
                    return { id: nanoid(), name: `clipboard-${index + 1}.png`, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
                }),
            );
            if (!active()) return;
            if (nextReferences.length < blobs.length) message.warning(`当前模型最多支持 ${limits.images} 张参考图`);
            setReferences((value) => [...value, ...nextReferences].slice(0, limits.images));
            message.success(t("videoWorkbench.clipboardAdded", { count: nextReferences.length }));
        } catch {
            if (active()) message.error(t("videoWorkbench.clipboardEmpty"));
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
        const snapshot = buildRequestSnapshot();
        if (!snapshot) {
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("videoWorkbench.invalidParams") });
            return;
        }
        generationThread.current = await ensureCreationThread(owner);
        if (!active()) return;
        setElapsedMs(0);
        setSubmittedPrompt(snapshot.text);
        setRunning(true);
        if (agentTaskId) updateAgentTask(agentTaskId, { status: "running", error: undefined });
        setPreviewLog(null);
        setResults([{ id: nanoid(), status: "pending" }]);
        const batchStartedAt = performance.now();
        setStartedAt(batchStartedAt);
        try {
            const task = await createVideoGenerationTask(snapshot.config, snapshot.text, snapshot.references, { videos: snapshot.videos, audios: snapshot.audios, expectedUserId: owner });
            if (!active()) return;
            const log = buildLog({ prompt: snapshot.text, model, config: snapshot.config, references: snapshot.references, referenceVideos: snapshot.videos, referenceAudios: snapshot.audios, durationMs: 0, status: "pending", task });
            saveCreationRecord(owner, log, generationThread.current);
            await saveLog(log, false);
            void pollGenerationLog(log, snapshot.config, agentTaskId);
        } catch (error) {
            if (!active()) return;
            if (isVideoInsufficientCredits(error) || isVideoSubmissionRejected(error)) {
                const errorMessage = (error as Error).message;
                const log = buildLog({ prompt: snapshot.text, model, config: snapshot.config, references: snapshot.references, referenceVideos: snapshot.videos, referenceAudios: snapshot.audios, durationMs: performance.now() - batchStartedAt, status: "failed", error: errorMessage });
            saveCreationRecord(owner, log, generationThread.current);
                setResults([{ id: log.id, status: "failed", error: errorMessage }]);
                if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", successCount: 0, failCount: 1, error: errorMessage });
                message.error(errorMessage);
                setRunning(false);
                await saveLog(log, false);
                return;
            }
            // A lost submission response cannot establish whether a task was created.
            const errorMessage = `提交结果暂无法确认，请先查看生成记录或账户状态。${(error as Error)?.message || ""}`;
            const log = buildLog({ prompt: snapshot.text, model, config: snapshot.config, references: snapshot.references, referenceVideos: snapshot.videos, referenceAudios: snapshot.audios, durationMs: performance.now() - batchStartedAt, status: "unavailable", error: errorMessage });
            saveCreationRecord(owner, log, generationThread.current);
            setResults([{ id: log.id, status: "unavailable", error: errorMessage }]);
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", successCount: 0, failCount: 1, error: errorMessage });
            message.error(errorMessage);
            await saveLog(log, false);
            setRunning(false);
        }
    };

    // Handle video-generation commands from the Agent panel by setting the prompt and optionally starting generation.
    useEffect(() => {
        if (!userId || viewOwner !== userId || viewEpoch !== sessionEpoch || !isCurrentUser(userId, sessionEpoch) || !videoCommand || videoCommand.nonce === processedCommandRef.current) return;
        processedCommandRef.current = videoCommand.nonce;
        clearVideoCommand();
        if (typeof videoCommand.prompt === "string") setPrompt(videoCommand.prompt);
        if (videoCommand.run && running) {
            if (videoCommand.taskId) updateAgentTask(videoCommand.taskId, { status: "failed", error: t("videoWorkbench.busy") });
            return;
        }
        if (videoCommand.run) {
            agentTaskIdRef.current = videoCommand.taskId;
            setAutoRunToken((value) => value + 1);
        }
    }, [videoCommand, clearVideoCommand, running, updateAgentTask, userId, viewOwner, viewEpoch, sessionEpoch]);

    useEffect(() => {
        if (!autoRunToken || !userId || !isCurrentUser(userId, sessionEpoch) || viewOwner !== userId || viewEpoch !== sessionEpoch) return;
        void generate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoRunToken]);

    const buildRequestSnapshot = () => {
        const text = continuationPrompt(prompt, continuation);
        if (!text) {
            message.error(t("videoWorkbench.promptRequired"));
            return null;
        }
        if (references.length > limits.images || referenceVideos.length > limits.videos || referenceAudios.length > limits.audios) {
            message.error(`当前模型最多支持 ${limits.images} 张图片、${limits.videos} 个视频和 ${limits.audios} 个音频，请先调整素材`);
            return null;
        }
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("workbench.configFirst"));
            openConfigDialog(true);
            return null;
        }
        return { text, config: buildVideoConfig(effectiveConfig, model), references: [...references], videos: [...referenceVideos], audios: [...referenceAudios] };
    };

    const retryResult = () => {
        void generate();
    };

    const downloadVideo = (video: GeneratedVideo) => {
        if (!isCurrentView()) return;
        if (!downloadCloudMedia(video.url, "video.mp4")) saveAs(video.url, "video.mp4");
    };

    const saveResultToAssets = (video: GeneratedVideo) => {
        if (!userId || !isCurrentView()) return;
        addAsset({
            kind: "video",
            title: t("videoWorkbench.resultTitle"),
            coverUrl: "",
            tags: [],
            source: t("videoWorkbench.source"),
            data: { url: video.url, storageKey: video.storageKey, width: video.width, height: video.height, bytes: video.bytes, mimeType: video.mimeType },
            metadata: { source: "video-page", prompt },
        });
        message.success(t("common.addedToAssets"));
    };

    const insertPickedAsset = async (payload: InsertAssetPayload) => {
        const owner = userId, epoch = accountEpochRef.current;
        if (!owner || !isCurrentView()) return;
        if (payload.kind === "text") {
            setPrompt(payload.content);
        } else if (payload.kind === "image") {
            if (references.length >= limits.images) { message.warning(`当前模型最多支持 ${limits.images} 张参考图`); return; }
            const stored = await uploadImage(payload.dataUrl, { expectedOwner: owner });
            if (!isCurrentUser(owner, sessionEpoch) || accountEpochRef.current !== epoch) return;
            setReferences((value) => [...value, { id: nanoid(), name: payload.title, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey }].slice(0, limits.images));
        }
        setAssetPickerOpen(false);
    };

    const openChat = async () => {
        if (!userId || !isCurrentView()) return;
        const threadId = await ensureCreationThread(userId);
        if (!isCurrentView()) return;
        const selected = previewLog ?? logs.find(log => log.id === requestedRecord || (requestedRecord && generationTaskIds(log).includes(requestedRecord)));
        const record = selected ?? (references.length ? { id: `draft-video-${threadId}`, createdAt: Date.now(), prompt, model, status: "success", references } : undefined);
        return handoffCreationToChat(userId, record);
    };

    const createSession = () => {
        if (!isCurrentView()) return;
        if (isTransferring) { message.warning("参考素材正在处理，请等待完成后再新建创作"); return; }
        if (userId) newCreationThread(userId);
        setContinuation(undefined);
        setPrompt("");
        setReferences([]);
        setReferenceVideos([]);
        setReferenceAudios([]);
        setResults([]);
        setElapsedMs(0);
        setStartedAt(0);
        setSelectedLogIds([]);
        setPreviewLog(null);
    };

    const deleteSelectedLogs = () => {
        if (!userId || !isCurrentView()) return;
        void hideGenerationHistory(userId, logs.filter(log => selectedLogIds.includes(log.id)).flatMap(generationTaskIds)).then(() => Promise.all(selectedLogIds.map((id) => videoLogStorage.remove(userId, id)) )).then(() => { if (!isCurrentUser(userId, sessionEpoch)) return; historyPagerRef.current = new GenerationHistoryPager(userId, "video"); return refreshLogs(); }).catch(error => message.error(error instanceof Error ? error.message : String(error)));
        if (previewLog && selectedLogIds.includes(previewLog.id)) {
            setPreviewLog(null);
            setResults([]);
        }
        setSelectedLogIds([]);
        setDeleteConfirmOpen(false);
    };

    const saveLog = async (log: GenerationLog, resumePending = true) => {
        if (!userId || !isCurrentUser(userId, sessionEpoch)) return;
        saveCreationRecord(userId, log);
        const epoch = accountEpochRef.current;
        await videoLogStorage.set(userId, log.id, serializeLog(log));
        if (!isCurrentUser(userId, sessionEpoch) || accountEpochRef.current !== epoch) return;
        await refreshLogs(resumePending);
    };

    const refreshLogs = async (resumePending = true) => {
        if (!userId) return [];
        const epoch = accountEpochRef.current;
        const pager = historyPagerRef.current;
        if (!pager) return [];
        const { items: nextLogs, hasMore } = await readStoredLogs(userId, pager);
        if (!isCurrentUser(userId, sessionEpoch) || accountEpochRef.current !== epoch || historyPagerRef.current !== pager) return [];
        setLogs(nextLogs);
        setHistoryHasMore(hasMore);
        if (resumePending) resumePendingLogs(nextLogs);
        return nextLogs;
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
            setLogs(items); setHistoryHasMore(hasMore); visibleHistory.showEarlier(); resumePendingLogs(items);
        } catch (error) { reportMediaError(error); }
        finally { if (historyPagerRef.current === pager) setLoadingEarlier(false); }
    };

    const resumePendingLogs = (items: GenerationLog[]) => {
        for (const log of items) {
            if (log.status === "pending" && log.task) void pollGenerationLog(log);
        }
    };

    const pollGenerationLog = async (log: GenerationLog, configOverride?: AiConfig, agentTaskId?: string) => {
        const owner = userId;
        if (!owner || !isCurrentUser(owner, sessionEpoch)) return;
        const epoch = accountEpochRef.current;
        const active = () => isCurrentUser(owner, sessionEpoch) && accountEpochRef.current === epoch;
        const activeKey = `${epoch}:${log.id}`;
        if (!log.task || activeLogIdsRef.current.has(activeKey)) return;
        activeLogIdsRef.current.add(activeKey);
        setRunning(true);
        setStartedAt((value) => value || performance.now());
        setResults((value) => (value.length ? value : [{ id: log.id, status: "pending" }]));
        const taskConfig = buildVideoConfig({ ...effectiveConfig, ...log.config }, log.task.model || log.model);
        let confirmedFailure = false;
        let statusMessage = '已提交，正在查询状态';
        try {
            for (;;) {
                const state = await pollVideoGenerationTask(configOverride || taskConfig, log.task, { expectedUserId: owner });
                if (!active()) return;
                if (state.status === "completed") {
                    const stored = await storeGeneratedVideo(state.result, { expectedOwner: owner });
                    if (!active()) return;
                    const nextVideo: GeneratedVideo = {
                        id: nanoid(),
                        url: stored.url,
                        storageKey: stored.storageKey,
                        durationMs: Date.now() - log.createdAt,
                        width: stored.width || 1280,
                        height: stored.height || 720,
                        bytes: stored.bytes,
                        mimeType: stored.mimeType,
                    };
                    setResults([{ id: log.id, status: "success", video: nextVideo }]);
                    if (agentTaskId) updateAgentTask(agentTaskId, { status: "succeeded", successCount: 1, failCount: 0, error: undefined });
                    await saveLog({ ...log, status: "success", durationMs: nextVideo.durationMs, video: nextVideo, error: undefined });
                    message.success(t("videoWorkbench.generated"));
                    return;
                }
                if (state.status === "failed") { confirmedFailure = true; throw new Error(state.error); }
                if (state.status === "unavailable") {
                    setResults([{ id: log.id, status: "unavailable", error: state.error }]);
                    if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", successCount: 0, failCount: 1, error: state.error });
                    await saveLog({ ...log, status: "unavailable", durationMs: Date.now() - log.createdAt, error: state.error }, false);
                    message.warning(state.error);
                    return;
                }
                statusMessage = state.statusMessage || '已提交，等待处理';
                setResults([{ id: log.id, status: 'pending', statusMessage }]);
                if (state.review) {
                    await saveLog({ ...log, status: 'pending', durationMs: Date.now() - log.createdAt }, false);
                    return;
                }
                if (Date.now() - log.createdAt >= 60 * 60 * 1000) throw new Error("任务处理中");
                await delay(5000);
            }
        } catch (error) {
            if (!active()) return;
            const errorMessage = error instanceof Error ? error.message : t("workbench.generationFailed");
            if (confirmedFailure) {
                setResults([{ id: log.id, status: "failed", error: errorMessage }]);
                if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", successCount: 0, failCount: 1, error: errorMessage });
                await saveLog({ ...log, status: "failed", durationMs: Date.now() - log.createdAt, error: errorMessage });
                message.error(errorMessage);
            } else {
                setResults([{ id: log.id, status: "pending", statusMessage }]);
                await saveLog({ ...log, status: "pending", durationMs: Date.now() - log.createdAt, error: undefined }, false);
            }
        } finally {
            activeLogIdsRef.current.delete(activeKey);
            if (active() && ![...activeLogIdsRef.current].some((key) => key.startsWith(`${epoch}:`))) {
                setRunning(false);
                setStartedAt(0);
            }
        }
    };

    const continueVideo = (log: GenerationLog) => {
        if (!isCurrentView() || isTransferring || running) return;
        previewGenerationLog(log);
        setContinuation({ title: log.title, prompt: log.prompt });
        setPrompt("");
    };

    const previewGenerationLog = (log: GenerationLog) => {
        if (!isCurrentView()) return false;
        if (isTransferring) { message.warning("参考素材正在处理，请等待完成后再回填记录"); return false; }
        setPreviewLog(log);
        setLogsOpen(false);
        setContinuation(undefined);
        setPrompt(log.prompt);
        setReferences(log.references || []);
        setReferenceVideos(log.referenceVideos || []);
        setReferenceAudios(log.referenceAudios || []);
        if (log.config.videoModel || log.model) updateConfig("videoModel", normalizeModelOptionValue(log.config.videoModel || log.model, effectiveConfig.channels));
        updateConfig("videoRouteId", log.config.videoRouteId || "");
        if (log.config.size) updateConfig("size", log.config.size);
        if (log.config.vquality) updateConfig("vquality", log.config.vquality);
        if (log.config.videoSeconds) updateConfig("videoSeconds", log.config.videoSeconds);
        if (log.config.videoGenerateAudio) updateConfig("videoGenerateAudio", log.config.videoGenerateAudio);
        if (log.config.videoWatermark) updateConfig("videoWatermark", log.config.videoWatermark);
        if (log.config.videoMode) updateConfig("videoMode", log.config.videoMode);
        setResults(log.status === "pending" || log.status === "unavailable" ? [{ id: log.id, status: log.status, error: log.error }] : log.video ? [{ id: log.video.id, status: "success", video: log.video }] : [{ id: log.id, status: "failed", error: log.error || t("workbench.generationFailed") }]);
        const missing = historyGaps(log);
        if (missing.length) message.warning(`${missing.join("；")}，请检查后再生成`);
        return missing.length > 0;
    };

    const editedNavigation = useRef("");
    useEffect(() => {
        if (!["edit", "continue"].includes(searchParams.get("action") || "") || !targetRecord || !isCurrentView() || isTransferring) return;
        const key = `${userId}:${sessionEpoch}:${location.key}`;
        if (editedNavigation.current === key) return;
        const log = logs.find(item => item.id === targetRecord);
        if (!log) return;
        editedNavigation.current = key;
        if (searchParams.get("action") === "continue") continueVideo(log);
        else void previewGenerationLog(log);
        const params = new URLSearchParams(searchParams);
        params.delete("action");
        params.delete("image");
        navigate({ pathname: location.pathname, search: `?${params}`, hash: location.hash }, { replace: true });
    }, [targetRecord, logs, searchParams, location.key, userId, sessionEpoch, viewOwner, viewEpoch, isTransferring]);
    if (!userId || viewOwner !== userId || viewEpoch !== sessionEpoch) return null;
    const previewGaps = previewLog ? historyGaps({ ...previewLog, references, referenceVideos, referenceAudios }) : [];

    return (
        <div className="flex h-full flex-col overflow-hidden bg-muted text-foreground dark:bg-background dark:text-foreground page-surface">
            <div className="flex min-h-0 flex-1">
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="creation-top-actions flex shrink-0 items-center justify-between gap-2 px-4 py-2">
                    <ActionButton variant="ghost" size="sm" label="新建创作" icon={<Plus className="size-4" />} isDisabled={isTransferring} onClick={createSession} />
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
                            input={<div className="thin-scrollbar max-h-[30dvh] space-y-2 overflow-y-auto" onDragOver={(event) => { if (!referenceOpen && !references.length && !referenceVideos.length && !referenceAudios.length) event.preventDefault(); }} onDrop={(event) => { if (!referenceOpen && !references.length && !referenceVideos.length && !referenceAudios.length) { event.preventDefault(); void transferReference(() => addReferences(event.dataTransfer.files)).catch(reportMediaError); } }}>
                        <ContinuationNotice value={continuation} mode="video" onCancel={() => { setContinuation(undefined); }} />
                                <div className="relative">
                                    <CanvasPromptChipInput
                                        value={prompt}
                                        references={promptReferences}
                                        onChange={setPrompt}
                                        placeholder={continuation ? "例如：镜头推进慢一点，保留原来的场景…" : "描述你想生成的视频，或选择已有作品继续调整…"}
                                        placeholderClassName="left-3 top-2 leading-7"
                                        chipMode="label"
                                        className="thin-scrollbar min-h-20 w-full rounded-lg border border-border bg-transparent px-3 py-2 pb-9 pr-10 text-sm leading-7 text-foreground focus:border-foreground/40"
                                    />
                                    <PromptOptimizeButton prompt={prompt} model={model} capability="video" disabled={running} onOptimized={setPrompt} />
                                </div>
                                {(referenceOpen || references.length > 0 || referenceVideos.length > 0 || referenceAudios.length > 0) && (
                                    <div className="min-w-0">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <span className="text-base font-semibold">{t("videoWorkbench.references")}</span>
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
                                    className={`hover-scrollbar hover-scrollbar-hint flex min-h-24 w-full min-w-0 max-w-full gap-2 overflow-x-scroll overflow-y-hidden rounded-lg border border-dashed p-2 pb-3 overscroll-x-contain transition-colors ${referenceDragTarget ? "border-foreground bg-muted/80 dark:border-white/20 dark:bg-muted/80" : "border-border dark:border-border"}`}
                                    onDragEnter={handleReferenceDragEnter}
                                    onDragOver={(event) => {
                                        event.preventDefault();
                                        event.dataTransfer.dropEffect = "copy";
                                    }}
                                    onDragLeave={handleReferenceDragLeave}
                                    onDrop={handleReferenceDrop}
                                >
                                    {references.map((item, index) => (
                                        <div key={item.id} className={`group relative size-20 shrink-0 overflow-hidden rounded-md border ${item.storageKey ? "border-amber-500" : "border-border"}`} title={item.storageKey ? t("common.localOnlyHint") : undefined}>
                                            <Thumbnail src={previewUrlFor(item.storageKey) || item.dataUrl} alt={item.name} label={item.name} className="size-full" />
                                            <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{index + 1}</span>
                                            {item.storageKey && !item.uploading && !item.queued ? <button type="button" className="absolute left-1 top-7 z-30 rounded bg-amber-600/90 px-1.5 py-0.5 text-[9px] font-medium text-white" onClick={(event) => { event.stopPropagation(); void transferReference(() => retryReference(item)); }} title={t("common.retryUpload")}>{t("common.retryUpload")}</button> : null}
                                            {!item.uploading && !item.queued && !item.error ? <ReferenceOrderButtons index={index} total={references.length} onMove={(offset) => setReferences((value) => moveListItem(value, index, offset))} /> : null}
                                            <button type="button" className="absolute right-1 top-1 z-30 flex size-7 items-center justify-center rounded-full bg-black/70 text-white shadow-sm" onClick={() => setReferences((value) => value.filter((ref) => ref.id !== item.id))} aria-label={t("videoWorkbench.removeImage")}>
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
                                    {!references.length && !referenceVideos.length && !referenceAudios.length ? <div className="flex min-w-full items-center justify-center text-sm text-muted-foreground">{referenceDragTarget ? t("videoWorkbench.dropReferences") : `暂无参考素材，可拖入图片、视频或音频；当前模型最多 ${limits.images} 张图片、${limits.videos} 个视频、${limits.audios} 个音频`}</div> : null}
                                </div>
                                {referenceVideos.length || referenceAudios.length ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {referenceVideos.map((video) => (
                                            <Tag key={video.id} closable onClose={() => setReferenceVideos((value) => value.filter((item) => item.id !== video.id))} className="m-0 max-w-full">
                                                {t("videoWorkbench.videoReferences")} · <span className="inline-block max-w-40 truncate align-bottom">{video.name}</span>
                                            </Tag>
                                        ))}
                                        {referenceAudios.map((audio) => (
                                            <Tag key={audio.id} closable onClose={() => setReferenceAudios((value) => value.filter((item) => item.id !== audio.id))} className="m-0 max-w-full">
                                                {t("videoWorkbench.audioReferences")} · <span className="inline-block max-w-40 truncate align-bottom">{audio.name}</span>
                                            </Tag>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                                )}
                            </div>}
                            footerActions={<div className="creation-actions w-full min-w-0"><CreationToolbar mode="video" onChat={openChat} busy={isTransferring || running} referencesOpen={referenceOpen} onSettings={() => setSettingsOpen(true)} onUpload={() => fileInputRef.current?.click()} onReferences={() => setReferenceOpen(value => !value)} onPrompts={() => setPromptDialogOpen(true)} onAssets={() => setAssetPickerOpen(true)} modelPicker={<ModelPicker config={config} value={model} capability="video" placeholder="选择视频模型" onChange={(value) => updateConfig("videoModel", value)} onRouteSelect={(value, routeId) => { updateConfig("videoModel", value); updateConfig("videoRouteId", routeId); }} />} /></div>}
                            sendActions={<div className="creation-costs"><PromptOptimizationEstimate mode="video" /><CreditEstimate mode="video" /></div>}
                            sendButton={<ActionButton variant="primary" size="lg" label={running ? "生成中" : continuation ? "生成新版本" : "开始生成"} icon={<Sparkles className="size-4" />} isLoading={running} isDisabled={!canGenerate || running || isTransferring} onClick={() => void generate()} />}

                        />
                    </div>
                }>
                    <div className="mx-auto w-full max-w-[960px] px-2 pb-8 pt-6">
                        {(visibleHistory.hasEarlier || historyHasMore || otherHistory.more) && <Button type="text" className="creation-load-earlier" loading={loadingEarlier} onClick={() => void showEarlierRecords()}>加载更早记录</Button>}
                        {otherHistory.error && <p className="mb-4 text-sm text-muted-foreground">{otherHistory.error}</p>}
                        {mixedRecords.map((entry) => entry.kind === "other" ? <OtherCreationRecord onUseImage={image => void transferReference(() => insertPickedAsset({ kind: "image", dataUrl: image.dataUrl, storageKey: image.storageKey, title: entry.log.title })).catch(reportMediaError)} disabled={isTransferring} key={entry.log.id} log={entry.log} mode="image" /> : ((log: GenerationLog) => (
                        <article id={`creation-record-${log.id}`} key={log.id} className="astryx-chat-message mb-12 max-w-[620px]">
                            <CreationRequest prompt={log.prompt} />
                            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">视频生成</span><span>{modelOptionLabel(effectiveConfig, log.model)}</span><span>{log.time}</span><span>{log.reconciliationRequired ? "待核对" : creationStatus(log.status)}</span></div>
                            {log.video && <ResultVideoCard video={log.video} onDownload={downloadVideo} onSaveAsset={saveResultToAssets} />}
                            {log.error && <div className="mt-2 text-sm text-muted-foreground">{friendlyErrorMessage(log.error)}</div>}
                            <RecordActions archiveUrl={log.video?.url} primary={{ key: "continue", label: "调整后重生成", disabled: running || isTransferring, run: () => continueVideo(log) }} secondary={{ key: "details", label: "生成详情", run: () => setDetailsLog(log) }} more={[
                                { key: "edit", label: "编辑原描述与参数", disabled: isTransferring, run: () => { previewGenerationLog(log); } },
                                { key: "again", label: "按原参数再次生成", disabled: isTransferring, run: () => { if (!previewGenerationLog(log)) message.info("已回填原参数，请核对当前积分后点击开始生成"); } },
                                ...(log.task && (log.status === "pending" || log.status === "unavailable") ? [{ key: "query", label: "查询任务进度", run: () => { void pollGenerationLog(log); } }] : []),
                            ]} />
                        </article>
                    ))(entry.log))}
                        {(running || (!logs.length && !otherHistory.logs.length) || (!previewLog && results.some((result) => (result.status === "failed" || result.status === "unavailable") && !logs.some((log) => log.id === result.id) || (result.video && !logs.some((log) => log.id === result.id || (log.video && sameVideo(log.video, result.video!))))))) && (<div className={!running && !results.length ? "creation-empty-wrap" : "max-w-[620px]"}>
                        {running && submittedPrompt && !logs.some(log => log.prompt === submittedPrompt) && <CreationRequest prompt={submittedPrompt} />}
                        <div className={running || results.length ? "mb-4 flex items-center justify-between gap-3" : "hidden"}>
                            <h2 className="text-sm text-muted-foreground">{running ? "正在生成视频…" : "生成结果"}</h2>
                            {running ? <Tag className="m-0 px-2 py-1">{results.find(result => result.status === 'pending')?.statusMessage || '正在提交'} · {formatDuration(elapsedMs)}</Tag> : null}
                        </div>
                        {results.some((result) => result.status !== "pending") ? (
                            <div className="grid gap-4">
                                {results.map((result) => (result.status === "success" && result.video ? <ResultVideoCard key={result.id} video={result.video} onDownload={downloadVideo} onSaveAsset={saveResultToAssets} /> : result.status === "failed" ? <FailedVideoCard key={result.id} error={friendlyErrorMessage(result.error || t("workbench.generationFailed"))} onRetry={retryResult} /> : result.status === "unavailable" ? <div key={result.id} className="rounded-lg border border-amber-300 p-5 text-sm dark:border-amber-700">{result.error}</div> : null))}
                            </div>
                        ) : (
                            <div className="flex min-h-32 flex-col items-center justify-center text-center">
                                {running ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={results.find(result => result.status === 'pending')?.statusMessage || '正在提交'} /> : <div className="creation-empty"><span className="creation-empty-icon"><Sparkles /></span><h2>让想象动起来</h2><p>描述镜头、动作与氛围，或添加参考素材。<br />在这里开始你的视频创作。</p></div>}
                            </div>
                        )}
                    </div>)}
                    </div>
                </CreationStream>
                </div>
                {/* 宽屏：生成记录停靠右侧，不再盖住合成器 */}
                <CreationRecordsRail open={recordsRailOpen} count={logs.length} onToggle={() => setRecordsRailOpen((value) => !value)}>
                    <LogPanel logs={logs} selectedLogIds={selectedLogIds} activeLogId={previewLog?.id} onSelectedLogIdsChange={setSelectedLogIds} onCreateSession={createSession} onDeleteSelected={() => setDeleteConfirmOpen(true)} onPreviewLog={previewGenerationLog} />
                </CreationRecordsRail>
            </div>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,audio/*"
                multiple
                className="hidden"
                onChange={(event) => {
                    void transferReference(() => addReferences(event.target.files)).catch(reportMediaError);
                    event.target.value = "";
                }}
            />
            <Drawer title={t("workbench.logs")} placement="bottom" size="large" open={logsOpen} onClose={() => setLogsOpen(false)}>
                <LogPanel logs={logs} selectedLogIds={selectedLogIds} activeLogId={previewLog?.id} onSelectedLogIdsChange={setSelectedLogIds} onCreateSession={createSession} onDeleteSelected={() => setDeleteConfirmOpen(true)} onPreviewLog={previewGenerationLog} />
            </Drawer>
            <Drawer title={t("workbench.settings")} placement="bottom" height="82vh" rootClassName="creation-settings-drawer" open={settingsOpen} onClose={() => setSettingsOpen(false)}>
                <div className="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2">
                    <GenerationSettings config={effectiveConfig} model={model} updateConfig={updateConfig} openConfigDialog={openConfigDialog} />
                </div>
            </Drawer>
            <Drawer title="生成详情" open={Boolean(detailsLog)} onClose={() => setDetailsLog(null)}>
                {detailsLog && <div className="mb-4 space-y-2 text-sm">
                    <p>生成模式：{detailsLog.config.videoMode === "reference" ? "多参考" : detailsLog.config.videoMode === "frames" ? "首尾帧" : "未记录"}</p>
                    <p>声音：{detailsLog.config.videoGenerateAudio === "true" ? "开启" : detailsLog.config.videoGenerateAudio === "false" ? "关闭" : "未记录"} · 水印：{detailsLog.config.videoWatermark === "true" ? "开启" : detailsLog.config.videoWatermark === "false" ? "关闭" : "未记录"}</p>
                </div>}
                {detailsLog && <dl className="space-y-4 text-sm"><div><dt className="text-muted-foreground">提示词</dt><dd className="mt-1 whitespace-pre-wrap break-words">{detailsLog.prompt}</dd></div><div><dt className="text-muted-foreground">模型与参数</dt><dd className="mt-1">{modelOptionLabel(effectiveConfig, detailsLog.model)} · {detailsLog.size || "比例未记录"} · {detailsLog.resolution || "清晰度未记录"} · {detailsLog.seconds ? `${detailsLog.seconds} 秒` : "时长未记录"}</dd></div><div><dt className="text-muted-foreground">参考素材</dt><dd className="mt-1 break-words">{[...detailsLog.references, ...(detailsLog.referenceVideos || []), ...(detailsLog.referenceAudios || [])].map((item) => item.name).join("、") || "暂无可展示的参考素材"}{missingReferenceCount(detailsLog) ? `（另有 ${missingReferenceCount(detailsLog)} 项未保存，请重新添加）` : ""}</dd></div><div><dt className="text-muted-foreground">时间与状态</dt><dd className="mt-1">{detailsLog.time} · {detailsLog.reconciliationRequired ? "待核对" : creationStatus(detailsLog.status)}</dd></div><div><dt className="text-muted-foreground">实际积分</dt><dd className="mt-1">{detailsLog.creditsCharged == null ? "尚未结算或暂不可用" : `${detailsLog.creditsCharged} 积分`}</dd></div></dl>}
            </Drawer>
            <PromptSelectDialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen} onSelect={setPrompt} />
            <AssetPickerModal open={assetPickerOpen} defaultTab="my-assets" onInsert={(payload) => void transferReference(() => insertPickedAsset(payload)).catch(reportMediaError)} onClose={() => setAssetPickerOpen(false)} />
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
                <ModelPicker config={config} value={model} onChange={(value) => updateConfig("videoModel", value)} onRouteSelect={(value, routeId) => { updateConfig("videoModel", value); updateConfig("videoRouteId", routeId); }} capability="video" fullWidth onMissingConfig={() => openConfigDialog(false)} />
            </label>
            <div className="col-span-2">
                <VideoSettingsPanel config={config} model={model} onConfigChange={(key, value) => updateConfig(key, value)} theme={theme} showTitle={false} className="space-y-4" />
            </div>
        </>
    );
}

function sameVideo(a: GeneratedVideo, b: GeneratedVideo) {
    return a.id === b.id || Boolean(a.url && a.url === b.url) || Boolean(a.storageKey && a.storageKey === b.storageKey);
}

function ResultVideoCard({ video, onDownload, onSaveAsset }: { video: GeneratedVideo; onDownload: (video: GeneratedVideo) => void; onSaveAsset: (video: GeneratedVideo) => void }) {
    const { t } = useTranslation();
    return (
        <div className="creation-result-card overflow-hidden rounded-2xl border border-border bg-background dark:border-border">
            <video onError={refreshExpiredMedia} onPlay={(event) => { const current = event.currentTarget; current.closest(".creation-stream")?.querySelectorAll("video").forEach((other) => { if (other !== current) other.pause(); }); }} src={video.url} preload="none" controls playsInline className="aspect-video w-full bg-black object-contain" />
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border px-3 py-2.5 dark:border-border">
                <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    {video.width > 0 && video.height > 0 && <span>{video.width}x{video.height}</span>}
                    {video.bytes > 0 && <span>{formatBytes(video.bytes)}</span>}
                    <span>{formatDuration(video.durationMs)}</span>
                </div>
                <div className="flex shrink-0 gap-1">
                    <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => onSaveAsset(video)}>
                        {t("common.addToAssets")}
                    </Button>
                    <Button size="small" icon={<Download className="size-3.5" />} onClick={() => onDownload(video)}>
                        {t("common.download")}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function FailedVideoCard({ error, onRetry }: { error: string; onRetry: () => void }) {
    const { t } = useTranslation();
    return (
        <div className="overflow-hidden rounded-2xl border border-red-200 bg-red-50 dark:border-red-950 dark:bg-red-950/20">
            <div className="flex aspect-video flex-col items-center justify-center gap-3 p-5 text-center">
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
                    <LogCard key={log.id} log={log} selected={selectedLogIds.includes(log.id)} active={activeLogId === log.id} onSelectedChange={(checked) => onSelectedLogIdsChange(checked ? [...selectedLogIds, log.id] : selectedLogIds.filter((id) => id !== log.id))} onClick={() => onPreviewLog(log)} />
                ))}
                {!logs.length ? <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-border text-center text-sm text-muted-foreground dark:border-border">{t("workbench.noLogs")}</div> : null}
            </div>
        </>
    );
}

function LogCard({ log, selected, active, onSelectedChange, onClick }: { log: GenerationLog; selected: boolean; active: boolean; onSelectedChange: (checked: boolean) => void; onClick: () => void }) {
    const { t } = useTranslation();
    return (
        <button type="button" className={`block w-full rounded-lg border p-2 text-left transition ${active ? "border-foreground bg-brand-soft dark:bg-brand-soft" : "border-border bg-background hover:bg-muted dark:border-border dark:hover:bg-accent"}`} onClick={onClick}>
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2">
                <Checkbox className="mt-0.5" checked={selected} onClick={(event) => event.stopPropagation()} onChange={(event) => onSelectedChange(event.target.checked)} />
                <div className="min-w-0">
                    <div className="truncate text-sm font-semibold leading-5">{log.title}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.size}</Tag>
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{formatVideoResolution(log.resolution)}</Tag>
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.seconds}s</Tag>
                    </div>
                </div>
                <div className="grid justify-items-end gap-2">
                    <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color={log.status === "success" ? "blue" : log.status === "pending" ? "processing" : log.status === "unavailable" ? "warning" : "red"}>
                        {log.status === "unavailable" ? "结果不可用" : t(`workbench.${log.status === "success" ? "success" : log.status === "pending" ? "generating" : "failed"}`)}
                    </Tag>
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
    const local = await videoLogStorage.list<GenerationLog>(owner).catch(() => [] as GenerationLog[]);
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
    const video = log.video?.storageKey ? { ...log.video, url: await resolveMediaUrl(log.video.storageKey, log.video.url) } : log.video;
    const references = await Promise.all(
        (log.references || []).map(async (item) => {
            void ensureImagePreview(item.storageKey);
            return { ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl) };
        }),
    );
    const config = normalizeLogConfig(log);
    return {
        serverTaskIds: log.serverTaskIds,
        creditsCharged: log.creditsCharged,
        reconciliationRequired: log.reconciliationRequired,
        referenceCount: log.referenceCount,
        id: log.id || nanoid(),
        createdAt: log.createdAt || Date.now(),
        title: log.title || log.model || i18n.t("workbench.untitled"),
        prompt: log.prompt || "",
        time: log.time || new Date().toLocaleString(i18n.resolvedLanguage, { hour12: false }),
        model: log.model || config.videoModel || "",
        config,
        references,
        referenceVideos: await Promise.all((log.referenceVideos || []).map(async (item) => ({ ...item, url: await resolveMediaUrl(item.storageKey, item.url) }))),
        referenceAudios: await Promise.all((log.referenceAudios || []).map(async (item) => ({ ...item, url: await resolveMediaUrl(item.storageKey, item.url) }))),
        durationMs: log.durationMs || 0,
        size: log.size || config.size || "",
        resolution: log.resolution || config.vquality ? normalizeResolution(log.resolution || config.vquality) : "",
        seconds: log.seconds || config.videoSeconds || "",
        status: log.status || "success",
        task: log.task,
        video,
        error: log.error,
    };
}

function serializeLog(log: GenerationLog): GenerationLog {
    return {
        ...log,
        references: log.references.map((item) => ({ ...item, dataUrl: item.storageKey ? "" : item.dataUrl })),
        referenceVideos: log.referenceVideos?.map((item) => ({ ...item, url: item.storageKey ? "" : item.url })),
        referenceAudios: log.referenceAudios?.map((item) => ({ ...item, url: item.storageKey ? "" : item.url })),
        video: log.video?.storageKey ? { ...log.video, url: "" } : log.video,
    };
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

function normalizeLogConfig(log: Partial<GenerationLog>): GenerationLogConfig {
    return {
        model: log.config?.model || log.model || "",
        videoModel: log.config?.videoModel || log.model || "",
        videoRouteId: log.config?.videoRouteId || "",
        size: log.config?.size || log.size || "",
        vquality: log.config?.vquality || log.resolution ? normalizeResolution(log.config?.vquality || log.resolution || "") : "",
        videoSeconds: log.config?.videoSeconds || log.seconds || "",
        videoGenerateAudio: log.config?.videoGenerateAudio || "",
        videoWatermark: log.config?.videoWatermark || "",
        videoMode: log.config?.videoMode === "reference" ? "reference" : log.config?.videoMode === "frames" ? "frames" : "",
    };
}

function missingReferenceCount(log: GenerationLog) {
    const available = log.references.length + (log.referenceVideos?.length || 0) + (log.referenceAudios?.length || 0);
    return Math.max(0, (log.referenceCount ?? 0) - available);
}

function historyGaps(log: GenerationLog) {
    const missing: string[] = [];
    if (!log.config.size || !log.config.vquality || !log.config.videoSeconds || !log.config.videoGenerateAudio || !log.config.videoWatermark || !log.config.videoMode) missing.push("部分历史参数未保存");
    const references = missingReferenceCount(log);
    if (references) missing.push(`${references} 项参考素材未保存，请重新添加`);
    return missing;
}

function buildLog({ prompt, model, config, references, referenceVideos, referenceAudios, durationMs, status, task, video, error }: { prompt: string; model: string; config: AiConfig; references: ReferenceImage[]; referenceVideos?: ReferenceVideo[]; referenceAudios?: ReferenceAudio[]; durationMs: number; status: GenerationLog["status"]; task?: VideoGenerationTask; video?: GeneratedVideo; error?: string }): GenerationLog {
    const logConfig = {
        model: config.model,
        videoModel: config.videoModel,
        videoRouteId: config.videoRouteId || "",
        size: config.size,
        vquality: normalizeResolution(config.vquality),
        videoSeconds: config.videoSeconds,
        videoGenerateAudio: config.videoGenerateAudio,
        videoWatermark: config.videoWatermark,
        videoMode: config.videoMode === "reference" ? "reference" : "frames",
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
        referenceVideos,
        referenceAudios,
        durationMs,
        size: logConfig.size,
        resolution: logConfig.vquality,
        seconds: logConfig.videoSeconds,
        status,
        task,
        video,
        error,
    };
}

function buildVideoConfig(config: AiConfig, model: string): AiConfig {
    return {
        ...config,
        model,
        videoModel: model,
        size: normalizeVideoSize(config.size),
        videoSeconds: normalizeVideoSeconds(config.videoSeconds),
        vquality: normalizeResolution(config.vquality),
        videoGenerateAudio: String(boolConfig(config.videoGenerateAudio, true)),
        videoWatermark: String(boolConfig(config.videoWatermark, false)),
        videoMode: config.videoMode === "reference" ? "reference" : "frames",
    };
}

function normalizeVideoSeconds(value: string) {
    if (String(value).trim() === "-1") return "-1";
    return clampVideoSeconds(value);
}

function normalizeVideoSize(value: string) {
    return normalizeVideoSizeValue(value);
}

function normalizeResolution(value: string) {
    return normalizeVideoResolutionValue(value);
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
