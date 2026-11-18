import { lazy, Suspense } from "react";
import { Button, Modal } from "antd";
import { useTranslation } from "react-i18next";

import type { InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import type { CanvasImageAngleParams } from "@/components/canvas/canvas-node-angle-dialog";
import type { CanvasImageCropRect } from "@/components/canvas/canvas-node-crop-dialog";
import type { CanvasImageMaskEditPayload } from "@/components/canvas/canvas-node-mask-edit-dialog";
import type { CanvasImageSplitParams } from "@/components/canvas/canvas-node-split-dialog";
import type { CanvasImageUpscaleParams } from "@/components/canvas/canvas-node-upscale-dialog";
import type { StoryboardApplyPayload } from "@/components/canvas/canvas-storyboard-panel";
import type { canvasThemes } from "@/lib/canvas-theme";
import type { AdoptDirectorRender } from "@/services/api/canvas-director";
import type { UpscaleRun } from "@/services/api/canvas-upscale";
import type { CharacterMedia } from "@/services/api/character-workflow";
import type { AgentProject, CreativeToolHandoff } from "@/services/api/creative-agent";
import type { uploadedImageResult } from "./canvas-overlays-types";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import type { DirectorScene, DirectorSceneOutput } from "@/types/director";
import type { ProductionDocument, ProductionMedia } from "../../../../shared/production";

const CanvasNodeInfoModal = lazy(() =>
    import("@/components/canvas/canvas-node-hover-toolbar").then((mod) => ({ default: mod.CanvasNodeInfoModal })),
);
const CanvasNodeCropDialog = lazy(() =>
    import("@/components/canvas/canvas-node-crop-dialog").then((mod) => ({ default: mod.CanvasNodeCropDialog })),
);
const CanvasNodeMaskEditDialog = lazy(() =>
    import("@/components/canvas/canvas-node-mask-edit-dialog").then((mod) => ({ default: mod.CanvasNodeMaskEditDialog })),
);
const CanvasNodeSplitDialog = lazy(() =>
    import("@/components/canvas/canvas-node-split-dialog").then((mod) => ({ default: mod.CanvasNodeSplitDialog })),
);
const CanvasNodeUpscaleDialog = lazy(() =>
    import("@/components/canvas/canvas-node-upscale-dialog").then((mod) => ({ default: mod.CanvasNodeUpscaleDialog })),
);
const CanvasNodeAngleDialog = lazy(() =>
    import("@/components/canvas/canvas-node-angle-dialog").then((mod) => ({ default: mod.CanvasNodeAngleDialog })),
);
const CanvasAiUpscalePanel = lazy(() =>
    import("@/components/canvas/canvas-ai-upscale-panel").then((mod) => ({ default: mod.CanvasAiUpscalePanel })),
);
const CanvasCharacterPanel = lazy(() =>
    import("@/components/canvas/canvas-character-panel").then((mod) => ({ default: mod.CanvasCharacterPanel })),
);
const CanvasStoryboardPanel = lazy(() =>
    import("@/components/canvas/canvas-storyboard-panel").then((mod) => ({ default: mod.CanvasStoryboardPanel })),
);
const AssetPickerModal = lazy(() =>
    import("@/components/canvas/asset-picker-modal").then((mod) => ({ default: mod.AssetPickerModal })),
);
const CreativeAgentPanel = lazy(() =>
    import("@/components/canvas/creative-agent-panel").then((mod) => ({ default: mod.CreativeAgentPanel })),
);
const CanvasProductionPanel = lazy(() =>
    import("@/components/canvas/canvas-production-panel").then((mod) => ({ default: mod.CanvasProductionPanel })),
);
const CanvasDirectorWorkbench = lazy(() =>
    import("@/components/canvas/director/canvas-director-workbench").then((mod) => ({ default: mod.CanvasDirectorWorkbench })),
);

type CanvasOverlaysLayerProps = {
    projectId: string;
    authUserId: string | null;
    authSessionEpoch: number;
    projectTitle?: string;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    singleSelectedNodeId?: string;
    production?: ProductionDocument;
    infoNode: CanvasNodeData | null;
    onCloseInfo: () => void;
    cropNode: CanvasNodeData | null;
    onCloseCrop: () => void;
    onCropImage: (node: CanvasNodeData, crop: CanvasImageCropRect) => Promise<void>;
    maskEditNode: CanvasNodeData | null;
    onCloseMaskEdit: () => void;
    onMaskEditImage: (node: CanvasNodeData, payload: CanvasImageMaskEditPayload) => Promise<void>;
    splitNode: CanvasNodeData | null;
    onCloseSplit: () => void;
    onSplitImage: (node: CanvasNodeData, params: CanvasImageSplitParams) => Promise<void>;
    upscaleNode: CanvasNodeData | null;
    onCloseUpscale: () => void;
    onUpscaleImage: (node: CanvasNodeData, params: CanvasImageUpscaleParams) => Promise<void>;
    angleNode: CanvasNodeData | null;
    onCloseAngle: () => void;
    onAngleImage: (node: CanvasNodeData, params: CanvasImageAngleParams) => Promise<void>;
    superResolveNode: CanvasNodeData | null;
    onCloseSuperResolve: () => void;
    onUpscaleResult: (run: UpscaleRun) => void;
    creativePanel: "production" | "production-export" | "agent" | "character" | null;
    onCloseCreativePanel: () => void;
    onOpenProductionExport: () => void;
    onOpenDirectorFromAgent: () => void;
    toolHandoff?: CreativeToolHandoff;
    prepareCreativeCanvas: () => Promise<AgentProject>;
    applyCreativeProject: (remote: AgentProject) => Promise<void>;
    openCreativeTool: (handoff: CreativeToolHandoff) => void;
    addCreativeMedia: (runId: string, media: CharacterMedia[], sourceId?: string) => void;
    findSourceNodeIdByKey: (sourceKey: string) => string | undefined;
    changeProduction: (next: ProductionDocument) => void;
    focusNode: (nodeId: string) => void;
    upscaleProductionCandidate: (runId: string, media: ProductionMedia) => Promise<void>;
    previewNode: CanvasNodeData | null;
    previewContent?: string;
    onClosePreview: () => void;
    clearConfirmOpen: boolean;
    onCloseClearConfirm: () => void;
    onClearCanvas: () => void;
    deleteProjectConfirmOpen: boolean;
    onCloseDeleteProjectConfirm: () => void;
    onDeleteCurrentProject: () => void;
    directorOpen: boolean;
    activeDirectorScene: DirectorScene | null;
    onCloseDirector: () => void;
    onSaveDirectorScene: (scene: DirectorScene) => void;
    onApplyDirectorOutput: (output: DirectorSceneOutput) => Promise<void>;
    onDeleteDirectorImageNode: (nodeId: string) => void;
    onAddDirectorCanvasImage: (image: uploadedImageResult, title: string, signal: AbortSignal) => Promise<{ persisted: boolean }>;
    onAdoptDirectorRender: AdoptDirectorRender;
    storyboardOpen: boolean;
    onCloseStoryboard: () => void;
    onApplyStoryboard: (payload: StoryboardApplyPayload) => void;
    assetPickerOpen: boolean;
    onCloseAssetPicker: () => void;
    onInsertAsset: (payload: InsertAssetPayload) => void;
};

export function CanvasOverlaysLayer(props: CanvasOverlaysLayerProps) {
    const { t } = useTranslation();
    const {
        projectId,
        authUserId,
        authSessionEpoch,
        projectTitle,
        theme,
        nodes,
        selectedNodeIds,
        singleSelectedNodeId,
        production,
        infoNode,
        onCloseInfo,
        cropNode,
        onCloseCrop,
        onCropImage,
        maskEditNode,
        onCloseMaskEdit,
        onMaskEditImage,
        splitNode,
        onCloseSplit,
        onSplitImage,
        upscaleNode,
        onCloseUpscale,
        onUpscaleImage,
        angleNode,
        onCloseAngle,
        onAngleImage,
        superResolveNode,
        onCloseSuperResolve,
        onUpscaleResult,
        creativePanel,
        onCloseCreativePanel,
        onOpenProductionExport,
        onOpenDirectorFromAgent,
        toolHandoff,
        prepareCreativeCanvas,
        applyCreativeProject,
        openCreativeTool,
        addCreativeMedia,
        findSourceNodeIdByKey,
        changeProduction,
        focusNode,
        upscaleProductionCandidate,
        previewNode,
        previewContent,
        onClosePreview,
        clearConfirmOpen,
        onCloseClearConfirm,
        onClearCanvas,
        deleteProjectConfirmOpen,
        onCloseDeleteProjectConfirm,
        onDeleteCurrentProject,
        directorOpen,
        activeDirectorScene,
        onCloseDirector,
        onSaveDirectorScene,
        onApplyDirectorOutput,
        onDeleteDirectorImageNode,
        onAddDirectorCanvasImage,
        onAdoptDirectorRender,
        storyboardOpen,
        onCloseStoryboard,
        onApplyStoryboard,
        assetPickerOpen,
        onCloseAssetPicker,
        onInsertAsset,
    } = props;

    return (
        <>
            <Suspense fallback={null}>
                {infoNode ? <CanvasNodeInfoModal node={infoNode} open onClose={onCloseInfo} /> : null}

                {cropNode?.metadata?.content ? (
                    <CanvasNodeCropDialog dataUrl={cropNode.metadata.content} open onClose={onCloseCrop} onConfirm={(crop) => void onCropImage(cropNode, crop)} />
                ) : null}

                {maskEditNode?.metadata?.content ? (
                    <CanvasNodeMaskEditDialog dataUrl={maskEditNode.metadata.content} open onClose={onCloseMaskEdit} onConfirm={(payload) => void onMaskEditImage(maskEditNode, payload)} />
                ) : null}

                {splitNode?.metadata?.content ? (
                    <CanvasNodeSplitDialog dataUrl={splitNode.metadata.content} open onClose={onCloseSplit} onConfirm={(params) => void onSplitImage(splitNode, params)} />
                ) : null}

                {upscaleNode?.metadata?.content ? (
                    <CanvasNodeUpscaleDialog dataUrl={upscaleNode.metadata.content} open onClose={onCloseUpscale} onConfirm={(params) => void onUpscaleImage(upscaleNode, params)} />
                ) : null}

                {superResolveNode ? (
                    <CanvasAiUpscalePanel
                        key={`${authUserId}:${authSessionEpoch}:${projectId}`}
                        projectId={projectId}
                        sourceNode={superResolveNode}
                        sourceNodes={nodes.filter((node) => selectedNodeIds.has(node.id) && (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video))}
                        instructions={toolHandoff?.tool === "upscale" ? toolHandoff.instructions : undefined}
                        open
                        onClose={onCloseSuperResolve}
                        onResult={onUpscaleResult}
                    />
                ) : null}

                {creativePanel === "character" ? (
                    <CanvasCharacterPanel
                        key={`${authUserId}:${authSessionEpoch}:${projectId}:${toolHandoff?.nodeId || ""}:${toolHandoff?.referenceNodeIds.join(",") || ""}:${toolHandoff?.instructions || ""}`}
                        projectId={projectId}
                        nodes={nodes}
                        initialSourceId={toolHandoff?.tool === "character_replacement" ? toolHandoff.nodeId : singleSelectedNodeId}
                        initialReferenceId={toolHandoff?.tool === "character_replacement" && toolHandoff.referenceNodeIds.length === 1 ? toolHandoff.referenceNodeIds[0] : undefined}
                        initialInstructions={toolHandoff?.tool === "character_replacement" ? toolHandoff.instructions : undefined}
                        prepareCanvas={prepareCreativeCanvas}
                        onAddMedia={(run, media) => addCreativeMedia(run.id, media, findSourceNodeIdByKey(run.input.sourceKey))}
                        onClose={onCloseCreativePanel}
                    />
                ) : null}

                {angleNode?.metadata?.content ? (
                    <CanvasNodeAngleDialog dataUrl={angleNode.metadata.content} open onClose={onCloseAngle} onConfirm={(params) => void onAngleImage(angleNode, params)} />
                ) : null}

                {storyboardOpen ? <CanvasStoryboardPanel key={`${authUserId}:${authSessionEpoch}:${projectId}`} open onClose={onCloseStoryboard} onApply={onApplyStoryboard} /> : null}

                {assetPickerOpen ? <AssetPickerModal open onInsert={onInsertAsset} onClose={onCloseAssetPicker} /> : null}

                {creativePanel === "agent" ? (
                    <CreativeAgentPanel
                        key={`${authUserId}:${authSessionEpoch}:${projectId}`}
                        projectId={projectId}
                        selectedNodeIds={[...selectedNodeIds]}
                        prepareCanvas={prepareCreativeCanvas}
                        applyProject={applyCreativeProject}
                        onToolHandoff={openCreativeTool}
                        onOpenProductionExport={onOpenProductionExport}
                        onOpenDirector={onOpenDirectorFromAgent}
                        onClose={onCloseCreativePanel}
                    />
                ) : null}

                {creativePanel === "production" || creativePanel === "production-export" ? (
                    <CanvasProductionPanel
                        key={`${authUserId}:${authSessionEpoch}:${projectId}`}
                        projectId={projectId}
                        initialTab={creativePanel === "production-export" ? "composition" : "script"}
                        focusShotId={creativePanel === "production-export" ? undefined : production?.shots.find((shot) => shot.nodeId === singleSelectedNodeId)?.shotId}
                        prepareCanvas={prepareCreativeCanvas}
                        applyProject={applyCreativeProject}
                        onChangeProduction={changeProduction}
                        onLocateNode={focusNode}
                        onUpscaleCandidate={upscaleProductionCandidate}
                        onClose={onCloseCreativePanel}
                    />
                ) : null}
            </Suspense>

            <Modal
                title={t("canvas.projectPage.imageDetails")}
                open={Boolean(previewContent)}
                centered
                onCancel={onClosePreview}
                footer={null}
                width="auto"
                styles={{ body: { padding: 0, display: "flex", justifyContent: "center", alignItems: "center", maxHeight: "80vh" } }}
            >
                {previewContent ? <img src={previewContent} alt={previewNode?.title || t("assets.kinds.image")} style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain" }} /> : null}
            </Modal>

            <Modal
                title={t("canvas.projectPage.clearTitle")}
                open={clearConfirmOpen}
                centered
                onCancel={onCloseClearConfirm}
                footer={
                    <>
                        <Button onClick={onCloseClearConfirm}>{t("common.cancel")}</Button>
                        <Button danger type="primary" onClick={onClearCanvas}>
                            {t("canvas.projectPage.clear")}
                        </Button>
                    </>
                }
            >
                <p className="text-sm opacity-60">{t("canvas.projectPage.clearDescription")}</p>
            </Modal>

            <Modal
                title={t("canvas.project.deleteTitle")}
                open={deleteProjectConfirmOpen}
                centered
                onCancel={onCloseDeleteProjectConfirm}
                footer={
                    <>
                        <Button onClick={onCloseDeleteProjectConfirm}>{t("common.cancel")}</Button>
                        <Button danger type="primary" onClick={onDeleteCurrentProject}>
                            {t("common.delete")}
                        </Button>
                    </>
                }
            >
                <p className="text-sm opacity-75">
                    确认删除画布「{projectTitle || t("canvas.projectPage.untitledCanvas")}」？
                </p>
                <p className="mt-2 text-xs opacity-60">
                    删除后将移除该画布项目及其仅内部引用的本地未保存素材，且当前不可撤销，请谨慎操作。
                </p>
            </Modal>

            {/* 导演台：整屏浮层，独立于画布交互；关闭后场景留在项目里。 */}
            {directorOpen && activeDirectorScene ? (
                <Suspense
                    fallback={
                        <div className="fixed inset-0 z-[var(--z-toast)] grid place-items-center text-sm" style={{ background: theme.canvas.background, color: theme.node.text }}>
                            {t("canvas.director.loading")}
                        </div>
                    }
                >
                    <CanvasDirectorWorkbench
                        key={`${authUserId}:${authSessionEpoch}:${projectId}:${activeDirectorScene.id}`}
                        open
                        scene={activeDirectorScene}
                        projectId={projectId}
                        imageNodes={nodes.filter((node) => node.type === CanvasNodeType.Image && Boolean(node.metadata?.content))}
                        onboardingScope={`sundas:${projectId}`}
                        onClose={onCloseDirector}
                        onChange={onSaveDirectorScene}
                        onFlush={async () => {
                            await prepareCreativeCanvas();
                        }}
                        onApply={onApplyDirectorOutput}
                        onDeleteImageNode={onDeleteDirectorImageNode}
                        onAddCanvasImage={onAddDirectorCanvasImage}
                        onAdoptRender={onAdoptDirectorRender}
                    />
                </Suspense>
            ) : null}
        </>
    );
}
