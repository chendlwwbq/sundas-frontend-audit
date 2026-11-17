import axios from "axios";
import { waitForVideoResult } from "./video-task-wait";
import { expectedAccountHeaders } from "./account-headers";
import { refreshGenerationWallet } from "./generation-wallet";
import { nanoid } from "nanoid";

import i18n from "@/i18n";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { dataUrlToFile, readFileAsDataUrl } from "@/lib/image-utils";
import { clampVideoSecondsToRange, computeVideoSize, inferVideoRatio, parseVideoResolution, videoSecondsRangeForDurations } from "@/lib/media-size";
import { getMediaBlob, InvalidMediaResponseError, resolveMediaUrl, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { imageToDataUrl } from "@/services/image-storage";
import { boolConfig, buildApiUrl, modelOptionName, resolveModelRequestConfig, resolveModelScript, useConfigStore, withLocalProxy, type AiConfig } from "@/stores/use-config-store";
import { runModelPlugin } from "./model-plugin";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

type VideoResponse = { id: string; status?: string; review?: boolean; statusMessage?: string; resultAvailable?: boolean | null; error?: string | { message?: string }; url?: string; result_url?: string; video_url?: string; content?: { video_url?: string; url?: string } | null };
type ApiVideoResponse = VideoResponse | { code?: number | string; data?: VideoResponse | null; msg?: string; message?: string; error?: { message?: string } };
type ApiEnvelope<T> = T | { code?: number | string; data?: T | null; msg?: string; message?: string; error?: { message?: string } };
type RequestOptions = { signal?: AbortSignal; expectedUserId?: string; surface?: "canvas" | "workbench"; onProgress?: (message: string) => void };
type VideoMediaOptions = RequestOptions & { videos?: ReferenceVideo[]; audios?: ReferenceAudio[]; clientTaskId?: string };
const apiText = (key: string, options?: Record<string, unknown>) => i18n.t(`apiErrors.${key}`, options);

export type VideoGenerationResult = { blob?: Blob; url?: string; mimeType?: string };
export type VideoGenerationTask = { id: string; provider: "openai" | "gemini" | "plugin"; model: string };
type GeminiInlineData = { bytesBase64Encoded: string; mimeType: string };
type GeminiVideoOperation = {
    name?: string;
    done?: boolean;
    error?: { message?: string };
    response?: { generateVideoResponse?: { generatedSamples?: Array<{ video?: { uri?: string } }> } };
};
export type VideoGenerationTaskState = { status: "pending"; review?: boolean; statusMessage?: string } | { status: "completed"; result: VideoGenerationResult } | { status: "failed"; error: string } | { status: "unavailable"; error: string };

/** Results for scripted (plugin) video models, which run their own create+poll in one shot at task creation. */
const pluginVideoResults = new Map<string, VideoGenerationResult>();

function aiApiUrl(config: AiConfig, path: string) {
    return buildApiUrl(config.baseUrl, path);
}

function aiHeaders(config: AiConfig, contentType?: string, expectedUserId?: string) {
    return {
        Authorization: `Bearer ${config.apiKey}`,
        ...expectedAccountHeaders(aiApiUrl(config, "/videos"), expectedUserId),
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

export async function requestVideoGeneration(config: AiConfig, prompt: string, references: ReferenceImage[] = [], options?: VideoMediaOptions): Promise<VideoGenerationResult> {
    return waitForVideoGenerationTask(config, await createVideoGenerationTask(config, prompt, references, options), options);
}

export async function waitForVideoGenerationTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationResult> {
    return waitForVideoResult(() => pollVideoGenerationTask(config, task, options), options?.signal);
}

export function isVideoTaskFailed(error: unknown) {
    return error instanceof Error && error.name === "VideoTaskFailed";
}

export function isVideoInsufficientCredits(error: unknown) {
    return error instanceof Error && error.name === "VideoInsufficientCredits";
}

export function isVideoSubmissionRejected(error: unknown) {
    return error instanceof Error && error.name === "VideoSubmissionRejected";
}


export async function createVideoGenerationTask(config: AiConfig, prompt: string, references: ReferenceImage[] = [], options?: VideoMediaOptions): Promise<VideoGenerationTask> {
    try { return await createVideoGenerationTaskInner(config, prompt, references, options); }
    finally { refreshGenerationWallet(options?.expectedUserId); }
}

async function createVideoGenerationTaskInner(config: AiConfig, prompt: string, references: ReferenceImage[] = [], options?: VideoMediaOptions): Promise<VideoGenerationTask> {
    const selectedModel = (config.model || config.videoModel).trim();
    const requestConfig = resolveModelRequestConfig(config, selectedModel);
    const script = resolveModelScript(config, selectedModel);
    if (script) return createPluginVideoTask(requestConfig, selectedModel, script, prompt, references, options);
    assertVideoConfig(requestConfig, requestConfig.model);
    return createOpenAIVideoTask(requestConfig, selectedModel, prompt, references, options);
}

export async function pollVideoGenerationTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    const state = await pollVideoGenerationTaskInner(config, task, options);
    if (state.status === 'pending' && state.statusMessage) options?.onProgress?.(state.statusMessage);
    if (state.status !== "pending") refreshGenerationWallet(options?.expectedUserId);
    return state;
}

async function pollVideoGenerationTaskInner(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    if (task.provider === "plugin") {
        const result = pluginVideoResults.get(task.id);
        return result ? { status: "completed", result } : { status: "failed", error: apiText("pluginVideoExpired") };
    }
    const requestConfig = resolveModelRequestConfig(config, task.model);
    assertVideoConfig(requestConfig, requestConfig.model);
    if (task.provider === "gemini") return pollGeminiVideoTask(requestConfig, task, options);
    return pollOpenAIVideoTask(requestConfig, task, options);
}

async function createPluginVideoTask(config: AiConfig, model: string, script: string, prompt: string, references: ReferenceImage[], options?: VideoMediaOptions): Promise<VideoGenerationTask> {
    if (!config.baseUrl.trim()) throw new Error(apiText("baseUrlRequired"));
    if (!config.apiKey.trim()) throw new Error(apiText("apiKeyRequired"));
    const refs = await Promise.all(references.map((image) => imageToDataUrl(image)));
    const videos = await Promise.all((options?.videos || []).map((video) => referenceMediaToFile(video, "ref.mp4", "invalidReferenceVideo", options)));
    const audios = await Promise.all((options?.audios || []).map((audio) => referenceMediaToFile(audio, "ref.mp3", "invalidReferenceAudio", options)));
    const result = videoPluginResult(
        await runModelPlugin({
            capability: "video",
            script,
            config,
            prompt,
            images: refs,
            videos,
            audios,
            params: {
                seconds: normalizeVideoSeconds(config.videoSeconds, model),
                size: normalizeVideoSize(config.size, config.vquality),
                resolution: normalizeVideoResolution(config.vquality),
                ratio: videoAspectRatio(config.size),
                generateAudio: boolConfig(config.videoGenerateAudio, true),
                watermark: boolConfig(config.videoWatermark, false),
                mode: resolveVideoMode(config.videoMode, refs.length),
            },
            signal: options?.signal,
        }),
    );
    const id = nanoid();
    pluginVideoResults.set(id, result);
    return { id, provider: "plugin", model };
}

function videoPluginResult(result: unknown): VideoGenerationResult {
    if (result instanceof Blob) return { blob: result };
    if (typeof result === "string") return { url: result, mimeType: "video/mp4" };
    if (result && typeof result === "object") {
        const record = result as Record<string, unknown>;
        if (record.blob instanceof Blob) return { blob: record.blob };
        const url = [record.url, record.video_url, record.result_url].find((value) => typeof value === "string" && value) as string | undefined;
        if (url) return { url, mimeType: "video/mp4" };
    }
    throw new Error(apiText("scriptNoVideo"));
}

export async function storeGeneratedVideo(result: VideoGenerationResult, options?: { expectedOwner?: string | null; signal?: AbortSignal }): Promise<UploadedFile> {
    if (result.blob) return uploadMediaFile(result.blob, "video", options);
    if (result.url) {
        try {
            return await uploadMediaFile(result.url, "video", options);
        } catch (error) {
            if (error instanceof InvalidMediaResponseError || (error instanceof Error && error.name === "AbortError")) throw error;
            return { url: result.url, storageKey: "", bytes: 0, mimeType: result.mimeType || "video/mp4" };
        }
    }
    throw new Error(apiText("noPlayableVideo"));
}

function mediaKeyFromUrl(value?: string) {
    if (!value) return "";
    const path = value.startsWith("http") ? (() => { try { return new URL(value).pathname; } catch { return ""; } })() : value.split(/[?#]/)[0];
    const marker = "/media/";
    const index = path.indexOf(marker);
    if (index < 0) return "";
    const key = decodeURIComponent(path.slice(index + marker.length));
    return key.startsWith("private/") || key.startsWith("upload/") ? key : "";
}

type PreparedReference = { file: File } | { key: string; name: string; mime: string };

/**
 * 参考视频/音频已经存在本站媒体库时只传对象键，由服务端直接取文件。
 * 旧做法是把文件整包下载回浏览器再塞进提交请求：手机上常见 100-200MB 的视频会让请求体翻倍，
 * 既超出 nginx 的请求体上限（直接 413），上行慢的手机还会在上传阶段超时或被系统回收标签页。
 */
async function prepareReferenceMedia(
    item: { name: string; type?: string; url?: string; storageKey?: string },
    fallbackName: string,
    errorKey: "invalidReferenceVideo" | "invalidReferenceAudio",
    options?: RequestOptions,
): Promise<PreparedReference> {
    const key = item.storageKey ? "" : mediaKeyFromUrl(item.url);
    if (key) return { key, name: key.split("/").pop() || item.name || fallbackName, mime: item.type || "application/octet-stream" };
    return { file: await referenceMediaToFile(item, fallbackName, errorKey, options) };
}

async function createOpenAIVideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], options?: VideoMediaOptions): Promise<VideoGenerationTask> {
    const prepare = async () => {
        const images: PreparedReference[] = await Promise.all(references.map(async (image) => {
            const key = mediaKeyFromUrl(image.url) || mediaKeyFromUrl(image.dataUrl);
            if (key) return { key, name: image.name, mime: image.type || "image/png" };
            return { file: await dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) }) };
        }));
        const videos = await Promise.all((options?.videos || []).map((video) => prepareReferenceMedia(video, "ref.mp4", "invalidReferenceVideo", options)));
        const audios = await Promise.all((options?.audios || []).map((audio) => prepareReferenceMedia(audio, "ref.mp3", "invalidReferenceAudio", options)));
        return { images, videos, audios };
    };
    const { images, videos, audios } = await prepare().catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") throw error;
        const rejected = new Error(error instanceof Error ? error.message : apiText("videoTaskCreateFailed"));
        rejected.name = "VideoSubmissionRejected";
        throw rejected;
    });
    const mode = resolveVideoMode(config.videoMode, images.length);
    const ratio = inferVideoRatio(config.size || "16:9");
    const body = new FormData();
    body.append("model", modelOptionName(model));
    if (config.videoRouteId && model.startsWith('server::')) body.append("routeId", config.videoRouteId);
    if (options?.clientTaskId) body.append("clientTaskId", options.clientTaskId);
    body.append("prompt", prompt);
    body.append("seconds", normalizeVideoSeconds(config.videoSeconds, model));
    body.append("size", normalizeVideoSize(config.size, config.vquality) || "1280x720");
    if (ratio && ratio !== "auto") {
        body.append("ratio", ratio);
    }
    body.append("resolution_name", normalizeVideoResolution(config.vquality));
    body.append("generate_audio", String(boolConfig(config.videoGenerateAudio, true)));
    body.append("watermark", String(boolConfig(config.videoWatermark, false)));
    body.append("mode", mode);
    const referenceKeys: { field: string; key: string; name: string; mime: string }[] = [];
    const appendImage = (field: string, item: PreparedReference, filename: string) => {
        if ("key" in item) referenceKeys.push({ field, key: item.key, name: filename, mime: item.mime });
        else body.append(field, item.file, filename);
    };
    // 视频/音频沿用媒体库里的原始文件名：保留真实扩展名，且每个对象键天然唯一。
    const appendMedia = (field: string, item: PreparedReference, fallbackName: string) => {
        if ("key" in item) referenceKeys.push({ field, key: item.key, name: item.name || fallbackName, mime: item.mime });
        else body.append(field, item.file);
    };
    if (mode === "frames") {
        if (images[0]) appendImage("first_frame", images[0], "first.png");
        if (images[1]) appendImage("last_frame", images[1], "last.png");
    } else {
        images.forEach((item, idx) => appendImage("image[]", item, `ref_${idx + 1}.png`));
    }
    videos.forEach((item, idx) => appendMedia("video[]", item, `ref_video_${idx + 1}.mp4`));
    audios.forEach((item, idx) => appendMedia("audio[]", item, `ref_audio_${idx + 1}.mp3`));
    // 所有参考素材登记完再写 referenceKeys，服务端按字段名把它们还原成对应的文件。
    if (referenceKeys.length) body.append("referenceKeys", JSON.stringify(referenceKeys));
    try {
        const send = (confirmed = false) => axios.post<ApiVideoResponse>(aiApiUrl(config, "/videos"), body, { headers: { ...aiHeaders(config, undefined, options?.expectedUserId), ...(options?.surface ? { 'X-Sundas-Surface': options.surface } : {}), ...(confirmed ? { 'X-Confirm-Duplicate': 'true' } : {}) }, signal: options?.signal });
        let response;
        try { response = await send(); }
        catch (error) {
            if (!axios.isAxiosError(error) || error.response?.data?.errorCode !== 'DUPLICATE_VIDEO_IN_PROGRESS') throw error;
            if (!window.confirm('已经有一条相同的内容正在生成中，继续提交会再次消耗积分。是否继续？')) {
                const cancelled = new Error('已取消重复提交');
                cancelled.name = 'VideoSubmissionRejected';
                throw cancelled;
            }
            response = await send(true);
        }
        const created = unwrapVideoResponse(response.data);
        if (!created.id) throw new Error(apiText("noVideoTaskId"));
        return { id: created.id, provider: "openai", model };
    } catch (error) {
        if (isVideoSubmissionRejected(error)) throw error;
        if (axios.isAxiosError(error) && error.response?.status === 402) {
            const insufficientCredits = new Error("积分不足，请充值后再生成视频");
            insufficientCredits.name = "VideoInsufficientCredits";
            throw insufficientCredits;
        }
        const message = new Error(readVideoSubmissionError(error));
        if (axios.isAxiosError(error) && error.response && [400, 401, 403, 404, 409, 413, 415, 422, 429].includes(error.response.status)) message.name = "VideoSubmissionRejected";
        throw message;
    }
}

/**
 * 提交失败时要给出能据此行动的原因。
 * 手机端最常见的是请求体过大被网关拒绝（413）和慢速上行中断（无响应），
 * 这两类错误此前只剩一句“视频任务创建失败”，用户无法判断该怎么处理。
 */
function readVideoSubmissionError(error: unknown) {
    if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 413) return "提交内容过大，服务器拒绝了本次请求（413）。请压缩或减少参考视频/图片后重试。";
        if (status === 409) return readApiErrorMessage(error.response?.data) || "登录账户已变化，请刷新页面后重试。";
        if (status === 415) return readApiErrorMessage(error.response?.data) || "参考素材格式不受支持，请换成常见的 JPG/PNG、MP4 或 MP3 后重试。";
        if (status === 429) return apiText("rateLimited");
        if (status === 502 || status === 503 || status === 504) return `网关返回 ${status}，提交结果未确认。请先刷新生成记录，确认没有已创建的任务后再重试。`;
        if (!error.response) return error.code === "ECONNABORTED" ? "提交超时，网络较慢时请减少参考素材或改用更小的文件后重试。" : "网络异常，提交没有完成，请检查网络后重试。";
    }
    return readAxiosError(error, apiText("videoTaskCreateFailed"));
}

async function pollOpenAIVideoTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const video = unwrapVideoResponse((await axios.get<ApiVideoResponse>(aiApiUrl(config, `/videos/${task.id}`), { headers: aiHeaders(config, undefined, options?.expectedUserId), signal: options?.signal })).data);
        if (video.status === "completed" && video.resultAvailable === false) return { status: "unavailable", error: "任务已完成，但视频记录不可用，请联系管理员核查。" };
        const url = videoResultUrl(video);
        if (url) return { status: "completed", result: await videoResultFromUrl(url, options) };
        if (video.status === "completed") {
            const content = await axios.get<Blob>(aiApiUrl(config, `/videos/${task.id}/content`), { headers: aiHeaders(config, undefined, options?.expectedUserId), responseType: "blob", signal: options?.signal });
            await assertVideoBlob(content.data);
            return { status: "completed", result: { blob: content.data } };
        }
        if (video.status === "failed" || video.status === "cancelled") return { status: "failed", error: readApiErrorMessage(typeof video.error === "string" ? video.error : video.error?.message) || apiText("videoGenerationFailed") };
        return { status: "pending", review: video.review, statusMessage: video.statusMessage };
    } catch (error) {
        throw new Error(readAxiosError(error, apiText("videoTaskQueryFailed")));
    }
}

async function videoResultFromUrl(url: string, options?: RequestOptions): Promise<VideoGenerationResult> {
    try {
        const response = await axios.get<Blob>(withLocalProxy(url), { responseType: "blob", signal: options?.signal });
        await assertVideoBlob(response.data);
        return { blob: response.data };
    } catch (error) {
        if (axios.isCancel(error) || options?.signal?.aborted) throw error;
        return { url, mimeType: "video/mp4" };
    }
}

async function createGeminiVideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], options?: VideoMediaOptions): Promise<VideoGenerationTask> {
    const images = await Promise.all(references.map((image) => imageToDataUrl(image)));
    const videos = await Promise.all((options?.videos || []).map((video) => referenceMediaToFile(video, "ref.mp4", "invalidReferenceVideo", options)));
    const audios = await Promise.all((options?.audios || []).map((audio) => referenceMediaToFile(audio, "ref.mp3", "invalidReferenceAudio", options)));
    const mode = resolveVideoMode(config.videoMode, images.length);
    const instance: Record<string, unknown> = { prompt };
    if (mode === "frames") {
        if (images[0]) instance.image = parseDataUrlInline(images[0]);
        if (images[1]) instance.lastFrame = parseDataUrlInline(images[1]);
    } else {
        instance.referenceImages = images.map((dataUrl) => ({ image: parseDataUrlInline(dataUrl), referenceType: "asset" }));
    }
    if (videos[0]) instance.video = await fileToGeminiInline(videos[0]);
    if (audios[0]) instance.audio = await fileToGeminiInline(audios[0]);
    try {
        const created = unwrapEnvelope((await axios.post<ApiEnvelope<GeminiVideoOperation>>(geminiVideoUrl(config, model, "predictLongRunning"), {
            instances: [instance],
            parameters: {
                aspectRatio: videoAspectRatio(config.size),
                durationSeconds: Number(normalizeVideoSeconds(config.videoSeconds, model)) || 8,
                resolution: normalizeVideoResolution(config.vquality),
                generateAudio: boolConfig(config.videoGenerateAudio, true),
                addWatermark: boolConfig(config.videoWatermark, false),
            },
        }, { headers: geminiVideoHeaders(config), signal: options?.signal })).data, apiText("noVideoTask"));
        if (!created.name) throw new Error(apiText("noVideoTaskId"));
        return { id: created.name, provider: "gemini", model };
    } catch (error) {
        throw new Error(readAxiosError(error, apiText("videoTaskCreateFailed")));
    }
}

async function pollGeminiVideoTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const state = unwrapEnvelope((await axios.get<ApiEnvelope<GeminiVideoOperation>>(geminiOperationUrl(config, task.id), { headers: geminiVideoHeaders(config), signal: options?.signal })).data, apiText("videoTaskQueryFailed"));
        if (state.error) return { status: "failed", error: readApiErrorMessage(state.error.message) || apiText("videoGenerationFailed") };
        if (!state.done) return { status: "pending" };
        const uri = state.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
        if (!uri) return { status: "failed", error: apiText("noPlayableVideo") };
        const url = uri.includes("key=") ? uri : `${uri}${uri.includes("?") ? "&" : "?"}key=${config.apiKey}`;
        return { status: "completed", result: await videoResultFromUrl(url, options) };
    } catch (error) {
        throw new Error(readAxiosError(error, apiText("videoTaskQueryFailed")));
    }
}

function assertVideoConfig(config: AiConfig, model: string) {
    if (!model) throw new Error(apiText("videoModelRequired"));
    if (!config.baseUrl.trim()) throw new Error(apiText("baseUrlRequired"));
    if (!config.apiKey.trim()) throw new Error(apiText("apiKeyRequired"));
}

function geminiVideoBaseUrl(config: Pick<AiConfig, "baseUrl">) {
    const normalizedBaseUrl = config.baseUrl.trim().replace(/\/+$/, "");
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    return lowerBaseUrl.endsWith("/v1") || lowerBaseUrl.endsWith("/v1beta") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1beta`;
}

function geminiVideoUrl(config: Pick<AiConfig, "baseUrl">, model: string, action: string) {
    return withLocalProxy(`${geminiVideoBaseUrl(config)}/models/${encodeURIComponent(modelOptionName(model).replace(/^models\//, ""))}:${action}`);
}

function geminiOperationUrl(config: Pick<AiConfig, "baseUrl">, name: string) {
    return withLocalProxy(`${geminiVideoBaseUrl(config)}/${name.replace(/^\//, "")}`);
}

function geminiVideoHeaders(config: Pick<AiConfig, "apiKey">) {
    return { "x-goog-api-key": config.apiKey, "Content-Type": "application/json" };
}

function videoAspectRatio(size: string) {
    const ratio = inferVideoRatio(size);
    return ratio === "auto" ? "16:9" : ratio;
}

function parseDataUrlInline(dataUrl: string, fallbackType = "image/png"): GeminiInlineData {
    const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
    return { bytesBase64Encoded: match?.[2] || "", mimeType: match?.[1] || fallbackType };
}

async function fileToGeminiInline(file: File): Promise<GeminiInlineData> {
    return parseDataUrlInline(await readFileAsDataUrl(file), file.type || "application/octet-stream");
}

async function referenceMediaToFile(item: { name: string; type?: string; url?: string; storageKey?: string }, fallbackName: string, errorKey: "invalidReferenceVideo" | "invalidReferenceAudio", options?: RequestOptions) {
    let blob = item.storageKey ? await getMediaBlob(item.storageKey) : null;
    if (!blob) {
        const url = item.storageKey ? await resolveMediaUrl(item.storageKey, item.url || "") : item.url || "";
        if (!url) throw new Error(apiText(errorKey));
        try {
            const response = await fetch(url, { signal: options?.signal });
            if (!response.ok) throw new Error(apiText(errorKey));
            blob = await response.blob();
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") throw error;
            throw new Error(apiText(errorKey));
        }
    }
    if (!blob.size) throw new Error(apiText(errorKey));
    return new File([blob], item.name || fallbackName, { type: item.type || blob.type || "application/octet-stream" });
}

function normalizeVideoSeconds(value: string, model?: string) {
    const serverModel = useConfigStore.getState().serverModels.find((item) => item.id === modelOptionName(model ?? ""));
    const { min, max } = videoSecondsRangeForDurations((serverModel?.metadata as { durations?: { min?: number; max?: number } } | undefined)?.durations);
    return clampVideoSecondsToRange(value, min, max);
}

function resolveVideoMode(mode: string | undefined, imageCount: number) {
    if (mode === "reference" || imageCount > 2) return "reference";
    return "frames";
}

function normalizeVideoSize(value: string, resolution?: string) {
    if (value === "auto") return null;
    if (/^\d+x\d+$/.test(value || "")) return value;
    const ratio = inferVideoRatio(value || "16:9");
    if (ratio === "auto") return null;
    return computeVideoSize(resolution || "720", ratio);
}

function normalizeVideoResolution(value: string) {
    const resolution = parseVideoResolution(value);
    return resolution === "2k" || resolution === "4k" ? resolution : `${resolution}p`;
}

function unwrapVideoResponse(payload: ApiVideoResponse) {
    return unwrapEnvelope(payload, apiText("noVideoTask"));
}

function unwrapEnvelope<T>(payload: ApiEnvelope<T>, emptyMessage: string): T {
    if (!payload) throw new Error(emptyMessage);
    if (typeof payload === "object" && "code" in payload && payload.code !== undefined) {
        if (payload.code !== 0 && payload.code !== "0") throw new Error(readApiErrorMessage(payload) || apiText("requestFailed"));
        if (!payload.data) throw new Error(emptyMessage);
        return payload.data;
    }
    return payload as T;
}

function videoResultUrl(payload: VideoResponse) {
    return [payload.video_url, payload.result_url, payload.url, payload.content?.video_url, payload.content?.url].find((url) => typeof url === "string" && (isPublicMediaUrl(url) || /\.mp4(\?|#|$)/i.test(url)));
}

function readApiErrorMessage(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            const inner = readApiErrorMessage(parsed) || value;
            if (inner === value && typeof parsed === "object" && Object.keys(parsed).length === 0) return "";
            return inner;
        } catch {
            if (/<[a-z][\s\S]*>/i.test(value)) return apiText("htmlError", { preview: `${value.slice(0, 80)}...` });
            return friendlyErrorMessage(value);
        }
    }
    if (typeof value !== "object") return "";
    const payload = value as { msg?: unknown; message?: unknown; error?: unknown; detail?: unknown };
    // error may be a string or an object containing a message.
    const errorMsg =
        typeof payload.error === "string"
            ? payload.error
            : (payload.error as { message?: unknown })?.message;
    return friendlyErrorMessage(
        readApiErrorMessage(payload.msg) ||
        readApiErrorMessage(payload.message) ||
        readApiErrorMessage(errorMsg) ||
        readApiErrorMessage(payload.detail) ||
        ""
    );
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isCancel(error)) return apiText("requestCanceled");
    if (axios.isAxiosError<{ error?: { message?: string }; msg?: string; message?: string; code?: number | string }>(error)) {
        if (!error.response && error.code === "ERR_NETWORK") return apiText("requestFailed");
        const responseData = error.response?.data;
        return readApiErrorMessage(responseData) || statusMessage(error.response?.status, fallback);
    }
    if (error instanceof DOMException && error.name === "AbortError") return apiText("requestCanceled");
    return error instanceof Error ? readApiErrorMessage(error.message) || error.message : fallback;
}

function statusMessage(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return apiText("authenticationFailed");
    if (status === 429) return apiText("rateLimited");
    return status ? `${fallback}（${status}）` : fallback;
}

async function assertVideoBlob(blob: Blob) {
    if (!blob.type.includes("json")) return;
    let payload: { code?: number; msg?: string; error?: { message?: string } };
    try {
        payload = JSON.parse(await blob.text()) as { code?: number; msg?: string; error?: { message?: string } };
    } catch {
        return;
    }
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(readApiErrorMessage(payload) || apiText("videoDownloadFailed"));
    if (payload.error?.message) throw new Error(readApiErrorMessage(payload.error.message) || payload.error.message);
}

function isPublicMediaUrl(value: string) {
    return /^https?:\/\//i.test(value || "");
}

