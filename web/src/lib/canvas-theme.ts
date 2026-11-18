export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

/**
 * 画布视觉令牌：迁移自 BeefTV 的画布主题合同。
 * - 画布底色取 #141414（不是纯黑），点阵保持低对比；
 * - 节点是内容容器，常态不描边、只用柔和投影区分层级，选中才出现 1px 亮描边；
 * - 工具栏是半透明玻璃层（rgba 面板 + backdrop-blur），层级靠明度组织，不靠重阴影。
 */
export const canvasThemes = {
    light: {
        canvas: {
            background: "#f0f0f0",
            // 网格/点阵令牌自带最终透明度（不再由 CanvasGrid 二次叠 opacity），
            // 直接换算成"落在 #f0f0f0 上的实际灰度"，方便调对比度。
            dot: "rgba(0,0,0,.27)",
            line: "rgba(0,0,0,.37)",
            selectionStroke: "#111827",
            selectionFill: "rgba(17,17,17,.10)",
        },
        node: {
            label: "#4b5563",
            fill: "#ffffff",
            panel: "#ffffff",
            stroke: "#e2e4e8",
            edge: "rgba(15,23,42,.16)",
            shadow: "0 6px 18px rgba(15,23,42,.08)",
            hoverShadow: "0 10px 24px rgba(15,23,42,.12)",
            activeStroke: "#111827",
            placeholder: "#9ca3af",
            text: "#111827",
            muted: "#6b7280",
            faint: "#9ca3af",
        },
        // 浮动菜单（双击画布 / 连线落点）：必须是实色面板，避免与画布内容视觉叠字。
        menu: {
            panel: "#ffffff",
            border: "rgba(17,24,39,.12)",
            shadow: "0 24px 60px rgba(15,23,42,.16), 0 2px 10px rgba(15,23,42,.08)",
            divider: "rgba(17,24,39,.07)",
            itemHover: "rgba(17,24,39,.05)",
            iconBg: "rgba(17,24,39,.045)",
            iconColor: "#4b5563",
            header: "#4b5563",
            title: "#111827",
            subtitle: "#6b7280",
        },
        toolbar: {
            panel: "rgba(255,255,255,.94)",
            border: "rgba(17,24,39,.10)",
            item: "#4b5563",
            itemHover: "rgba(17,24,39,.06)",
            activeBg: "rgba(17,24,39,.10)",
            activeText: "#111827",
        },
        composer: {
            surface: "rgba(255,255,255,.98)",
            border: "rgba(17,24,39,.10)",
            borderFocus: "rgba(17,24,39,.30)",
            shadow: "0 1px 2px rgba(15,23,42,.06), 0 16px 40px rgba(15,23,42,.12)",
            chip: "rgba(17,24,39,.05)",
            chipHover: "rgba(17,24,39,.09)",
            chipText: "#1f2937",
            muted: "#6b7280",
            divider: "rgba(17,24,39,.08)",
            slot: "rgba(17,24,39,.035)",
            slotBorder: "rgba(17,24,39,.18)",
            sendDisabledBg: "rgba(17,24,39,.07)",
            sendDisabledText: "#9ca3af",
        },
        accent: {
            primary: "#111827",
            primarySoft: "rgba(17,17,17,.10)",
            onPrimary: "#ffffff",
            danger: "#e11d48",
        },
        // 品牌青柠：浅底上换成深橄榄，保证文字对比度
        brand: "#4D7C0F",
    },
    dark: {
        canvas: {
            background: "#141414",
            // 点阵/格子不用元素级 opacity 衰减：软边圆点叠上 0.34 的 opacity 后，
            // 峰值只剩 #212121（相对 #141414 只差 13 级灰），肉眼基本看不见，
            // 这就是"点"看起来不生效的原因。令牌直接给最终透明度。
            dot: "rgba(255,255,255,.2)",
            line: "rgba(255,255,255,.07)",
            selectionStroke: "#f1f1f1",
            selectionFill: "rgba(255,255,255,.12)",
        },
        node: {
            label: "#a3a3a3",
            fill: "#262626",
            panel: "#222222",
            stroke: "rgba(255,255,255,.18)",
            edge: "rgba(255,255,255,.18)",
            shadow: "0 8px 24px rgba(0,0,0,.34)",
            hoverShadow: "0 12px 30px rgba(0,0,0,.46)",
            activeStroke: "#f1f1f1",
            placeholder: "#737373",
            text: "#ededed",
            muted: "#a3a3a3",
            faint: "#666666",
        },
        menu: {
            panel: "#242424",
            border: "rgba(255,255,255,.15)",
            shadow: "0 28px 70px rgba(0,0,0,.62), 0 4px 14px rgba(0,0,0,.44)",
            divider: "rgba(255,255,255,.08)",
            itemHover: "rgba(255,255,255,.07)",
            iconBg: "rgba(255,255,255,.055)",
            iconColor: "#b4b4b4",
            header: "#c8c8c8",
            title: "#ededed",
            subtitle: "#9a9a9a",
        },
        toolbar: {
            panel: "rgba(20,20,20,.97)",
            border: "rgba(255,255,255,.1)",
            item: "#d4d4d4",
            itemHover: "rgba(255,255,255,.07)",
            activeBg: "rgba(255,255,255,.10)",
            activeText: "#f5f6f8",
        },
        composer: {
            surface: "rgba(28,28,30,.97)",
            border: "rgba(255,255,255,.10)",
            borderFocus: "rgba(255,255,255,.28)",
            shadow: "0 1px 2px rgba(0,0,0,.30), 0 20px 48px rgba(0,0,0,.50)",
            chip: "rgba(255,255,255,.06)",
            chipHover: "rgba(255,255,255,.11)",
            chipText: "#e7e7e7",
            muted: "#9a9a9a",
            divider: "rgba(255,255,255,.08)",
            slot: "rgba(255,255,255,.04)",
            slotBorder: "rgba(255,255,255,.20)",
            sendDisabledBg: "rgba(255,255,255,.08)",
            sendDisabledText: "#6f6f6f",
        },
        accent: {
            primary: "#f5f5f5",
            primarySoft: "rgba(255,255,255,.11)",
            onPrimary: "#131313",
            danger: "#fb7185",
        },
        // 品牌青柠：深色画布上用原色
        brand: "#D8FF3E",
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
