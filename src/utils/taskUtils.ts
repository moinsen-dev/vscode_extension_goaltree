/**
 * Task Utilities - Issue #7 Stream C Implementation
 * 
 * Comprehensive task utility functions providing filtering, sorting, search functionality,
 * task templates, statistics, analytics, and performance optimization for large task collections.
 * 
 * This module provides:
 * - Advanced task filtering by status, priority, date, text search
 * - Task sorting utilities by order, priority, date, status with custom comparators
 * - Powerful task search functionality with text matching and regex support
 * - Task template system for quick creation and standardization
 * - Task statistics and analytics utilities for insights
 * - Performance helpers for large task collections with pagination and indexing
 * - Task transformation and data manipulation utilities
 */

import {
    Task,
    TaskStatus,
    TaskStatusType,
    TaskUtils as BaseTaskUtils,
    Goal,
    CreateTaskParams
} from '../types';

/**
 * Task filter criteria interface
 */
export interface TaskFilterCriteria {
    /** Filter by task status */
    status?: TaskStatusType | TaskStatusType[];
    
    /** Filter by goal ID */
    goalId?: string | string[];
    
    /** Filter by creation date range */
    createdDateRange?: {
        start?: Date;
        end?: Date;
    };
    
    /** Filter by last updated date range */
    updatedDateRange?: {
        start?: Date;
        end?: Date;
    };
    
    /** Filter by completion date range */
    completedDateRange?: {
        start?: Date;
        end?: Date;
    };
    
    /** Filter by text search in title and description */
    textSearch?: {
        query: string;
        caseSensitive?: boolean;
        useRegex?: boolean;
        searchFields?: ('title' | 'description')[];
    };
    
    /** Filter by task order range */
    orderRange?: {
        min?: number;
        max?: number;
    };
    
    /** Filter by task age in days */
    ageInDays?: {
        min?: number;
        max?: number;
    };
    
    /** Custom filter function */
    customFilter?: (task: Task) => boolean;
}

/**
 * Task sorting configuration
 */
export interface TaskSortConfig {
    /** Primary sort field */
    field: TaskSortField;
    
    /** Sort direction */
    direction: 'asc' | 'desc';
    
    /** Secondary sort fields for tie-breaking */
    secondaryFields?: Array<{
        field: TaskSortField;
        direction: 'asc' | 'desc';
    }>;
    
    /** Custom comparator function */
    customComparator?: (a: Task, b: Task) => number;
}

/**
 * Available task sort fields
 */
export enum TaskSortField {
    ORDER = 'order',
    TITLE = 'title',
    STATUS = 'status',
    CREATED_DATE = 'createdDate',
    UPDATED_DATE = 'updatedDate',
    COMPLETED_DATE = 'completedDate',
    GOAL_ID = 'goalId',
    AGE = 'age'
}

/**
 * Task search configuration
 */
export interface TaskSearchConfig {
    /** Search query */
    query: string;
    
    /** Fields to search in */
    searchFields: ('title' | 'description')[];
    
    /** Whether search is case sensitive */
    caseSensitive: boolean;
    
    /** Whether to use regex matching */
    useRegex: boolean;
    
    /** Whether to match whole words only */
    wholeWords: boolean;
    
    /** Fuzzy search tolerance (0-1, where 1 is exact match) */
    fuzzyTolerance?: number;
    
    /** Highlight matched text in results */
    highlightMatches: boolean;
}

/**
 * Task search result with highlighting
 */
export interface TaskSearchResult {
    /** The matching task */
    task: Task;
    
    /** Match score (0-1, higher is better) */
    score: number;
    
    /** Fields that matched */
    matchingFields: string[];
    
    /** Highlighted text with matches */
    highlights?: {
        title?: string;
        description?: string;
    };
}

/**
 * Task template interface
 */
export interface TaskTemplate {
    /** Template unique identifier */
    id: string;
    
    /** Template name */
    name: string;
    
    /** Template description */
    description: string;
    
    /** Template category */
    category: string;
    
    /** Template task properties */
    template: {
        title: string;
        description?: string;
        defaultStatus?: TaskStatusType;
    };
    
    /** Template variables that can be substituted */
    variables?: Array<{
        name: string;
        description: string;
        defaultValue?: string;
        required: boolean;
    }>;
    
    /** Template metadata */
    metadata?: {
        tags?: string[];
        priority?: number;
        estimatedTimeMinutes?: number;
    };
    
    /** When template was created */
    createdAt: Date;
    
    /** How many times template was used */
    usageCount: number;
}

/**
 * Task statistics interface
 */
export interface TaskStatistics {
    /** Total number of tasks */
    totalTasks: number;
    
    /** Tasks by status breakdown */
    statusBreakdown: Record<TaskStatusType, number>;
    
    /** Tasks by goal breakdown */
    goalBreakdown: Record<string, number>;
    
    /** Completion metrics */
    completionMetrics: {
        /** Overall completion percentage */
        overallCompletion: number;
        
        /** Average completion time in days */
        averageCompletionTime: number;
        
        /** Completion rate per day */
        completionRate: number;
        
        /** Completed tasks in last 7 days */
        recentCompletions: number;
    };
    
    /** Age distribution */
    ageDistribution: {
        new: number; // < 1 day
        recent: number; // 1-7 days
        medium: number; // 7-30 days
        old: number; // > 30 days
    };
    
    /** Performance metrics */
    performance: {
        /** Tasks created per day (last 30 days) */
        creationRate: number;
        
        /** Tasks completed per day (last 30 days) */
        completionRateDaily: number;
        
        /** Average tasks per goal */
        averageTasksPerGoal: number;
    };
}

/**
 * Task analytics interface for insights
 */
export interface TaskAnalytics {
    /** Task trends over time */
    trends: {
        /** Creation trend (last 30 days) */
        creationTrend: Array<{ date: Date; count: number }>;
        
        /** Completion trend (last 30 days) */
        completionTrend: Array<{ date: Date; count: number }>;
        
        /** Status transition patterns */
        statusTransitions: Record<string, number>; // "todo->in-progress": count
    };
    
    /** Task patterns */
    patterns: {
        /** Most common task titles/patterns */
        commonTitles: Array<{ pattern: string; count: number }>;
        
        /** Peak activity hours */
        peakHours: Array<{ hour: number; activity: number }>;
        
        /** Average task completion time by goal */
        completionTimesByGoal: Record<string, number>;
    };
    
    /** Productivity insights */
    productivity: {
        /** Most productive days of week */
        productiveDays: Array<{ day: string; completions: number }>;
        
        /** Goal completion efficiency */
        goalEfficiency: Record<string, {
            averageTaskTime: number;
            completionRate: number;
            efficiency: number;
        }>;
    };
}

/**
 * Performance configuration for large task collections
 */
export interface TaskPerformanceConfig {
    /** Enable indexing for faster searches */
    enableIndexing: boolean;
    
    /** Enable result caching */
    enableCaching: boolean;
    
    /** Cache TTL in milliseconds */
    cacheTtl: number;
    
    /** Pagination size for large results */
    paginationSize: number;
    
    /** Maximum items to process before warning */
    performanceWarningThreshold: number;
    
    /** Enable lazy loading for results */
    enableLazyLoading: boolean;
}

/**
 * Core task utilities class
 */
export class TaskUtils {
    private static indexCache = new Map<string, Map<string, Task[]>>();
    private static searchCache = new Map<string, TaskSearchResult[]>();
    private static statisticsCache = new Map<string, { stats: TaskStatistics; timestamp: Date }>();
    
    private static readonly DEFAULT_PERFORMANCE_CONFIG: TaskPerformanceConfig = {
        enableIndexing: true,
        enableCaching: true,
        cacheTtl: 300000, // 5 minutes
        paginationSize: 100,
        performanceWarningThreshold: 1000,
        enableLazyLoading: true
    };

    // ===========================================
    // Filtering Methods
    // ===========================================

    /**
     * Filter tasks based on comprehensive criteria
     */
    static filterTasks(
        tasks: Task[],
        criteria: TaskFilterCriteria,
        performanceConfig: Partial<TaskPerformanceConfig> = {}
    ): Task[] {
        const config = { ...this.DEFAULT_PERFORMANCE_CONFIG, ...performanceConfig };
        
        // Performance warning for large task sets
        if (tasks.length > config.performanceWarningThreshold) {
            console.warn(`TaskUtils: Filtering ${tasks.length} tasks may impact performance. Consider using pagination.`);
        }

        return tasks.filter(task => this.matchesFilterCriteria(task, criteria));
    }

    /**
     * Advanced filtering with pagination support
     */
    static filterTasksPaginated(
        tasks: Task[],
        criteria: TaskFilterCriteria,
        page: number = 1,
        pageSize: number = 100
    ): {
        tasks: Task[];
        totalMatches: number;
        totalPages: number;
        currentPage: number;
        hasMore: boolean;
    } {
        const filteredTasks = this.filterTasks(tasks, criteria);
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedTasks = filteredTasks.slice(startIndex, endIndex);
        const totalPages = Math.ceil(filteredTasks.length / pageSize);

        return {
            tasks: paginatedTasks,
            totalMatches: filteredTasks.length,
            totalPages,
            currentPage: page,
            hasMore: page < totalPages
        };
    }

    private static matchesFilterCriteria(task: Task, criteria: TaskFilterCriteria): boolean {
        // Status filter
        if (criteria.status) {
            const statuses = Array.isArray(criteria.status) ? criteria.status : [criteria.status];
            if (!statuses.includes(task.status)) {
                return false;
            }
        }

        // Goal ID filter
        if (criteria.goalId) {
            const goalIds = Array.isArray(criteria.goalId) ? criteria.goalId : [criteria.goalId];
            if (!goalIds.includes(task.goalId)) {
                return false;
            }
        }

        // Date range filters
        if (!this.matchesDateCriteria(task, criteria)) {
            return false;
        }

        // Text search filter
        if (criteria.textSearch && !this.matchesTextSearch(task, criteria.textSearch)) {
            return false;
        }

        // Order range filter
        if (criteria.orderRange) {
            if (criteria.orderRange.min !== undefined && task.order < criteria.orderRange.min) {
                return false;
            }
            if (criteria.orderRange.max !== undefined && task.order > criteria.orderRange.max) {
                return false;
            }
        }

        // Age filter
        if (criteria.ageInDays && !this.matchesAgeCriteria(task, criteria.ageInDays)) {
            return false;
        }

        // Custom filter
        if (criteria.customFilter && !criteria.customFilter(task)) {
            return false;
        }

        return true;
    }

    private static matchesDateCriteria(task: Task, criteria: TaskFilterCriteria): boolean {
        // Created date range
        if (criteria.createdDateRange) {
            const createdDate = task.createdAt instanceof Date ? task.createdAt : new Date(task.createdAt);
            if (!this.isDateInRange(createdDate, criteria.createdDateRange.start, criteria.createdDateRange.end)) {
                return false;
            }
        }

        // Updated date range
        if (criteria.updatedDateRange && task.updatedAt) {
            const updatedDate = task.updatedAt instanceof Date ? task.updatedAt : new Date(task.updatedAt);
            if (!this.isDateInRange(updatedDate, criteria.updatedDateRange.start, criteria.updatedDateRange.end)) {
                return false;
            }
        }

        // Completed date range
        if (criteria.completedDateRange && task.completedAt) {
            const completedDate = task.completedAt instanceof Date ? task.completedAt : new Date(task.completedAt);
            if (!this.isDateInRange(completedDate, criteria.completedDateRange.start, criteria.completedDateRange.end)) {
                return false;
            }
        }

        return true;
    }

    private static isDateInRange(date: Date, start?: Date, end?: Date): boolean {
        if (start && date < start) return false;
        if (end && date > end) return false;
        return true;
    }

    private static matchesTextSearch(task: Task, textSearch: TaskFilterCriteria['textSearch']): boolean {
        if (!textSearch) return true;

        const { query, caseSensitive = false, useRegex = false, searchFields = ['title', 'description'] } = textSearch;
        
        const searchTexts: string[] = [];
        if (searchFields.includes('title')) {
            searchTexts.push(task.title);
        }
        if (searchFields.includes('description') && task.description) {
            searchTexts.push(task.description);
        }

        const searchContent = searchTexts.join(' ');
        const searchQuery = caseSensitive ? query : query.toLowerCase();
        const searchIn = caseSensitive ? searchContent : searchContent.toLowerCase();

        if (useRegex) {
            try {
                const flags = caseSensitive ? 'g' : 'gi';
                const regex = new RegExp(searchQuery, flags);
                return regex.test(searchIn);
            } catch {
                // Fallback to simple text search if regex is invalid
                return searchIn.includes(searchQuery);
            }
        }

        return searchIn.includes(searchQuery);
    }

    private static matchesAgeCriteria(task: Task, ageRange: { min?: number; max?: number }): boolean {
        const age = BaseTaskUtils.getTaskAgeInDays(task);
        if (ageRange.min !== undefined && age < ageRange.min) return false;
        if (ageRange.max !== undefined && age > ageRange.max) return false;
        return true;
    }

    // ===========================================
    // Sorting Methods
    // ===========================================

    /**
     * Sort tasks using comprehensive configuration
     */
    static sortTasks(tasks: Task[], config: TaskSortConfig): Task[] {
        return [...tasks].sort((a, b) => {
            // Use custom comparator if provided
            if (config.customComparator) {
                return config.customComparator(a, b);
            }

            // Primary sort
            const primaryResult = this.compareTasksByField(a, b, config.field, config.direction);
            if (primaryResult !== 0) {
                return primaryResult;
            }

            // Secondary sorts for tie-breaking
            if (config.secondaryFields) {
                for (const secondary of config.secondaryFields) {
                    const secondaryResult = this.compareTasksByField(a, b, secondary.field, secondary.direction);
                    if (secondaryResult !== 0) {
                        return secondaryResult;
                    }
                }
            }

            return 0;
        });
    }

    /**
     * Multi-level sorting with priority
     */
    static sortTasksMultiLevel(
        tasks: Task[],
        sortConfigs: Array<{ field: TaskSortField; direction: 'asc' | 'desc'; priority: number }>
    ): Task[] {
        const sortedConfigs = sortConfigs.sort((a, b) => b.priority - a.priority);
        
        return [...tasks].sort((a, b) => {
            for (const config of sortedConfigs) {
                const result = this.compareTasksByField(a, b, config.field, config.direction);
                if (result !== 0) {
                    return result;
                }
            }
            return 0;
        });
    }

    private static compareTasksByField(
        a: Task,
        b: Task,
        field: TaskSortField,
        direction: 'asc' | 'desc'
    ): number {
        let result = 0;

        switch (field) {
            case TaskSortField.ORDER:
                result = a.order - b.order;
                break;
                
            case TaskSortField.TITLE:
                result = a.title.localeCompare(b.title);
                break;
                
            case TaskSortField.STATUS:
                const statusOrder = { [TaskStatus.TODO]: 0, [TaskStatus.IN_PROGRESS]: 1, [TaskStatus.DONE]: 2 };
                result = statusOrder[a.status] - statusOrder[b.status];
                break;
                
            case TaskSortField.CREATED_DATE:
                const aCreated = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
                const bCreated = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
                result = aCreated.getTime() - bCreated.getTime();
                break;
                
            case TaskSortField.UPDATED_DATE:
                const aUpdated = a.updatedAt ? (a.updatedAt instanceof Date ? a.updatedAt : new Date(a.updatedAt)) : new Date(0);
                const bUpdated = b.updatedAt ? (b.updatedAt instanceof Date ? b.updatedAt : new Date(b.updatedAt)) : new Date(0);
                result = aUpdated.getTime() - bUpdated.getTime();
                break;
                
            case TaskSortField.COMPLETED_DATE:
                const aCompleted = a.completedAt ? (a.completedAt instanceof Date ? a.completedAt : new Date(a.completedAt)) : new Date(0);
                const bCompleted = b.completedAt ? (b.completedAt instanceof Date ? b.completedAt : new Date(b.completedAt)) : new Date(0);
                result = aCompleted.getTime() - bCompleted.getTime();
                break;
                
            case TaskSortField.GOAL_ID:
                result = a.goalId.localeCompare(b.goalId);
                break;
                
            case TaskSortField.AGE:
                result = BaseTaskUtils.getTaskAgeInDays(a) - BaseTaskUtils.getTaskAgeInDays(b);
                break;
        }

        return direction === 'desc' ? -result : result;
    }

    // ===========================================
    // Search Methods
    // ===========================================

    /**
     * Advanced task search with scoring and highlighting
     */
    static searchTasks(
        tasks: Task[],
        config: TaskSearchConfig
    ): TaskSearchResult[] {
        const cacheKey = this.generateSearchCacheKey(tasks, config);
        
        // Check cache
        if (this.searchCache.has(cacheKey)) {
            return this.searchCache.get(cacheKey)!;
        }

        const results: TaskSearchResult[] = [];

        for (const task of tasks) {
            const result = this.searchSingleTask(task, config);
            if (result.score > 0) {
                results.push(result);
            }
        }

        // Sort by score (highest first)
        results.sort((a, b) => b.score - a.score);

        // Cache results
        this.searchCache.set(cacheKey, results);
        
        // Clean cache if it gets too large
        if (this.searchCache.size > 100) {
            const firstKey = this.searchCache.keys().next().value;
            this.searchCache.delete(firstKey);
        }

        return results;
    }

    /**
     * Fuzzy search with tolerance
     */
    static fuzzySearchTasks(
        tasks: Task[],
        query: string,
        tolerance: number = 0.7,
        searchFields: ('title' | 'description')[] = ['title', 'description']
    ): TaskSearchResult[] {
        const config: TaskSearchConfig = {
            query,
            searchFields,
            caseSensitive: false,
            useRegex: false,
            wholeWords: false,
            fuzzyTolerance: tolerance,
            highlightMatches: true
        };

        return this.searchTasks(tasks, config).filter(result => result.score >= tolerance);
    }

    private static searchSingleTask(task: Task, config: TaskSearchConfig): TaskSearchResult {
        let maxScore = 0;
        const matchingFields: string[] = [];
        const highlights: { title?: string; description?: string } = {};

        for (const field of config.searchFields) {
            const fieldValue = field === 'title' ? task.title : task.description || '';
            if (!fieldValue) continue;

            const score = this.calculateMatchScore(fieldValue, config);
            if (score > 0) {
                maxScore = Math.max(maxScore, score);
                matchingFields.push(field);
                
                if (config.highlightMatches) {
                    highlights[field] = this.highlightMatches(fieldValue, config);
                }
            }
        }

        return {
            task,
            score: maxScore,
            matchingFields,
            highlights: config.highlightMatches ? highlights : undefined
        };
    }

    private static calculateMatchScore(text: string, config: TaskSearchConfig): number {
        const searchText = config.caseSensitive ? text : text.toLowerCase();
        const query = config.caseSensitive ? config.query : config.query.toLowerCase();

        if (config.useRegex) {
            try {
                const flags = config.caseSensitive ? 'g' : 'gi';
                const regex = new RegExp(query, flags);
                const matches = searchText.match(regex);
                return matches ? matches.length / text.length : 0;
            } catch {
                return 0;
            }
        }

        if (config.fuzzyTolerance !== undefined) {
            return this.fuzzyMatch(searchText, query, config.fuzzyTolerance);
        }

        // Simple text matching with scoring
        if (config.wholeWords) {
            const wordBoundary = new RegExp(`\\b${this.escapeRegex(query)}\\b`, config.caseSensitive ? 'g' : 'gi');
            const matches = searchText.match(wordBoundary);
            return matches ? matches.length / text.split(/\s+/).length : 0;
        }

        // Exact match gets highest score
        if (searchText === query) return 1;
        
        // Starts with match gets high score
        if (searchText.startsWith(query)) return 0.8;
        
        // Contains match gets medium score
        if (searchText.includes(query)) {
            // Score based on how much of the text is the query
            return Math.min(0.7, query.length / text.length);
        }

        return 0;
    }

    private static fuzzyMatch(text: string, pattern: string, tolerance: number): number {
        if (pattern.length === 0) return 1;
        if (text.length === 0) return 0;

        // Simple fuzzy matching using edit distance
        const matrix: number[][] = [];
        
        for (let i = 0; i <= text.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= pattern.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= text.length; i++) {
            for (let j = 1; j <= pattern.length; j++) {
                if (text[i - 1] === pattern[j - 1]) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        const editDistance = matrix[text.length][pattern.length];
        const maxLength = Math.max(text.length, pattern.length);
        const similarity = 1 - (editDistance / maxLength);
        
        return similarity >= tolerance ? similarity : 0;
    }

    private static highlightMatches(text: string, config: TaskSearchConfig): string {
        const searchText = config.caseSensitive ? text : text.toLowerCase();
        const query = config.caseSensitive ? config.query : config.query.toLowerCase();

        if (config.useRegex) {
            try {
                const flags = config.caseSensitive ? 'g' : 'gi';
                const regex = new RegExp(query, flags);
                return text.replace(regex, '<mark>$&</mark>');
            } catch {
                return text;
            }
        }

        if (config.wholeWords) {
            const wordBoundary = new RegExp(`\\b(${this.escapeRegex(config.query)})\\b`, config.caseSensitive ? 'g' : 'gi');
            return text.replace(wordBoundary, '<mark>$1</mark>');
        }

        // Simple highlighting
        const regex = new RegExp(this.escapeRegex(config.query), config.caseSensitive ? 'g' : 'gi');
        return text.replace(regex, '<mark>$&</mark>');
    }

    private static escapeRegex(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private static generateSearchCacheKey(tasks: Task[], config: TaskSearchConfig): string {
        return `${tasks.length}-${JSON.stringify(config)}`;
    }

    // ===========================================
    // Template Methods
    // ===========================================

    /**
     * Get predefined task templates
     */
    static getDefaultTaskTemplates(): TaskTemplate[] {
        return [
            {
                id: 'bug-fix',
                name: 'Bug Fix',
                description: 'Template for bug fixing tasks',
                category: 'Development',
                template: {
                    title: 'Fix: {{bugDescription}}',
                    description: 'Bug: {{bugDescription}}\n\nSteps to reproduce:\n1. {{step1}}\n2. {{step2}}\n\nExpected behavior: {{expectedBehavior}}\nActual behavior: {{actualBehavior}}',
                    defaultStatus: TaskStatus.TODO
                },
                variables: [
                    { name: 'bugDescription', description: 'Brief description of the bug', required: true },
                    { name: 'step1', description: 'First step to reproduce', defaultValue: '', required: false },
                    { name: 'step2', description: 'Second step to reproduce', defaultValue: '', required: false },
                    { name: 'expectedBehavior', description: 'What should happen', required: true },
                    { name: 'actualBehavior', description: 'What actually happens', required: true }
                ],
                metadata: {
                    tags: ['bug', 'fix'],
                    priority: 4,
                    estimatedTimeMinutes: 120
                },
                createdAt: new Date(),
                usageCount: 0
            },
            {
                id: 'feature-implementation',
                name: 'Feature Implementation',
                description: 'Template for implementing new features',
                category: 'Development',
                template: {
                    title: 'Implement: {{featureName}}',
                    description: 'Feature: {{featureName}}\n\nDescription: {{featureDescription}}\n\nAcceptance Criteria:\n- {{criteria1}}\n- {{criteria2}}\n\nTechnical Notes: {{technicalNotes}}',
                    defaultStatus: TaskStatus.TODO
                },
                variables: [
                    { name: 'featureName', description: 'Name of the feature', required: true },
                    { name: 'featureDescription', description: 'Detailed feature description', required: true },
                    { name: 'criteria1', description: 'First acceptance criteria', required: true },
                    { name: 'criteria2', description: 'Second acceptance criteria', defaultValue: '', required: false },
                    { name: 'technicalNotes', description: 'Technical implementation notes', defaultValue: '', required: false }
                ],
                metadata: {
                    tags: ['feature', 'development'],
                    priority: 3,
                    estimatedTimeMinutes: 240
                },
                createdAt: new Date(),
                usageCount: 0
            },
            {
                id: 'code-review',
                name: 'Code Review',
                description: 'Template for code review tasks',
                category: 'Development',
                template: {
                    title: 'Review: {{prTitle}}',
                    description: 'PR/MR: {{prTitle}}\nAuthor: {{author}}\nURL: {{prUrl}}\n\nReview Focus:\n- {{focus1}}\n- {{focus2}}\n\nNotes: {{reviewNotes}}',
                    defaultStatus: TaskStatus.TODO
                },
                variables: [
                    { name: 'prTitle', description: 'Pull request title', required: true },
                    { name: 'author', description: 'Pull request author', required: true },
                    { name: 'prUrl', description: 'Pull request URL', required: false, defaultValue: '' },
                    { name: 'focus1', description: 'First review focus area', required: true },
                    { name: 'focus2', description: 'Second review focus area', required: false, defaultValue: '' },
                    { name: 'reviewNotes', description: 'Additional review notes', required: false, defaultValue: '' }
                ],
                metadata: {
                    tags: ['review', 'quality'],
                    priority: 3,
                    estimatedTimeMinutes: 60
                },
                createdAt: new Date(),
                usageCount: 0
            },
            {
                id: 'meeting-prep',
                name: 'Meeting Preparation',
                description: 'Template for meeting preparation tasks',
                category: 'Planning',
                template: {
                    title: 'Prepare for: {{meetingTitle}}',
                    description: 'Meeting: {{meetingTitle}}\nDate: {{meetingDate}}\nAttendees: {{attendees}}\n\nAgenda:\n1. {{agendaItem1}}\n2. {{agendaItem2}}\n\nPreparation Tasks:\n- {{prepTask1}}\n- {{prepTask2}}',
                    defaultStatus: TaskStatus.TODO
                },
                variables: [
                    { name: 'meetingTitle', description: 'Meeting title', required: true },
                    { name: 'meetingDate', description: 'Meeting date and time', required: true },
                    { name: 'attendees', description: 'Meeting attendees', required: false, defaultValue: '' },
                    { name: 'agendaItem1', description: 'First agenda item', required: true },
                    { name: 'agendaItem2', description: 'Second agenda item', required: false, defaultValue: '' },
                    { name: 'prepTask1', description: 'First preparation task', required: true },
                    { name: 'prepTask2', description: 'Second preparation task', required: false, defaultValue: '' }
                ],
                metadata: {
                    tags: ['meeting', 'preparation'],
                    priority: 2,
                    estimatedTimeMinutes: 30
                },
                createdAt: new Date(),
                usageCount: 0
            }
        ];
    }

    /**
     * Create task from template with variable substitution
     */
    static createTaskFromTemplate(
        template: TaskTemplate,
        goalId: string,
        variables: Record<string, string> = {}
    ): CreateTaskParams {
        let title = template.template.title;
        let description = template.template.description || '';

        // Substitute variables
        if (template.variables) {
            for (const variable of template.variables) {
                const value = variables[variable.name] || variable.defaultValue || '';
                const placeholder = `{{${variable.name}}}`;
                
                title = title.replace(new RegExp(placeholder, 'g'), value);
                description = description.replace(new RegExp(placeholder, 'g'), value);
            }
        }

        return {
            title: title.trim(),
            description: description.trim() || undefined,
            goalId
        };
    }

    // ===========================================
    // Statistics and Analytics Methods
    // ===========================================

    /**
     * Calculate comprehensive task statistics
     */
    static calculateTaskStatistics(tasks: Task[], goals: Goal[] = []): TaskStatistics {
        const cacheKey = `stats-${tasks.length}-${goals.length}`;
        const cached = this.statisticsCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp.getTime()) < this.DEFAULT_PERFORMANCE_CONFIG.cacheTtl) {
            return cached.stats;
        }

        const stats: TaskStatistics = {
            totalTasks: tasks.length,
            statusBreakdown: {
                [TaskStatus.TODO]: 0,
                [TaskStatus.IN_PROGRESS]: 0,
                [TaskStatus.DONE]: 0
            },
            goalBreakdown: {},
            completionMetrics: {
                overallCompletion: 0,
                averageCompletionTime: 0,
                completionRate: 0,
                recentCompletions: 0
            },
            ageDistribution: {
                new: 0,
                recent: 0,
                medium: 0,
                old: 0
            },
            performance: {
                creationRate: 0,
                completionRateDaily: 0,
                averageTasksPerGoal: 0
            }
        };

        if (tasks.length === 0) {
            return stats;
        }

        // Calculate status breakdown
        tasks.forEach(task => {
            stats.statusBreakdown[task.status]++;
            
            // Goal breakdown
            if (!stats.goalBreakdown[task.goalId]) {
                stats.goalBreakdown[task.goalId] = 0;
            }
            stats.goalBreakdown[task.goalId]++;
        });

        // Calculate completion metrics
        const completedTasks = tasks.filter(task => task.status === TaskStatus.DONE);
        stats.completionMetrics.overallCompletion = (completedTasks.length / tasks.length) * 100;

        // Average completion time
        if (completedTasks.length > 0) {
            const completionTimes = completedTasks
                .filter(task => task.completedAt)
                .map(task => {
                    const created = task.createdAt instanceof Date ? task.createdAt : new Date(task.createdAt);
                    const completed = task.completedAt instanceof Date ? task.completedAt! : new Date(task.completedAt!);
                    return (completed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24); // days
                });

            if (completionTimes.length > 0) {
                stats.completionMetrics.averageCompletionTime = 
                    completionTimes.reduce((sum, time) => sum + time, 0) / completionTimes.length;
            }
        }

        // Recent completions (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        stats.completionMetrics.recentCompletions = completedTasks.filter(task => {
            if (!task.completedAt) return false;
            const completed = task.completedAt instanceof Date ? task.completedAt : new Date(task.completedAt);
            return completed >= sevenDaysAgo;
        }).length;

        // Age distribution
        tasks.forEach(task => {
            const age = BaseTaskUtils.getTaskAgeInDays(task);
            if (age < 1) {
                stats.ageDistribution.new++;
            } else if (age <= 7) {
                stats.ageDistribution.recent++;
            } else if (age <= 30) {
                stats.ageDistribution.medium++;
            } else {
                stats.ageDistribution.old++;
            }
        });

        // Performance metrics
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentTasks = tasks.filter(task => {
            const created = task.createdAt instanceof Date ? task.createdAt : new Date(task.createdAt);
            return created >= thirtyDaysAgo;
        });

        stats.performance.creationRate = recentTasks.length / 30;

        const recentCompletions = completedTasks.filter(task => {
            if (!task.completedAt) return false;
            const completed = task.completedAt instanceof Date ? task.completedAt : new Date(task.completedAt);
            return completed >= thirtyDaysAgo;
        });

        stats.performance.completionRateDaily = recentCompletions.length / 30;

        if (goals.length > 0) {
            stats.performance.averageTasksPerGoal = tasks.length / goals.length;
        }

        // Cache results
        this.statisticsCache.set(cacheKey, { stats, timestamp: new Date() });

        return stats;
    }

    /**
     * Generate task analytics for insights
     */
    static generateTaskAnalytics(tasks: Task[], goals: Goal[] = []): TaskAnalytics {
        const analytics: TaskAnalytics = {
            trends: {
                creationTrend: [],
                completionTrend: [],
                statusTransitions: {}
            },
            patterns: {
                commonTitles: [],
                peakHours: [],
                completionTimesByGoal: {}
            },
            productivity: {
                productiveDays: [],
                goalEfficiency: {}
            }
        };

        // Generate creation trend (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        for (let i = 0; i < 30; i++) {
            const date = new Date(thirtyDaysAgo);
            date.setDate(date.getDate() + i);
            
            const dayStart = new Date(date);
            dayStart.setHours(0, 0, 0, 0);
            
            const dayEnd = new Date(date);
            dayEnd.setHours(23, 59, 59, 999);

            const createdOnDay = tasks.filter(task => {
                const created = task.createdAt instanceof Date ? task.createdAt : new Date(task.createdAt);
                return created >= dayStart && created <= dayEnd;
            }).length;

            const completedOnDay = tasks.filter(task => {
                if (!task.completedAt) return false;
                const completed = task.completedAt instanceof Date ? task.completedAt : new Date(task.completedAt);
                return completed >= dayStart && completed <= dayEnd;
            }).length;

            analytics.trends.creationTrend.push({ date, count: createdOnDay });
            analytics.trends.completionTrend.push({ date, count: completedOnDay });
        }

        // Common title patterns
        const titleWords = tasks
            .map(task => task.title.toLowerCase().split(/\s+/))
            .flat()
            .filter(word => word.length > 3); // Filter short words

        const titleWordCounts = titleWords.reduce((counts, word) => {
            counts[word] = (counts[word] || 0) + 1;
            return counts;
        }, {} as Record<string, number>);

        analytics.patterns.commonTitles = Object.entries(titleWordCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([pattern, count]) => ({ pattern, count }));

        // Goal efficiency
        for (const goal of goals) {
            const goalTasks = tasks.filter(task => task.goalId === goal.id);
            if (goalTasks.length === 0) continue;

            const completedTasks = goalTasks.filter(task => task.status === TaskStatus.DONE);
            const completionRate = completedTasks.length / goalTasks.length;

            const avgTime = completedTasks.length > 0 ? 
                completedTasks
                    .filter(task => task.completedAt)
                    .map(task => {
                        const created = task.createdAt instanceof Date ? task.createdAt : new Date(task.createdAt);
                        const completed = task.completedAt instanceof Date ? task.completedAt! : new Date(task.completedAt!);
                        return (completed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24); // days
                    })
                    .reduce((sum, time, _, arr) => sum + time / arr.length, 0)
                : 0;

            analytics.productivity.goalEfficiency[goal.id] = {
                averageTaskTime: avgTime,
                completionRate,
                efficiency: completionRate * (avgTime > 0 ? 1 / avgTime : 1)
            };
        }

        return analytics;
    }

    // ===========================================
    // Performance Helpers
    // ===========================================

    /**
     * Create search index for faster filtering
     */
    static createSearchIndex(tasks: Task[]): Map<string, Task[]> {
        const index = new Map<string, Task[]>();

        // Index by status
        for (const status of Object.values(TaskStatus)) {
            index.set(`status:${status}`, tasks.filter(task => task.status === status));
        }

        // Index by goal ID
        const goalIds = [...new Set(tasks.map(task => task.goalId))];
        for (const goalId of goalIds) {
            index.set(`goal:${goalId}`, tasks.filter(task => task.goalId === goalId));
        }

        // Index by age ranges
        index.set('age:new', tasks.filter(task => BaseTaskUtils.getTaskAgeInDays(task) < 1));
        index.set('age:recent', tasks.filter(task => {
            const age = BaseTaskUtils.getTaskAgeInDays(task);
            return age >= 1 && age <= 7;
        }));
        index.set('age:medium', tasks.filter(task => {
            const age = BaseTaskUtils.getTaskAgeInDays(task);
            return age > 7 && age <= 30;
        }));
        index.set('age:old', tasks.filter(task => BaseTaskUtils.getTaskAgeInDays(task) > 30));

        return index;
    }

    /**
     * Clear all caches
     */
    static clearCaches(): void {
        this.indexCache.clear();
        this.searchCache.clear();
        this.statisticsCache.clear();
    }

    /**
     * Get cache statistics
     */
    static getCacheStats(): {
        indexCacheSize: number;
        searchCacheSize: number;
        statisticsCacheSize: number;
    } {
        return {
            indexCacheSize: this.indexCache.size,
            searchCacheSize: this.searchCache.size,
            statisticsCacheSize: this.statisticsCache.size
        };
    }
}

/**
 * Export utility functions for convenience
 */
export {
    TaskFilterCriteria,
    TaskSortConfig,
    TaskSortField,
    TaskSearchConfig,
    TaskSearchResult,
    TaskTemplate,
    TaskStatistics,
    TaskAnalytics,
    TaskPerformanceConfig
};

/**
 * Export default instance for convenient usage
 */
export const taskUtilities = TaskUtils;