/**
 * 骨架屏 - 灵感卡片加载状态
 */
export function PromptCardSkeleton() {
    return (
        <div className="home-prompt-card is-loading">
            <div className="home-prompt-media">
                <div className="skeleton skeleton-media" />
            </div>
            <div className="home-prompt-body">
                <div className="skeleton skeleton-avatar" />
                <div className="home-prompt-info">
                    <div className="skeleton skeleton-title" />
                    <div className="skeleton skeleton-tags" />
                </div>
            </div>
        </div>
    );
}

/**
 * 多个骨架屏卡片网格
 */
export function PromptGridSkeleton({ count = 12 }: { count?: number }) {
    return (
        <div className="home-prompt-grid">
            {Array.from({ length: count }).map((_, i) => (
                <PromptCardSkeleton key={i} />
            ))}
        </div>
    );
}
