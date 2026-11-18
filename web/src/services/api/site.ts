import { apiRequest } from "./client";

/** 后台「首页文案」配置：全部可为空，空值表示沿用前端内置默认文案。 */
export type SiteHomeCopy = {
    heroKicker?: string;
    heroTitleLead?: string;
    heroTitleAccent?: string;
    heroTitleTail?: string;
    heroDescription?: string;
    heroVideoCta?: string;
    heroCanvasCta?: string;
    composerVideoMode?: string;
    composerImageMode?: string;
    composerPlaceholder?: string;
    composerStartCta?: string;
    composerLoginCta?: string;
    composerHint?: string;
    canvasesTitle?: string;
    canvasesNote?: string;
    canvasesViewAll?: string;
    canvasesNew?: string;
    canvasesOpen?: string;
    canvasesEnabled?: boolean;
    inspirationTitle?: string;
    inspirationDescription?: string;
    inspirationViewAll?: string;
    inspirationVideoTab?: string;
    inspirationImageTab?: string;
    inspirationEmpty?: string;
    inspirationEnabled?: boolean;
    promptLimit?: number;
    /** 灵感大厅只展示该来源的提示词；留空表示不限来源。 */
    inspirationSourceId?: string;
    /** 视频页签条数，0 表示沿用 promptLimit。 */
    inspirationVideoLimit?: number;
    /** 图片页签条数，0 表示沿用 promptLimit。 */
    inspirationImageLimit?: number;
};

export type SiteAnnouncement = { id: string; title: string; content: string };

export type SiteInfo = {
    site: { name: string; description: string; apiIntegrationUrl?: string };
    home: SiteHomeCopy;
    creditPriceCents: number;
    minCredits: number;
    payTypes: string[];
    providers: string[];
    alipayProducts?: ('page' | 'wap')[];
    announcements: SiteAnnouncement[];
};

let siteCache: SiteInfo | null = null;
let sitePending: Promise<SiteInfo> | null = null;

/** 站点信息与首页文案在多个组件里都会用到，合并为一次请求并复用结果。 */
export function loadSiteInfo() {
    if (siteCache) return Promise.resolve(siteCache);
    if (sitePending) return sitePending;
    sitePending = apiRequest<SiteInfo>("/api/site")
        .then((data) => {
            siteCache = data;
            return data;
        })
        .finally(() => {
            sitePending = null;
        });
    return sitePending;
}

export function clearSiteInfoCache() {
    siteCache = null;
}

/** 后台填了就用后台的，没填则回退到传入的默认文案（跟随界面语言）。 */
export function copyOf(value: unknown, fallback: string) {
    return typeof value === "string" && value.trim() ? value : fallback;
}
