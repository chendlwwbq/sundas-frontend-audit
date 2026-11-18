import { Button, Modal } from "antd";
import { useTranslation } from "react-i18next";

import { useAssetStore } from "@/stores/use-asset-store";
import { isCanvasAccountActive, useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useCanvasUiStore } from "@/stores/canvas/use-canvas-ui-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { matchesCanvasSession } from "@/lib/canvas/canvas-session";

export function CanvasDeleteProjectsDialog() {
    const { t } = useTranslation();
    const userId = useAuthStore((state) => state.user?.id ?? null);
    const sessionEpoch = useAuthStore((state) => state.sessionEpoch);
    const ids = useCanvasUiStore((state) => state.deleteProjectIds);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);
    const removeSelectedIds = useCanvasUiStore((state) => state.removeSelectedProjectIds);
    const deleteProjects = useCanvasStore((state) => state.deleteProjects);
    const cleanupImages = useAssetStore((state) => state.cleanupImages);
    const isCurrent = () => matchesCanvasSession(userId, sessionEpoch, useAuthStore.getState()) && isCanvasAccountActive(userId);
    const confirm = () => {
        if (!isCurrent()) return;
        deleteProjects(ids);
        cleanupImages();
        removeSelectedIds(ids);
        setDeleteIds([]);
    };

    return (
        <Modal
            title={t("canvas.project.deleteTitle")}
            open={ids.length > 0}
            centered
            onCancel={() => { if (isCurrent()) setDeleteIds([]); }}
            footer={
                <>
                    <Button onClick={() => { if (isCurrent()) setDeleteIds([]); }}>{t("common.cancel")}</Button>
                    <Button danger type="primary" onClick={confirm}>
                        {t("common.delete")}
                    </Button>
                </>
            }
        >
            <p className="text-sm text-muted-foreground">{t("canvas.project.deleteDescription", { count: ids.length })}</p>
        </Modal>
    );
}
