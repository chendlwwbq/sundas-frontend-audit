import type { UploadedFile } from "@/services/file-storage";
import type { UploadedImage } from "@/services/image-storage";
import type { CanvasNodeMetadata } from "@/types/canvas";

export function isSilentDirectorClayVideo(metadata: CanvasNodeMetadata | undefined) {
    return metadata?.workflowKind === "reference_video" && metadata.assetTags?.includes("导演台白膜") === true;
}

/**
 * 白膜视频的节点元数据（sundas 版）。
 *
 * BeefTV 这边还会额外写入 videoPreview（首帧封面），sundas 的节点没有这层缓存契约，
 * 因此只写视频本体字段；封面图仍然会作为一张图片节点单独回写画布。
 * 导演台录的是纯画布流，没有音轨，所以 hasAudio 恒为 false。
 */
export function directorClayVideoMetadata(video: UploadedFile, _beauty: UploadedImage): CanvasNodeMetadata {
    return {
        content: video.url,
        storageKey: video.storageKey,
        status: "success",
        naturalWidth: video.width,
        naturalHeight: video.height,
        bytes: video.bytes,
        mimeType: (video.mimeType || "video/webm").split(";", 1)[0]?.trim() || "video/webm",
        durationMs: video.durationMs,
        hasAudio: false,
        assetTags: ["导演台白膜"],
        workflowKind: "reference_video",
    };
}
