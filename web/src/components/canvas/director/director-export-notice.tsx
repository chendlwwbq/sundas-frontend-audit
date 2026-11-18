import { CheckCircle2, CircleAlert, X } from "lucide-react";

export function DirectorExportNotice({ kind, text, background, onDismiss }: { kind: "success" | "warning" | "error"; text: string; background?: string; onDismiss?: () => void }) {
    const success = kind === "success";
    const warning = kind === "warning";
    return <div role={success || warning ? "status" : "alert"} aria-live={success || warning ? "polite" : "assertive"} className="director-workbench-topbar-group !h-auto min-h-9 max-w-[min(480px,calc(100vw-24px))] gap-2 px-3 py-1.5 text-xs sm:max-w-[min(480px,calc(100vw-300px))]" style={{ background, color: success ? "var(--status-success)" : warning ? "var(--status-warning)" : "var(--status-error)" }}>
        {success ? <CheckCircle2 className="size-4 shrink-0" aria-hidden /> : <CircleAlert className="size-4 shrink-0" aria-hidden />}
        <span className="min-w-0 flex-1 whitespace-normal break-words leading-5">{text}</span>
        {onDismiss ? <button type="button" onClick={onDismiss} aria-label="关闭提示" className="grid size-5 shrink-0 place-items-center rounded text-current opacity-70 transition hover:opacity-100"><X className="size-3.5" /></button> : null}
    </div>;
}
