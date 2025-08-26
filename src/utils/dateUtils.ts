/**
 * Date and time utility functions
 */

/**
 * Formats a date for display in the UI
 */
export function formatDate(date: Date | string, options?: {
    includeTime?: boolean;
    relative?: boolean;
    format?: 'short' | 'medium' | 'long' | 'full';
}): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    if (isNaN(dateObj.getTime())) {
        return 'Invalid Date';
    }
    
    const opts = {
        includeTime: false,
        relative: false,
        format: 'medium' as const,
        ...options
    };
    
    if (opts.relative) {
        return getRelativeTime(dateObj);
    }
    
    const formatOptions: Intl.DateTimeFormatOptions = {};
    
    switch (opts.format) {
        case 'short':
            formatOptions.dateStyle = 'short';
            break;
        case 'medium':
            formatOptions.dateStyle = 'medium';
            break;
        case 'long':
            formatOptions.dateStyle = 'long';
            break;
        case 'full':
            formatOptions.dateStyle = 'full';
            break;
    }
    
    if (opts.includeTime) {
        formatOptions.timeStyle = 'short';
    }
    
    return dateObj.toLocaleDateString(undefined, formatOptions);
}

/**
 * Parses a date string into a Date object with validation
 */
export function parseDate(dateString: string): Date | null {
    if (!dateString) return null;
    
    const date = new Date(dateString);
    
    if (isNaN(date.getTime())) {
        // Try alternative parsing formats
        const formats = [
            /^\d{4}-\d{2}-\d{2}$/,  // YYYY-MM-DD
            /^\d{2}\/\d{2}\/\d{4}$/,  // MM/DD/YYYY
            /^\d{2}-\d{2}-\d{4}$/   // MM-DD-YYYY
        ];
        
        for (const format of formats) {
            if (format.test(dateString)) {
                const parsed = new Date(dateString);
                if (!isNaN(parsed.getTime())) {
                    return parsed;
                }
            }
        }
        
        return null;
    }
    
    return date;
}

/**
 * Gets relative time string (e.g., "2 hours ago", "in 3 days")
 */
export function getRelativeTime(date: Date | string): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    if (isNaN(dateObj.getTime())) {
        return 'Invalid Date';
    }
    
    const now = new Date();
    const diffMs = now.getTime() - dateObj.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);
    
    const future = diffMs < 0;
    const abs = Math.abs;
    
    if (abs(diffSecs) < 60) {
        return future ? 'in a few seconds' : 'a few seconds ago';
    } else if (abs(diffMins) < 60) {
        const mins = abs(diffMins);
        return future ? `in ${mins} minute${mins !== 1 ? 's' : ''}` : `${mins} minute${mins !== 1 ? 's' : ''} ago`;
    } else if (abs(diffHours) < 24) {
        const hours = abs(diffHours);
        return future ? `in ${hours} hour${hours !== 1 ? 's' : ''}` : `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else if (abs(diffDays) < 7) {
        const days = abs(diffDays);
        return future ? `in ${days} day${days !== 1 ? 's' : ''}` : `${days} day${days !== 1 ? 's' : ''} ago`;
    } else if (abs(diffWeeks) < 4) {
        const weeks = abs(diffWeeks);
        return future ? `in ${weeks} week${weeks !== 1 ? 's' : ''}` : `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
    } else if (abs(diffMonths) < 12) {
        const months = abs(diffMonths);
        return future ? `in ${months} month${months !== 1 ? 's' : ''}` : `${months} month${months !== 1 ? 's' : ''} ago`;
    } else {
        const years = abs(diffYears);
        return future ? `in ${years} year${years !== 1 ? 's' : ''}` : `${years} year${years !== 1 ? 's' : ''} ago`;
    }
}

/**
 * Formats a duration in milliseconds to human-readable string
 */
export function formatDuration(durationMs: number, options?: {
    precision?: 'seconds' | 'minutes' | 'hours' | 'days';
    showSeconds?: boolean;
    abbreviated?: boolean;
}): string {
    const opts = {
        precision: 'minutes' as const,
        showSeconds: true,
        abbreviated: false,
        ...options
    };
    
    if (durationMs < 0) {
        return '0 seconds';
    }
    
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    const parts: string[] = [];
    
    if (days > 0 && opts.precision !== 'hours' && opts.precision !== 'minutes' && opts.precision !== 'seconds') {
        parts.push(`${days} ${opts.abbreviated ? 'd' : `day${days !== 1 ? 's' : ''}`}`);
    }
    
    if (hours % 24 > 0 && opts.precision !== 'minutes' && opts.precision !== 'seconds') {
        parts.push(`${hours % 24} ${opts.abbreviated ? 'h' : `hour${hours % 24 !== 1 ? 's' : ''}`}`);
    }
    
    if (minutes % 60 > 0 && opts.precision !== 'seconds') {
        parts.push(`${minutes % 60} ${opts.abbreviated ? 'm' : `minute${minutes % 60 !== 1 ? 's' : ''}`}`);
    }
    
    if (opts.showSeconds && (seconds % 60 > 0 || parts.length === 0)) {
        parts.push(`${seconds % 60} ${opts.abbreviated ? 's' : `second${seconds % 60 !== 1 ? 's' : ''}`}`);
    }
    
    return parts.join(' ') || '0 seconds';
}

/**
 * Checks if a date is today
 */
export function isToday(date: Date | string): boolean {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const today = new Date();
    
    return dateObj.getDate() === today.getDate() &&
           dateObj.getMonth() === today.getMonth() &&
           dateObj.getFullYear() === today.getFullYear();
}

/**
 * Checks if a date is this week
 */
export function isThisWeek(date: Date | string): boolean {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const today = new Date();
    
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    return dateObj >= startOfWeek && dateObj <= endOfWeek;
}

/**
 * Gets the start of the day for a given date
 */
export function getStartOfDay(date: Date | string): Date {
    const dateObj = typeof date === 'string' ? new Date(date) : new Date(date);
    dateObj.setHours(0, 0, 0, 0);
    return dateObj;
}

/**
 * Gets the end of the day for a given date
 */
export function getEndOfDay(date: Date | string): Date {
    const dateObj = typeof date === 'string' ? new Date(date) : new Date(date);
    dateObj.setHours(23, 59, 59, 999);
    return dateObj;
}

/**
 * Adds days to a date
 */
export function addDays(date: Date | string, days: number): Date {
    const dateObj = typeof date === 'string' ? new Date(date) : new Date(date);
    dateObj.setDate(dateObj.getDate() + days);
    return dateObj;
}

/**
 * Subtracts days from a date
 */
export function subtractDays(date: Date | string, days: number): Date {
    return addDays(date, -days);
}

/**
 * Gets the difference between two dates in days
 */
export function getDaysDifference(date1: Date | string, date2: Date | string): number {
    const d1 = typeof date1 === 'string' ? new Date(date1) : date1;
    const d2 = typeof date2 === 'string' ? new Date(date2) : date2;
    
    const diffTime = d2.getTime() - d1.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Formats a date range
 */
export function formatDateRange(startDate: Date | string, endDate: Date | string): string {
    const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
    const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return 'Invalid Date Range';
    }
    
    const sameYear = start.getFullYear() === end.getFullYear();
    const sameMonth = sameYear && start.getMonth() === end.getMonth();
    const sameDay = sameMonth && start.getDate() === end.getDate();
    
    if (sameDay) {
        return formatDate(start, { format: 'medium' });
    } else if (sameMonth) {
        return `${start.getDate()} - ${formatDate(end, { format: 'medium' })}`;
    } else if (sameYear) {
        return `${formatDate(start, { format: 'short' })} - ${formatDate(end, { format: 'short' })}`;
    } else {
        return `${formatDate(start, { format: 'medium' })} - ${formatDate(end, { format: 'medium' })}`;
    }
}

/**
 * Creates a date from components with validation
 */
export function createDate(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Date | null {
    // month is 0-based in JavaScript Date
    const date = new Date(year, month - 1, day, hour, minute, second);
    
    // Verify the date components match what was requested (handles invalid dates like Feb 31)
    if (date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day) {
        return null;
    }
    
    return date;
}