import copy from "copy-to-clipboard";
import { App } from "antd";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { usePromoContactStore } from "@/stores/use-promo-contact-store";
import type { PromoItem } from "@/services/api/promo";

export function usePromoAction() {
    const navigate = useNavigate();
    const { message } = App.useApp();
    const { t } = useTranslation();
    const openContact = usePromoContactStore((state) => state.openDialog);

    return (item: Pick<PromoItem, "actionType" | "actionValue">) => {
        if (item.actionType === "none") return;
        if (item.actionType === "internal") {
            navigate(item.actionValue);
            return;
        }
        if (item.actionType === "external") {
            window.open(item.actionValue, "_blank", "noopener,noreferrer");
            return;
        }
        if (item.actionType === "contact") {
            openContact();
            return;
        }
        copy(item.actionValue);
        message.success(t("common.copied"));
    };
}
