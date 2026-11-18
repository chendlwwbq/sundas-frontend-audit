import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Alert, Button, Modal, Select, Spin } from 'antd';
import { RefreshCw, WandSparkles } from 'lucide-react';
import { canvasThemes } from '@/lib/canvas-theme';
import { useThemeStore } from '@/stores/use-theme-store';
import { useAuthStore } from '@/stores/use-auth-store';
import { getUpscaleCapabilities, getUpscaleRuns, saveUpscaleDraft, quoteUpscaleRun, submitUpscaleRun, resumeUpscaleRun, type UpscaleCapabilities, type UpscaleRun, type UpscaleQuote } from '@/services/api/canvas-upscale';
import type { CanvasNodeData } from '@/types/canvas';
import { upscaleSources } from '@/lib/canvas/upscale-sources';
import { ApiError } from '@/services/api/client';

const statusLabels: Record<UpscaleRun['status'], string> = {
    draft: '准备记录 · 未提交', queued: '等待处理', running: '处理中', succeeded: '已完成', failed: '处理失败',
    review: '状态待核对，请勿重复提交', result_unavailable: '结果文件不可用',
};

function sourceKey(value: string) {
    try {
        const url = new URL(value, window.location.origin);
        return url.origin === window.location.origin && url.pathname.startsWith('/media/') ? decodeURIComponent(url.pathname.slice(7)) : null;
    } catch { return null; }
}

type PanelProps = { projectId: string; sourceNode?: CanvasNodeData | null; sourceNodes?: CanvasNodeData[]; instructions?: string; open: boolean; onClose: () => void; onResult?: (run: UpscaleRun) => void };
type SourceActions = { quote: () => Promise<void>; submit: () => Promise<void> };

export function CanvasAiUpscalePanel({ sourceNode, sourceNodes, instructions, ...props }: PanelProps) {
    const nodes = upscaleSources(sourceNode, sourceNodes);
    const identity = nodes.map(node => node.id + ':' + node.metadata?.content).join('|');
    const userId = useAuthStore(state => state.ready ? state.user?.id : undefined);
    const epoch = useAuthStore(state => state.sessionEpoch);
    const [batchBusy, setBatchBusy] = useState(false);
    const [quotes, setQuotes] = useState<Record<string, UpscaleQuote>>({});
    const actions = useRef(new Map<string, SourceActions>());
    const context = [props.projectId, identity, userId, epoch, props.open].join('|');
    const batchSession = useRef({ context });
    if (batchSession.current.context !== context) batchSession.current = { context };
    const batchLock = useRef(false);
    const onQuoteChange = useCallback((id: string, quote: UpscaleQuote | null) => setQuotes(previous => {
        if (previous[id] === quote || (!previous[id] && !quote)) return previous;
        const next = { ...previous }; if (quote) next[id] = quote; else delete next[id]; return next;
    }), []);
    useEffect(() => { setBatchBusy(false); batchLock.current = false; }, [context]);
    async function batch(action: keyof SourceActions) {
        if (batchLock.current) return;
        batchLock.current = true; setBatchBusy(true);
        const session = batchSession.current;
        try {
            for (const node of nodes) {
                if (batchSession.current !== session || !props.open) break;
                await actions.current.get(node.id)?.[action]();
            }
        } finally {
            if (batchSession.current === session) { setBatchBusy(false); batchLock.current = false; }
        }
    }
    const total = Object.values(quotes).reduce((sum, quote) => sum + quote.credits, 0);
    return <Modal title={nodes.length > 1 ? '批量 AI 超分 · ' + nodes.length + ' 项' : 'AI 超分'} open={props.open && nodes.length > 0} onCancel={props.onClose} footer={null} width={760} centered destroyOnHidden>
        {nodes.length > 1 && <div className="mb-4 space-y-2">
            <p className="text-sm">逐项选择模型和规格；每项独立报价、提交和保留结果。关闭面板会停止尚未发送的项目，已发送任务继续处理。</p>
            <div className="flex flex-wrap gap-2"><Button loading={batchBusy} onClick={() => void batch('quote')}>预估全部费用</Button>
                <Button type="primary" disabled={batchBusy || !Object.keys(quotes).length} onClick={() => void batch('submit')}>确认已报价 {Object.keys(quotes).length} 项 · {total} 积分</Button></div>
        </div>}
        {instructions?.trim() && <Alert className="mb-4" type="info" showIcon message="助手处理建议" description={instructions} />}
        <div className="max-h-[72vh] space-y-8 overflow-y-auto">
            {nodes.map(node => <UpscaleSourcePanel key={props.projectId + ':' + userId + ':' + epoch + ':' + node.id + ':' + node.metadata?.content} {...props} sourceNode={node} batchBusy={batchBusy} onQuoteChange={onQuoteChange}
                ref={value => { if (value) actions.current.set(node.id, value); else actions.current.delete(node.id); }} />)}
        </div>
    </Modal>;
}

const UpscaleSourcePanel = forwardRef<SourceActions, Omit<PanelProps, 'sourceNodes' | 'sourceNode'> & { sourceNode: CanvasNodeData; batchBusy: boolean; onQuoteChange: (id: string, quote: UpscaleQuote | null) => void }>(function UpscaleSourcePanel({ projectId, sourceNode, open, onResult, batchBusy, onQuoteChange }, ref) {
    const theme = canvasThemes[useThemeStore(state => state.theme)];
    const userId = useAuthStore(state => state.ready ? state.user?.id : undefined);
    const epoch = useAuthStore(state => state.sessionEpoch);
    const [capabilities, setCapabilities] = useState<UpscaleCapabilities | null>(null);
    const [runs, setRuns] = useState<UpscaleRun[]>([]);
    const [modelId, setModelId] = useState<string>();
    const [targetId, setTargetId] = useState<string>();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [quote, setQuote] = useState<UpscaleQuote | null>(null);
    const [reload, setReload] = useState(0);
    const controller = useRef<AbortController | null>(null);
    const draftId = useRef<string | null>(null);
    const operating = useRef(false);
    const pendingSubmission = useRef(false);
    const busy = saving || batchBusy;
    const content = sourceNode?.metadata?.content ?? '';
    const objectKey = sourceKey(content);
    const kind = sourceNode?.type === 'video' ? 'video' : 'image';
    const selectedModel = capabilities?.models.find(model => model.id === modelId);
    const currentRuns = runs.filter(run => run.source.objectKey === objectKey);
    const current = (signal: AbortSignal) => !signal.aborted && useAuthStore.getState().user?.id === userId && useAuthStore.getState().sessionEpoch === epoch;

    useEffect(() => {
        setCapabilities(null); setRuns([]); setError(''); setNotice(''); setSaving(false);
        if (!open || !sourceNode || !userId) return;
        const request = new AbortController();
        controller.current = request;
        const session = { userId, signal: request.signal };
        setLoading(true);
        void Promise.allSettled([getUpscaleCapabilities(kind, session), getUpscaleRuns(projectId, sourceNode.id, session)]).then(([catalog, history]) => {
            if (!current(request.signal)) return;
            if (catalog.status === 'fulfilled') setCapabilities(catalog.value);
            if (history.status === 'fulfilled') {
                setRuns(history.value.runs);
                if (history.value.runs.some(run => run.id === draftId.current && run.taskId)) { pendingSubmission.current = false; setQuote(null); }
            }
            const failure = catalog.status === 'rejected' ? catalog.reason : history.status === 'rejected' ? history.reason : null;
            if (failure) setError(failure instanceof Error ? failure.message : '读取超分配置失败');
            setLoading(false);
        });
        return () => { request.abort(); if (controller.current === request) controller.current = null; };
    }, [open, projectId, sourceNode?.id, content, kind, userId, epoch, reload]);

    async function save(estimate = false) {
        const request = controller.current;
        if (!request || !current(request.signal) || !objectKey || !sourceNode || !userId || operating.current) return;
        if (pendingSubmission.current) { setError('上次提交结果尚未确认，请先刷新记录并查询原任务。'); return; }
        if (estimate && (!selectedModel?.available || !targetId)) { setError('请选择当前素材可用的超分模型与规格'); return; }
        if (draftId.current && runs.some(run => run.id === draftId.current && run.taskId)) { setError('此记录已经提交，请查看原任务；选择新参数后才能另建任务。'); return; }
        if (!draftId.current) draftId.current = crypto.randomUUID();
        operating.current = true;
        setSaving(true); setError(''); setNotice('');
        if (estimate) setQuote(null);
        try {
            const { run } = await saveUpscaleDraft(projectId, {
                id: draftId.current, sourceNodeId: sourceNode.id, sourceObjectKey: objectKey, mediaKind: kind,
                ...(modelId ? { modelId, targetId } : {}),
            }, { userId, signal: request.signal });
            if (!current(request.signal)) return;
            setRuns(items => [run, ...items.filter(item => item.id !== run.id)]);
            if (estimate) {
                const cost = await quoteUpscaleRun(projectId, run.id, { userId, signal: request.signal });
                if (!current(request.signal)) return;
                setQuote(cost); setNotice('已核验原始媒体，确认后将提交超分任务并冻结对应积分。');
            } else setNotice('准备记录已保存到此画布；尚未提交模型任务，也未扣费。');
        } catch (cause) {
            if (current(request.signal)) setError(cause instanceof Error ? cause.message : '保存失败，请重试');
        } finally { operating.current = false; if (current(request.signal)) setSaving(false); }
    }

    async function submit() {
        const request = controller.current;
        if (!request || !current(request.signal) || !draftId.current || !quote || !userId || operating.current) return;
        operating.current = true; pendingSubmission.current = true;
        setSaving(true); setError('');
        try {
            const { run } = await submitUpscaleRun(projectId, draftId.current, quote, { userId, signal: request.signal });
            if (!current(request.signal)) return;
            pendingSubmission.current = false;
            setRuns(items => [run, ...items.filter(item => item.id !== run.id)]); setQuote(null);
            setNotice('任务已提交。关闭面板后服务端继续处理，可刷新记录查看进度。');
        } catch (cause) {
            if (current(request.signal)) {
                // An explicit input/quote rejection may be corrected. Network loss and
                // server errors retain the same request ID until the original is known.
                if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500 && cause.status !== 408) {
                    pendingSubmission.current = false; setQuote(null);
                }
                setError(cause instanceof Error ? cause.message : '提交结果未确认，请刷新记录查看原任务');
            }
        }
        finally { operating.current = false; if (current(request.signal)) setSaving(false); }
    }

    async function resume(run: UpscaleRun) {
        const request = controller.current;
        if (!request || !current(request.signal) || !userId || operating.current) return;
        operating.current = true;
        setSaving(true); setError('');
        try {
            const result = await resumeUpscaleRun(projectId, run.id, { userId, signal: request.signal });
            if (!current(request.signal)) return;
            setRuns(items => items.map(item => item.id === run.id ? result.run : item)); setNotice('已恢复查询或保存原任务，不会重新调用模型。');
        } catch (cause) { if (current(request.signal)) setError(cause instanceof Error ? cause.message : '恢复失败'); }
        finally { operating.current = false; if (current(request.signal)) setSaving(false); }
    }

    useImperativeHandle(ref, () => ({ quote: () => save(true), submit }), [quote, modelId, targetId, runs, saving, capabilities]);
    useEffect(() => { onQuoteChange(sourceNode.id, quote); return () => onQuoteChange(sourceNode.id, null); }, [sourceNode.id, quote, onQuoteChange]);
    return (
        <div className="space-y-5" style={{ color: theme.node.text }}>
            <p className="text-sm" style={{ color: theme.node.muted }}>保留原素材，超分完成后生成独立结果。模型、输出规格与费用由可用渠道提供。</p>
            <div className="grid gap-5 sm:grid-cols-2">
                <div className="min-w-0 space-y-2">
                    <div className="flex min-h-40 items-center justify-center overflow-hidden rounded-lg" style={{ background: theme.canvas.background }}>
                        {open && content ? kind === 'video'
                            ? <video key={content} src={content} controls playsInline preload="metadata" className="max-h-64 max-w-full" aria-label="原视频预览" />
                            : <img src={content} alt={sourceNode?.title || '原图预览'} className="max-h-64 max-w-full object-contain" /> : <span>节点暂无媒体</span>}
                    </div>
                    <p className="truncate text-sm">{sourceNode?.title || '原素材'}</p>
                    {objectKey && <a className="text-sm" href={content} download>下载原始素材</a>}
                    {sourceNode?.metadata?.naturalWidth && sourceNode.metadata.naturalHeight ? <p className="text-xs" style={{ color: theme.node.muted }}>{sourceNode.metadata.naturalWidth} × {sourceNode.metadata.naturalHeight} 像素</p> : null}
                    {!objectKey && <p className="text-sm" style={{ color: theme.node.muted }}>请先将素材上传并保存到当前画布，再保存超分准备记录。</p>}
                </div>
                <div className="min-w-0 space-y-4">
                    <div><label htmlFor={"canvas-upscale-model-" + sourceNode.id} className="mb-2 block text-sm">超分模型</label><Select id={"canvas-upscale-model-" + sourceNode.id} className="w-full" value={modelId} loading={loading} disabled={busy || pendingSubmission.current || !capabilities?.models.length}
                        placeholder="暂无已接入的超分模型" options={capabilities?.models.map(model => ({ value: model.id, label: model.name, disabled: !model.available }))}
                        onChange={value => { setModelId(value); setTargetId(undefined); draftId.current = null; pendingSubmission.current = false; setQuote(null); }} /></div>
                    <div><label htmlFor={"canvas-upscale-target-" + sourceNode.id} className="mb-2 block text-sm">输出规格</label><Select id={"canvas-upscale-target-" + sourceNode.id} className="w-full" value={targetId} disabled={busy || pendingSubmission.current || !selectedModel?.available}
                        placeholder="由所选模型提供" options={selectedModel?.targets.map(target => ({ value: target.id, label: target.label }))}
                        onChange={value => { setTargetId(value); draftId.current = null; pendingSubmission.current = false; setQuote(null); }} /></div>
                    <p className="text-sm" style={{ color: theme.node.muted }}>预计费用：{quote ? `${quote.credits} 积分` : selectedModel?.available ? '选择规格后预估' : '暂无可用报价'}</p>
                    {quote && <p className="text-sm">预计输出 {quote.target.width} × {quote.target.height} 像素</p>}
                    <p className="text-xs" style={{ color: theme.node.muted }}>{kind === 'image' ? '输入不超过 5 MB，至少 32×32；长边≤1920、短边≤1080。超出时拒绝提交。' : '输入不超过 1 GB，两边均>360；长边<1920、短边<1080。输出固定 2 倍。'}</p>
                    <p className="text-xs" style={{ color: theme.node.muted }}>成品文件沿用平台归档限制：{kind === 'image' ? '50 MiB' : '200 MiB'}。保存失败时保留任务与冻结积分供核对，不会重复调用模型。</p>
                    {!loading && capabilities && !capabilities.available && <Alert type="info" showIcon title="暂不可生成" description={capabilities.reason} />}
                </div>
            </div>
            {loading && <div className="flex items-center gap-2 text-sm" role="status"><Spin size="small" />正在读取配置与记录</div>}
            {error && <Alert type="error" showIcon title={error} />}
            {notice && <p role="status" className="text-sm">{notice}</p>}
            <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="text" icon={<RefreshCw size={16} />} disabled={loading || busy} onClick={() => setReload(value => value + 1)}>刷新配置与记录</Button>
                <Button disabled={!objectKey || !userId || loading || busy || Boolean(modelId && !targetId)} loading={saving} onClick={() => void save()}>保存准备记录</Button>
                <Button disabled={!objectKey || !selectedModel?.available || !targetId || loading || busy} onClick={() => void save(true)}>预估费用</Button>
                <Button type="primary" disabled={!quote || busy || loading} loading={saving && Boolean(quote)} icon={<WandSparkles size={16} />} onClick={() => void submit()}>{pendingSubmission.current ? "核对原提交" : "确认超分"}{quote ? ` · ${quote.credits} 积分` : ''}</Button>
            </div>
            {currentRuns.length > 0 && <section aria-label="此素材的超分记录" className="space-y-2 border-t pt-4" style={{ borderColor: theme.toolbar.border }}>
                <h3 className="text-sm font-medium">此素材的处理记录</h3>
                {currentRuns.map(run => <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div><p>{run.modelName || '待配置模型'}{run.parameters.target ? ` · ${run.parameters.target.label}` : ''}</p><p style={{ color: theme.node.muted }}>{statusLabels[run.status]} · {new Date(run.createdAt).toLocaleString()}</p></div>
                    {run.error && <p className="w-full text-xs" role="status">{run.error}</p>}
                    {run.resultUrl && <a href={run.resultUrl} target="_blank" rel="noreferrer">查看结果</a>}
                    {run.resultUrl && <a href={run.resultUrl} download>下载结果</a>}
                    {run.status === 'succeeded' && run.resultUrl && run.result && onResult && <Button type="text" onClick={() => onResult(run)}>添加到画布</Button>}
                    {run.status === 'review' && <Button type="text" disabled={busy} onClick={() => void resume(run)}>查询 / 保存原任务</Button>}
                    {run.result && <span>{run.result.width} × {run.result.height}{run.result.duration ? ` · ${run.result.duration.toFixed(2)} 秒` : ''}</span>}
                    {run.creditsCharged !== null && <span>已扣 {run.creditsCharged} 积分</span>}
                </div>)}
            </section>}
        </div>
    );
});
