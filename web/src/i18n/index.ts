import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import zhCN from "@/i18n/locales/zh-CN";
import { accountZh } from "@/i18n/locales/account";

/** 默认语言资源同步打进首屏；其余语言改成按需 chunk，切语言时才下载。 */
const eagerResources = { ...zhCN, ...accountZh } as Record<string, unknown>;

/**
 * 语言注册表 —— 新增语言（如韩语 ko-KR、日语 ja-JP）只需两步：
 *   1. 在 i18n/locales/ 下新增对应语言资源文件（key 结构与 zh-CN.ts 完全一致）
 *   2. 在下面注册一行：code → { label, short, load }
 * 切换入口（顶栏/账户菜单）会自动列出所有已注册语言，无需改组件。
 */
export const LOCALE_REGISTRY = {
    "zh-CN": { label: "简体中文", short: "中", load: async () => eagerResources },
    "en-US": {
        label: "English",
        short: "EN",
        load: async () => {
            const [core, account] = await Promise.all([import("@/i18n/locales/en-US"), import("@/i18n/locales/account-en")]);
            return { ...core.default, ...account.accountEn } as Record<string, unknown>;
        },
    },
    // "ko-KR": { label: "한국어", short: "한", load: async () => (await import("@/i18n/locales/ko-KR")).default },
    // "ja-JP": { label: "日本語", short: "日", load: async () => (await import("@/i18n/locales/ja-JP")).default },
} as const;


export type LocaleCode = keyof typeof LOCALE_REGISTRY;
/** 兼容旧代码的类型别名 */
export type AppLocale = LocaleCode;

export const DEFAULT_LOCALE: LocaleCode = "zh-CN";
const SUPPORTED_LOCALES = Object.keys(LOCALE_REGISTRY) as LocaleCode[];

const LOCALE_STORAGE_KEY = "sundas:locale";

function resolveInitialLocale(): LocaleCode {
    try {
        const saved = localStorage.getItem(LOCALE_STORAGE_KEY) as LocaleCode | null;
        if (saved && SUPPORTED_LOCALES.includes(saved)) return saved;
    } catch {
        /* 隐私模式等场景忽略 */
    }
    return DEFAULT_LOCALE;
}

i18n.use(initReactI18next).init({
    resources: { [DEFAULT_LOCALE]: { translation: eagerResources } },
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: SUPPORTED_LOCALES,
    initAsync: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
});

/** 把当前语言同步到 <html>，供 CSS 做语言级样式微调（如 html[lang="en-US"]） */
function syncDocumentLang(locale: LocaleCode) {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale;
    document.documentElement.classList.toggle("lang-en", locale === "en-US");
}

/** 供语言切换菜单渲染的列表 */
export function listLocales(): Array<{ code: LocaleCode; label: string; short: string }> {
    return SUPPORTED_LOCALES.map((code) => ({ code, label: LOCALE_REGISTRY[code].label, short: LOCALE_REGISTRY[code].short }));
}

/** 确保某语言资源已就绪（非默认语言走动态 import，只在用到时下载一次）。 */
export async function ensureLocale(locale: LocaleCode) {
    if (i18n.hasResourceBundle(locale, "translation")) return;
    const resources = await LOCALE_REGISTRY[locale].load();
    i18n.addResourceBundle(locale, "translation", resources, true, true);
}

export function changeAppLocale(locale: LocaleCode) {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    syncDocumentLang(locale);
    return ensureLocale(locale).then(() => i18n.changeLanguage(locale));
}

/**
 * 启动时对齐语言：默认中文已在 init 里就绪，零开销；
 * 只有用户上次选了其它语言，才在首屏渲染前把那份资源取回来，避免先闪中文再切。
 */
export async function bootstrapLocale(): Promise<LocaleCode> {
    const locale = resolveInitialLocale();
    if (locale !== DEFAULT_LOCALE) {
        await ensureLocale(locale);
        await i18n.changeLanguage(locale);
    }
    syncDocumentLang(locale);
    return locale;
}

syncDocumentLang(DEFAULT_LOCALE);

export default i18n;
