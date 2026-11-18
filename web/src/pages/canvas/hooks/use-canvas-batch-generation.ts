import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { App } from "antd";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";

import type { CanvasImageAngleParams } from "@/components/canvas/canvas-node-angle-dialog";
import type { CanvasImageCropRect } from "@/components/canvas/canvas-node-crop-dialog";
import type { CanvasImageMaskEditPayload } from "@/components/canvas/canvas-node-mask-edit-dialog";
import type { CanvasImageSplitParams } from "@/components/canvas/canvas-node-split-dialog";
import type { CanvasImageUpscaleParams } from "@/components/canvas/canvas-node-upscale-dialog";
import type { CanvasNodeGenerationMode } from "@/components/canvas/canvas-node-prompt-panel";
import { buildNodeGenerationContext, buildNodeGenerationInputs, buildNodeResponseMessages, hydrateNodeGenerationContext } from "@/components/canvas/canvas-node-generation";
import { NODE_DEFAULT_SIZE } from "@/constant/canvas";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import {
    buildAngleLabel,
    buildAnglePrompt,
    buildGenerationConfig,
    findRetrySourceNode,
    generationReferenceUrls,
    getGenerationCount,
    hasResumableVideoTask,
    isGenerationCanceled,
    resolveMetadataReferences,
    sourceNodeReferenceImages,
} from "@/lib/canvas/canvas-generation-helpers";
import { cropDataUrl, splitDataUrl, upscaleDataUrl } from "@/lib/canvas/canvas-image-data";
import { audioMetadata, buildAudioGenerationMetadata, buildImageGenerationMetadata, imageMetadata } from "@/lib/canvas/canvas-node-factory";
import { fitNodeSize, nodeSizeFromRatio } from "@/lib/canvas/canvas-node-size";
import { createGenerationAccountBindings, guardGenerationUpdate } from "@/lib/canvas/generation-account";
import { getNodeDefinition } from "@/lib/canvas/node-registry";
import { videoReferenceNotice } from "@/lib/canvas/video-reference-limits";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { requestStoredAudio } from "@/services/api/audio";
import { requestEdit, requestGeneration, requestImageQuestion } from "@/services/api/image";
import { createVideoGenerationTask, isVideoTaskFailed, pollVideoGenerationTask, storeGeneratedVideo, waitForVideoGenerationTask } from "@/services/api/video";
import { uploadImage } from "@/services/image-storage";
import { useAuthStore } from "@/stores/use-auth-store";
import { modelOptionName, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import {
    CanvasNodeType,
    type CanvasConnection,
    type CanvasNodeData,
    type CanvasNodeImage,
    type CanvasNodeText,
} from "@/types/canvas";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import {
    applyGeneratedVideo,
    isRecoverableVideoCreateError,
    NODE_STATUS_ERROR,
    NODE_STATUS_IDLE,
    NODE_STATUS_LOADING,
    NODE_STATUS_SUCCESS,
    type CanvasGenerationRequest,
} from "./canvas-project-types";

type UseCanvasBatchGenerationOptions = {
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    generationRequestsRef: MutableRefObject<Map<string, CanvasGenerationRequest>>;
    generateNodeRef: MutableRefObject<((nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => Promise<void>) | null>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    setRunningNodeId: Dispatch<SetStateAction<string | null>>;
    setExpandedBatchNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setCropNodeId: Dispatch<SetStateAction<string | null>>;
    setSplitNodeId: Dispatch<SetStateAction<string | null>>;
    setMaskEditNodeId: Dispatch<SetStateAction<string | null>>;
    setUpscaleNodeId: Dispatch<SetStateAction<string | null>>;
    setAngleNodeId: Dispatch<SetStateAction<string | null>>;
};

export function useCanvasBatchGeneration({
    nodesRef,
    connectionsRef,
    generationRequestsRef,
    generateNodeRef,
    setNodes,
    setConnections,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setDialogNodeId,
    setRunningNodeId,
    setExpandedBatchNodeIds,
    setCropNodeId,
    setSplitNodeId,
    setMaskEditNodeId,
    setUpscaleNodeId,
    setAngleNodeId,
}: UseCanvasBatchGenerationOptions) {
    const { message, modal } = App.useApp();
    const { t } = useTranslation();
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const generationOwnersRef = useRef(createGenerationAccountBindings());
    const videoPollIdsRef = useRef(new Set<string>());

    const startGenerationRequest = useCallback(
        (targetNodeId: string, originNodeId: string, runningId = originNodeId, controller = new AbortController()) => {
            const auth = useAuthStore.getState();
            generationOwnersRef.current.bind(controller.signal, auth.ready && auth.user ? auth.user.id : null, auth.sessionEpoch);
            const previous = generationRequestsRef.current.get(targetNodeId);
            if (previous?.controller !== controller) previous?.controller.abort();
            generationRequestsRef.current.set(targetNodeId, { targetNodeId, originNodeId, runningNodeId: runningId, controller });
            return controller;
        },
        [generationRequestsRef],
    );

    const generationAccountOptions = (signal: AbortSignal, _config: Parameters<typeof buildGenerationConfig>[0]) => generationOwnersRef.current.options(signal);
    const isGenerationAccountCurrent = (signal: AbortSignal) => {
        const auth = useAuthStore.getState();
        return generationOwnersRef.current.isCurrent(signal, auth.ready ? auth.user?.id ?? null : null, auth.sessionEpoch);
    };
    const isGenerationAccountOwner = (signal: AbortSignal) => {
        const auth = useAuthStore.getState();
        return generationOwnersRef.current.isOwner(signal, auth.ready ? auth.user?.id ?? null : null, auth.sessionEpoch);
    };

    const finishGenerationRequest = useCallback(
        (targetNodeId: string, controller: AbortController) => {
            const request = generationRequestsRef.current.get(targetNodeId);
            if (request?.controller === controller) generationRequestsRef.current.delete(targetNodeId);
        },
        [generationRequestsRef],
    );

    const videoProgressOptions = (nodeId: string, signal: AbortSignal, config: Parameters<typeof buildGenerationConfig>[0]) => ({
        ...generationAccountOptions(signal, config),
        onProgress: (videoStatusMessage: string) =>
            setNodes((prev) =>
                isGenerationAccountCurrent(signal)
                    ? prev.map((item) =>
                          item.id === nodeId && item.metadata?.videoStatusMessage !== videoStatusMessage
                              ? { ...item, metadata: { ...item.metadata, videoStatusMessage } }
                              : item,
                      )
                    : prev,
            ),
    });

    const completeVideoNodeTask = useCallback(
        async (
            nodeId: string,
            config: Parameters<typeof buildGenerationConfig>[0],
            prompt: string,
            images: Parameters<typeof createVideoGenerationTask>[2],
            signal: AbortSignal,
            extra: CanvasNodeData["metadata"] = {},
            videos: ReferenceVideo[] = [],
            audios: ReferenceAudio[] = [],
        ) => {
            const clientTaskId = crypto.randomUUID();
            setNodes((prev) =>
                isGenerationAccountCurrent(signal)
                    ? prev.map((item) => (item.id === nodeId ? { ...item, metadata: { ...item.metadata, videoStatusMessage: "正在提交" } } : item))
                    : prev,
            );
            const requestOptions = { ...generationAccountOptions(signal, config), videos, audios, clientTaskId };
            const markTask = (taskId: string | undefined, provider: "openai" | "gemini" | "plugin" = "openai") =>
                setNodes((prev) =>
                    isGenerationAccountCurrent(signal)
                        ? prev.map((item) =>
                              item.id === nodeId
                                  ? {
                                        ...item,
                                        metadata: {
                                            ...item.metadata,
                                            ...(taskId
                                                ? { videoTaskId: taskId, videoTaskProvider: provider === "gemini" ? ("gemini" as const) : ("openai" as const), model: config.model }
                                                : { videoTaskId: undefined }),
                                        },
                                    }
                                  : item,
                          )
                        : prev,
                );
            markTask(clientTaskId);
            let task: { id: string; provider: "openai" | "gemini" | "plugin"; model: string };
            try {
                task = await createVideoGenerationTask(config, prompt, images, requestOptions);
            } catch (error) {
                if (!isRecoverableVideoCreateError(error)) {
                    markTask(undefined);
                    throw error;
                }
                let recovered = false;
                for (let attempt = 0; attempt < 3 && !recovered; attempt += 1) {
                    try {
                        await pollVideoGenerationTask(config, { id: clientTaskId, provider: "openai", model: config.model }, requestOptions);
                        recovered = true;
                    } catch (pollError) {
                        if (signal.aborted) throw pollError;
                        await new Promise((resolve) => setTimeout(resolve, 2000));
                    }
                }
                if (!recovered) {
                    markTask(undefined);
                    throw error;
                }
                task = { id: clientTaskId, provider: "openai", model: config.model };
            }
            if (task.provider === "plugin") markTask(undefined);
            else markTask(task.id, task.provider);
            const video = await storeGeneratedVideo(
                await waitForVideoGenerationTask(config, task, videoProgressOptions(nodeId, signal, config)),
                { signal, expectedOwner: generationOwnersRef.current.owner(signal) },
            );
            setNodes((prev) =>
                isGenerationAccountCurrent(signal)
                    ? prev.map((item) => (item.id === nodeId ? applyGeneratedVideo(item, video, { prompt, model: config.model, ...extra }) : item))
                    : prev,
            );
        },
        [setNodes],
    );

    const pollVideoNodeTask = useCallback(
        async (node: CanvasNodeData, silent = false) => {
            const taskId = node.metadata?.videoTaskId;
            if (!taskId || node.metadata?.content || generationRequestsRef.current.has(node.id) || videoPollIdsRef.current.has(node.id)) return;
            videoPollIdsRef.current.add(node.id);
            let controller: AbortController | undefined;
            try {
                const generationConfig = buildGenerationConfig(effectiveConfig, node, "video");
                if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                    if (silent) {
                        setNodes((prev) =>
                            prev.map((item) =>
                                item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails: t("workbench.configFirst") } } : item,
                            ),
                        );
                        return;
                    }
                    openConfigDialog(true);
                    return;
                }
                setRunningNodeId(node.id);
                setNodes((prev) =>
                    prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_LOADING, errorDetails: undefined } } : item)),
                );
                controller = startGenerationRequest(node.id, node.id, node.id);
                const video = await storeGeneratedVideo(
                    await waitForVideoGenerationTask(
                        generationConfig,
                        { id: taskId, provider: node.metadata?.videoTaskProvider === "gemini" ? "gemini" : "openai", model: generationConfig.model },
                        videoProgressOptions(node.id, controller.signal, generationConfig),
                    ),
                    { signal: controller.signal, expectedOwner: generationOwnersRef.current.owner(controller.signal) },
                );
                setNodes((prev) =>
                    !isGenerationAccountCurrent(controller!.signal)
                        ? prev
                        : prev.map((item) =>
                              item.id === node.id
                                  ? applyGeneratedVideo(item, video, {
                                        prompt: item.metadata?.prompt,
                                        model: generationConfig.model,
                                        size: generationConfig.size,
                                        seconds: generationConfig.videoSeconds,
                                        vquality: generationConfig.vquality,
                                        generateAudio: generationConfig.videoGenerateAudio,
                                        watermark: generationConfig.videoWatermark,
                                        videoMode: generationConfig.videoMode,
                                        videoRouteId: generationConfig.videoRouteId,
                                    })
                                  : item,
                          ),
                );
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                if (controller && !isGenerationAccountCurrent(controller.signal)) return;
                const errorDetails = friendlyErrorMessage(error instanceof Error ? error.message : t("canvas.projectPage.generationFailed"));
                message.error(errorDetails);
                setNodes((prev) =>
                    controller && !isGenerationAccountCurrent(controller.signal)
                        ? prev
                        : prev.map((item) =>
                              item.id === node.id
                                  ? {
                                        ...item,
                                        metadata: {
                                            ...item.metadata,
                                            status: item.metadata?.content ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR,
                                            errorDetails: item.metadata?.content ? undefined : errorDetails,
                                            ...(isVideoTaskFailed(error) ? { videoTaskId: undefined } : {}),
                                        },
                                    }
                                  : item,
                          ),
                );
            } finally {
                videoPollIdsRef.current.delete(node.id);
                if (controller) {
                    finishGenerationRequest(node.id, controller);
                    setRunningNodeId((current) => (isGenerationAccountOwner(controller!.signal) && current === node.id ? null : current));
                }
            }
        },
        [effectiveConfig, finishGenerationRequest, generationRequestsRef, isAiConfigReady, message, openConfigDialog, setNodes, setRunningNodeId, startGenerationRequest, t],
    );

    const stopGenerationByRunningId = useCallback(
        (runningId: string) => {
            const affectedNodeIds = new Set<string>();
            generationRequestsRef.current.forEach((request) => {
                if (request.runningNodeId !== runningId) return;
                request.controller.abort();
                generationRequestsRef.current.delete(request.targetNodeId);
                affectedNodeIds.add(request.targetNodeId);
                affectedNodeIds.add(request.originNodeId);
            });
            setRunningNodeId((current) => (current === runningId ? null : current));
            setNodes((prev) =>
                prev.map((node) =>
                    affectedNodeIds.has(node.id) && node.metadata?.status === NODE_STATUS_LOADING
                        ? {
                              ...node,
                              metadata: {
                                  ...node.metadata,
                                  status: NODE_STATUS_IDLE,
                                  errorDetails: undefined,
                                  images: node.metadata.images?.map((image) =>
                                      image.status === NODE_STATUS_LOADING ? { ...image, status: NODE_STATUS_ERROR, errorDetails: t("common.requestCanceled") } : image,
                                  ),
                                  texts: node.metadata.texts?.map((text) =>
                                      text.status === NODE_STATUS_LOADING ? { ...text, status: NODE_STATUS_ERROR, errorDetails: t("common.requestCanceled") } : text,
                                  ),
                              },
                          }
                        : node,
                ),
            );
        },
        [generationRequestsRef, setNodes, setRunningNodeId, t],
    );

    const confirmStopGeneration = useCallback(
        (nodeId: string) => {
            modal.confirm({
                title: t("canvas.projectPage.stopTitle"),
                content: t("canvas.projectPage.stopDescription"),
                okText: t("canvas.projectPage.stop"),
                cancelText: t("canvas.projectPage.continue"),
                okButtonProps: { danger: true },
                onOk: () => stopGenerationByRunningId(nodeId),
            });
        },
        [modal, stopGenerationByRunningId, t],
    );

    const cropImageNode = useCallback(
        async (node: CanvasNodeData, crop: CanvasImageCropRect) => {
            if (!node.metadata?.content) return;
            const cropped = await cropDataUrl(node.metadata.content, crop);
            const image = await uploadImage(cropped);
            const width = Math.min(node.width, Math.max(220, image.width));
            const childId = nanoid();
            const child: CanvasNodeData = {
                id: childId,
                type: CanvasNodeType.Image,
                title: "Cropped Image",
                position: { x: node.position.x + node.width + 96, y: node.position.y },
                width,
                height: width * (image.height / image.width),
                metadata: { ...imageMetadata(image), prompt: node.metadata?.prompt },
            };
            setNodes((prev) => [...prev, child]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
            setSelectedNodeIds(new Set([childId]));
            setDialogNodeId(childId);
            setCropNodeId(null);
        },
        [setConnections, setCropNodeId, setDialogNodeId, setNodes, setSelectedNodeIds],
    );

    const splitImageNode = useCallback(
        async (node: CanvasNodeData, params: CanvasImageSplitParams) => {
            if (!node.metadata?.content) return;
            setSplitNodeId(null);
            const pieces = await splitDataUrl(node.metadata.content, params);
            const gap = 16;
            const cellWidth = node.width / params.columns;
            const cellHeight = node.height / params.rows;
            const startX = node.position.x + node.width + 96;
            const startY = node.position.y;
            const childNodes = await Promise.all(
                pieces.map(async (piece) => {
                    const image = await uploadImage(piece.dataUrl);
                    const id = nanoid();
                    return {
                        id,
                        type: CanvasNodeType.Image,
                        title: t("canvas.projectPage.splitTitle", { name: node.title || t("assets.kinds.image"), row: piece.row + 1, column: piece.column + 1 }),
                        position: { x: startX + piece.column * (cellWidth + gap), y: startY + piece.row * (cellHeight + gap) },
                        width: cellWidth,
                        height: cellHeight,
                        metadata: { ...imageMetadata(image), prompt: node.metadata?.prompt },
                    } satisfies CanvasNodeData;
                }),
            );
            setNodes((prev) => [...prev, ...childNodes]);
            setConnections((prev) => [...prev, ...childNodes.map((child) => ({ id: nanoid(), fromNodeId: node.id, toNodeId: child.id }))]);
            setSelectedNodeIds(new Set(childNodes.map((child) => child.id)));
            setSelectedConnectionId(null);
            setDialogNodeId(null);
            message.success(t("canvas.projectPage.splitSuccess", { count: childNodes.length }));
        },
        [message, setConnections, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds, setSplitNodeId, t],
    );

    const maskEditImageNode = useCallback(
        async (node: CanvasNodeData, payload: CanvasImageMaskEditPayload) => {
            if (!node.metadata?.content) return;
            const generationConfig = { ...buildGenerationConfig(effectiveConfig, node, "image"), count: "1", size: node.metadata?.size || "auto" };
            if (payload.generate && !isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }
            const userPrompt = payload.prompt.trim();
            const prompt = t("canvas.projectPage.maskPrompt", { source: imageReferenceLabel(0), mask: imageReferenceLabel(1), prompt: userPrompt });
            setMaskEditNodeId(null);
            const maskImage = await uploadImage(payload.maskDataUrl);
            const maskNodeId = nanoid();
            const childId = nanoid();
            const source = { id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey };
            const maskSource = { id: maskNodeId, name: "mask.png", type: maskImage.mimeType || "image/png", dataUrl: maskImage.url, storageKey: maskImage.storageKey };
            const references = [source, maskSource];
            const generationMetadata = buildImageGenerationMetadata("edit", generationConfig, 1, references);
            const childMetadata = payload.generate ? { prompt, status: NODE_STATUS_LOADING, ...generationMetadata } : { prompt };
            setNodes((prev) => [
                ...prev,
                {
                    id: maskNodeId,
                    type: CanvasNodeType.Image,
                    title: t("canvas.projectPage.maskNodeTitle"),
                    position: { x: node.position.x, y: node.position.y + node.height + 96 },
                    width: node.width,
                    height: node.height,
                    metadata: imageMetadata(maskImage),
                },
                {
                    id: childId,
                    type: CanvasNodeType.Image,
                    title: userPrompt.slice(0, 32) || t("canvas.projectPage.maskResult"),
                    position: { x: node.position.x + node.width + 96, y: node.position.y },
                    width: node.width,
                    height: node.height,
                    metadata: childMetadata,
                },
            ]);
            setConnections((prev) => [
                ...prev,
                { id: nanoid(), fromNodeId: node.id, toNodeId: childId },
                { id: nanoid(), fromNodeId: maskNodeId, toNodeId: childId },
            ]);
            setSelectedNodeIds(new Set([childId]));
            setSelectedConnectionId(null);
            setDialogNodeId(childId);
            if (!payload.generate) return;
            setRunningNodeId(childId);
            const controller = startGenerationRequest(childId, node.id, childId);
            try {
                const image = await requestEdit(generationConfig, prompt, references, generationAccountOptions(controller.signal, generationConfig)).then((items) => items[0]);
                const uploaded = await uploadImage(image.dataUrl, { signal: controller.signal, expectedOwner: generationOwnersRef.current.owner(controller.signal) });
                const size = fitNodeSize(uploaded.width, uploaded.height, node.width, node.height);
                setNodes((prev) =>
                    isGenerationAccountCurrent(controller.signal)
                        ? prev.map((item) => (item.id === childId ? { ...item, width: size.width, height: size.height, metadata: { ...item.metadata, ...imageMetadata(uploaded), prompt, ...generationMetadata } } : item))
                        : prev,
                );
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                if (!isGenerationAccountCurrent(controller.signal)) return;
                const errorDetails = error instanceof Error ? error.message : t("canvas.projectPage.maskFailed");
                message.error(errorDetails);
                setNodes((prev) =>
                    isGenerationAccountCurrent(controller.signal)
                        ? prev.map((item) => (item.id === childId ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item))
                        : prev,
                );
            } finally {
                finishGenerationRequest(childId, controller);
                setRunningNodeId((current) => (isGenerationAccountOwner(controller.signal) && current === childId ? null : current));
            }
        },
        [effectiveConfig, finishGenerationRequest, isAiConfigReady, message, openConfigDialog, setConnections, setDialogNodeId, setMaskEditNodeId, setNodes, setRunningNodeId, setSelectedConnectionId, setSelectedNodeIds, startGenerationRequest, t],
    );

    const upscaleImageNode = useCallback(
        async (node: CanvasNodeData, params: CanvasImageUpscaleParams) => {
            if (!node.metadata?.content) return;
            setUpscaleNodeId(null);
            const upscaled = await upscaleDataUrl(node.metadata.content, params);
            const image = await uploadImage(upscaled);
            const size = fitNodeSize(image.width, image.height);
            const childId = nanoid();
            const child: CanvasNodeData = {
                id: childId,
                type: CanvasNodeType.Image,
                title: "Upscaled Image",
                position: { x: node.position.x + node.width + 96, y: node.position.y },
                width: size.width,
                height: size.height,
                metadata: { ...imageMetadata(image), prompt: node.metadata?.prompt },
            };
            setNodes((prev) => [...prev, child]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
            setSelectedNodeIds(new Set([childId]));
            setDialogNodeId(childId);
        },
        [setConnections, setDialogNodeId, setNodes, setSelectedNodeIds, setUpscaleNodeId],
    );

    const generateAngleNode = useCallback(
        async (node: CanvasNodeData, params: CanvasImageAngleParams) => {
            if (!node.metadata?.content) return;
            const generationConfig = { ...buildGenerationConfig(effectiveConfig, node, "image"), count: "1" };
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }
            const childId = nanoid();
            const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
            const title = buildAngleLabel(params);
            const prompt = buildAnglePrompt(params);
            const generationMetadata = buildImageGenerationMetadata("edit", generationConfig, 1, [
                { id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey },
            ]);
            setAngleNodeId(null);
            setRunningNodeId(childId);
            setNodes((prev) => [
                ...prev,
                {
                    id: childId,
                    type: CanvasNodeType.Image,
                    title,
                    position: { x: node.position.x + node.width + 96, y: node.position.y },
                    width: imageConfig.width,
                    height: imageConfig.height,
                    metadata: { prompt, status: NODE_STATUS_LOADING, ...generationMetadata },
                },
            ]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
            setSelectedNodeIds(new Set([childId]));
            setDialogNodeId(childId);
            const controller = startGenerationRequest(childId, node.id, childId);
            try {
                const image = await requestEdit(
                    generationConfig,
                    prompt,
                    [{ id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey }],
                    generationAccountOptions(controller.signal, generationConfig),
                ).then((items) => items[0]);
                const uploaded = await uploadImage(image.dataUrl, { signal: controller.signal, expectedOwner: generationOwnersRef.current.owner(controller.signal) });
                const size = fitNodeSize(uploaded.width, uploaded.height, imageConfig.width, imageConfig.height);
                setNodes((prev) =>
                    isGenerationAccountCurrent(controller.signal)
                        ? prev.map((item) => (item.id === childId ? { ...item, width: size.width, height: size.height, metadata: { ...item.metadata, ...imageMetadata(uploaded), prompt, ...generationMetadata } } : item))
                        : prev,
                );
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                if (!isGenerationAccountCurrent(controller.signal)) return;
                const errorDetails = error instanceof Error ? error.message : t("canvas.projectPage.generationFailed");
                setNodes((prev) =>
                    isGenerationAccountCurrent(controller.signal)
                        ? prev.map((item) => (item.id === childId ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item))
                        : prev,
                );
            } finally {
                finishGenerationRequest(childId, controller);
                setRunningNodeId((current) => (isGenerationAccountOwner(controller.signal) && current === childId ? null : current));
            }
        },
        [effectiveConfig, finishGenerationRequest, isAiConfigReady, openConfigDialog, setAngleNodeId, setConnections, setDialogNodeId, setNodes, setRunningNodeId, setSelectedNodeIds, startGenerationRequest, t],
    );

    const handleGenerateNode = useCallback(
        async (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => {
            const sourceNode = nodesRef.current.find((node) => node.id === nodeId);
            const generationConfig = buildGenerationConfig(effectiveConfig, sourceNode, mode);
            if (mode === "video") {
                const modelInfo = useConfigStore.getState().serverModels.find((item) => item.id === modelOptionName(generationConfig.model));
                const context = buildNodeGenerationContext(nodeId, nodesRef.current, connectionsRef.current, prompt);
                const notice = videoReferenceNotice(modelInfo, context);
                if (notice?.exceeded) {
                    message.warning(`${notice.text}，请调整素材后再生成`);
                    return;
                }
            }
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }

            const builtinPanel = sourceNode ? getNodeDefinition(sourceNode.type)?.useBuiltinPanel : undefined;
            if (sourceNode && builtinPanel?.writeBackToSelf && builtinPanel.mode === "image") {
                const scene = prompt.trim();
                if (!scene) return;
                setRunningNodeId(nodeId);
                const controller = startGenerationRequest(nodeId, nodeId, nodeId);
                setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, prompt: scene, status: NODE_STATUS_LOADING, errorDetails: undefined } } : node)));
                try {
                    const fullPrompt = (builtinPanel.promptPrefix || "") + scene;
                    const context = await hydrateNodeGenerationContext(buildNodeGenerationContext(nodeId, nodesRef.current, connectionsRef.current, fullPrompt));
                    const refs = context.referenceImages;
                    const image = refs.length
                        ? await requestEdit({ ...generationConfig, count: "1" }, context.prompt, refs, generationAccountOptions(controller.signal, generationConfig)).then((items) => items[0])
                        : await requestGeneration({ ...generationConfig, count: "1" }, context.prompt, generationAccountOptions(controller.signal, generationConfig)).then((items) => items[0]);
                    const uploaded = await uploadImage(image.dataUrl, { signal: controller.signal, expectedOwner: generationOwnersRef.current.owner(controller.signal) });
                    setNodes((prev) =>
                        isGenerationAccountCurrent(controller.signal)
                            ? prev.map((node) =>
                                  node.id === nodeId ? { ...node, metadata: { ...node.metadata, ...imageMetadata(uploaded), prompt: scene, model: generationConfig.model, status: NODE_STATUS_SUCCESS, errorDetails: undefined } } : node,
                              )
                            : prev,
                    );
                    if (isGenerationAccountCurrent(controller.signal)) setDialogNodeId(null);
                } catch (error) {
                    if (!isGenerationCanceled(error) && isGenerationAccountCurrent(controller.signal)) {
                        const errorDetails = error instanceof Error ? error.message : t("canvas.projectPage.generationFailed");
                        message.error(errorDetails);
                        setNodes((prev) =>
                            isGenerationAccountCurrent(controller.signal)
                                ? prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails } } : node))
                                : prev,
                        );
                    }
                } finally {
                    finishGenerationRequest(nodeId, controller);
                    setRunningNodeId((current) => (isGenerationAccountOwner(controller.signal) && current === nodeId ? null : current));
                }
                return;
            }

            setRunningNodeId(nodeId);
            const overwriteExisting = effectiveConfig.nodeRegenerateBehavior === "overwrite";
            const runController = startGenerationRequest(nodeId, nodeId, nodeId);
            const setOwnedNodes = (update: Parameters<typeof setNodes>[0]) => setNodes(guardGenerationUpdate(() => isGenerationAccountCurrent(runController.signal), update));
            const sourceTextContent = sourceNode?.type === CanvasNodeType.Text ? sourceNode.metadata?.content?.trim() || "" : "";
            const editingTextNode = mode === "text" && Boolean(sourceTextContent);
            let generationContext: Awaited<ReturnType<typeof hydrateNodeGenerationContext>>;
            try {
                generationContext = await hydrateNodeGenerationContext(
                    buildNodeGenerationContext(nodeId, nodesRef.current, connectionsRef.current, editingTextNode ? t("canvas.projectPage.editTextPrompt", { source: sourceTextContent, prompt }) : prompt),
                );
            } catch (error) {
                finishGenerationRequest(nodeId, runController);
                if (isGenerationAccountCurrent(runController.signal)) message.error(error instanceof Error ? error.message : t("canvas.projectPage.generationFailed"));
                setRunningNodeId((current) => (isGenerationAccountOwner(runController.signal) && current === nodeId ? null : current));
                return;
            }
            const effectivePrompt = generationContext.prompt.trim();
            if (!isGenerationAccountCurrent(runController.signal)) {
                finishGenerationRequest(nodeId, runController);
                setRunningNodeId((current) => (isGenerationAccountOwner(runController.signal) && current === nodeId ? null : current));
                return;
            }
            const markSourceStatus = sourceNode?.type !== CanvasNodeType.Image && !editingTextNode;
            if (!effectivePrompt && (mode === "text" || mode === "audio")) {
                finishGenerationRequest(nodeId, runController);
                setRunningNodeId(null);
                return;
            }
            let pendingChildIds: string[] = [];
            if (markSourceStatus) {
                setOwnedNodes((prev) =>
                    prev.map((node) =>
                        node.id === nodeId
                            ? { ...node, metadata: { ...node.metadata, ...(node.type === CanvasNodeType.Config ? {} : { prompt }), status: NODE_STATUS_LOADING, errorDetails: undefined } }
                            : node,
                    ),
                );
            }

            try {
                if (mode === "image") {
                    const count = getGenerationCount(generationConfig.count);
                    const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
                    const isImageNode = sourceNode?.type === CanvasNodeType.Image;
                    const isEmptyImageNode = isImageNode && !sourceNode?.metadata?.content;
                    const reuseImageNode = isImageNode && (overwriteExisting || isEmptyImageNode);
                    const sourceReference =
                        isImageNode && sourceNode?.metadata?.content && !overwriteExisting
                            ? [{ id: sourceNode.id, name: `${sourceNode.title || sourceNode.id}.png`, type: sourceNode.metadata.mimeType || "image/png", dataUrl: sourceNode.metadata.content, storageKey: sourceNode.metadata.storageKey }]
                            : [];
                    const referenceImages = [...new Map([...sourceReference, ...generationContext.referenceImages].map((image) => [image.id, image])).values()];
                    const generationType = referenceImages.length ? ("edit" as const) : ("generation" as const);
                    const generationMetadata = buildImageGenerationMetadata(generationType, generationConfig, count, referenceImages);
                    const parentConfig = NODE_DEFAULT_SIZE[isConfigNode ? CanvasNodeType.Config : isImageNode ? CanvasNodeType.Image : CanvasNodeType.Text];
                    const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
                    const parentPosition = sourceNode?.position || { x: 0, y: 0 };
                    const rootId = reuseImageNode ? nodeId : nanoid();
                    const imageIds = Array.from({ length: count }, () => nanoid());
                    pendingChildIds = [rootId];
                    const rootNode: CanvasNodeData = {
                        id: rootId,
                        type: CanvasNodeType.Image,
                        title: effectivePrompt.slice(0, 32) || "Generated Image",
                        position: {
                            x: reuseImageNode ? parentPosition.x : parentPosition.x + parentConfig.width + 96,
                            y: parentPosition.y + parentConfig.height / 2 - imageConfig.height / 2,
                        },
                        width: reuseImageNode ? sourceNode?.width || imageConfig.width : imageConfig.width,
                        height: reuseImageNode ? sourceNode?.height || imageConfig.height : imageConfig.height,
                        metadata: {
                            prompt: effectivePrompt,
                            status: NODE_STATUS_LOADING,
                            images: imageIds.map((id) => ({ id, status: NODE_STATUS_LOADING, content: "", naturalWidth: 0, naturalHeight: 0, bytes: 0, mimeType: "" })),
                            primaryImageId: undefined,
                            ...generationMetadata,
                        },
                    };

                    setOwnedNodes((prev) => [
                        ...prev.map((node) =>
                            node.id === nodeId
                                ? isConfigNode
                                    ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_LOADING, errorDetails: undefined } }
                                    : reuseImageNode
                                      ? {
                                            ...node,
                                            position: rootNode.position,
                                            width: rootNode.width,
                                            height: rootNode.height,
                                            title: rootNode.title,
                                            metadata: { ...node.metadata, ...rootNode.metadata, content: undefined, storageKey: undefined, naturalWidth: undefined, naturalHeight: undefined, bytes: undefined, mimeType: undefined, errorDetails: undefined },
                                        }
                                      : isImageNode
                                        ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined } }
                                        : { ...node, type: CanvasNodeType.Text, title: prompt.slice(0, 32) || "Prompt", width: parentConfig.width, height: parentConfig.height, metadata: { ...node.metadata, content: prompt, prompt, status: NODE_STATUS_SUCCESS, fontSize: 14, errorDetails: undefined } }
                                : node,
                        ),
                        ...(reuseImageNode ? [] : [rootNode]),
                    ]);
                    if (!reuseImageNode) setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: rootId }]);
                    setSelectedNodeIds(new Set([nodeId]));
                    setSelectedConnectionId(null);
                    setDialogNodeId(nodeId);

                    const controller = rootId === nodeId ? runController : startGenerationRequest(rootId, nodeId, nodeId, runController);
                    let hasSuccess = false;
                    let hasFailure = false;
                    let firstError = "";
                    await Promise.all(
                        imageIds.map(async (imageId) => {
                            try {
                                const image = referenceImages.length
                                    ? await requestEdit({ ...generationConfig, count: "1" }, effectivePrompt, referenceImages, generationAccountOptions(controller.signal, generationConfig)).then((items) => items[0])
                                    : await requestGeneration({ ...generationConfig, count: "1" }, effectivePrompt, generationAccountOptions(controller.signal, generationConfig)).then((items) => items[0]);
                                const uploaded = await uploadImage(image.dataUrl, { signal: controller.signal, expectedOwner: generationOwnersRef.current.owner(controller.signal) });
                                const imageSize = fitNodeSize(uploaded.width, uploaded.height, imageConfig.width, imageConfig.height);
                                const item: CanvasNodeImage = { id: imageId, status: NODE_STATUS_SUCCESS, content: uploaded.url, storageKey: uploaded.storageKey, naturalWidth: uploaded.width, naturalHeight: uploaded.height, bytes: uploaded.bytes, mimeType: uploaded.mimeType };
                                setOwnedNodes((prev) =>
                                    prev.map((node) => {
                                        if (node.id !== rootId) return node;
                                        const images = node.metadata?.images?.map((img) => (img.id === imageId ? item : img)) || [];
                                        if (node.metadata?.primaryImageId) return { ...node, metadata: { ...node.metadata, images } };
                                        const center = { x: node.position.x + node.width / 2, y: node.position.y + node.height / 2 };
                                        return {
                                            ...node,
                                            position: { x: center.x - imageSize.width / 2, y: center.y - imageSize.height / 2 },
                                            ...imageSize,
                                            metadata: { ...node.metadata, content: item.content, storageKey: item.storageKey, naturalWidth: item.naturalWidth, naturalHeight: item.naturalHeight, bytes: item.bytes, mimeType: item.mimeType, images, primaryImageId: imageId },
                                        };
                                    }),
                                );
                                hasSuccess = true;
                                if (isConfigNode) setOwnedNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined } } : node)));
                                return true;
                            } catch (error) {
                                if (isGenerationCanceled(error)) return false;
                                const errorDetails = error instanceof Error ? error.message : t("canvas.projectPage.generationFailed");
                                if (!firstError) firstError = errorDetails;
                                hasFailure = true;
                                setOwnedNodes((prev) => prev.map((node) => (node.id === rootId ? { ...node, metadata: { ...node.metadata, images: node.metadata?.images?.map((image) => (image.id === imageId ? { ...image, status: NODE_STATUS_ERROR, errorDetails } : image)) } } : node)));
                            }
                            return false;
                        }),
                    );
                    if (rootId !== nodeId) finishGenerationRequest(rootId, controller);
                    if (!isGenerationAccountOwner(controller.signal)) return;
                    if (controller.signal.aborted) {
                        setOwnedNodes((prev) => prev.map((node) => (node.id === nodeId && isConfigNode && node.metadata?.status === NODE_STATUS_LOADING ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_IDLE, errorDetails: undefined } } : node)));
                        return;
                    }
                    if (hasFailure) {
                        message.error(hasSuccess ? t("canvas.projectPage.partialFailed") : firstError || t("canvas.projectPage.generationFailed"));
                    }
                    setOwnedNodes((prev) =>
                        prev.map((node) =>
                            node.id === nodeId && isConfigNode
                                ? { ...node, metadata: { ...node.metadata, status: hasSuccess ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: hasSuccess ? undefined : t("canvas.projectPage.generationFailed") } }
                                : node.id === rootId
                                  ? { ...node, metadata: { ...node.metadata, status: hasSuccess ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: hasSuccess ? undefined : t("canvas.projectPage.allFailed") } }
                                  : node,
                        ),
                    );
                    return;
                }

                if (mode === "video") {
                    const spec = nodeSizeFromRatio(generationConfig.size, NODE_DEFAULT_SIZE[CanvasNodeType.Video].width, NODE_DEFAULT_SIZE[CanvasNodeType.Video].height) || NODE_DEFAULT_SIZE[CanvasNodeType.Video];
                    const isEmptyVideoNode = sourceNode?.type === CanvasNodeType.Video && !sourceNode.metadata?.content;
                    const reuseVideoNode = sourceNode?.type === CanvasNodeType.Video && (overwriteExisting || isEmptyVideoNode);
                    const videoId = reuseVideoNode ? nodeId : nanoid();
                    const parent = sourceNode?.position || { x: 0, y: 0 };
                    const videoNode: CanvasNodeData = {
                        id: videoId,
                        type: CanvasNodeType.Video,
                        title: effectivePrompt.slice(0, 32) || "Generated Video",
                        position: reuseVideoNode ? sourceNode.position : { x: parent.x + (sourceNode?.width || spec.width) + 96, y: parent.y },
                        width: reuseVideoNode ? sourceNode.width : spec.width,
                        height: reuseVideoNode ? sourceNode.height : spec.height,
                        metadata: {
                            prompt: effectivePrompt,
                            status: NODE_STATUS_LOADING,
                            model: generationConfig.model,
                            size: generationConfig.size,
                            seconds: generationConfig.videoSeconds,
                            vquality: generationConfig.vquality,
                            generateAudio: generationConfig.videoGenerateAudio,
                            watermark: generationConfig.videoWatermark,
                            videoMode: generationConfig.videoMode,
                            videoRouteId: generationConfig.videoRouteId,
                            references: generationReferenceUrls(generationContext),
                        },
                    };
                    pendingChildIds = [videoId];
                    setOwnedNodes((prev) =>
                        reuseVideoNode
                            ? prev.map((node) => (node.id === nodeId ? { ...node, ...videoNode } : node))
                            : [...prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } } : node)), videoNode],
                    );
                    if (!reuseVideoNode) setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: videoId }]);
                    const controller = startGenerationRequest(videoId, nodeId, nodeId, runController);
                    try {
                        await completeVideoNodeTask(
                            videoId,
                            generationConfig,
                            effectivePrompt,
                            generationContext.referenceImages,
                            controller.signal,
                            {
                                size: generationConfig.size,
                                seconds: generationConfig.videoSeconds,
                                vquality: generationConfig.vquality,
                                generateAudio: generationConfig.videoGenerateAudio,
                                watermark: generationConfig.videoWatermark,
                                videoMode: generationConfig.videoMode,
                                videoRouteId: generationConfig.videoRouteId,
                                references: generationReferenceUrls(generationContext),
                            },
                            generationContext.referenceVideos,
                            generationContext.referenceAudios,
                        );
                    } finally {
                        finishGenerationRequest(videoId, controller);
                    }
                    return;
                }

                if (mode === "audio") {
                    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                    const isEmptyAudioNode = sourceNode?.type === CanvasNodeType.Audio && !sourceNode.metadata?.content;
                    const reuseAudioNode = sourceNode?.type === CanvasNodeType.Audio && (overwriteExisting || isEmptyAudioNode);
                    const audioId = reuseAudioNode ? nodeId : nanoid();
                    const parent = sourceNode?.position || { x: 0, y: 0 };
                    const audioNode: CanvasNodeData = {
                        id: audioId,
                        type: CanvasNodeType.Audio,
                        title: effectivePrompt.slice(0, 32) || "Generated Audio",
                        position: reuseAudioNode ? sourceNode.position : { x: parent.x + (sourceNode?.width || spec.width) + 96, y: parent.y + ((sourceNode?.height || spec.height) - spec.height) / 2 },
                        width: reuseAudioNode ? sourceNode.width : spec.width,
                        height: reuseAudioNode ? sourceNode.height : spec.height,
                        metadata: { prompt: effectivePrompt, status: NODE_STATUS_LOADING, ...buildAudioGenerationMetadata(generationConfig) },
                    };
                    pendingChildIds = [audioId];
                    setOwnedNodes((prev) =>
                        reuseAudioNode
                            ? prev.map((node) => (node.id === nodeId ? { ...node, ...audioNode } : node))
                            : [...prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } } : node)), audioNode],
                    );
                    if (!reuseAudioNode) setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: audioId }]);
                    const controller = startGenerationRequest(audioId, nodeId, nodeId, runController);
                    try {
                        const requestId = crypto.randomUUID();
                        setOwnedNodes((prev) => prev.map((item) => (item.id === audioId ? { ...item, metadata: { ...item.metadata, audioRequestId: requestId } } : item)));
                        const audio = await requestStoredAudio(generationConfig, effectivePrompt, { ...generationAccountOptions(controller.signal, generationConfig), requestId });
                        setOwnedNodes((prev) => prev.map((node) => (node.id === audioId ? { ...node, metadata: { ...node.metadata, ...audioMetadata(audio), prompt: effectivePrompt, ...buildAudioGenerationMetadata(generationConfig) } } : node)));
                    } finally {
                        finishGenerationRequest(audioId, controller);
                    }
                    return;
                }

                const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
                const textCount = getGenerationCount(String(sourceNode?.metadata?.textCount || 1));
                const parentConfig = NODE_DEFAULT_SIZE[isConfigNode ? CanvasNodeType.Config : CanvasNodeType.Text];
                const textConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
                const parentPosition = sourceNode?.position || { x: 0, y: 0 };
                const isEmptyTextNode = sourceNode?.type === CanvasNodeType.Text && !sourceTextContent;
                const reuseTextNode = sourceNode?.type === CanvasNodeType.Text && (overwriteExisting || isEmptyTextNode);
                const rootId = reuseTextNode ? nodeId : nanoid();
                const textIds = Array.from({ length: textCount }, () => nanoid());
                const rootNode: CanvasNodeData = {
                    id: rootId,
                    type: CanvasNodeType.Text,
                    title: effectivePrompt.slice(0, 32) || "Generated Text",
                    position: reuseTextNode ? sourceNode.position : { x: parentPosition.x + parentConfig.width + 96, y: parentPosition.y + parentConfig.height / 2 - textConfig.height / 2 },
                    width: reuseTextNode ? sourceNode.width : textConfig.width,
                    height: reuseTextNode ? sourceNode.height : textConfig.height,
                    metadata: {
                        prompt: effectivePrompt,
                        status: NODE_STATUS_LOADING,
                        fontSize: 14,
                        model: generationConfig.model,
                        reasoningEffort: generationConfig.reasoningEffort,
                        textCount,
                        texts: textIds.map((id) => ({ id, status: NODE_STATUS_LOADING, content: "" })),
                        primaryTextId: textIds[0],
                    },
                };
                pendingChildIds = [rootId];
                setOwnedNodes((prev) =>
                    reuseTextNode
                        ? prev.map((node) => (node.id === nodeId ? { ...node, ...rootNode } : node))
                        : [...prev.map((node) => (node.id === nodeId && isConfigNode ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_LOADING, errorDetails: undefined } } : node)), rootNode],
                );
                if (!reuseTextNode) setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: rootId }]);
                setSelectedNodeIds(new Set([nodeId]));
                setSelectedConnectionId(null);
                setDialogNodeId(nodeId);

                const controller = rootId === nodeId ? runController : startGenerationRequest(rootId, nodeId, nodeId, runController);
                const results = await Promise.all(
                    textIds.map(async (textId): Promise<CanvasNodeText | null> => {
                        let streamed = "";
                        try {
                            const answer = await requestImageQuestion(
                                generationConfig,
                                buildNodeResponseMessages({ ...generationContext, prompt: effectivePrompt }),
                                (text) => {
                                    streamed = text;
                                    setOwnedNodes((prev) =>
                                        prev.map((node) =>
                                            node.id === rootId
                                                ? {
                                                      ...node,
                                                      metadata: {
                                                          ...node.metadata,
                                                          ...(node.metadata?.primaryTextId === textId ? { content: text } : {}),
                                                          texts: node.metadata?.texts?.map((item) => (item.id === textId ? { ...item, content: text } : item)),
                                                      },
                                                  }
                                                : node,
                                        ),
                                    );
                                },
                                generationAccountOptions(controller.signal, generationConfig),
                            );
                            const content = answer || streamed;
                            setOwnedNodes((prev) =>
                                prev.map((node) =>
                                    node.id === rootId
                                        ? {
                                              ...node,
                                              metadata: {
                                                  ...node.metadata,
                                                  ...(node.metadata?.primaryTextId === textId ? { content } : {}),
                                                  texts: node.metadata?.texts?.map((item) => (item.id === textId ? { ...item, content, status: NODE_STATUS_SUCCESS } : item)),
                                              },
                                          }
                                        : node,
                                ),
                            );
                            return { id: textId, status: NODE_STATUS_SUCCESS, content } satisfies CanvasNodeText;
                        } catch (error) {
                            if (isGenerationCanceled(error)) return null;
                            const errorDetails = error instanceof Error ? error.message : t("canvas.projectPage.generationFailed");
                            setOwnedNodes((prev) => prev.map((node) => (node.id === rootId ? { ...node, metadata: { ...node.metadata, texts: node.metadata?.texts?.map((item) => (item.id === textId ? { ...item, status: NODE_STATUS_ERROR, errorDetails } : item)) } } : node)));
                            return { id: textId, status: NODE_STATUS_ERROR, content: "", errorDetails } satisfies CanvasNodeText;
                        }
                    }),
                );
                if (rootId !== nodeId) finishGenerationRequest(rootId, controller);
                if (!isGenerationAccountCurrent(controller.signal)) return;
                const completedTexts = results.flatMap((item) => (item?.status === NODE_STATUS_SUCCESS ? [item] : []));
                const failedTexts = results.filter((item) => item?.status === NODE_STATUS_ERROR);
                const firstText = completedTexts[0];
                if (completedTexts.length <= 1) setExpandedBatchNodeIds((current) => new Set([...current].filter((id) => id !== rootId)));
                if (failedTexts.length) message.error(firstText ? t("canvas.projectPage.partialTextFailed") : failedTexts[0]?.errorDetails || t("canvas.projectPage.generationFailed"));
                setOwnedNodes((prev) =>
                    prev.map((node) => {
                        if (node.id === rootId) {
                            const primaryText = completedTexts.find((text) => text.id === node.metadata?.primaryTextId) || firstText;
                            return {
                                ...node,
                                metadata: {
                                    ...node.metadata,
                                    content: primaryText?.content || "",
                                    texts: completedTexts,
                                    primaryTextId: primaryText?.id,
                                    status: primaryText ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR,
                                    errorDetails: primaryText ? undefined : t("canvas.projectPage.generationFailed"),
                                },
                            };
                        }
                        return node.id === nodeId && isConfigNode ? { ...node, metadata: { ...node.metadata, status: firstText ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: firstText ? undefined : t("canvas.projectPage.generationFailed") } } : node;
                    }),
                );
            } catch (error) {
                if (isGenerationCanceled(error) || !isGenerationAccountCurrent(runController.signal)) return;
                const errorDetails = error instanceof Error ? error.message : t("canvas.projectPage.generationFailed");
                message.error(errorDetails);
                setOwnedNodes((prev) =>
                    prev.map((node) =>
                        node.id === nodeId || pendingChildIds.includes(node.id)
                            ? node.id === nodeId && !markSourceStatus
                                ? node
                                : {
                                      ...node,
                                      metadata: {
                                          ...node.metadata,
                                          status: NODE_STATUS_ERROR,
                                          errorDetails,
                                          ...(isVideoTaskFailed(error) && node.type === CanvasNodeType.Video ? { videoTaskId: undefined } : {}),
                                      },
                                  }
                            : node,
                    ),
                );
            } finally {
                finishGenerationRequest(nodeId, runController);
                setRunningNodeId((current) => (isGenerationAccountOwner(runController.signal) && current === nodeId ? null : current));
            }
        },
        [completeVideoNodeTask, connectionsRef, effectiveConfig, finishGenerationRequest, isAiConfigReady, message, nodesRef, openConfigDialog, setConnections, setDialogNodeId, setExpandedBatchNodeIds, setNodes, setRunningNodeId, setSelectedConnectionId, setSelectedNodeIds, startGenerationRequest, t],
    );

    useEffect(() => {
        generateNodeRef.current = handleGenerateNode;
    }, [generateNodeRef, handleGenerateNode]);

    const handleRetryNode = useCallback(
        async (node: CanvasNodeData, imageId?: string) => {
            if (hasResumableVideoTask(node)) {
                await pollVideoNodeTask(node);
                return;
            }
            const sourceNode = findRetrySourceNode(node.id, nodesRef.current, connectionsRef.current) || node;
            const savedImageMetadata = node.type === CanvasNodeType.Image ? node.metadata : undefined;
            const hasSavedImageMetadata = Boolean(savedImageMetadata?.generationType);
            const generationConfig =
                hasSavedImageMetadata && savedImageMetadata
                    ? {
                          ...effectiveConfig,
                          model: savedImageMetadata.model || effectiveConfig.imageModel || effectiveConfig.model,
                          quality: savedImageMetadata.quality || effectiveConfig.quality,
                          size: savedImageMetadata.size || effectiveConfig.size,
                          background: savedImageMetadata.background ?? effectiveConfig.background,
                          count: "1",
                      }
                    : { ...buildGenerationConfig(effectiveConfig, sourceNode, node.type === CanvasNodeType.Text ? "text" : node.type === CanvasNodeType.Video ? "video" : node.type === CanvasNodeType.Audio ? "audio" : "image"), count: "1" };
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }

            const retryAuth = useAuthStore.getState();
            const retryOwner = retryAuth.user?.id ?? null;
            const isRetryOwner = () => {
                const auth = useAuthStore.getState();
                return Boolean(retryOwner && auth.ready && auth.user?.id === retryOwner && auth.sessionEpoch === retryAuth.sessionEpoch);
            };
            if (!isRetryOwner()) return;
            const context = hasSavedImageMetadata ? null : await hydrateNodeGenerationContext(buildNodeGenerationContext(sourceNode.id, nodesRef.current, connectionsRef.current, sourceNode.metadata?.prompt || node.metadata?.prompt || ""));
            if (!isRetryOwner()) return;
            const prompt = (savedImageMetadata?.prompt || context?.prompt || "").trim();
            if (!prompt) {
                message.warning(t("canvas.projectPage.retryPromptMissing"));
                return;
            }
            const generationType = savedImageMetadata?.generationType;
            const useReferenceImages = generationType ? generationType === "edit" : Boolean(context?.referenceImages.length);
            const retryReferenceImages =
                hasSavedImageMetadata && savedImageMetadata ? await resolveMetadataReferences(savedImageMetadata) : useReferenceImages ? (context?.referenceImages.length ? context.referenceImages : sourceNodeReferenceImages(sourceNode)) : [];
            if (!isRetryOwner()) return;
            if (useReferenceImages && !retryReferenceImages) {
                message.error(t("canvas.projectPage.referenceMissing"));
                setNodes((prev) =>
                    isRetryOwner()
                        ? prev.map((item) =>
                              item.id === node.id
                                  ? {
                                        ...item,
                                        metadata: {
                                            ...item.metadata,
                                            status: item.metadata?.content ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR,
                                            errorDetails: item.metadata?.content ? undefined : t("canvas.projectPage.referenceMissing"),
                                            images: item.metadata?.images?.map((image) => (image.id === imageId ? { ...image, status: NODE_STATUS_ERROR, errorDetails: t("canvas.projectPage.referenceMissing") } : image)),
                                        },
                                    }
                                  : item,
                          )
                        : prev,
                );
                return;
            }
            const retryImages = retryReferenceImages || [];

            setRunningNodeId(node.id);
            setNodes((prev) =>
                isRetryOwner()
                    ? prev.map((item) =>
                          item.id === node.id
                              ? {
                                    ...item,
                                    metadata: {
                                        ...item.metadata,
                                        status: NODE_STATUS_LOADING,
                                        errorDetails: undefined,
                                        images: item.metadata?.images?.map((image) => (image.id === imageId ? { ...image, status: NODE_STATUS_LOADING, errorDetails: undefined } : image)),
                                    },
                                }
                              : item,
                      )
                    : prev,
            );
            const controller = startGenerationRequest(node.id, sourceNode.id, node.id);
            const setOwnedNodes = (update: Parameters<typeof setNodes>[0]) => setNodes(guardGenerationUpdate(() => isGenerationAccountCurrent(controller.signal), update));

            try {
                if (node.type === CanvasNodeType.Text) {
                    if (!context) return;
                    let streamed = "";
                    const answer = await requestImageQuestion(
                        generationConfig,
                        buildNodeResponseMessages({ ...context, prompt }),
                        (text) => {
                            streamed = text;
                            setOwnedNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, type: CanvasNodeType.Text, metadata: { ...item.metadata, content: text, status: NODE_STATUS_LOADING } } : item)));
                        },
                        generationAccountOptions(controller.signal, generationConfig),
                    );
                    setOwnedNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, type: CanvasNodeType.Text, metadata: { ...item.metadata, content: answer || streamed, prompt, status: NODE_STATUS_SUCCESS } } : item)));
                    return;
                }
                if (node.type === CanvasNodeType.Video) {
                    await completeVideoNodeTask(
                        node.id,
                        generationConfig,
                        prompt,
                        retryImages,
                        controller.signal,
                        {
                            size: generationConfig.size,
                            seconds: generationConfig.videoSeconds,
                            vquality: generationConfig.vquality,
                            generateAudio: generationConfig.videoGenerateAudio,
                            watermark: generationConfig.videoWatermark,
                            videoMode: generationConfig.videoMode,
                            videoRouteId: generationConfig.videoRouteId,
                        },
                        context?.referenceVideos || [],
                        context?.referenceAudios || [],
                    );
                    return;
                }
                if (node.type === CanvasNodeType.Audio) {
                    const requestId = String(node.metadata?.audioRequestId || crypto.randomUUID());
                    setOwnedNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, audioRequestId: requestId } } : item)));
                    const audio = await requestStoredAudio(generationConfig, prompt, { ...generationAccountOptions(controller.signal, generationConfig), requestId });
                    setOwnedNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, ...audioMetadata(audio), prompt, ...buildAudioGenerationMetadata(generationConfig) } } : item)));
                    return;
                }

                const image = useReferenceImages
                    ? await requestEdit(generationConfig, prompt, retryImages, generationAccountOptions(controller.signal, generationConfig)).then((items) => items[0])
                    : await requestGeneration(generationConfig, prompt, generationAccountOptions(controller.signal, generationConfig)).then((items) => items[0]);
                const uploadedImage = await uploadImage(image.dataUrl, { signal: controller.signal, expectedOwner: generationOwnersRef.current.owner(controller.signal) });
                const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
                const retryImage: CanvasNodeImage = {
                    id: imageId || node.metadata?.primaryImageId || nanoid(),
                    status: NODE_STATUS_SUCCESS,
                    content: uploadedImage.url,
                    storageKey: uploadedImage.storageKey,
                    naturalWidth: uploadedImage.width,
                    naturalHeight: uploadedImage.height,
                    bytes: uploadedImage.bytes,
                    mimeType: uploadedImage.mimeType,
                };
                const generationMetadata = savedImageMetadata?.generationType
                    ? {
                          generationType: savedImageMetadata.generationType,
                          model: generationConfig.model,
                          size: generationConfig.size,
                          quality: generationConfig.quality,
                          ...(generationConfig.background ? { background: generationConfig.background } : {}),
                          count: savedImageMetadata.count || 1,
                          references: savedImageMetadata.references,
                      }
                    : buildImageGenerationMetadata(useReferenceImages ? "edit" : "generation", generationConfig, 1, retryImages);
                setOwnedNodes((prev) =>
                    prev.map((item) => {
                        if (item.id !== node.id) return item;
                        const makePrimary = !imageId || !item.metadata?.content;
                        const edge = imageId ? Math.max(item.width, item.height) : 0;
                        const imageSize =
                            imageId && item.metadata?.freeResize
                                ? { width: item.width, height: item.height }
                                : imageId
                                  ? fitNodeSize(uploadedImage.width, uploadedImage.height, edge, edge)
                                  : fitNodeSize(uploadedImage.width, uploadedImage.height, imageConfig.width, imageConfig.height);
                        return {
                            ...item,
                            type: CanvasNodeType.Image,
                            ...(makePrimary ? { width: imageSize.width, height: imageSize.height, ...(imageId ? { position: { x: item.position.x + item.width / 2 - imageSize.width / 2, y: item.position.y + item.height / 2 - imageSize.height / 2 } } : {}) } : {}),
                            metadata: {
                                ...item.metadata,
                                ...(makePrimary ? imageMetadata(uploadedImage) : { status: NODE_STATUS_SUCCESS }),
                                images: item.metadata?.images?.map((current) => (current.id === retryImage.id ? retryImage : current)),
                                primaryImageId: makePrimary ? retryImage.id : item.metadata?.primaryImageId,
                                prompt,
                                ...generationMetadata,
                            },
                        };
                    }),
                );
            } catch (error) {
                if (isGenerationCanceled(error) || !isGenerationAccountCurrent(controller.signal)) return;
                const errorDetails = error instanceof Error ? error.message : t("canvas.projectPage.generationFailed");
                message.error(errorDetails);
                setOwnedNodes((prev) =>
                    prev.map((item) =>
                        item.id === node.id
                            ? {
                                  ...item,
                                  metadata: {
                                      ...item.metadata,
                                      status: node.type === CanvasNodeType.Text ? NODE_STATUS_ERROR : item.metadata?.content ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR,
                                      errorDetails: node.type === CanvasNodeType.Text ? errorDetails : item.metadata?.content ? undefined : errorDetails,
                                      images: item.metadata?.images?.map((image) => (image.id === imageId ? { ...image, status: NODE_STATUS_ERROR, errorDetails } : image)),
                                      ...(isVideoTaskFailed(error) && item.type === CanvasNodeType.Video ? { videoTaskId: undefined } : {}),
                                  },
                              }
                            : item,
                    ),
                );
            } finally {
                finishGenerationRequest(node.id, controller);
                setRunningNodeId((current) => (isGenerationAccountOwner(controller.signal) && current === node.id ? null : current));
            }
        },
        [completeVideoNodeTask, connectionsRef, effectiveConfig, finishGenerationRequest, isAiConfigReady, message, nodesRef, openConfigDialog, pollVideoNodeTask, setNodes, setRunningNodeId, startGenerationRequest, t],
    );

    const deleteBatchImage = useCallback(
        (nodeId: string, imageId: string) => {
            const node = nodesRef.current.find((item) => item.id === nodeId);
            if ((node?.metadata?.images?.length || 0) <= 2) setExpandedBatchNodeIds((current) => new Set([...current].filter((id) => id !== nodeId)));
            setNodes((prev) =>
                prev.map((item) => {
                    if (item.id !== nodeId) return item;
                    const images = item.metadata?.images?.filter((image) => image.id !== imageId) || [];
                    return { ...item, metadata: { ...item.metadata, images, count: images.length, primaryImageId: item.metadata?.primaryImageId === imageId ? images[0]?.id : item.metadata?.primaryImageId } };
                }),
            );
        },
        [nodesRef, setExpandedBatchNodeIds, setNodes],
    );

    const retryBatchImage = useCallback((node: CanvasNodeData, imageId: string) => void handleRetryNode(node, imageId), [handleRetryNode]);

    return {
        pollVideoNodeTask,
        stopGenerationByRunningId,
        confirmStopGeneration,
        cropImageNode,
        splitImageNode,
        maskEditImageNode,
        upscaleImageNode,
        generateAngleNode,
        handleGenerateNode,
        handleRetryNode,
        deleteBatchImage,
        retryBatchImage,
        buildNodeGenerationInputs,
    };
}
