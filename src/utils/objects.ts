/**
 * Object manipulation utilities
 */

/**
 * Deep clones an object using structured cloning when available, fallback to JSON
 */
export function deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    
    // Use structuredClone if available (newer Node.js/browsers)
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(obj);
        } catch (error) {
            // Fallback to JSON if structuredClone fails
        }
    }
    
    // Handle Date objects
    if (obj instanceof Date) {
        return new Date(obj.getTime()) as unknown as T;
    }
    
    // Handle Arrays
    if (Array.isArray(obj)) {
        return obj.map(item => deepClone(item)) as unknown as T;
    }
    
    // Handle Maps
    if (obj instanceof Map) {
        const map = new Map();
        for (const [key, value] of obj.entries()) {
            map.set(deepClone(key), deepClone(value));
        }
        return map as unknown as T;
    }
    
    // Handle Sets
    if (obj instanceof Set) {
        const set = new Set();
        for (const value of obj.values()) {
            set.add(deepClone(value));
        }
        return set as unknown as T;
    }
    
    // Handle regular objects
    try {
        // Quick JSON clone for simple objects
        if (canUseJsonClone(obj)) {
            return JSON.parse(JSON.stringify(obj));
        }
        
        // Manual deep clone for complex objects
        const cloned = {} as T;
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                (cloned as any)[key] = deepClone((obj as any)[key]);
            }
        }
        
        return cloned;
    } catch (error) {
        console.warn('Deep clone failed, returning original object:', error);
        return obj;
    }
}

/**
 * Checks if an object can be safely cloned using JSON methods
 */
function canUseJsonClone(obj: any): boolean {
    // Check for non-JSON-serializable properties
    const stack = [obj];
    const visited = new WeakSet();
    
    while (stack.length > 0) {
        const current = stack.pop();
        
        if (current === null || typeof current !== 'object') {
            continue;
        }
        
        if (visited.has(current)) {
            return false; // Circular reference
        }
        
        visited.add(current);
        
        // Check for non-serializable types
        if (current instanceof Date || 
            current instanceof RegExp ||
            current instanceof Map ||
            current instanceof Set ||
            typeof current === 'function' ||
            current instanceof Error) {
            return false;
        }
        
        // Add object properties to stack
        for (const value of Object.values(current)) {
            if (typeof value === 'object' && value !== null) {
                stack.push(value);
            }
        }
    }
    
    return true;
}

/**
 * Performs deep equality comparison between two objects
 */
export function isEqual(a: any, b: any): boolean {
    // Same reference
    if (a === b) {
        return true;
    }
    
    // Null/undefined checks
    if (a == null || b == null) {
        return a === b;
    }
    
    // Type check
    if (typeof a !== typeof b) {
        return false;
    }
    
    // Primitive types
    if (typeof a !== 'object') {
        return a === b;
    }
    
    // Date objects
    if (a instanceof Date && b instanceof Date) {
        return a.getTime() === b.getTime();
    }
    
    // Array comparison
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) {
            return false;
        }
        
        for (let i = 0; i < a.length; i++) {
            if (!isEqual(a[i], b[i])) {
                return false;
            }
        }
        
        return true;
    }
    
    // One is array, other is not
    if (Array.isArray(a) || Array.isArray(b)) {
        return false;
    }
    
    // Map comparison
    if (a instanceof Map && b instanceof Map) {
        if (a.size !== b.size) {
            return false;
        }
        
        for (const [key, value] of a.entries()) {
            if (!b.has(key) || !isEqual(value, b.get(key))) {
                return false;
            }
        }
        
        return true;
    }
    
    // Set comparison
    if (a instanceof Set && b instanceof Set) {
        if (a.size !== b.size) {
            return false;
        }
        
        for (const value of a) {
            if (!b.has(value)) {
                return false;
            }
        }
        
        return true;
    }
    
    // Object comparison
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    
    if (aKeys.length !== bKeys.length) {
        return false;
    }
    
    for (const key of aKeys) {
        if (!bKeys.includes(key)) {
            return false;
        }
        
        if (!isEqual(a[key], b[key])) {
            return false;
        }
    }
    
    return true;
}

/**
 * Deeply merges multiple objects
 */
export function merge<T extends Record<string, any>>(...objects: Partial<T>[]): T {
    const result = {} as T;
    
    for (const obj of objects) {
        if (!obj || typeof obj !== 'object') {
            continue;
        }
        
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const value = obj[key];
                
                if (value === null || value === undefined) {
                    (result as any)[key] = value;
                } else if (Array.isArray(value)) {
                    (result as any)[key] = [...value];
                } else if (typeof value === 'object' && value !== null &&
                          !((value as any) instanceof Date) && 
                          !((value as any) instanceof RegExp)) {
                    
                    // Recursively merge objects
                    const existing = (result as any)[key];
                    if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
                        (result as any)[key] = merge(existing, value);
                    } else {
                        (result as any)[key] = deepClone(value);
                    }
                } else {
                    (result as any)[key] = value;
                }
            }
        }
    }
    
    return result;
}

/**
 * Gets a nested property value safely
 */
export function get(obj: any, path: string | string[], defaultValue?: any): any {
    if (!obj || typeof obj !== 'object') {
        return defaultValue;
    }
    
    const keys = Array.isArray(path) ? path : path.split('.');
    let current = obj;
    
    for (const key of keys) {
        if (current == null || typeof current !== 'object') {
            return defaultValue;
        }
        
        current = current[key];
    }
    
    return current !== undefined ? current : defaultValue;
}

/**
 * Sets a nested property value
 */
export function set(obj: any, path: string | string[], value: any): any {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }
    
    const keys = Array.isArray(path) ? path : path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        
        if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
            current[key] = {};
        }
        
        current = current[key];
    }
    
    current[keys[keys.length - 1]] = value;
    return obj;
}

/**
 * Removes a nested property
 */
export function unset(obj: any, path: string | string[]): boolean {
    if (!obj || typeof obj !== 'object') {
        return false;
    }
    
    const keys = Array.isArray(path) ? path : path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        
        if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
            return false;
        }
        
        current = current[key];
    }
    
    const finalKey = keys[keys.length - 1];
    if (finalKey in current) {
        delete current[finalKey];
        return true;
    }
    
    return false;
}

/**
 * Checks if a nested property exists
 */
export function has(obj: any, path: string | string[]): boolean {
    if (!obj || typeof obj !== 'object') {
        return false;
    }
    
    const keys = Array.isArray(path) ? path : path.split('.');
    let current = obj;
    
    for (const key of keys) {
        if (current == null || typeof current !== 'object' || !(key in current)) {
            return false;
        }
        
        current = current[key];
    }
    
    return true;
}

/**
 * Picks specified properties from an object
 */
export function pick<T extends Record<string, any>, K extends keyof T>(
    obj: T, 
    keys: K[]
): Pick<T, K> {
    const result = {} as Pick<T, K>;
    
    for (const key of keys) {
        if (key in obj) {
            result[key] = obj[key];
        }
    }
    
    return result;
}

/**
 * Omits specified properties from an object
 */
export function omit<T extends Record<string, any>, K extends keyof T>(
    obj: T, 
    keys: K[]
): Omit<T, K> {
    const result = {} as Omit<T, K>;
    const omitSet = new Set(keys);
    
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key) && !omitSet.has(key as any)) {
            (result as any)[key] = obj[key];
        }
    }
    
    return result;
}

/**
 * Flattens a nested object into dot-notation keys
 */
export function flatten(obj: any, prefix = ''): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key];
            const newKey = prefix ? `${prefix}.${key}` : key;
            
            if (value && typeof value === 'object' && 
                !Array.isArray(value) && 
                !(value instanceof Date)) {
                
                Object.assign(result, flatten(value, newKey));
            } else {
                result[newKey] = value;
            }
        }
    }
    
    return result;
}

/**
 * Unflattens a dot-notation object back to nested structure
 */
export function unflatten(obj: Record<string, any>): any {
    const result = {};
    
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            set(result, key, obj[key]);
        }
    }
    
    return result;
}

/**
 * Transforms object values while preserving structure
 */
export function mapValues<T extends Record<string, any>, R>(
    obj: T, 
    fn: (value: T[keyof T], key: keyof T) => R
): Record<keyof T, R> {
    const result = {} as Record<keyof T, R>;
    
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            result[key] = fn(obj[key], key);
        }
    }
    
    return result;
}

/**
 * Filters object by predicate function
 */
export function pickBy<T extends Record<string, any>>(
    obj: T, 
    predicate: (value: T[keyof T], key: keyof T) => boolean
): Partial<T> {
    const result = {} as Partial<T>;
    
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            if (predicate(obj[key], key)) {
                result[key] = obj[key];
            }
        }
    }
    
    return result;
}

/**
 * Gets all paths in an object
 */
export function getPaths(obj: any, currentPath = ''): string[] {
    if (!obj || typeof obj !== 'object') {
        return [];
    }
    
    const paths: string[] = [];
    
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const path = currentPath ? `${currentPath}.${key}` : key;
            paths.push(path);
            
            const value = obj[key];
            if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
                paths.push(...getPaths(value, path));
            }
        }
    }
    
    return paths;
}