import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { App, Button } from "antd";
import { Download, FileUp, LayoutGrid, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { readCanvasPackage } from "@/lib/canvas/canvas-import";
import { captureAccountSession } from "@/lib/account-session";
import { matchesCanvasSession } from "@/lib/canvas/canvas-session";
import { currentMediaOwner } from "@/services/cloud-media";
import { CanvasDeleteProjectsDialog } from "@/components/canvas/canvas-delete-projects-dialog";
import { CanvasProjectCard } from "@/components/canvas/canvas-project-card";
import { isCanvasAccountActive, useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { useCanvasUiStore } from "@/stores/canvas/use-canvas-ui-store";
import { exportCanvasProjects } from "@/lib/canvas/canvas-export";
import { hasAgentUrlBootstrap } from "@/lib/agent/agent-url-bootstrap";

export default function CanvasPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const inputRef = useRef<HTMLInputElement>(null);
    const autoOpenRef = useRef(false);
    const hydrated = useCanvasStore((state) => state.hydrated);
    const userId = useAuthStore((state) => state.user?.id ?? null);
    const authReady = useAuthStore((state) => state.ready);
    const sessionEpoch = useAuthStore((state) => state.sessionEpoch);
    const accountReady = authReady && hydrated && isCanvasAccountActive(userId);
    const isCurrent = () => matchesCanvasSession(userId, sessionEpoch, useAuthStore.getState()) && isCanvasAccountActive(userId);
    const projects = useCanvasStore((state) => state.projects);
    const createProject = useCanvasStore((state) => state.createProject);
    const importProject = useCanvasStore((state) => state.importProject);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);

    const mode = searchParams.get("mode");
    const agentMode = mode === "new" || mode === "recent" || mode === "choose";
    const agentQuery = agentMode ? `?${searchParams.toString()}` : "";
    const enterProject = (id: string) => {
        if (!isCurrent()) return;
        const agentHash = hasAgentUrlBootstrap(window.location.hash) ? window.location.hash : "";
        navigate(`/canvas/${id}${agentQuery}${agentHash}`, { replace: Boolean(agentHash) });
    };
    const createAndEnter = () => { if (isCurrent()) enterProject(createProject()); };
    const importCanvas = async (file?: File) => {
        if (!file || !isCurrent()) return;
        try {
            const session = captureAccountSession();
            const owner = session.owner;
            const projects = await readCanvasPackage(file);
            session.check();
            if (!owner || currentMediaOwner() !== owner) throw new Error("登录账户已变化，请重新导入");
            projects.forEach(importProject);
            message.success(t("canvas.imported", { count: projects.length }));
        } catch {
            message.error(t("canvas.importFailed"));
        } finally {
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    useEffect(() => {
        if (!accountReady || !isCurrent() || autoOpenRef.current || (mode !== "new" && mode !== "recent")) return;
        autoOpenRef.current = true;
        enterProject(mode === "new" ? createProject() : projects[0]?.id || createProject());
    }, [accountReady, createProject, mode, projects, t]);

    if (!accountReady) return <main className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">{t("canvas.loading")}</main>;

    if (hydrated && (mode === "new" || mode === "recent")) return <main className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">{t("canvas.opening")}</main>;

    return (
        // 外层必须是定高 flex 列：jm-page 靠 flex:1 + overflow-y 自己滚；
        // 少了这层它会被内容撑到全高，再被 layout 的 overflow-hidden 裁掉（表现为没有滚动条、底部卡片点不到）
        <div className="page-surface flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
            <main className="jm-page">
                <div className="jm-page-inner flex flex-col gap-6">
                    <header className="jm-page-head">
                        <div className="min-w-0">
                            <p className="mb-2 text-xs leading-4 text-muted-foreground">{t("canvas.library")}</p>
                            <h1 className="jm-page-title">{t("canvas.title")}</h1>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {selectedIds.length ? (
                                <>
                                    <Button disabled={!hydrated} icon={<Download className="size-4" />} onClick={() => { if (isCurrent()) void exportCanvasProjects(projects.filter((project) => selectedIds.includes(project.id)), `${t("canvas.title")}-${selectedIds.length}`).catch((error) => message.error(error instanceof Error ? error.message : t("canvas.sidePanel.exportFailed"))); }}>
                                        {t("canvas.exportSelected")}
                                    </Button>
                                    <Button disabled={!hydrated} onClick={() => { if (isCurrent()) setDeleteIds(selectedIds); }}>
                                        {t("canvas.deleteSelected")}
                                    </Button>
                                </>
                            ) : null}
                            {projects.length ? (
                                <Button disabled={!hydrated} onClick={() => { if (isCurrent()) setDeleteIds(projects.map((project) => project.id)); }}>
                                    {t("canvas.deleteAll")}
                                </Button>
                            ) : null}
                            <Button disabled={!hydrated} icon={<FileUp className="size-4" />} onClick={() => { if (isCurrent()) inputRef.current?.click(); }}>
                                {t("canvas.import")}
                            </Button>
                            <button type="button" disabled={!hydrated} className="jm-btn jm-btn-primary" onClick={createAndEnter}>
                                <Plus className="size-4" />
                                {t("canvas.create")}
                            </button>
                        </div>
                    </header>

                    {!hydrated ? (
                        <section className="flex min-h-[360px] items-center justify-center text-sm text-muted-foreground">{t("canvas.loading")}</section>
                    ) : projects.length ? (
                        <div className="jm-canvas-grid">
                            {projects.map((project) => (
                                <CanvasProjectCard key={project.id} project={project} />
                            ))}
                        </div>
                    ) : (
                        <section className="jm-card jm-empty min-h-[360px]">
                            <div className="jm-empty-icon"><LayoutGrid className="size-8" strokeWidth={1.5} /></div>
                            <h2 className="jm-empty-title">{t("canvas.empty")}</h2>
                            <p className="jm-empty-desc">{t("canvas.emptyDescription")}</p>
                            <button type="button" className="jm-btn jm-btn-primary mt-4" onClick={createAndEnter}>
                                <Plus className="size-4" />
                                {t("canvas.create")}
                            </button>
                        </section>
                    )}
                </div>

                <input ref={inputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void importCanvas(event.target.files?.[0])} />
                <CanvasDeleteProjectsDialog />
            </main>
        </div>
    );
}
