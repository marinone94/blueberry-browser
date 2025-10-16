import { BaseIPCHandler } from "./BaseIPCHandler";

/**
 * Central registry for all IPC handlers in the application.
 * 
 * This replaces the monolithic EventManager with a modular, feature-based approach.
 * Each feature registers its own handler, making the codebase more maintainable.
 * 
 * Usage:
 * ```typescript
 * const registry = new IPCRegistry();
 * registry.registerHandler(new ActivityIPCHandler(mainWindow));
 * registry.registerHandler(new TabIPCHandler(mainWindow));
 * // ...when shutting down
 * registry.cleanup();
 * ```
 */
export class IPCRegistry {
  private handlers: Map<string, BaseIPCHandler> = new Map();

  /**
   * Register a new IPC handler for a feature.
   * @param handler - The handler to register
   */
  registerHandler(handler: BaseIPCHandler): void {
    if (this.handlers.has(handler.name)) {
      console.warn(`[IPCRegistry] Handler '${handler.name}' is already registered. Skipping.`);
      return;
    }

    console.log(`[IPCRegistry] Registering handler: ${handler.name}`);
    handler.registerHandlers();
    this.handlers.set(handler.name, handler);
  }

  /**
   * Get a specific handler by name (useful for testing)
   */
  getHandler(name: string): BaseIPCHandler | undefined {
    return this.handlers.get(name);
  }

  /**
   * Check if a handler is registered
   */
  hasHandler(name: string): boolean {
    return this.handlers.has(name);
  }

  /**
   * Get all registered handler names
   */
  getHandlerNames(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Clean up all registered handlers.
   * Should be called during application shutdown.
   */
  cleanup(): void {
    console.log(`[IPCRegistry] Cleaning up ${this.handlers.size} handlers...`);
    this.handlers.forEach((handler, name) => {
      try {
        handler.cleanup();
        console.log(`[IPCRegistry] Cleaned up handler: ${name}`);
      } catch (error) {
        console.error(`[IPCRegistry] Error cleaning up handler '${name}':`, error);
      }
    });
    this.handlers.clear();
  }
}

