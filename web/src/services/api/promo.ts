import { apiRequest } from "./client";

export type PromoPlacement = "topbar" | "carousel" | "popup" | "corner";
export type PromoActionType = "none" | "internal" | "external" | "contact" | "copy";
export type PromoFrequency = "visit" | "session" | "24h" | "daily";
export type PromoContactChannel = "wechat" | "wechat_group" | "wecom" | "qq" | "qq_group" | "email" | "phone" | "telegram" | "whatsapp" | "link";

export type PromoItem = {
    id: string;
    placement: PromoPlacement;
    enabled: boolean;
    sort: number;
    title: string;
    description: string;
    imageUrl: string;
    mobileImageUrl: string;
    alt: string;
    ctaLabel: string;
    actionType: PromoActionType;
    actionValue: string;
    countdownAt: string | null;
    frequency: PromoFrequency;
    createdAt: string;
    updatedAt: string;
};

export type PromoContact = {
    id: string;
    channel: PromoContactChannel;
    name: string;
    value: string;
    qrUrl: string;
    description: string;
    enabled: boolean;
    sort: number;
    createdAt: string;
    updatedAt: string;
};

export type PromoClickStat = {
    placement: "topbar" | "carousel" | "popup" | "corner" | "contact";
    itemId: string | null;
    contactId: string | null;
    label: string;
    today: number;
    last7: number;
    total: number;
};

export type PromoConfig = {
    topbar: PromoItem | null;
    carousel: PromoItem[];
    popup: PromoItem | null;
    corner: PromoItem | null;
    contacts: PromoContact[];
};

export type AdminPromoData = { items: PromoItem[]; contacts: PromoContact[]; clicks: PromoClickStat[] };

export async function fetchPromoConfig() {
    return apiRequest<PromoConfig>("/api/promo");
}

let promoCache: PromoConfig | null = null;
let promoPending: Promise<PromoConfig> | null = null;

// 宣发配置被多个组件同时请求（布局、首页、联系按钮、联系弹窗），共用一份结果避免重复拉取。
export function loadPromoConfig() {
    if (promoCache) return Promise.resolve(promoCache);
    if (promoPending) return promoPending;
    promoPending = fetchPromoConfig()
        .then((data) => {
            promoCache = data;
            return data;
        })
        .finally(() => {
            promoPending = null;
        });
    return promoPending;
}

export async function trackPromoClick(input: { placement: "topbar" | "carousel" | "popup" | "corner" | "contact"; itemId?: string; contactId?: string }) {
    try {
        await apiRequest("/api/promo/click", { method: "POST", json: input });
    } catch {
        // Click tracking must never block the actual action.
    }
}
