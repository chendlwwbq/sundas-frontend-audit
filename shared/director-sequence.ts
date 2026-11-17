import type { DirectorScene } from '../web/src/types/director';

/** Frame-based camera cuts. All animation continues on the shared scene clock. */
export type DirectorSequence = {
    schemaVersion: 1;
    id: string;
    name: string;
    fps: 24 | 25 | 30;
    durationFrames: number;
    cuts: Array<{ id: string; startFrame: number; cameraId: string }>;
};

export function validateDirectorSequence(value: unknown, cameraIds: readonly string[]): asserts value is DirectorSequence {
    const sequence = value as DirectorSequence | null;
    if (!sequence || sequence.schemaVersion !== 1 || typeof sequence.id !== 'string' || !sequence.id || typeof sequence.name !== 'string'
        || ![24, 25, 30].includes(sequence.fps) || !Number.isSafeInteger(sequence.durationFrames) || sequence.durationFrames <= 0
        || !Array.isArray(sequence.cuts) || !sequence.cuts.length) throw new Error('切镜序列格式或版本无效');
    const ids = new Set<string>();
    let previous = -1;
    for (const cut of sequence.cuts) {
        if (!cut || typeof cut.id !== 'string' || !cut.id || ids.has(cut.id) || !cameraIds.includes(cut.cameraId)
            || !Number.isSafeInteger(cut.startFrame) || cut.startFrame <= previous || cut.startFrame >= sequence.durationFrames
            || (previous === -1 && cut.startFrame !== 0)) throw new Error('切点必须从第 0 帧开始、严格递增，并引用有效机位');
        ids.add(cut.id);
        previous = cut.startFrame;
    }
}

/** Call after validation when loading/changing the sequence, not on every animation tick. */
export function sampleDirectorSequence(sequence: DirectorSequence, frame: number, fixedCameraId?: string) {
    if (!Number.isFinite(frame)) throw new Error('预演帧号无效');
    const resolvedFrame = Math.max(0, Math.min(sequence.durationFrames - 1, Math.floor(frame)));
    let cut = sequence.cuts[0];
    for (const next of sequence.cuts) {
        if (next.startFrame > resolvedFrame) break;
        cut = next;
    }
    return { frame: resolvedFrame, timeSeconds: resolvedFrame / sequence.fps, cameraId: fixedCameraId ?? cut.cameraId, cutId: cut.id };
}

/** A shot list describes saved cuts, not rendered media or generated footage. */
export function directorShotList(scene: { id: string; title: string; cameras: Array<{ id: string; name: string }>; cameraSequence?: DirectorSequence }, source: { projectId: string; projectVersion: number }) {
    if (!scene.cameraSequence) throw new Error('场景尚未建立切镜序列');
    validateDirectorSequence(scene.cameraSequence, scene.cameras.map(camera => camera.id));
    if (!source.projectId || !Number.isSafeInteger(source.projectVersion) || source.projectVersion < 1) throw new Error('镜头单需要已保存的项目版本');
    const sequence = scene.cameraSequence;
    return {
        schemaVersion: 1, ...source, sceneId: scene.id, sceneTitle: scene.title,
        sequenceId: sequence.id, sequenceName: sequence.name, fps: sequence.fps,
        durationFrames: sequence.durationFrames, durationSeconds: sequence.durationFrames / sequence.fps,
        interval: '[startFrame,endFrame)',
        cuts: sequence.cuts.map((cut, index) => {
            const endFrame = sequence.cuts[index + 1]?.startFrame ?? sequence.durationFrames;
            return { ...cut, cameraName: scene.cameras.find(camera => camera.id === cut.cameraId)!.name,
                endFrame, startSeconds: cut.startFrame / sequence.fps, endSeconds: endFrame / sequence.fps };
        }),
    };
}

/** Preserve seconds when changing fps; refuse collisions instead of dropping cuts. */
export function retimeDirectorSequence(sequence: DirectorSequence, fps: DirectorSequence['fps'], cameraIds: readonly string[]) {
    const next = { ...sequence, fps, durationFrames: Math.round(sequence.durationFrames * fps / sequence.fps),
        cuts: sequence.cuts.map(cut => ({ ...cut, startFrame: Math.round(cut.startFrame * fps / sequence.fps) })) };
    validateDirectorSequence(next, cameraIds);
    return next;
}

export type DirectorSequenceCommand =
    | { type: 'insert'; cut: DirectorSequence['cuts'][number] }
    | { type: 'update'; id: string; startFrame?: number; cameraId?: string }
    | { type: 'remove'; id: string }
    | { type: 'duration'; durationFrames: number }
    | { type: 'fps'; fps: DirectorSequence['fps'] };

/** Review the actual rounding and sampling impact before committing a timing edit. */
export function previewDirectorSequenceTiming(scene: DirectorScene, command: Extract<DirectorSequenceCommand, { type: 'fps' | 'duration' }>) {
    const sequence = scene.cameraSequence;
    if (!sequence) throw new Error('场景尚未建立序列');
    const fps = command.type === 'fps' ? command.fps : sequence.fps;
    const durationFrames = command.type === 'duration' ? command.durationFrames : Math.round(sequence.durationFrames * fps / sequence.fps);
    const cuts = sequence.cuts.map(cut => ({ ...cut, previousFrame: cut.startFrame,
        startFrame: command.type === 'fps' ? Math.round(cut.startFrame * fps / sequence.fps) : cut.startFrame }));
    const lines = [`${sequence.fps}fps / ${sequence.durationFrames} 帧 → ${fps}fps / ${durationFrames} 帧`];
    for (const cut of cuts) {
        const name = scene.cameras.find(camera => camera.id === cut.cameraId)?.name || cut.cameraId;
        lines.push(`${name}：第 ${cut.previousFrame} 帧 → 第 ${cut.startFrame} 帧（${(cut.previousFrame / sequence.fps).toFixed(3)} 秒 → ${(cut.startFrame / fps).toFixed(3)} 秒）${cut.startFrame >= durationFrames ? '，超出新范围' : ''}`);
    }
    const lastTime = (durationFrames - 1) / fps;
    if (lastTime < (sequence.durationFrames - 1) / sequence.fps) {
        for (const item of [...scene.objects, ...scene.cameras]) {
            const times = item.keyframes.map(frame => frame.time);
            if ('boneTracks' in item) times.push(...(item.boneTracks || []).flatMap(track => track.keyframes.map(frame => frame.time)));
            if ('motionClips' in item) times.push(...(item.motionClips || []).map(clip => clip.start + clip.duration));
            if ('motionPath' in item && item.motionPath) times.push((item.motionPath.startTime || 0) + item.motionPath.duration);
            if (times.some(time => time > lastTime)) lines.push(`${item.name}：部分动作或关键帧位于新的末帧时间 ${lastTime.toFixed(3)} 秒之后；原数据保留，但本次预演不会播放到该处。`);
        }
    }
    try { return { lines, next: editDirectorSequence(sequence, command, scene.cameras.map(camera => camera.id)), error: '' }; }
    catch (cause) { return { lines, next: null, error: cause instanceof Error ? cause.message : '序列调整无效' }; }
}

/** Pure atomic edit: validation failures never mutate the user's original sequence. */
export function editDirectorSequence(sequence: DirectorSequence, command: DirectorSequenceCommand, cameraIds: readonly string[]): DirectorSequence {
    validateDirectorSequence(sequence, cameraIds);
    if (command.type === 'fps') return retimeDirectorSequence(sequence, command.fps, cameraIds);
    const next = structuredClone(sequence);
    if (command.type === 'duration') next.durationFrames = command.durationFrames;
    else if (command.type === 'insert') next.cuts.push({ ...command.cut });
    else {
        const index = next.cuts.findIndex(cut => cut.id === command.id);
        if (index < 0) throw new Error('切点不存在，请重新读取场景');
        if (command.type === 'remove') {
            if (index === 0) throw new Error('第 0 帧切点必须保留，可替换其机位');
            next.cuts.splice(index, 1);
        } else {
            if (index === 0 && command.startFrame !== undefined && command.startFrame !== 0) throw new Error('首个切点必须位于第 0 帧');
            if (command.startFrame !== undefined) next.cuts[index].startFrame = command.startFrame;
            if (command.cameraId !== undefined) next.cuts[index].cameraId = command.cameraId;
        }
    }
    next.cuts.sort((a, b) => a.startFrame - b.startFrame);
    validateDirectorSequence(next, cameraIds);
    return next;
}

export function validateDirectorSceneSequence(scene: { cameraSequence?: unknown; cameras: Array<{ id: string }> }): void {
    if (scene.cameraSequence !== undefined) validateDirectorSequence(scene.cameraSequence, scene.cameras.map(camera => camera.id));
}

/** The capability marks an intentional edit/delete by a sequence-aware client. */
export function validateDirectorSequenceWrite(previous: unknown, next: unknown, capability?: number): void {
    const scenes = (content: unknown): Array<{ id: string; cameraSequence?: unknown; cameras: Array<{ id: string }> }> => {
        if (!content || typeof content !== 'object') return [];
        const value = (content as { directorScenes?: unknown }).directorScenes;
        if (value === undefined) return [];
        if (!Array.isArray(value)) throw new Error('导演场景列表格式无效');
        return value;
    };
    const incoming = scenes(next);
    for (const scene of incoming) {
        if (!scene || typeof scene !== 'object') throw new Error('导演场景格式无效');
        validateDirectorSceneSequence(scene);
    }
    for (const old of scenes(previous)) {
        if (old?.cameraSequence === undefined) continue;
        validateDirectorSceneSequence(old);
        const replacement = incoming.find(scene => scene.id === old.id);
        if (capability !== 1 && JSON.stringify(replacement?.cameraSequence) !== JSON.stringify(old.cameraSequence)) {
            throw new Error('当前客户端未声明切镜序列支持，请刷新页面后再保存；云端序列已保留');
        }
    }
}
