import type { ReactNode } from "react";
import { Spin } from "antd";

import { cn } from "@/lib/utils";

export function AdminPanel({
    title,
    description,
    actions,
    children,
    className,
    bodyClassName,
    flush = false,
}: {
    title?: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    children: ReactNode;
    className?: string;
    bodyClassName?: string;
    flush?: boolean;
}) {
    return (
        <section className={cn("overflow-hidden rounded-[14px] border border-[var(--admin-line)] bg-[var(--admin-panel)]", className)}>
            {title || description || actions ? (
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--admin-line)] px-5 py-4">
                    <div className="min-w-0">
                        {title ? <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--admin-ink)]">{title}</h2> : null}
                        {description ? <p className="mt-1 max-w-[72ch] text-xs leading-5 text-[var(--admin-muted)]">{description}</p> : null}
                    </div>
                    {actions ? <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
                </div>
            ) : null}
            <div className={cn(flush ? "" : "p-5", bodyClassName)}>{children}</div>
        </section>
    );
}

export function AdminToolbar({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={cn("flex flex-wrap items-center gap-2 border-b border-[var(--admin-line)] px-5 py-3", className)}>{children}</div>;
}

export function AdminField({
    label,
    hint,
    required,
    children,
    className,
}: {
    label: ReactNode;
    hint?: ReactNode;
    required?: boolean;
    children: ReactNode;
    className?: string;
}) {
    return (
        <label className={cn("block", className)}>
            <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-[var(--admin-muted)]">
                {label}
                {required ? <span className="text-[var(--admin-danger)]">*</span> : null}
            </span>
            {children}
            {hint ? <span className="mt-1.5 block text-[11px] leading-4 text-[var(--admin-muted)]">{hint}</span> : null}
        </label>
    );
}

export const ADMIN_AUTOFILL_OFF = {
    autoComplete: "off",
    "data-lpignore": "true",
    "data-1p-ignore": "true",
    "data-form-type": "other",
} as const;

export type AdminBadgeTone = "neutral" | "positive" | "warning" | "danger" | "accent";

const BADGE_TONES: Record<AdminBadgeTone, string> = {
    neutral: "border-[var(--admin-line)] bg-[var(--admin-panel-soft)] text-[var(--admin-muted)]",
    positive: "border-[var(--admin-positive-line)] bg-[var(--admin-positive-soft)] text-[var(--admin-positive)]",
    warning: "border-[var(--admin-warning-line)] bg-[var(--admin-warning-soft)] text-[var(--admin-warning)]",
    danger: "border-[var(--admin-danger-line)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]",
    accent: "border-[rgba(212,255,58,0.38)] bg-[var(--admin-accent-soft)] text-[var(--admin-ink)] dark:text-[var(--admin-accent)]",
};

export function AdminBadge({ tone = "neutral", children, dot = true }: { tone?: AdminBadgeTone; children: ReactNode; dot?: boolean }) {
    return (
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5", BADGE_TONES[tone])}>
            {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
            {children}
        </span>
    );
}

export function AdminStat({ label, value, note, accent = false }: { label: ReactNode; value: ReactNode; note?: ReactNode; accent?: boolean }) {
    return (
        <div className="min-w-0 px-5 py-5 sm:px-6">
            <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-[var(--admin-muted)]">{label}</span>
                {accent ? <span className="size-1.5 rounded-full bg-[var(--admin-accent)]" /> : null}
            </div>
            <div className="mt-2.5 text-[28px] font-semibold leading-none tracking-[-0.035em] tabular-nums text-[var(--admin-ink)]">{value}</div>
            {note ? <div className="mt-2.5 text-[11px] leading-4 text-[var(--admin-muted)]">{note}</div> : null}
        </div>
    );
}

export function AdminLoading({ label = "加载中" }: { label?: string }) {
    return (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2">
            <Spin size="small" />
            <span className="text-xs text-[var(--admin-muted)]">{label}</span>
        </div>
    );
}
