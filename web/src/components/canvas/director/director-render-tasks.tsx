import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { saveAs } from 'file-saver';
import { DirectorViewport, type DirectorViewportHandle } from './director-viewport';
import { directorClient, type DirectorRenderRequest, type AdoptDirectorRender } from '@/services/api/canvas-director';
import { uploadMediaFile } from '@/services/file-storage';
import { useAuthStore } from '@/stores/use-auth-store';
import { useDirectorWorkbenchStore } from '@/stores/canvas/use-director-workbench-store';
import { sampleDirectorSequence, directorShotList } from '../../../../../shared/director-sequence';
import { prepareCanvasForTools } from '@/hooks/use-cloud-sync';

const noop = () => {};
/** Separate viewport renders immutable task input without touching the editor draft. */
export function DirectorRenderTasks({ projectId, sceneId, prepare, onAdopt }: { projectId: string; sceneId: string; prepare: () => Promise<void>; onAdopt?: AdoptDirectorRender }) {
    const owner = useAuthStore(state => state.user?.id);
    const epoch = useAuthStore(state => state.sessionEpoch);
    const [tasks, setTasks] = useState<DirectorRenderRequest[]>([]);
    const [active, setActive] = useState<DirectorRenderRequest | null>(null);
    const [frame, setFrame] = useState(0);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [readyView, setReadyView] = useState(false);
    const [framesText, setFramesText] = useState('0');
    const execution = useRef<AbortController | null>(null);
    const viewport = useRef<DirectorViewportHandle>(null);
    const ready = useRef(false);
    const controller = useRef<AbortController | null>(null);
    const browserSession = useRef(crypto.randomUUID());
    const creating = useRef(false);
    const pendingCreate = useRef<{ fingerprint: string; id: string } | null>(null);
    useEffect(() => {
        const session = new AbortController(); controller.current = session;
        setActive(null); setTasks([]); setBusy(false); setError('');
        if (owner) void directorClient(projectId, owner, session.signal).list().then(result => { if (!session.signal.aborted) setTasks(result.requests); }).catch(cause => { if (!session.signal.aborted) setError(String(cause.message || cause)); });
        return () => session.abort();
    }, [projectId, sceneId, owner, epoch]);
    const refresh = async () => {
        if (!owner || !controller.current) return;
        const session = controller.current;
        const result = await directorClient(projectId, owner, session.signal).list();
        if (!session.signal.aborted) setTasks(result.requests);
    };
    const perform = async (action: () => Promise<void>) => { const session = controller.current; try { setError(''); await action(); } catch (cause) { if (session && !session.signal.aborted) setError(cause instanceof Error ? cause.message : '任务处理失败'); } };
    const exportShotList = async () => {
        const signal = controller.current?.signal;
        if (!owner || !signal) return;
        await prepare();
        const project = await prepareCanvasForTools(projectId);
        if (signal.aborted || useAuthStore.getState().sessionEpoch !== epoch) return;
        const scene = project.content.directorScenes?.find(scene => scene.id === sceneId);
        if (!scene) throw new Error('场景已删除，不能导出镜头单');
        const manifest = directorShotList(scene, { projectId, projectVersion: project.version });
        saveAs(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json;charset=utf-8' }), `director-shot-list-${scene.id}-v${project.version}.json`);
    };
    const create = async (kind: 'frames' | 'video') => {
        if (!owner || !controller.current || creating.current) return;
        const signal = controller.current.signal;
        const fixedCameraId = useDirectorWorkbenchStore.getState().fixedPreviewCameraId || undefined;
        creating.current = true;
        try {
        await prepare();
        const project = await prepareCanvasForTools(projectId);
        if (signal.aborted) return;
        const scene = project.content.directorScenes?.find(scene => scene.id === sceneId);
        const sequence = scene?.cameraSequence;
        if (!sequence) throw new Error('请先建立切镜序列');
        if (fixedCameraId && !scene.cameras.some(camera => camera.id === fixedCameraId)) throw new Error('选定固定机位已不存在，请重新选择取景');
        const frames = kind === 'frames' ? framesText.split(/[,，\s]+/).filter(Boolean).map(Number) : undefined;
        const input = { expectedVersion: project.version, sceneId, parameters: { sequenceId: sequence.id, kind, startFrame: 0, endFrame: sequence.durationFrames, ...(fixedCameraId ? { fixedCameraId } : {}), ...(frames ? { frames } : {}) } };
        const fingerprint = JSON.stringify({ owner, epoch, projectId, ...input });
        if (pendingCreate.current?.fingerprint !== fingerprint) pendingCreate.current = { fingerprint, id: crypto.randomUUID() };
        await directorClient(projectId, owner, signal).create({ ...input, id: pendingCreate.current.id });
        if (signal.aborted) return;
        pendingCreate.current = null;
        await refresh();
        } finally { creating.current = false; }
    };
    const claim = async (task: DirectorRenderRequest) => {
        if (!owner || !controller.current) return;
        const signal = controller.current.signal;
        const result = await directorClient(projectId, owner, signal).claim(task.id, browserSession.current);
        if (signal.aborted || useAuthStore.getState().sessionEpoch !== epoch) return;
        setTasks(current => current.map(item => item.id === task.id ? { ...item, status: result.request.status } : item));
        ready.current = false; setReadyView(false); setFrame(result.request.parameters.startFrame); setActive(result.request);
    };
    const run = async () => {
        if (!active?.snapshot?.cameraSequence || !active.claimToken || !owner || !controller.current || busy || !ready.current) return;
        const local = new AbortController(); execution.current = local;
        const sessionSignal = controller.current.signal;
        const task = active, signal = AbortSignal.any([sessionSignal, local.signal]), sequence = active.snapshot.cameraSequence;
        const client = directorClient(projectId, owner, signal);
        const assert = () => { if (signal.aborted || useAuthStore.getState().sessionEpoch !== epoch || useAuthStore.getState().user?.id !== owner) throw new Error('渲染会话已结束'); };
        const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const outputs: Array<{ objectKey: string; frame?: number }> = [];
        const upload = async (blob: Blob, frame?: number) => {
            assert(); const media = await uploadMediaFile(blob, 'director-reference', { expectedOwner: owner, signal }); assert();
            const path = new URL(media.url, window.location.origin).pathname;
            if (!path.startsWith('/media/private/')) throw new Error('产物尚未保存到私有媒体');
            outputs.push({ objectKey: decodeURIComponent(path.slice(7)), ...(frame === undefined ? {} : { frame }) });
        };
        setBusy(true);
        try {
            if (task.parameters.kind === 'frames') for (const target of task.parameters.frames || []) {
                assert(); flushSync(() => setFrame(target)); await settle(); assert();
                if (!ready.current || !viewport.current) throw new Error('渲染资源未就绪');
                await upload(await viewport.current.captureShot(target / sequence.fps), target);
            } else {
                flushSync(() => setFrame(task.parameters.startFrame)); await settle(); assert();
                if (!viewport.current) throw new Error('渲染视口未就绪');
                const blob = await viewport.current.recordVideo((task.parameters.endFrame - task.parameters.startFrame) / sequence.fps, sequence.fps, { signal, onFrame: frame => { assert(); flushSync(() => setFrame(task.parameters.startFrame + frame)); } });
                await upload(blob);
            }
            await client.complete(task.id, task.claimToken!, outputs); assert(); setActive(null); await refresh();
        } catch (cause) {
            if (!signal.aborted) { await client.fail(task.id, task.claimToken!, cause instanceof Error ? cause.message : '渲染失败').catch(() => {}); setError(cause instanceof Error ? cause.message : '渲染失败'); await refresh().catch(() => {}); }
        } finally { if (!sessionSignal.aborted) setBusy(false); if (execution.current === local) execution.current = null; }
    };
    const scene = active?.snapshot;
    const sampled = scene?.cameraSequence ? sampleDirectorSequence(scene.cameraSequence, frame, active?.parameters.fixedCameraId) : null;
    const display = scene && sampled ? { ...scene, shots: scene.shots.map(shot => shot.id === scene.activeShotId ? { ...shot, cameraId: sampled.cameraId } : shot) } : null;
    return <section className="px-3 py-2 text-xs" aria-label="导演渲染任务">
        <div className="flex flex-wrap gap-3 py-2"><label>抽帧帧号（逗号分隔）<input className="bg-transparent border-b border-current ml-2" value={framesText} onChange={event => setFramesText(event.target.value)} /></label><button disabled={busy} onClick={() => void perform(() => create('frames'))}>保存并创建抽帧任务</button><button disabled={busy} onClick={() => void perform(() => create('video'))}>保存并创建整段视频任务</button></div>
        <button onClick={() => void perform(refresh)}>刷新渲染任务</button>
        <button className="ml-3" onClick={() => void perform(exportShotList)}>保存并导出镜头单</button>
        {error && <p role="alert">{error}</p>}
        {tasks.filter(task => task.sceneId === sceneId).map(task => <div key={task.id} className="flex flex-wrap gap-3 py-1"><span>{task.parameters.kind === 'frames' ? '参考帧' : '参考视频'} · {{ waiting: '等待浏览器', claimed: '已领取', completed: '已完成', failed: '失败', cancelled: '已取消' }[task.status]} · 来源版本 {task.projectVersion}</span>
            {!['completed', 'cancelled'].includes(task.status) && <button onClick={() => void perform(async () => { if (owner && controller.current) { if (active?.id === task.id) execution.current?.abort(); await directorClient(projectId, owner, controller.current.signal).cancel(task.id); if (active?.id === task.id) setActive(null); await refresh(); } })}>取消任务</button>}
            {!active && task.status === 'waiting' && <button onClick={() => void perform(() => claim(task))}>领取并预览</button>}
            {!busy && ['claimed', 'failed'].includes(task.status) && <button onClick={() => void perform(async () => { if (owner && controller.current) { await directorClient(projectId, owner, controller.current.signal).resume(task.id); setActive(null); await refresh(); } })}>重新领取（旧页面失效）</button>}
            {task.receipt?.outputs.map(output => <span key={output.objectKey} className="inline-flex gap-2"><a href={output.url} target="_blank" rel="noreferrer">查看{output.frame === undefined ? '视频' : `第 ${output.frame} 帧`}</a>{onAdopt && <button onClick={() => void perform(async () => { const signal = controller.current?.signal; await prepare(); if (!signal || signal.aborted) return; await onAdopt(task, output); })}>加入画布</button>}{onAdopt && task.parameters.kind === 'video' && !task.parameters.fixedCameraId && <button onClick={() => void perform(async () => { const signal = controller.current?.signal; await prepare(); if (!signal || signal.aborted) return; await onAdopt(task, output, 'production'); })}>按切点采用</button>}</span>)}
        </div>)}
        {display && <><div className="relative h-64"><DirectorViewport ref={viewport} scene={display} aspectRatioOverride={!display.aspectRatio || display.aspectRatio === 'adaptive' ? '16:9' : undefined} selectedObjectId={null} selectedBone={null} transformMode="translate" renderMode="beauty" viewMode="camera" playhead={sampled!.timeSeconds} playing={false} onCaptureReadyChange={value => { ready.current = value; setReadyView(value); }} onSelectObject={noop} onSelectBone={noop} onObjectTransform={noop} onSelectCamera={noop} onCameraTransform={noop} onMultiObjectTransform={noop} onBoneTransform={noop} onActorRigReady={noop} /></div><p role="status">{readyView ? "快照资源已就绪" : "正在加载快照资源"}</p><button disabled={busy || !readyView} onClick={() => void run()}>{busy ? '正在渲染上传' : '按此快照执行'}</button></>}
    </section>;
}
