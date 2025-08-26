/**
 * Common utility types used throughout the extension
 */

/**
 * Generic result type for operations that can succeed or fail
 */
export interface Result<T, E = Error> {
  success: boolean;
  data?: T;
  error?: E;
  message?: string;
}

/**
 * Success result helper
 */
export interface SuccessResult<T> extends Result<T> {
  success: true;
  data: T;
}

/**
 * Error result helper
 */
export interface ErrorResult<E = Error> extends Result<never, E> {
  success: false;
  error: E;
  message: string;
}

/**
 * Optional with reason
 */
export type Optional<T> = T | undefined;

/**
 * Nullable type
 */
export type Nullable<T> = T | null;

/**
 * ID type (can be string or number)
 */
export type ID = string | number;

/**
 * Timestamp type
 */
export type Timestamp = Date | string | number;

/**
 * Generic callback function
 */
export type Callback<T = void> = (...args: any[]) => T;

/**
 * Async callback function  
 */
export type AsyncCallback<T = void> = (...args: any[]) => Promise<T>;

/**
 * Event listener function
 */
export type EventListener<T = any> = (event: T) => void | Promise<void>;

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Progress tracking
 */
export interface Progress {
  completed: number;
  total: number;
  percentage: number;
}