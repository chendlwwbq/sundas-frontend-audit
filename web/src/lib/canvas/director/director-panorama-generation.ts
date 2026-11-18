import { nanoid } from "nanoid";

import { requestEdit } from "@/services/api/image";
import { uploadImage, type UploadedImage } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";

export const DIRECTOR_PANORAMA_PROMPT =
    "以参考图中的主体、材质和光影为基础，将环境扩展成完整的 360 度等距柱状全景图。输出 2:1 比例的连续单幅画面，左右边缘自然无缝衔接，保持真实空间尺度；不要拼贴、边框、文字、水印或拍摄设备。";

type DirectorPanoramaGenerationInput = {
    file: File;
    config: AiConfig;
    sceneId: string;
    projectId?: string;
    signal?: AbortSignal;
    onTaskUpdate?: (task: { progress?: number }) => void;
};

export type DirectorPanoramaResult = { id: string; name: string; url: string; storageKey: string; width: number; height: number };

/** 全景图固定按 2:1 出图；这里只挑一个可用的图片模型，不做尺寸回落。 */
export function selectDirectorPanoramaModel(config: AiConfig): string {
    return config.imageModel || config.model || "";
}

function readImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth || 0, height: image.naturalHeight || 0 });
        image.onerror = () => resolve({ width: 0, height: 0 });
        image.src = dataUrl;
    });
}

/**
 * AI 全景图（sundas 版）。
 *
 * BeefTV 走的是自己的「后台生成任务 + 任务中心 + 资产物化」三段式；
 * sundas 的图片链路是同步的 `requestEdit`（内部已处理渠道、插件脚本、计费钱包），
 * 所以这里收敛成一次图生图：上传参考图 → requestEdit(2:1) → 写入素材库。
 */
export async function generateDirectorPanorama(input: DirectorPanoramaGenerationInput): Promise<DirectorPanoramaResult> {
    const { file, config, sceneId, signal, onTaskUpdate } = input;
    const assertCurrent = () => {
        if (signal?.aborted) throw new DOMException("生成会话已结束", "AbortError");
    };

    assertCurrent();
    if (!file.type.startsWith("image/")) throw new Error("请选择图片文件");
    const model = selectDirectorPanoramaModel(config);
    if (!model) throw new Error("请先在模型设置中选择可用的图片模型");

    const source: UploadedImage = await uploadImage(file, { signal });
    assertCurrent();

    const reference: ReferenceImage = {
        id: nanoid(),
        name: file.name,
        type: source.mimeType,
        dataUrl: source.url,
        storageKey: source.storageKey,
        width: source.width,
        height: source.height,
        bytes: source.bytes,
    };

    onTaskUpdate?.({ progress: undefined });
    const images = await requestEdit({ ...config, model, size: "2:1", count: "1" }, DIRECTOR_PANORAMA_PROMPT, [reference], { signal });
    assertCurrent();

    const first = images[0];
    if (!first?.dataUrl) throw new Error("图片任务完成，但没有返回全景图");
    const { width, height } = await readImageSize(first.dataUrl);
    assertCurrent();

    const name = `AI 全景图 · ${file.name}`;
    const id = useAssetStore.getState().addAsset({
        kind: "image",
        title: name,
        coverUrl: first.dataUrl,
        tags: ["全景图", "AI生成"],
        source: "导演台",
        data: { dataUrl: first.dataUrl, width, height, bytes: Math.round(first.dataUrl.length * 0.75), mimeType: "image/png" },
        metadata: { source: "director-panorama-ai", sceneId },
    });

    return { id, name, url: first.dataUrl, storageKey: "", width, height };
}

/**
 * 刷新后恢复未完成的全景图任务。
 *
 * BeefTV 用任务中心回捞；sundas 的生成是同步请求，页面刷新即中断，
 * 结果也已经落进素材库，因此没有需要恢复的远端任务，这里保持空实现以维持调用契约。
 */
export async function recoverDirectorPanoramaTasks(_projectId: string, _sceneId: string, _signal?: AbortSignal): Promise<number> {
    return 0;
}
