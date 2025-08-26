/**
 * Utility functions for the goal tree extension
 * 
 * This module provides common utility functions used throughout the application:
 * - ID generation
 * - Date formatting
 * - String manipulation
 * - Validation helpers
 * - Performance utilities
 */

export { generateId, validateId } from './idGenerator';
export { formatDate, parseDate, getRelativeTime, formatDuration } from './dateUtils';
export { validateGoal, validateTask, sanitizeInput, truncateText } from './validation';
export { debounce, throttle, memoize } from './performance';
export { deepClone, isEqual, merge } from './objects';
export { createLogger } from './logger';
export type { Logger, LogLevel } from './logger';