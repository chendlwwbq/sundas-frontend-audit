import { useEffect, useRef, useState } from "react";
import { App, Avatar } from "antd";
import dayjs from "dayjs";
import { ChevronDown, CreditCard, Crown, HardDrive, Languages, LogOut, ReceiptText, Settings2, UserRound, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import { changeAppLocale, listLocales, type AppLocale } from "@/i18n";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/use-auth-store";
import { formatGenerationDiscount } from "@/lib/membership";
import { useConfigStore } from "@/stores/use-config-store";
import { useAuthDialogStore } from "@/stores/use-auth-dialog-store";

function formatStorage(bytes: number) {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(bytes % (1024 ** 3) === 0 ? 0 : 1)} GB`;
    if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
    return `${Math.round(bytes / 1024)} KB`;
}

export function UserAccountMenu() {
    const { t, i18n } = useTranslation();
    const { message, notification } = App.useApp();
    const navigate = useNavigate();
    const user = useAuthStore((state) => state.user);
    const wallet = useAuthStore((state) => state.wallet);
    const refreshWallet = useAuthStore((state) => state.refreshWallet);
    const logout = useAuthStore((state) => state.logout);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const openAuthDialog = useAuthDialogStore((state) => state.open);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const warnedOwner = useRef<string | null>(null);

    useEffect(() => {
        const storage = wallet?.storage;
        if (!user || !storage?.limitBytes || storage.usedBytes / storage.limitBytes < 0.9) {
            warnedOwner.current = null;
            notification.destroy("storage-low");
            return;
        }
        if (warnedOwner.current === user.id) return;
        warnedOwner.current = user.id;
        notification.warning({
            key: "storage-low",
            message: t("account.storageNearlyFull"),
            // 通知浮层挂在 antd App 子树（RouterProvider 之外），不能用 Link，否则 NavigationContext 为 null 导致整页崩溃。
            description: <div>{t("account.storageNearlyFullDescription")} <a href="/assets?tab=history" onClick={() => notification.destroy("storage-low")} className="text-primary underline">{t("account.cleanStorage")}</a></div>,
            duration: 0,
        });
    }, [notification, t, user?.id, wallet?.storage?.usedBytes, wallet?.storage?.limitBytes]);

    useEffect(() => {
        if (!open) return;
        void refreshWallet().catch(() => undefined);
        const closeOutside = (event: PointerEvent) => {
            if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const closeEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("pointerdown", closeOutside);
        document.addEventListener("keydown", closeEscape);
        return () => {
            document.removeEventListener("pointerdown", closeOutside);
            document.removeEventListener("keydown", closeEscape);
        };
    }, [open, refreshWallet]);

    if (!user) {
        return (
            <div className="flex items-center gap-2">
                <UserStatusActions showConfig={false} />
                {/* 登录按钮：品牌青柠胶囊 + 深墨字，点击浮出登录弹窗 */}
                <button
                    type="button"
                    onClick={() => openAuthDialog("login", { redirect: "/" })}
                    className="inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-[8px] !bg-[var(--brand)] px-3 text-[13px] font-medium !text-[var(--brand-ink)] transition-colors hover:!bg-[var(--accent-hover)]"
                    aria-label={t("auth.login")}
                >
                    {t("auth.login")}
                </button>
            </div>
        );
    }

    const planName = wallet?.member ? wallet.tierName || wallet.planName || t("account.member") : t("account.freePlan");
    const memberUntil = wallet?.memberUntil ? dayjs(wallet.memberUntil).format("YYYY.MM.DD") : null;
    const usedBytes = wallet?.storage?.usedBytes ?? 0;
    const limitBytes = wallet?.storage?.limitBytes ?? 0;
    const storagePercent = limitBytes ? Math.min(100, (usedBytes / limitBytes) * 100) : 0;
    const locale = i18n.resolvedLanguage as AppLocale;
    const menuLocales = listLocales();
    const localeIndex = Math.max(0, menuLocales.findIndex((item) => item.code === locale));
    const currentLocale = menuLocales[localeIndex];
    const nextLocale = menuLocales[(localeIndex + 1) % menuLocales.length];
    const close = () => setOpen(false);

    return (
        <div ref={wrapperRef} className="relative flex items-center gap-2">
            <Link to="/account?tab=membership" title={wallet?.member ? `${planName} · 生成${formatGenerationDiscount(wallet.generationDiscount)}` : "查看会员权益"}
                className={cn("inline-flex h-8 max-w-[76px] shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs transition hover:bg-accent sm:max-w-[144px]", wallet?.member ? "border-primary/30 bg-brand-soft !text-foreground" : "border-border !text-muted-foreground")}>
                <Crown className="hidden size-3.5 shrink-0 sm:block" />
                <span className="truncate">{wallet?.member && wallet.tierLevel ? `LV.${wallet.tierLevel} ` : ""}{wallet ? planName : "加载中"}</span>
            </Link>
            <Link to="/account" className="hidden h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-3 text-xs !text-foreground transition hover:bg-muted sm:inline-flex">
                <Wallet className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="font-semibold tabular-nums">{wallet?.availableCredits ?? wallet?.balance ?? 0}</span>
                <span className="whitespace-nowrap text-muted-foreground">{t("account.credits")}</span>
            </Link>
            <button type="button" className="inline-flex shrink-0 items-center gap-1 rounded-full p-0.5 transition hover:bg-muted" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={t("account.title")}>
                <Avatar size={30} className="!bg-foreground text-xs !text-white dark:!bg-muted dark:!text-foreground">
                    {(user.displayName || user.email).slice(0, 1).toUpperCase()}
                </Avatar>
                <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
            </button>

            {open ? (
                <div className="absolute right-0 top-full z-[80] mt-2 w-[344px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl">
                    <div className="flex items-start gap-3 border-b border-border px-4 py-4">
                        <Avatar size={38} className="!bg-foreground text-sm !text-white dark:!bg-muted dark:!text-foreground">
                            {(user.displayName || user.email).slice(0, 1).toUpperCase()}
                        </Avatar>
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-foreground">{user.displayName || user.email}</div>
                            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{user.email}</div>
                        </div>
                        <span className="rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground">{planName}</span>
                    </div>

                    <div className="space-y-2 p-3">
                        <div className="rounded-lg border border-border bg-muted/40 p-3">
                            <div className="flex items-center justify-between gap-3 text-[11px]">
                                <span className="inline-flex items-center gap-1.5 text-muted-foreground"><CreditCard className="size-3.5" />{t("account.currentSubscription")}</span>
                                <span className="font-medium text-foreground">{planName}</span>
                            </div>
                            <div className="mt-1.5 text-[10px] text-muted-foreground">
                                {wallet?.member && memberUntil ? t("account.memberUntil", { date: memberUntil }) : t("account.freePlanHint")}
                            </div>
                            {wallet?.member && <div className="mt-1.5 text-xs text-foreground">生成积分 · {formatGenerationDiscount(wallet.generationDiscount)}</div>}
                            <div className="mt-3 flex gap-2">
                                <Link to="/account?tab=membership" onClick={close} className="inline-flex h-7 flex-1 items-center justify-center rounded-md bg-foreground text-[11px] font-medium text-background transition hover:opacity-85">
                                    查看会员权益
                                </Link>
                                <Link to="/account?tab=orders" onClick={close} className="inline-flex h-7 flex-1 items-center justify-center rounded-md border border-border text-[11px] text-foreground transition hover:bg-muted">
                                    {t("account.orders")}
                                </Link>
                            </div>
                        </div>

                        <div className="rounded-lg border border-border px-3 py-2.5">
                            <div className="flex items-center justify-between gap-3 text-[11px]">
                                <span className="inline-flex items-center gap-1.5 text-muted-foreground"><HardDrive className="size-3.5" />{t("account.storageSpace")}</span>
                                <span className="tabular-nums text-muted-foreground">{formatStorage(usedBytes)} / {formatStorage(limitBytes)}</span>
                            </div>
                            <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                                <span className="block h-full rounded-full bg-[#009EFA] transition-[width]" style={{ width: `${storagePercent}%` }} />
                            </div>
                            {storagePercent >= 90 ? <p className="mt-2 text-xs text-amber-500">{t("account.storageNearlyFull")}</p> : null}
                            <div className="mt-2 flex items-center justify-between gap-2">
                                <Link to="/assets" onClick={close} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground transition hover:text-foreground">
                                    {t("account.manageAssets")} <ChevronDown className="size-3 -rotate-90" />
                                </Link>
                                <Link to="/assets?tab=history" onClick={close} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground transition hover:text-foreground">
                                    {t("assets.tabHistory")} <ChevronDown className="size-3 -rotate-90" />
                                </Link>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-1">
                            <Link to="/account" onClick={close} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[11px] text-foreground transition hover:bg-muted">
                                <UserRound className="size-3.5 text-muted-foreground" />{t("account.title")}
                            </Link>
                            <Link to="/account?tab=ledger" onClick={close} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[11px] text-foreground transition hover:bg-muted">
                                <ReceiptText className="size-3.5 text-muted-foreground" />{t("account.ledger")}
                            </Link>
                        </div>

                        <div className="border-t border-border pt-1">
                            <button type="button" onClick={() => void changeAppLocale(nextLocale.code)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] text-muted-foreground transition hover:bg-muted hover:text-foreground">
                                <Languages className="size-3.5" />
                                <span>{t("account.interfaceLanguage")}</span>
                                <span className="ml-auto text-foreground">{currentLocale?.label ?? locale}</span>
                            </button>
                            <button type="button" onClick={() => { close(); openConfigDialog(false); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] text-muted-foreground transition hover:bg-muted hover:text-foreground">
                                <Settings2 className="size-3.5" />
                                <span>{t("account.preferences")}</span>
                            </button>
                        </div>

                        <button type="button" onClick={() => { close(); void logout().then(() => navigate("/")).catch((error) => message.error(error instanceof Error ? error.message : "退出失败，请重试")); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] text-red-500 transition hover:bg-red-500/10">
                            <LogOut className="size-3.5" />
                            <span>{t("auth.logout")}</span>
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
