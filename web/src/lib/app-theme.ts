import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

// sundas brand: lime #D8FF3E accent on near-black (dark) / warm white (light).
const brand = {
    primary: "#D8FF3E",
    primaryInk: "#11130A",
    primaryHover: "#E3FF6B",
    primaryActive: "#B8E81C",
    link: { light: "#4D7C0F", dark: "#D8FF3E" },
};

const neutral = {
    light: {
        elevatedBg: "#FFFFFF",
        itemHoverBg: "rgba(29, 33, 41, 0.06)",
        itemSelectedBg: "rgba(216, 255, 62, 0.12)",
        itemSelectedHoverBg: "rgba(216, 255, 62, 0.18)",
        itemText: "#1D2129",
        tableSelectedBg: "rgba(216, 255, 62, 0.08)",
        tableSelectedHoverBg: "rgba(216, 255, 62, 0.14)",
    },
    dark: {
        elevatedBg: "#1F1F1F",
        itemHoverBg: "rgba(255, 255, 255, 0.08)",
        itemSelectedBg: "rgba(255, 255, 255, 0.08)",
        itemSelectedHoverBg: "rgba(255, 255, 255, 0.12)",
        itemText: "rgba(255, 255, 255, 0.88)",
        tableSelectedBg: "rgba(216, 255, 62, 0.08)",
        tableSelectedHoverBg: "rgba(216, 255, 62, 0.14)",
    },
};

const fontFamily =
    "'CapCut Sans', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif";

export function getAntThemeConfig(dark: boolean): ThemeConfig {
    const color = dark ? neutral.dark : neutral.light;

    return {
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        cssVar: { key: dark ? "sundas-dark" : "sundas-light" },
        token: {
            colorPrimary: brand.primary,
            colorInfo: brand.primary,
            colorLink: dark ? brand.link.dark : brand.link.light,
            colorLinkHover: dark ? brand.primaryHover : "#3F6212",
            colorLinkActive: dark ? brand.primary : brand.link.light,
            colorTextLightSolid: brand.primaryInk,
            colorBgElevated: color.elevatedBg,
            colorBgContainer: dark ? "#1A1A1A" : "#FFFFFF",
            colorBgBase: dark ? "#121212" : "#F7F8FA",
            colorText: dark ? "rgba(255, 255, 255, 0.88)" : "#1D2129",
            colorTextSecondary: dark ? "rgba(255, 255, 255, 0.70)" : "#4E5969",
            colorTextTertiary: dark ? "rgba(255, 255, 255, 0.60)" : "#86909C",
            colorTextQuaternary: dark ? "rgba(255, 255, 255, 0.40)" : "#C9CDD4",
            colorBorder: dark ? "rgba(255, 255, 255, 0.12)" : "#C9CDD4",
            colorBorderSecondary: dark ? "rgba(255, 255, 255, 0.08)" : "#E5E6EB",
            borderRadius: 8,
            fontFamily,
            controlItemBgHover: color.itemHoverBg,
            controlItemBgActive: color.itemSelectedBg,
            controlItemBgActiveHover: color.itemSelectedHoverBg,
            // 聚焦反馈：即梦式 3px 浅蓝光圈由组件样式提供，关闭 antd 默认实心外框
            controlOutline: "transparent",
            boxShadowSecondary: dark ? "0 12px 40px rgba(0, 0, 0, 0.5)" : "0 12px 40px rgba(0, 0, 0, 0.12)",
        },
        components: {
            Input: {
                activeShadow: "none",
                colorBorder: dark ? "rgba(255, 255, 255, 0.12)" : "#C9CDD4",
            },
            InputNumber: {
                activeShadow: "none",
            },
            Button: {
                primaryShadow: "none",
                fontWeight: 500,
            },
            Checkbox: {
                colorPrimary: brand.primary,
                colorPrimaryHover: brand.primaryHover,
            },
            Radio: {
                colorPrimary: brand.primary,
            },
            Switch: {
                colorPrimary: brand.primary,
                colorPrimaryHover: brand.primaryHover,
            },
            Slider: {
                colorPrimary: brand.primary,
                colorPrimaryBorder: brand.primary,
                colorPrimaryBorderHover: brand.primaryHover,
            },
            Tabs: {
                // 选中态统一走品牌青柠（青柠文字 + 青柠下划线），不再用白字胶囊
                inkBarColor: brand.primary,
                itemColor: dark ? "rgba(255, 255, 255, 0.60)" : "#4E5969",
                itemHoverColor: dark ? "rgba(255, 255, 255, 0.92)" : "#1D2129",
                itemSelectedColor: dark ? brand.primary : "#3F6212",
                titleFontSize: 14,
            },
            Segmented: {
                trackBg: dark ? "rgba(255, 255, 255, 0.06)" : "#F2F3F5",
                itemColor: dark ? "rgba(255, 255, 255, 0.60)" : "#4E5969",
                itemHoverColor: dark ? "rgba(255, 255, 255, 0.92)" : "#1D2129",
                itemHoverBg: dark ? "rgba(255, 255, 255, 0.06)" : "rgba(29, 33, 41, 0.04)",
                // 激活态：青柠淡底 + 青柠字（与素材库/提示词库的筛选胶囊同一套语言）
                itemSelectedBg: dark ? "rgba(216, 255, 62, 0.16)" : "#EAFFB4",
                itemSelectedColor: dark ? brand.primary : "#3F6212",
            },
            Dropdown: {
                colorBgElevated: color.elevatedBg,
                colorText: color.itemText,
                controlItemBgHover: color.itemHoverBg,
                controlItemBgActive: color.itemSelectedBg,
                controlItemBgActiveHover: color.itemSelectedHoverBg,
            },
            Menu: {
                popupBg: color.elevatedBg,
                itemActiveBg: color.itemSelectedBg,
                itemHoverBg: color.itemHoverBg,
                itemSelectedBg: color.itemSelectedBg,
                itemSelectedColor: color.itemText,
                darkPopupBg: neutral.dark.elevatedBg,
                darkItemHoverBg: neutral.dark.itemHoverBg,
                darkItemSelectedBg: neutral.dark.itemSelectedBg,
                darkItemSelectedColor: neutral.dark.itemText,
            },
            Select: {
                activeOutlineColor: "transparent",
                optionActiveBg: color.itemHoverBg,
                optionSelectedBg: color.itemSelectedBg,
                optionSelectedColor: color.itemText,
            },
            Table: {
                rowSelectedBg: color.tableSelectedBg,
                rowSelectedHoverBg: color.tableSelectedHoverBg,
            },
            Modal: {
                contentBg: dark ? "#1A1A1A" : "#FFFFFF",
                headerBg: dark ? "#1A1A1A" : "#FFFFFF",
            },
            Tooltip: {
                // 即梦暗色 tooltip：深灰底 + 白字（rgba(28,28,28,.96)）
                colorBgSpotlight: dark ? "rgba(28, 28, 28, 0.96)" : "#1D2129",
                colorTextLightSolid: dark ? "rgba(255, 255, 255, 0.88)" : "#FFFFFF",
            },
        },
    };
}
