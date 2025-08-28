/**
 * EventManager Service - Advanced event handling system
 * 
 * This service provides advanced event management capabilities including:
 * - Event persistence and storage
 * - Event filtering and querying
 * - Event replay functionality
 * - Batch event processing
 * - Event lifecycle management
 */

import {
    GoalEvent,
    GoalEventType,
    GoalEventTypeType,
    GoalEventHandler,
    GoalEventEmitter,
    GoalEventStore,
    GoalEventUtils,
    BaseGoalEvent
} from '../types';

/**
 * Event subscription interface
 */
interface EventSubscription {
    id: string;
    eventTypes: GoalEventTypeType[];
    handler: GoalEventHandler;
    once: boolean;
    filter?: (event: GoalEvent) => boolean;
    priority?: number;
}

/**
 * Event processing options
 */
interface EventProcessingOptions {
    async: boolean;
    batchSize?: number;
    delay?: number;
    retryCount?: number;
}

/**
 * Event query interface
 */
interface EventQuery {
    eventTypes?: GoalEventTypeType[];
    goalIds?: string[];
    startDate?: Date;
    endDate?: Date;
    source?: 'user' | 'system' | 'external';
    limit?: number;
    offset?: number;
    sortOrder?: 'asc' | 'desc';
}

/**
 * EventManager provides advanced event management capabilities
 */
export class EventManager implements GoalEventEmitter {
    private subscriptions: Map<string, EventSubscription[]> = new Map();
    private eventStore: GoalEventStore | null = null;
    private eventHistory: GoalEvent[] = [];
    private maxHistorySize: number = 1000;
    private batchQueue: GoalEvent[] = [];
    private batchTimer: NodeJS.Timeout | null = null;
    private batchProcessingOptions: EventProcessingOptions = {
        async: true,
        batchSize: 10,
        delay: 100,
        retryCount: 3
    };
    private logger: (message: string) => void;
    private isDisposed: boolean = false;

    constructor(
        eventStore?: GoalEventStore,
        maxHistorySize: number = 1000,
        logger?: (message: string) => void
    ) {
        this.eventStore = eventStore || null;
        this.maxHistorySize = maxHistorySize;
        this.logger = logger || ((message: string) => console.log(`EventManager: ${message}`));
        this.log('EventManager initialized');
    }

    // ===========================================
    // Core Event Emission Methods
    // ===========================================

    /**
     * Emit an event to all subscribers
     */
    async emit<T extends GoalEvent>(event: T): Promise<void> {
        if (this.isDisposed) {
            throw new Error('EventManager has been disposed');
        }

        try {
            // Validate event
            this.validateEvent(event);

            // Add to history
            this.addToHistory(event);

            // Store event if persistence is available
            if (this.eventStore) {
                await this.eventStore.store(event);
            }

            // Get all subscriptions for this event type
            const subscriptions = this.getMatchingSubscriptions(event);

            // Sort by priority (higher priority first)
            subscriptions.sort((a, b) => (b.priority || 0) - (a.priority || 0));

            // Process subscriptions
            await this.processSubscriptions(event, subscriptions);

            this.log(`Event emitted: ${event.type} (${event.id})`);

        } catch (error) {
            this.logError('Failed to emit event', error);
            throw error;
        }
    }

    /**
     * Emit multiple events as a batch
     */
    async emitBatch(events: GoalEvent[]): Promise<void> {
        if (this.isDisposed) {
            throw new Error('EventManager has been disposed');
        }

        try {
            if (events.length === 0) return;

            // Validate all events first
            events.forEach(event => this.validateEvent(event));

            // Process in configured batch sizes
            const batchSize = this.batchProcessingOptions.batchSize || 10;
            
            for (let i = 0; i < events.length; i += batchSize) {
                const batch = events.slice(i, i + batchSize);
                
                // Process batch
                await Promise.all(batch.map(event => this.emit(event)));

                // Add delay between batches if configured
                if (this.batchProcessingOptions.delay && i + batchSize < events.length) {
                    await this.delay(this.batchProcessingOptions.delay);
                }
            }

            this.log(`Batch emitted: ${events.length} events processed`);

        } catch (error) {
            this.logError('Failed to emit event batch', error);
            throw error;
        }
    }

    /**
     * Queue event for batch processing
     */
    queueEvent(event: GoalEvent): void {
        if (this.isDisposed) return;

        this.batchQueue.push(event);

        // Start batch timer if not already running
        if (!this.batchTimer && this.batchQueue.length > 0) {
            this.batchTimer = setTimeout(() => {
                this.processBatchQueue();
            }, this.batchProcessingOptions.delay || 100);
        }
    }

    // ===========================================
    // Subscription Management
    // ===========================================

    /**
     * Register an event listener
     */
    on<T extends GoalEvent>(
        eventType: T['type'] | T['type'][],
        handler: GoalEventHandler<T>,
        options?: {
            once?: boolean;
            filter?: (event: T) => boolean;
            priority?: number;
        }
    ): string {
        const eventTypes = Array.isArray(eventType) ? eventType : [eventType];
        const subscriptionId = this.generateSubscriptionId();

        const subscription: EventSubscription = {
            id: subscriptionId,
            eventTypes,
            handler: handler as GoalEventHandler,
            once: options?.once || false,
            filter: options?.filter as ((event: GoalEvent) => boolean) | undefined,
            priority: options?.priority || 0
        };

        // Add to subscriptions for each event type
        eventTypes.forEach(type => {
            const typeSubscriptions = this.subscriptions.get(type) || [];
            typeSubscriptions.push(subscription);
            this.subscriptions.set(type, typeSubscriptions);
        });

        this.log(`Event listener registered for ${eventTypes.join(', ')} (${subscriptionId})`);
        return subscriptionId;
    }

    /**
     * Register a one-time event listener
     */
    once<T extends GoalEvent>(
        eventType: T['type'],
        handler: GoalEventHandler<T>,
        options?: {
            filter?: (event: T) => boolean;
            priority?: number;
        }
    ): string {
        return this.on(eventType, handler, { ...options, once: true });
    }

    /**
     * Remove an event listener
     */
    off<T extends GoalEvent>(
        eventType: T['type'] | T['type'][],
        handler: GoalEventHandler<T>
    ): void {
        const eventTypes = Array.isArray(eventType) ? eventType : [eventType];

        eventTypes.forEach(type => {
            const typeSubscriptions = this.subscriptions.get(type) || [];
            const filteredSubscriptions = typeSubscriptions.filter(sub => sub.handler !== handler);
            
            if (filteredSubscriptions.length === 0) {
                this.subscriptions.delete(type);
            } else {
                this.subscriptions.set(type, filteredSubscriptions);
            }
        });

        this.log(`Event listener removed for ${eventTypes.join(', ')}`);
    }

    /**
     * Remove event listener by subscription ID
     */
    offById(subscriptionId: string): void {
        let removed = false;

        for (const [eventType, subscriptions] of this.subscriptions) {
            const filteredSubscriptions = subscriptions.filter(sub => sub.id !== subscriptionId);
            
            if (filteredSubscriptions.length !== subscriptions.length) {
                removed = true;
                if (filteredSubscriptions.length === 0) {
                    this.subscriptions.delete(eventType);
                } else {
                    this.subscriptions.set(eventType, filteredSubscriptions);
                }
            }
        }

        if (removed) {
            this.log(`Event listener removed by ID: ${subscriptionId}`);
        }
    }

    /**
     * Remove all event listeners for given type(s)
     */
    removeAllListeners(eventType?: GoalEventTypeType): void {
        if (eventType) {
            this.subscriptions.delete(eventType);
            this.log(`All listeners removed for event type: ${eventType}`);
        } else {
            this.subscriptions.clear();
            this.log('All event listeners removed');
        }
    }

    /**
     * Get list of event types that have listeners
     */
    listenerEventTypes(): GoalEventTypeType[] {
        return Array.from(this.subscriptions.keys()) as GoalEventTypeType[];
    }

    /**
     * Get number of listeners for an event type
     */
    listenerCount(eventType: GoalEventTypeType): number {
        return (this.subscriptions.get(eventType) || []).length;
    }

    // ===========================================
    // Event History and Query Methods
    // ===========================================

    /**
     * Get event history with optional filtering
     */
    getEventHistory(query?: EventQuery): GoalEvent[] {
        let events = [...this.eventHistory];

        if (query) {
            events = this.filterEvents(events, query);
        }

        return events;
    }

    /**
     * Query events from store if available
     */
    async queryEvents(query: EventQuery): Promise<GoalEvent[]> {
        if (this.eventStore) {
            return await this.eventStore.getEvents({
                eventTypes: query.eventTypes,
                goalIds: query.goalIds,
                startDate: query.startDate,
                endDate: query.endDate,
                limit: query.limit,
                offset: query.offset
            });
        }

        // Fall back to in-memory history
        return this.getEventHistory(query);
    }

    /**
     * Get events for a specific goal
     */
    async getGoalEvents(goalId: string, eventTypes?: GoalEventTypeType[]): Promise<GoalEvent[]> {
        if (this.eventStore) {
            return await this.eventStore.getGoalEvents(goalId, eventTypes);
        }

        // Fall back to in-memory history
        return this.getEventHistory({
            goalIds: [goalId],
            eventTypes
        });
    }

    /**
     * Replay events for a specific goal
     */
    async replayGoalEvents(goalId: string, eventTypes?: GoalEventTypeType[]): Promise<void> {
        const events = await this.getGoalEvents(goalId, eventTypes);
        
        // Sort events by timestamp
        events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        // Re-emit events
        for (const event of events) {
            // Create a replay event with modified metadata
            const replayEvent: GoalEvent = {
                ...event,
                id: GoalEventUtils.generateEventId(),
                timestamp: new Date(),
                source: 'system',
                metadata: {
                    ...event.metadata,
                    isReplay: true,
                    originalEventId: event.id,
                    originalTimestamp: event.timestamp
                }
            };

            await this.emit(replayEvent);
        }

        this.log(`Replayed ${events.length} events for goal ${goalId}`);
    }

    // ===========================================
    // Event Store Management
    // ===========================================

    /**
     * Set event store for persistence
     */
    setEventStore(eventStore: GoalEventStore): void {
        this.eventStore = eventStore;
        this.log('Event store configured');
    }

    /**
     * Clear old events from history and store
     */
    async clearOldEvents(beforeDate: Date): Promise<number> {
        let clearedCount = 0;

        // Clear from in-memory history
        const originalLength = this.eventHistory.length;
        this.eventHistory = this.eventHistory.filter(event => event.timestamp >= beforeDate);
        clearedCount += originalLength - this.eventHistory.length;

        // Clear from store if available
        if (this.eventStore) {
            clearedCount += await this.eventStore.clearOldEvents(beforeDate);
        }

        this.log(`Cleared ${clearedCount} old events before ${beforeDate.toISOString()}`);
        return clearedCount;
    }

    // ===========================================
    // Configuration Methods
    // ===========================================

    /**
     * Configure batch processing options
     */
    configureBatchProcessing(options: Partial<EventProcessingOptions>): void {
        this.batchProcessingOptions = {
            ...this.batchProcessingOptions,
            ...options
        };
        this.log('Batch processing options updated');
    }

    /**
     * Set maximum history size
     */
    setMaxHistorySize(size: number): void {
        this.maxHistorySize = size;
        this.trimHistory();
        this.log(`Max history size set to ${size}`);
    }

    // ===========================================
    // Private Helper Methods
    // ===========================================

    private validateEvent(event: GoalEvent): void {
        if (!event.id || !event.type || !event.timestamp) {
            throw new Error('Invalid event: missing required fields');
        }

        if (!Object.values(GoalEventType).includes(event.type as GoalEventType)) {
            throw new Error(`Invalid event type: ${event.type}`);
        }
    }

    private addToHistory(event: GoalEvent): void {
        this.eventHistory.push(event);
        this.trimHistory();
    }

    private trimHistory(): void {
        if (this.eventHistory.length > this.maxHistorySize) {
            const excess = this.eventHistory.length - this.maxHistorySize;
            this.eventHistory.splice(0, excess);
        }
    }

    private getMatchingSubscriptions(event: GoalEvent): EventSubscription[] {
        const subscriptions = this.subscriptions.get(event.type) || [];
        
        return subscriptions.filter(subscription => {
            // Apply custom filter if provided
            if (subscription.filter && !subscription.filter(event)) {
                return false;
            }
            return true;
        });
    }

    private async processSubscriptions(event: GoalEvent, subscriptions: EventSubscription[]): Promise<void> {
        const promises: Promise<void>[] = [];

        for (const subscription of subscriptions) {
            if (this.batchProcessingOptions.async) {
                promises.push(this.processSubscription(event, subscription));
            } else {
                await this.processSubscription(event, subscription);
            }
        }

        if (promises.length > 0) {
            await Promise.allSettled(promises);
        }
    }

    private async processSubscription(event: GoalEvent, subscription: EventSubscription): Promise<void> {
        try {
            await subscription.handler(event);

            // Remove one-time listeners
            if (subscription.once) {
                this.offById(subscription.id);
            }

        } catch (error) {
            this.logError(`Event handler failed for subscription ${subscription.id}`, error);
            
            // Optionally retry with backoff
            if (this.batchProcessingOptions.retryCount && this.batchProcessingOptions.retryCount > 0) {
                await this.retrySubscription(event, subscription, this.batchProcessingOptions.retryCount);
            }
        }
    }

    private async retrySubscription(
        event: GoalEvent,
        subscription: EventSubscription,
        retriesLeft: number
    ): Promise<void> {
        if (retriesLeft <= 0) return;

        try {
            await this.delay(100 * (4 - retriesLeft)); // Exponential backoff
            await subscription.handler(event);
            
            // Remove one-time listeners on success
            if (subscription.once) {
                this.offById(subscription.id);
            }

        } catch (error) {
            this.logError(`Event handler retry failed for subscription ${subscription.id}`, error);
            
            if (retriesLeft > 1) {
                await this.retrySubscription(event, subscription, retriesLeft - 1);
            }
        }
    }

    private async processBatchQueue(): Promise<void> {
        if (this.batchQueue.length === 0) {
            this.batchTimer = null;
            return;
        }

        const events = [...this.batchQueue];
        this.batchQueue = [];
        this.batchTimer = null;

        try {
            await this.emitBatch(events);
        } catch (error) {
            this.logError('Failed to process batch queue', error);
        }
    }

    private filterEvents(events: GoalEvent[], query: EventQuery): GoalEvent[] {
        return events.filter(event => {
            // Filter by event types
            if (query.eventTypes && !query.eventTypes.includes(event.type)) {
                return false;
            }

            // Filter by goal IDs
            if (query.goalIds) {
                const eventGoalId = GoalEventUtils.extractGoalId(event);
                if (!eventGoalId || !query.goalIds.includes(eventGoalId)) {
                    return false;
                }
            }

            // Filter by date range
            if (query.startDate && event.timestamp < query.startDate) {
                return false;
            }
            if (query.endDate && event.timestamp > query.endDate) {
                return false;
            }

            // Filter by source
            if (query.source && event.source !== query.source) {
                return false;
            }

            return true;
        })
        .sort((a, b) => {
            const sortOrder = query.sortOrder || 'desc';
            const multiplier = sortOrder === 'asc' ? 1 : -1;
            return (a.timestamp.getTime() - b.timestamp.getTime()) * multiplier;
        })
        .slice(query.offset || 0, (query.offset || 0) + (query.limit || events.length));
    }

    private generateSubscriptionId(): string {
        return `sub_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    private async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private log(message: string): void {
        this.logger(message);
    }

    private logError(message: string, error: unknown): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger(`ERROR: ${message} - ${errorMessage}`);
    }

    // ===========================================
    // Lifecycle Methods
    // ===========================================

    /**
     * Dispose of the EventManager and clean up resources
     */
    dispose(): void {
        if (this.isDisposed) return;

        // Clear batch timer
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }

        // Clear all subscriptions
        this.subscriptions.clear();

        // Clear event history
        this.eventHistory = [];

        // Clear batch queue
        this.batchQueue = [];

        // Remove event store reference
        this.eventStore = null;

        this.isDisposed = true;
        this.log('EventManager disposed');
    }
}

/**
 * Create a default EventManager instance
 */
export function createEventManager(
    eventStore?: GoalEventStore,
    maxHistorySize?: number,
    logger?: (message: string) => void
): EventManager {
    return new EventManager(eventStore, maxHistorySize, logger);
}