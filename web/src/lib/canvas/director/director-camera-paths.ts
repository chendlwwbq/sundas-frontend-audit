import { nanoid } from "nanoid";
import { CatmullRomCurve3, Vector3 } from "three";

import { resolveDirectorCameraAlignment } from "@/lib/canvas/director/director-animation-semantics";
import { DIRECTOR_KEYFRAME_EPSILON, directorFovToFocalLength, interpolateDirectorTransform, upsertDirectorKeyframe } from "@/lib/canvas/director/director-scene";
import { resolveDirectorCameraAimRotation, resolveDirectorCameraLocalFraming, resolveDirectorCameraTrackValues, resolveDirectorCameraTransform } from "@/lib/canvas/director/director-view-modes";
import type { DirectorCamera, DirectorKeyframe, DirectorScene, DirectorTransform, DirectorVec3 } from "@/types/director";
import { resampleDirectorGroundPath } from "@/lib/canvas/director/director-path-sampling";

export type DirectorCameraPathKind = "line" | "ring" | "rectangle";
export type DirectorCameraDrawPathKind = "pencil" | "pen";
import { buildDirectorMotionPresetKeyframes, type DirectorMotionPresetKind } from "../../../../../shared/director-motion-presets";
export type { DirectorMotionPresetKind } from "../../../../../shared/director-motion-presets";

export function createDirectorCameraDrawnPathKeyframes(kind: DirectorCameraDrawPathKind, camera: DirectorCamera, points: { x: number; z: number }[], duration: number): DirectorKeyframe[] | null {
    const sampled: { x: number; z: number }[] = [];
    for (const point of points) {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) continue;
        const prior = sampled.at(-1);
        if (!prior || Math.hypot(point.x - prior.x, point.z - prior.z) > 1e-6) sampled.push(point);
    }
    const finalPoint = points.at(-1);
    const last = sampled.at(-1);
    if (kind === "pencil" && finalPoint && last && Number.isFinite(finalPoint.x) && Number.isFinite(finalPoint.z) && Math.hypot(finalPoint.x - last.x, finalPoint.z - last.z) > 1e-6) sampled.push(finalPoint);
    const route = kind === "pencil" ? resampleDirectorGroundPath(sampled, 10) : sampled;
    if (route.length < 2) return null;

    const [x, y, z] = camera.transform.position;
    const seconds = Number.isFinite(duration) && duration > 0 ? duration : 10;
    let positions: DirectorVec3[];
    let times: number[];
    if (kind === "pen") {
        const anchors = [[x, y, z], ...sampled.map((point) => [point.x, y, point.z])] as DirectorVec3[];
        const curve = new CatmullRomCurve3(anchors.map((point) => new Vector3(...point)), false, "centripetal");
        const segments = (anchors.length - 1) * 8;
        positions = Array.from({ length: segments + 1 }, (_, index) => curve.getPoint(index / segments).toArray() as DirectorVec3);
        times = positions.map((_, index) => seconds * index / segments);
    } else {
        const distances = route.map((point, index) => index ? Math.hypot(point.x - route[index - 1].x, point.z - route[index - 1].z) : 0);
        const length = distances.reduce((sum, segment) => sum + segment, 0);
        if (length < 1e-5) return null;
        positions = route.map((point) => [x + point.x - route[0].x, y, z + point.z - route[0].z]);
        times = route.map((_, index) => seconds * index / (route.length - 1));
    }
    return positions.map((position, index) => ({ id: nanoid(), time: times[index], transform: { ...camera.transform, position }, target: [...camera.target] as DirectorVec3, fov: camera.fov, easing: "linear" }));
}

/** Explicit key button: create a position frame even when the camera has no animation yet. */
export function recordDirectorCameraPositionAtTime(camera: DirectorCamera, rawTime: number, snappedTime: number): DirectorCamera {
    const transform = resolveDirectorCameraTransform(camera, rawTime);
    const existing = camera.keyframes.find((key) => Math.abs(key.time - snappedTime) < DIRECTOR_KEYFRAME_EPSILON);
    return { ...camera, keyframes: upsertDirectorKeyframe(camera.keyframes, snappedTime, transform)
        .map((key) => Math.abs(key.time - snappedTime) < DIRECTOR_KEYFRAME_EPSILON ? { ...key, positionKeyed: true, rotationKeyed: existing ? existing.rotationKeyed : false } : key) };
}

/** The rotation diamond owns its own transform channel, not the position channel. */
export function recordDirectorCameraRotationAtTime(camera: DirectorCamera, rawTime: number, snappedTime: number, rotation: DirectorVec3): DirectorCamera {
    const transform = { ...resolveDirectorCameraTransform(camera, rawTime), rotation };
    const existing = camera.keyframes.find((key) => Math.abs(key.time - snappedTime) < DIRECTOR_KEYFRAME_EPSILON);
    return { ...camera, keyframes: upsertDirectorKeyframe(camera.keyframes, snappedTime, transform)
        .map((key) => Math.abs(key.time - snappedTime) < DIRECTOR_KEYFRAME_EPSILON ? { ...key, positionKeyed: existing ? existing.positionKeyed : false, rotationKeyed: true } : key) };
}

/** Change aim mode without a one-frame camera jump, recording only the channel that now owns the view. */
export function switchDirectorCameraLookAtMode(scene: DirectorScene, camera: DirectorCamera, rawTime: number, snappedTime: number, mode: "coordinates" | "rotation"): DirectorCamera {
    if (camera.lookAtMode === mode) return camera;
    const framing = resolveDirectorCameraLocalFraming(scene, camera, rawTime);
    if (!framing) return { ...camera, lookAtMode: mode, lookAtObjectId: undefined };
    if (mode === "rotation") {
        const rotation = resolveDirectorCameraAimRotation(scene, camera, rawTime);
        if (!rotation) return camera;
        const next = camera.keyframes.length
            ? recordDirectorCameraRotationAtTime(camera, rawTime, snappedTime, rotation)
            : { ...camera, transform: { ...camera.transform, rotation } };
        return { ...next, lookAtMode: "rotation", lookAtObjectId: undefined };
    }
    const position = new Vector3(...framing.position);
    const view = new Vector3(...framing.target).sub(position).normalize();
    const previousTarget = new Vector3(...resolveDirectorCameraTrackValues(camera, rawTime).target);
    const distance = Math.max(1, previousTarget.distanceTo(position));
    const target = position.addScaledVector(view, distance).toArray() as DirectorVec3;
    const next = camera.keyframes.length
        ? updateDirectorCameraOpticsAtTime(camera, rawTime, snappedTime, { target })
        : { ...camera, target };
    return { ...next, lookAtMode: "coordinates", lookAtObjectId: undefined };
}

/** Inspector values follow the playhead. Static cameras keep their base fields; animated cameras write only the selected track at this frame. */
export function updateDirectorCameraPropertyAtTime(camera: DirectorCamera, rawTime: number, snappedTime: number, patch: { transform?: DirectorTransform; target?: DirectorVec3; fov?: number }): DirectorCamera {
    if (patch.transform) return resolveDirectorCameraAlignment(camera, patch.transform, snappedTime);
    if (!camera.keyframes.length) return {
        ...camera,
        ...(patch.target ? { target: patch.target, lookAtMode: "coordinates" as const, lookAtObjectId: undefined } : {}),
        ...(patch.fov !== undefined ? { fov: patch.fov, focalLength: directorFovToFocalLength(patch.fov) } : {}),
    };
    return updateDirectorCameraOpticsAtTime(camera, rawTime, snappedTime, patch);
}

export function updateDirectorCameraOpticsAtTime(camera: DirectorCamera, rawTime: number, snappedTime: number, patch: { target?: DirectorCamera["target"]; fov?: number }): DirectorCamera {
    const transform = resolveDirectorCameraTransform(camera, rawTime);
    const optical = resolveDirectorCameraTrackValues(camera, rawTime);
    const recordAll = patch.target === undefined && patch.fov === undefined;
    const existing = camera.keyframes.find((key) => Math.abs(key.time - snappedTime) < DIRECTOR_KEYFRAME_EPSILON);
    const keyframes = upsertDirectorKeyframe(camera.keyframes, snappedTime, transform).map((key) => Math.abs(key.time - snappedTime) < DIRECTOR_KEYFRAME_EPSILON
        ? { ...key, positionKeyed: recordAll ? true : existing ? existing.positionKeyed : false, rotationKeyed: recordAll ? true : existing ? existing.rotationKeyed : false, ...(recordAll || patch.target !== undefined ? { target: patch.target ?? optical.target } : {}), ...(recordAll || patch.fov !== undefined ? { fov: patch.fov ?? optical.fov } : {}) }
        : key);
    return { ...camera, keyframes, ...(patch.target ? { lookAtMode: "coordinates" as const, lookAtObjectId: undefined } : {}) };
}

export function createDirectorMotionPresetKeyframes(kind: DirectorMotionPresetKind, action: "replace" | "append", camera: DirectorCamera, duration: number) {
    return buildDirectorMotionPresetKeyframes(kind, action, camera, duration, nanoid);
}

export function retimeDirectorCameraPathKeyframes(keys: DirectorKeyframe[], fromDuration: number, toDuration: number): DirectorKeyframe[] {
    if (!Number.isFinite(fromDuration) || fromDuration <= 0 || !Number.isFinite(toDuration) || toDuration <= 0) return keys;
    return keys.map((key) => ({ ...key, time: key.time * toDuration / fromDuration }));
}

export function createDirectorCameraPathKeyframes(kind: DirectorCameraPathKind, camera: DirectorCamera, duration: number): DirectorKeyframe[] {
    const [x, y, z] = camera.transform.position;
    const [targetX, , targetZ] = camera.target;
    const dx = targetX - x;
    const dz = targetZ - z;
    const distance = Math.hypot(dx, dz);
    const forwardX = distance > 1e-6 ? dx / distance : 0;
    const forwardZ = distance > 1e-6 ? dz / distance : -1;
    const seconds = Number.isFinite(duration) && duration > 0 ? duration : 0.5;
    const positions: [number, number, number][] = kind === "line"
        ? [[x, y, z], [x + forwardX * Math.min(2, distance * 0.45), y, z + forwardZ * Math.min(2, distance * 0.45)]]
        : kind === "ring"
            ? Array.from({ length: 9 }, (_, index) => {
                if (index === 0 || index === 8) return [x, y, z];
                const angle = index * Math.PI / 4;
                const radialX = x - targetX;
                const radialZ = z - targetZ;
                return [targetX + radialX * Math.cos(angle) - radialZ * Math.sin(angle), y, targetZ + radialX * Math.sin(angle) + radialZ * Math.cos(angle)];
            })
            : (() => {
                const side = Math.max(1, Math.min(distance * 0.4, 3));
                const rightX = -forwardZ;
                const rightZ = forwardX;
                const corner = (right: number, forward: number): [number, number, number] => [x + rightX * right + forwardX * forward, y, z + rightZ * right + forwardZ * forward];
                return [corner(0, 0), corner(side, 0), corner(side, side), corner(0, side), corner(0, 0)];
            })();

    return positions.map((position, index) => ({
        id: nanoid(),
        time: index === positions.length - 1 ? seconds : seconds * index / (positions.length - 1),
        transform: { ...camera.transform, position },
        target: [...camera.target] as [number, number, number],
        fov: camera.fov,
        easing: kind === "ring" ? "smooth" : "linear",
    }));
}
