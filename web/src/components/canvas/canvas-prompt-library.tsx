import { useState } from "react";
import { Button, Tooltip } from "antd";
import { BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";

import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

export function CanvasPromptLibrary({ onSelect, className, color }: { onSelect: (prompt: string) => void; className?: string; color?: string }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <>
            <Tooltip title={t("navigation.prompts")}>
                <Button
                    type="text"
                    className={className || "!h-8 !w-8 !min-w-8 shrink-0 !rounded-full !bg-transparent !p-0"}
                    style={{ color: color || theme.node.text }}
                    icon={<BookOpen className="size-3.5" />}
                    onClick={() => setOpen(true)}
                    aria-label={t("navigation.prompts")}
                />
            </Tooltip>
            <PromptSelectDialog open={open} onOpenChange={setOpen} onSelect={onSelect} />
        </>
    );
}
