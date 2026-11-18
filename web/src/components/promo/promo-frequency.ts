import type { PromoItem } from "@/services/api/promo";

/**
 * 按浏览器本地记录判断是否应该展示。
 * visit = 每次都展示；session = 每个会话一次；daily = 每天一次；24h = 距上次至少 24 小时。
 */
export function canShowPromo(storagePrefix: string, item: PromoItem) {
    if (item.frequency === "visit") return true;
    if (item.frequency === "session") return sessionStorage.getItem(`${storagePrefix}${item.id}:session`) !== "1";
    if (item.frequency === "daily") return localStorage.getItem(`${storagePrefix}${item.id}:day`) !== new Date().toDateString();
    const last = Number(localStorage.getItem(`${storagePrefix}${item.id}:time`) ?? 0);
    return !last || Date.now() - last >= 24 * 60 * 60 * 1000;
}

export function markPromoShown(storagePrefix: string, item: PromoItem) {
    if (item.frequency === "visit") return;
    if (item.frequency === "session") {
        sessionStorage.setItem(`${storagePrefix}${item.id}:session`, "1");
        return;
    }
    if (item.frequency === "daily") {
        localStorage.setItem(`${storagePrefix}${item.id}:day`, new Date().toDateString());
        return;
    }
    localStorage.setItem(`${storagePrefix}${item.id}:time`, String(Date.now()));
}
