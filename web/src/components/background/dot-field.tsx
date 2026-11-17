import { useEffect, useRef } from "react";

import "./dot-field.css";

/**
 * 点阵底纹（参照 liblib.tv 的页面背景）。
 *
 * 效果：一整片均匀的暗点，光标移上去时附近的点被「点亮」并微微放大，
 * 以光标为圆心柔和衰减，移开后回落到原亮度；光点带缓动拖尾，所以移动时是流动的而不是硬贴。
 *
 * 实现拆成两层 canvas：
 *   底层整片点阵只在尺寸变化时画一次（几千个点合成一条 Path，一次 fill）；
 *   上层每帧只重画光标半径内的点，并按亮度分桶批量 fill，
 *   所以逐帧开销只跟「光斑内的点数」有关，与页面大小无关。
 */

/* 网格间距：参照图实测 18px，点径约 2px */
const SPACING = 19;
const BASE_RADIUS = 1;
const PEAK_RADIUS = 1.85;
const BASE_ALPHA = 0.12;
const PEAK_ALPHA = 0.46;
/* 光斑半径：超过这个距离的点保持基础亮度 */
const FALLOFF = 200;
/* 光标周围的柔光，让点亮区域像一小片被打亮的面而不是孤立亮点 */
const HALO = 0.02;
const TAU = Math.PI * 2;
/* 亮度分档：把光斑内的点按衰减值分桶，每桶一次 fill */
const BUCKETS = 14;

export function DotField({ className = "" }: { className?: string }) {
    const hostRef = useRef<HTMLDivElement>(null);
    const baseRef = useRef<HTMLCanvasElement>(null);
    const glowRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const host = hostRef.current;
        const baseCanvas = baseRef.current;
        const glowCanvas = glowRef.current;
        if (!host || !baseCanvas || !glowCanvas) return;
        const baseCtx = baseCanvas.getContext("2d");
        const glowCtx = glowCanvas.getContext("2d");
        if (!baseCtx || !glowCtx) return;

        const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
        let width = 0;
        let height = 0;
        let dpr = 1;
        let frame = 0;

        /* x/y 是缓动后的光斑中心，tx/ty 是真实光标；strength 控制整体亮灭 */
        const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999, strength: 0, target: 0 };

        const paintBase = () => {
            baseCtx.setTransform(1, 0, 0, 1, 0, 0);
            baseCtx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
            if (!width || !height) return;
            baseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
            baseCtx.fillStyle = `rgba(255, 255, 255, ${BASE_ALPHA})`;
            baseCtx.beginPath();
            for (let y = SPACING / 2; y < height; y += SPACING) {
                for (let x = SPACING / 2; x < width; x += SPACING) {
                    baseCtx.moveTo(x + BASE_RADIUS, y);
                    baseCtx.arc(x, y, BASE_RADIUS, 0, TAU);
                }
            }
            baseCtx.fill();
        };

        const paintGlow = () => {
            glowCtx.setTransform(1, 0, 0, 1, 0, 0);
            glowCtx.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
            const strength = pointer.strength;
            if (!width || !height || strength <= 0.004) return;
            glowCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

            const cx = pointer.x;
            const cy = pointer.y;

            /* 柔光：被点亮的那一小片面 */
            const halo = glowCtx.createRadialGradient(cx, cy, 0, cx, cy, FALLOFF);
            halo.addColorStop(0, `rgba(255, 255, 255, ${HALO * strength})`);
            halo.addColorStop(0.5, `rgba(255, 255, 255, ${HALO * 0.38 * strength})`);
            halo.addColorStop(1, "rgba(255, 255, 255, 0)");
            glowCtx.fillStyle = halo;
            glowCtx.fillRect(cx - FALLOFF, cy - FALLOFF, FALLOFF * 2, FALLOFF * 2);

            /* 逐点算衰减，按档位归桶；smoothstep 让中心是一片接近满亮的区域，边缘才快速淡出 */
            const paths = Array.from({ length: BUCKETS }, () => new Path2D());
            const firstCol = Math.floor((cx - FALLOFF) / SPACING);
            const lastCol = Math.ceil((cx + FALLOFF) / SPACING);
            const firstRow = Math.floor((cy - FALLOFF) / SPACING);
            const lastRow = Math.ceil((cy + FALLOFF) / SPACING);
            const spans: boolean[] = new Array(BUCKETS).fill(false);

            for (let row = firstRow; row <= lastRow; row += 1) {
                const y = SPACING / 2 + row * SPACING;
                if (y < 0 || y > height) continue;
                for (let col = firstCol; col <= lastCol; col += 1) {
                    const x = SPACING / 2 + col * SPACING;
                    if (x < 0 || x > width) continue;
                    const distance = Math.hypot(x - cx, y - cy);
                    if (distance >= FALLOFF) continue;
                    const energy = 1 - distance / FALLOFF;
                    const eased = energy * energy * (3 - 2 * energy);
                    const slot = Math.min(BUCKETS - 1, Math.round(eased * (BUCKETS - 1)));
                    const radius = BASE_RADIUS + (PEAK_RADIUS - BASE_RADIUS) * eased * strength;
                    const path = paths[slot];
                    path.moveTo(x + radius, y);
                    path.arc(x, y, radius, 0, TAU);
                    spans[slot] = true;
                }
            }

            /* 由暗到亮依次铺，亮的覆盖在暗的上面 */
            for (let slot = 0; slot < BUCKETS; slot += 1) {
                if (!spans[slot]) continue;
                const eased = slot / (BUCKETS - 1);
                const alpha = BASE_ALPHA + (PEAK_ALPHA - BASE_ALPHA) * eased * strength;
                glowCtx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(4)})`;
                glowCtx.fill(paths[slot]);
            }
        };

        const tick = () => {
            frame = 0;
            const snap = motion.matches;
            const follow = snap ? 1 : 0.18;
            const rise = snap ? 1 : 0.1;
            pointer.x += (pointer.tx - pointer.x) * follow;
            pointer.y += (pointer.ty - pointer.y) * follow;
            pointer.strength += (pointer.target - pointer.strength) * rise;
            paintGlow();
            const following = Math.abs(pointer.tx - pointer.x) > 0.4 || Math.abs(pointer.ty - pointer.y) > 0.4;
            const changing = Math.abs(pointer.target - pointer.strength) > 0.003;
            if (following || changing) frame = requestAnimationFrame(tick);
        };

        const wake = () => {
            if (!frame) frame = requestAnimationFrame(tick);
        };

        const onMove = (event: PointerEvent) => {
            if (event.pointerType === "touch" || document.hidden) return;
            const rect = host.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
                if (pointer.target !== 0) {
                    pointer.target = 0;
                    wake();
                }
                return;
            }
            /* 熄着进来的话直接落位，不要从上一个位置飞过来 */
            if (pointer.strength < 0.05) {
                pointer.x = x;
                pointer.y = y;
            }
            pointer.tx = x;
            pointer.ty = y;
            pointer.target = 1;
            wake();
        };

        const onLeave = () => {
            if (pointer.target === 0) return;
            pointer.target = 0;
            wake();
        };

        const resize = () => {
            const rect = host.getBoundingClientRect();
            width = Math.round(rect.width);
            height = Math.round(rect.height);
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            for (const canvas of [baseCanvas, glowCanvas]) {
                canvas.width = Math.round(width * dpr);
                canvas.height = Math.round(height * dpr);
            }
            paintBase();
            glowCtx.setTransform(1, 0, 0, 1, 0, 0);
            glowCtx.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
        };

        const observer = new ResizeObserver(resize);
        observer.observe(host);
        resize();

        const onVisibilityChange = () => {
            if (!document.hidden) return;
            if (frame) {
                cancelAnimationFrame(frame);
                frame = 0;
            }
            pointer.strength = 0;
            pointer.target = 0;
            glowCtx.setTransform(1, 0, 0, 1, 0, 0);
            glowCtx.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
        };

        window.addEventListener("pointermove", onMove, { passive: true });
        window.addEventListener("blur", onLeave);
        document.addEventListener("pointerleave", onLeave);
        document.addEventListener("visibilitychange", onVisibilityChange);
        motion.addEventListener("change", wake);

        return () => {
            if (frame) cancelAnimationFrame(frame);
            observer.disconnect();
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("blur", onLeave);
            document.removeEventListener("pointerleave", onLeave);
            document.removeEventListener("visibilitychange", onVisibilityChange);
            motion.removeEventListener("change", wake);
        };
    }, []);

    return (
        <div ref={hostRef} aria-hidden="true" className={`jm-dot-field ${className}`.trim()}>
            <canvas ref={baseRef} />
            <canvas ref={glowRef} />
        </div>
    );
}
