/**
 * 首页「创作工具」四个入口的自绘图标。
 *
 * 不用 lucide 的通用线性图标：这里每个入口需要一眼分辨的「专属比喻」，
 * 同时统一 24 网格 / 1.5 描边 / 白→品牌色的渐变描边语言，
 * 保证四张卡片摆在一起像一套，而不是四个搜来的图标。
 *
 * 渐变必须用 userSpaceOnUse：横向直线（如一行文字）的包围盒高度为 0，
 * 用默认的 objectBoundingBox 会让渐变退化，Chrome 直接不画这条线。
 *
 * 渐变 id 唯一且每个图标只渲染一次，不需要 useId。
 */

type IconProps = { className?: string };

const gradient = (id: string, to: string) => (
    <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="2" y1="1.5" x2="22" y2="22.5">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.96" />
            <stop offset="1" stopColor={to} stopOpacity="0.92" />
        </linearGradient>
    </defs>
);

/** 图片创作：画框 + 山峦 + 星芒（星芒用实心高光，代表「生成」而不是「相册」）。 */
export function LandingImageIcon({ className }: IconProps) {
    return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        {gradient("lt-icon-image", "#7EC0FF")}
        <rect x="3" y="3" width="18" height="18" rx="5" stroke="url(#lt-icon-image)" strokeWidth="1.5" />
        <path d="M4.4 17.9l4.5-4.6a2.1 2.1 0 0 1 3 0l2.6 2.7" stroke="url(#lt-icon-image)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.9 15.6l1.7-1.7a2.1 2.1 0 0 1 3 0l1.4 1.4" stroke="url(#lt-icon-image)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
        <path d="M18.1 5.4a3.2 3.2 0 0 0 2.2 2.2 3.2 3.2 0 0 0-2.2 2.2 3.2 3.2 0 0 0-2.2-2.2 3.2 3.2 0 0 0 2.2-2.2Z" fill="#A6D6FF" />
    </svg>;
}

/** 视频创作：取景屏 + 播放键。只留这两个元素，缩到 28px 也不会糊。 */
export function LandingVideoIcon({ className }: IconProps) {
    return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        {gradient("lt-icon-video", "#B2A0FF")}
        <rect x="2.8" y="5.2" width="18.4" height="13.6" rx="4.2" stroke="url(#lt-icon-video)" strokeWidth="1.5" />
        <path d="M10.4 9.4v5.2a.88.88 0 0 0 1.34.75l4.1-2.6a.88.88 0 0 0 0-1.5l-4.1-2.6a.88.88 0 0 0-1.34.75Z" fill="#CBBCFF" />
    </svg>;
}

/** 无限画布：淡描边的画布框里放一枚无限符号，直接点题「无限延伸」。 */
export function LandingCanvasIcon({ className }: IconProps) {
    return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        {gradient("lt-icon-canvas", "#6FE3C8")}
        <rect x="3" y="3" width="18" height="18" rx="5" stroke="url(#lt-icon-canvas)" strokeWidth="1.5" opacity="0.4" />
        <path d="M12 12c-1.3-2-2.1-2.8-3.6-2.8a2.8 2.8 0 1 0 0 5.6c1.5 0 2.3-.8 3.6-2.8Zm0 0c1.3-2 2.1-2.8 3.6-2.8a2.8 2.8 0 1 1 0 5.6c-1.5 0-2.3-.8-3.6-2.8Z" stroke="url(#lt-icon-canvas)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="rgba(255,255,255,0.06)" />
    </svg>;
}

/** 提示词库：文本卡片 + 三行描述 + 星芒，代表「可复用的描述」。 */
export function LandingPromptIcon({ className }: IconProps) {
    return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        {gradient("lt-icon-prompt", "#FFC98A")}
        <rect x="3" y="3" width="18" height="18" rx="5" stroke="url(#lt-icon-prompt)" strokeWidth="1.5" />
        <path d="M6.6 8.9h5.4" stroke="url(#lt-icon-prompt)" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M6.6 12.5h9.6" stroke="url(#lt-icon-prompt)" strokeWidth="1.5" strokeLinecap="round" opacity="0.72" />
        <path d="M6.6 16.1h6.4" stroke="url(#lt-icon-prompt)" strokeWidth="1.5" strokeLinecap="round" opacity="0.48" />
        <path d="M17.6 4.9a2.6 2.6 0 0 0 1.8 1.8 2.6 2.6 0 0 0-1.8 1.8 2.6 2.6 0 0 0-1.8-1.8 2.6 2.6 0 0 0 1.8-1.8Z" fill="#FFD9AC" />
    </svg>;
}

export const LANDING_TOOL_ICONS = {
    image: LandingImageIcon,
    video: LandingVideoIcon,
    canvas: LandingCanvasIcon,
    prompts: LandingPromptIcon,
} as const;
