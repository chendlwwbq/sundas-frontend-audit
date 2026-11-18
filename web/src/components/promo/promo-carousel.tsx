import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { trackPromoClick, type PromoItem } from "@/services/api/promo";
import { usePromoAction } from "./use-promo-action";
import "./promo.css";

const FALLBACK_RATIO = 2.28;

export function PromoCarousel({ items, variant = "default" }: { items: PromoItem[]; variant?: "default" | "hero" }) {
    const action = usePromoAction();
    const [index, setIndex] = useState(0);
    const [failed, setFailed] = useState<Set<string>>(() => new Set());
    const [paused, setPaused] = useState(false);
    const [ratio, setRatio] = useState(FALLBACK_RATIO);
    const visible = useMemo(() => items.filter((item) => item.enabled), [items]);

    useEffect(() => {
        if (index >= visible.length) setIndex(0);
    }, [index, visible.length]);

    useEffect(() => {
        if (visible.length < 2 || paused) return;
        const timer = window.setInterval(() => setIndex((value) => (value + 1) % visible.length), 5000);
        return () => window.clearInterval(timer);
    }, [paused, visible.length]);

    if (!visible.length) return null;
    const current = Math.min(index, visible.length - 1);
    const item = visible[current];
    const previous = visible.length > 1 ? visible[(current - 1 + visible.length) % visible.length] : null;
    const next = visible.length > 1 ? visible[(current + 1) % visible.length] : null;

    const run = () => {
        void trackPromoClick({ placement: "carousel", itemId: item.id });
        action(item);
    };

    // 预加载相邻两张，点击切换时立即出图，避免“点了没反应”的慢加载错觉
    useEffect(() => {
        if (visible.length < 2) return;
        const neighbours = [visible[(current + 1) % visible.length], visible[(current - 1 + visible.length) % visible.length]];
        for (const entry of neighbours) {
            if (entry && !failed.has(entry.id)) {
                const img = new window.Image();
                img.src = entry.imageUrl;
            }
        }
    }, [current, visible, failed]);

    const image = (entry: PromoItem, hero: boolean) => (
        <picture>
            {entry.mobileImageUrl ? <source media="(max-width: 760px)" srcSet={entry.mobileImageUrl} /> : null}
            {failed.has(entry.id) ? (
                // 加载失败的图不再从轮播中剔除（否则切换会回落到同一张，看起来“点不动”），
                // 改为显示兜底占位，保证切换始终有可见反馈
                <span className={hero ? "promo-carousel-fallback is-hero" : "promo-carousel-fallback"}>{entry.title || entry.alt}</span>
            ) : (
                <img
                    key={entry.id}
                    className={hero ? "promo-carousel-hero-media" : "promo-carousel-media"}
                    src={entry.imageUrl}
                    alt={entry.alt}
                    onLoad={(event) => {
                        const value = event.currentTarget.naturalWidth / event.currentTarget.naturalHeight;
                        if (value > 0.5 && value < 6) setRatio(value);
                    }}
                    onError={() => {
                        setFailed((value) => new Set(value).add(entry.id));
                    }}
                />
            )}
        </picture>
    );

    // 右下角分页器：仅保留「02 / 03」计数（短横线指示条已按需求移除）
    const pager =
        visible.length > 1 ? (
            <div className="promo-carousel-pager">
                <span className="promo-carousel-count">
                    <b>{String(current + 1).padStart(2, "0")}</b>
                    <span className="promo-carousel-count-sep">/</span>
                    {String(visible.length).padStart(2, "0")}
                </span>
            </div>
        ) : null;

    if (variant === "hero") {
        return (
            <section
                className="promo-carousel is-hero"
                aria-label="首页轮播"
                onMouseEnter={() => setPaused(true)}
                onMouseLeave={() => setPaused(false)}
                onFocusCapture={() => setPaused(true)}
                onBlurCapture={() => setPaused(false)}
            >
                <div className="promo-carousel-stage" style={{ aspectRatio: ratio }}>
                    {previous ? (
                        <div className="promo-carousel-peek is-prev" aria-hidden>
                            <img src={previous.imageUrl} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                        </div>
                    ) : null}
                    {next ? (
                        <div className="promo-carousel-peek is-next" aria-hidden>
                            <img src={next.imageUrl} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                        </div>
                    ) : null}

                    <button type="button" className="promo-carousel-main" onClick={run} aria-label={item.alt}>
                        {image(item, true)}
                    </button>

                    {visible.length > 1 ? (
                        <button type="button" className="promo-carousel-arrow is-prev" aria-label="上一张" onClick={() => setIndex((value) => (value - 1 + visible.length) % visible.length)}>
                            <ChevronLeft className="size-4" />
                        </button>
                    ) : null}
                    {visible.length > 1 ? (
                        <button type="button" className="promo-carousel-arrow is-next" aria-label="下一张" onClick={() => setIndex((value) => (value + 1) % visible.length)}>
                            <ChevronRight className="size-4" />
                        </button>
                    ) : null}
                </div>

                {pager}
            </section>
        );
    }

    return (
        <section
            className="promo-carousel"
            aria-label="首页轮播"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocusCapture={() => setPaused(true)}
            onBlurCapture={() => setPaused(false)}
        >
            <button type="button" className="promo-carousel-slide" onClick={run} aria-label={item.alt}>
                {image(item, false)}
            </button>

            {visible.length > 1 ? (
                <>
                    <button type="button" className="promo-carousel-arrow is-prev" aria-label="上一张" onClick={() => setIndex((value) => (value - 1 + visible.length) % visible.length)}>
                        <ChevronLeft className="size-4" />
                    </button>
                    <button type="button" className="promo-carousel-arrow is-next" aria-label="下一张" onClick={() => setIndex((value) => (value + 1) % visible.length)}>
                        <ChevronRight className="size-4" />
                    </button>
                    {pager}
                </>
            ) : null}
        </section>
    );
}
