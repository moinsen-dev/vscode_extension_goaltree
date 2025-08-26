/**
 * Performance optimization utilities
 */

/**
 * Debounces a function, ensuring it's only called after a delay
 */
export function debounce<T extends (...args: any[]) => void>(
    func: T,
    delay: number
): T {
    let timeoutId: NodeJS.Timeout | undefined;
    
    return ((...args: Parameters<T>) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), delay);
    }) as T;
}

/**
 * Throttles a function, ensuring it's only called at most once per interval
 */
export function throttle<T extends (...args: any[]) => void>(
    func: T,
    interval: number
): T {
    let lastCallTime = 0;
    
    return ((...args: Parameters<T>) => {
        const now = Date.now();
        if (now - lastCallTime >= interval) {
            lastCallTime = now;
            func(...args);
        }
    }) as T;
}

/**
 * Memoizes a function, caching results for identical inputs
 */
export function memoize<T extends (...args: any[]) => any>(
    func: T,
    options?: {
        maxCacheSize?: number;
        keyGenerator?: (...args: Parameters<T>) => string;
    }
): T & { clearCache: () => void } {
    const cache = new Map<string, ReturnType<T>>();
    const opts = {
        maxCacheSize: 100,
        keyGenerator: (...args: Parameters<T>) => JSON.stringify(args),
        ...options
    };
    
    const memoized = ((...args: Parameters<T>): ReturnType<T> => {
        const key = opts.keyGenerator(...args);
        
        if (cache.has(key)) {
            return cache.get(key)!;
        }
        
        const result = func(...args);
        
        // Manage cache size
        if (cache.size >= opts.maxCacheSize) {
            const firstKey = cache.keys().next().value;
            cache.delete(firstKey);
        }
        
        cache.set(key, result);
        return result;
    }) as T & { clearCache: () => void };
    
    memoized.clearCache = () => {
        cache.clear();
    };
    
    return memoized;
}

/**
 * Creates a batched function that collects calls and executes them together
 */
export function batch<T>(
    func: (items: T[]) => void,
    options?: {
        maxBatchSize?: number;
        maxDelay?: number;
    }
): (item: T) => void {
    const opts = {
        maxBatchSize: 10,
        maxDelay: 100,
        ...options
    };
    
    let batch: T[] = [];
    let timeoutId: NodeJS.Timeout | undefined;
    
    const executeBatch = () => {
        if (batch.length > 0) {
            func([...batch]);
            batch = [];
        }
        clearTimeout(timeoutId);
        timeoutId = undefined;
    };
    
    return (item: T) => {
        batch.push(item);
        
        if (batch.length >= opts.maxBatchSize) {
            executeBatch();
        } else if (!timeoutId) {
            timeoutId = setTimeout(executeBatch, opts.maxDelay);
        }
    };
}

/**
 * Performance timer for measuring execution time
 */
export class PerformanceTimer {
    private startTime: number = 0;
    private endTime: number = 0;
    private marks: Map<string, number> = new Map();
    
    start(): void {
        this.startTime = performance.now();
        this.endTime = 0;
        this.marks.clear();
    }
    
    mark(name: string): void {
        this.marks.set(name, performance.now());
    }
    
    end(): number {
        this.endTime = performance.now();
        return this.endTime - this.startTime;
    }
    
    getDuration(): number {
        const end = this.endTime || performance.now();
        return end - this.startTime;
    }
    
    getMarkTime(name: string): number | undefined {
        const markTime = this.marks.get(name);
        return markTime ? markTime - this.startTime : undefined;
    }
    
    getAllMarks(): Array<{ name: string; time: number }> {
        return Array.from(this.marks.entries()).map(([name, time]) => ({
            name,
            time: time - this.startTime
        }));
    }
    
    reset(): void {
        this.startTime = 0;
        this.endTime = 0;
        this.marks.clear();
    }
}

/**
 * Creates a performance profiler for function calls
 */
export function createProfiler(name: string) {
    const timers = new Map<string, number>();
    const counts = new Map<string, number>();
    
    return {
        profile<T extends (...args: any[]) => any>(func: T, functionName?: string): T {
            const fname = functionName || func.name || 'anonymous';
            
            return ((...args: Parameters<T>): ReturnType<T> => {
                const start = performance.now();
                const result = func(...args);
                const duration = performance.now() - start;
                
                // Update statistics
                const currentTotal = timers.get(fname) || 0;
                const currentCount = counts.get(fname) || 0;
                
                timers.set(fname, currentTotal + duration);
                counts.set(fname, currentCount + 1);
                
                return result;
            }) as T;
        },
        
        getStats() {
            const stats: Array<{
                function: string;
                calls: number;
                totalTime: number;
                averageTime: number;
            }> = [];
            
            for (const [fname, totalTime] of timers.entries()) {
                const calls = counts.get(fname) || 0;
                stats.push({
                    function: fname,
                    calls,
                    totalTime,
                    averageTime: totalTime / calls
                });
            }
            
            return stats.sort((a, b) => b.totalTime - a.totalTime);
        },
        
        reset() {
            timers.clear();
            counts.clear();
        },
        
        log() {
            console.group(`Performance Profile: ${name}`);
            const stats = this.getStats();
            
            for (const stat of stats) {
                console.log(
                    `${stat.function}: ${stat.calls} calls, ` +
                    `${stat.totalTime.toFixed(2)}ms total, ` +
                    `${stat.averageTime.toFixed(2)}ms avg`
                );
            }
            
            console.groupEnd();
        }
    };
}

/**
 * Lazy evaluation wrapper
 */
export function lazy<T>(factory: () => T): () => T {
    let value: T;
    let hasValue = false;
    
    return () => {
        if (!hasValue) {
            value = factory();
            hasValue = true;
        }
        return value;
    };
}

/**
 * Creates a rate limiter
 */
export function createRateLimiter(maxCalls: number, windowMs: number) {
    const calls: number[] = [];
    
    return {
        canCall(): boolean {
            const now = Date.now();
            const cutoff = now - windowMs;
            
            // Remove old calls
            while (calls.length > 0 && calls[0] < cutoff) {
                calls.shift();
            }
            
            return calls.length < maxCalls;
        },
        
        call<T>(func: () => T): T | null {
            if (this.canCall()) {
                calls.push(Date.now());
                return func();
            }
            return null;
        },
        
        reset() {
            calls.splice(0, calls.length);
        }
    };
}

/**
 * Virtual scrolling helper for large lists
 */
export class VirtualScroller {
    private itemHeight: number;
    private containerHeight: number;
    private totalItems: number;
    
    constructor(itemHeight: number, containerHeight: number, totalItems: number) {
        this.itemHeight = itemHeight;
        this.containerHeight = containerHeight;
        this.totalItems = totalItems;
    }
    
    getVisibleRange(scrollTop: number): { start: number; end: number } {
        const start = Math.floor(scrollTop / this.itemHeight);
        const visibleCount = Math.ceil(this.containerHeight / this.itemHeight);
        const end = Math.min(start + visibleCount, this.totalItems);
        
        return { start: Math.max(0, start), end };
    }
    
    getTotalHeight(): number {
        return this.totalItems * this.itemHeight;
    }
    
    getItemTop(index: number): number {
        return index * this.itemHeight;
    }
    
    updateParams(params: {
        itemHeight?: number;
        containerHeight?: number;
        totalItems?: number;
    }): void {
        if (params.itemHeight !== undefined) this.itemHeight = params.itemHeight;
        if (params.containerHeight !== undefined) this.containerHeight = params.containerHeight;
        if (params.totalItems !== undefined) this.totalItems = params.totalItems;
    }
}

/**
 * Memory-efficient array operations
 */
export const arrayUtils = {
    /**
     * Chunks array into smaller arrays
     */
    chunk<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    },
    
    /**
     * Finds index using binary search (requires sorted array)
     */
    binarySearch<T>(
        array: T[],
        target: T,
        compareFn: (a: T, b: T) => number = (a, b) => (a as any) - (b as any)
    ): number {
        let left = 0;
        let right = array.length - 1;
        
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const comparison = compareFn(array[mid], target);
            
            if (comparison === 0) {
                return mid;
            } else if (comparison < 0) {
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }
        
        return -1;
    },
    
    /**
     * Removes duplicates while preserving order
     */
    unique<T>(array: T[], keyFn?: (item: T) => any): T[] {
        if (!keyFn) {
            return [...new Set(array)];
        }
        
        const seen = new Set();
        return array.filter(item => {
            const key = keyFn(item);
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }
};