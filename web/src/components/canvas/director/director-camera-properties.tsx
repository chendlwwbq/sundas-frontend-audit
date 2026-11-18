import { Input, Modal, Select } from "antd";
import { Camera as CameraIcon, Expand } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Group, SliderRow } from "@/components/canvas/director/director-scene-inspector";
import { DirectorKeyToggle, DirectorVecField } from "@/components/canvas/director/director-vec-field";
import { DIRECTOR_KEYFRAME_EPSILON, directorFovToFocalLength } from "@/lib/canvas/director/director-scene";
import { snapDirectorTime } from "@/lib/canvas/director/director-animation-semantics";
import { resolveDirectorCameraInspectorRotation, resolveDirectorCameraTrackValues, resolveDirectorCameraTransform } from "@/lib/canvas/director/director-view-modes";
import type { DirectorCamera, DirectorObject, DirectorScene, DirectorShot, DirectorTransform, DirectorVec3 } from "@/types/director";

type Props = {
    scene: DirectorScene;
    camera: DirectorCamera | null;
    cameras: DirectorCamera[];
    shot: DirectorShot;
    objects: DirectorObject[];
    onUpdateCamera: (patch: Partial<DirectorCamera>) => void;
    playhead?: number;
    onUpdateAnimated?: (patch: { transform?: DirectorTransform; target?: DirectorVec3; fov?: number }) => void;
    onUpdateRotation?: (rotation: DirectorVec3) => void;
    onToggleTrack?: (channel: "position" | "rotation" | "focus" | "fov") => void;
    onChangeLookAtMode?: (mode: "coordinates" | "rotation" | `object:${string}`) => void;
    onSelectCamera: (cameraId: string) => void;
    onFollowObject: (objectId: string) => void;
    children: ReactNode;
};

export function DirectorCameraProperties({ scene, camera, cameras, shot, objects, onUpdateCamera, onUpdateAnimated, onUpdateRotation, onToggleTrack, onChangeLookAtMode, playhead = 0, onSelectCamera, onFollowObject, children, previewUrl = null }: Props & { previewUrl?: string | null }) {
    const [previewOpen, setPreviewOpen] = useState(false);
    if (!camera) return <div className="dcp-root"><p className="dcp-empty">无可用机位</p></div>;
    const renderedTransform = resolveDirectorCameraTransform(camera, playhead);
    const renderedOptics = resolveDirectorCameraTrackValues(camera, playhead);
    const displayedRotation = resolveDirectorCameraInspectorRotation(scene, camera, playhead);
    const frame = camera.keyframes.find((key) => Math.abs(key.time - snapDirectorTime(playhead, shot.fps)) < DIRECTOR_KEYFRAME_EPSILON);
    const positionKeyed = Boolean(frame && frame.positionKeyed !== false);
    const rotationKeyed = Boolean(frame && frame.rotationKeyed !== false);
    const focusKeyed = frame?.target !== undefined;
    const fovKeyed = frame?.fov !== undefined;
    const changePosition = (position: DirectorVec3) => {
        const transform = { ...renderedTransform, position };
        if (onUpdateAnimated) onUpdateAnimated({ transform });
        else onUpdateCamera({ transform });
    };
    const changeTarget = (target: DirectorVec3) => {
        if (onUpdateAnimated) onUpdateAnimated({ target });
        else onUpdateCamera({ target });
    };
    const changeFov = (value: number) => {
        const fov = Math.max(15, Math.min(90, value));
        if (onUpdateAnimated) onUpdateAnimated({ fov });
        else onUpdateCamera({ fov, focalLength: directorFovToFocalLength(fov) });
    };
    const changeRotation = (degrees: DirectorVec3) => {
        if (camera.lookAtMode !== "rotation") return;
        const rotation: DirectorVec3 = [-degrees[0] * Math.PI / 180, (degrees[1] - 180) * Math.PI / 180, degrees[2] * Math.PI / 180];
        if (onUpdateRotation) onUpdateRotation(rotation);
        else onUpdateCamera({ transform: { ...renderedTransform, rotation } });
    };
    const lookAtValue = camera.lookAtMode === "rotation" ? "rotation"
        : camera.lookAtMode !== "coordinates" && objects.some((item) => item.id === camera.lookAtObjectId) ? `object:${camera.lookAtObjectId}` : "coordinates";
    const followValue = objects.some((item) => item.id === camera.followObjectId) ? camera.followObjectId : "";
    return <div className="dcp-root">
        <div aria-label="摄影机预览" className="dcp-preview">
            {previewUrl ? <img src={previewUrl} alt="" draggable={false} /> : <div className="dcp-preview-empty"><span className="flex items-center gap-2"><CameraIcon className="size-3.5" />正在生成机位预览</span></div>}
            <span className="dcp-preview-badge">FOV {Math.round(renderedOptics.fov)}°</span>
            <button type="button" aria-label="放大摄影机预览" title="放大预览" disabled={!previewUrl} onClick={() => setPreviewOpen(true)} className="dcp-preview-expand"><Expand className="size-3.5" /></button>
        </div>
        <Modal open={previewOpen} title={`${camera.name} · 预览`} footer={null} onCancel={() => setPreviewOpen(false)} width={960} destroyOnHidden>
            {previewUrl ? <img src={previewUrl} alt={`${camera.name}画面预览`} className="max-h-[72vh] w-full rounded-lg bg-black object-contain" /> : null}
        </Modal>
        <Group title="机位" hint="CAMERA">
            <Field label="名称"><Input size="small" variant="borderless" value={camera.name} onChange={(event) => onUpdateCamera({ name: event.target.value })} /></Field>
            <Field label="切换机位"><Select size="small" variant="borderless" className="w-full" value={shot.cameraId} options={cameras.map((item) => ({ label: item.name, value: item.id }))} onChange={onSelectCamera} /></Field>
        </Group>
        <Group title="变换" hint="TRANSFORM">
            <DirectorVecField label="位置" value={renderedTransform.position} step={0.1} precision={2} keyed={positionKeyed} onToggleKey={onToggleTrack ? () => onToggleTrack("position") : undefined} onChange={changePosition} />
            <DirectorVecField label="旋转" value={displayedRotation} step={1} precision={1} keyed={rotationKeyed} onToggleKey={onToggleTrack ? () => onToggleTrack("rotation") : undefined} onChange={changeRotation} />
        </Group>
        <Group title="注视与跟随" hint="TRACKING">
            <Field label="跟随目标"><Select size="small" variant="borderless" className="w-full" value={followValue} options={[{ label: "不跟随", value: "" }, ...objects.map((item) => ({ label: item.name, value: item.id }))]} onChange={onFollowObject} /></Field>
            <Field label="注视目标"><Select size="small" variant="borderless" className="w-full" value={lookAtValue} options={[{ label: "手动坐标", value: "coordinates" }, { label: "手动旋转", value: "rotation" }, ...objects.map((item) => ({ label: item.name, value: `object:${item.id}` }))]} onChange={(value) => onChangeLookAtMode ? onChangeLookAtMode(value as "coordinates" | "rotation" | `object:${string}`) : onUpdateCamera(value.startsWith("object:") ? { lookAtMode: "object", lookAtObjectId: value.slice(7) } : { lookAtMode: value as "coordinates" | "rotation", lookAtObjectId: undefined })} /></Field>
            {lookAtValue === "coordinates" ? <DirectorVecField label="注视坐标" value={renderedOptics.target} step={0.1} precision={2} keyed={focusKeyed} onToggleKey={onToggleTrack ? () => onToggleTrack("focus") : undefined} onChange={changeTarget} /> : null}
        </Group>
        <Group title="镜头" hint="LENS">
            <div className="dsp-field">
                <div className="dvec-head">
                    <span className="dvec-head-label">视野角度 (FOV)</span>
                    {onToggleTrack ? <DirectorKeyToggle keyed={fovKeyed} label="切换视野角度关键帧" onToggle={() => onToggleTrack("fov")} /> : null}
                </div>
                <SliderRow label="视野角度" value={Math.min(90, Math.max(15, renderedOptics.fov))} min={15} max={90} step={1} onCommit={changeFov} input={{ min: 15, max: 90, step: 1, suffix: "°" }} />
            </div>
        </Group>
        <details className="dcp-advanced">
            <summary>镜头高级参数</summary>
            <div className="dcp-advanced-body">{children}</div>
        </details>
    </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return <label className="dsp-field"><span className="dsp-field-label">{label}</span>{children}</label>;
}
