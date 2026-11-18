import type { ThemeConfig } from "antd";

type AdminPalette = {
    bg: string;
    panel: string;
    panelSoft: string;
    ink: string;
    muted: string;
    line: string;
    primary: string;
    primaryHover: string;
    primaryText: string;
    positive: string;
    warning: string;
    danger: string;
    focus: string;
    rowHover: string;
};

function palette(dark: boolean): AdminPalette {
    if (dark) {
        return {
            bg: "#0c0a09",
            panel: "#171412",
            panelSoft: "#1c1917",
            ink: "#fafaf9",
            muted: "#a8a29e",
            line: "#292524",
            primary: "#fafaf9",
            primaryHover: "#ffffff",
            primaryText: "#1c1917",
            positive: "#86c394",
            warning: "#d5a24a",
            danger: "#e07868",
            focus: "rgba(212, 255, 58, 0.22)",
            rowHover: "rgba(255, 255, 255, 0.035)",
        };
    }
    return {
        bg: "#fafaf9",
        panel: "#ffffff",
        panelSoft: "#f5f5f4",
        ink: "#1c1917",
        muted: "#78716c",
        line: "#e7e5e4",
        primary: "#1c1917",
        primaryHover: "#000000",
        primaryText: "#ffffff",
        positive: "#3f7a4c",
        warning: "#9a6a18",
        danger: "#b64838",
        focus: "rgba(212, 255, 58, 0.35)",
        rowHover: "rgba(27, 26, 22, 0.03)",
    };
}

export function getAdminThemeConfig(dark: boolean): ThemeConfig {
    const color = palette(dark);

    return {
        token: {
            borderRadius: 10,
            controlHeight: 38,
            fontSize: 14,
            colorPrimary: color.primary,
            colorPrimaryHover: color.primaryHover,
            colorPrimaryActive: color.primaryHover,
            colorTextLightSolid: color.primaryText,
            colorBgLayout: color.bg,
            colorBgContainer: color.panel,
            colorBgElevated: color.panel,
            colorBorder: color.line,
            colorBorderSecondary: color.line,
            colorText: color.ink,
            colorTextSecondary: color.muted,
            colorTextTertiary: color.muted,
            colorLink: color.ink,
            colorLinkHover: color.ink,
            colorSuccess: color.positive,
            colorWarning: color.warning,
            colorError: color.danger,
            controlOutline: color.focus,
            controlOutlineWidth: 3,
            boxShadow: "none",
            boxShadowSecondary: dark ? "0 18px 54px rgba(0, 0, 0, 0.42)" : "0 18px 54px rgba(24, 21, 13, 0.12)",
            fontFamily: '"DM Sans", "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
        },
        components: {
            Button: {
                fontWeight: 600,
                borderRadius: 9,
                controlHeight: 38,
                defaultShadow: "none",
                primaryShadow: "none",
                dangerShadow: "none",
            },
            Input: {
                borderRadius: 9,
                controlHeight: 38,
                activeShadow: "none",
                hoverBorderColor: color.ink,
                activeBorderColor: color.ink,
            },
            InputNumber: {
                borderRadius: 9,
                controlHeight: 38,
                activeShadow: "none",
                hoverBorderColor: color.ink,
                activeBorderColor: color.ink,
            },
            Select: {
                borderRadius: 9,
                controlHeight: 38,
                optionSelectedBg: color.focus,
                optionSelectedColor: color.ink,
                optionActiveBg: color.rowHover,
            },
            Table: {
                headerBg: color.panelSoft,
                headerColor: color.muted,
                headerSplitColor: "transparent",
                borderColor: color.line,
                rowHoverBg: color.rowHover,
                cellPaddingBlock: 13,
                cellPaddingInline: 16,
                fontSize: 13,
                headerBorderRadius: 0,
            },
            Tabs: {
                inkBarColor: color.ink,
                itemColor: color.muted,
                itemHoverColor: color.ink,
                itemSelectedColor: color.ink,
                titleFontSize: 14,
                horizontalItemGutter: 26,
            },
            Modal: {
                contentBg: color.panel,
                headerBg: color.panel,
                titleColor: color.ink,
                titleFontSize: 18,
                borderRadiusLG: 16,
            },
            Form: {
                labelColor: color.muted,
                labelFontSize: 12,
                itemMarginBottom: 18,
                verticalLabelPadding: "0 0 6px",
            },
            Pagination: {
                itemActiveBg: color.panelSoft,
                itemActiveColor: color.ink,
                itemBg: color.panel,
                itemLinkBg: color.panel,
            },
            Segmented: {
                itemSelectedBg: color.primary,
                itemSelectedColor: color.primaryText,
                trackBg: color.panelSoft,
            },
            Switch: {
                // 开关/勾选是状态指示控件，开启态用品牌荧光绿而非白色主色，暗底上才看得清
                colorPrimary: "#D8FF3E",
                colorPrimaryHover: "#E3FF6B",
            },
            Checkbox: {
                colorPrimary: "#D8FF3E",
                colorPrimaryHover: "#E3FF6B",
            },
            Dropdown: {
                colorBgElevated: color.panel,
                controlItemBgHover: color.rowHover,
                controlItemBgActive: color.focus,
            },
            Card: {
                headerBg: color.panel,
                bodyPadding: 20,
                borderRadiusLG: 14,
            },
            Tag: {
                defaultBg: color.panelSoft,
                defaultColor: color.muted,
            },
        },
    };
}
