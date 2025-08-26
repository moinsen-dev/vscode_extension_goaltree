/**
 * Logging utilities for the goal tree extension
 */

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

export interface Logger {
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    setLevel(level: LogLevel): void;
    getLevel(): LogLevel;
}

/**
 * Console logger implementation
 */
class ConsoleLogger implements Logger {
    private level: LogLevel = LogLevel.INFO;
    private name: string;

    constructor(name: string) {
        this.name = name;
    }

    debug(message: string, ...args: any[]): void {
        if (this.level <= LogLevel.DEBUG) {
            console.debug(`[${this.name}] ${message}`, ...args);
        }
    }

    info(message: string, ...args: any[]): void {
        if (this.level <= LogLevel.INFO) {
            console.info(`[${this.name}] ${message}`, ...args);
        }
    }

    warn(message: string, ...args: any[]): void {
        if (this.level <= LogLevel.WARN) {
            console.warn(`[${this.name}] ${message}`, ...args);
        }
    }

    error(message: string, ...args: any[]): void {
        if (this.level <= LogLevel.ERROR) {
            console.error(`[${this.name}] ${message}`, ...args);
        }
    }

    setLevel(level: LogLevel): void {
        this.level = level;
    }

    getLevel(): LogLevel {
        return this.level;
    }
}

/**
 * Enhanced logger with file output support
 */
class EnhancedLogger implements Logger {
    private level: LogLevel = LogLevel.INFO;
    private name: string;
    private logs: LogEntry[] = [];
    private maxLogEntries: number = 1000;
    private enableConsole: boolean = true;

    constructor(name: string, options?: {
        maxLogEntries?: number;
        enableConsole?: boolean;
    }) {
        this.name = name;
        this.maxLogEntries = options?.maxLogEntries ?? 1000;
        this.enableConsole = options?.enableConsole ?? true;
    }

    debug(message: string, ...args: any[]): void {
        this.log(LogLevel.DEBUG, message, args);
    }

    info(message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, message, args);
    }

    warn(message: string, ...args: any[]): void {
        this.log(LogLevel.WARN, message, args);
    }

    error(message: string, ...args: any[]): void {
        this.log(LogLevel.ERROR, message, args);
    }

    private log(level: LogLevel, message: string, args: any[]): void {
        if (this.level <= level) {
            const entry: LogEntry = {
                timestamp: new Date(),
                level,
                logger: this.name,
                message,
                args: args.length > 0 ? args : undefined
            };

            // Add to memory buffer
            this.logs.push(entry);
            if (this.logs.length > this.maxLogEntries) {
                this.logs.shift();
            }

            // Console output
            if (this.enableConsole) {
                const levelName = LogLevel[level];
                const timestamp = entry.timestamp.toISOString();
                const prefix = `[${timestamp}] [${this.name}] [${levelName}]`;
                
                switch (level) {
                    case LogLevel.DEBUG:
                        console.debug(prefix, message, ...args);
                        break;
                    case LogLevel.INFO:
                        console.info(prefix, message, ...args);
                        break;
                    case LogLevel.WARN:
                        console.warn(prefix, message, ...args);
                        break;
                    case LogLevel.ERROR:
                        console.error(prefix, message, ...args);
                        break;
                }
            }
        }
    }

    setLevel(level: LogLevel): void {
        this.level = level;
    }

    getLevel(): LogLevel {
        return this.level;
    }

    /**
     * Gets recent log entries
     */
    getLogs(count?: number): LogEntry[] {
        return count ? this.logs.slice(-count) : [...this.logs];
    }

    /**
     * Clears the log buffer
     */
    clearLogs(): void {
        this.logs = [];
    }

    /**
     * Exports logs as JSON string
     */
    exportLogs(): string {
        return JSON.stringify({
            logger: this.name,
            exportedAt: new Date().toISOString(),
            entries: this.logs
        }, null, 2);
    }

    /**
     * Filters logs by level and time range
     */
    filterLogs(options?: {
        level?: LogLevel;
        since?: Date;
        until?: Date;
        messagePattern?: RegExp;
    }): LogEntry[] {
        let filtered = this.logs;

        if (options?.level !== undefined) {
            filtered = filtered.filter(entry => entry.level >= options.level!);
        }

        if (options?.since) {
            filtered = filtered.filter(entry => entry.timestamp >= options.since!);
        }

        if (options?.until) {
            filtered = filtered.filter(entry => entry.timestamp <= options.until!);
        }

        if (options?.messagePattern) {
            filtered = filtered.filter(entry => options.messagePattern!.test(entry.message));
        }

        return filtered;
    }
}

/**
 * Log entry interface
 */
interface LogEntry {
    timestamp: Date;
    level: LogLevel;
    logger: string;
    message: string;
    args?: any[];
}

/**
 * Logger factory and registry
 */
class LoggerRegistry {
    private loggers = new Map<string, Logger>();
    private defaultLogLevel = LogLevel.INFO;
    private loggerType: 'console' | 'enhanced' = 'console';

    /**
     * Creates or retrieves a logger instance
     */
    getLogger(name: string): Logger {
        if (!this.loggers.has(name)) {
            const logger = this.createLogger(name);
            logger.setLevel(this.defaultLogLevel);
            this.loggers.set(name, logger);
        }

        return this.loggers.get(name)!;
    }

    /**
     * Sets the default log level for new loggers
     */
    setDefaultLevel(level: LogLevel): void {
        this.defaultLogLevel = level;
        
        // Update existing loggers
        for (const logger of this.loggers.values()) {
            logger.setLevel(level);
        }
    }

    /**
     * Sets the logger type
     */
    setLoggerType(type: 'console' | 'enhanced'): void {
        this.loggerType = type;
        
        // Clear existing loggers to force recreation with new type
        this.loggers.clear();
    }

    /**
     * Gets all registered logger names
     */
    getLoggerNames(): string[] {
        return Array.from(this.loggers.keys());
    }

    /**
     * Clears all loggers
     */
    clearLoggers(): void {
        this.loggers.clear();
    }

    private createLogger(name: string): Logger {
        switch (this.loggerType) {
            case 'enhanced':
                return new EnhancedLogger(name);
            case 'console':
            default:
                return new ConsoleLogger(name);
        }
    }
}

// Global registry instance
const registry = new LoggerRegistry();

/**
 * Creates a logger instance
 */
export function createLogger(name: string): Logger {
    return registry.getLogger(name);
}

/**
 * Sets the global log level
 */
export function setGlobalLogLevel(level: LogLevel): void {
    registry.setDefaultLevel(level);
}

/**
 * Sets the logger type globally
 */
export function setLoggerType(type: 'console' | 'enhanced'): void {
    registry.setLoggerType(type);
}

/**
 * Performance logging helper
 */
export function logPerformance<T>(
    logger: Logger,
    operation: string,
    fn: () => T
): T {
    const start = performance.now();
    logger.debug(`Starting operation: ${operation}`);
    
    try {
        const result = fn();
        const duration = performance.now() - start;
        logger.debug(`Completed operation: ${operation} (${duration.toFixed(2)}ms)`);
        return result;
    } catch (error) {
        const duration = performance.now() - start;
        logger.error(`Failed operation: ${operation} (${duration.toFixed(2)}ms)`, error);
        throw error;
    }
}

/**
 * Async performance logging helper
 */
export async function logAsyncPerformance<T>(
    logger: Logger,
    operation: string,
    fn: () => Promise<T>
): Promise<T> {
    const start = performance.now();
    logger.debug(`Starting async operation: ${operation}`);
    
    try {
        const result = await fn();
        const duration = performance.now() - start;
        logger.debug(`Completed async operation: ${operation} (${duration.toFixed(2)}ms)`);
        return result;
    } catch (error) {
        const duration = performance.now() - start;
        logger.error(`Failed async operation: ${operation} (${duration.toFixed(2)}ms)`, error);
        throw error;
    }
}

/**
 * Creates a structured logging context
 */
export function createLoggingContext(baseLogger: Logger, context: Record<string, any>) {
    return {
        debug: (message: string, ...args: any[]) => {
            baseLogger.debug(`${message}`, { context, args });
        },
        info: (message: string, ...args: any[]) => {
            baseLogger.info(`${message}`, { context, args });
        },
        warn: (message: string, ...args: any[]) => {
            baseLogger.warn(`${message}`, { context, args });
        },
        error: (message: string, ...args: any[]) => {
            baseLogger.error(`${message}`, { context, args });
        }
    };
}