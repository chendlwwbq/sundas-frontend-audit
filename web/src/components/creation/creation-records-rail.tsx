import { useEffect, useState, type ReactNode } from "react";
import { ChevronsLeft, ChevronsRight, History } from "lucide-react";
import { useTranslation } from "react-i18next";

import "./creation-records-rail.css";

/** 窄屏仍旧用底部抽屉，宽屏才把面板停靠到右侧 */
export function useNarrowRecords() {
    const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches);
    useEffect(() => {
        const query = window.matchMedia("(max-width: 1023px)");
        const onChange = () => setNarrow(query.matches);
        onChange();
        query.addEventListener("change", onChange);
        return () => query.removeEventListener("change", onChange);
    }, []);
    return narrow;
}

/**
 * 「生成记录」停靠面板（参考即梦工作台右侧记录栏）：
 * 收起是一条 92px 的竖向栏，只留「« 生成记录」；展开 372px，内容由调用方塞进来。
 * 面板本身不覆盖合成器，创作区和记录区各滚各的。
 */
export function CreationRecordsRail({ open, count, onToggle, children }: {
    open: boolean;
    count: number;
    onToggle: () => void;
    children: ReactNode;
}) {
    const { t } = useTranslation();
    const label = t("workbench.logs");
    return (
        <aside className={`creation-records-rail${open ? " is-open" : ""}`} aria-label={label}>
            <header className="crec-head">
                <button type="button" className="crec-toggle" onClick={onToggle} aria-expanded={open} title={label}>
                    {open ? <ChevronsRight className="size-4 shrink-0" aria-hidden /> : <ChevronsLeft className="size-4 shrink-0" aria-hidden />}
                    <span className="crec-title">{label}</span>
                </button>
                {open ? <span className="crec-count">{count}</span> : null}
            </header>
            {open ? <div className="crec-body thin-scrollbar">{children}</div> : (
                /* 收起态没有顶栏按钮兜底，整条竖栏就是展开入口 */
                <button type="button" className="crec-stub" onClick={onToggle} aria-expanded={false} aria-label={label} title={label}>
                    <History className="size-4" aria-hidden />
                </button>
            )}
        </aside>
    );
}
