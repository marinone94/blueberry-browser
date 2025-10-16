import type { Window } from "../../Window";

/**
 * Base class for feature-specific IPC handlers.
 * Each feature module should extend this class to handle its own IPC communication.
 * 
 * Benefits:
 * - Separation of concerns: Each feature manages its own IPC handlers
 * - Easier testing: Test handlers independently
 * - Better maintainability: Clear boundaries between features
 * - Cleaner code: No more 1400+ line EventManager
 */
export abstract class BaseIPCHandler {
  constructor(protected mainWindow: Window) {}

  /**
   * Name of this handler (for debugging and logging)
   */
  abstract get name(): string;

  /**
   * Register all IPC handlers for this feature.
   * Called once during application initialization.
   */
  abstract registerHandlers(): void;

  /**
   * Clean up event listeners when the handler is destroyed.
   * Called during application shutdown or hot reload.
   */
  abstract cleanup(): void;
}

