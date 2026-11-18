import copy from "copy-to-clipboard";
import { App } from "antd";

import { trackPromoClick, type PromoContact } from "@/services/api/promo";

export function usePromoContactAction() {
    const { message } = App.useApp();

    return (contact: PromoContact) => {
        void trackPromoClick({ placement: "contact", contactId: contact.id });
        if (!contact.value) return;
        if (contact.channel === "email") {
            window.location.href = `mailto:${contact.value}`;
            return;
        }
        if (contact.channel === "phone") {
            window.location.href = `tel:${contact.value.replace(/[^\d+]/g, "")}`;
            return;
        }
        if (contact.channel === "link") {
            window.open(contact.value, "_blank", "noopener,noreferrer");
            return;
        }
        if (contact.channel === "whatsapp" && !contact.value.startsWith("http")) {
            window.open(`https://wa.me/${contact.value.replace(/\D/g, "")}`, "_blank", "noopener,noreferrer");
            return;
        }
        if (contact.channel === "telegram" && !contact.value.startsWith("http") && !contact.value.startsWith("@")) {
            window.open(`https://t.me/${contact.value}`, "_blank", "noopener,noreferrer");
            return;
        }
        copy(contact.value);
        message.success("已复制");
    };
}
