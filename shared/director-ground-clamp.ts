import type { DirectorCamera, DirectorKeyframe, DirectorObject, DirectorScene, DirectorTransform, DirectorVec3 } from "../web/src/types/director";
import { directorGroundSettings } from "./director-ground";


/**
 * 摄影机贴地余量：镜头允许贴近地面取景，但不能钻进地面里穿模。
 * 人物/道具没有余量——脚底、底面正好落在地面高度即视为合法。
 */
export const DIRECTOR_CAMERA_GROUND_CLEARANCE = 0.05;

/** 自由视角（环绕相机）的贴地余量，比机位稍大，避免相机擦着地面出现地平线翻面。 */
export const DIRECTOR_ORBIT_GROUND_CLEARANCE = 0.25;

/**
 * 内置几何体的半高（未乘缩放）。
 *
 * 这些 primitive 的 transform.position 是几何中心而不是底面，直接拿 y 和地面比，
 * 会让一个 1×1×1 的箱子在 y=0 时正好埋掉一半。取值与 director-viewport 里的
 * 几何参数一一对应，改那边记得同步这里。
 */
const DIRECTOR_PRIMITIVE_HALF_HEIGHT: Partial<Record<NonNullable<DirectorObject["primitive"]>, number>> = {
    box: 0.5,
    sphere: 0.6,
    cylinder: 0.6,
    plane: 0.5,
    torus: 0.58,
    cone: 0.6,
    pyramid: 0.6,
    empty: 0,
    character: 0,
};

/**
 * 对象锚点到「物体最低点」的距离，用来把「不许低于地面」翻译成「锚点至少要多高」。
 * 角色与导入模型的枢轴就在脚底/原点（模型 bbox 在场景层不可知），因此偏移为 0。
 */
export function directorObjectGroundBase(object: Pick<DirectorObject, "kind" | "primitive">): number {
    if (object.kind === "actor" || object.kind === "model") return 0;
    return object.primitive ? DIRECTOR_PRIMITIVE_HALF_HEIGHT[object.primitive] ?? 0 : 0;
}

function scaleY(transform: DirectorTransform | undefined): number {
    const value = Math.abs(transform?.scale?.[1] ?? 1);
    return Number.isFinite(value) && value > 0 ? value : 1;
}

/** 对象（含当前缩放）的锚点下限。 */
export function directorObjectGroundFloor(object: Pick<DirectorObject, "kind" | "primitive" | "transform">, groundHeight: number): number {
    return groundHeight + directorObjectGroundBase(object) * scaleY(object.transform);
}

/** 只抬不压：低于地面的 Y 直接抬到地面，其余原样返回。 */
export function clampDirectorGroundY(y: number, floor: number): number {
    if (!Number.isFinite(y)) return floor;
    return y < floor ? floor : y;
}

/**
 * 把 transform 的 Y 抬到给定下限以上；X/Z、旋转、缩放完全不动。
 * 无变化时返回原对象引用，让上层可以靠引用相等跳过无意义的场景写入。
 */
export function clampDirectorTransformToGround(transform: DirectorTransform, floor: number): DirectorTransform {
    const y = transform?.position?.[1];
    if (!Number.isFinite(y) || y >= floor) return transform;
    return { ...transform, position: [transform.position[0], floor, transform.position[2]] as DirectorVec3 };
}

/** 关键帧按各自那一帧的缩放算下限：放大后的箱子比原尺寸更需要抬高。 */
function clampKeyframesToGround(keyframes: DirectorKeyframe[], floorFor: (transform: DirectorTransform) => number): DirectorKeyframe[];
function clampKeyframesToGround(keyframes: DirectorKeyframe[] | undefined, floorFor: (transform: DirectorTransform) => number): DirectorKeyframe[] | undefined;
function clampKeyframesToGround(keyframes: DirectorKeyframe[] | undefined, floorFor: (transform: DirectorTransform) => number): DirectorKeyframe[] | undefined {
    if (!keyframes?.length) return keyframes;
    let changed = false;
    const next = keyframes.map((frame) => {
        const transform = clampDirectorTransformToGround(frame.transform, floorFor(frame.transform));
        if (transform === frame.transform) return frame;
        changed = true;
        return { ...frame, transform };
    });
    return changed ? next : keyframes;
}

function clampObjectToGround(object: DirectorObject, groundHeight: number): DirectorObject {
    const transform = clampDirectorTransformToGround(object.transform, directorObjectGroundFloor(object, groundHeight));
    const floorFor = (frame: DirectorTransform) => groundHeight + directorObjectGroundBase(object) * scaleY(frame);
    const keyframes = clampKeyframesToGround(object.keyframes, floorFor);
    const originalKeyframes = clampKeyframesToGround(object.motionPath?.originalKeyframes, floorFor);
    const motionPath = object.motionPath && originalKeyframes !== object.motionPath.originalKeyframes ? { ...object.motionPath, originalKeyframes: originalKeyframes ?? [] } : object.motionPath;
    if (transform === object.transform && keyframes === object.keyframes && motionPath === object.motionPath) return object;
    return { ...object, transform, keyframes, motionPath };
}

function clampCameraToGround(camera: DirectorCamera, groundHeight: number): DirectorCamera {
    const floor = groundHeight + DIRECTOR_CAMERA_GROUND_CLEARANCE;
    const transform = clampDirectorTransformToGround(camera.transform, floor);
    const keyframes = clampKeyframesToGround(camera.keyframes, () => floor);
    const originalKeyframes = clampKeyframesToGround(camera.drawnPath?.originalKeyframes, () => floor);
    const drawnPath = camera.drawnPath && originalKeyframes !== camera.drawnPath.originalKeyframes ? { ...camera.drawnPath, originalKeyframes: originalKeyframes ?? [] } : camera.drawnPath;
    if (transform === camera.transform && keyframes === camera.keyframes && drawnPath === camera.drawnPath) return camera;
    return { ...camera, transform, keyframes, drawnPath };
}

/**
 * 场景级的「不许钻到地面以下」归一化。
 *
 * 只夹 Y、只抬不压，且严格保持引用：没有任何对象越界时返回原 scene，
 * 因此可以安全地挂在每次提交上而不会制造多余的重渲染或历史记录。
 */
export function clampDirectorSceneToGround(scene: DirectorScene, scope?: { objectIds: ReadonlySet<string>; cameraIds: ReadonlySet<string> }): DirectorScene {
    const groundHeight = directorGroundSettings(scene).height;
    let changed = false;
    const objects = scene.objects.map((object) => {
        if (scope && !scope.objectIds.has(object.id)) return object;
        const next = clampObjectToGround(object, groundHeight);
        if (next !== object) changed = true;
        return next;
    });
    const cameras = scene.cameras.map((camera) => {
        if (scope && !scope.cameraIds.has(camera.id)) return camera;
        const next = clampCameraToGround(camera, groundHeight);
        if (next !== camera) changed = true;
        return next;
    });
    return changed ? { ...scene, objects, cameras } : scene;
}
