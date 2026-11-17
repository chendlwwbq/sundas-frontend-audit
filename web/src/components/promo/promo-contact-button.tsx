import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { App, Image, Spin } from "antd";
import { Link2, Mail, MessageCircle, Phone, QrCode, Send, UsersRound, X } from "lucide-react";

import { loadPromoConfig, type PromoContact, type PromoContactChannel } from "@/services/api/promo";
import { usePromoContactAction } from "./use-promo-contact-action";
import "./promo.css";

const ICONS: Record<PromoContactChannel, typeof MessageCircle> = {
    wechat: MessageCircle,
    wechat_group: UsersRound,
    wecom: UsersRound,
    qq: MessageCircle,
    qq_group: UsersRound,
    email: Mail,
    phone: Phone,
    telegram: Send,
    whatsapp: MessageCircle,
    link: Link2,
};

export function PromoContactButton({ variant = "sidebar" }: { variant?: "sidebar" | "topbar" }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const activate = usePromoContactAction();
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [contacts, setContacts] = useState<PromoContact[]>([]);
    const [available, setAvailable] = useState(false);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        void loadPromoConfig()
            .then((data) => {
                setContacts(data.contacts);
                setAvailable(data.contacts.length > 0);
            })
            .catch(() => setAvailable(false));
    }, []);

    useEffect(() => {
        if (!open) return;
        const closeOutside = (event: PointerEvent) => {
            if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const closeEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("pointerdown", closeOutside);
        document.addEventListener("keydown", closeEscape);
        return () => {
            document.removeEventListener("pointerdown", closeOutside);
            document.removeEventListener("keydown", closeEscape);
        };
    }, [open]);

    async function toggle() {
        if (open) {
            setOpen(false);
            return;
        }
        setOpen(true);
        setLoading(true);
        try {
            const data = await loadPromoConfig();
            setContacts(data.contacts);
            setAvailable(data.contacts.length > 0);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("navigation.contactFetchError"));
        } finally {
            setLoading(false);
        }
    }

    if (!available) return null;

    return (
        <div ref={wrapperRef} className="relative">
            <button type="button" className={variant === "topbar" ? "promo-contact-link is-topbar" : "promo-contact-link mb-1"} onClick={() => void toggle()} aria-expanded={open}>
                <MessageCircle className="size-4 shrink-0" />
                <span>{t("navigation.contact")}</span>
            </button>
            {open ? (
                <div className={variant === "topbar" ? "promo-community-popover is-topbar" : "promo-community-popover"} role="dialog" aria-label={t("navigation.communityTitle")}>
                    <div className="promo-community-head">
                        <div>
                            <strong>{t("navigation.communityTitle")}</strong>
                            <span>{t("navigation.communitySubtitle")}</span>
                        </div>
                        <button type="button" className="promo-community-close" onClick={() => setOpen(false)} aria-label={t("navigation.close")}>
                            <X className="size-3.5" />
                        </button>
                    </div>
                    {loading ? (
                        <div className="grid min-h-32 place-items-center"><Spin size="small" /></div>
                    ) : (
                        <div className={contacts.length === 1 ? "promo-community-grid is-single" : "promo-community-grid"}>
                            {contacts.map((contact) => {
                                const Icon = ICONS[contact.channel] ?? QrCode;
                                return (
                                    <div key={contact.id} className="promo-community-card">
                                        <div className="promo-community-qr">
                                            {contact.qrUrl ? (
                                                <Image
                                                    src={contact.qrUrl}
                                                    alt={`${contact.name} 二维码`}
                                                    width="100%"
                                                    height="100%"
                                                    className="promo-community-image"
                                                    preview={{ mask: t("navigation.viewQr") }}
                                                />
                                            ) : (
                                                <span className="promo-community-placeholder"><Icon className="size-8" /></span>
                                            )}
                                        </div>
                                        <div className="promo-community-meta">
                                            <strong>{contact.name || t(`navigation.contactChannels.${contact.channel}`)}</strong>
                                            <span>{t(`navigation.contactChannels.${contact.channel}`)}</span>
                                            {contact.description ? <small>{contact.description}</small> : null}
                                        </div>
                                        {!contact.qrUrl ? (
                                            <button type="button" className="promo-community-action" onClick={() => activate(contact)}>
                                                {t("navigation.contactAction")}
                                            </button>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <div className="promo-community-foot">{t("navigation.communityFooter")}</div>
                </div>
            ) : null}
        </div>
    );
}
