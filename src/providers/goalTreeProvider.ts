import * as vscode from 'vscode';
import { Goal, Task } from '../types/Goal';
import { TreeViewConfig, TreeRefreshOptions, TREE_CONTEXT_VALUES } from '../types/TreeTypes';
import { GoalTreeItem } from './GoalTreeItem';
import { StateManager } from '../services/stateManager';
import { GoalManager } from '../services/goalManager';
import { TaskManager } from '../services/TaskManager';
import { BulkTaskOperations } from '../services/BulkTaskOperations';
import { ProgressCalculator, ProgressInfo } from '../utils/ProgressCalculator';
import { ICONS, CONTEXT_VALUES, TREE_NODE_TYPES, DEFAULTS, ERROR_MESSAGES, CONFIG_KEYS } from '../constants';
import { debounce, DebouncePresets, DebounceManager } from '../utils/debounce';
import { memoize, VirtualScroller, PerformanceTimer, createProfiler } from '../utils/performance';
import { createLogger, Logger, LogLevel, logPerformance } from '../utils/logger';


/**
 * Performance configuration for the tree provider
 */
interface PerformanceConfig {
    enableLazyLoading: boolean;
    enableVirtualScrolling: boolean;
    maxGoalsInView: number;
    debounceInterval: number;
    cacheEnabled: boolean;
    maxCacheSize: number;
    enableProfiling: boolean;
}

/**
 * Cache entry for memoized operations
 */
interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

/**
 * Tree data provider for the goal tree view in VS Code sidebar
 * Optimized for large datasets with lazy loading, debouncing, and caching
 */
export class GoalTreeProvider implements vscode.TreeDataProvider<string> {
    private _onDidChangeTreeData: vscode.EventEmitter<string | undefined | null | void> = new vscode.EventEmitter<string | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<string | undefined | null | void> = this._onDidChangeTreeData.event;

    private stateManager: StateManager;
    private goalManager: GoalManager;
    private taskManager: TaskManager;
    private bulkTaskOperations: BulkTaskOperations;
    private progressCalculator: ProgressCalculator;
    private showCompleted: boolean = true;
    private groupByStatus: boolean = false;
    private sortByTitle: boolean = false;
    private autoRefresh: boolean = true;
    private viewState: { [key: string]: boolean } = {}; // Track expanded/collapsed state
    
    // Performance optimization components
    private logger: Logger;
    private debounceManager: DebounceManager;
    private performanceConfig: PerformanceConfig;
    private performanceTimer: PerformanceTimer;
    private profiler: ReturnType<typeof createProfiler>;
    private cache: Map<string, CacheEntry<any>> = new Map();
    private loadingStates: Set<string> = new Set();
    private virtualScroller?: VirtualScroller;
    
    // Memoized functions for expensive operations
    private memoizedGetProgress!: ((goalId: string) => { completed: number; total: number; percentage: number }) & { clearCache: () => void };
    private memoizedCreateTooltip!: ((goal: Goal, progress: any) => string) & { clearCache: () => void };
    private memoizedFilterGoals!: ((goals: Goal[]) => Goal[]) & { clearCache: () => void };

    constructor(
        stateManager: StateManager, 
        goalManager: GoalManager, 
        taskManager: TaskManager,
        bulkTaskOperations: BulkTaskOperations,
        context?: vscode.ExtensionContext
    ) {
        this.stateManager = stateManager;
        this.goalManager = goalManager;
        this.taskManager = taskManager;
        this.bulkTaskOperations = bulkTaskOperations;
        this.progressCalculator = new ProgressCalculator();
        
        // Initialize performance components
        this.logger = createLogger('GoalTreeProvider');
        this.debounceManager = new DebounceManager();
        this.performanceTimer = new PerformanceTimer();
        this.profiler = createProfiler('GoalTreeProvider');
        
        // Load performance configuration
        this.performanceConfig = this.loadPerformanceConfig(context);
        
        // Initialize memoized functions
        this.initializeMemoizedFunctions();
        
        // Initialize virtual scrolling if enabled
        if (this.performanceConfig.enableVirtualScrolling) {
            this.initializeVirtualScrolling();
        }
        
        // Set up debounced refresh function
        const debouncedRefresh = this.debounceManager.getDebounced(
            'refresh',
            this.performRefreshInternal.bind(this),
            {
                delay: this.performanceConfig.debounceInterval,
                maxDelay: this.performanceConfig.debounceInterval * 3
            }
        );
        
        // Listen for state changes to refresh the tree (if auto refresh is enabled)
        this.stateManager.on('stateChanged', () => {
            if (this.autoRefresh) {
                this.logger.debug('State changed, triggering debounced refresh');
                debouncedRefresh();
            }
        });
        
        // Listen for task events to refresh the tree
        this.taskManager.onTaskEvent((event) => {
            if (this.autoRefresh) {
                this.logger.debug('Task event received, triggering debounced refresh', { eventType: event.type });
                debouncedRefresh();
            }
        });
        
        this.logger.info('GoalTreeProvider initialized with performance optimizations', {
            config: this.performanceConfig
        });
    }

    /**
     * Load performance configuration from workspace settings
     */
    private loadPerformanceConfig(context?: vscode.ExtensionContext): PerformanceConfig {
        const config = vscode.workspace.getConfiguration('goalTree.performance');
        
        return {
            enableLazyLoading: config.get('enableLazyLoading', true),
            enableVirtualScrolling: config.get('enableVirtualScrolling', false),
            maxGoalsInView: config.get('maxGoalsInView', DEFAULTS.MAX_GOALS_IN_VIEW),
            debounceInterval: config.get('debounceInterval', DEFAULTS.DEBOUNCE_INTERVAL),
            cacheEnabled: config.get('cacheEnabled', true),
            maxCacheSize: config.get('maxCacheSize', 100),
            enableProfiling: config.get('enableProfiling', false)
        };
    }
    
    /**
     * Initialize memoized functions for expensive operations
     */
    private initializeMemoizedFunctions(): void {
        this.memoizedGetProgress = memoize(
            (goalId: string) => this.calculateGoalProgress(goalId),
            { maxCacheSize: this.performanceConfig.maxCacheSize }
        );
        
        this.memoizedCreateTooltip = memoize(
            (goal: Goal, progress: any) => this.createGoalTooltipInternal(goal, progress),
            { maxCacheSize: this.performanceConfig.maxCacheSize }
        );
        
        this.memoizedFilterGoals = memoize(
            (goals: Goal[]) => this.filterGoals(goals),
            { maxCacheSize: 50 }
        );
    }
    
    /**
     * Initialize virtual scrolling components
     */
    private initializeVirtualScrolling(): void {
        // Virtual scrolling for tree views is complex, so we'll prepare the infrastructure
        // This would be expanded based on the actual tree view requirements
        this.virtualScroller = new VirtualScroller(
            22, // Typical tree item height
            400, // Estimated container height
            0 // Will be updated based on actual goal count
        );
    }
    
    /**
     * Public refresh method with debouncing
     */
    refresh(): void {
        const debouncedRefresh = this.debounceManager.getDebounced(
            'refresh',
            this.performRefreshInternal.bind(this),
            DebouncePresets.FAST
        );
        debouncedRefresh();
    }
    
    /**
     * Internal refresh implementation
     */
    private performRefreshInternal(): void {
        try {
            this.logger.debug('Performing tree refresh');
            
            // Clear relevant caches on refresh
            this.clearStaleCache();
            
            // Clear memoized function caches
            this.memoizedGetProgress.clearCache();
            this.memoizedCreateTooltip.clearCache();
            
            this._onDidChangeTreeData.fire();
            
            this.logger.debug('Tree refresh completed');
        } catch (error) {
            this.logger.error('Error during tree refresh', error);
            this.handleError('refresh', error);
        }
    }

    /**
     * Get tree item for a given element with error handling and caching
     */
    getTreeItem(element: string): vscode.TreeItem {
        return logPerformance(this.logger, `getTreeItem(${element})`, () => {
            try {
                // Check cache first
                const cacheKey = `treeItem_${element}`;
                if (this.performanceConfig.cacheEnabled) {
                    const cached = this.getFromCache<vscode.TreeItem>(cacheKey);
                    if (cached) {
                        return cached;
                    }
                }
                
                let treeItem: vscode.TreeItem;
                
                // Check if element is a goal
                const goal = this.stateManager.getGoal(element);
                if (goal) {
                    treeItem = this.createGoalTreeItem(goal);
                } else {
                    // Check if it's a task (format: goalId:taskId)
                    const [goalId, taskId] = element.split(':');
                    const parentGoal = this.stateManager.getGoal(goalId);
                    const task = parentGoal?.tasks.find(t => t.id === taskId);
                    
                    if (task && parentGoal) {
                        treeItem = this.createTaskTreeItem(task, parentGoal);
                    } else {
                        this.logger.warn(`Unknown element: ${element}`);
                        treeItem = new vscode.TreeItem('Unknown item', vscode.TreeItemCollapsibleState.None);
                        treeItem.description = 'Item not found';
                        treeItem.iconPath = new vscode.ThemeIcon('error');
                    }
                }
                
                // Cache the result
                if (this.performanceConfig.cacheEnabled && treeItem) {
                    this.setCache(cacheKey, treeItem, 10000); // Cache for 10 seconds
                }
                
                return treeItem;
            } catch (error) {
                this.logger.error(`Error creating tree item for ${element}`, error);
                this.handleError('getTreeItem', error);
                
                const errorItem = new vscode.TreeItem('Error', vscode.TreeItemCollapsibleState.None);
                errorItem.description = 'Failed to load';
                errorItem.iconPath = new vscode.ThemeIcon('error');
                return errorItem;
            }
        });
    }

    /**
     * Get children for a given element with lazy loading and caching
     */
    getChildren(element?: string): Thenable<string[]> {
        return logPerformance(this.logger, `getChildren(${element || 'root'})`, () => {
            try {
                // Check cache first if enabled
                const cacheKey = `children_${element || 'root'}`;
                if (this.performanceConfig.cacheEnabled) {
                    const cached = this.getFromCache<string[]>(cacheKey);
                    if (cached) {
                        this.logger.debug(`Cache hit for children of ${element || 'root'}`);
                        return Promise.resolve(cached);
                    }
                }
                
                let result: string[];
                
                if (!element) {
                    // Root level goals with lazy loading
                    result = this.getRootChildren();
                } else {
                    // Children for specific goal with lazy loading
                    result = this.getGoalChildren(element);
                }
                
                // Cache the result if enabled
                if (this.performanceConfig.cacheEnabled) {
                    this.setCache(cacheKey, result, 30000); // Cache for 30 seconds
                }
                
                return Promise.resolve(result);
            } catch (error) {
                this.logger.error(`Error getting children for ${element || 'root'}`, error);
                this.handleError('getChildren', error);
                return Promise.resolve([]);
            }
        });
    }
    
    /**
     * Get root level children with lazy loading
     */
    private getRootChildren(): string[] {
        const rootGoals = this.stateManager.getRootGoals();
        
        // Apply performance limits
        const maxGoals = this.performanceConfig.maxGoalsInView;
        let filteredGoals = this.filterAndSortGoals(rootGoals);
        
        if (filteredGoals.length > maxGoals) {
            this.logger.warn(`Too many root goals (${filteredGoals.length}), limiting to ${maxGoals}`);
            filteredGoals = filteredGoals.slice(0, maxGoals);
        }
        
        return filteredGoals.map(g => g.id);
    }
    
    /**
     * Get children for a specific goal with lazy loading
     */
    private getGoalChildren(goalId: string): string[] {
        const goal = this.stateManager.getGoal(goalId);
        if (!goal) {
            this.logger.warn(`Goal not found: ${goalId}`);
            return [];
        }
        
        const children: string[] = [];
        
        // Add child goals (lazy loaded)
        if (this.performanceConfig.enableLazyLoading) {
            // Only load if expanded or small number of children
            const childGoals = this.stateManager.getChildGoals(goalId);
            if (this.isExpanded(goalId) || childGoals.length <= 10) {
                const filteredChildGoals = this.filterAndSortGoals(childGoals);
                children.push(...filteredChildGoals.map(g => g.id));
            } else {
                // Add placeholder for lazy loading
                this.logger.debug(`Lazy loading placeholder for ${goalId} with ${childGoals.length} children`);
            }
        } else {
            // Load all children
            const childGoals = this.stateManager.getChildGoals(goalId);
            children.push(...this.filterAndSortGoals(childGoals).map(g => g.id));
        }
        
        // Add tasks with lazy loading
        if (goal.tasks.length > 0) {
            if (this.performanceConfig.enableLazyLoading) {
                // Only load tasks if goal is expanded or has few tasks
                if (this.isExpanded(goalId) || goal.tasks.length <= 5) {
                    const filteredTasks = this.filterTasks(goal.tasks);
                    children.push(...filteredTasks.map(t => `${goalId}:${t.id}`));
                }
            } else {
                const filteredTasks = this.filterTasks(goal.tasks);
                children.push(...filteredTasks.map(t => `${goalId}:${t.id}`));
            }
        }
        
        return children;
    }

    /**
     * Create a tree item for a goal with performance optimizations
     */
    private createGoalTreeItem(goal: Goal): GoalTreeItem {
        try {
            const hasChildren = this.calculateHasChildren(goal);
            const isExpanded = this.isExpanded(goal.id);
            
            // Use memoized progress calculation for better performance
            const progress = this.performanceConfig.cacheEnabled ? 
                this.memoizedGetProgress(goal.id) : 
                this.calculateGoalProgress(goal.id);
            
            return GoalTreeItem.fromGoal(goal, hasChildren, isExpanded, progress);
        } catch (error) {
            this.logger.error(`Error creating tree item for goal ${goal.id}`, error);
            throw error;
        }
    }
    
    /**
     * Calculate progress for a goal
     */
    private calculateGoalProgress(goalId: string): { completed: number; total: number; percentage: number } {
        const goal = this.stateManager.getGoal(goalId);
        if (!goal) {
            return { completed: 0, total: 0, percentage: 0 };
        }
        
        const progressInfo = this.progressCalculator.calculateGoalProgress(goal);
        return {
            completed: progressInfo.completed,
            total: progressInfo.total,
            percentage: progressInfo.percentage
        };
    }
    
    /**
     * Calculate if a goal has children (optimized)
     */
    private calculateHasChildren(goal: Goal): boolean {
        // Fast check for tasks
        if (goal.tasks.length > 0) {
            return true;
        }
        
        // Check for child goals (may be cached)
        const childGoals = this.stateManager.getChildGoals(goal.id);
        return childGoals.length > 0;
    }

    /**
     * Create a tree item for a task with performance optimizations
     */
    private createTaskTreeItem(task: Task, parentGoal: Goal): GoalTreeItem {
        try {
            return GoalTreeItem.fromTask(task, parentGoal);
        } catch (error) {
            this.logger.error(`Error creating tree item for task ${task.id}`, error);
            throw error;
        }
    }

    /**
     * Create comprehensive tooltip for a goal (public wrapper)
     */
    private createGoalTooltip(goal: Goal, progress: { completed: number; total: number; percentage: number }): string {
        if (this.performanceConfig.cacheEnabled) {
            return this.memoizedCreateTooltip(goal, progress);
        }
        return this.createGoalTooltipInternal(goal, progress);
    }
    
    /**
     * Internal tooltip creation implementation
     */
    private createGoalTooltipInternal(goal: Goal, progress: { completed: number; total: number; percentage: number }): string {
        const lines = [
            `📋 ${goal.title}`,
            ``,
            `Status: ${this.formatStatusWithIcon(goal.status)}`,
            `Progress: ${progress.percentage}% (${progress.completed}/${progress.total} items)`
        ];

        // Add priority information
        if (goal.metadata?.priority) {
            const priorityText = this.formatPriorityText(goal.metadata.priority);
            lines.push(`Priority: ${priorityText}`);
        }

        // Add due date information
        if (goal.metadata?.dueDate) {
            const dueDate = new Date(goal.metadata.dueDate);
            const isOverdue = dueDate.getTime() < Date.now();
            const isUrgent = dueDate.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;
            
            let dueDateText = `Due: ${dueDate.toLocaleDateString()}`;
            if (isOverdue) {
                dueDateText += ' ⚠️ OVERDUE';
            } else if (isUrgent) {
                dueDateText += ' 🔥 URGENT';
            }
            lines.push(dueDateText);
        }

        lines.push(`Created: ${goal.createdAt.toLocaleDateString()}`);

        // Add completion information
        if (goal.completedAt) {
            const timeTaken = goal.completedAt.getTime() - goal.createdAt.getTime();
            const daysTaken = Math.floor(timeTaken / (24 * 60 * 60 * 1000));
            lines.push(`✅ Completed: ${goal.completedAt.toLocaleDateString()} (${daysTaken} days)`);
        }

        // Add blocking/dependency information
        if (goal.blockedByIds.length > 0) {
            lines.push(``, `🔒 Dependencies:`);
            goal.blockedByIds.forEach(blockedId => {
                const blockingGoal = this.stateManager.getGoal(blockedId);
                if (blockingGoal) {
                    lines.push(`  • ${blockingGoal.title} (${blockingGoal.status})`);
                }
            });
        }

        // Add child goals and tasks breakdown
        if (progress.total > 0) {
            const childGoals = this.stateManager.getChildGoals(goal.id);
            if (childGoals.length > 0 || goal.tasks.length > 0) {
                lines.push(``, `📊 Breakdown:`);
                if (goal.tasks.length > 0) {
                    const completedTasks = goal.tasks.filter(t => t.status === 'done').length;
                    lines.push(`  Tasks: ${completedTasks}/${goal.tasks.length} completed`);
                }
                if (childGoals.length > 0) {
                    const completedGoals = childGoals.filter(g => g.status === 'completed').length;
                    lines.push(`  Sub-goals: ${completedGoals}/${childGoals.length} completed`);
                }
            }
        }

        // Add time tracking information
        if (goal.metadata?.estimatedHours || goal.metadata?.actualHours) {
            lines.push(``, `⏱️ Time Tracking:`);
            if (goal.metadata.estimatedHours) {
                lines.push(`  Estimated: ${goal.metadata.estimatedHours}h`);
            }
            if (goal.metadata.actualHours) {
                lines.push(`  Actual: ${goal.metadata.actualHours}h`);
                if (goal.metadata.estimatedHours) {
                    const variance = goal.metadata.actualHours - goal.metadata.estimatedHours;
                    const varianceText = variance > 0 ? `+${variance}h over` : `${Math.abs(variance)}h under`;
                    lines.push(`  Variance: ${varianceText}`);
                }
            }
        }

        // Add tags
        if (goal.metadata?.tags && goal.metadata.tags.length > 0) {
            lines.push(``, `🏷️ Tags: ${goal.metadata.tags.join(', ')}`);
        }

        // Add description at the end if it exists
        if (goal.description) {
            lines.push(``, `📝 ${goal.description}`);
        }

        return lines.join('\n');
    }

    /**
     * Format status with appropriate icon
     */
    private formatStatusWithIcon(status: string): string {
        switch (status) {
            case 'planned':
                return `⭕ ${status}`;
            case 'in-progress':
                return `▶️ ${status}`;
            case 'blocked':
                return `🚫 ${status}`;
            case 'completed':
                return `✅ ${status}`;
            default:
                return status;
        }
    }

    /**
     * Format priority level with visual indicators
     */
    private formatPriorityText(priority: number): string {
        const stars = '★'.repeat(priority) + '☆'.repeat(5 - priority);
        switch (priority) {
            case 5:
                return `${stars} HIGHEST`;
            case 4:
                return `${stars} HIGH`;
            case 3:
                return `${stars} MEDIUM`;
            case 2:
                return `${stars} LOW`;
            case 1:
                return `${stars} LOWEST`;
            default:
                return `${stars} MEDIUM`;
        }
    }

    /**
     * Create enhanced tooltip for a task with progress indicators
     */
    private createTaskTooltip(task: Task): string {
        const lines = [
            `✅ ${task.title}`,
            ``,
            `Status: ${this.formatTaskStatusWithIcon(task.status)}`,
            `Created: ${task.createdAt.toLocaleDateString()}`
        ];

        // Add time tracking and progress information
        if (task.completedAt) {
            const timeTaken = task.completedAt.getTime() - task.createdAt.getTime();
            const daysTaken = Math.floor(timeTaken / (24 * 60 * 60 * 1000));
            const hoursTaken = Math.floor((timeTaken % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
            let timeText: string;
            
            if (daysTaken > 0) {
                timeText = daysTaken === 1 ? '1 day' : `${daysTaken} days`;
                if (hoursTaken > 0) {
                    timeText += `, ${hoursTaken}h`;
                }
            } else if (hoursTaken > 0) {
                timeText = hoursTaken === 1 ? '1 hour' : `${hoursTaken} hours`;
            } else {
                timeText = 'Less than 1 hour';
            }
            
            lines.push(`✅ Completed: ${task.completedAt.toLocaleDateString()} (${timeText})`);
        } else if (task.status === 'in-progress') {
            const timeSinceCreated = Date.now() - task.createdAt.getTime();
            const daysInProgress = Math.floor(timeSinceCreated / (24 * 60 * 60 * 1000));
            if (daysInProgress > 0) {
                lines.push(`🔄 In progress for ${daysInProgress} day${daysInProgress !== 1 ? 's' : ''}`);
            }
        }

        if (task.order !== undefined) {
            lines.push(`Order: #${task.order + 1}`);
        }

        // Add visual progress indicator for status
        const statusProgress = this.getTaskStatusProgress(task.status);
        if (statusProgress.indicator) {
            lines.push(`Progress: ${statusProgress.indicator} ${statusProgress.text}`);
        }

        if (task.description) {
            lines.push(``, `📝 ${task.description}`);
        }

        return lines.join('\n');
    }

    /**
     * Get task status progress information
     */
    private getTaskStatusProgress(status: 'todo' | 'in-progress' | 'done'): { indicator: string; text: string } {
        switch (status) {
            case 'todo':
                return { indicator: '⭕ ▯▯▯', text: '0% (Not started)' };
            case 'in-progress':
                return { indicator: '▶️ ▮▯▯', text: '50% (In progress)' };
            case 'done':
                return { indicator: '✅ ▮▮▮', text: '100% (Complete)' };
            default:
                return { indicator: '', text: '' };
        }
    }

    /**
     * Format task status with appropriate icon
     */
    private formatTaskStatusWithIcon(status: string): string {
        switch (status) {
            case 'todo':
                return `⭕ ${status}`;
            case 'in-progress':
                return `▶️ ${status}`;
            case 'done':
                return `✅ ${status}`;
            default:
                return status;
        }
    }

    /**
     * Get context value for a goal (used for command visibility in menus)
     */
    private getGoalContextValue(goal: Goal): string {
        const isBlocked = goal.status === 'blocked' || goal.blockedByIds.length > 0;
        const isHighPriority = goal.metadata?.priority && goal.metadata.priority >= 4;
        const hasUrgentDueDate = goal.metadata?.dueDate && 
            new Date(goal.metadata.dueDate).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;

        // Build context with multiple attributes
        const contextParts = [];

        // Add base status context
        switch (goal.status) {
            case 'planned':
                contextParts.push(CONTEXT_VALUES.GOAL_PLANNED);
                break;
            case 'in-progress':
                contextParts.push(CONTEXT_VALUES.GOAL_IN_PROGRESS);
                break;
            case 'blocked':
                contextParts.push(CONTEXT_VALUES.GOAL_BLOCKED);
                break;
            case 'completed':
                contextParts.push(CONTEXT_VALUES.GOAL_COMPLETED);
                break;
            default:
                contextParts.push(CONTEXT_VALUES.GOAL);
        }

        // Add additional context indicators
        if (isBlocked && !contextParts.includes(CONTEXT_VALUES.GOAL_BLOCKED)) {
            contextParts.push(CONTEXT_VALUES.IS_BLOCKED);
        }
        if (isHighPriority) {
            contextParts.push('high-priority');
        }
        if (hasUrgentDueDate) {
            contextParts.push('urgent');
        }
        if (goal.blockedByIds.length > 0) {
            contextParts.push('has-dependencies');
        }

        return contextParts.join('_');
    }

    /**
     * Get context value for a task
     */
    private getTaskContextValue(task: Task): string {
        // Use status-specific context for better menu control
        switch (task.status) {
            case 'todo':
                return CONTEXT_VALUES.TASK_TODO;
            case 'in-progress':
                return CONTEXT_VALUES.TASK_IN_PROGRESS;
            case 'done':
                return CONTEXT_VALUES.TASK_DONE;
            default:
                return CONTEXT_VALUES.TASK;
        }
    }

    /**
     * Format progress text for display in the tree item label
     */
    private formatProgressText(progress: { completed: number; total: number; percentage: number }, goal: Goal): string {
        if (progress.total === 0) {
            // No sub-items to track
            return goal.status === 'completed' ? ' ✓' : '';
        }

        const percentage = progress.percentage;
        let progressIndicator = '';

        // Add visual progress indicator based on percentage
        if (percentage === 100) {
            progressIndicator = ' ✓';
        } else if (percentage >= 75) {
            progressIndicator = ' ▮▮▮▯';
        } else if (percentage >= 50) {
            progressIndicator = ' ▮▮▯▯';
        } else if (percentage >= 25) {
            progressIndicator = ' ▮▯▯▯';
        } else if (percentage > 0) {
            progressIndicator = ' ▯▯▯▯';
        }

        // For goals with priority, show different format
        const hasPriority = goal.metadata?.priority && goal.metadata.priority >= 4;
        const isBlocked = goal.status === 'blocked' || goal.blockedByIds.length > 0;
        const hasUrgentDueDate = goal.metadata?.dueDate && 
            new Date(goal.metadata.dueDate).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000; // Due within 7 days

        if (hasPriority || isBlocked || hasUrgentDueDate) {
            return ` [${progress.completed}/${progress.total} • ${percentage}%]${progressIndicator}`;
        }

        return ` (${progress.completed}/${progress.total} • ${percentage}%)${progressIndicator}`;
    }

    /**
     * Get icon for a goal based on its status, priority, and blocking state
     */
    private getGoalIcon(goal: Goal): vscode.ThemeIcon {
        const isBlocked = goal.status === 'blocked' || goal.blockedByIds.length > 0;
        const hasDependencies = goal.blockedByIds.length > 0;
        const isHighPriority = goal.metadata?.priority && goal.metadata.priority >= 4;
        const hasUrgentDueDate = goal.metadata?.dueDate && 
            new Date(goal.metadata.dueDate).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;

        // Handle blocked goals first (highest priority visual indicator)
        if (isBlocked) {
            if (hasDependencies) {
                return new vscode.ThemeIcon('debug-disconnect', new vscode.ThemeColor('charts.red'));
            }
            return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
        }

        // Handle urgent/high priority goals
        if (hasUrgentDueDate || isHighPriority) {
            switch (goal.status) {
                case 'planned':
                    return new vscode.ThemeIcon('circle-large-outline', new vscode.ThemeColor('charts.orange'));
                case 'in-progress':
                    return new vscode.ThemeIcon('play', new vscode.ThemeColor('charts.orange'));
                case 'completed':
                    return new vscode.ThemeIcon('pass', new vscode.ThemeColor('charts.green'));
                default:
                    return new vscode.ThemeIcon('circle-large-outline', new vscode.ThemeColor('charts.orange'));
            }
        }

        // Standard status icons with theme-aware colors
        switch (goal.status) {
            case 'planned':
                return new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.blue'));
            case 'in-progress':
                return new vscode.ThemeIcon('play', new vscode.ThemeColor('charts.blue'));
            case 'completed':
                return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
            default:
                return new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.blue'));
        }
    }

    /**
     * Get icon for a task based on its status with theme-aware colors
     */
    private getTaskIcon(task: Task): vscode.ThemeIcon {
        switch (task.status) {
            case 'todo':
                return new vscode.ThemeIcon('circle-small', new vscode.ThemeColor('charts.foreground'));
            case 'in-progress':
                return new vscode.ThemeIcon('play-circle', new vscode.ThemeColor('charts.blue'));
            case 'done':
                return new vscode.ThemeIcon('check-all', new vscode.ThemeColor('charts.green'));
            default:
                return new vscode.ThemeIcon('circle-small', new vscode.ThemeColor('charts.foreground'));
        }
    }

    /**
     * Filter goals based on current settings
     */
    private filterGoals(goals: Goal[]): Goal[] {
        return goals.filter(goal => {
            // Filter completed goals if not showing them
            if (!this.showCompleted && goal.status === 'completed') {
                return false;
            }
            return true;
        });
    }

    /**
     * Filter tasks based on current settings
     */
    private filterTasks(tasks: Task[]): Task[] {
        return tasks.filter(task => {
            // Filter completed tasks if not showing them
            if (!this.showCompleted && task.status === 'done') {
                return false;
            }
            return true;
        });
    }

    /**
     * Filter and sort goals with performance optimization
     */
    private filterAndSortGoals(goals: Goal[]): Goal[] {
        if (this.performanceConfig.cacheEnabled) {
            return this.memoizedFilterGoals(goals);
        }
        return this.filterAndSortGoalsInternal(goals);
    }
    
    /**
     * Internal filter and sort implementation
     */
    private filterAndSortGoalsInternal(goals: Goal[]): Goal[] {
        let filtered = this.filterGoals(goals);
        
        if (this.sortByTitle) {
            filtered = filtered.sort((a, b) => a.title.localeCompare(b.title));
        } else {
            // Sort by creation date (newest first)
            filtered = filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        
        return filtered;
    }

    /**
     * Set whether to show completed items
     */
    setShowCompleted(show: boolean, context?: vscode.ExtensionContext): void {
        if (this.showCompleted !== show) {
            this.showCompleted = show;
            this.logger.info(`Show completed changed to: ${show}`);
            
            // Clear relevant caches when filter changes
            this.clearFilterRelatedCache();
            
            // Save the preference change
            if (context) {
                this.scheduleViewStateSave(context);
            }
            
            this.refresh();
        }
    }

    /**
     * Set whether to group by status
     */
    setGroupByStatus(group: boolean, context?: vscode.ExtensionContext): void {
        if (this.groupByStatus !== group) {
            this.groupByStatus = group;
            this.logger.info(`Group by status changed to: ${group}`);
            
            // Clear grouping-related caches
            this.clearFilterRelatedCache();
            
            // Save the preference change
            if (context) {
                this.scheduleViewStateSave(context);
            }
            
            this.refresh();
        }
    }

    /**
     * Set whether to sort by title
     */
    setSortByTitle(sort: boolean, context?: vscode.ExtensionContext): void {
        if (this.sortByTitle !== sort) {
            this.sortByTitle = sort;
            this.logger.info(`Sort by title changed to: ${sort}`);
            
            // Clear sorting-related caches
            this.clearFilterRelatedCache();
            
            // Save the preference change
            if (context) {
                this.scheduleViewStateSave(context);
            }
            
            this.refresh();
        }
    }

    /**
     * Set whether to enable auto refresh
     */
    setAutoRefresh(autoRefresh: boolean, context?: vscode.ExtensionContext): void {
        if (this.autoRefresh !== autoRefresh) {
            this.autoRefresh = autoRefresh;
            this.logger.info(`Auto refresh changed to: ${autoRefresh}`);
            
            // Save the preference change
            if (context) {
                this.scheduleViewStateSave(context);
            }
        }
    }
    
    /**
     * Clear caches related to filtering and sorting
     */
    private clearFilterRelatedCache(): void {
        // Clear children caches since filtering affects what children are shown
        for (const [key, _] of this.cache.entries()) {
            if (key.startsWith('children_') || key.startsWith('treeItem_')) {
                this.cache.delete(key);
            }
        }
        
        // Clear memoized filter functions
        this.memoizedFilterGoals.clearCache();
    }

    /**
     * Get current view state for persistence
     */
    getViewState(): { [key: string]: boolean } {
        return { ...this.viewState };
    }

    /**
     * Set view state for restoring expanded/collapsed state
     */
    setViewState(viewState: { [key: string]: boolean }): void {
        this.viewState = { ...viewState };
        this.logger.info(`Restored view state for ${Object.keys(viewState).length} items`);
        
        // Trigger refresh to apply the new state
        this.refresh();
    }
    
    /**
     * Save view state to workspace storage
     */
    async saveViewState(context: vscode.ExtensionContext): Promise<void> {
        try {
            await context.workspaceState.update('goalTree.viewState', this.viewState);
            this.logger.debug('View state saved to workspace storage');
        } catch (error) {
            this.logger.error('Error saving view state', error);
        }
    }
    
    /**
     * Load view state from workspace storage
     */
    async loadViewState(context: vscode.ExtensionContext): Promise<void> {
        try {
            const savedState = context.workspaceState.get<{ [key: string]: boolean }>('goalTree.viewState', {});
            this.setViewState(savedState);
            this.logger.debug('View state loaded from workspace storage');
        } catch (error) {
            this.logger.error('Error loading view state', error);
        }
    }
    
    /**
     * Auto-save view state with debouncing
     */
    private scheduleViewStateSave(context?: vscode.ExtensionContext): void {
        if (!context) return;
        
        const debouncedSave = this.debounceManager.getDebounced(
            'saveViewState',
            () => this.saveViewState(context),
            DebouncePresets.AUTO_SAVE
        );
        
        debouncedSave();
    }

    /**
     * Update view state when items are expanded/collapsed
     */
    onTreeItemExpanded(element: string, context?: vscode.ExtensionContext): void {
        this.viewState[element] = true;
        this.logger.debug(`Item expanded: ${element}`);
        
        // Auto-save the state
        this.scheduleViewStateSave(context);
        
        // Trigger loading of children if lazy loading is enabled
        if (this.performanceConfig.enableLazyLoading) {
            this.loadChildrenIfNeeded(element);
        }
    }

    /**
     * Update view state when items are collapsed
     */
    onTreeItemCollapsed(element: string, context?: vscode.ExtensionContext): void {
        this.viewState[element] = false;
        this.logger.debug(`Item collapsed: ${element}`);
        
        // Auto-save the state
        this.scheduleViewStateSave(context);
    }
    
    /**
     * Load children for an element if not already loaded (lazy loading support)
     */
    private loadChildrenIfNeeded(element: string): void {
        if (this.loadingStates.has(element)) {
            return; // Already loading
        }
        
        this.loadingStates.add(element);
        
        // Use a timeout to simulate async loading and prevent blocking
        setTimeout(() => {
            try {
                // Clear cache for this element to force reload
                const cacheKey = `children_${element}`;
                this.cache.delete(cacheKey);
                
                // Trigger refresh for this specific element
                this._onDidChangeTreeData.fire(element);
                
                this.logger.debug(`Lazy loaded children for: ${element}`);
            } catch (error) {
                this.logger.error(`Error lazy loading children for ${element}`, error);
            } finally {
                this.loadingStates.delete(element);
            }
        }, 10); // Small delay to prevent blocking the UI
    }

    /**
     * Get whether an item should be expanded (for initial state)
     */
    isExpanded(element: string): boolean {
        return this.viewState[element] === true;
    }
    
    // Performance and Caching Utilities
    
    /**
     * Cache management utilities
     */
    private setCache<T>(key: string, value: T, ttl: number = 30000): void {
        try {
            // Clean up expired entries
            this.cleanupCache();
            
            const entry: CacheEntry<T> = {
                data: value,
                timestamp: Date.now(),
                ttl: ttl
            };
            
            this.cache.set(key, entry);
            
            // Limit cache size
            if (this.cache.size > this.performanceConfig.maxCacheSize) {
                const oldestKey = this.cache.keys().next().value;
                this.cache.delete(oldestKey);
            }
        } catch (error) {
            this.logger.error('Error setting cache entry', error);
        }
    }
    
    private getFromCache<T>(key: string): T | null {
        try {
            const entry = this.cache.get(key) as CacheEntry<T> | undefined;
            if (!entry) {
                return null;
            }
            
            // Check if expired
            if (Date.now() - entry.timestamp > entry.ttl) {
                this.cache.delete(key);
                return null;
            }
            
            return entry.data;
        } catch (error) {
            this.logger.error('Error getting cache entry', error);
            return null;
        }
    }
    
    private clearStaleCache(): void {
        try {
            const now = Date.now();
            const keysToDelete: string[] = [];
            
            for (const [key, entry] of this.cache.entries()) {
                if (now - entry.timestamp > entry.ttl) {
                    keysToDelete.push(key);
                }
            }
            
            keysToDelete.forEach(key => this.cache.delete(key));
            
            if (keysToDelete.length > 0) {
                this.logger.debug(`Cleared ${keysToDelete.length} stale cache entries`);
            }
        } catch (error) {
            this.logger.error('Error clearing stale cache', error);
        }
    }
    
    private cleanupCache(): void {
        this.clearStaleCache();
    }
    
    /**
     * Error handling utility
     */
    private handleError(operation: string, error: any): void {
        this.logger.error(`Error in ${operation}`, error);
        
        // Show user-friendly error message
        const message = error?.message || ERROR_MESSAGES.STORAGE_ERROR;
        vscode.window.showErrorMessage(`Goal Tree: ${message}`);
        
        // Clear related cache entries on error
        if (operation === 'getChildren' || operation === 'getTreeItem') {
            this.cache.clear();
        }
    }
    
    /**
     * Performance monitoring utilities
     */
    getPerformanceStats(): any {
        const stats = {
            cacheSize: this.cache.size,
            loadingStates: this.loadingStates.size,
            expandedItems: Object.keys(this.viewState).filter(key => this.viewState[key]).length,
            totalTrackedItems: Object.keys(this.viewState).length,
            debounceInfo: this.debounceManager.getAllInfo(),
            profilerStats: this.profiler.getStats(),
            config: this.performanceConfig
        };
        
        this.logger.debug('Performance stats requested', stats);
        return stats;
    }
    
    /**
     * Reset performance components
     */
    resetPerformanceComponents(preserveViewState: boolean = false): void {
        this.cache.clear();
        this.loadingStates.clear();
        this.debounceManager.clear();
        this.profiler.reset();
        
        if (!preserveViewState) {
            this.viewState = {};
        }
        
        // Clear memoized caches
        this.memoizedGetProgress.clearCache();
        this.memoizedCreateTooltip.clearCache();
        this.memoizedFilterGoals.clearCache();
        
        this.logger.info('Performance components reset', { preserveViewState });
    }
    
    /**
     * Update performance configuration
     */
    updatePerformanceConfig(newConfig: Partial<PerformanceConfig>): void {
        this.performanceConfig = { ...this.performanceConfig, ...newConfig };
        
        // Reinitialize components if needed
        if (newConfig.maxCacheSize !== undefined) {
            // Clear cache if size limit is reduced
            if (this.cache.size > newConfig.maxCacheSize) {
                this.cache.clear();
            }
        }
        
        this.logger.info('Performance configuration updated', newConfig);
    }
    
    // ===========================================
    // Task-Specific Tree Operations
    // ===========================================

    /**
     * Toggle task completion status
     */
    async toggleTaskStatus(goalId: string, taskId: string): Promise<boolean> {
        try {
            const goal = this.stateManager.getGoal(goalId);
            if (!goal) {
                this.logger.error(`Goal ${goalId} not found`);
                return false;
            }

            const task = goal.tasks.find(t => t.id === taskId);
            if (!task) {
                this.logger.error(`Task ${taskId} not found in goal ${goalId}`);
                return false;
            }

            // Determine new status based on current status
            let newStatus: 'todo' | 'in-progress' | 'done';
            switch (task.status) {
                case 'todo':
                    newStatus = 'in-progress';
                    break;
                case 'in-progress':
                    newStatus = 'done';
                    break;
                case 'done':
                    newStatus = 'todo';
                    break;
                default:
                    newStatus = 'in-progress';
            }

            const result = await this.taskManager.updateTaskStatus(taskId, newStatus);
            if (result.success) {
                this.logger.debug(`Task ${taskId} status updated to ${newStatus}`);
                this.refresh();
                return true;
            } else {
                this.logger.error(`Failed to update task status: ${result.error}`);
                vscode.window.showErrorMessage(`Failed to update task: ${result.error}`);
                return false;
            }
        } catch (error) {
            this.logger.error('Error toggling task status', error);
            vscode.window.showErrorMessage('Failed to update task status');
            return false;
        }
    }

    /**
     * Move task up in the order
     */
    async moveTaskUp(goalId: string, taskId: string): Promise<boolean> {
        try {
            const result = await this.taskManager.moveTaskUp(taskId);
            if (result.success) {
                this.logger.debug(`Task ${taskId} moved up`);
                this.refresh();
                return true;
            } else {
                this.logger.error(`Failed to move task up: ${result.error}`);
                if (result.error?.includes('already at top')) {
                    vscode.window.showInformationMessage('Task is already at the top');
                } else {
                    vscode.window.showErrorMessage(`Failed to move task: ${result.error}`);
                }
                return false;
            }
        } catch (error) {
            this.logger.error('Error moving task up', error);
            vscode.window.showErrorMessage('Failed to move task');
            return false;
        }
    }

    /**
     * Move task down in the order
     */
    async moveTaskDown(goalId: string, taskId: string): Promise<boolean> {
        try {
            const result = await this.taskManager.moveTaskDown(taskId);
            if (result.success) {
                this.logger.debug(`Task ${taskId} moved down`);
                this.refresh();
                return true;
            } else {
                this.logger.error(`Failed to move task down: ${result.error}`);
                if (result.error?.includes('already at bottom')) {
                    vscode.window.showInformationMessage('Task is already at the bottom');
                } else {
                    vscode.window.showErrorMessage(`Failed to move task: ${result.error}`);
                }
                return false;
            }
        } catch (error) {
            this.logger.error('Error moving task down', error);
            vscode.window.showErrorMessage('Failed to move task');
            return false;
        }
    }

    /**
     * Delete a task with confirmation
     */
    async deleteTask(goalId: string, taskId: string): Promise<boolean> {
        try {
            const goal = this.stateManager.getGoal(goalId);
            if (!goal) {
                this.logger.error(`Goal ${goalId} not found`);
                return false;
            }

            const task = goal.tasks.find(t => t.id === taskId);
            if (!task) {
                this.logger.error(`Task ${taskId} not found`);
                return false;
            }

            // Show confirmation dialog
            const response = await vscode.window.showWarningMessage(
                `Are you sure you want to delete the task "${task.title}"?`,
                { modal: true },
                'Delete',
                'Cancel'
            );

            if (response !== 'Delete') {
                return false;
            }

            const result = await this.taskManager.deleteTask(taskId);
            if (result.success) {
                this.logger.debug(`Task ${taskId} deleted successfully`);
                vscode.window.showInformationMessage(`Task "${task.title}" deleted`);
                this.refresh();
                return true;
            } else {
                this.logger.error(`Failed to delete task: ${result.error}`);
                vscode.window.showErrorMessage(`Failed to delete task: ${result.error}`);
                return false;
            }
        } catch (error) {
            this.logger.error('Error deleting task', error);
            vscode.window.showErrorMessage('Failed to delete task');
            return false;
        }
    }

    /**
     * Set specific task status
     */
    async setTaskStatus(goalId: string, taskId: string, status: 'todo' | 'in-progress' | 'done'): Promise<boolean> {
        try {
            const result = await this.taskManager.updateTaskStatus(taskId, status);
            if (result.success) {
                this.logger.debug(`Task ${taskId} status set to ${status}`);
                this.refresh();
                return true;
            } else {
                this.logger.error(`Failed to set task status: ${result.error}`);
                vscode.window.showErrorMessage(`Failed to update task: ${result.error}`);
                return false;
            }
        } catch (error) {
            this.logger.error('Error setting task status', error);
            vscode.window.showErrorMessage('Failed to update task status');
            return false;
        }
    }

    /**
     * Edit task title and description
     */
    async editTask(goalId: string, taskId: string): Promise<boolean> {
        try {
            const goal = this.stateManager.getGoal(goalId);
            if (!goal) {
                this.logger.error(`Goal ${goalId} not found`);
                return false;
            }

            const task = goal.tasks.find(t => t.id === taskId);
            if (!task) {
                this.logger.error(`Task ${taskId} not found`);
                return false;
            }

            // Show input dialog for title
            const newTitle = await vscode.window.showInputBox({
                title: 'Edit Task Title',
                prompt: 'Enter the new task title',
                value: task.title,
                validateInput: (value) => {
                    if (!value?.trim()) {
                        return 'Task title cannot be empty';
                    }
                    return undefined;
                }
            });

            if (!newTitle) {
                return false; // User cancelled
            }

            // Show input dialog for description
            const newDescription = await vscode.window.showInputBox({
                title: 'Edit Task Description',
                prompt: 'Enter the task description (optional)',
                value: task.description || '',
                placeHolder: 'Task description...'
            });

            const result = await this.taskManager.updateTask(taskId, {
                title: newTitle.trim(),
                description: newDescription?.trim() || undefined
            });

            if (result.success) {
                this.logger.debug(`Task ${taskId} updated successfully`);
                vscode.window.showInformationMessage(`Task "${newTitle}" updated`);
                this.refresh();
                return true;
            } else {
                this.logger.error(`Failed to update task: ${result.error}`);
                vscode.window.showErrorMessage(`Failed to update task: ${result.error}`);
                return false;
            }
        } catch (error) {
            this.logger.error('Error editing task', error);
            vscode.window.showErrorMessage('Failed to edit task');
            return false;
        }
    }

    /**
     * Perform bulk operations on multiple tasks
     */
    async performBulkTaskOperation(operation: 'complete' | 'delete' | 'reopen', taskIds: string[]): Promise<boolean> {
        try {
            if (taskIds.length === 0) {
                vscode.window.showInformationMessage('No tasks selected');
                return false;
            }

            let confirmed = true;
            let operationName = '';
            let statusUpdate: 'done' | 'todo' | undefined;

            switch (operation) {
                case 'complete':
                    operationName = 'mark as complete';
                    statusUpdate = 'done';
                    break;
                case 'delete':
                    operationName = 'delete';
                    const response = await vscode.window.showWarningMessage(
                        `Are you sure you want to delete ${taskIds.length} task(s)?`,
                        { modal: true },
                        'Delete All',
                        'Cancel'
                    );
                    confirmed = response === 'Delete All';
                    break;
                case 'reopen':
                    operationName = 'reopen';
                    statusUpdate = 'todo';
                    break;
            }

            if (!confirmed) {
                return false;
            }

            const progressOptions: vscode.ProgressOptions = {
                location: vscode.ProgressLocation.Notification,
                title: `Bulk operation: ${operationName}`,
                cancellable: false
            };

            const success = await vscode.window.withProgress(progressOptions, async (progress) => {
                progress.report({ message: `Processing ${taskIds.length} task(s)...` });

                if (operation === 'delete') {
                    const result = await this.bulkTaskOperations.bulkDeleteTasks(taskIds);
                    return result.success;
                } else if (statusUpdate) {
                    const result = await this.bulkTaskOperations.bulkUpdateTaskStatus(taskIds, statusUpdate);
                    return result.success;
                }

                return false;
            });

            if (success) {
                vscode.window.showInformationMessage(
                    `Successfully ${operation === 'complete' ? 'completed' : operation === 'delete' ? 'deleted' : 'reopened'} ${taskIds.length} task(s)`
                );
                this.refresh();
                return true;
            } else {
                vscode.window.showErrorMessage(`Failed to ${operationName} tasks`);
                return false;
            }
        } catch (error) {
            this.logger.error('Error performing bulk task operation', error);
            vscode.window.showErrorMessage(`Failed to ${operation} tasks`);
            return false;
        }
    }

    /**
     * Get task manager instance for external access
     */
    getTaskManager(): TaskManager {
        return this.taskManager;
    }

    /**
     * Get bulk task operations instance for external access
     */
    getBulkTaskOperations(): BulkTaskOperations {
        return this.bulkTaskOperations;
    }

    // ===========================================
    // Drag-and-Drop Task Reordering Support
    // ===========================================

    /**
     * Handle drag and drop task reordering
     * This method supports moving tasks within the same goal or between goals
     */
    async reorderTaskByDragDrop(
        sourceElement: string,
        targetElement: string,
        position: 'before' | 'after' | 'inside'
    ): Promise<boolean> {
        try {
            // Parse source and target elements
            const sourceInfo = this.parseElementId(sourceElement);
            const targetInfo = this.parseElementId(targetElement);

            if (!sourceInfo.isTask) {
                this.logger.warn('Source element is not a task', { sourceElement });
                return false;
            }

            // Handle task-to-task reordering (same goal)
            if (targetInfo.isTask && sourceInfo.goalId === targetInfo.goalId) {
                return await this.reorderTaskWithinGoal(
                    sourceInfo.goalId,
                    sourceInfo.taskId!,
                    targetInfo.taskId!,
                    position === 'after'
                );
            }

            // Handle task-to-goal movement (different goal)
            if (!targetInfo.isTask) {
                return await this.moveTaskToGoal(
                    sourceInfo.goalId,
                    sourceInfo.taskId!,
                    targetInfo.goalId
                );
            }

            // Handle cross-goal task reordering
            if (targetInfo.isTask && sourceInfo.goalId !== targetInfo.goalId) {
                return await this.moveTaskToGoalWithPosition(
                    sourceInfo.goalId,
                    sourceInfo.taskId!,
                    targetInfo.goalId,
                    targetInfo.taskId!,
                    position === 'after'
                );
            }

            return false;
        } catch (error) {
            this.logger.error('Error handling drag and drop reordering', error);
            vscode.window.showErrorMessage('Failed to reorder task');
            return false;
        }
    }

    /**
     * Parse element ID to determine if it's a task or goal
     */
    private parseElementId(elementId: string): {
        isTask: boolean;
        goalId: string;
        taskId?: string;
    } {
        const parts = elementId.split(':');
        if (parts.length === 2) {
            return {
                isTask: true,
                goalId: parts[0],
                taskId: parts[1]
            };
        } else {
            return {
                isTask: false,
                goalId: elementId
            };
        }
    }

    /**
     * Reorder task within the same goal
     */
    private async reorderTaskWithinGoal(
        goalId: string,
        sourceTaskId: string,
        targetTaskId: string,
        insertAfter: boolean
    ): Promise<boolean> {
        try {
            const goal = this.stateManager.getGoal(goalId);
            if (!goal) {
                return false;
            }

            const sourceIndex = goal.tasks.findIndex(t => t.id === sourceTaskId);
            const targetIndex = goal.tasks.findIndex(t => t.id === targetTaskId);

            if (sourceIndex === -1 || targetIndex === -1) {
                return false;
            }

            const newPosition = insertAfter ? targetIndex + 1 : targetIndex;
            const adjustedPosition = sourceIndex < newPosition ? newPosition - 1 : newPosition;

            const result = await this.taskManager.setTaskOrder(sourceTaskId, adjustedPosition);
            if (result.success) {
                this.refresh();
                vscode.window.showInformationMessage('Task reordered successfully');
                return true;
            }

            return false;
        } catch (error) {
            this.logger.error('Error reordering task within goal', error);
            return false;
        }
    }

    /**
     * Move task to different goal
     */
    private async moveTaskToGoal(
        sourceGoalId: string,
        taskId: string,
        targetGoalId: string
    ): Promise<boolean> {
        try {
            const sourceGoal = this.stateManager.getGoal(sourceGoalId);
            const targetGoal = this.stateManager.getGoal(targetGoalId);

            if (!sourceGoal || !targetGoal) {
                return false;
            }

            const task = sourceGoal.tasks.find(t => t.id === taskId);
            if (!task) {
                return false;
            }

            // Confirm the move operation
            const confirmation = await vscode.window.showWarningMessage(
                `Move task "${task.title}" from "${sourceGoal.title}" to "${targetGoal.title}"?`,
                { modal: true },
                'Move',
                'Cancel'
            );

            if (confirmation !== 'Move') {
                return false;
            }

            // Create task in target goal
            const createResult = await this.taskManager.createTask(targetGoalId, {
                title: task.title,
                description: task.description,
                goalId: targetGoalId
            });

            if (createResult.success) {
                // Delete task from source goal
                const deleteResult = await this.taskManager.deleteTask(taskId);
                if (deleteResult.success) {
                    this.refresh();
                    vscode.window.showInformationMessage(`Task moved to "${targetGoal.title}"`);
                    return true;
                } else {
                    // Rollback: delete the newly created task
                    await this.taskManager.deleteTask(createResult.data!.id);
                    vscode.window.showErrorMessage('Failed to move task: could not remove from source goal');
                }
            } else {
                vscode.window.showErrorMessage('Failed to move task: could not create in target goal');
            }

            return false;
        } catch (error) {
            this.logger.error('Error moving task to different goal', error);
            vscode.window.showErrorMessage('Failed to move task');
            return false;
        }
    }

    /**
     * Move task to different goal with specific position
     */
    private async moveTaskToGoalWithPosition(
        sourceGoalId: string,
        sourceTaskId: string,
        targetGoalId: string,
        targetTaskId: string,
        insertAfter: boolean
    ): Promise<boolean> {
        try {
            // First move the task to the target goal
            const moveSuccess = await this.moveTaskToGoal(sourceGoalId, sourceTaskId, targetGoalId);
            if (!moveSuccess) {
                return false;
            }

            // Then find the newly created task and reorder it
            const targetGoal = this.stateManager.getGoal(targetGoalId);
            if (!targetGoal) {
                return false;
            }

            // The newly moved task should be the last one in the target goal
            const movedTask = targetGoal.tasks[targetGoal.tasks.length - 1];
            if (movedTask) {
                await this.reorderTaskWithinGoal(targetGoalId, movedTask.id, targetTaskId, insertAfter);
            }

            return true;
        } catch (error) {
            this.logger.error('Error moving task to goal with position', error);
            return false;
        }
    }

    /**
     * Check if drag and drop is supported for the element
     */
    canDragDrop(elementId: string): boolean {
        const info = this.parseElementId(elementId);
        // Only tasks can be dragged for now
        return info.isTask;
    }

    /**
     * Get valid drop targets for a dragged element
     */
    getValidDropTargets(draggedElementId: string): string[] {
        const info = this.parseElementId(draggedElementId);
        if (!info.isTask) {
            return [];
        }

        const validTargets: string[] = [];
        
        // Get all goals as potential drop targets
        const allGoals = this.stateManager.getRootGoals();
        allGoals.forEach(goal => {
            validTargets.push(goal.id);
            
            // Add tasks from other goals as drop targets
            goal.tasks.forEach(task => {
                if (task.id !== info.taskId) {
                    validTargets.push(`${goal.id}:${task.id}`);
                }
            });
        });

        return validTargets;
    }

    // ===========================================
    // Keyboard Navigation Support for Tasks
    // ===========================================

    /**
     * Handle keyboard navigation for tree items
     */
    async handleKeyboardNavigation(
        elementId: string,
        key: string,
        modifiers: {
            ctrl?: boolean;
            shift?: boolean;
            alt?: boolean;
        } = {}
    ): Promise<boolean> {
        try {
            const info = this.parseElementId(elementId);
            
            if (info.isTask && info.taskId) {
                return await this.handleTaskKeyboardNavigation(
                    info.goalId,
                    info.taskId,
                    key,
                    modifiers
                );
            } else {
                return await this.handleGoalKeyboardNavigation(
                    info.goalId,
                    key,
                    modifiers
                );
            }
        } catch (error) {
            this.logger.error('Error handling keyboard navigation', error);
            return false;
        }
    }

    /**
     * Handle keyboard navigation specifically for tasks
     */
    private async handleTaskKeyboardNavigation(
        goalId: string,
        taskId: string,
        key: string,
        modifiers: {
            ctrl?: boolean;
            shift?: boolean;
            alt?: boolean;
        }
    ): Promise<boolean> {
        const goal = this.stateManager.getGoal(goalId);
        if (!goal) {
            return false;
        }

        const task = goal.tasks.find(t => t.id === taskId);
        if (!task) {
            return false;
        }

        switch (key.toLowerCase()) {
            // Toggle task completion with Space
            case ' ':
            case 'space':
                return await this.toggleTaskStatus(goalId, taskId);

            // Move task up with Ctrl+Up
            case 'arrowup':
                if (modifiers.ctrl) {
                    return await this.moveTaskUp(goalId, taskId);
                }
                break;

            // Move task down with Ctrl+Down
            case 'arrowdown':
                if (modifiers.ctrl) {
                    return await this.moveTaskDown(goalId, taskId);
                }
                break;

            // Edit task with F2 or Enter
            case 'f2':
            case 'enter':
                if (!modifiers.ctrl && !modifiers.shift) {
                    return await this.editTask(goalId, taskId);
                }
                break;

            // Delete task with Delete key
            case 'delete':
                if (modifiers.shift) {
                    return await this.deleteTask(goalId, taskId);
                }
                break;

            // Quick status changes
            case '1':
                if (modifiers.ctrl) {
                    return await this.setTaskStatus(goalId, taskId, 'todo');
                }
                break;
            case '2':
                if (modifiers.ctrl) {
                    return await this.setTaskStatus(goalId, taskId, 'in-progress');
                }
                break;
            case '3':
                if (modifiers.ctrl) {
                    return await this.setTaskStatus(goalId, taskId, 'done');
                }
                break;

            // Duplicate task with Ctrl+D
            case 'd':
                if (modifiers.ctrl && !modifiers.shift) {
                    return await this.duplicateTaskViaKeyboard(goalId, taskId);
                }
                break;

            // Move to top with Ctrl+Home
            case 'home':
                if (modifiers.ctrl) {
                    return await this.moveTaskToPosition(goalId, taskId, 0);
                }
                break;

            // Move to bottom with Ctrl+End
            case 'end':
                if (modifiers.ctrl) {
                    return await this.moveTaskToPosition(goalId, taskId, -1);
                }
                break;

            // Show task details with Ctrl+I
            case 'i':
                if (modifiers.ctrl) {
                    return this.showTaskDetailsViaKeyboard(goalId, taskId);
                }
                break;

            // Copy task ID with Ctrl+Shift+C
            case 'c':
                if (modifiers.ctrl && modifiers.shift) {
                    return this.copyTaskIdViaKeyboard(taskId);
                }
                break;

            default:
                return false;
        }

        return false;
    }

    /**
     * Handle keyboard navigation for goals (placeholder for future enhancement)
     */
    private async handleGoalKeyboardNavigation(
        goalId: string,
        key: string,
        modifiers: {
            ctrl?: boolean;
            shift?: boolean;
            alt?: boolean;
        }
    ): Promise<boolean> {
        // For now, just basic goal navigation
        const goal = this.stateManager.getGoal(goalId);
        if (!goal) {
            return false;
        }

        switch (key.toLowerCase()) {
            // Add new task with Ctrl+N
            case 'n':
                if (modifiers.ctrl) {
                    return await this.addTaskViaKeyboard(goalId);
                }
                break;

            // Expand/collapse with Space
            case ' ':
            case 'space':
                return await this.toggleGoalExpansion(goalId);

            default:
                return false;
        }

        return false;
    }

    /**
     * Duplicate task via keyboard shortcut
     */
    private async duplicateTaskViaKeyboard(goalId: string, taskId: string): Promise<boolean> {
        try {
            const goal = this.stateManager.getGoal(goalId);
            if (!goal) {
                return false;
            }

            const task = goal.tasks.find(t => t.id === taskId);
            if (!task) {
                return false;
            }

            const result = await this.taskManager.createTask(goalId, {
                title: `${task.title} (Copy)`,
                description: task.description,
                goalId: goalId
            });

            if (result.success) {
                this.refresh();
                vscode.window.showInformationMessage(`Task duplicated: ${task.title}`);
                return true;
            }

            return false;
        } catch (error) {
            this.logger.error('Error duplicating task via keyboard', error);
            return false;
        }
    }

    /**
     * Show task details via keyboard shortcut
     */
    private showTaskDetailsViaKeyboard(goalId: string, taskId: string): boolean {
        try {
            const goal = this.stateManager.getGoal(goalId);
            if (!goal) {
                return false;
            }

            const task = goal.tasks.find(t => t.id === taskId);
            if (!task) {
                return false;
            }

            const details = [
                `📋 ${task.title}`,
                '',
                `Status: ${task.status}`,
                `Created: ${task.createdAt.toLocaleDateString()}`,
                task.completedAt ? `Completed: ${task.completedAt.toLocaleDateString()}` : '',
                `Order: #${(task.order || 0) + 1}`,
                `Goal: ${goal.title}`,
                '',
                task.description ? `📝 ${task.description}` : 'No description',
                '',
                `Keyboard Shortcuts:`,
                '• Space: Toggle completion',
                '• Ctrl+Up/Down: Move task',
                '• F2/Enter: Edit task',
                '• Shift+Delete: Delete task',
                '• Ctrl+1/2/3: Set status',
                '• Ctrl+D: Duplicate',
                '• Ctrl+Home/End: Move to top/bottom'
            ].filter(line => line !== '').join('\n');

            vscode.window.showInformationMessage(details, { modal: true });
            return true;
        } catch (error) {
            this.logger.error('Error showing task details via keyboard', error);
            return false;
        }
    }

    /**
     * Copy task ID via keyboard shortcut
     */
    private copyTaskIdViaKeyboard(taskId: string): boolean {
        try {
            vscode.env.clipboard.writeText(taskId);
            vscode.window.showInformationMessage(`Task ID copied: ${taskId}`);
            return true;
        } catch (error) {
            this.logger.error('Error copying task ID via keyboard', error);
            return false;
        }
    }

    /**
     * Add new task via keyboard shortcut
     */
    private async addTaskViaKeyboard(goalId: string): Promise<boolean> {
        try {
            const title = await vscode.window.showInputBox({
                title: 'Add New Task',
                prompt: 'Enter task title',
                validateInput: (value) => {
                    if (!value?.trim()) {
                        return 'Task title cannot be empty';
                    }
                    return undefined;
                }
            });

            if (!title) {
                return false;
            }

            const description = await vscode.window.showInputBox({
                title: 'Task Description',
                prompt: 'Enter task description (optional)',
                placeHolder: 'Task description...'
            });

            const result = await this.taskManager.createTask(goalId, {
                title: title.trim(),
                description: description?.trim() || undefined,
                goalId: goalId
            });

            if (result.success) {
                this.refresh();
                vscode.window.showInformationMessage(`Task created: ${title}`);
                return true;
            } else {
                vscode.window.showErrorMessage(`Failed to create task: ${result.error}`);
                return false;
            }
        } catch (error) {
            this.logger.error('Error adding task via keyboard', error);
            vscode.window.showErrorMessage('Failed to add task');
            return false;
        }
    }

    /**
     * Toggle goal expansion state
     */
    private async toggleGoalExpansion(goalId: string): Promise<boolean> {
        try {
            const currentState = this.isExpanded(goalId);
            this.viewState[goalId] = !currentState;
            this.refresh();
            return true;
        } catch (error) {
            this.logger.error('Error toggling goal expansion', error);
            return false;
        }
    }

    /**
     * Get keyboard shortcuts help for the current element
     */
    getKeyboardShortcuts(elementId: string): string[] {
        const info = this.parseElementId(elementId);
        
        if (info.isTask) {
            return [
                'Space: Toggle task completion',
                'Ctrl+Up/Down: Move task up/down',
                'F2 or Enter: Edit task',
                'Shift+Delete: Delete task',
                'Ctrl+1/2/3: Set status (todo/in-progress/done)',
                'Ctrl+D: Duplicate task',
                'Ctrl+Home/End: Move to top/bottom',
                'Ctrl+I: Show task details',
                'Ctrl+Shift+C: Copy task ID'
            ];
        } else {
            return [
                'Ctrl+N: Add new task',
                'Space: Expand/collapse goal',
                'Enter: Edit goal (if supported)'
            ];
        }
    }

    /**
     * Dispose method for cleanup
     */
    dispose(context?: vscode.ExtensionContext): void {
        // Save final view state before disposal
        if (context) {
            this.saveViewState(context).catch(error => {
                this.logger.error('Error saving final view state', error);
            });
        }
        
        this.debounceManager.clear();
        this.cache.clear();
        this.loadingStates.clear();
        this.profiler.reset();
        this.taskManager?.dispose();
        this.bulkTaskOperations?.dispose();
        this.logger.info('GoalTreeProvider disposed');
    }
}