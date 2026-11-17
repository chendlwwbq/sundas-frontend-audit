import type { ServerModelInfo } from '@/stores/use-config-store';

type ReferenceCounts = { imageCount: number; videoCount: number; audioCount: number };

export function videoReferenceNotice(model: ServerModelInfo | undefined, counts: ReferenceCounts) {
    const limits = model?.metadata?.referenceLimits as { images?: number; videos?: number; audios?: number } | undefined;
    if (!limits) return null;
    const values = [
        { label: '图', count: counts.imageCount, limit: limits.images },
        { label: '视频', count: counts.videoCount, limit: limits.videos },
        { label: '音频', count: counts.audioCount, limit: limits.audios },
    ].filter((item) => typeof item.limit === 'number' && Number.isFinite(item.limit) && item.limit >= 0);
    if (!values.length) return null;
    const exceeded = values.some((item) => item.count > item.limit!);
    return { exceeded, text: `${exceeded ? '参考素材超限：' : '参考素材：'}${values.map((item) => `${item.label} ${item.count}/${item.limit}`).join(' · ')}` };
}
