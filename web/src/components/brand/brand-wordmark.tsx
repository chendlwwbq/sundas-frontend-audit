import { cn } from "@/lib/utils";

/** 全站唯一的文字 logo 资源（管理后台同款），矢量、可任意缩放 */
const WORDMARK_SRC = "/brand/sundas-wordmark.svg";

/**
 * 品牌文字 logo。
 * 资产已收到墨迹边界，height 即字母实际高度（含 d 的升部），宽度按约 6.05 : 1 自适应。
 */
export function BrandWordmark({ height = 16, className, decorative = false }: { height?: number; className?: string; decorative?: boolean }) {
    return (
        <img
            src={WORDMARK_SRC}
            alt={decorative ? "" : "sundas"}
            draggable={false}
            className={cn("block w-auto shrink-0 select-none", className)}
            style={{ height }}
        />
    );
}

/**
 * 行内品牌名：把文案里的 sundas 片段换成文字 logo，其余文字保持原样参与排版流。
 * 用于「登录 sundas」「© 2026 sundas Inc.」「SUNDAS MEMBERSHIP」这类句子/标签。
 */
export function BrandName({ text, imageClassName, imageHeight = "0.82em" }: { text: string; imageClassName?: string; imageHeight?: string }) {
    return (
        <>
            {text.split(/(sundas)/gi).map((part, index) =>
                part.toLowerCase() === "sundas" ? (
                    <img
                        key={index}
                        src={WORDMARK_SRC}
                        alt="sundas"
                        draggable={false}
                        className={cn("inline-block w-auto select-none align-baseline", imageClassName)}
                        style={{ height: imageHeight }}
                    />
                ) : (
                    <span key={index}>{part}</span>
                ),
            )}
        </>
    );
}
