/**
 * Tabs Feature Module
 * 
 * This module handles all tab management functionality:
 * - Individual tab instances with WebContentsView
 * - Tab lifecycle management (create, destroy, switch)
 * - Navigation and content loading
 * - Activity tracking integration
 * - Content analysis integration
 * - IPC handlers for tab operations
 */

export { Tab } from "./Tab";
export { TabIPCHandler } from "./TabIPCHandler";
export type { HistoryCallback, TabInfo, ActiveTabInfo } from "./types";

