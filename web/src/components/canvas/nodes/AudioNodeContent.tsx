import { useEffect, useRef } from "react";
import { Music2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { releaseCanvasMedia, setCanvasNodePlaying } from "@/lib/canvas/canvas-media-playback";
import type { NodeContentRendererProps } from "./NodeShared";

export function AudioNodeContent({ node, theme }: NodeContentRendererProps) {
    const { t } = useTranslation();
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        const audio = audioRef.current;
        if (audio && node.metadata?.content) audio.src = node.metadata.content;
        return () => {
            if (audio) releaseCanvasMedia(audio);
            setCanvasNodePlaying(node.id, false);
        };
    }, [node.id, node.metadata?.content]);

    if (!node.metadata?.content) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2" style={{ color: theme.node.placeholder }}>
                <Music2 className="size-7 opacity-35" />
                <span className="text-sm">{t("canvas.node.emptyAudio")}</span>
            </div>
        );
    }

    return (
        <div className="flex h-full w-full flex-col justify-center gap-3 px-4" style={{ background: theme.node.fill, color: theme.node.text }}>
            <div className="flex min-w-0 items-center gap-2 text-sm opacity-70">
                <Music2 className="size-4 shrink-0" />
                <span className="truncate">{t("canvas.node.audio")}</span>
            </div>
            <audio
                ref={audioRef}
                preload="none"
                controls
                className="w-full"
                data-canvas-no-zoom
                onPlay={() => setCanvasNodePlaying(node.id, true)}
                onPause={() => setCanvasNodePlaying(node.id, false)}
                onEnded={() => setCanvasNodePlaying(node.id, false)}
            />
        </div>
    );
}
