/**
 * Content Feature Module
 * 
 * Handles page content extraction, analysis, and categorization.
 * 
 * Components:
 * - ContentAnalyzer: Analyzes page content using LLM with screenshot + text
 * - ContentIPCHandler: IPC handlers for content extraction (get-page-content, get-page-text, get-current-url)
 */

export { ContentAnalyzer } from './ContentAnalyzer';
export { ContentIPCHandler } from './ContentIPCHandler';

