import { Check, Download, Frame, Pencil, Trash2, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { App, Input } from "antd";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { formatPromptDate } from "@/services/api/prompts";
import { isCanvasAccountActive, useCanvasStore, type CanvasProject } from "@/stores/canvas/use-canvas-store";
import { useCanvasUiStore } from "@/stores/canvas/use-canvas-ui-store";
import { exportCanvasProjects } from "@/lib/canvas/canvas-export";
import { hasAgentUrlBootstrap } from "@/lib/agent/agent-url-bootstrap";
import { useAuthStore } from "@/stores/use-auth-store";
import { matchesCanvasSession } from "@/lib/canvas/canvas-session";

/**
 * 画布库卡片。外观与首页「最近画布」共用 .jm-canvas-*（见 jimeng-theme.css）：
 * 46px 图标块 + 标题 + 元信息，一行 4 个。
 * 这里只补三件首页卡片没有的事：勾选、重命名、hover 操作条。
 */
export function CanvasProjectCard({ project }: { project: CanvasProject }) {
    const { message } = App.useApp();
    const userId = useAuthStore(state => state.user?.id ?? null);
    const sessionEpoch = useAuthStore(state => state.sessionEpoch);
    const isCurrent = () => matchesCanvasSession(userId, sessionEpoch, useAuthStore.getState()) && isCanvasAccountActive(userId);
    const { i18n, t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const renameProject = useCanvasStore((state) => state.renameProject);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const editingId = useCanvasUiStore((state) => state.editingProjectId);
    const editingTitle = useCanvasUiStore((state) => state.editingProjectTitle);
    const startEditing = useCanvasUiStore((state) => state.startEditingProject);
    const setEditingTitle = useCanvasUiStore((state) => state.setEditingProjectTitle);
    const stopEditing = useCanvasUiStore((state) => state.stopEditingProject);
    const toggleSelected = useCanvasUiStore((state) => state.toggleSelectedProjectId);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);
    const editing = editingId === project.id;
    const selected = selectedIds.includes(project.id);
    const open = () => {
        if (!isCurrent()) return;
        const agentHash = hasAgentUrlBootstrap(window.location.hash) ? window.location.hash : "";
        navigate(`/canvas/${project.id}${searchParams.toString() ? `?${searchParams.toString()}` : ""}${agentHash}`, { replace: Boolean(agentHash) });
    };
    const saveTitle = () => {
        if (!isCurrent()) return;
        renameProject(project.id, editingTitle);
        stopEditing();
    };

    return (
        <article
            role="link"
            tabIndex={0}
            aria-label={t("canvas.project.open", { name: project.title })}
            className={cn("jm-canvas-card canvas-card group", selected && "is-selected")}
            onClick={() => !editing && open()}
            onKeyDown={(event) => {
                if (editing) return;
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    open();
                }
            }}
        >
            {/* 图标位：hover / 选中时叠出勾选框，避免额外占一行 */}
            <span className="canvas-card-badge">
                <span className="jm-canvas-icon"><Frame /></span>
                <label
                    className={cn("canvas-card-check", selected && "is-checked")}
                    onClick={(event) => event.stopPropagation()}
                >
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) => { if (isCurrent()) toggleSelected(project.id, event.target.checked); }}
                        className="absolute inset-0 cursor-pointer opacity-0"
                        aria-label={t("canvas.project.select", { name: project.title })}
                    />
                    {selected ? <Check className="size-3.5 text-white" strokeWidth={3.2} /> : null}
                </label>
            </span>

            <span className="jm-canvas-body">
                {editing ? (
                    <Input
                        size="small"
                        value={editingTitle}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => { if (isCurrent()) setEditingTitle(event.target.value); }}
                        onKeyDown={(event) => event.key === "Enter" && saveTitle()}
                        autoFocus
                    />
                ) : (
                    <h2 className="jm-canvas-title">{project.title}</h2>
                )}
                <span className="jm-canvas-meta">
                    <span>{t("canvas.project.stats", { nodes: project.nodes.length, connections: project.connections.length })}</span>
                    <span> · {formatPromptDate(project.updatedAt, i18n.resolvedLanguage)}</span>
                </span>
            </span>

            <div
                className="canvas-card-actions"
                onClick={(event) => event.stopPropagation()}
            >
                {editing ? (
                    <>
                        <button type="button" className="canvas-card-action" onClick={saveTitle} aria-label={t("canvas.project.saveName")}>
                            <Check className="size-4" />
                        </button>
                        <button type="button" className="canvas-card-action" onClick={() => { if (isCurrent()) stopEditing(); }} aria-label={t("canvas.project.cancelRename")}>
                            <X className="size-4" />
                        </button>
                    </>
                ) : (
                    <>
                        <button type="button" className="canvas-card-action" onClick={() => { if (isCurrent()) void exportCanvasProjects([project], project.title || t("canvas.title")).catch(error => message.error(error instanceof Error ? error.message : t("canvas.sidePanel.exportFailed"))); }} aria-label={t("canvas.project.export")}>
                            <Download className="size-4" />
                        </button>
                        <button type="button" className="canvas-card-action" onClick={() => { if (isCurrent()) startEditing(project.id, project.title); }} aria-label={t("canvas.project.rename")}>
                            <Pencil className="size-4" />
                        </button>
                        <button type="button" className="canvas-card-action is-danger" onClick={() => { if (isCurrent()) setDeleteIds([project.id]); }} aria-label={t("canvas.project.delete")}>
                            <Trash2 className="size-4" />
                        </button>
                    </>
                )}
            </div>
        </article>
    );
}
