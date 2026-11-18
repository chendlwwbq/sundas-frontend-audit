/**
 * 页面加载骨架屏
 * 提供比简单文本更好的加载体验，减少感知加载时间
 */
export const PageSkeleton = ({ embedded = false }: { embedded?: boolean }) => {
    return (
        <div className={`flex ${embedded ? "h-full" : "h-screen"} w-full flex-col bg-background p-6`}>
            {!embedded && (
                /* 顶部导航栏骨架 */
                <div className="mb-8 flex items-center justify-between">
                    <div className="h-8 w-32 animate-pulse rounded-lg bg-muted" />
                    <div className="flex gap-4">
                        <div className="h-10 w-20 animate-pulse rounded-lg bg-muted" />
                        <div className="h-10 w-24 animate-pulse rounded-lg bg-muted" />
                    </div>
                </div>
            )}

            {/* 主内容区域骨架 */}
            <div className="flex-1 space-y-6">
                {/* 标题 */}
                <div className="h-10 w-64 animate-pulse rounded-lg bg-muted" />

                {/* 内容卡片 */}
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="space-y-3 rounded-xl border border-border bg-card p-4">
                            <div className="aspect-video animate-pulse rounded-lg bg-muted" />
                            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                        </div>
                    ))}
                </div>
            </div>

            {!embedded && (
                /* 品牌化加载指示器（可选） */
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2">
                    <div className="flex items-center gap-2 rounded-full bg-card/80 px-4 py-2 shadow-lg backdrop-blur">
                        <div className="h-2 w-2 animate-pulse rounded-full bg-brand" />
                        <span className="text-sm text-muted-foreground">加载中...</span>
                    </div>
                </div>
            )}
        </div>
    );
};

/**
 * 简化版骨架屏 - 用于较小的组件
 */
export const CompactSkeleton = () => {
    return (
        <div className="flex items-center justify-center p-12">
            <div className="space-y-4 w-full max-w-md">
                <div className="h-8 w-3/4 animate-pulse rounded-lg bg-muted" />
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
            </div>
        </div>
    );
};
