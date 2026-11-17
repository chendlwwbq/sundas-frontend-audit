export function promptImageUrl(src?: string) {
    if (!src) return "";
    if (src.startsWith("/") || src.startsWith("data:") || src.startsWith("blob:")) return src;
    if (!/^https?:\/\//i.test(src)) return src;
    return `/api/prompt-image?url=${encodeURIComponent(src)}`;
}
