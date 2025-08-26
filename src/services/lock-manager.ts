import { WorkspaceManager } from './workspace-manager';

/**
 * Lock types for different operations
 */
export enum LockType {
    READ = 'READ',
    WRITE = 'WRITE',
    BACKUP = 'BACKUP'
}

/**
 * Lock information interface
 */
export interface LockInfo {
    id: string;
    type: LockType;
    workspaceId: string;
    timestamp: number;
    operation: string;
    timeout?: number;
}

/**
 * Lock acquisition result
 */
export interface LockResult {
    success: boolean;
    lockId?: string;
    error?: string;
    waitTime?: number;
}

/**
 * Lock manager options
 */
export interface LockOptions {
    timeout?: number; // milliseconds
    maxWaitTime?: number; // milliseconds
    retryInterval?: number; // milliseconds
}

/**
 * LockManager handles concurrent access protection for storage operations.
 * Implements a simple in-memory locking mechanism with timeout support.
 * Note: This provides protection within a single VS Code instance. For true 
 * multi-instance protection, file-based locking would be needed.
 */
export class LockManager {
    private static locks = new Map<string, LockInfo>();
    private static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
    private static readonly DEFAULT_MAX_WAIT = 60000; // 60 seconds  
    private static readonly DEFAULT_RETRY_INTERVAL = 100; // 100ms
    private static lockIdCounter = 0;

    /**
     * Acquires a lock for a storage operation
     * @param type The type of lock to acquire
     * @param operation Description of the operation for debugging
     * @param options Lock acquisition options
     * @returns Promise resolving to lock acquisition result
     */
    static async acquireLock(
        type: LockType,
        operation: string,
        options: LockOptions = {}
    ): Promise<LockResult> {
        const workspaceId = WorkspaceManager.getWorkspaceId();
        if (!workspaceId) {
            return {
                success: false,
                error: 'No workspace available for locking'
            };
        }

        const {
            timeout = this.DEFAULT_TIMEOUT,
            maxWaitTime = this.DEFAULT_MAX_WAIT,
            retryInterval = this.DEFAULT_RETRY_INTERVAL
        } = options;

        const startTime = Date.now();
        const lockKey = `${workspaceId}:${type}`;
        
        while (Date.now() - startTime < maxWaitTime) {
            // Check if we can acquire the lock
            const canAcquire = this.canAcquireLock(lockKey, type);
            
            if (canAcquire) {
                const lockId = `lock_${++this.lockIdCounter}_${Date.now()}`;
                const lockInfo: LockInfo = {
                    id: lockId,
                    type,
                    workspaceId,
                    timestamp: Date.now(),
                    operation,
                    timeout
                };

                this.locks.set(lockKey, lockInfo);
                
                // Set up automatic timeout cleanup
                if (timeout > 0) {
                    setTimeout(() => {
                        this.releaseLock(lockId);
                    }, timeout);
                }

                return {
                    success: true,
                    lockId,
                    waitTime: Date.now() - startTime
                };
            }

            // Clean up expired locks before retrying
            this.cleanupExpiredLocks();

            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, retryInterval));
        }

        return {
            success: false,
            error: `Failed to acquire ${type} lock within ${maxWaitTime}ms`,
            waitTime: Date.now() - startTime
        };
    }

    /**
     * Releases a lock by its ID
     * @param lockId The ID of the lock to release
     * @returns True if lock was found and released
     */
    static releaseLock(lockId: string): boolean {
        for (const [key, lock] of this.locks.entries()) {
            if (lock.id === lockId) {
                this.locks.delete(key);
                return true;
            }
        }
        return false;
    }

    /**
     * Releases all locks for a specific workspace
     * @param workspaceId The workspace ID to release locks for
     * @returns Number of locks released
     */
    static releaseWorkspaceLocks(workspaceId: string): number {
        let released = 0;
        for (const [key, lock] of this.locks.entries()) {
            if (lock.workspaceId === workspaceId) {
                this.locks.delete(key);
                released++;
            }
        }
        return released;
    }

    /**
     * Gets information about current locks
     * @param workspaceId Optional workspace ID to filter by
     * @returns Array of current lock information
     */
    static getLockInfo(workspaceId?: string): LockInfo[] {
        const locks: LockInfo[] = [];
        for (const lock of this.locks.values()) {
            if (!workspaceId || lock.workspaceId === workspaceId) {
                locks.push({ ...lock });
            }
        }
        return locks;
    }

    /**
     * Checks if a lock is currently held for a workspace
     * @param type Optional lock type to check for
     * @param workspaceId Optional workspace ID (defaults to current workspace)
     * @returns True if lock is held
     */
    static isLocked(type?: LockType, workspaceId?: string): boolean {
        const targetWorkspaceId = workspaceId || WorkspaceManager.getWorkspaceId();
        if (!targetWorkspaceId) {
            return false;
        }

        for (const lock of this.locks.values()) {
            if (lock.workspaceId === targetWorkspaceId) {
                if (!type || lock.type === type) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Waits for all locks of a specific type to be released
     * @param type The lock type to wait for
     * @param maxWaitTime Maximum time to wait in milliseconds
     * @param workspaceId Optional workspace ID (defaults to current workspace)
     * @returns Promise resolving to true if locks were released, false if timeout
     */
    static async waitForLockRelease(
        type: LockType,
        maxWaitTime: number = this.DEFAULT_MAX_WAIT,
        workspaceId?: string
    ): Promise<boolean> {
        const targetWorkspaceId = workspaceId || WorkspaceManager.getWorkspaceId();
        if (!targetWorkspaceId) {
            return true; // No workspace, no locks to wait for
        }

        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitTime) {
            if (!this.isLocked(type, targetWorkspaceId)) {
                return true;
            }

            // Clean up expired locks
            this.cleanupExpiredLocks();

            // Wait before checking again
            await new Promise(resolve => setTimeout(resolve, this.DEFAULT_RETRY_INTERVAL));
        }

        return false;
    }

    /**
     * Executes an operation with automatic lock management
     * @param type The type of lock to acquire
     * @param operation Description of the operation
     * @param fn The function to execute while holding the lock
     * @param options Lock options
     * @returns Promise resolving to the function result
     */
    static async withLock<T>(
        type: LockType,
        operation: string,
        fn: () => Promise<T>,
        options: LockOptions = {}
    ): Promise<T> {
        const lockResult = await this.acquireLock(type, operation, options);
        
        if (!lockResult.success) {
            throw new Error(`Failed to acquire ${type} lock: ${lockResult.error}`);
        }

        try {
            return await fn();
        } finally {
            if (lockResult.lockId) {
                this.releaseLock(lockResult.lockId);
            }
        }
    }

    /**
     * Cleans up expired locks
     */
    static cleanupExpiredLocks(): void {
        const now = Date.now();
        const expiredKeys: string[] = [];

        for (const [key, lock] of this.locks.entries()) {
            if (lock.timeout && (now - lock.timestamp) > lock.timeout) {
                expiredKeys.push(key);
            }
        }

        for (const key of expiredKeys) {
            this.locks.delete(key);
        }
    }

    /**
     * Clears all locks (for testing/cleanup)
     */
    static clearAllLocks(): void {
        this.locks.clear();
    }

    /**
     * Gets lock statistics
     */
    static getStatistics() {
        return {
            totalLocks: this.locks.size,
            locksByType: this.getLockCountByType(),
            locksByWorkspace: this.getLockCountByWorkspace(),
            oldestLock: this.getOldestLockAge()
        };
    }

    /**
     * Determines if a lock can be acquired based on existing locks
     * @param lockKey The lock key to check
     * @param type The type of lock being requested
     * @returns True if the lock can be acquired
     */
    private static canAcquireLock(lockKey: string, type: LockType): boolean {
        const existingLock = this.locks.get(lockKey);
        
        // No existing lock - can acquire
        if (!existingLock) {
            return true;
        }

        // Read locks can coexist with other read locks
        if (type === LockType.READ && existingLock.type === LockType.READ) {
            return true;
        }

        // Write and backup locks are exclusive
        return false;
    }

    /**
     * Gets count of locks by type
     */
    private static getLockCountByType(): Record<LockType, number> {
        const counts: Record<LockType, number> = {
            [LockType.READ]: 0,
            [LockType.WRITE]: 0,
            [LockType.BACKUP]: 0
        };

        for (const lock of this.locks.values()) {
            counts[lock.type]++;
        }

        return counts;
    }

    /**
     * Gets count of locks by workspace
     */
    private static getLockCountByWorkspace(): Record<string, number> {
        const counts: Record<string, number> = {};

        for (const lock of this.locks.values()) {
            counts[lock.workspaceId] = (counts[lock.workspaceId] || 0) + 1;
        }

        return counts;
    }

    /**
     * Gets the age of the oldest lock in milliseconds
     */
    private static getOldestLockAge(): number {
        if (this.locks.size === 0) {
            return 0;
        }

        const now = Date.now();
        let oldestAge = 0;

        for (const lock of this.locks.values()) {
            const age = now - lock.timestamp;
            if (age > oldestAge) {
                oldestAge = age;
            }
        }

        return oldestAge;
    }
}