/**
 * Debouncing utilities for auto-save operations
 * Prevents excessive I/O operations by delaying execution until activity stops
 */

/**
 * Configuration options for debounced functions
 */
export interface DebounceOptions {
    /** Delay in milliseconds before execution */
    delay: number;
    /** Whether to execute immediately on the first call */
    immediate?: boolean;
    /** Maximum delay before forcing execution (prevents infinite delays) */
    maxDelay?: number;
    /** Context to bind the function to */
    context?: any;
}

/**
 * Information about a debounced function's state
 */
export interface DebounceInfo {
    /** Whether the function is currently pending execution */
    isPending: boolean;
    /** Time of last call attempt */
    lastCall?: Date;
    /** Time of next scheduled execution */
    nextExecution?: Date;
    /** Number of calls that have been debounced */
    callCount: number;
}

/**
 * A debounced function with additional control methods
 */
export interface DebouncedFunction<T extends (...args: any[]) => any> {
    /** The debounced function */
    (...args: Parameters<T>): void;
    /** Cancel pending execution */
    cancel(): void;
    /** Force immediate execution of pending call */
    flush(): ReturnType<T> | undefined;
    /** Get information about debounce state */
    getInfo(): DebounceInfo;
    /** Check if execution is pending */
    isPending(): boolean;
}

/**
 * Creates a debounced version of a function that delays execution until
 * after `delay` milliseconds have elapsed since the last time it was invoked.
 * 
 * @param func The function to debounce
 * @param options Debounce configuration options
 * @returns A debounced version of the function with additional control methods
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    options: DebounceOptions
): DebouncedFunction<T> {
    let timeoutId: NodeJS.Timeout | undefined;
    let maxTimeoutId: NodeJS.Timeout | undefined;
    let lastArgs: Parameters<T>;
    let lastCallTime: Date | undefined;
    let callCount = 0;
    let result: ReturnType<T> | undefined;

    const { delay, immediate = false, maxDelay, context } = options;

    const invokeFunc = (): ReturnType<T> => {
        const args = lastArgs;
        lastArgs = undefined!;
        result = func.apply(context, args);
        return result as ReturnType<T>;
    };

    const leadingEdge = (args: Parameters<T>): ReturnType<T> | undefined => {
        // Store the arguments for potential delayed execution
        lastArgs = args;
        
        if (immediate) {
            result = invokeFunc();
        }
        
        return result;
    };

    const trailingEdge = (): ReturnType<T> => {
        timeoutId = undefined;
        if (lastArgs) {
            return invokeFunc();
        }
        return result as ReturnType<T>;
    };

    const timedOut = (): void => {
        const currentTime = Date.now();
        const timeSinceLastCall = lastCallTime ? currentTime - lastCallTime.getTime() : 0;
        
        if (timeSinceLastCall < delay && timeSinceLastCall >= 0) {
            // Still within delay period, reschedule
            timeoutId = setTimeout(timedOut, delay - timeSinceLastCall);
        } else {
            // Execute the function
            timeoutId = undefined;
            if (maxTimeoutId) {
                clearTimeout(maxTimeoutId);
                maxTimeoutId = undefined;
            }
            trailingEdge();
        }
    };

    const cancel = (): void => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
        }
        if (maxTimeoutId) {
            clearTimeout(maxTimeoutId);
            maxTimeoutId = undefined;
        }
        lastArgs = undefined!;
        lastCallTime = undefined;
        result = undefined;
    };

    const flush = (): ReturnType<T> | undefined => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
        }
        if (maxTimeoutId) {
            clearTimeout(maxTimeoutId);
            maxTimeoutId = undefined;
        }
        return lastArgs ? trailingEdge() : result;
    };

    const isPending = (): boolean => {
        return timeoutId !== undefined || maxTimeoutId !== undefined;
    };

    const getInfo = (): DebounceInfo => {
        return {
            isPending: isPending(),
            lastCall: lastCallTime,
            nextExecution: timeoutId ? new Date(Date.now() + delay) : undefined,
            callCount
        };
    };

    const debounced = function(...args: Parameters<T>): void {
        const currentTime = new Date();
        const isInvoking = !timeoutId;
        
        lastArgs = args;
        lastCallTime = currentTime;
        callCount++;

        if (isInvoking) {
            if (immediate) {
                result = leadingEdge(args);
            }
            
            // Set up max delay timer if specified
            if (maxDelay && maxDelay > delay) {
                maxTimeoutId = setTimeout(() => {
                    maxTimeoutId = undefined;
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                        timeoutId = undefined;
                    }
                    trailingEdge();
                }, maxDelay);
            }
        }

        // Clear existing timeout and set new one
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(timedOut, delay);
    };

    debounced.cancel = cancel;
    debounced.flush = flush;
    debounced.getInfo = getInfo;
    debounced.isPending = isPending;

    return debounced;
}

/**
 * Creates a throttled version of a function that limits execution to once per interval.
 * Unlike debounce, throttle ensures execution happens at regular intervals.
 * 
 * @param func The function to throttle
 * @param interval Minimum time in milliseconds between executions
 * @param options Additional throttle options
 * @returns A throttled version of the function
 */
export function throttle<T extends (...args: any[]) => any>(
    func: T,
    interval: number,
    options: { leading?: boolean; trailing?: boolean; context?: any } = {}
): DebouncedFunction<T> {
    const { leading = true, trailing = true, context } = options;
    
    let lastExecTime = 0;
    let timeoutId: NodeJS.Timeout | undefined;
    let lastArgs: Parameters<T>;
    let callCount = 0;
    let result: ReturnType<T> | undefined;

    const invokeFunc = (): ReturnType<T> => {
        const args = lastArgs;
        lastArgs = undefined!;
        lastExecTime = Date.now();
        result = func.apply(context, args);
        return result as ReturnType<T>;
    };

    const cancel = (): void => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
        }
        lastArgs = undefined!;
        result = undefined;
        lastExecTime = 0;
    };

    const flush = (): ReturnType<T> | undefined => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
        }
        return lastArgs ? invokeFunc() : result;
    };

    const isPending = (): boolean => {
        return timeoutId !== undefined;
    };

    const getInfo = (): DebounceInfo => {
        const now = Date.now();
        const timeSinceLastExec = now - lastExecTime;
        const nextExecIn = Math.max(0, interval - timeSinceLastExec);
        
        return {
            isPending: isPending(),
            lastCall: lastExecTime > 0 ? new Date(lastExecTime) : undefined,
            nextExecution: nextExecIn > 0 ? new Date(now + nextExecIn) : undefined,
            callCount
        };
    };

    const throttled = function(...args: Parameters<T>): void {
        const now = Date.now();
        const timeSinceLastExec = now - lastExecTime;
        
        lastArgs = args;
        callCount++;

        if (timeSinceLastExec >= interval) {
            // Enough time has passed, execute immediately
            if (leading) {
                invokeFunc();
                
                // Schedule trailing execution if needed
                if (trailing && !timeoutId) {
                    timeoutId = setTimeout(() => {
                        timeoutId = undefined;
                        if (lastArgs) {
                            invokeFunc();
                        }
                    }, interval);
                }
            } else {
                // No leading execution, just schedule trailing
                if (trailing && !timeoutId) {
                    timeoutId = setTimeout(() => {
                        timeoutId = undefined;
                        invokeFunc();
                    }, interval);
                }
            }
        } else {
            // Not enough time has passed, schedule execution
            if (trailing && !timeoutId) {
                const delay = interval - timeSinceLastExec;
                timeoutId = setTimeout(() => {
                    timeoutId = undefined;
                    invokeFunc();
                }, delay);
            }
        }
    };

    throttled.cancel = cancel;
    throttled.flush = flush;
    throttled.getInfo = getInfo;
    throttled.isPending = isPending;

    return throttled;
}

/**
 * Default debounce configurations for different use cases
 */
export const DebouncePresets = {
    /** Fast response for user input (300ms) */
    FAST: { delay: 300 } as DebounceOptions,
    
    /** Standard debounce for most operations (500ms) */
    STANDARD: { delay: 500 } as DebounceOptions,
    
    /** Slower debounce for heavy operations (1000ms) */
    SLOW: { delay: 1000 } as DebounceOptions,
    
    /** Auto-save specific configuration (1000ms delay, 5000ms max delay) */
    AUTO_SAVE: { delay: 1000, maxDelay: 5000 } as DebounceOptions,
    
    /** Search input debounce (250ms delay) */
    SEARCH: { delay: 250 } as DebounceOptions,
    
    /** File I/O operations (750ms delay, 3000ms max delay) */
    FILE_IO: { delay: 750, maxDelay: 3000 } as DebounceOptions
};

/**
 * Utility class for managing multiple debounced functions
 */
export class DebounceManager {
    private debouncedFunctions = new Map<string, DebouncedFunction<any>>();

    /**
     * Creates or retrieves a debounced function by key
     */
    getDebounced<T extends (...args: any[]) => any>(
        key: string,
        func: T,
        options: DebounceOptions
    ): DebouncedFunction<T> {
        if (!this.debouncedFunctions.has(key)) {
            this.debouncedFunctions.set(key, debounce(func, options));
        }
        return this.debouncedFunctions.get(key)!;
    }

    /**
     * Cancels a specific debounced function
     */
    cancel(key: string): void {
        const debounced = this.debouncedFunctions.get(key);
        if (debounced) {
            debounced.cancel();
        }
    }

    /**
     * Cancels all debounced functions
     */
    cancelAll(): void {
        for (const debounced of this.debouncedFunctions.values()) {
            debounced.cancel();
        }
    }

    /**
     * Forces execution of a specific debounced function
     */
    flush(key: string): any {
        const debounced = this.debouncedFunctions.get(key);
        return debounced?.flush();
    }

    /**
     * Forces execution of all pending debounced functions
     */
    flushAll(): void {
        for (const debounced of this.debouncedFunctions.values()) {
            debounced.flush();
        }
    }

    /**
     * Gets information about all debounced functions
     */
    getAllInfo(): Record<string, DebounceInfo> {
        const info: Record<string, DebounceInfo> = {};
        for (const [key, debounced] of this.debouncedFunctions.entries()) {
            info[key] = debounced.getInfo();
        }
        return info;
    }

    /**
     * Removes a debounced function from management
     */
    remove(key: string): void {
        const debounced = this.debouncedFunctions.get(key);
        if (debounced) {
            debounced.cancel();
            this.debouncedFunctions.delete(key);
        }
    }

    /**
     * Clears all debounced functions
     */
    clear(): void {
        this.cancelAll();
        this.debouncedFunctions.clear();
    }
}