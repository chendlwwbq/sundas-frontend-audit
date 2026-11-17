/**
 * 优化后的图片组件 - 带懒加载和骨架屏
 */
import { useState } from "react";
import "../loading/skeleton.css";

interface OptimizedImageProps {
    src: string;
    alt: string;
    className?: string;
    width?: number;
    height?: number;
    aspectRatio?: string;
}

export function OptimizedImage({
    src,
    alt,
    className = "",
    width,
    height,
    aspectRatio = "16/9"
}: OptimizedImageProps) {
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(false);

    return (
        <div
            className={`relative overflow-hidden ${className}`}
            style={{ aspectRatio }}
        >
            {/* 骨架屏 - 图片加载时显示 */}
            {!loaded && !error && (
                <div className="skeleton skeleton-media absolute inset-0" />
            )}

            {/* 错误状态 */}
            {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <span className="text-xs text-white/60">加载失败</span>
                </div>
            )}

            {/* 实际图片 */}
            <img
                src={src}
                alt={alt}
                width={width}
                height={height}
                loading="lazy"
                decoding="async"
                className={`w-full h-full object-cover transition-opacity duration-300 ${
                    loaded ? "opacity-100" : "opacity-0"
                }`}
                onLoad={() => setLoaded(true)}
                onError={() => {
                    setLoaded(false);
                    setError(true);
                }}
            />
        </div>
    );
}

/**
 * 使用示例：
 *
 * <OptimizedImage
 *     src={item.coverUrl}
 *     alt={item.title}
 *     className="home-prompt-cover"
 *     aspectRatio="16/9"
 * />
 */
