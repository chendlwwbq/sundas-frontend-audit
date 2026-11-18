import { useEffect, useRef, useState } from "react";
import { Play, Video } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useMediaPreview } from "@/hooks/use-media-preview";
import { releaseCanvasMedia, setCanvasNodePlaying } from "@/lib/canvas/canvas-media-playback";
import { refreshExpiredMedia } from "@/services/media-download";
import type { NodeContentRendererProps } from "./NodeShared";

export function VideoNodeContent({ node, theme }: NodeContentRendererProps) {
    const { t } = useTranslation();
    const videoRef = useRef<HTMLVideoElement>(null);
    const source = node.metadata?.content || "";
    const preview = useMediaPreview(source);
    const activeSourceRef = useRef("");
    const resumeTimeRef = useRef(0);
    const [requested, setRequested] = useState(false);

    useEffect(() => {
        const video = videoRef.current;
        setRequested(false);
        resumeTimeRef.current = 0;
        if (!video) return;
        const resume = () => {
            if (resumeTimeRef.current > 0 && resumeTimeRef.current < video.duration) video.currentTime = resumeTimeRef.current;
        };
        const visibilityChanged = () => {
            // Keep deliberate playback, including its audio, running. Only idle hidden players are released.
            if (document.hidden && video.paused) {
                resumeTimeRef.current = video.currentTime;
                activeSourceRef.current = "";
                releaseCanvasMedia(video);
                setRequested(false);
            }
        };
        video.addEventListener("loadedmetadata", resume);
        document.addEventListener("visibilitychange", visibilityChanged);
        return () => {
            document.removeEventListener("visibilitychange", visibilityChanged);
            video.removeEventListener("loadedmetadata", resume);
            activeSourceRef.current = "";
            releaseCanvasMedia(video);
            setCanvasNodePlaying(node.id, false);
        };
    }, [node.id, source]);

    if (!node.metadata?.content) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3" style={{ color: theme.node.placeholder }}>
                <Video className="size-7 opacity-35" />
                <span className="text-sm">{t("canvas.node.emptyVideo")}</span>
            </div>
        );
    }

    const play = () => {
        const video = videoRef.current;
        if (!video) return;
        if (activeSourceRef.current !== source) {
            video.src = source;
            activeSourceRef.current = source;
        }
        video.controls = true;
        setRequested(true);
        setCanvasNodePlaying(node.id, true);
        // Start within the user gesture so mobile browsers can authorize playback with sound.
        void video.play().catch(() => {
            if (activeSourceRef.current !== source) return;
            activeSourceRef.current = "";
            setCanvasNodePlaying(node.id, false);
            setRequested(false);
        });
    };

    return (
        <div className="relative h-full w-full" data-canvas-no-zoom>
            <video
                ref={videoRef}
                poster={preview.url}
                preload="none"
                onError={refreshExpiredMedia}
                controls={requested}
                playsInline
                onPlay={() => setCanvasNodePlaying(node.id, true)}
                onPause={() => setCanvasNodePlaying(node.id, false)}
                onEnded={() => setCanvasNodePlaying(node.id, false)}
                className="h-full w-full rounded-xl object-contain"
                data-canvas-video={node.id}
            />
            {!requested ? (
                <button
                    type="button"
                    className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-transparent hover:bg-black/5 dark:hover:bg-white/10"
                    style={{ color: theme.node.text }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                        event.stopPropagation();
                        play();
                    }}
                    aria-label={`播放视频：${node.title}`}
                >
                    <Play className="size-7" />
                    <span className="text-sm">播放视频</span>
                </button>
            ) : null}
            {!requested && preview.error ? (
                <button
                    type="button"
                    className="absolute bottom-2 right-2 z-10 bg-transparent px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10"
                    style={{ color: theme.node.text }}
                    onClick={(event) => {
                        event.stopPropagation();
                        preview.retry();
                    }}
                    title={preview.error}
                >
                    重试封面
                </button>
            ) : null}
        </div>
    );
}
