import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { ALL_PROMPTS_OPTION, fetchPrompts } from "@/services/api/prompts";

export const PROMPT_PAGE_SIZE = 20;

export function usePromptList({ keyword, tags = [], category = ALL_PROMPTS_OPTION, sourceId, metadata = true, enabled = true }: { keyword: string; tags?: string[]; category?: string; sourceId?: string; metadata?: boolean; enabled?: boolean }) {
    const [debouncedKeyword, setDebouncedKeyword] = useState(keyword);
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedKeyword(keyword), 300);
        return () => clearTimeout(timer);
    }, [keyword]);
    const query = useInfiniteQuery({
        queryKey: ["prompts", debouncedKeyword, [...tags].sort(), category, sourceId, metadata],
        queryFn: ({ pageParam, signal }) => fetchPrompts({ keyword: debouncedKeyword, tag: tags, category, sourceId, page: pageParam, pageSize: PROMPT_PAGE_SIZE, metadata: metadata && pageParam === 1, signal }),
        initialPageParam: 1,
        getNextPageParam: (lastPage) => (lastPage.hasMore && lastPage.items.length ? lastPage.page + 1 : undefined),
        enabled: enabled && keyword.trim() === debouncedKeyword.trim(),
    });
    const firstPage = query.data?.pages[0];
    return {
        query,
        items: useMemo(() => query.data?.pages.flatMap((page) => page.items) || [], [query.data?.pages]),
        tags: useMemo(() => [ALL_PROMPTS_OPTION, ...(firstPage?.tags || [])], [firstPage?.tags]),
        categories: useMemo(() => [ALL_PROMPTS_OPTION, ...(firstPage?.categories || [])], [firstPage?.categories]),
        total: firstPage?.total || 0,
    };
}
