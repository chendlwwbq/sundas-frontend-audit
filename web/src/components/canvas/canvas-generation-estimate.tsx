import { useTranslation } from 'react-i18next';
import { TriangleAlert, Zap } from 'lucide-react';
import { useCreditEstimate } from '@/hooks/use-credit-estimate';
import { useAuthStore } from '@/stores/use-auth-store';
import { modelOptionName, useConfigStore, useEffectiveConfig } from '@/stores/use-config-store';
import { inferMediaScale, parseVideoResolution } from '@/lib/media-size';
import { buildGenerationConfig, getGenerationCount } from '@/lib/canvas/canvas-generation-helpers';
import { getNodeDefinition } from '@/lib/canvas/node-registry';
import type { CanvasConnection, CanvasGenerationMode, CanvasNodeData } from '@/types/canvas';
import { buildNodeGenerationContext } from './canvas-node-generation';
import { videoReferenceNotice } from '@/lib/canvas/video-reference-limits';

export function CanvasGenerationEstimate({ node, nodes, connections, mode, prompt, compact = false, variant }: { compact?: boolean; variant?: 'chip'; node: CanvasNodeData; nodes: CanvasNodeData[]; connections: CanvasConnection[]; mode: CanvasGenerationMode; prompt: string }) {
    const { t } = useTranslation();
    const config = buildGenerationConfig(useEffectiveConfig(), node, mode);
    const model = useConfigStore((state) => state.serverModels.find((item) => item.id === modelOptionName(config.model)));
    const session = useAuthStore((state) => `${state.user?.id ?? 'guest'}:${state.sessionEpoch}:${state.wallet?.generationDiscount ?? 1}:${state.wallet?.memberUntil ?? ''}`);
    const selfWrite = getNodeDefinition(node.type)?.useBuiltinPanel?.writeBackToSelf;
    const count = mode === 'image' ? selfWrite ? 1 : getGenerationCount(config.count) : mode === 'text' ? getGenerationCount(String(node.metadata?.textCount || 1)) : 1;
    const context = mode === 'audio' || mode === 'video' ? buildNodeGenerationContext(node.id, nodes, connections, prompt.trim()) : null;
    const inputLength = mode === 'audio' ? context?.prompt.trim().length ?? 0 : 0;
    const notice = mode === 'video' && context ? videoReferenceNotice(model, context) : null;
    const estimate = useCreditEstimate(modelOptionName(config.model), mode, mode === 'video' ? Number(config.videoSeconds) : 0, mode === 'video' ? parseVideoResolution(config.vquality) : mode === 'image' ? inferMediaScale(config.size) : '', session, inputLength, mode === 'video' ? config.videoRouteId : '');
    const min = (estimate.data?.minCredits ?? 0) * count;
    const max = (estimate.data?.maxCredits ?? 0) * count;
    const label = !estimate.hasModel ? t('home.estimateSelectModel') : estimate.loading ? t('home.estimateLoading') : estimate.error || !estimate.data ? t('home.estimateUnavailable') : `预计 ${min === max ? min : `${min}–${max}`} 积分${count > 1 ? ` / ${count}${mode === 'image' ? '张' : '条'}` : ''}`;
    const detail = '已计入会员折扣及活动倍率；多张/多条按逐次生成合计，最终以实际成功任务和线路结算。';
    if (variant === 'chip') {
        const ready = estimate.hasModel && !estimate.loading && !estimate.error && Boolean(estimate.data);
        const value = ready ? (min === max ? String(min) : `${min}–${max}`) : estimate.loading ? '…' : '--';
        const exceeded = Boolean(notice?.exceeded);
        return (
            <span role="status" aria-live="polite" aria-label={`${label}${notice ? `，${notice.text}` : ''}`} title={`${label}${notice ? `\n${notice.text}` : ''}\n${detail}`} className="inline-flex h-8 min-w-0 shrink-0 items-center gap-1 px-1 text-xs font-medium tabular-nums" style={exceeded ? { color: 'var(--destructive)' } : { opacity: ready ? 0.82 : 0.55 }}>
                {exceeded ? <TriangleAlert className="size-3.5" aria-hidden /> : <Zap className="size-3.5 fill-current" aria-hidden />}
                <span>{value}</span>
            </span>
        );
    }
    return <span role="status" aria-live="polite" className={compact ? "min-w-0 text-[11px] leading-4 text-right opacity-75" : "min-w-0 text-xs leading-5 opacity-75"} title={detail}>{label}{notice && <span className="block text-[10px] leading-4" style={notice.exceeded ? { color: 'var(--destructive)' } : undefined}>{notice.text}</span>}</span>;
}
