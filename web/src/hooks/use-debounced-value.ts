import { useState, useEffect } from 'react';

/**
 * 防抖值 Hook - 学习 Orbi 的搜索优化
 *
 * @param value - 需要防抖的值
 * @param delay - 延迟时间（毫秒），默认 300ms
 * @returns 防抖后的值
 *
 * @example
 * const [search, setSearch] = useState('');
 * const debouncedSearch = useDebouncedValue(search, 500);
 *
 * useEffect(() => {
 *   // 只有当用户停止输入 500ms 后才执行搜索
 *   fetchResults(debouncedSearch);
 * }, [debouncedSearch]);
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(timer);
        };
    }, [value, delay]);

    return debouncedValue;
}

/**
 * 防抖回调 Hook
 *
 * @param callback - 需要防抖的回调函数
 * @param delay - 延迟时间（毫秒）
 * @returns 防抖后的函数
 *
 * @example
 * const handleSearch = useDebouncedCallback((query: string) => {
 *   fetchResults(query);
 * }, 500);
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
    callback: T,
    delay = 300
): (...args: Parameters<T>) => void {
    const [timer, setTimer] = useState<NodeJS.Timeout | null>(null);

    return (...args: Parameters<T>) => {
        if (timer) {
            clearTimeout(timer);
        }

        const newTimer = setTimeout(() => {
            callback(...args);
        }, delay);

        setTimer(newTimer);
    };
}
