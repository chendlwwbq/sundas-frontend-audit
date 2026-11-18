import { useEffect, useMemo, useState } from "react";
import { ImageOff } from "lucide-react";

import { BrandName } from "@/components/brand/brand-wordmark";
import { promptImageUrl } from "@/lib/prompt-image";

// 封面占位：只用四档深灰 + 极弱蓝色倾向，避免彩虹渐变（即梦规范）
const GRADIENTS = [
    "linear-gradient(135deg, #232323 0%, #1a1a1a 62%, #151515 100%)",
    "linear-gradient(160deg, #1f1f1f 0%, #191919 55%, #212121 100%)",
    "linear-gradient(120deg, rgba(216,255,62,0.10) 0%, #1a1a1a 58%, #141414 100%)",
    "linear-gradient(200deg, #202020 0%, #171717 60%, #1f1f1f 100%)",
    "linear-gradient(135deg, rgba(0,202,224,0.08) 0%, #1b1b1b 60%, #131313 100%)",
    "linear-gradient(180deg, #222222 0%, #181818 70%, #121212 100%)",
    "linear-gradient(115deg, #1d1d1d 0%, #232323 50%, #171717 100%)",
    "linear-gradient(150deg, rgba(255,255,255,0.06) 0%, #1a1a1a 55%, #141414 100%)",
];

export function PromptCover({ src, alt, className = "", compact = false }: { src?: string; alt: string; className?: string; compact?: boolean }) {
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [src]);

    const url = promptImageUrl(src);
    const gradient = useMemo(() => {
        const seed = Array.from(alt).reduce((sum, char) => sum + (char.codePointAt(0) ?? 0), 0);
        return GRADIENTS[seed % GRADIENTS.length];
    }, [alt]);

    if (!url || failed) {
        return (
            <div className={`relative grid w-full place-items-center overflow-hidden ${className}`} style={{ backgroundImage: gradient }} role="img" aria-label={alt}>
                <div
                    className="absolute inset-0 opacity-40"
                    style={{
                        backgroundImage:
                            "radial-gradient(circle at 20% 15%, rgba(255,255,255,.55), transparent 42%), radial-gradient(circle at 85% 80%, rgba(255,255,255,.35), transparent 45%)",
                    }}
                />
                <div className="relative flex flex-col items-center gap-1 px-3 text-center">
                    {compact ? <ImageOff className="size-4 text-white/70" /> : <span className="text-3xl font-semibold text-white/85">{alt.slice(0, 1)}</span>}
                    {compact ? null : <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.25em] text-white/60"><BrandName text="sundas" imageClassName="opacity-60" imageHeight="0.95em" />prompt</span>}
                </div>
            </div>
        );
    }

    return <img src={url} alt={alt} className={className} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}
