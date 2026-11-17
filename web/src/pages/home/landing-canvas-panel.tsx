import { useRef } from "react";
import { App } from "antd";
import { Frame, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { readCanvasPackage } from "@/lib/canvas/canvas-import";
import { matchesCanvasSession } from "@/lib/canvas/canvas-session";
import { captureAccountSession } from "@/lib/account-session";
import { currentMediaOwner } from "@/services/cloud-media";
import { formatPromptDate } from "@/services/api/prompts";
import { copyOf, type SiteHomeCopy } from "@/services/api/site";
import { isCanvasAccountActive, useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { useAuthDialogStore } from "@/stores/use-auth-dialog-store";

/** 一行四格：首格恒为「新建画布」，其余三格是最近打开过的画布项目。 */
const PROJECT_SLOTS = 3;
const IMPORT_ACCEPT = ".sundas,.zip,application/zip";

/**
 * 首页「画布」页签的展示区：替换生成对话框，直接铺最近画布。
 * 宽度跟随 .home-content（与「灵感大厅」同一栅格），不再单独限宽。
 */
export function LandingCanvasPanel({ home }: { home: SiteHomeCopy }) {
    const { message } = App.useApp();
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);
    const user = useAuthStore((state) => state.user);
    const openAuthDialog = useAuthDialogStore((state) => state.open);
    const authReady = useAuthStore((state) => state.ready);
    const userId = user?.id ?? null;
    const sessionEpoch = useAuthStore((state) => state.sessionEpoch);
    const hydrated = useCanvasStore((state) => state.hydrated);
    const projects = useCanvasStore((state) => state.projects);
    const createProject = useCanvasStore((state) => state.createProject);
    const importProject = useCanvasStore((state) => state.importProject);
    // 未登录、或本地存储还没切到当前账户时一律按空处理，避免读到上一个账户的画布。
    const accountReady = authReady && hydrated && isCanvasAccountActive(userId);
    const isCurrent = () => matchesCanvasSession(userId, sessionEpoch, useAuthStore.getState()) && isCanvasAccountActive(userId);
    const recent = accountReady
        ? [...projects].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0)).slice(0, PROJECT_SLOTS)
        : [];
    const emptySlots = Math.max(0, PROJECT_SLOTS - recent.length);

    function createAndOpenCanvas() {
        if (!user) {
            openAuthDialog("login", { redirect: "/" });
            return;
        }
        if (!isCurrent()) return;
        navigate(`/canvas/${createProject()}`);
    }

    function openCanvas(id: string) {
        if (!isCurrent()) return;
        navigate(`/canvas/${id}`);
    }

    async function importCanvas(file?: File) {
        if (!file) return;
        if (!user) {
            openAuthDialog("login", { redirect: "/" });
            return;
        }
        try {
            const session = captureAccountSession();
            const owner = session.owner;
            const imported = await readCanvasPackage(file);
            session.check();
            if (!owner || currentMediaOwner() !== owner || !isCurrent()) throw new Error(t("canvas.importFailed"));
            imported.forEach(importProject);
            message.success(t("canvas.imported", { count: imported.length }));
        } catch {
            message.error(t("canvas.importFailed"));
        } finally {
            if (inputRef.current) inputRef.current.value = "";
        }
    }

    return (
        <section className="home-canvas-panel" aria-label={copyOf(home.canvasesTitle, t("home.recentCanvases"))}>
            <header className="home-canvas-panel-head">
                <div className="home-canvas-panel-copy">
                    <h2>{copyOf(home.canvasesTitle, t("home.recentCanvases"))}</h2>
                    <p>{copyOf(home.canvasesNote, t("home.recentCanvasesNote"))}</p>
                </div>
                <div className="home-canvas-panel-actions">
                    <button type="button" className="home-canvas-panel-action" onClick={() => inputRef.current?.click()}>
                        {t("canvas.import")}
                    </button>
                    <Link to="/canvas" className="home-canvas-panel-action">
                        {copyOf(home.canvasesViewAll, t("home.viewAll"))}
                    </Link>
                </div>
            </header>

            <div className="jm-canvas-grid">
                <button type="button" className="jm-canvas-card is-new" onClick={createAndOpenCanvas}>
                    <span className="jm-canvas-icon"><Plus /></span>
                    <span className="jm-canvas-body">
                        <span className="jm-canvas-title">{copyOf(home.canvasesNew, t("home.newCanvas"))}</span>
                        <span className="jm-canvas-meta">{copyOf(home.canvasesOpen, t("home.openCanvas"))}</span>
                    </span>
                </button>

                {recent.map((project) => (
                    <button key={project.id} type="button" className="jm-canvas-card" title={project.title} onClick={() => openCanvas(project.id)}>
                        <span className="jm-canvas-icon"><Frame /></span>
                        <span className="jm-canvas-body">
                            <span className="jm-canvas-title">{project.title}</span>
                            <span className="jm-canvas-meta">
                                <span>{t("canvas.project.stats", { nodes: project.nodes.length, connections: project.connections.length })}</span>
                                {project.updatedAt ? <span className="home-canvas-date"> · {formatPromptDate(project.updatedAt, i18n.resolvedLanguage)}</span> : null}
                            </span>
                        </span>
                    </button>
                ))}

                {/* 画布少于一屏时用一张占位卡补满剩余列，避免三格重复同一句话 */}
                {emptySlots > 0 ? (
                    <div className="jm-canvas-card is-empty" style={{ gridColumn: `span ${emptySlots}` }} aria-hidden="true">
                        <span className="jm-canvas-icon"><Frame /></span>
                        <span className="jm-canvas-body">
                            <span className="jm-canvas-title">{t("canvas.empty")}</span>
                            {emptySlots === PROJECT_SLOTS ? <span className="jm-canvas-meta">{t("canvas.emptyDescription")}</span> : null}
                        </span>
                    </div>
                ) : null}
            </div>

            <input
                ref={inputRef}
                type="file"
                accept={IMPORT_ACCEPT}
                className="hidden"
                onChange={(event) => void importCanvas(event.target.files?.[0])}
            />
        </section>
    );
}
