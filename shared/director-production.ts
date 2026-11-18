import { validateDirectorSequence, type DirectorSequence } from './director-sequence';
import { defaultShotComposition, type ProductionDocument, type ProductionMedia } from './production';

export type DirectorCutMapping = { shotId: string; cutId: string; title: string; cameraId: string; startFrame: number; endFrame: number; inMs: number; outMs: number };
export const directorProductionShotId = (sceneId: string, sequenceId: string, cutId: string) => `director:${[sceneId, sequenceId, cutId].map(encodeURIComponent).join(':')}`;
export function directorProductionMapping(scene: { id: string; cameras: Array<{ id: string; name: string }>; cameraSequence?: DirectorSequence }, parameters: { sequenceId: string; kind: string; startFrame: number; endFrame: number; fixedCameraId?: string }, durationMs: number): DirectorCutMapping[] {
    const sequence = scene.cameraSequence;
    if (!sequence || sequence.id !== parameters.sequenceId || parameters.kind !== 'video' || parameters.fixedCameraId) throw new Error('请选择按序列录制的参考视频');
    validateDirectorSequence(sequence, scene.cameras.map(camera => camera.id));
    if (!Number.isSafeInteger(parameters.startFrame) || !Number.isSafeInteger(parameters.endFrame) || parameters.startFrame < 0 || parameters.endFrame > sequence.durationFrames || parameters.endFrame <= parameters.startFrame) throw new Error('预演视频帧范围无效');
    const requiredMs = (parameters.endFrame - parameters.startFrame) * 1000 / sequence.fps;
    if (!Number.isFinite(durationMs) || durationMs < requiredMs) throw new Error('实际视频时长不足以覆盖切镜范围，请重新录制后采用');
    return sequence.cuts.flatMap((cut, index) => {
        const startFrame = Math.max(cut.startFrame, parameters.startFrame);
        const endFrame = Math.min(sequence.cuts[index + 1]?.startFrame ?? sequence.durationFrames, parameters.endFrame);
        if (startFrame >= endFrame) return [];
        return [{ shotId: directorProductionShotId(scene.id, sequence.id, cut.id), cutId: cut.id,
            title: `${scene.cameras.find(camera => camera.id === cut.cameraId)!.name} · 第 ${startFrame}–${endFrame} 帧`, cameraId: cut.cameraId,
            startFrame, endFrame, inMs: (startFrame - parameters.startFrame) * 1000 / sequence.fps, outMs: (endFrame - parameters.startFrame) * 1000 / sequence.fps }];
    });
}

/** Stable cut identity retains edited titles/order and unrelated shots across recordings. */
export function adoptDirectorCuts(source: ProductionDocument, mapping: DirectorCutMapping[], media: ProductionMedia): ProductionDocument {
    if (media.kind !== 'video') throw new Error('切镜采用需要视频素材');
    const next = structuredClone(source);
    for (const cut of mapping) {
        let shot = next.shots.find(shot => shot.shotId === cut.shotId);
        if (!shot) {
            shot = { shotId: cut.shotId, title: cut.title, description: '', action: '', prompt: '', references: [], revision: 1 };
            next.shots.push(shot);
        }
        shot.adoptedMedia = { ...media };
        shot.mediaRevision = shot.revision || 1;
        next.composition.shots[cut.shotId] = { ...defaultShotComposition(), ...next.composition.shots[cut.shotId], inMs: cut.inMs, outMs: cut.outMs, durationMs: cut.outMs - cut.inMs };
    }
    return next;
}
