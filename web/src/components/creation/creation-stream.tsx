import { ChatLayout, ChatMessageList } from "@astryxdesign/core/Chat";
import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import zhCN from "@astryxdesign/core/locales/zh-CN.generated.js";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useThemeStore } from "@/stores/use-theme-store";

export function CreationStream({ children, composer, onScrollTop, tasks = [] }: { children: ReactNode; composer: ReactNode; onScrollTop?: () => void; tasks?: { id: string; status: string }[] }) {
    const theme = useThemeStore((state) => state.theme);
    const layout = useRef<HTMLDivElement>(null);
    const previousTasks = useRef(new Map<string, string>());
    const [hasFinishedTasks, setHasFinishedTasks] = useState(false);
    useEffect(() => {
        const finished = tasks.some(task => previousTasks.current.get(task.id) === "pending" && task.status !== "pending");
        previousTasks.current = new Map(tasks.map(task => [task.id, task.status]));
        const element = layout.current;
        if (finished && element && element.scrollHeight - element.scrollTop - element.clientHeight > 100) setHasFinishedTasks(true);
    }, [tasks]);
    const previousScrollTop = useRef(0);
    const upwardIntent = useRef(false);
    const touchY = useRef<number | null>(null);
    const { i18n } = useTranslation();
    return (
        <InternationalizationProvider locale={i18n.resolvedLanguage === "en" ? "en" : "zh-CN"} messages={{ "zh-CN": zhCN }}>
            <div className="creation-stream flex min-h-0 flex-1 flex-col" data-astryx-theme="neutral" style={{ colorScheme: theme }}>
                <ChatLayout ref={layout} density="spacious" composer={<>{hasFinishedTasks && <div className="mb-2 text-center"><button type="button" className="rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground" onClick={() => { setHasFinishedTasks(false); layout.current?.scrollTo({ top: layout.current.scrollHeight, behavior: "smooth" }); }}>有新结果 · 查看</button></div>}{composer}</>} onWheel={(event) => {
                    upwardIntent.current = event.deltaY < 0;
                    if (upwardIntent.current && event.currentTarget.scrollTop <= 24) {
                        upwardIntent.current = false;
                        onScrollTop?.();
                    }
                }} onTouchStart={(event) => { touchY.current = event.touches[0]?.clientY ?? null; }} onTouchMove={(event) => {
                    const nextY = event.touches[0]?.clientY;
                    if (nextY != null && touchY.current != null) upwardIntent.current = nextY > touchY.current;
                    touchY.current = nextY ?? null;
                }} onKeyDown={(event) => {
                    if (["ArrowUp", "PageUp", "Home"].includes(event.key)) upwardIntent.current = true;
                }} onScroll={(event) => {
                    const top = event.currentTarget.scrollTop;
                    if (event.currentTarget.scrollHeight - top - event.currentTarget.clientHeight < 30) setHasFinishedTasks(false);
                    if (upwardIntent.current && top <= 24 && top < previousScrollTop.current) {
                        upwardIntent.current = false;
                        onScrollTop?.();
                    }
                    previousScrollTop.current = top;
                }}><ChatMessageList align="top" gap={0} aria-label="创作记录">{children}</ChatMessageList></ChatLayout>
            </div>
        </InternationalizationProvider>
    );
}
