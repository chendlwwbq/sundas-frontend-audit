import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { trackPromoClick, type PromoItem } from "@/services/api/promo";
import { useCountdown } from "./use-countdown";
import { usePromoAction } from "./use-promo-action";
import "./promo.css";

export function PromoTopBar({ item }: { item: PromoItem | null }) {
    const action = usePromoAction();
    const [closed, setClosed] = useState(false);
    const countdown = useCountdown(item?.countdownAt ?? null);

    useEffect(() => {
        if (!item) return;
        setClosed(sessionStorage.getItem(`sundas:promo:topbar:${item.id}`) === "1");
    }, [item]);

    if (!item || closed || countdown?.expired) return null;

    const clickable = item.actionType !== "none";
    const run = () => {
        if (!clickable) return;
        void trackPromoClick({ placement: "topbar", itemId: item.id });
        action(item);
    };

    return (
        <div className={clickable ? "promo-topbar is-clickable" : "promo-topbar"}>
            <div
                className="promo-topbar-inner"
                role={clickable ? "link" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={run}
                onKeyDown={(event) => {
                    if (!clickable) return;
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        run();
                    }
                }}
            >
                {countdown ? (
                    <span className="promo-topbar-countdown" aria-label="活动倒计时">
                        <b key={`d-${countdown.days}`}>{String(countdown.days).padStart(2, "0")}</b><em>:</em>
                        <b key={`h-${countdown.hours}`}>{String(countdown.hours).padStart(2, "0")}</b><em>:</em>
                        <b key={`m-${countdown.minutes}`}>{String(countdown.minutes).padStart(2, "0")}</b><em>:</em>
                        <b key={`s-${countdown.seconds}`}>{String(countdown.seconds).padStart(2, "0")}</b>
                    </span>
                ) : null}
                <span className="promo-topbar-text">{item.title}</span>
                {item.ctaLabel && clickable ? <span className="promo-topbar-cta">{item.ctaLabel}</span> : null}
            </div>
            <button
                type="button"
                className="promo-topbar-close"
                aria-label="关闭活动条"
                onClick={(event) => {
                    event.stopPropagation();
                    sessionStorage.setItem(`sundas:promo:topbar:${item.id}`, "1");
                    setClosed(true);
                }}
            >
                <X className="size-3.5" />
            </button>
        </div>
    );
}
