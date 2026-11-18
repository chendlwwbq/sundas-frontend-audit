import { useState, useRef, useEffect } from 'react';
import { nanoid } from 'nanoid';
import type { DirectorScene, DirectorShot } from '@/types/director';
import { useDirectorWorkbenchStore } from '@/stores/canvas/use-director-workbench-store';
import { editDirectorSequence, previewDirectorSequenceTiming, type DirectorSequence, type DirectorSequenceCommand } from '../../../../../shared/director-sequence';

export function DirectorSequenceControls({ scene, shot, onChange }: { scene: DirectorScene; shot: DirectorShot; onChange: (sequence: DirectorSequence) => void }) {
    const playhead = useDirectorWorkbenchStore((s) => s.playhead);
    const workspaceView = useDirectorWorkbenchStore((s) => s.workspaceView);
    const playbackScope = useDirectorWorkbenchStore((s) => s.playbackScope);
    const sequenceLoop = useDirectorWorkbenchStore((s) => s.sequenceLoop);
    const fixedPreviewCameraId = useDirectorWorkbenchStore((s) => s.fixedPreviewCameraId);
    const setPlaying = useDirectorWorkbenchStore((s) => s.setPlaying);
    const setPlayhead = useDirectorWorkbenchStore((s) => s.setPlayhead);
    const setWorkspaceView = useDirectorWorkbenchStore((s) => s.setWorkspaceView);
    const setPlaybackScope = useDirectorWorkbenchStore((s) => s.setPlaybackScope);
    const setSequenceLoop = useDirectorWorkbenchStore((s) => s.setSequenceLoop);
    const setFixedPreviewCameraId = useDirectorWorkbenchStore((s) => s.setFixedPreviewCameraId);
    const [error, setError] = useState('');
    const track = useRef<HTMLDivElement>(null);
    const [drag, setDrag] = useState<{ id: string; frame: number } | null>(null);
    const sequence = scene.cameraSequence;
    const [durationDraft, setDurationDraft] = useState(String(sequence?.durationFrames || ''));
    const [timing, setTiming] = useState<{ scene: DirectorScene; review: ReturnType<typeof previewDirectorSequenceTiming> } | null>(null);
    useEffect(() => { setDurationDraft(String(sequence?.durationFrames || '')); setTiming(null); }, [scene.id, sequence]);
    const reviewTiming = (command: Extract<DirectorSequenceCommand, { type: 'fps' | 'duration' }>) => {
        try { setTiming({ scene, review: previewDirectorSequenceTiming(scene, command) }); setError(''); }
        catch (cause) { setError(cause instanceof Error ? cause.message : '无法预览调整'); }
    };
    const frame = sequence ? Math.min(sequence.durationFrames - 1, Math.round(playhead * sequence.fps)) : 0;
    const edit = (command: DirectorSequenceCommand) => {
        if (!sequence) return;
        try { onChange(editDirectorSequence(sequence, command, scene.cameras.map(camera => camera.id))); setError(''); }
        catch (cause) { setError(cause instanceof Error ? cause.message : '切镜修改失败'); }
    };
    const seek = (target: number) => { if (!sequence) return; setPlaying(false); setPlayhead(Math.max(0, Math.min(sequence.durationFrames - 1, target)) / sequence.fps); };
    const control = 'bg-transparent rounded px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10 focus-visible:outline focus-visible:outline-2';
    return <section aria-label="多机位序列" className="shrink-0 px-3 py-2 text-xs" style={{ background: 'var(--director-sequencer-surface)', color: 'inherit' }}>
        <div className="flex flex-wrap items-center gap-2">
            <button className={control} onClick={() => setWorkspaceView(workspaceView === 'preview' ? 'scene' : 'preview')}>{workspaceView === 'preview' ? '编辑场景' : '查看成片预演'}</button>
            <label>预演范围 <select className={control} value={playbackScope} onChange={event => { setPlaybackScope(event.target.value as 'shot' | 'sequence'); if (event.target.value === 'sequence') setWorkspaceView('preview'); }}><option value="shot">单镜头</option><option value="sequence" disabled={!sequence}>切镜序列</option></select></label>
            {!sequence ? <button className={control} onClick={() => {
                onChange({ schemaVersion: 1, id: nanoid(), name: '切镜序列', fps: shot.fps, durationFrames: Math.max(1, Math.round(shot.duration * shot.fps)), cuts: [{ id: nanoid(), startFrame: 0, cameraId: shot.cameraId }] });
                setPlaybackScope('sequence'); setWorkspaceView('preview');
            }}>从当前镜头建立序列</button> : <>
                <label>帧数 <input aria-label="序列总帧数" className={`${control} w-20`} type="number" min={1} step={1} value={durationDraft} onChange={event => setDurationDraft(event.target.value)} /></label>
                <button className={control} disabled={durationDraft === String(sequence.durationFrames)} onClick={() => reviewTiming({ type: 'duration', durationFrames: Number(durationDraft) })}>预览时长调整</button>
                <label>帧率 <select className={control} value={sequence.fps} onChange={event => reviewTiming({ type: 'fps', fps: Number(event.target.value) as DirectorSequence['fps'] })}>{[24, 25, 30].map(fps => <option key={fps} value={fps}>{fps}</option>)}</select></label>
                <label><input type="checkbox" checked={sequenceLoop} onChange={event => setSequenceLoop(event.target.checked)} /> 循环</label>
                <label>取景 <select className={control} value={fixedPreviewCameraId || ''} onChange={event => setFixedPreviewCameraId(event.target.value || null)}><option value="">跟随切镜</option>{scene.cameras.map(camera => <option key={camera.id} value={camera.id}>{camera.name}</option>)}</select></label>
                <button className={control} onClick={() => seek(frame - 1)}>上一帧</button><button className={control} onClick={() => seek(frame + 1)}>下一帧</button>
                <button className={control} disabled={!sequence.cuts.some(cut => cut.startFrame < frame)} onClick={() => seek([...sequence.cuts].reverse().find(cut => cut.startFrame < frame)?.startFrame ?? 0)}>上一切点</button>
                <button className={control} disabled={!sequence.cuts.some(cut => cut.startFrame > frame)} onClick={() => seek(sequence.cuts.find(cut => cut.startFrame > frame)?.startFrame ?? frame)}>下一切点</button>
                <button className={control} onClick={() => edit({ type: 'insert', cut: { id: nanoid(), startFrame: frame, cameraId: shot.cameraId } })}>在第 {frame} 帧切换到当前机位</button>
            </>}
        </div>
        {sequence && playbackScope === 'sequence' ? <>
        <div ref={track} className="relative mx-3 my-2 h-10 border-b border-current" aria-label="切点拖动时间线">
            <span className="pointer-events-none absolute top-0 h-full border-l border-current opacity-50" style={{ left: `${frame / sequence.durationFrames * 100}%` }} />
            {sequence.cuts.map((cut, index) => <button key={cut.id} type="button" className={`${control} absolute top-0 touch-none`} style={{ left: `${(drag?.id === cut.id ? drag.frame : cut.startFrame) / sequence.durationFrames * 100}%`, transform: 'translateX(-50%)' }} aria-label={`拖动切点 ${index + 1}，也可使用下方帧数输入`} onClick={() => seek(cut.startFrame)} onPointerDown={event => {
                if (!index) return; event.currentTarget.setPointerCapture(event.pointerId); setDrag({ id: cut.id, frame: cut.startFrame });
            }} onPointerMove={event => {
                if (drag?.id !== cut.id || !track.current) return;
                const rect = track.current.getBoundingClientRect();
                setDrag({ id: cut.id, frame: Math.max(1, Math.min(sequence.durationFrames - 1, Math.round((event.clientX - rect.left) / rect.width * sequence.durationFrames))) });
            }} onPointerUp={event => {
                if (drag?.id !== cut.id) return;
                edit({ type: 'update', id: cut.id, startFrame: drag.frame }); setDrag(null); event.currentTarget.releasePointerCapture(event.pointerId);
            }} onPointerCancel={() => setDrag(null)}>◆ {index + 1}</button>)}
        </div>
        <div className="flex gap-2 overflow-x-auto py-2" aria-label="切镜轨道">{sequence.cuts.map((cut, index) => <div key={cut.id} className="flex shrink-0 items-center gap-1">
            <button className={control} onClick={() => seek(cut.startFrame)} aria-label={`跳转第 ${cut.startFrame} 帧`}>{index + 1}.</button>
            <input aria-label={`切点 ${index + 1} 起始帧`} className={`${control} w-20`} type="number" min={0} step={1} disabled={index === 0} value={cut.startFrame} onChange={event => edit({ type: 'update', id: cut.id, startFrame: Number(event.target.value) })} />
            <select aria-label={`切点 ${index + 1} 机位`} className={control} value={cut.cameraId} onChange={event => edit({ type: 'update', id: cut.id, cameraId: event.target.value })}>{scene.cameras.map(camera => <option key={camera.id} value={camera.id}>{camera.name}</option>)}</select>
            <button className={control} disabled={index === 0} onClick={() => edit({ type: 'remove', id: cut.id })}>删除</button>
        </div>)}</div></> : null}
        {timing ? <div role="region" aria-label="序列时间调整预览">
            <ul>{timing.review.lines.map((line, index) => <li key={index}>{line}</li>)}</ul>
            {timing.review.error ? <p role="alert">{timing.review.error}；请先调整切点，当前序列尚未改变。</p> : null}
            {timing.scene !== scene ? <p role="alert">场景已有新修改，请重新预览调整。</p> : null}
            <button className={control} disabled={!timing.review.next || timing.scene !== scene} onClick={() => { if (timing.review.next && timing.scene === scene) onChange(timing.review.next); setTiming(null); }}>确认时间调整</button>
            <button className={control} onClick={() => { setTiming(null); setDurationDraft(String(sequence?.durationFrames || '')); }}>取消时间调整</button>
        </div> : null}
        {error ? <p role="alert">{error}</p> : null}
    </section>;
}
