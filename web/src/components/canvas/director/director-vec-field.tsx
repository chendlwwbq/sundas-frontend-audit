import { InputNumber } from "antd";

import { releaseDirectorFocusAfterPointer } from "@/lib/canvas/director/director-shortcuts";
import type { DirectorVec3 } from "@/types/director";
import "./director-inspector-form.css";

const DVEC_AXES = ["X", "Y", "Z"] as const;

/** 行级关键帧开关：菱形小钮，打上关键帧后点亮，与视口时间轴语义一致。 */
export function DirectorKeyToggle({ keyed, label, onToggle }: { keyed: boolean; label: string; onToggle: () => void }) {
    return (
        <button
            type="button"
            className="dvec-key"
            aria-label={label}
            aria-pressed={keyed}
            title={keyed ? "当前帧有关键帧" : "当前帧无关键帧"}
            onClick={(event) => {
                onToggle();
                releaseDirectorFocusAfterPointer(event);
            }}
        >
            <span aria-hidden />
        </button>
    );
}

/**
 * 统一的 X/Y/Z 三轴数值输入组（3D 导演台各检查器共用）。
 * 30px 胶囊格 + 发丝内描边；轴字母按三维惯例着色（X 红 / Y 绿 / Z 蓝，与视口 gizmo 对应）；
 * 数字右对齐 tabular-nums；不带步进按钮，杜绝窄格里 spinner 相互遮挡。
 */
export function DirectorVecField({ label, value, step = 0.1, precision = 2, keyed = false, onToggleKey, onChange }: {
    label: string;
    value: DirectorVec3;
    step?: number;
    precision?: number;
    keyed?: boolean;
    onToggleKey?: () => void;
    onChange: (value: DirectorVec3) => void;
}) {
    return (
        <div className="dvec-field">
            <div className="dvec-head">
                <span className="dvec-head-label">{label}</span>
                {onToggleKey ? <DirectorKeyToggle keyed={keyed} label={`切换${label}关键帧`} onToggle={onToggleKey} /> : null}
            </div>
            <div className="dvec-grid">
                {value.map((entry, index) => (
                    <label key={DVEC_AXES[index]} className="dvec-cell">
                        <span aria-hidden>{DVEC_AXES[index]}</span>
                        <InputNumber
                            aria-label={`${label} ${DVEC_AXES[index]}`}
                            size="small"
                            variant="borderless"
                            controls={false}
                            step={step}
                            precision={precision}
                            value={Number(entry.toFixed(precision))}
                            onChange={(next) => {
                                if (next === null) return;
                                onChange(value.map((current, axis) => (axis === index ? next : current)) as DirectorVec3);
                            }}
                        />
                    </label>
                ))}
            </div>
        </div>
    );
}
