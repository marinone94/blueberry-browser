// Shared types for preload scripts
export interface ChatRequest {
  message: string;
  context: {
    url: string | null;
    content: string | null;
    text: string | null;
  };
  messageId: string;
}

export interface ChatResponse {
  messageId: string;
  content: string;
  isComplete: boolean;
}

export interface TabInfo {
  id: string;
  title: string;
  url: string;
  isActive: boolean;
}
