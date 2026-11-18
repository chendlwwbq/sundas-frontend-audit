import { useEffect, useState } from "react";
import { Gift, X } from "lucide-react";

import { trackPromoClick, type PromoItem } from "@/services/api/promo";
import { canShowPromo, markPromoShown } from "./promo-frequency";
import { usePromoAction } from "./use-promo-action";
import "./promo.css";

const STORAGE_PREFIX = "sundas:promo:corner:";

/**
 * 右下角浮动卡片：只有文字和按钮的轻量引导位。
 * 频率按浏览器本地记录，和居中弹窗相互独立。
 * 关闭（X）只隐藏当次页面，不写入任何记录 —— 刷新后只要没到频率上限还会出现；
 * 频率只在用户真正点击（卡片主体 / CTA 按钮）时才写入。
 */
export function PromoCorner({ item, workbench = false }: { item: PromoItem | null; workbench?: boolean }) {
    const action = usePromoAction();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        setOpen(false);
        if (!item || !canShowPromo(STORAGE_PREFIX, item)) return;
        const timer = window.setTimeout(() => setOpen(true), 900);
        return () => window.clearTimeout(timer);
    }, [item]);

    if (!item) return null;

    const clickable = item.actionType !== "none";

    const run = () => {
        markPromoShown(STORAGE_PREFIX, item);
        void trackPromoClick({ placement: "corner", itemId: item.id });
        if (clickable) action(item);
        setOpen(false);
    };

    return (
        <div
            className={`promo-corner${workbench ? " promo-corner--workbench" : ""}${open ? " is-open" : ""}`}
            role="dialog"
            aria-label={item.title || "活动提醒"}
            aria-hidden={!open}
            inert={!open ? true : undefined}
        >
            <button
                type="button"
                className="promo-corner-close"
                onClick={() => setOpen(false)}
                aria-label="关闭"
            >
                <X className="size-3.5" />
            </button>
            <button type="button" className="promo-corner-body" onClick={run} disabled={!clickable}>
                <span className="promo-corner-icon" aria-hidden="true">
                    <Gift className="size-[19px]" strokeWidth={2.1} />
                </span>
                <span className="promo-corner-text">
                    <strong className="promo-corner-title">{item.title || "活动提醒"}</strong>
                    {item.description ? <span className="promo-corner-note">{item.description}</span> : null}
                </span>
            </button>
            {item.ctaLabel ? (
                <button type="button" className="promo-corner-cta" onClick={run} disabled={!clickable}>
                    {item.ctaLabel}
                </button>
            ) : null}
        </div>
    );
}
