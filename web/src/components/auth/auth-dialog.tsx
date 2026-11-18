import { type InputHTMLAttributes, type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { App as AntApp } from "antd";
import { Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, Mail, Ticket, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import { BrandName, BrandWordmark } from "@/components/brand/brand-wordmark";
import { changeAppLocale, listLocales, type AppLocale } from "@/i18n";
import { useAuthStore } from "@/stores/use-auth-store";
import { useAuthDialogStore, type AuthMode } from "@/stores/use-auth-dialog-store";
import "./auth-dialog.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUTH_ROUTES = ["/login", "/register", "/forgot-password"];

/**
 * 即梦式登录弹窗：浮在当前页面之上，遮罩 + 居中卡片，不跳路由。
 * 登录 / 注册 / 重置三种模式共用一套外壳，切换在弹窗内完成。
 */
export function AuthDialog() {
    const { message } = AntApp.useApp();
    const { i18n, t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();

    const mode = useAuthDialogStore((state) => state.mode);
    const redirect = useAuthDialogStore((state) => state.redirect);
    const presetInvite = useAuthDialogStore((state) => state.invite);
    const hint = useAuthDialogStore((state) => state.hint);
    const setMode = useAuthDialogStore((state) => state.setMode);
    const close = useAuthDialogStore((state) => state.close);

    const login = useAuthStore((state) => state.login);
    const register = useAuthStore((state) => state.register);
    const resetPassword = useAuthStore((state) => state.resetPassword);
    const sendCode = useAuthStore((state) => state.sendCode);

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [code, setCode] = useState("");
    const [inviteCode, setInviteCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [confirmVisible, setConfirmVisible] = useState(false);

    const cardRef = useRef<HTMLDivElement>(null);
    const open = mode !== null;

    // 打开时预填邀请码；切换模式保留已输入的邮箱，避免重复输入。
    useEffect(() => {
        if (!open) return;
        if (presetInvite) setInviteCode(presetInvite);
    }, [open, presetInvite]);

    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
        return () => window.clearTimeout(timer);
    }, [cooldown]);

    // 关闭入口要清掉验证码与密码，邮箱留着方便再打开
    function closeDialog() {
        close();
        setPassword("");
        setConfirm("");
        setCode("");
        setCooldown(0);
        setPasswordVisible(false);
        setConfirmVisible(false);
        // 通过 /login 等地址进来的，关闭后回首页（保留来源页更自然）
        if (AUTH_ROUTES.includes(location.pathname)) {
            navigate("/", { replace: true });
        }
    }

    useEffect(() => {
        if (!open) return;
        const previousFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const focusables = () =>
            Array.from(
                cardRef.current?.querySelectorAll<HTMLElement>(
                    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
                ) ?? [],
            ).filter((element) => element.offsetParent !== null);
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                closeDialog();
                return;
            }
            if (event.key !== "Tab") return;
            const list = focusables();
            if (!list.length) return;
            const first = list[0];
            const last = list[list.length - 1];
            const active = document.activeElement;
            if (event.shiftKey) {
                if (active === first || !cardRef.current?.contains(active)) {
                    event.preventDefault();
                    last.focus();
                }
            } else if (active === last || !cardRef.current?.contains(active)) {
                event.preventDefault();
                first.focus();
            }
        };
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        document.addEventListener("keydown", onKeyDown);
        // 打开时把焦点交给第一个输入框，键盘用户不用先摸到卡片
        const timer = window.setTimeout(() => {
            cardRef.current?.querySelector<HTMLInputElement>("input")?.focus();
        }, 60);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", onKeyDown);
            window.clearTimeout(timer);
            if (previousFocused?.isConnected) previousFocused.focus();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    if (!open) return null;

    const currentMode: AuthMode = mode;
    const needsCode = currentMode !== "login";
    const locale = i18n.resolvedLanguage as AppLocale;
    const authLocales = listLocales();
    const localeIndex = Math.max(0, authLocales.findIndex((item) => item.code === locale));
    const nextLocaleItem = authLocales[(localeIndex + 1) % authLocales.length];

    const copy =
        currentMode === "login"
            ? { title: t("auth.welcomeBack"), subtitle: t("auth.loginSubtitle"), action: t("auth.login") }
            : currentMode === "register"
              ? { title: t("auth.createWorkspace"), subtitle: t("auth.registerSubtitle"), action: t("auth.register") }
              : { title: t("auth.resetAccess"), subtitle: t("auth.resetSubtitle"), action: t("auth.reset") };

    async function handleSendCode() {
        if (!EMAIL_RE.test(email)) {
            message.error(t("auth.invalidEmail"));
            return;
        }
        setSending(true);
        try {
            await sendCode(email, currentMode === "register" ? "register" : "reset");
            message.success(t("auth.codeSent"));
            setCooldown(60);
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setSending(false);
        }
    }

    async function handleSubmit() {
        if (!EMAIL_RE.test(email)) {
            message.error(t("auth.invalidEmail"));
            return;
        }
        if (password.length < 8) {
            message.error(t("auth.passwordTooShort"));
            return;
        }
        if (currentMode !== "login" && password !== confirm) {
            message.error(t("auth.passwordMismatch"));
            return;
        }
        if (needsCode && !code.trim()) {
            message.error(t("auth.codeRequired"));
            return;
        }

        setLoading(true);
        try {
            if (currentMode === "login") {
                await login(email, password);
                message.success(t("auth.loginSuccess"));
                close();
                navigate(redirect || "/", { replace: true });
            } else if (currentMode === "register") {
                await register(email, code.trim(), password, inviteCode.trim().toUpperCase());
                message.success(t("auth.registerSuccess"));
                close();
                navigate(redirect || "/", { replace: true });
            } else {
                await resetPassword(email, code.trim(), password);
                message.success(t("auth.resetSuccess"));
                setPassword("");
                setConfirm("");
                setCode("");
                setMode("login");
            }
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setLoading(false);
        }
    }

    return createPortal(
        <div className="auth-modal">
            <div className="auth-modal-mask" onClick={closeDialog} />
            <div className="auth-modal-card" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title" ref={cardRef}>
                <header className="auth-modal-head">
                    <span className="auth-modal-brand">
                        <img className="auth-modal-symbol" src="/brand/sundas-symbol.svg" alt="" />
                        <BrandWordmark height={13} decorative />
                    </span>
                    <div className="auth-modal-head-actions">
                        <button
                            type="button"
                            className="auth-modal-locale"
                            onClick={() => void changeAppLocale(nextLocaleItem.code)}
                            aria-label={t("topNav.switchLanguage", { language: nextLocaleItem.label })}
                        >
                            {nextLocaleItem.short}
                        </button>
                        <button type="button" className="auth-modal-close" onClick={closeDialog} aria-label={t("auth.backHome")}>
                            <X />
                        </button>
                    </div>
                </header>

                <div className="auth-modal-heading">
                    <h2 id="auth-modal-title" className="auth-modal-title">
                        <BrandName text={copy.title} imageHeight="0.78em" />
                    </h2>
                    <p className="auth-modal-subtitle">{copy.subtitle}</p>
                    {hint ? <p className="auth-modal-hint" role="status">{hint}</p> : null}
                </div>

                <form
                    className="auth-modal-fields"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void handleSubmit();
                    }}
                >
                    <AuthField
                        label={t("auth.email")}
                        icon={<Mail />}
                        type="email"
                        name="email"
                        placeholder={t("auth.emailPlaceholder")}
                        value={email}
                        autoComplete="email"
                        onChange={(event) => setEmail(event.target.value)}
                    />
                    <AuthField
                        label={t("auth.password")}
                        icon={<LockKeyhole />}
                        type={passwordVisible ? "text" : "password"}
                        name="password"
                        placeholder={t("auth.passwordPlaceholder")}
                        value={password}
                        autoComplete={currentMode === "login" ? "current-password" : "new-password"}
                        onChange={(event) => setPassword(event.target.value)}
                        action={
                            <button type="button" className="auth-modal-eye" onClick={() => setPasswordVisible((value) => !value)} aria-label={passwordVisible ? t("auth.hidePassword") : t("auth.showPassword")}>
                                {passwordVisible ? <EyeOff /> : <Eye />}
                            </button>
                        }
                    />
                    {currentMode !== "login" ? (
                        <AuthField
                            label={t("auth.confirmPassword")}
                            icon={<LockKeyhole />}
                            type={confirmVisible ? "text" : "password"}
                            name="confirmPassword"
                            placeholder={t("auth.confirmPassword")}
                            value={confirm}
                            autoComplete="new-password"
                            onChange={(event) => setConfirm(event.target.value)}
                            action={
                                <button type="button" className="auth-modal-eye" onClick={() => setConfirmVisible((value) => !value)} aria-label={confirmVisible ? t("auth.hidePassword") : t("auth.showPassword")}>
                                    {confirmVisible ? <EyeOff /> : <Eye />}
                                </button>
                            }
                        />
                    ) : null}
                    {needsCode ? (
                        <label className="auth-modal-field">
                            <span className="auth-modal-label">{t("auth.code")}</span>
                            <span className="auth-modal-code-row">
                                <span className="auth-modal-shell">
                                    <KeyRound className="auth-modal-icon" />
                                    <input
                                        className="auth-modal-input"
                                        name="code"
                                        inputMode="numeric"
                                        maxLength={6}
                                        placeholder={t("auth.codePlaceholder")}
                                        value={code}
                                        autoComplete="one-time-code"
                                        onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                                    />
                                </span>
                                <button type="button" className="auth-modal-code-btn" disabled={sending || cooldown > 0} onClick={() => void handleSendCode()}>
                                    {cooldown > 0 ? t("auth.resendIn", { seconds: cooldown }) : t("auth.sendCode")}
                                </button>
                            </span>
                        </label>
                    ) : null}
                    {currentMode === "register" ? (
                        <label className="auth-modal-field">
                            <span className="auth-modal-label">
                                {t("auth.inviteCode")}
                                <span className="auth-modal-optional">{t("auth.optional")}</span>
                            </span>
                            <span className="auth-modal-shell">
                                <Ticket className="auth-modal-icon" />
                                <input
                                    className="auth-modal-input"
                                    name="inviteCode"
                                    maxLength={16}
                                    placeholder={t("auth.inviteCodePlaceholder")}
                                    value={inviteCode}
                                    onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                                />
                            </span>
                        </label>
                    ) : null}

                    <button type="submit" className="auth-modal-submit" disabled={loading}>
                        {loading ? <LoaderCircle className="auth-modal-spin" size={17} /> : copy.action}
                    </button>
                </form>

                <div className="auth-modal-alt">
                    {currentMode === "login" ? (
                        <>
                            <button type="button" className="auth-modal-link" onClick={() => setMode("register")}>
                                {t("auth.noAccount")}
                                <span className="auth-modal-link-strong">{t("auth.toRegister")}</span>
                            </button>
                            <button type="button" className="auth-modal-link" onClick={() => setMode("reset")}>
                                {t("auth.forgot")}
                            </button>
                        </>
                    ) : currentMode === "register" ? (
                        <button type="button" className="auth-modal-link" onClick={() => setMode("login")}>
                            {t("auth.hasAccount")}
                            <span className="auth-modal-link-strong">{t("auth.toLogin")}</span>
                        </button>
                    ) : (
                        <button type="button" className="auth-modal-link" onClick={() => setMode("login")}>
                            {t("auth.backToLogin")}
                        </button>
                    )}
                </div>

                <p className="auth-modal-foot">{t("auth.formFootnote")}</p>
            </div>
        </div>,
        document.body,
    );
}

function AuthField({
    label,
    icon,
    action,
    ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; icon: ReactNode; action?: ReactNode }) {
    return (
        <label className="auth-modal-field">
            <span className="auth-modal-label">{label}</span>
            <span className="auth-modal-shell">
                <span className="auth-modal-icon">{icon}</span>
                <input className="auth-modal-input" {...props} />
                {action}
            </span>
        </label>
    );
}
