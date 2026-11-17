import { loadCreationChats, useCreationChat } from "@/pages/chat/chat-store";
import { Drawer } from "antd";
import { ImagePlus, LayoutGrid, Menu, Video, X, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { useAuthStore } from "@/stores/use-auth-store";
import { isCanvasAccountActive, useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useCreationHistory } from "@/components/creation/creation-history";
import { fetchRecentGenerationHistory } from "@/services/api/generation-history";

export function CreationSidebar() {
    const [open, setOpen] = useState(false);
    const { pathname, search } = useLocation();
    const user = useAuthStore((state) => state.user);
    const ready = useAuthStore((state) => state.ready);
    const epoch = useAuthStore((state) => state.sessionEpoch);
    const history = useCreationHistory();
    const chats = useCreationChat();
    useEffect(() => { if (ready && user) void loadCreationChats(user.id); }, [ready, user?.id]);
    const threads = chats.owner === user?.id ? chats.threads : [];
    useEffect(() => { setOpen(false); }, [pathname, search]);
    useEffect(() => {
        if (!ready || !user) return;
        const owner = user.id;
        const session = `${owner}:${epoch}`;
        const videoMode = pathname === "/video" || (pathname === "/create" && new URLSearchParams(search).get("mode") === "video");
        const modes: ("image" | "video")[] = videoMode ? ["image"] : pathname === "/image" || pathname === "/create" ? ["video"] : ["image", "video"];
        let active = true;
        for (const mode of modes) {
            const current = useCreationHistory.getState();
            if (current.session === session && current[mode].length) continue;
            void fetchRecentGenerationHistory(owner, mode).then((items) => {
                const auth = useAuthStore.getState();
                const currentState = useCreationHistory.getState();
                if (active && auth.ready && auth.user?.id === owner && auth.sessionEpoch === epoch && (currentState.session !== session || !currentState[mode].length)) currentState.update(session, mode, items);
            }).catch(() => undefined);
        }
        return () => { active = false; };
    }, [ready, user?.id, epoch, pathname, search]);
    const projects = useCanvasStore((state) => state.projects);
    const hydrated = useCanvasStore((state) => state.hydrated);
    const recent = ready && hydrated && user && isCanvasAccountActive(user.id)
        ? [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4)
        : [];

    const recentGenerations = ready && user && history.session === `${user.id}:${epoch}`
        ? [...history.image, ...history.video].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5)
        : [];
    const recentWorks = [
        ...threads.filter(t => t.messages.length || t.records.length || t.draft).map(t => ({ key: `chat:${t.id}`, title: t.title, time: t.updatedAt, to: `/create?mode=chat&thread=${t.id}`, icon: MessageSquare, type: "对话" })),
        ...recentGenerations.map(item => ({ key: `${item.mode}:${item.id}`, title: item.title, time: item.createdAt, to: threads.some(t => t.records.some(r => r.id === item.id)) ? `/create?mode=chat&thread=${threads.find(t => t.records.some(r => r.id === item.id))!.id}` : `/create?mode=${item.mode}&record=${encodeURIComponent(item.id)}`, icon: item.mode === "image" ? ImagePlus : Video, type: item.mode === "image" ? "图片" : "视频" })),
        ...recent.map(project => ({ key: `canvas:${project.id}`, title: project.title, time: new Date(project.updatedAt).getTime(), to: `/canvas/${project.id}`, icon: LayoutGrid, type: "画布" })),
    ].sort((a, b) => b.time - a.time);

    const sidebar = (
        <aside className="creation-sidebar flex h-full w-[220px] lg:w-[240px] shrink-0 flex-col border-r border-border text-foreground">
            <div className="flex h-16 items-center justify-between px-5">
                <h2 className="text-sm font-semibold">最近作品</h2>
                <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground lg:hidden" aria-label="关闭最近作品"><X className="size-5" /></button>
            </div>
            <nav className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-4" aria-label="最近作品">
                {user && <div>
                    {recentWorks.map(({ key, title, to, icon: Icon, type }) => <Link key={key} to={to} aria-current={`${pathname}${search}` === to ? "page" : undefined} title={`${type} · ${title}`} onClick={() => setOpen(false)} className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm !text-muted-foreground hover:bg-muted hover:!text-foreground"><Icon className="size-3.5 shrink-0" /><span className="min-w-0 flex-1 truncate">{title}</span><span className="shrink-0 text-xs">{type}</span></Link>)}
                    {recentWorks.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">暂无最近作品</p>}
                    <div className="mt-2 flex gap-3 px-3 text-xs"><Link to="/create" onClick={() => setOpen(false)} className="!text-muted-foreground hover:!text-foreground">生成历史</Link><Link to="/canvas" onClick={() => setOpen(false)} className="!text-muted-foreground hover:!text-foreground">全部画布</Link></div>
                </div>}
            </nav>

        </aside>
    );
    // 未登录访客没有「最近作品」，不占侧栏宽度
    if (!user) return null;
    return <>
        <div className="hidden h-full lg:block">{sidebar}</div>
        <button type="button" onClick={() => setOpen(true)} className="mx-3 mt-1.5 flex h-8 shrink-0 items-center gap-1.5 self-start rounded-lg px-2.5 text-xs text-muted-foreground hover:bg-muted lg:hidden" aria-label="打开最近作品" aria-expanded={open} aria-controls="creation-mobile-navigation"><Menu className="size-3.5" />最近作品</button>
        <Drawer open={open} onClose={() => setOpen(false)} placement="left" size={220} closable={false} styles={{ body: { padding: 0 } }} rootClassName="creation-mobile-drawer" destroyOnHidden><div id="creation-mobile-navigation" className="creation-shell h-full">{sidebar}</div></Drawer>
    </>;
}
