import { isRouteErrorResponse, useRouteError } from "react-router-dom";

export function RouteErrorPage() {
    const error = useRouteError();
    const message = isRouteErrorResponse(error)
        ? `${error.status} ${error.statusText}`
        : error instanceof Error ? error.message : String(error ?? "");
    const chunkError = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i.test(message);
    return (
        <main className="grid min-h-dvh place-items-center bg-background px-6 text-foreground">
            <div className="w-full max-w-md text-center">
                <h1 className="text-[26px] font-semibold leading-9 tracking-[-0.01em]">{chunkError ? "页面资源已更新" : "页面加载失败"}</h1>
                <p className="mt-3 text-[13px] leading-6 text-muted-foreground">
                    {chunkError ? "检测到新版本资源，刷新页面即可继续使用。" : "页面遇到了一点问题，请刷新后重试。"}
                </p>
                <div className="mt-7 flex justify-center gap-2">
                    <button type="button" className="jm-btn jm-btn-primary" onClick={() => window.location.reload()}>
                        刷新页面
                    </button>
                    <a className="jm-btn jm-btn-secondary" href="/">返回首页</a>
                </div>
            </div>
        </main>
    );
}
