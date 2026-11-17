import { Suspense, lazy, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { App } from "antd";
import { ArrowUp, ArrowUpRight, ChevronDown, ImagePlus, LoaderCircle, Minus, Music, PlayCircle, Plus, Sparkles, Video, X, Zap } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";

import { BrandName } from "@/components/brand/brand-wordmark";
import { LANDING_TOOL_ICONS } from "@/components/home/landing-tool-icons";
import { ModelPicker } from "@/components/model-picker";
import { PromptOptimizeButton } from "@/components/prompt-optimize-button";
import { SiteFooter } from "@/components/layout/site-footer";
import { PromptCover } from "@/components/prompts/prompt-cover";
import { PromptVideoCover } from "@/components/prompts/prompt-video-cover";
import { HeroFilmWall } from "@/pages/home/hero-film-wall";
import { LandingCanvasPanel } from "@/pages/home/landing-canvas-panel";
import { PromptDetailDialog } from "@/components/prompts/prompt-detail-dialog";
const PromoPopup = lazy(() => import("@/components/promo/promo-popup").then((module) => ({ default: module.PromoPopup })));
import { inferMediaRatio, inferMediaScale, inferVideoRatio, mediaRatioOptions, videoRatioOptions, videoResolutionOptionsFromMap, parseVideoResolution, videoSecondsRangeForDurations } from "@/lib/media-size";
import { useCopyText } from "@/hooks/use-copy-text";
import { storePendingPrompt, type PendingMaterialKind, type PendingReference } from "@/lib/pending-prompt";
import { fetchPrompts, type Prompt } from "@/services/api/prompts";
import { loadPromoConfig, type PromoConfig } from "@/services/api/promo";
import { copyOf, loadSiteInfo, type SiteHomeCopy } from "@/services/api/site";
import { promptImageUrl } from "@/lib/prompt-image";
import { useAuthStore } from "@/stores/use-auth-store";
import { useAuthDialogStore } from "@/stores/use-auth-dialog-store";
import { matchesCanvasSession } from "@/lib/canvas/canvas-session";
import { modelOptionName, useConfigStore } from "@/stores/use-config-store";
import { currentMediaOwner, uploadBlobToServer } from "@/services/cloud-media";
import "./home.css";
import "./home-landing.css";
import "./home-jimeng.css";
import { useCreditEstimate } from '@/hooks/use-credit-estimate';

type CreationMode = "image" | "video";

type HomeMaterial = {
    id: string;
    name: string;
    type: string;
    url: string;
    kind: PendingMaterialKind;
};

const PENDING_CREATION_KEY = "sundas:pending-creation";
const MAX_MATERIALS = 7;
// 灵感大厅默认展示条数：桌面端 4 列网格，12 条正好铺满 3 行，不留半行。
const HOME_PROMPT_COUNT = 12;

function HomeControlPopover({ label, value, title, kicker, align = "left", hint, children }: { label: string; value: string; title: string; kicker: string; align?: "left" | "right"; hint: string; children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const closeOutside = (event: PointerEvent) => {
            if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const closeEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("pointerdown", closeOutside);
        document.addEventListener("keydown", closeEscape);
        return () => {
            document.removeEventListener("pointerdown", closeOutside);
            document.removeEventListener("keydown", closeEscape);
        };
    }, [open]);

    return (
        <div className="home-param">
            <span>{label}</span>
            <div ref={wrapperRef} className="home-control-wrap">
                <button type="button" className={open ? "home-value-trigger is-open" : "home-value-trigger"} onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-label={`${label}：${value}`} aria-haspopup="dialog">
                    {value}
                    <ChevronDown className={open ? "size-3.5 rotate-180 transition-transform" : "size-3.5 transition-transform"} />
                </button>
                {open ? (
                    <div className={align === "right" ? "home-control-panel is-right" : "home-control-panel"} role="dialog" aria-label={title}>
                        <div className="home-control-head">
                            <h3>{title}</h3>
                            <span>{kicker}</span>
                        </div>
                        {children}
                        <p className="home-control-hint">{hint}</p>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function isVideoPrompt(item: Prompt) {
    return item.tags.some((tag) => tag === "short_video" || tag.startsWith("视频模板"));
}

export default function HomePage({ landing = false, suppressPromo = false }: { landing?: boolean; suppressPromo?: boolean }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const user = useAuthStore((state) => state.user);
    const openAuthDialog = useAuthDialogStore((state) => state.open);
    const authReady = useAuthStore((state) => state.ready);
    const userId = authReady ? user?.id : undefined;
    const sessionEpoch = useAuthStore((state) => state.sessionEpoch);
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const serverModels = useConfigStore((state) => state.serverModels);
    const [mode, setMode] = useState<CreationMode>("video");
    // 首页顶部「生成 / 画布」两个页签：画布页签不跳转，直接把生成对话框换成最近画布展示区。
    const [landingTab, setLandingTab] = useState<"create" | "canvas">("create");
    const [prompt, setPrompt] = useState("");
    const [materials, setMaterials] = useState<HomeMaterial[]>([]);
    const [viewOwner, setViewOwner] = useState<string | undefined>(undefined);
    const [viewEpoch, setViewEpoch] = useState<number | undefined>();
    const [materialBusy, setMaterialBusy] = useState(false);
    const [materialDragActive, setMaterialDragActive] = useState(false);
    const materialInputRef = useRef<HTMLInputElement>(null);
    const accountEpochRef = useRef(0);
    const previousOwner = useRef<string | undefined>(undefined);
    const previousEpoch = useRef(sessionEpoch);
    const isCurrentView = () => viewOwner === userId && viewEpoch === sessionEpoch && matchesCanvasSession(userId ?? null, sessionEpoch, useAuthStore.getState());
    const [inspirationMode, setInspirationMode] = useState<CreationMode>("video");
    const [imagePrompts, setImagePrompts] = useState<Prompt[]>([]);
    const [videoPrompts, setVideoPrompts] = useState<Prompt[]>([]);
    const [promptsLoading, setPromptsLoading] = useState(true);
    const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
    const [promo, setPromo] = useState<PromoConfig | null>(null);
    const [home, setHome] = useState<SiteHomeCopy>({});
    const copyText = useCopyText();

    useEffect(() => {
        accountEpochRef.current += 1;
        if (previousOwner.current && (previousOwner.current !== userId || previousEpoch.current !== sessionEpoch)) { setPrompt(""); setMaterials([]); }
        previousOwner.current = userId;
        previousEpoch.current = sessionEpoch;
        setViewOwner(userId);
        setViewEpoch(sessionEpoch);
        setMaterialBusy(false);
    }, [userId, sessionEpoch]);

    // 访客在首页输入提示词并点击生成时暂存草稿；原地登录成功后自动接续进入创作工作台，不丢上下文。
    useEffect(() => {
        if (!authReady || !user || !userId || currentMediaOwner() !== userId || viewOwner !== userId || viewEpoch !== sessionEpoch) return;
        let raw: string | null = null;
        try {
            raw = sessionStorage.getItem(PENDING_CREATION_KEY);
            if (!raw) return;
            sessionStorage.removeItem(PENDING_CREATION_KEY);
        } catch {
            return;
        }
        try {
            const parsed = JSON.parse(raw) as { mode?: CreationMode; prompt?: string; references?: PendingReference[] };
            const value = typeof parsed.prompt === "string" ? parsed.prompt.trim() : "";
            if (!value) return;
            const targetMode: CreationMode = parsed.mode === "image" ? "image" : "video";
            const references = Array.isArray(parsed.references) ? parsed.references : [];
            storePendingPrompt(targetMode, value, references, userId);
            navigate(`/${targetMode}`, { replace: true });
        } catch {
            // 损坏草稿不阻塞首页渲染
        }
    }, [authReady, navigate, sessionEpoch, user, userId, viewEpoch, viewOwner]);

    // 灵感大厅数据来源：后台「首页文案」可指定只展示某个来源，留空表示不限。
    const inspirationSourceId = (home.inspirationSourceId ?? "").trim() || undefined;
    // 两个页签各自的条数，0 表示沿用统一的 promptLimit；接口一次最多取 60 条。
    const fallbackLimit = Math.max(0, Number(home.promptLimit) || 0);
    const videoLimit = Math.max(0, Number(home.inspirationVideoLimit) || 0) || fallbackLimit;
    const imageLimit = Math.max(0, Number(home.inspirationImageLimit) || 0) || fallbackLimit;
    const wanted = Math.min(60, Math.max(HOME_PROMPT_COUNT, videoLimit, imageLimit));

    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();
        const load = async () => {
            try {
                const [imageData, videoData] = await Promise.all([
                    fetchPrompts({ kind: 'image', pageSize: wanted, metadata: false, sourceId: inspirationSourceId, signal: controller.signal }),
                    fetchPrompts({ kind: 'video', pageSize: wanted, metadata: false, sourceId: inspirationSourceId, signal: controller.signal }),
                ]);
                if (cancelled) return;
                setImagePrompts(imageData.items);
                setVideoPrompts(videoData.items);
            } catch (error) {
                if (!cancelled) message.error(error instanceof Error ? error.message : t("home.promptError"));
            } finally {
                if (!cancelled) setPromptsLoading(false);
            }
        };
        void load();
        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [message, t, inspirationSourceId, wanted]);

    useEffect(() => {
        void loadPromoConfig().then(setPromo).catch(() => setPromo(null));
    }, []);

    useEffect(() => {
        void loadSiteInfo().then((data) => setHome(data.home ?? {})).catch(() => setHome({}));
    }, []);

    // 灵感大厅展示条数：视频/图片页签可分别设置，未设置时沿用统一的 promptLimit，0 表示不限。
    const activeLimit = inspirationMode === "video" ? videoLimit : imageLimit;
    const promptCards = (inspirationMode === "video" ? videoPrompts : imagePrompts).slice(0, activeLimit || undefined);
    const ratio = mode === "image" ? inferMediaRatio(config.size) : inferVideoRatio(config.size);
    const selectedVideoModel = serverModels.find((model) => model.id === modelOptionName(config.videoModel));
    const videoMetadata = (selectedVideoModel?.metadata ?? {}) as { durations?: { min?: number; max?: number }; aspectRatios?: string[] };
    const { min: minSeconds, max: maxSeconds } = videoSecondsRangeForDurations(videoMetadata.durations);
    const seconds = Math.max(minSeconds, Math.min(maxSeconds, Math.floor(Number(config.videoSeconds) || 6)));
    const estimate = useCreditEstimate(modelOptionName(mode === 'video' ? config.videoModel : config.imageModel), mode, mode === 'video' ? seconds : 1, mode === 'video' ? parseVideoResolution(config.vquality) : inferMediaScale(config.size), `${userId ?? 'guest'}:${sessionEpoch}`, 0, mode === 'video' ? config.videoRouteId : '');
    const estimateRange = estimate.data ? (estimate.data.minCredits === estimate.data.maxCredits ? String(estimate.data.minCredits) : `${estimate.data.minCredits}–${estimate.data.maxCredits}`) : "";
    const estimateLabel = !estimate.hasModel ? t('home.estimateSelectModel') : estimate.loading ? t('home.estimateLoading') : estimate.error || !estimate.data ? t('home.estimateUnavailable') : t('home.estimateCredits', { credits: estimate.data.minCredits === estimate.data.maxCredits ? estimate.data.minCredits : `${estimate.data.minCredits}–${estimate.data.maxCredits}` });
    const estimateShort = estimate.hasModel && !estimate.loading && !estimate.error && estimate.data ? estimateRange : estimate.loading ? "…" : "--";
    const selectedVideoRouteResolutions = config.videoRouteId ? selectedVideoModel?.routes.find((route) => route.id === config.videoRouteId)?.resolutionMultipliers : undefined;
    const videoResolutionOptions = videoResolutionOptionsFromMap(selectedVideoRouteResolutions ?? selectedVideoModel?.resolutionMultipliers);
    const videoRatios = videoMetadata.aspectRatios?.length ? videoRatioOptions.filter((option) => videoMetadata.aspectRatios?.includes(option.value)) : videoRatioOptions;
    const imageRatios = mediaRatioOptions;
    const imageQualityOptions = ["auto", "low", "medium", "high"].map((value) => ({ value, label: t(`settingsPanels.common.${value}`) }));

    useEffect(() => {
        if (mode !== "video") return;
        if (!videoResolutionOptions.some((option) => option.value === config.vquality)) {
            updateConfig("vquality", videoResolutionOptions[0]?.value ?? "720");
        }
        if (String(seconds) !== config.videoSeconds) updateConfig("videoSeconds", String(seconds));
        if (!videoRatios.some((option) => option.value === ratio)) updateConfig("size", videoRatios[0]?.value ?? "16:9");
    }, [config.videoModel, config.videoSeconds, config.vquality, mode, ratio, seconds, updateConfig, videoRatios, videoResolutionOptions]);

    async function addMaterials(files?: FileList | null) {
        if (!files?.length) return;
        const owner = userId, epoch = accountEpochRef.current;
        const active = () => Boolean(owner && isCurrentView() && currentMediaOwner() === owner && accountEpochRef.current === epoch);
        if (!active()) {
            message.warning(t("home.referenceLogin"));
            return;
        }
        const available = Math.max(0, MAX_MATERIALS - materials.length);
        const selected = Array.from(files).slice(0, available);
        if (!selected.length) return;
        setMaterialBusy(true);
        try {
            const next: HomeMaterial[] = [];
            for (const file of selected) {
                const appleImage = /^image\/(heic|heif)(-sequence)?$/i.test(file.type) || (/\.(heic|heif)$/i.test(file.name) && (!file.type || file.type === "application/octet-stream"));
                const kind = appleImage || file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name) ? "image" : file.type.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(file.name) ? "video" : file.type.startsWith("audio/") || /\.(mp3|wav|ogg)$/i.test(file.name) ? "audio" : null;
                if (!kind) throw new Error(t("home.materialUnsupported"));
                if (mode === "image" && kind !== "image") throw new Error(t("home.imageMaterialsOnly"));
                const maxBytes = kind === "image" ? 10 * 1024 * 1024 : 100 * 1024 * 1024;
                if (file.size > maxBytes) throw new Error(t("home.materialTooLarge"));
                if (!active()) return;
                const uploaded = await uploadBlobToServer(file, kind === "image" ? "reference" : kind, owner, undefined, true, false);
                if (!uploaded) throw new Error(t("home.materialUploadFailed"));
                if (!active()) return;
                next.push({ id: nanoid(), name: file.name, type: uploaded.mime, url: uploaded.url, kind });
            }
            if (active()) setMaterials((value) => [...value, ...next].slice(0, MAX_MATERIALS));
        } catch (error) {
            if (active()) message.error(error instanceof Error ? error.message : t("home.materialUploadFailed"));
        } finally {
            if (active()) { setMaterialBusy(false); if (materialInputRef.current) materialInputRef.current.value = ""; }
        }
    }

    function changeMode(next: CreationMode) {
        if (next === "image" && materials.some((material) => material.kind !== "image")) {
            setMaterials((value) => value.filter((material) => material.kind === "image"));
            message.info(t("home.imageMaterialsOnly"));
        }
        setMode(next);
    }

    function startCreating() {
        if (!isCurrentView() || materialBusy) return;
        const value = prompt.trim();
        if (!value) return;
        const pendingReferences = materials.map((material) => ({ name: material.name, type: material.type, dataUrl: material.url, kind: material.kind }));
        if (!user) {
            try {
                sessionStorage.setItem(PENDING_CREATION_KEY, JSON.stringify({ mode, prompt: value, references: pendingReferences }));
            } catch { /* 存储不可用时仍允许打开登录框 */ }
            openAuthDialog("login", { redirect: "/", hint: "登录后立即为您继续生成刚才的创作" });
            return;
        }
        if (!userId || currentMediaOwner() !== userId) return;
        storePendingPrompt(mode, value, pendingReferences, userId);
        navigate(`/${mode}`);
    }

    function openPromptDetail(item: Prompt) {
        setSelectedPrompt(item.title.startsWith("视频模板") ? { ...item, title: item.title.replace(/^视频模板\s*-\s*/, "") } : item);
    }

    function useInspirationPrompt(item: Prompt) {
        if (!isCurrentView()) return;
        const value = item.prompt.trim();
        if (!value) return;
        const targetMode: CreationMode = isVideoPrompt(item) ? "video" : "image";
        setSelectedPrompt(null);
        if (!user) {
            try {
                sessionStorage.setItem(PENDING_CREATION_KEY, JSON.stringify({ mode: targetMode, prompt: value }));
            } catch { /* 存储不可用时仍允许打开登录框 */ }
            openAuthDialog("login", { redirect: "/", hint: "登录后立即为您继续生成刚才的创作" });
            return;
        }
        if (!userId || currentMediaOwner() !== userId) return;
        storePendingPrompt(targetMode, value, [], userId);
        navigate(`/${targetMode}`);
    }

    if (viewOwner !== userId || viewEpoch !== sessionEpoch || !isCurrentView()) return null;

    return (
        <main className={landing ? "home-page home-landing" : "home-page home-explore"}>
            {/* 影幕展示：首页顶部竖版片段墙循环播放，向下渐隐到纯色底（内容层在其上方） */}
            {landing ? (
                <div className="home-backdrop" aria-hidden="true">
                    <HeroFilmWall />
                </div>
            ) : null}
            <div className="home-content">
                {landing && <>
                <section className="landing-welcome">
                    <p className="landing-eyebrow"><BrandName text="SUNDAS · 创作空间" imageHeight="0.92em" /></p>
                    <h1>你的故事，值得被看见。</h1>
                    <p className="landing-intro">从灵感到画面，从分镜到成片。</p>
                    <div className="landing-switch" role="tablist" aria-label="创作方式">
                        <button type="button" role="tab" aria-selected={landingTab === "create"} className={landingTab === "create" ? "is-active" : undefined} onClick={() => setLandingTab("create")}>生成</button>
                        <button type="button" role="tab" aria-selected={landingTab === "canvas"} className={landingTab === "canvas" ? "is-active" : undefined} onClick={() => setLandingTab("canvas")}>画布</button>
                    </div>
                </section>

                {landingTab === "canvas" ? <LandingCanvasPanel home={home} /> : <>

                <section
                    className={materialDragActive ? "home-composer is-dragging" : "home-composer"}
                    aria-label={t("home.composerTitle")}
                    onDragEnter={(event) => {
                        event.preventDefault();
                        if (event.dataTransfer.types.includes("Files")) setMaterialDragActive(true);
                    }}
                    onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "copy";
                    }}
                    onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setMaterialDragActive(false);
                    }}
                    onDrop={(event) => {
                        event.preventDefault();
                        setMaterialDragActive(false);
                        void addMaterials(event.dataTransfer.files);
                    }}
                >
                    {landing ? null: <>
                    <div className="home-mode-row">
                        <div className="home-mode-switch" role="tablist" aria-label={t("home.composerTitle")}>
                            <button type="button" role="tab" aria-selected={mode === "video"} className={mode === "video" ? "home-mode is-active" : "home-mode"} onClick={() => changeMode("video")}>
                                <Video className="size-3.5" />
                                {copyOf(home.composerVideoMode, t("home.videoMode"))}
                            </button>
                            <button type="button" role="tab" aria-selected={mode === "image"} className={mode === "image" ? "home-mode is-active" : "home-mode"} onClick={() => changeMode("image")}>
                                <ImagePlus className="size-3.5" />
                                {copyOf(home.composerImageMode, t("home.imageMode"))}
                            </button>
                        </div>
                    </div>

                    </>}

                    <div className="home-editor">
                        <label className="home-editor-label" htmlFor="home-create-prompt">{t("workbench.prompt")}</label>
                        <div className="home-prompt-wrap">
                            <textarea
                                id="home-create-prompt"
                                className="home-prompt"
                                value={prompt}
                                onChange={(event) => setPrompt(event.target.value)}
                                onKeyDown={(event) => {
                                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                                        event.preventDefault();
                                        startCreating();
                                    }
                                }}
                                placeholder={copyOf(home.composerPlaceholder, t("home.promptPlaceholder"))}
                                aria-describedby="home-create-caption"
                            />
                            {userId ? (
                                <PromptOptimizeButton
                                    prompt={prompt}
                                    model={mode === "image" ? config.imageModel : config.videoModel}
                                    capability={mode}
                                    disabled={materialBusy}
                                    onOptimized={setPrompt}
                                    className="!bottom-1 !right-1"
                                />
                            ) : null}
                        </div>
                        <div className="home-material-bar">
                            <button
                                type="button"
                                className={landing ? "home-material-add is-card" : "home-material-add"}
                                title={landing ? (mode === "video" ? t("home.materialHintVideo") : t("home.materialHintImage")) : undefined}
                                aria-label={t("home.addMaterial")}
                                disabled={materialBusy || materials.length >= MAX_MATERIALS}
                                onClick={() => {
                                    if (!user) {
                                        message.info(t("home.referenceLogin"));
                                        openAuthDialog("login", { redirect: "/" });
                                        return;
                                    }
                                    materialInputRef.current?.click();
                                }}
                            >
                                {materialBusy ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
                                <span>{t("home.addMaterial")}</span>
                            </button>
                            {materials.map((material) => (
                                <div key={material.id} className="home-material-item" title={material.name}>
                                    {material.kind === "image" ? (
                                        <img src={material.url} alt={material.name} />
                                    ) : (
                                        <div className="home-material-file">
                                            {material.kind === "video" ? <Video className="size-4" /> : <Music className="size-4" />}
                                            <span>{material.name}</span>
                                        </div>
                                    )}
                                    <button type="button" className="home-material-remove" aria-label={t("home.removeReference")} onClick={() => setMaterials((value) => value.filter((item) => item.id !== material.id))}>
                                        <X className="size-3" />
                                    </button>
                                </div>
                            ))}
                            <span className="home-material-hint">{mode === "video" ? t("home.materialHintVideo") : t("home.materialHintImage")}</span>
                            <input
                                ref={materialInputRef}
                                type="file"
                                accept={mode === "video" ? "image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/ogg" : "image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif"}
                                multiple
                                className="hidden"
                                onChange={(event) => void addMaterials(event.target.files)}
                            />
                        </div>
                    </div>

                    <div className="home-toolbar">
                        <div className="home-toolbar-left">
                            {landing ? (
                                <div className="home-mode-pills" role="tablist" aria-label="首页生成类型">
                                    {(["image", "video"] as const).map((value) => (
                                        <button key={value} type="button" role="tab" aria-selected={mode === value} className={mode === value ? "is-active" : undefined} disabled={materialBusy && mode !== value} title={materialBusy && mode !== value ? "素材上传中，请稍候" : undefined} onClick={() => changeMode(value)}>
                                            {value === "image" ? <ImagePlus className="size-3.5" /> : <Video className="size-3.5" />}
                                            {value === "image" ? copyOf(home.composerImageMode, t("home.imageMode")) : copyOf(home.composerVideoMode, t("home.videoMode"))}
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                            <ModelPicker
                                config={config}
                                value={mode === "image" ? config.imageModel : config.videoModel}
                                onChange={(value) => updateConfig(mode === "image" ? "imageModel" : "videoModel", value)}
                                onRouteSelect={mode === "video" ? (value, routeId) => { updateConfig("videoModel", value); updateConfig("videoRouteId", routeId); } : undefined}
                                capability={mode}
                                placeholder={mode === "video" ? "选择视频模型" : "选择图片模型"}
                            />
                            {mode === "video" ? (
                                <>
                                    <HomeControlPopover
                                        label={t("settingsPanels.video.quality")}
                                        value={videoResolutionOptions.find((option) => option.value === config.vquality)?.label ?? config.vquality}
                                        title={t("home.resolutionPanel")}
                                        kicker="RESOLUTION"
                                        align="left"
                                        hint={t("home.resolutionPanelHint")}
                                    >
                                        <div className="home-option-grid">
                                            {videoResolutionOptions.map((option) => (
                                                <button key={option.value} type="button" className={"home-option" + (option.value === config.vquality ? " is-selected" : "")} onClick={() => updateConfig("vquality", option.value)}>
                                                    {option.label}
                                                </button>
                                            ))}
                                            {!videoResolutionOptions.some(option => option.value === "4k") && <button type="button" className="home-option opacity-40" disabled title="所选线路未声明支持 4K">4K</button>}
                                        </div>
                                        {!videoResolutionOptions.some(option => option.value === "4k") && <p className="mt-2 text-xs text-muted-foreground">4K 需选择支持该清晰度的线路。</p>}
                                    </HomeControlPopover>
                                    <HomeControlPopover
                                        label={t("settingsPanels.video.seconds")}
                                        value={`${seconds}s`}
                                        title={t("home.secondsPanel")}
                                        kicker="SECONDS"
                                        align="left"
                                        hint={t("home.secondsPanelHint")}
                                    >
                                        <div className="home-seconds-range">{t("home.secondsRange", { min: minSeconds, max: maxSeconds })}</div>
                                        <div className="home-seconds-head">
                                            <span>{t("home.secondsChoose")}</span>
                                            <div className="home-seconds-actions">
                                                <button type="button" className="home-step-button" onClick={() => updateConfig("videoSeconds", String(Math.max(minSeconds, seconds - 1)))} aria-label={t("home.decreaseSeconds")}><Minus className="size-3.5" /></button>
                                                <strong>{seconds}<small>s</small></strong>
                                                <button type="button" className="home-step-button" onClick={() => updateConfig("videoSeconds", String(Math.min(maxSeconds, seconds + 1)))} aria-label={t("home.increaseSeconds")}><Plus className="size-3.5" /></button>
                                            </div>
                                        </div>
                                        <input
                                            type="range"
                                            className="home-range"
                                            min={minSeconds}
                                            max={maxSeconds}
                                            step={1}
                                            value={seconds}
                                            style={{ "--home-range-progress": `${((seconds - minSeconds) / Math.max(1, maxSeconds - minSeconds)) * 100}%` } as CSSProperties}
                                            onChange={(event) => updateConfig("videoSeconds", event.target.value)}
                                            aria-label={t("settingsPanels.video.seconds")}
                                        />
                                        <div className="home-range-ends"><span>{minSeconds}s</span><span>{maxSeconds}s</span></div>
                                    </HomeControlPopover>
                                </>
                            ) : (
                                <HomeControlPopover
                                    label={t("settingsPanels.video.quality")}
                                    value={imageQualityOptions.find((option) => option.value === (config.quality || "auto"))?.label ?? (config.quality || "auto")}
                                    title={t("home.imageQualityPanel")}
                                    kicker="IMAGE QUALITY"
                                    align="left"
                                    hint={t("home.imageQualityPanelHint")}
                                >
                                    <div className="home-option-grid">
                                        {imageQualityOptions.map((option) => (
                                            <button key={option.value} type="button" className={"home-option" + (option.value === (config.quality || "auto") ? " is-selected" : "")} onClick={() => updateConfig("quality", option.value)}>
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                </HomeControlPopover>
                            )}
                            <HomeControlPopover
                                label={mode === "video" ? t("settingsPanels.video.ratio") : t("settingsPanels.image.aspectRatio")}
                                value={ratio === "auto" ? t("settingsPanels.common.auto") : ratio}
                                title={t("home.ratioPanel")}
                                kicker="ASPECT RATIO"
                                align="right"
                                hint={t("home.ratioPanelHint")}
                            >
                                <div className="home-ratio-grid">
                                    {(mode === "video" ? videoRatios : imageRatios).map((item) => (
                                        <button key={item.value} type="button" className={"home-ratio-option" + (item.value === ratio ? " is-selected" : "")} onClick={() => updateConfig("size", item.value)}>
                                            <span className={"home-ratio-shape" + (item.value === "auto" ? " is-auto" : "")} style={item.value === "auto" ? undefined : { width: item.width >= item.height ? 26 : Math.max(10, Math.round((26 * item.width) / item.height)), height: item.height >= item.width ? 26 : Math.max(10, Math.round((26 * item.height) / item.width)) }} />
                                            <span>{item.value === "auto" ? t("settingsPanels.common.auto") : item.value}</span>
                                        </button>
                                    ))}
                                </div>
                            </HomeControlPopover>
                        </div>
                        <div className="home-toolbar-right">
                            {landing ? (
                                <span className="home-credit-chip" role="status" aria-live="polite" aria-label={estimateLabel} title={`${estimateLabel}\n${t('home.estimateNote')}`}>
                                    <Zap className="size-3.5" aria-hidden="true" />
                                    <span>{estimateShort}</span>
                                </span>
                            ) : (
                            <div className="home-credit-estimate" role="status" aria-live="polite" title={t('home.estimateNote')}>
                                <Sparkles className="size-3.5" aria-hidden="true" />
                                <span>{estimateLabel}</span>
                            </div>
                            )}
                            {landing ? (
                                <button type="button" className="home-send" disabled={!prompt.trim() || materialBusy} aria-busy={materialBusy} aria-label={user ? "进入创作" : "登录后创作"} title={`${user ? "进入创作" : "登录后创作"} · ${copyOf(home.composerHint, t("home.shortcutHint"))}`} onClick={startCreating}>
                                    {materialBusy ? <LoaderCircle className="size-[18px] animate-spin" /> : <ArrowUp className="size-[18px]" strokeWidth={2.4} />}
                                </button>
                            ) : <>
                            <button type="button" className="home-submit" disabled={!prompt.trim() || materialBusy} aria-busy={materialBusy} onClick={startCreating}>
                                {user ? copyOf(home.composerStartCta, t("home.startCreating")) : copyOf(home.composerLoginCta, t("home.loginToCreate"))}
                                {materialBusy ? <LoaderCircle className="size-3.5 animate-spin" /> : <ArrowUpRight className="size-3.5" />}
                            </button>                            </>}

                        </div>
                    </div>
                </section>
                <p id="home-create-caption" className="home-caption">{copyOf(home.composerHint, t("home.shortcutHint"))}{landing ? null : <> · {t('home.estimateNote')}</>}</p>

                {landing && <section className="landing-tools" aria-label="创作工具">
                    {([
                        { key: "image", title: "图片创作", note: "描述画面，继续改图", to: "/create?mode=image" },
                        { key: "video", title: "视频创作", note: "从文字或参考素材开始", to: "/create?mode=video" },
                        { key: "canvas", title: "无限画布", note: "串联灵感，自由创作", to: "/canvas" },
                        { key: "prompts", title: "提示词库", note: "寻找灵感，复用创作描述", to: "/prompts" },
                    ] as const).map(({ key, title, note, to }) => {
                        const Icon = LANDING_TOOL_ICONS[key];
                        return <Link className="landing-tool" to={to} key={to} data-tool={key}>
                            <div className="landing-tool-art"><Icon className="landing-tool-icon" /></div>
                            <div><h2>{title}</h2><p>{note}</p></div>
                            <ArrowUpRight className="ml-auto size-4 shrink-0 opacity-40" />
                        </Link>;
                    })}
                </section>}

                </>}

                </>}

                {home.inspirationEnabled === false ? null : (
                <section className="home-section">
                    <div className="home-section-head">
                        <div>
                            <h2 className="home-section-title">{copyOf(home.inspirationTitle, t("home.inspirationTitle"))}</h2>
                            <p className="home-section-note">{copyOf(home.inspirationDescription, t("home.inspirationDescription"))}</p>
                        </div>
                        <Link to="/prompts" className="home-section-link">{copyOf(home.inspirationViewAll, t("home.viewPrompts"))}</Link>
                    </div>
                    <div className="home-prompt-tabs" role="tablist" aria-label={copyOf(home.inspirationTitle, t("home.inspirationTitle"))}>
                        <button type="button" role="tab" aria-selected={inspirationMode === "video"} className={inspirationMode === "video" ? "home-prompt-tab is-active" : "home-prompt-tab"} onClick={() => setInspirationMode("video")}>
                            {copyOf(home.inspirationVideoTab, t("home.videoMode"))}
                        </button>
                        <button type="button" role="tab" aria-selected={inspirationMode === "image"} className={inspirationMode === "image" ? "home-prompt-tab is-active" : "home-prompt-tab"} onClick={() => setInspirationMode("image")}>
                            {copyOf(home.inspirationImageTab, t("home.imageMode"))}
                        </button>
                    </div>
                    {promptsLoading ? (
                        <div className="home-empty">{t("common.loading")}</div>
                    ) : (inspirationMode === "video" ? videoPrompts : imagePrompts).length ? (
                        <div className="home-prompt-grid">
                            {promptCards.map((item) => {
                                const title = inspirationMode === "video" ? item.title.replace(/^视频模板\s*-\s*/, "") : item.title;
                                const meta = item.tags.slice(0, 2).join(" · ") || item.category;
                                return (
                                <button key={`${item.sourceId}:${item.id}`} type="button" className="home-prompt-card" onClick={() => openPromptDetail(item)}>
                                    <span className="home-prompt-media">
                                        {item.previewVideoUrl ? (
                                            <PromptVideoCover
                                                src={item.previewVideoUrl}
                                                poster={promptImageUrl(item.coverUrl)}
                                                alt={title}
                                                className="home-prompt-cover"
                                            />
                                        ) : (
                                            <PromptCover src={item.coverUrl} alt={title} className="home-prompt-cover" />
                                        )}
                                        {item.previewVideoUrl ? (
                                            <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-medium text-white">
                                                <PlayCircle className="size-3" />
                                                视频
                                            </span>
                                        ) : null}
                                        {/* 遮罩层必须 pointer-events-none：否则鼠标命中的是遮罩而不是 <video>，悬浮播放不会触发 */}
                                        <span className="home-prompt-hover pointer-events-none" aria-hidden="true" />
                                    </span>
                                    <span className="home-prompt-body">
                                        <span className="home-prompt-avatar" aria-hidden="true">{title.slice(0, 1)}</span>
                                        <span className="home-prompt-info">
                                            <span className="home-prompt-title">{title}</span>
                                            <span className="home-prompt-tags">{meta}</span>
                                        </span>
                                    </span>
                                </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="home-empty">{copyOf(home.inspirationEmpty, t("home.emptyPrompts"))}</div>
                    )}
                </section>
                )}

            </div>
            <SiteFooter />
            {landing && !suppressPromo && promo?.popup ? (
                <Suspense fallback={null}>
                    <PromoPopup item={promo.popup} />
                </Suspense>
            ) : null}
            <PromptDetailDialog
                prompt={selectedPrompt}
                onClose={() => setSelectedPrompt(null)}
                onCopy={(value) => copyText(value, t("common.promptCopied"))}
                onUsePrompt={useInspirationPrompt}
            />
        </main>
    );
}
