/**
 * 顶栏导航图标（自绘一套，7 个入口 7 个不同比喻）。
 *
 * 之前 首页 / 我的画布 都用 LayoutGrid，看上去是同一个图标；
 * 其余是 lucide 通用图标，放在一起缺乏整体感。
 *
 * 这里统一：24 网格、1.7 描边、圆头圆角、只用 currentColor，
 * 图形元素控制在 2~4 条路径，保证缩到 16px 仍然清楚。
 */

type IconProps = { className?: string };

const base = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: "false" as const,
};

/** 首页：院落感的小房子（屋檐 + 门），比纯网格更像「家」。 */
export function NavHomeIcon({ className }: IconProps) {
    return <svg {...base} className={className}>
        <path d="M3.9 10.4 11.2 4.3a1.2 1.2 0 0 1 1.6 0l7.3 6.1" />
        <path d="M5.9 9.2v9.4a1.9 1.9 0 0 0 1.9 1.9h8.4a1.9 1.9 0 0 0 1.9-1.9V9.2" />
        <path d="M9.9 20.5v-4.2a2.1 2.1 0 0 1 4.2 0v4.2" />
    </svg>;
}

/** 我的画布：三层叠放的画板，表示「多个画布/项目」。 */
export function NavCanvasIcon({ className }: IconProps) {
    return <svg {...base} className={className}>
        <path d="M12 2.9 3.2 7.5l8.8 4.6 8.8-4.6L12 2.9Z" />
        <path d="M3.2 12.2 12 16.8l8.8-4.6" />
        <path d="M3.2 16.6 12 21.2l8.8-4.6" />
    </svg>;
}

/** 创作：一支带笔锋分界的笔。16px 下加星芒会糊成一个点，所以保持单一形体。 */
export function NavCreateIcon({ className }: IconProps) {
    return <svg {...base} className={className}>
        <path d="M6.4 19.6l1-3.8L16.9 6.3a2.35 2.35 0 0 1 3.3 3.3L10.7 19.1l-4.3.5Z" />
        <path d="M15 8l2.8 2.8" />
    </svg>;
}

/** 发现与灵感：放大镜里放一枚四角星，探索 + 灵感两层含义。 */
export function NavExploreIcon({ className }: IconProps) {
    return <svg {...base} className={className}>
        <circle cx="10.6" cy="10.6" r="6.7" />
        <path d="M15.5 15.5 20.6 20.6" />
        <path d="M10.6 7.8a2.8 2.8 0 0 0 2.8 2.8 2.8 2.8 0 0 0-2.8 2.8 2.8 2.8 0 0 0-2.8-2.8 2.8 2.8 0 0 0 2.8-2.8Z" />
    </svg>;
}

/** 素材库：文件夹里放一张图（山峦），比空文件夹更具体。 */
export function NavAssetsIcon({ className }: IconProps) {
    return <svg {...base} className={className}>
        <path d="M3.6 8.4a2 2 0 0 1 2-2h3.2l1.9 2.2h7.7a2 2 0 0 1 2 2v7.6a2 2 0 0 1-2 2H5.6a2 2 0 0 1-2-2V8.4Z" />
        <path d="M6.4 17.4l2.5-2.6a1.5 1.5 0 0 1 2.1 0l1.4 1.4 1.1-1.1a1.4 1.4 0 0 1 2 0l1.7 1.7" />
    </svg>;
}

/** 提示词库：书 + 书签飘带。 */
export function NavPromptsIcon({ className }: IconProps) {
    return <svg {...base} className={className}>
        <path d="M6.4 3.8h9.2a2.4 2.4 0 0 1 2.4 2.4v13.6a2.4 2.4 0 0 1-2.4 2.4H6.4A2.4 2.4 0 0 1 4 19.8V6.2a2.4 2.4 0 0 1 2.4-2.4Z" />
        <path d="M8.4 3.8v6.8l2.9-1.9 2.9 1.9V3.8" />
    </svg>;
}

/** 管理后台：竖向推子面板，比盾牌更贴「后台管理」。 */
export function NavAdminIcon({ className }: IconProps) {
    return <svg {...base} className={className}>
        <path d="M3.6 7.6h4.5" />
        <path d="M12.3 7.6h8.1" />
        <circle cx="10.2" cy="7.6" r="2.1" />
        <path d="M3.6 12h8.3" />
        <path d="M16.5 12h3.9" />
        <circle cx="14.4" cy="12" r="2.1" />
        <path d="M3.6 16.4h2.7" />
        <path d="M10.5 16.4h9.9" />
        <circle cx="8.4" cy="16.4" r="2.1" />
    </svg>;
}
