import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";
import { App, Button, Tooltip } from "antd";
import { Sparkle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { usePromptOptimizer } from "@/hooks/use-prompt-optimizer";
import { modelOptionName } from "@/stores/use-config-store";
import { ApiError } from "@/services/api/client";
import { cn } from "@/lib/utils";
import type { PromptOptimizerCapability } from "@/services/api/prompt-optimizer";

type Props = {
    prompt: string;
    model: string;
    capability: PromptOptimizerCapability;
    onOptimized: (next: string) => void;
    disabled?: boolean;
    className?: string;
    style?: CSSProperties;
};

export function PromptOptimizeButton({ prompt, model, capability, onOptimized, disabled, className, style }: Props) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const { optimize, optimizing, cancel } = usePromptOptimizer();
    const promptRef = useRef(prompt);
    promptRef.current = prompt;

    useEffect(() => {
        cancel();
    }, [prompt, model, capability, cancel]);

    const run = async () => {
        const original = prompt.trim();
        if (!original || !model || optimizing) return;
        try {
            const result = await optimize({ prompt: original, model: modelOptionName(model), capability });
            if (promptRef.current.trim() !== original) {
                message.warning(t("common.optimizePromptChanged"));
                return;
            }
            onOptimized(result.prompt);
            message.open({
                type: "success",
                duration: 6,
                content: (
                    <span className="inline-flex items-center gap-2">
                        {t("common.optimizePromptApplied", { credits: result.creditsCharged })}
                        <Button
                            type="link"
                            size="small"
                            className="!h-auto !p-0"
                            onClick={() => {
                                if (promptRef.current === result.prompt) onOptimized(original);
                            }}
                        >
                            {t("common.optimizePromptUndo")}
                        </Button>
                    </span>
                ),
            });
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") return;
            if (error instanceof ApiError && error.status === 402) {
                message.error(t("common.optimizePromptInsufficientCredits"));
            } else if (error instanceof ApiError && error.status === 503) {
                message.error(t("common.optimizePromptUnavailable"));
            } else if (error instanceof ApiError && error.status === 429) {
                message.error(t("common.optimizePromptRateLimited"));
            } else {
                message.error(error instanceof Error ? error.message : t("common.optimizePromptFailed"));
            }
        }
    };

    const blocked = disabled || !prompt.trim() || !model || optimizing;
    return (
        <Tooltip title={blocked && !optimizing ? t("common.optimizePromptHint") : t("common.optimizePrompt")}>
            <Button
                type="text"
                shape="circle"
                size="small"
                loading={optimizing}
                disabled={blocked}
                aria-label={t("common.optimizePrompt")}
                className={cn(
                    "!absolute !bottom-2 !right-2 z-10 !h-7 !w-7 !min-w-7 !rounded-full !p-0 border border-border/60 bg-background/80 shadow-sm backdrop-blur transition hover:bg-muted",
                    className,
                )}
                style={style}
                icon={optimizing ? undefined : <Sparkle className="size-3.5" />}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => void run()}
            />
        </Tooltip>
    );
}
