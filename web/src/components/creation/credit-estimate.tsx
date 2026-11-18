import { useCreditEstimate } from "@/hooks/use-credit-estimate";
import { inferMediaScale, parseVideoResolution } from "@/lib/media-size";
import { useAuthStore } from "@/stores/use-auth-store";
import { modelOptionName, useEffectiveConfig } from "@/stores/use-config-store";

export function CreditEstimate({ mode }: { mode: "image" | "video" }) {
    const config = useEffectiveConfig();
    const user = useAuthStore((state) => state.user);
    const epoch = useAuthStore((state) => state.sessionEpoch);
    const model = mode === "image" ? config.imageModel || config.model : config.videoModel || config.model;
    const count = mode === "image" ? Math.max(1, Math.min(10, Number(config.count) || 1)) : 1;
    const estimate = useCreditEstimate(modelOptionName(model), mode, mode === "video" ? Number(config.videoSeconds) : 1, mode === "video" ? parseVideoResolution(config.vquality) : inferMediaScale(config.size), `${user?.id ?? "guest"}:${epoch}`, 0, mode === "video" ? config.videoRouteId : "");
    const min = (estimate.data?.minCredits ?? 0) * count;
    const max = (estimate.data?.maxCredits ?? 0) * count;
    const text = !estimate.hasModel ? "请选择模型" : estimate.loading ? "正在计算积分" : estimate.error || !estimate.data ? "暂无法估算积分" : `预计 ${min === max ? min : `${min}–${max}`} 积分`;
    return <span role="status" className="text-xs text-muted-foreground" title="实际费用以服务端结算为准">{text}</span>;
}
