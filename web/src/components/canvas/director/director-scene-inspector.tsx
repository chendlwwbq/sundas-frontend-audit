import { InputNumber } from "antd";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { Switch } from "@/components/ui/base/switch";
import { DirectorVecField } from "@/components/canvas/director/director-vec-field";
import { directorGroundSettings } from "@/lib/canvas/director/director-ground";
import { directorPanoramaSphere } from "@/lib/canvas/director/director-panorama-sphere";
import { directorStageTransform } from "@/lib/canvas/director/director-stage-transform";
import type { DirectorScene } from "@/types/director";
import "./director-scene-inspector.css";

type SceneEnvironmentPatch = Partial<Pick<DirectorScene, "background" | "environmentIntensity" | "gridVisible" | "gridSnap" | "panorama" | "panoramaRotation" | "panoramaRadius" | "ground" | "stageTransform" | "labelsVisible">>;

/**
 * 参数滑块：原生 range + 内部 live 值。
 * 受控滑块（如 antd Slider）只接 onChangeComplete 时，拖动过程中 value 不变，
 * 手柄会被立刻打回原位，表现为「拖不动」；这里拖动只更新本地值，松手才提交。
 */
export function SliderRow({ label, value, min, max, step, disabled = false, input, onCommit }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    disabled?: boolean;
    /** 右侧数值框配置；toInput/fromInput 用于「缩放百分比」这类换算 */
    input: { min: number; max: number; step: number; precision?: number; suffix?: string; toInput?: (value: number) => number; fromInput?: (value: number) => number };
    onCommit: (value: number) => void;
}) {
    const [live, setLive] = useState(value);
    const liveRef = useRef(value);
    const dragging = useRef(false);
    useEffect(() => {
        if (dragging.current) return;
        liveRef.current = value;
        setLive(value);
    }, [value]);
    const apply = (next: number) => {
        const clamped = Math.min(max, Math.max(min, next));
        liveRef.current = clamped;
        setLive(clamped);
    };
    const commit = () => {
        dragging.current = false;
        if (liveRef.current !== value) onCommit(liveRef.current);
    };
    const percent = max === min ? 0 : ((live - min) / (max - min)) * 100;
    const toInput = input.toInput ?? ((next: number) => next);
    const fromInput = input.fromInput ?? ((next: number) => next);
    return (
        <div className="dsp-field">
            <div className="dsp-row">
                <input
                    type="range"
                    aria-label={label}
                    className="director-scale-slider dsp-slider"
                    min={min}
                    max={max}
                    step={step}
                    disabled={disabled}
                    value={live}
                    style={{ "--director-scale-fill": `${percent}%` } as CSSProperties}
                    onPointerDown={() => { dragging.current = true; }}
                    onKeyDown={() => { dragging.current = true; }}
                    onChange={(event) => apply(Number(event.target.value))}
                    onPointerUp={commit}
                    onKeyUp={commit}
                    onBlur={commit}
                />
                <InputNumber
                    aria-label={`${label}数值`}
                    className="director-scale-value dsp-number"
                    size="small"
                    controls={false}
                    min={input.min}
                    max={input.max}
                    step={input.step}
                    precision={input.precision}
                    suffix={input.suffix}
                    disabled={disabled}
                    value={Number(toInput(live).toFixed(input.precision ?? 0))}
                    onChange={(next) => {
                        if (next === null) return;
                        const mapped = fromInput(next);
                        apply(mapped);
                        dragging.current = false;
                        onCommit(Math.min(max, Math.max(min, mapped)));
                    }}
                />
            </div>
        </div>
    );
}

export function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
    return (
        <section className="dsp-group" aria-label={title}>
            <div className="dsp-group-head">
                <strong>{title}</strong>
                {hint ? <span>{hint}</span> : null}
            </div>
            {children}
        </section>
    );
}

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
    return (
        <label className="dsp-switch-row">
            <span>{label}</span>
            <Switch size="sm" aria-label={label} checked={checked} onChange={onChange} />
        </label>
    );
}

export function DirectorSceneInspector({ scene, onChange }: { scene: DirectorScene; onChange: (patch: SceneEnvironmentPatch) => void }) {
    const ground = directorGroundSettings(scene);
    const stage = directorStageTransform(scene);
    const sphere = directorPanoramaSphere(scene);
    const [skyHex, setSkyHex] = useState(() => scene.background.replace(/^#/, "").toUpperCase());
    useEffect(() => setSkyHex(scene.background.replace(/^#/, "").toUpperCase()), [scene.background]);
    const commitSkyHex = () => {
        if (!/^[0-9A-Fa-f]{6}$/.test(skyHex)) {
            setSkyHex(scene.background.replace(/^#/, "").toUpperCase());
            return;
        }
        const color = `#${skyHex.toUpperCase()}`;
        if (color.toLowerCase() !== scene.background.toLowerCase()) onChange({ background: color });
        setSkyHex(color.slice(1));
    };
    const updateGround = (patch: Partial<typeof ground>) => onChange({ ground: { ...ground, ...patch } });
    return (
        <div className="dsp-root">
            <header className="dsp-head">
                <h2>3D场景</h2>
                <p>舞台、环境与地面的全局参数</p>
            </header>

            <Group title="场景变换" hint="STAGE">
                <div className="dsp-field-label">场景缩放</div>
                <SliderRow
                    label="场景缩放"
                    value={stage.scale}
                    min={0.1}
                    max={10}
                    step={0.1}
                    onCommit={(scale) => onChange({ stageTransform: { ...stage, scale } })}
                    input={{ min: 10, max: 1000, step: 10, suffix: "%", toInput: (next) => next * 100, fromInput: (next) => next / 100 }}
                />
                <DirectorVecField label="场景平移" value={stage.position} step={0.1} precision={1} onChange={(position) => onChange({ stageTransform: { ...stage, position } })} />
                <DirectorVecField label="场景旋转" value={stage.rotation} step={1} precision={0} onChange={(rotation) => onChange({ stageTransform: { ...stage, rotation } })} />
            </Group>

            <Group title="环境" hint="ENVIRONMENT">
                <div className="dsp-field">
                    <div className="dsp-field-label">全景背景</div>
                    {scene.panorama ? (
                        <div className="dsp-panorama">
                            <span className="dsp-panorama-name" title={scene.panorama.name || "全景图片"}>{scene.panorama.name || "全景图片"}</span>
                            <button type="button" className="dsp-text-button" onClick={() => onChange({ panorama: undefined })}>移除</button>
                        </div>
                    ) : (
                        <div className="dsp-placeholder">尚未添加全景图，可从左侧上传</div>
                    )}
                </div>
                <div className="dsp-field">
                    <div className="dsp-field-label">天空颜色</div>
                    <div className="dsp-sky">
                        <label className="dsp-swatch" style={{ background: scene.background }}>
                            <input type="color" aria-label="选择天空颜色" value={scene.background} onChange={(event) => onChange({ background: event.target.value })} />
                        </label>
                        <div className="dsp-hex">
                            <span aria-hidden>#</span>
                            <input
                                type="text"
                                aria-label="天空颜色色值"
                                maxLength={6}
                                spellCheck={false}
                                value={skyHex}
                                onChange={(event) => setSkyHex(event.target.value.toUpperCase())}
                                onBlur={commitSkyHex}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") event.currentTarget.blur();
                                    if (event.key === "Escape") { setSkyHex(scene.background.replace(/^#/, "").toUpperCase()); event.currentTarget.blur(); }
                                }}
                            />
                        </div>
                    </div>
                </div>
                <div className="dsp-field">
                    <div className="dsp-field-label">环境亮度</div>
                    <SliderRow
                        label="环境亮度"
                        value={scene.environmentIntensity}
                        min={0}
                        max={2}
                        step={0.05}
                        onCommit={(environmentIntensity) => onChange({ environmentIntensity })}
                        input={{ min: 0, max: 200, step: 5, suffix: "%", toInput: (next) => next * 100, fromInput: (next) => next / 100 }}
                    />
                </div>
            </Group>

            <Group title="全景球" hint="PANORAMA">
                <div className="dsp-field-label">水平旋转</div>
                <SliderRow
                    label="全景球水平旋转"
                    value={sphere.rotation}
                    min={0}
                    max={360}
                    step={1}
                    onCommit={(panoramaRotation) => onChange({ panoramaRotation })}
                    input={{ min: 0, max: 360, step: 1, suffix: "°" }}
                />
                <div className="dsp-field-label">球形半径</div>
                <SliderRow
                    label="全景球半径"
                    value={sphere.radius}
                    min={10}
                    max={500}
                    step={10}
                    onCommit={(panoramaRadius) => onChange({ panoramaRadius })}
                    input={{ min: 10, max: 500, step: 10 }}
                />
            </Group>

            <Group title="显示" hint="VISIBILITY">
                <SwitchRow label="角色标签" checked={scene.labelsVisible !== false} onChange={(labelsVisible) => onChange({ labelsVisible })} />
                <SwitchRow label="网格吸附" checked={scene.gridSnap === true} onChange={(gridSnap) => onChange({ gridSnap })} />
                <SwitchRow label="显示网格" checked={scene.gridVisible} onChange={(gridVisible) => onChange({ gridVisible })} />
            </Group>

            <Group title="地面" hint="GROUND">
                <SwitchRow label="显示地面" checked={ground.visible} onChange={(visible) => updateGround({ visible })} />
                <div className="dsp-field-label">透明度</div>
                <SliderRow
                    label="地面透明度"
                    value={ground.opacity}
                    min={0}
                    max={1}
                    step={0.05}
                    disabled={!ground.visible}
                    onCommit={(opacity) => updateGround({ opacity })}
                    input={{ min: 0, max: 1, step: 0.05, precision: 2 }}
                />
                <div className="dsp-field-label">高度</div>
                <SliderRow
                    label="地面高度"
                    value={ground.height}
                    min={-2}
                    max={2}
                    step={0.05}
                    disabled={!ground.visible}
                    onCommit={(height) => updateGround({ height })}
                    input={{ min: -2, max: 2, step: 0.05, precision: 1 }}
                />
            </Group>
        </div>
    );
}
