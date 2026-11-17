import { useState, useEffect, type CSSProperties } from "react";
import { ArrowUp, AudioLines, Image as ImageIcon, Maximize2, Plus, Square, Type, Video } from "lucide-react";
import { Button, Modal, Tooltip } from "antd";
import { CanvasPromptLibrary } from "./canvas-prompt-library";
import { useTranslation } from "react-i18next";

import { useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { buildGenerationConfig } from "@/lib/canvas/canvas-generation-helpers";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { ModelPicker } from "@/components/model-picker";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasAudioSettingsPopover, type CanvasAudioSettingKey } from "./canvas-audio-settings-popover";
import { CanvasPromptChipInput } from "./canvas-prompt-chip-input";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";
import { CanvasTextSettingsPopover } from "./canvas-text-settings-popover";
import { CanvasNodeType, type CanvasConnection, type CanvasGenerationMode, type CanvasNodeData } from "@/types/canvas";
import { CanvasGenerationEstimate } from "./canvas-generation-estimate";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { CanvasNodeReferenceBar } from "./canvas-node-reference-bar";
import { PromptOptimizeButton } from "@/components/prompt-optimize-button";

export type CanvasNodeGenerationMode = CanvasGenerationMode;

type Props = {
    node: CanvasNodeData;
    isRunning: boolean;
    onPromptChange: (nodeId: string, prompt: string) => void;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => void;
    onGenerate: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => void;
    onStop: (nodeId: string) => void;
    mentionReferences?: CanvasResourceReference[];
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    connectedNodes?: CanvasNodeData[];
    onDisconnectReference?: (fromNodeId: string, toNodeId: string) => void;
    onStartReferenceSelection?: (nodeId: string) => void;
    onImageSettingsOpenChange?: (open: boolean) => void;
    modeOverride?: CanvasNodeGenerationMode;
};

export function CanvasNodePromptPanel({
    node, nodes, connections, isRunning,
    onPromptChange, onConfigChange, onGenerate, onStop,
    mentionReferences = [], connectedNodes = [],
    onDisconnectReference, onStartReferenceSelection,
    onImageSettingsOpenChange, modeOverride,
}: Props) {
    const { t } = useTranslation();
    const globalConfig = useEffectiveConfig();
    const openConfigDialog = useConfigStore((s) => s.openConfigDialog);
    const theme = canvasThemes[useThemeStore((s) => s.theme)];
    const mode = modeOverride ?? defaultMode(node.type);
    const config = buildGenerationConfig(globalConfig, node, mode);
    const hasTextContent = node.type === CanvasNodeType.Text && Boolean(node.metadata?.content?.trim());
    const hasImageContent = node.type === CanvasNodeType.Image && Boolean(node.metadata?.content);
    const isEditing = hasTextContent || hasImageContent;
    const [prompt, setPrompt] = useState(node.metadata?.composerContent ?? node.metadata?.prompt ?? "");

    const [expanded, setExpanded] = useState(false);
    useEffect(() => {
        setPrompt(node.metadata?.composerContent ?? node.metadata?.prompt ?? "");
    }, [node.id]);

    const updatePrompt = (v: string) => {
        setPrompt(v);
        if (isEditing) onConfigChange(node.id, { composerContent: v });
        else onPromptChange(node.id, v);
    };

    const submit = () => {
        const text = prompt.trim();
        if (!text || isRunning) return;
        onGenerate(node.id, mode, text);
    };

    const placeholderKey = mode === "image" && hasImageContent ? "editImage"
        : mode === "text" && hasTextContent ? "editText" : mode;

    const c = theme.composer;
    const chipClassName = "canvas-gen-chip !inline-flex !h-8 !min-w-0 !max-w-[176px] !shrink !items-center !justify-start !gap-1.5 !rounded-full !border-0 !px-3 !text-xs !font-medium !shadow-none [&>span.truncate]:min-w-0";
    const chipStyle: CSSProperties = { background: c.chip, color: c.chipText };
    const iconButtonClassName = "canvas-gen-icon !h-8 !w-8 !min-w-8 shrink-0 !rounded-full !p-0";
    const canSubmit = Boolean(prompt.trim());
    const modeLabelKey = mode === "image" && hasImageContent ? "editImage" : mode === "text" && hasTextContent ? "editText" : mode;
    const ModeIcon = mode === "video" ? Video : mode === "audio" ? AudioLines : mode === "text" ? Type : ImageIcon;

    return (
        <div
            data-canvas-no-zoom
            data-node-panel
            className="canvas-redesigned canvas-gen-panel flex w-[480px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-[20px] border backdrop-blur-md transition-[border-color,box-shadow] duration-150 [border-color:var(--gen-border)] focus-within:[border-color:var(--gen-border-focus)]"
            style={{
                background: c.surface,
                color: theme.node.text,
                boxShadow: c.shadow,
                ["--gen-border" as string]: c.border,
                ["--gen-border-focus" as string]: c.borderFocus,
                ["--gen-chip-hover" as string]: c.chipHover,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
        >
            {/* 顶部：创作类型 + 辅助工具 */}
            <div className="flex h-10 shrink-0 items-center justify-between gap-2 pl-4 pr-2 pt-1">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium" style={{ color: c.muted }}>
                    <ModeIcon className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{t(`canvas.promptPanel.modes.${modeLabelKey}`)}</span>
                </span>
                <div className="flex shrink-0 items-center gap-0.5">
                    <CanvasPromptLibrary onSelect={updatePrompt} className={iconButtonClassName} color={c.muted} />
                    <Tooltip title={t("canvas.promptPanel.expandEditor")}>
                        <Button type="text" className={iconButtonClassName} style={{ color: c.muted }} aria-label={t("canvas.promptPanel.expandEditor")} icon={<Maximize2 className="size-3.5" />} onClick={() => setExpanded(true)} />
                    </Tooltip>
                </div>
            </div>

            {/* 已连接的参考素材 */}
            {connectedNodes.length > 0 && (
                <div className="shrink-0 px-4">
                    <CanvasNodeReferenceBar
                        compact
                        nodeId={node.id}
                        nodes={nodes}
                        connectedNodes={connectedNodes}
                        onDisconnect={onDisconnectReference}
                        onStartSelection={onStartReferenceSelection}
                    />
                </div>
            )}

            {/* 参考位 + 提示词输入 */}
            <div className="flex shrink-0 items-start gap-3 px-4 pt-1">
                {!connectedNodes.length && onStartReferenceSelection && (
                    <Tooltip title={t("canvas.references.select")}>
                        <button
                            type="button"
                            className="canvas-gen-ref-slot mt-1 flex h-[60px] w-12 shrink-0 -rotate-6 flex-col items-center justify-center gap-0.5 rounded-[10px] border border-dashed text-[10px] font-medium transition-transform duration-150 hover:rotate-0 focus-visible:rotate-0 focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none"
                            style={{ background: c.slot, borderColor: c.slotBorder, color: c.muted }}
                            aria-label={t("canvas.references.select")}
                            onClick={() => onStartReferenceSelection(node.id)}
                        >
                            <Plus className="size-4" aria-hidden />
                            <span>{t("canvas.promptPanel.addReference")}</span>
                        </button>
                    </Tooltip>
                )}
                <CanvasPromptChipInput
                    value={prompt}
                    references={mentionReferences}
                    onChange={updatePrompt}
                    onSubmit={submit}
                    className="panel-scrollbar h-[92px] min-w-0 flex-1 cursor-text resize-none bg-transparent py-1 text-sm leading-[22px] outline-none"
                    style={{ background: "transparent", color: theme.node.text }}
                    placeholder={t(`canvas.promptPanel.${placeholderKey}`)}
                    placeholderClassName="left-0 top-1 leading-[22px]"
                />
            </div>

            {/* 底部工具栏：模型 / 参数 / 优化 ｜ 积分 / 生成 */}
            <div className="flex shrink-0 items-center gap-1.5 px-3 pb-3 pt-2">
                <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                    <ModelPicker
                        config={config}
                        value={config.model}
                        onChange={(model) => onConfigChange(node.id, { model })}
                        onRouteSelect={mode === "video" ? (model, videoRouteId) => onConfigChange(node.id, { model, videoRouteId }) : undefined}
                        capability={mode === "text" ? "text" : mode === "audio" ? "audio" : mode === "video" ? "video" : "image"}
                        placeholder={mode === "video" ? "选择视频模型" : undefined}
                        className="canvas-gen-chip !h-8 !min-w-0 max-w-[176px] shrink !gap-1.5 !rounded-full !border-0 !px-3 !text-xs !font-medium !shadow-none"
                        triggerStyle={chipStyle}
                    />
                    {mode === "image" && (
                        <CanvasImageSettingsPopover
                            config={config}
                            placement="topLeft"
                            buttonClassName={chipClassName}
                            buttonStyle={chipStyle}
                            onConfigChange={(key, value) => onConfigChange(node.id, key === "count" ? { count: Number(value) || 1 } : { [key]: value })}
                            onMissingConfig={() => openConfigDialog(true)}
                            onOpenChange={onImageSettingsOpenChange}
                        />
                    )}
                    {mode === "video" && (
                        <CanvasVideoSettingsPopover
                            config={config}
                            model={config.model}
                            buttonClassName={chipClassName}
                            buttonStyle={chipStyle}
                            onConfigChange={(key, value) => onConfigChange(node.id, videoConfigPatch(key, value))}
                        />
                    )}
                    {mode === "audio" && (
                        <CanvasAudioSettingsPopover
                            config={config}
                            buttonClassName={chipClassName}
                            buttonStyle={chipStyle}
                            onConfigChange={(key, value) => onConfigChange(node.id, audioConfigPatch(key, value))}
                        />
                    )}
                    {mode === "text" && (
                        <CanvasTextSettingsPopover
                            buttonClassName={chipClassName}
                            buttonStyle={chipStyle}
                            config={config}
                            count={node.metadata?.textCount || 1}
                            onConfigChange={(_, value) => onConfigChange(node.id, { reasoningEffort: value })}
                            onCountChange={(textCount) => onConfigChange(node.id, { textCount })}
                        />
                    )}
                    {(mode === "image" || mode === "video") && (
                        <PromptOptimizeButton
                            prompt={prompt}
                            model={config.model}
                            capability={mode}
                            disabled={isRunning}
                            onOptimized={updatePrompt}
                            className="canvas-gen-icon !static !h-8 !w-8 !min-w-8 shrink-0 !border-0 !shadow-none !backdrop-blur-none"
                            style={{ background: "transparent", color: c.muted }}
                        />
                    )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                    <CanvasGenerationEstimate
                        variant="chip"
                        node={node}
                        nodes={nodes}
                        connections={connections}
                        mode={mode}
                        prompt={prompt}
                    />
                    <Tooltip title={isRunning ? t("canvas.promptPanel.stopGeneration") : t("canvas.promptPanel.generate")}>
                        <button
                            type="button"
                            className="canvas-gen-send relative grid size-9 shrink-0 place-items-center rounded-full transition-[transform,background-color,opacity] duration-150 enabled:hover:scale-105 enabled:active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed motion-reduce:transition-none"
                            style={
                                isRunning
                                    ? { background: c.chip, color: theme.accent.danger, outlineColor: theme.accent.danger }
                                    : canSubmit
                                      ? { background: theme.accent.primary, color: theme.accent.onPrimary, outlineColor: theme.accent.primary }
                                      : { background: c.sendDisabledBg, color: c.sendDisabledText }
                            }
                            disabled={!isRunning && !canSubmit}
                            onClick={() => (isRunning ? onStop(node.id) : submit())}
                            aria-label={t(isRunning ? "canvas.promptPanel.stopGeneration" : "canvas.promptPanel.generate")}
                        >
                            {isRunning ? (
                                <>
                                    <span className="absolute inset-0.5 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" aria-hidden />
                                    <Square className="size-3 fill-current" aria-hidden />
                                </>
                            ) : (
                                <ArrowUp className="size-[18px]" strokeWidth={2.4} aria-hidden />
                            )}
                        </button>
                    </Tooltip>
                </div>
            </div>
            <Modal title={t("canvas.promptPanel.editorTitle")} open={expanded} centered width={760} footer={null} onCancel={() => setExpanded(false)} destroyOnHidden>
                <div data-canvas-no-zoom className="pt-2" onWheelCapture={(event) => event.stopPropagation()}>
                    <CanvasNodeReferenceBar nodeId={node.id} nodes={nodes} connectedNodes={connectedNodes} onDisconnect={onDisconnectReference} onStartSelection={(nodeId) => { setExpanded(false); onStartReferenceSelection?.(nodeId); }} />
                    <div className="relative">
                        <CanvasPromptChipInput
                            value={prompt}
                            references={mentionReferences}
                            onChange={updatePrompt}
                            className="panel-scrollbar h-[52dvh] min-h-80 w-full cursor-text overflow-y-auto rounded-xl border p-4 pb-12 pr-12 text-[15px] leading-6 outline-none"
                            style={{ background: "transparent", borderColor: theme.toolbar.border, color: theme.node.text }}
                            placeholder={t(`canvas.promptPanel.${mode === "image" && hasImageContent ? "editImage" : mode === "text" && hasTextContent ? "editText" : mode}`)}
                        />
                        {mode === "image" || mode === "video" ? (
                            <PromptOptimizeButton
                                prompt={prompt}
                                model={config.model}
                                capability={mode}
                                disabled={isRunning}
                                onOptimized={updatePrompt}
                                className="!bottom-4 !right-4"
                                style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.activeText }}
                            />
                        ) : null}
                    </div>
                </div>
            </Modal>
        </div>
    );
}

function defaultMode(type: CanvasNodeData["type"]): CanvasNodeGenerationMode {
    return type === CanvasNodeType.Text ? "text"
        : type === CanvasNodeType.Video ? "video"
        : type === CanvasNodeType.Audio ? "audio"
        : "image";
}

function videoConfigPatch(key: keyof AiConfig, value: string) {
    if (key === "videoSeconds") return { seconds: value };
    if (key === "videoGenerateAudio") return { generateAudio: value };
    if (key === "videoWatermark") return { watermark: value };
    if (key === "videoMode") return { videoMode: value };
    return { [key]: value };
}

function audioConfigPatch(key: CanvasAudioSettingKey, value: string) {
    if (key === "audioVoice") return { audioVoice: value };
    if (key === "audioFormat") return { audioFormat: value };
    if (key === "audioSpeed") return { audioSpeed: value };
    return { audioInstructions: value };
}
