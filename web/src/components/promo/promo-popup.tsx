import { useEffect, useState } from "react";
import { Modal } from "antd";
import { ArrowRight, X } from "lucide-react";

import { usePromoPopupSlot } from "@/components/layout/lazy-overlays";
import { trackPromoClick, type PromoItem } from "@/services/api/promo";
import { canShowPromo, markPromoShown } from "./promo-frequency";
import { useCountdown } from "./use-countdown";
import { usePromoAction } from "./use-promo-action";
import "./promo.css";

const STORAGE_PREFIX = "sundas:promo:popup:";

function pad(value: number) {
    return String(value).padStart(2, "0");
}

export function PromoPopup({ item }: { item: PromoItem | null }) {
    const action = usePromoAction();
    const [open, setOpen] = useState(false);
    const [imageFailed, setImageFailed] = useState(false);
    const countdown = useCountdown(open ? (item?.countdownAt ?? null) : null);
    const lines = (item?.description ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    const clickable = Boolean(item && item.ctaLabel.trim() && item.actionType !== "none");
    const hasBody = lines.length > 0 || clickable;

    useEffect(() => {
        setOpen(false);
        setImageFailed(false);
        if (!item || !canShowPromo(STORAGE_PREFIX, item)) return;
        if (item.countdownAt && new Date(item.countdownAt).getTime() <= Date.now()) return;
        const timer = window.setTimeout(() => {
            markPromoShown(STORAGE_PREFIX, item);
            setOpen(true);
        }, 1200);
        return () => window.clearTimeout(timer);
    }, [item]);

    useEffect(() => {
        if (countdown?.expired) setOpen(false);
    }, [countdown?.expired]);

    const showImage = Boolean(item?.imageUrl) && !imageFailed;
    const showCard = Boolean(item && (showImage || hasBody));
    const canShowQueuedModal = usePromoPopupSlot(Boolean(item && open && showCard));

    if (!item) return null;

    const run = () => {
        void trackPromoClick({ placement: "popup", itemId: item.id });
        action(item);
        setOpen(false);
    };

    return (
        <Modal
            open={canShowQueuedModal}
            onCancel={() => setOpen(false)}
            footer={null}
            centered
            width={520}
            closable={false}
            className="promo-popup-modal"
            styles={{
                container: { padding: 0, background: "transparent", boxShadow: "none" },
                body: { padding: 0 },
                mask: { background: "rgba(8, 7, 6, 0.66)", backdropFilter: "blur(6px)" },
            }}
        >
            <div className={`promo-popup-card${showImage ? "" : " is-text-only"}`}>
                <button type="button" className="promo-popup-close" onClick={() => setOpen(false)} aria-label="关闭">
                    <X className="size-4" />
                </button>
                {showImage ? (
                    <div className={`promo-popup-hero${item.mobileImageUrl ? " has-mobile-art" : ""}`}>
                        <picture>
                            {item.mobileImageUrl ? <source media="(max-width: 760px)" srcSet={item.mobileImageUrl} /> : null}
                            <img
                                src={item.imageUrl}
                                alt={item.alt || item.title}
                                onError={() => {
                                    setImageFailed(true);
                                    if (!hasBody) setOpen(false);
                                }}
                            />
                        </picture>
                    </div>
                ) : null}
                {hasBody ? (
                    <div className="promo-popup-body">
                        {countdown && !countdown.expired ? (
                            <div className="promo-popup-timer" aria-label="活动倒计时">
                                <span>距结束</span>
                                <b>{pad(countdown.days)}</b>
                                <i>:</i>
                                <b>{pad(countdown.hours)}</b>
                                <i>:</i>
                                <b>{pad(countdown.minutes)}</b>
                                <i>:</i>
                                <b>{pad(countdown.seconds)}</b>
                            </div>
                        ) : null}
                        {item.title ? <h2 className="promo-popup-title">{item.title}</h2> : null}
                        {lines.length > 1 ? (
                            <ul className="promo-popup-points">
                                {lines.map((line) => (
                                    <li key={line}>
                                        <span className="promo-popup-point-mark" aria-hidden />
                                        {line}
                                    </li>
                                ))}
                            </ul>
                        ) : lines.length === 1 ? (
                            <p className="promo-popup-description">{lines[0]}</p>
                        ) : null}
                        {clickable ? (
                            <button type="button" className="promo-popup-cta" onClick={run}>
                                <span>{item.ctaLabel}</span>
                                <ArrowRight className="size-4" />
                            </button>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </Modal>
    );
}
