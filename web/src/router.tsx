import { lazy, Suspense, useEffect } from "react";
import { createBrowserRouter, Navigate, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { AuthDialogHost } from "@/components/layout/lazy-overlays";
import { AnalyticsTracker } from "@/components/layout/analytics-tracker";
import { RequireAuth } from "@/components/layout/require-auth";
import { RouteErrorPage } from "@/components/layout/route-error";
import { PageSkeleton } from "@/components/loading/page-skeleton";
import UserLayout from "@/layouts/user-layout";
import HomePage from "@/pages/home";
import { useAuthStore } from "@/stores/use-auth-store";
import { GUEST_DRAFT_KEY, storePendingPrompt } from "@/lib/pending-prompt";
import NotFound from "@/pages/not-found";

const AccountPage = lazy(() => import("@/pages/account"));
const AdminPage = lazy(() => import("@/pages/admin"));
const AssetsPage = lazy(() => import("@/pages/assets"));
const AuthGate = lazy(() => import("@/pages/auth").then((module) => ({ default: module.AuthGate })));
const CanvasPage = lazy(() => import("@/pages/canvas"));
const CanvasProjectPage = lazy(() => import("@/pages/canvas/project"));
const ChatPage = lazy(() => import("@/pages/chat"));
const ImagePage = lazy(() => import("@/pages/image"));
const PromptsPage = lazy(() => import("@/pages/prompts"));
const VideoPage = lazy(() => import("@/pages/video"));
const GuestCreation = lazy(() => import("@/pages/home/guest-creation").then((module) => ({ default: module.GuestCreation })));

function CreationHome() {
    const [params] = useSearchParams();
    const user = useAuthStore((state) => state.user);
    const ready = useAuthStore((state) => state.ready);
    const navigate = useNavigate();
    useEffect(() => {
        if (!user || !ready) return;
        try {
            const raw = sessionStorage.getItem(GUEST_DRAFT_KEY);
            if (!raw) return;
            const draft = JSON.parse(raw) as { mode?: string; prompt?: string };
            sessionStorage.removeItem(GUEST_DRAFT_KEY);
            if (typeof draft.prompt !== "string") return;
            const mode = draft.mode === "video" ? "video" : "image";
            storePendingPrompt(mode, draft.prompt, [], user.id);
            navigate(`/create?mode=${mode}`, { replace: true });
        } catch { /* a bad guest draft must not block the workspace */ }
    }, [user?.id, ready, navigate]);
    if (!ready) return <PageSkeleton />;
    return user ? (params.get("mode") === "chat" ? <ChatPage key={`${user.id}:${useAuthStore.getState().sessionEpoch}`} /> : params.get("mode") === "video" ? <VideoPage /> : <ImagePage />) : <GuestCreation />;
}

function HomeEntry() {
    const location = useLocation();
    const params = new URLSearchParams(location.search);
    if (params.has("mode") || params.has("record")) return <Navigate to={{ pathname: "/create", search: location.search, hash: location.hash }} replace />;
    return <HomePage landing />;
}

function LegacyCreation({ mode }: { mode: "image" | "video" }) {
    const location = useLocation();
    const params = new URLSearchParams(location.search);
    params.set("mode", mode);
    return <Navigate to={{ pathname: "/create", search: `?${params}`, hash: location.hash }} replace />;
}

export const router = createBrowserRouter([
    {
        element: (
            <Suspense fallback={<PageSkeleton />}>
                <Outlet />
                <AuthDialogHost />
            </Suspense>
        ),
        errorElement: <RouteErrorPage />,
        children: [
            {
                element: (
                    <UserLayout>
                        <AnalyticsTracker />
                        <Outlet />
                    </UserLayout>
                ),
                children: [
                    { path: "/", element: <HomeEntry /> },
                    { path: "/create", element: <CreationHome /> },
                    { path: "/explore", element: <HomePage /> },
                    { path: "/image", element: <RequireAuth><LegacyCreation mode="image" /></RequireAuth> },
                    { path: "/video", element: <RequireAuth><LegacyCreation mode="video" /></RequireAuth> },
                    { path: "/assets", element: <RequireAuth><AssetsPage /></RequireAuth> },
                    { path: "/prompts", element: <RequireAuth><PromptsPage /></RequireAuth> },
                    { path: "/models", element: <Navigate to="/" replace /> },
                    { path: "/canvas", element: <RequireAuth><CanvasPage /></RequireAuth> },
                    { path: "/canvas/:id", element: <RequireAuth><CanvasProjectPage /></RequireAuth> },
                    { path: "/login", element: <AuthGate mode="login" /> },
                    { path: "/register", element: <AuthGate mode="register" /> },
                    { path: "/forgot-password", element: <AuthGate mode="reset" /> },
                    { path: "/account", element: <RequireAuth><AccountPage /></RequireAuth> },
                ],
            },
            { path: "/admin", element: <AdminPage /> },
            { path: "*", element: <NotFound /> },
        ],
    },
]);
