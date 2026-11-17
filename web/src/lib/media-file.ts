const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "avif", "bmp", "tif", "tiff"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "m4v"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "m4a", "aac"]);

export type MediaFileKind = "image" | "video" | "audio";

function extensionOf(name: string) {
    const index = name.lastIndexOf(".");
    return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
}

/**
 * Mobile pickers may return an empty MIME type. Fall back to the file extension
 * instead of silently dropping the selected file.
 */
export function mediaFileKind(file: Pick<File, "type" | "name">): MediaFileKind | null {
    const type = file.type.toLowerCase();
    if (type.startsWith("image/")) return "image";
    if (type.startsWith("video/")) return "video";
    if (type.startsWith("audio/")) return "audio";
    const extension = extensionOf(file.name);
    if (IMAGE_EXTENSIONS.has(extension)) return "image";
    if (VIDEO_EXTENSIONS.has(extension)) return "video";
    if (AUDIO_EXTENSIONS.has(extension)) return "audio";
    return null;
}

export function isHeicImage(file: Pick<File, "type" | "name">) {
    return /^image\/(heic|heif)(-sequence)?$/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}
