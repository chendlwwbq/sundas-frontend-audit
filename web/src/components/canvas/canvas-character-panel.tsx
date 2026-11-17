import { useEffect, useRef, useState } from "react";
import { Alert, Button, Drawer, Form, Input, InputNumber, Select, Space, Switch, Tag } from "antd";
import { characterRequest, type CharacterMedia, type CharacterRun, type CharacterStepName } from "@/services/api/character-workflow";
import { getMediaBlob, uploadMediaFile } from "@/services/file-storage";
import { imageToDataUrl } from "@/services/image-storage";
import { useAuthStore } from "@/stores/use-auth-store";
import { modelOptionName, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useCreditEstimate } from "@/hooks/use-credit-estimate";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

const stepNames: Record<CharacterStepName, string> = { prepare: "准备镜头", image: "生成替换参考帧", video: "生成替换视频", assemble: "回插并输出成片" };
const stateNames = { queued: "等待处理", running: "处理中", succeeded: "已完成", failed: "失败", review: "待核对" };

async function cloudKey(node: CanvasNodeData, owner: string) {
    const content = node.metadata?.content || "";
    const localKey = node.metadata?.storageKey;
    const direct = mediaKey(content);
    if (direct) return direct;
    const input = node.type === CanvasNodeType.Image
        ? await imageToDataUrl({ dataUrl: content, storageKey: localKey })
        : localKey ? await getMediaBlob(localKey) : content;
    if (!input) throw new Error("素材内容不可用，请重新上传");
    const uploaded = await uploadMediaFile(input, node.type, { expectedOwner: owner });
    const key = mediaKey(uploaded.url);
    if (!key) throw new Error("素材尚未同步到服务端，请检查网络后重试");
    return key;
}

function mediaKey(value: string) {
    try { const url = new URL(value, window.location.origin); return url.origin === window.location.origin && url.pathname.startsWith("/media/private/") ? decodeURIComponent(url.pathname.slice(7)) : ""; }
    catch { return ""; }
}

export function CanvasCharacterPanel({ projectId, nodes, initialSourceId, initialReferenceId, initialInstructions, prepareCanvas, onAddMedia, onClose }: {
    projectId: string; nodes: CanvasNodeData[]; initialSourceId?: string | null; initialReferenceId?: string; initialInstructions?: string;
    prepareCanvas: () => Promise<unknown>;
    onAddMedia: (run: CharacterRun, media: CharacterMedia[]) => void;
    onClose: () => void;
}) {
    const config = useEffectiveConfig();
    const models = useConfigStore(state => state.serverModels);
    const owner = useAuthStore(state => state.user?.id || "");
    const sessionEpoch = useAuthStore(state => state.sessionEpoch);
    const [sourceId, setSourceId] = useState(initialSourceId || "");
    const [characterId, setCharacterId] = useState(initialReferenceId || "");
    const [target, setTarget] = useState("");
    const [instructions, setInstructions] = useState(initialInstructions || "");
    const [imageModel, setImageModel] = useState(modelOptionName(config.imageModel));
    const [videoModel, setVideoModel] = useState(modelOptionName(config.videoModel));
    const [start, setStart] = useState(0);
    const [end, setEnd] = useState<number | null>(null);
    const [keepAudio, setKeepAudio] = useState(true);
    const [resolution, setResolution] = useState(config.vquality.replace(/p$/i, "") || "720");
    const [ratio, setRatio] = useState("16:9");
    const [runs, setRuns] = useState<CharacterRun[]>([]);
    const [run, setRun] = useState<CharacterRun | null>(null);
    const [busy, setBusy] = useState(false);
    const performing = useRef(false);
    const [error, setError] = useState("");
    const identity = `${owner}:${sessionEpoch}:${projectId}`;
    const current = useRef(identity); current.current = identity;
    const alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    const active = (captured: string) => alive.current && current.current === captured;
    const selectedSource = nodes.find(node => node.id === sourceId);
    const duration = run?.steps?.find(step => step.name === "prepare" && step.status === "succeeded")?.output.range?.duration
        ?? (end !== null ? end - start : (selectedSource?.metadata?.durationMs || 0) / 1000 - start);
    const imageEstimate = useCreditEstimate(run?.input.imageModel || imageModel, "image", 0, "", identity);
    const videoEstimate = useCreditEstimate(run?.input.videoModel || videoModel, "video", duration, run?.input.resolution || resolution, identity);
    const estimateText = (estimate: typeof imageEstimate) => estimate.data ? `预计 ${estimate.data.minCredits === estimate.data.maxCredits ? estimate.data.minCredits : `${estimate.data.minCredits}–${estimate.data.maxCredits}`} 积分` : estimate.loading ? "费用计算中" : "暂时无法预估费用";
    const refresh = async (id = run?.id) => {
        if (!id) return;
        const captured = identity;
        const result = await characterRequest<{ run: CharacterRun }>(`/${id}`);
        if (active(captured)) setRun(result.run);
    };
    useEffect(() => {
        setRun(null); setRuns([]); setError(""); setBusy(false);
        const controller = new AbortController();
        void characterRequest<{ runs: CharacterRun[] }>(`?projectId=${encodeURIComponent(projectId)}`, { signal: controller.signal })
            .then(result => { if (!controller.signal.aborted && active(identity)) setRuns(result.runs); })
            .catch(cause => { if (!controller.signal.aborted && active(identity)) setError(cause instanceof Error ? cause.message : "记录读取失败"); });
        return () => controller.abort();
    }, [identity, projectId]);
    useEffect(() => {
        if (!run || !run.steps?.some(step => ["queued", "running"].includes(step.status))) return;
        const controller = new AbortController();
        // Same cadence as existing image/video task queries; no resubmission.
        const timer = setTimeout(() => {
            void characterRequest<{ run: CharacterRun }>(`/${run.id}`, { signal: controller.signal })
                .then(result => { if (!controller.signal.aborted && active(identity)) setRun(result.run); })
                .catch(cause => { if (!controller.signal.aborted && active(identity)) setError(cause instanceof Error ? cause.message : "查询失败，请刷新原任务"); });
        }, 5000);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [run, identity]);
    const perform = async (action: () => Promise<void>) => {
        if (performing.current) return;
        performing.current = true;
        const captured = identity; setBusy(true); setError("");
        try { await action(); }
        catch (cause) { if (active(captured)) setError(cause instanceof Error ? cause.message : "操作失败"); }
        finally { performing.current = false; if (active(captured)) setBusy(false); }
    };
    const create = () => perform(async () => {
        const source = nodes.find(node => node.id === sourceId), character = nodes.find(node => node.id === characterId);
        if (!source || !character || !target.trim()) throw new Error("请选择原视频、人物参考图并说明替换对象");
        const captured = identity;
        await prepareCanvas();
        const [sourceKey, characterKey] = await Promise.all([cloudKey(source, owner), cloudKey(character, owner)]);
        if (!active(captured)) return;
        const result = await characterRequest<{ run: CharacterRun }>("", { method: "POST", json: { id: crypto.randomUUID(), projectId, input: { sourceKey, characterKey, target, instructions, imageModel, videoModel, resolution, ratio, start, end, keepAudio } } });
        if (active(captured)) { setRun(result.run); setRuns(items => [result.run, ...items]); }
    });
    const execute = (name: CharacterStepName) => perform(async () => {
        if (!run) return;
        const captured = identity;
        const result = await characterRequest<{ run: CharacterRun }>(`/${run.id}/steps/${name}`, { method: "POST", json: {} });
        if (active(captured)) setRun(result.run);
    });
    const patch = (body: { selectedKey?: string; paused?: boolean }) => perform(async () => {
        if (!run) return;
        const captured = identity;
        const result = await characterRequest<{ run: CharacterRun }>(`/${run.id}`, { method: "PATCH", json: body });
        if (active(captured)) setRun(result.run);
    });
    const lastSteps = Object.values(Object.fromEntries((run?.steps || []).map(step => [step.name, step])));
    const preparation = lastSteps.find(step => step.name === 'prepare' && step.status === 'succeeded')?.output;
    return <Drawer open title="人物替换工作流" onClose={onClose} width={560}>
        <div className="flex flex-col gap-4">
            <Alert type="info" showIcon message="原视频和每一步结果都会保留" description="先确认替换参考帧，再生成视频。效果取决于模型；回插时不会自动改变片段速度。关闭面板后可从运行记录继续。" />
            <Select aria-label="运行记录" placeholder="选择已有运行记录" value={run?.id} disabled={busy} options={runs.map(item => ({ value: item.id, label: `${item.input.target} · ${new Date(item.createdAt).toLocaleString()}` }))} onChange={id => void perform(() => refresh(id))} />
            {error && <Alert type="error" showIcon message={error} />}
            {!run ? <Form layout="vertical">
                <Form.Item label="原视频"><Select value={sourceId || undefined} onChange={setSourceId} options={nodes.filter(node => node.type === CanvasNodeType.Video && node.metadata?.content).map(node => ({ value: node.id, label: node.title }))} /></Form.Item>
                <Form.Item label="目标人物参考图"><Select value={characterId || undefined} onChange={setCharacterId} options={nodes.filter(node => node.type === CanvasNodeType.Image && node.metadata?.content).map(node => ({ value: node.id, label: node.title }))} /></Form.Item>
                <Form.Item label="替换谁"><Input value={target} onChange={event => setTarget(event.target.value)} placeholder="例如：画面左侧穿蓝衣的人物" /></Form.Item>
                <Form.Item label="补充要求"><Input.TextArea value={instructions} onChange={event => setInstructions(event.target.value)} autoSize={{ minRows: 2 }} /></Form.Item>
                <Form.Item label="替换区间（秒，结束留空表示原片结尾）"><Space wrap><InputNumber aria-label="开始秒数" value={start} onChange={value => setStart(value ?? 0)} min={0} /><InputNumber aria-label="结束秒数" value={end} onChange={value => setEnd(value)} min={0} /></Space></Form.Item>
                <Form.Item label="参考帧编辑模型"><Select value={imageModel || undefined} onChange={setImageModel} options={models.filter(model => model.capability === "image").map(model => ({ value: model.id, label: model.name }))} /><div className="mt-1 text-xs opacity-70">{estimateText(imageEstimate)}</div></Form.Item>
                <Form.Item label="视频编辑模型"><Select value={videoModel || undefined} onChange={setVideoModel} options={models.filter(model => model.capability === "video" && Number((model.metadata?.referenceLimits as { videos?: number })?.videos) > 0).map(model => ({ value: model.id, label: model.name }))} /><div className="mt-1 text-xs opacity-70">{estimateText(videoEstimate)}，实际费用按各次任务结算</div></Form.Item>
                <Form.Item label="输出规格"><Space wrap><Input aria-label="清晰度" value={resolution} onChange={event => setResolution(event.target.value)} placeholder="模型支持的清晰度" /><Input aria-label="画面比例" value={ratio} onChange={event => setRatio(event.target.value)} placeholder="16:9" /></Space></Form.Item>
                <Form.Item label="成片保留原声"><Switch checked={keepAudio} onChange={setKeepAudio} /> <span className="text-xs opacity-70">关闭后成片静音，生成片段仍单独保留</span></Form.Item>
                <Button type="primary" loading={busy} disabled={!imageModel || !videoModel} onClick={() => void create()}>创建工作流</Button>
            </Form> : <>
                <div><strong>{run.input.target}</strong><div className="mt-1 text-sm opacity-70">区间 {run.input.start} 秒至 {run.input.end ?? "原片结尾"} · {run.input.keepAudio ? "保留原声" : "成片静音"}</div></div>
                <Space wrap><Button loading={busy} onClick={() => void perform(() => refresh())}>刷新进度</Button><Button disabled={busy} onClick={() => void patch({ paused: !run.paused })}>{run.paused ? "恢复后续步骤" : "暂停后续步骤"}</Button><Button disabled={busy} onClick={() => setRun(null)}>新建运行</Button></Space>
                {run.paused && <Alert type="warning" message="后续步骤已暂停；已提交的模型任务仍会完成并计费。" />}
                {(Object.keys(stepNames) as CharacterStepName[]).map(name => {
                    const step = lastSteps.find(item => item.name === name);
                    const comparison: CharacterMedia | undefined = name === 'image' ? preparation?.frame : name === 'video' ? preparation?.clip : name === 'assemble' ? { key: run.input.sourceKey, kind: 'video' } : undefined;
                    const ready = name === "prepare" || (name === "image" && lastSteps.some(item => item.name === "prepare" && item.status === "succeeded")) || (name === "video" && Boolean(run.selectedKey)) || (name === "assemble" && lastSteps.some(item => item.name === "video" && item.status === "succeeded"));
                    return <section key={name} className="border-b border-current/10 pb-4">
                        <div className="mb-2 flex items-center justify-between gap-2"><strong>{stepNames[name]}</strong>{step && <Tag>{stateNames[step.status]} · 第 {step.attempt} 次</Tag>}</div>
                        {step?.error && <p role="alert" className="mb-2 text-sm">{step.error}</p>}
                        {name === "image" && <p className="mb-2 text-xs opacity-70">{estimateText(imageEstimate)}</p>}
                        {name === "video" && <p className="mb-2 text-xs opacity-70">{estimateText(videoEstimate)}</p>}
                        {(!step || step.status === "failed") && <Button disabled={busy || run.paused || !ready} onClick={() => void execute(name)}>{step ? "重试此步骤" : "开始此步骤"}</Button>}
                        {(step?.output.media || []).map(media => <div key={media.key} className="mt-3">
                            <div className={comparison ? 'grid gap-3 sm:grid-cols-2' : ''}>
                                {comparison && <div><p className="mb-1 text-xs opacity-70">{name === 'assemble' ? '完整原片' : name === 'video' ? '原始片段' : '原始参考帧'}</p>
                                    {comparison.kind === 'image' ? <img src={comparison.url || `/media/${comparison.key}`} alt="原始参考帧" loading="lazy" className="max-h-64 max-w-full object-contain" /> : <video src={comparison.url || `/media/${comparison.key}`} aria-label={name === 'assemble' ? '完整原片' : '原始片段'} controls playsInline preload="none" className="max-h-64 max-w-full" />}
                                    <Button type="text" size="small" href={comparison.url || `/media/${comparison.key}`} download>下载原始素材</Button>
                                </div>}
                                <div>{comparison && <p className="mb-1 text-xs opacity-70">{name === 'assemble' ? '回插成片' : '替换结果'}</p>}
                                    {media.kind === "image" ? <img src={media.url || `/media/${media.key}`} alt="替换参考帧" loading="lazy" className="max-h-64 max-w-full object-contain" /> : <video src={media.url || `/media/${media.key}`} aria-label={name === 'assemble' ? '回插成片' : '替换结果'} controls playsInline preload="none" className="max-h-64 max-w-full" />}
                                    <Button type="text" size="small" href={media.url || `/media/${media.key}`} download>下载结果</Button>
                                </div>
                            </div>
                            <Space wrap className="mt-2">
                                {name === "image" && <Button disabled={busy || lastSteps.some(item => item.name === "video")} type={run.selectedKey === media.key ? "primary" : "default"} onClick={() => void patch({ selectedKey: media.key })}>{run.selectedKey === media.key ? "已确认此帧" : "确认此帧用于视频"}</Button>}
                                <Button onClick={() => onAddMedia(run, [media])}>放入画布</Button>
                            </Space>
                        </div>)}
                    </section>;
                })}
                <p className="text-xs opacity-70">已完成步骤保留结果。参考帧确认后再开始视频；需要修改输入或更换已提交的参考帧时，创建新的运行。</p>
            </>}
        </div>
    </Drawer>;
}
