import { useEffect, useRef, useState } from "react";

/**
 * 视频封面：默认显示视频首帧（#t=0.5 避免黑帧），hover 时静音自动播放，移开后暂停并回到封面帧。
 * 用于灵感大厅等卡片场景，无需额外点击即可预览。
 */
export function PromptVideoCover({ src, poster, alt, className = "" }: { src: string; poster?: string; alt: string; className?: string }) {
    const ref = useRef<HTMLVideoElement>(null);
    const hovered = useRef(false);
    const [loadedSrc, setLoadedSrc] = useState<string>();
    // #t=0.5：让 preload="metadata" 停在前半秒，避免部分视频首帧为黑屏
    const srcWithFrame = src.includes("#") ? src : `${src}#t=0.5`;

    useEffect(() => {
        const video = ref.current;
        if (!video) return;
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
                setLoadedSrc(src);
                observer.disconnect();
            }
        }, { rootMargin: "200px" });
        observer.observe(video);
        return () => {
            observer.disconnect();
            hovered.current = false;
            video.pause();
        };
    }, [src]);

    const start = () => {
        const video = ref.current;
        if (!video || !hovered.current) return;
        // 浏览器只允许静音自动播放；这里再强制一次，避免 muted 未生效导致 play() 被拒绝
        video.muted = true;
        void video.play()?.catch(() => undefined);
    };

    return (
        <video
            ref={ref}
            src={loadedSrc === src ? srcWithFrame : undefined}
            poster={poster || undefined}
            muted
            loop
            playsInline
            preload="metadata"
            aria-label={alt}
            className={className}
            onMouseEnter={() => { hovered.current = true; setLoadedSrc(src); start(); }}
            onLoadedData={start}
            onPlay={() => { if (!hovered.current) ref.current?.pause(); }}
            onMouseLeave={() => {
                hovered.current = false;
                const video = ref.current;
                if (!video) return;
                video.pause();
                try {
                    video.currentTime = 0.5;
                } catch {
                    /* metadata 未就绪时忽略 */
                }
            }}
        />
    );
}
