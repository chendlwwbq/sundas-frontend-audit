import type { CSSProperties } from "react";
import { Dropdown } from "antd";
import { ChevronDown, Keyboard, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { changeAppLocale, listLocales, type LocaleCode } from "@/i18n";
import { canvasThemes } from "@/lib/canvas-theme";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";

type UserStatusActionsProps = {
    showConfig?: boolean;
    variant?: "default" | "canvas";
    onOpenShortcuts?: () => void;
};

/** 语言切换下拉：自动列出 i18n 注册表内全部语言，登录/未登录均可复用 */
export function LanguageMenu({ buttonClassName, iconStyle }: { buttonClassName?: string; iconStyle?: CSSProperties }) {
    const { i18n, t } = useTranslation();
    const locale = i18n.resolvedLanguage as LocaleCode;
    const locales = listLocales();
    const currentLocale = locales.find((item) => item.code === locale);
    const languageLabel = t("topNav.switchLanguage", { language: currentLocale ? currentLocale.label : locale });

    return (
        <Dropdown
            trigger={["click"]}
            placement="bottom"
            menu={{
                items: locales.map((item) => ({ key: item.code, label: item.label })),
                selectable: true,
                selectedKeys: [locale],
                onClick: ({ key }) => {
                    if (key !== locale) void changeAppLocale(key as LocaleCode);
                },
            }}
        >
            <button type="button" className={buttonClassName} style={iconStyle} aria-label={languageLabel} aria-haspopup="menu">
                {currentLocale?.short ?? "中"}
                <ChevronDown className="size-3 opacity-60" />
            </button>
        </Dropdown>
    );
}

export function UserStatusActions({ showConfig = true, variant = "default", onOpenShortcuts }: UserStatusActionsProps) {
    const { t } = useTranslation();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = useThemeStore((state) => state.theme);
    const canvasTheme = canvasThemes[theme];
    const naturalIconClass = "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10 dark:hover:text-white [&_svg]:size-4";
    const iconStyle: CSSProperties | undefined = variant === "canvas" ? { color: canvasTheme.node.text } : undefined;

    return (
        <div className="inline-flex shrink-0 items-center gap-1">
            {showConfig ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={() => openConfigDialog(false)} aria-label={t("navigation.config")} title={t("navigation.config")}>
                    <Settings2 className="size-4" />
                </button>
            ) : null}
            <LanguageMenu
                buttonClassName={`${naturalIconClass} gap-0.5 px-1.5 text-[11px] font-semibold tracking-tight`}
                iconStyle={iconStyle}
            />
            {onOpenShortcuts ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={onOpenShortcuts} aria-label={t("topNav.shortcuts")} title={t("topNav.shortcuts")}>
                    <Keyboard className="size-4" />
                </button>
            ) : null}
        </div>
    );
}
