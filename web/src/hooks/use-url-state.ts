import { useSearchParams } from 'react-router-dom';
import { useCallback, useMemo } from 'react';

/**
 * URL状态管理 Hook - 学习 Orbi 的可分享筛选状态
 *
 * 将组件状态同步到URL查询参数，使得页面状态可以通过URL分享
 *
 * @param defaultState - 默认状态对象
 * @returns [state, setState] - 当前状态和更新函数
 *
 * @example
 * const [filters, setFilters] = useUrlState({
 *   providers: [] as string[],
 *   search: '',
 *   sort: 'price'
 * });
 *
 * // URL: ?providers=Anthropic&providers=OpenAI&search=claude&sort=price
 * // filters = { providers: ['Anthropic', 'OpenAI'], search: 'claude', sort: 'price' }
 */
export function useUrlState<T extends Record<string, string | string[]>>(
    defaultState: T
) {
    const [searchParams, setSearchParams] = useSearchParams();

    // 从URL解析当前状态
    const state = useMemo(() => {
        const result = { ...defaultState };

        for (const key in defaultState) {
            const defaultValue = defaultState[key];

            if (Array.isArray(defaultValue)) {
                // 数组类型：获取所有同名参数
                const values = searchParams.getAll(key);
                if (values.length > 0) {
                    result[key] = values as T[typeof key];
                }
            } else {
                // 字符串类型：获取单个参数
                const value = searchParams.get(key);
                if (value !== null) {
                    result[key] = value as T[typeof key];
                }
            }
        }

        return result;
    }, [searchParams, defaultState]);

    // 更新URL状态
    const setState = useCallback((updates: Partial<T>) => {
        const newParams = new URLSearchParams(searchParams);

        for (const [key, value] of Object.entries(updates)) {
            // 删除旧值
            newParams.delete(key);

            if (Array.isArray(value)) {
                // 数组：添加多个同名参数
                if (value.length > 0) {
                    value.forEach(v => newParams.append(key, String(v)));
                }
            } else if (value !== undefined && value !== null && value !== '') {
                // 非空值：设置参数
                newParams.set(key, String(value));
            }
        }

        setSearchParams(newParams, { replace: true });
    }, [searchParams, setSearchParams]);

    // 重置为默认状态
    const resetState = useCallback(() => {
        setSearchParams({}, { replace: true });
    }, [setSearchParams]);

    return [state, setState, resetState] as const;
}

/**
 * 单个URL参数的Hook
 *
 * @example
 * const [search, setSearch] = useUrlParam('search', '');
 */
export function useUrlParam(
    key: string,
    defaultValue: string = ''
): [string, (value: string) => void] {
    const [searchParams, setSearchParams] = useSearchParams();

    const value = searchParams.get(key) ?? defaultValue;

    const setValue = useCallback((newValue: string) => {
        const newParams = new URLSearchParams(searchParams);

        if (newValue) {
            newParams.set(key, newValue);
        } else {
            newParams.delete(key);
        }

        setSearchParams(newParams, { replace: true });
    }, [key, searchParams, setSearchParams]);

    return [value, setValue];
}

/**
 * 数组类型URL参数的Hook
 *
 * @example
 * const [providers, setProviders] = useUrlArrayParam('providers');
 * // URL: ?providers=Anthropic&providers=OpenAI
 * // providers = ['Anthropic', 'OpenAI']
 */
export function useUrlArrayParam(
    key: string,
    defaultValue: string[] = []
): [string[], (values: string[]) => void] {
    const [searchParams, setSearchParams] = useSearchParams();

    const values = searchParams.getAll(key);
    const value = values.length > 0 ? values : defaultValue;

    const setValue = useCallback((newValues: string[]) => {
        const newParams = new URLSearchParams(searchParams);
        newParams.delete(key);

        newValues.forEach(v => newParams.append(key, v));

        setSearchParams(newParams, { replace: true });
    }, [key, searchParams, setSearchParams]);

    return [value, setValue];
}
