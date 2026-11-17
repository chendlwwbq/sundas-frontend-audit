import { useEffect, useRef, useState } from "react";

/**
 * 首页 hero 背景影片墙：竖版 4:5、5 秒循环片段。
 * 每条都配同名 poster，视频加载前/不可播放时由色板渐变与海报兜底，形状尺寸由 CSS 固定。
 * 素材按题材各取一条（动漫人像 / 赛博科幻 / 自然萌物 / 超现实奇幻 / 电影人像 /
 * 动画冒险 / 治愈定格 / 海洋奇观），互不重复，统一裁成 360×450、5 秒静音循环。
 * 交互逻辑 1:1 移植自 aid-studio 首页 HomeHero 的影片墙。
 */
const FILM_CLIPS = [
    { src: "/hero-media/hero-anime.mp4", poster: "/hero-media/hero-anime.jpg" },
    { src: "/hero-media/hero-cyber.mp4", poster: "/hero-media/hero-cyber.jpg" },
    { src: "/hero-media/hero-wild.mp4", poster: "/hero-media/hero-wild.jpg" },
    { src: "/hero-media/hero-surreal.mp4", poster: "/hero-media/hero-surreal.jpg" },
    { src: "/hero-media/hero-portrait.mp4", poster: "/hero-media/hero-portrait.jpg" },
    { src: "/hero-media/hero-adventure.mp4", poster: "/hero-media/hero-adventure.jpg" },
    { src: "/hero-media/hero-cozy.mp4", poster: "/hero-media/hero-cozy.jpg" },
    { src: "/hero-media/hero-ocean.mp4", poster: "/hero-media/hero-ocean.jpg" },
] as const;

const COLUMNS = 6;
const ROWS = 4;

export function HeroFilmWall() {
    const frames = useRef<HTMLDivElement>(null);
    // 尊重系统「减少动态效果」：仅显示海报，不自动播放
    const [reducedMotion, setReducedMotion] = useState(false);
    const [motionReady, setMotionReady] = useState(false);

    // The first paint needs only posters. Limit animated panels after idle instead
    // of starting every decoder while the application is still becoming interactive.
    useEffect(() => {
        const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
        const mobile = window.matchMedia("(max-width: 767px)");
        let timer: number | undefined;
        const sync = () => {
            window.clearTimeout(timer);
            if (reducedMotion || connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || "") || mobile.matches) {
                setMotionReady(false);
                return;
            }
            timer = window.setTimeout(() => setMotionReady(true), 1200);
        };
        sync();
        mobile.addEventListener("change", sync);
        return () => {
            window.clearTimeout(timer);
            mobile.removeEventListener("change", sync);
        };
    }, [reducedMotion]);

    useEffect(() => {
        const query = window.matchMedia("(prefers-reduced-motion: reduce)");
        const sync = () => setReducedMotion(query.matches);
        sync();
        query.addEventListener("change", sync);
        return () => query.removeEventListener("change", sync);
    }, []);

    // 滚出视口即暂停，避免 24 路解码在后台持续占用资源
    useEffect(() => {
        const node = frames.current;
        if (!node || typeof IntersectionObserver === "undefined") return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                for (const video of Array.from(node.querySelectorAll("video"))) {
                    if (entry.isIntersecting && !reducedMotion && video.hasAttribute("src")) void video.play().catch(() => undefined);
                    else video.pause();
                }
            },
            { rootMargin: "160px" },
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [reducedMotion, motionReady]);

    return (
        <div className="home-film-wall" ref={frames} aria-hidden="true">
            {Array.from({ length: COLUMNS }, (_, column) => (
                <div key={column} className="home-film-column">
                    {Array.from({ length: ROWS }, (_, row) => {
                        const index = column * ROWS + row;
                        const clip = FILM_CLIPS[(column + row * 2) % FILM_CLIPS.length];
                        // Keep one live panel in each visible column, rather than placing the
                        // entire playback budget in the cropped left-hand column.
                        const animated = motionReady && row === 0;
                        return (
                            <span key={row} className={`home-film-slot home-film-tone-${index % 16}`}>
                                <video
                                    src={animated ? clip.src : undefined}
                                    poster={clip.poster}
                                    muted
                                    loop
                                    playsInline
                                    autoPlay={animated && !reducedMotion}
                                    preload="none"
                                    disablePictureInPicture
                                    tabIndex={-1}
                                />
                            </span>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
