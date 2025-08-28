/**
 * ID generation utilities for creating unique identifiers
 */

/**
 * Generates a unique ID using timestamp and random components
 */
export function generateId(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${randomPart}`;
}

/**
 * Generates a UUID v4 (more robust but longer)
 */
export function generateUUID(): string {
    // Simple UUID v4 implementation
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Generates a short ID (8 characters) suitable for display
 */
export function generateShortId(): string {
    return Math.random().toString(36).substring(2, 10);
}

/**
 * Validates if a string is a valid ID format
 */
export function validateId(id: string): boolean {
    if (!id || typeof id !== 'string') {
        return false;
    }
    
    // Check for basic ID format (timestamp-random)
    if (/^[a-z0-9]+-[a-z0-9]+$/i.test(id)) {
        return true;
    }
    
    // Check for UUID format
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        return true;
    }
    
    // Check for short ID format
    if (/^[a-z0-9]{6,10}$/i.test(id)) {
        return true;
    }
    
    return false;
}

/**
 * Creates a deterministic ID based on input content (for testing/consistency)
 */
export function createDeterministicId(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(36);
}

/**
 * Checks if an ID is likely a timestamp-based ID
 */
export function isTimestampId(id: string): boolean {
    const parts = id.split('-');
    if (parts.length < 2) return false;
    
    // Try to parse the first part as a base36 timestamp
    const timestamp = parseInt(parts[0], 36);
    
    // Should be a reasonable timestamp (after 2020, before far future)
    const minTimestamp = new Date('2020-01-01').getTime();
    const maxTimestamp = Date.now() + (10 * 365 * 24 * 60 * 60 * 1000); // 10 years from now
    
    return timestamp >= minTimestamp && timestamp <= maxTimestamp;
}

/**
 * Extracts timestamp from a timestamp-based ID
 */
export function getTimestampFromId(id: string): Date | null {
    if (!isTimestampId(id)) return null;
    
    const parts = id.split('-');
    const timestamp = parseInt(parts[0], 36);
    
    return new Date(timestamp);
}

/**
 * Generates a human-readable ID with optional prefix
 */
export function generateReadableId(prefix?: string): string {
    const adjectives = ['quick', 'bright', 'calm', 'brave', 'wise', 'kind', 'swift', 'bold'];
    const nouns = ['goal', 'task', 'plan', 'step', 'move', 'path', 'way', 'aim'];
    
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const number = Math.floor(Math.random() * 1000);
    
    const readable = `${adjective}-${noun}-${number}`;
    
    return prefix ? `${prefix}-${readable}` : readable;
}

/**
 * ID pool for managing unique IDs within a scope
 */
export class IdPool {
    private usedIds = new Set<string>();
    private prefix?: string;
    
    constructor(prefix?: string) {
        this.prefix = prefix;
    }
    
    /**
     * Generates a unique ID within this pool
     */
    generate(): string {
        let id: string;
        let attempts = 0;
        const maxAttempts = 1000;
        
        do {
            id = this.prefix ? `${this.prefix}-${generateId()}` : generateId();
            attempts++;
            
            if (attempts >= maxAttempts) {
                throw new Error('Failed to generate unique ID after maximum attempts');
            }
        } while (this.usedIds.has(id));
        
        this.usedIds.add(id);
        return id;
    }
    
    /**
     * Reserves an ID in the pool
     */
    reserve(id: string): boolean {
        if (this.usedIds.has(id)) {
            return false;
        }
        
        this.usedIds.add(id);
        return true;
    }
    
    /**
     * Releases an ID back to the pool
     */
    release(id: string): void {
        this.usedIds.delete(id);
    }
    
    /**
     * Checks if an ID is in use
     */
    isUsed(id: string): boolean {
        return this.usedIds.has(id);
    }
    
    /**
     * Gets all used IDs
     */
    getUsedIds(): string[] {
        return Array.from(this.usedIds);
    }
    
    /**
     * Clears all used IDs
     */
    clear(): void {
        this.usedIds.clear();
    }
    
    /**
     * Gets the count of used IDs
     */
    size(): number {
        return this.usedIds.size;
    }
}