import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import HomePage from "@/pages/home";
import { useAuthStore } from "@/stores/use-auth-store";
import { useAuthDialogStore, type AuthMode } from "@/stores/use-auth-dialog-store";

/**
 * /login、/register、/forgot-password 三个地址的落地页。
 *
 * 登录已经改为弹窗形态（参照即梦），所以这些地址不再渲染独立页面：
 * 先渲染首页作为背景，再自动浮出对应模式的弹窗；关掉弹窗就回首页。
 * 这样旧链接、`?redirect=` 回跳、RequireAuth 的重定向都继续有效。
 */
export function AuthGate({ mode }: { mode: AuthMode }) {
    const [params] = useSearchParams();
    const redirect = params.get("redirect") || "/";
    const invite = params.get("invite") || "";
    const open = useAuthDialogStore((state) => state.open);
    const user = useAuthStore((state) => state.user);
    const navigate = useNavigate();
    const openedRef = useRef(false);

    useEffect(() => {
        if (openedRef.current) return;
        openedRef.current = true;
        open(mode, { redirect, invite });
    }, [mode, redirect, invite, open]);

    // 已经登录（含从别的标签页登录）直接落到目标页
    useEffect(() => {
        if (user) navigate(redirect, { replace: true });
    }, [user, redirect, navigate]);

    // 关闭后回首页由 AuthDialog 的 closeDialog 处理：它知道当前是否停在 /login 这类地址。
    // 这里不再监听 mode 变 null，否则会和「登录成功后跳 redirect」抢路由。

    return <HomePage landing suppressPromo />;
}
