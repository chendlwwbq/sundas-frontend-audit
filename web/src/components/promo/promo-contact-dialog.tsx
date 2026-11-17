import { useEffect, useState } from "react";
import { App, Image, Modal, Spin } from "antd";
import { Link2, Mail, MessageCircle, Phone, QrCode, Send, UsersRound } from "lucide-react";
import { useTranslation } from "react-i18next";

import { loadPromoConfig, type PromoContact, type PromoContactChannel } from "@/services/api/promo";
import { usePromoContactStore } from "@/stores/use-promo-contact-store";
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

export function PromoContactDialog() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const activate = usePromoContactAction();
    const open = usePromoContactStore((state) => state.open);
    const closeDialog = usePromoContactStore((state) => state.closeDialog);
    const [contacts, setContacts] = useState<PromoContact[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        void loadPromoConfig()
            .then((data) => setContacts(data.contacts))
            .catch((error) => message.error(error instanceof Error ? error.message : t("navigation.contactFetchError")))
            .finally(() => setLoading(false));
    }, [open, message]);

    return (
        <Modal
            title={t("navigation.contact")}
            open={open}
            onCancel={closeDialog}
            footer={null}
            width={780}
            centered
            className="promo-contact-modal"
            styles={{ body: { paddingTop: 4 } }}
        >
            {loading ? (
                <div className="flex min-h-36 items-center justify-center">
                    <Spin size="small" />
                </div>
            ) : contacts.length ? (
                <>
                    <p className="promo-contact-lead">{t("navigation.contactDialogHint")}</p>
                    <div className="promo-contact-grid">
                        {contacts.map((contact) => {
                            const Icon = ICONS[contact.channel] ?? QrCode;
                            return (
                                <div
                                    key={contact.id}
                                    className="promo-contact-card"
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => activate(contact)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            activate(contact);
                                        }
                                    }}
                                >
                                    <span className="promo-contact-card-main">
                                        <span className="promo-contact-card-head">
                                            <span className="promo-contact-icon"><Icon className="size-[17px]" /></span>
                                            <span className="promo-contact-head-text">
                                                <span className="promo-contact-name">{contact.name}</span>
                                                <span className="promo-contact-channel">{t(`navigation.contactChannels.${contact.channel}`)}</span>
                                            </span>
                                        </span>
                                        {contact.value || contact.description ? (
                                            <span className="promo-contact-meta">
                                                {contact.value ? <span className="promo-contact-value">{contact.value}</span> : null}
                                                {contact.description ? <span className="promo-contact-description">{contact.description}</span> : null}
                                            </span>
                                        ) : null}
                                    </span>
                                    {contact.qrUrl ? (
                                        <span
                                            className="promo-contact-qr"
                                            role="presentation"
                                            onClick={(event) => event.stopPropagation()}
                                            onKeyDown={(event) => event.stopPropagation()}
                                        >
                                            <Image src={contact.qrUrl} alt={`${contact.name} 二维码`} preview={{ mask: t("navigation.viewQr") }} />
                                        </span>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                </>
            ) : (
                <div className="py-12 text-center text-sm text-muted-foreground">{t("navigation.noContacts")}</div>
            )}
        </Modal>
    );
}
