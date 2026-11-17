import { useEffect, useState } from "react";
import { estimatePromptOptimization } from "@/services/api/prompt-optimizer";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { useAuthStore } from "@/stores/use-auth-store";

export function PromptOptimizationEstimate({ mode }: { mode: "image" | "video" }) {
    const config = useEffectiveConfig();
    const user = useAuthStore(state => state.user);
    const epoch = useAuthStore(state => state.sessionEpoch);
    const model = (mode === "image" ? config.imageModel : config.videoModel) || config.model;
    const key = JSON.stringify([user?.id, epoch, mode, model]);
    const [quote, setQuote] = useState<{ key: string; credits?: number; error?: string }>();
    useEffect(() => {
        if (!user || !model) return;
        const controller = new AbortController();
        void estimatePromptOptimization(model, mode, controller.signal)
            .then(result => { if (!controller.signal.aborted) setQuote({ key, credits: result.credits }); })
            .catch(error => { if (!controller.signal.aborted) setQuote({ key, error: error instanceof Error ? error.message : "报价暂不可用" }); });
        return () => controller.abort();
    }, [key, model, mode]);
    const current = quote?.key === key ? quote : undefined;
    return <span className="text-xs text-muted-foreground" title={current?.error || "优化提示词单独计费，最终以提交时的价格为准"}>{!user || !model ? "提示词优化单独计费" : !current ? "正在查询优化费用" : current.credits == null ? "优化报价暂不可用" : `优化预计 ${current.credits} 积分/次`}</span>;
}
