import { useMemo, useState, type ReactNode } from "react";
import { App, Button, Checkbox, Input, InputNumber, Modal, Select, Tag } from "antd";
import { Clapperboard, CornerDownLeft, RefreshCw, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { generateStoryboard, type StoryboardResult } from "@/services/api/canvas-storyboard";
import { modelOptionName, useConfigStore } from "@/stores/use-config-store";
import "./canvas-storyboard-panel.css";

export type StoryboardDraftShot = {
    index: number;
    duration: number;
    shotSize: string;
    cameraMove: string;
    prompt: string;
    videoPrompt: string;
    dialogue: string;
    enabled: boolean;
};

export type StoryboardApplyPayload = {
    title: string;
    style: string;
    scriptText: string;
    durationSeconds: number;
    aspectRatio: string;
    createVideoNodes: boolean;
    shots: Array<Omit<StoryboardDraftShot, "enabled">>;
};

const EXAMPLE_KEYS = ["cat", "coffee", "city"] as const;

/** 用编辑后的镜头重新拼脚本，保证画布上的文本节点和节点提示词一致。 */
function buildScriptText(title: string, style: string, logline: string, duration: number, shots: StoryboardDraftShot[]) {
    const lines = [`# ${title}`, "", `- 风格：${style}`, `- 一句话：${logline}`, `- 总时长：${duration} 秒 / ${shots.length} 个镜头`, ""];
    for (const shot of shots) {
        lines.push(`## 镜头 ${shot.index} · ${shot.duration}s · ${shot.shotSize} · ${shot.cameraMove}`);
        lines.push(`画面：${shot.prompt}`);
        lines.push(`运动：${shot.videoPrompt}`);
        if (shot.dialogue) lines.push(`台词：${shot.dialogue}`);
        lines.push("");
    }
    return lines.join("\n").trim();
}

export function CanvasStoryboardPanel({ open, onClose, onApply }: { open: boolean; onClose: () => void; onApply: (payload: StoryboardApplyPayload) => void }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [brief, setBrief] = useState("");
    const [duration, setDuration] = useState(15);
    const [shotCount, setShotCount] = useState(5);
    const [style, setStyle] = useState("");
    const [aspectRatio, setAspectRatio] = useState("16:9");
    const [createVideoNodes, setCreateVideoNodes] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<StoryboardResult | null>(null);
    const [shots, setShots] = useState<StoryboardDraftShot[]>([]);
    const [model, setModel] = useState("");

    const serverModels = useConfigStore((state) => state.serverModels);
    const config = useConfigStore((state) => state.config);
    const textModels = useMemo(() => serverModels.filter((item) => item.capability === "text" && item.routeCount > 0), [serverModels]);
    const defaultModel = textModels.find((item) => item.id === modelOptionName(config.textModel))?.id ?? textModels[0]?.id ?? "";
    const activeModel = textModels.some((item) => item.id === model) ? model : defaultModel;
    const selectedShots = useMemo(() => shots.filter((shot) => shot.enabled), [shots]);

    const updateShot = (index: number, patch: Partial<StoryboardDraftShot>) =>
        setShots((cur) => cur.map((s) => (s.index === index ? { ...s, ...patch } : s)));

    const run = async () => {
        if (!brief.trim()) { message.warning(t("canvas.storyboard.needBrief")); return; }
        if (!activeModel) { message.warning(t("canvas.storyboard.needModel")); return; }
        setLoading(true);
        try {
            const next = await generateStoryboard({ brief: brief.trim(), duration, shotCount, style: style.trim(), aspectRatio, model: activeModel });
            setResult(next);
            setShots(next.shots.map((shot) => ({ ...shot, enabled: true })));
            message.success(t("canvas.storyboard.generated", { count: next.shots.length, credits: next.creditsCharged }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("canvas.storyboard.failed"));
        } finally {
            setLoading(false);
        }
    };

    const apply = () => {
        if (!result || !selectedShots.length) return;
        onApply({
            title: result.title, style: result.style, durationSeconds: result.durationSeconds,
            aspectRatio, createVideoNodes,
            scriptText: buildScriptText(result.title, result.style, result.logline, result.durationSeconds, selectedShots),
            shots: selectedShots.map(({ enabled: _enabled, ...shot }) => shot),
        });
        onClose();
    };

    const totalDuration = selectedShots.reduce((sum, s) => sum + s.duration, 0);

    return (
        <Modal
            className="canvas-redesigned sb-modal"
            open={open}
            onCancel={onClose}
            footer={null}
            width={1060}
            closable={false}
            centered
            destroyOnHidden
            styles={{
                container: { padding: 0, overflow: "hidden", borderRadius: 16 },
                header: { display: "none" },
                body: { padding: 0 },
            }}
        >
            <div className="sb-shell flex flex-col text-[13px]">
                {/* 顶栏 */}
                <div className="flex h-12 shrink-0 items-center justify-between border-b px-5" style={{ borderColor: "var(--border, rgba(255,255,255,.08))" }}>
                    <div className="flex items-center gap-2.5">
                        <span className="grid size-7 place-items-center rounded-lg" style={{ background: "rgba(216,255,62,.14)", color: "#d8ff3e" }}>
                            <Clapperboard className="size-4" />
                        </span>
                        <span className="text-sm font-semibold">{t("canvas.storyboard.title")}</span>
                    </div>
                    <button type="button" className="grid size-7 place-items-center rounded-lg opacity-50 transition hover:opacity-90 hover:bg-white/10" onClick={onClose}>
                        <span className="sr-only">关闭</span>
                        <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12"/></svg>
                    </button>
                </div>

                <div className="flex min-h-0 flex-1">
                    {/* 左侧：输入区 */}
                    <div className="sb-side flex w-[420px] shrink-0 flex-col border-r" style={{ borderColor: "var(--border, rgba(255,255,255,.08))" }}>
                        <div className="thin-scrollbar sb-side-scroll">
                            {/* 一句话描述 */}
                            <div className="sb-section">
                                <div className="sb-section-head">
                                    <label className="sb-label">{t("canvas.storyboard.briefLabel", { defaultValue: "一句话描述" })}</label>
                                    <span className="sb-brief-counter">{brief.length}/600</span>
                                </div>
                                <Input.TextArea
                                    value={brief}
                                    onChange={(e) => setBrief(e.target.value)}
                                    placeholder={t("canvas.storyboard.briefPlaceholder")}
                                    autoSize={{ minRows: 3, maxRows: 6 }}
                                    maxLength={600}
                                    className="sb-textarea"
                                    onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void run(); }}
                                />
                                <div className="sb-examples">
                                    {EXAMPLE_KEYS.map((key, index) => (
                                        <button
                                            key={key}
                                            type="button"
                                            className="sb-example"
                                            title={t(`canvas.storyboard.examples.${key}`)}
                                            onClick={() => setBrief(t(`canvas.storyboard.examples.${key}`))}
                                        >
                                            <span className="sb-example-index">{String(index + 1).padStart(2, "0")}</span>
                                            <span className="sb-example-text">{t(`canvas.storyboard.examples.${key}`)}</span>
                                            <CornerDownLeft className="sb-example-go" />
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 参数网格 */}
                            <div className="sb-grid">
                                <Field label={t("canvas.storyboard.duration")}>
                                    <InputNumber min={5} max={180} step={5} value={duration} onChange={(v) => setDuration(Number(v) || 15)} addonAfter="s" className="w-full" />
                                </Field>
                                <Field label={t("canvas.storyboard.shotCount")}>
                                    <InputNumber min={2} max={8} value={shotCount} onChange={(v) => setShotCount(Number(v) || 5)} className="w-full" />
                                </Field>
                                <Field label={t("canvas.storyboard.aspect")}>
                                    <Select value={aspectRatio} onChange={setAspectRatio} className="w-full" options={["16:9", "9:16", "1:1", "4:3"].map((v) => ({ value: v, label: v }))} />
                                </Field>
                                <Field label={t("canvas.storyboard.style")}>
                                    <Input value={style} onChange={(e) => setStyle(e.target.value)} placeholder={t("canvas.storyboard.stylePlaceholder")} />
                                </Field>
                            </div>

                            {/* 模型 */}
                            <div className="sb-section">
                                <Field label={t("canvas.storyboard.model")}>
                                    <Select value={activeModel || undefined} onChange={setModel} className="w-full" placeholder={t("canvas.storyboard.modelPlaceholder")} options={textModels.map((item) => ({ value: item.id, label: item.name }))} />
                                </Field>

                                {!loading && !textModels.length && (
                                    <div className="sb-notice" style={{ color: "#e8b75a" }}>
                                        <svg className="mt-0.5 size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9"/><path d="M12 8v4m0 4h.01"/></svg>
                                        <span>{t("canvas.storyboard.noModel")}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 生成按钮 */}
                        <div className="sb-side-footer" style={{ borderColor: "var(--border, rgba(255,255,255,.08))" }}>
                            <Button
                                type="primary"
                                block
                                size="large"
                                icon={<Sparkles className="size-4" />}
                                loading={loading}
                                disabled={!textModels.length}
                                className="!rounded-xl !font-medium"
                                onClick={() => void run()}
                            >
                                {loading ? t("canvas.storyboard.generating") : result ? t("canvas.storyboard.regenerate") : t("canvas.storyboard.generate")}
                            </Button>
                            {loading && <p className="mt-2 text-center text-xs opacity-45">{t("canvas.storyboard.generatingHint")}</p>}
                        </div>
                    </div>

                    {/* 右侧：结果区 */}
                    <div className="flex min-w-0 flex-1 flex-col">
                        {!result ? (
                            <div className="flex flex-1 flex-col items-center justify-center gap-4">
                                <span className="sb-empty-icon opacity-40">
                                    <Clapperboard className="size-7" />
                                </span>
                                <div className="text-center">
                                    <p className="text-[13px] font-medium opacity-60">生成后在此查看分镜</p>
                                    <p className="mt-1 text-xs opacity-40">左侧输入一句话，点击「生成分镜」开始</p>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* 项目信息栏 */}
                                <div className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-3" style={{ borderColor: "var(--border, rgba(255,255,255,.08))" }}>
                                    <div className="min-w-0">
                                        <p className="truncate text-[13px] font-semibold">{result.title}</p>
                                        <p className="truncate text-xs opacity-50">{result.logline}</p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2 text-xs opacity-55">
                                        <Tag>{result.style}</Tag>
                                        <span>{t("canvas.storyboard.selectedSummary", { count: selectedShots.length, duration: Math.round(totalDuration) })}</span>
                                    </div>
                                </div>

                                {/* 镜头列表 */}
                                <div className="thin-scrollbar min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
                                    {shots.map((shot) => (
                                        <div
                                            key={shot.index}
                                            className="sb-shot p-3"
                                            style={{ opacity: shot.enabled ? 1 : 0.4 }}
                                        >
                                            {/* 镜头头部 */}
                                            <div className="mb-2.5 flex flex-wrap items-center gap-2">
                                                <Checkbox
                                                    checked={shot.enabled}
                                                    onChange={(e) => updateShot(shot.index, { enabled: e.target.checked })}
                                                >
                                                    <span className="sb-shot-label">
                                                        {t("canvas.storyboard.shotLabel", { index: shot.index })}
                                                    </span>
                                                </Checkbox>
                                                <div className="ml-auto flex items-center gap-1.5">
                                                    <InputNumber
                                                        size="small"
                                                        min={1} max={60} step={0.5}
                                                        value={shot.duration}
                                                        onChange={(v) => updateShot(shot.index, { duration: Number(v) || 1 })}
                                                        addonAfter="s"
                                                        style={{ width: 84 }}
                                                    />
                                                    <Input size="small" value={shot.shotSize} onChange={(e) => updateShot(shot.index, { shotSize: e.target.value })} style={{ width: 84 }} placeholder="景别" />
                                                    <Input size="small" value={shot.cameraMove} onChange={(e) => updateShot(shot.index, { cameraMove: e.target.value })} style={{ width: 84 }} placeholder="运动" />
                                                </div>
                                            </div>
                                            {/* 画面描述 */}
                                            <Input.TextArea
                                                value={shot.prompt}
                                                onChange={(e) => updateShot(shot.index, { prompt: e.target.value })}
                                                autoSize={{ minRows: 2, maxRows: 4 }}
                                                placeholder={t("canvas.storyboard.promptPlaceholder")}
                                                disabled={!shot.enabled}
                                                className="!text-[12px]"
                                            />
                                            {/* 运动描述 */}
                                            <Input
                                                className="mt-1.5 !text-[12px]"
                                                size="small"
                                                value={shot.videoPrompt}
                                                onChange={(e) => updateShot(shot.index, { videoPrompt: e.target.value })}
                                                placeholder={t("canvas.storyboard.videoPromptPlaceholder")}
                                                disabled={!shot.enabled}
                                            />
                                        </div>
                                    ))}
                                </div>

                                {/* 底部操作栏 */}
                                <div className="flex shrink-0 items-center justify-between gap-3 border-t px-5 py-3" style={{ borderColor: "var(--border, rgba(255,255,255,.08))" }}>
                                    <Checkbox
                                        checked={createVideoNodes}
                                        onChange={(e) => setCreateVideoNodes(e.target.checked)}
                                    >
                                        <span className="text-xs">{t("canvas.storyboard.withVideoNodes")}</span>
                                    </Checkbox>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            size="middle"
                                            icon={<RefreshCw className="size-3.5" />}
                                            onClick={() => void run()}
                                            disabled={loading}
                                            className="!rounded-xl"
                                        >
                                            {t("canvas.storyboard.regenerate")}
                                        </Button>
                                        <Button
                                            type="primary"
                                            size="middle"
                                            onClick={apply}
                                            disabled={!selectedShots.length || loading}
                                            className="!rounded-xl !font-medium"
                                        >
                                            {t("canvas.storyboard.apply", { count: selectedShots.length })}
                                        </Button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="flex flex-col gap-2">
            <span className="sb-label">{label}</span>
            {children}
        </label>
    );
}
