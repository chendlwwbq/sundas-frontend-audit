import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

export function PageTransition({ children, disabled = false, className = "h-full min-h-0" }: { children: ReactNode; disabled?: boolean; className?: string }) {
    const { pathname, search } = useLocation();
    const frame = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
        if (disabled || preference.matches || !frame.current?.animate) return;
        const animation = frame.current.animate(
            [{ opacity: 0.55, translate: "0 6px" }, { opacity: 1, translate: "0 0" }],
            { duration: 200, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        );
        const stop = () => { if (preference.matches) animation.cancel(); };
        preference.addEventListener("change", stop);
        return () => { animation.cancel(); preference.removeEventListener("change", stop); };
    }, [disabled, pathname, search]);

    useEffect(() => {
        if (disabled) return;
        const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
        let pressed: Animation | undefined;
        const stop = () => pressed?.cancel();
        const click = (event: MouseEvent) => {
            if (preference.matches || !(event.target instanceof Element)) return;
            const control = event.target.closest<HTMLElement>("button, a[href], [role='button'], [role='tab'], [role='menuitem'], .ant-segmented-item, .ant-tag-checkable");
            if (!control?.animate || control.closest(":disabled, [aria-disabled='true'], .ant-btn-loading, .ant-tabs-tab-disabled, .ant-segmented-item-disabled")) return;
            stop();
            pressed = control.animate([{ scale: "1" }, { scale: "0.97", offset: 0.35 }, { scale: "1" }], { duration: 160, easing: "ease-out" });
        };
        // 捕获阶段覆盖导航、普通按钮及弹窗内的按钮，不改变原有点击行为。
        document.addEventListener("click", click, true);
        preference.addEventListener("change", stop);
        return () => { stop(); document.removeEventListener("click", click, true); preference.removeEventListener("change", stop); };
    }, [disabled]);

    return <div ref={frame} className={className}>{children}</div>;
}
