/**
 * Google Flow Prompt Automator - Core Type Definitions
 */

export type PromptStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUBMITTED'
  | 'GENERATING'
  | 'COMPLETED'
  | 'FAILED'
  | 'SKIPPED';

export type DownloadStatus =
  | 'NOT_REQUESTED'
  | 'DOWNLOAD_PENDING'
  | 'DOWNLOADED'
  | 'DOWNLOAD_FAILED';

export interface PromptItem {
  id: string;
  index: number;
  text: string;
  status: PromptStatus;
  downloadStatus: DownloadStatus;
  createdAt: number;
  submittedAt?: number;
  completedAt?: number;
  error?: string;
  retryCount?: number;
}

export type AutomationMode = 'SMART_DETECTION' | 'FIXED_DELAY';

export interface AutomationSettings {
  submissionDelaySec: number;        // Minimum delay between prompts (default: 10s)
  maxWaitTimeSec: number;            // Timeout for generation (default: 180s)
  postGenerationDelaySec: number;    // Additional delay after generation finishes (default: 5s)
  automationMode: AutomationMode;    // SMART_DETECTION or FIXED_DELAY
  autoDownload: boolean;             // Automatically trigger download of results
  downloadNamingPattern: string;     // E.g. "FlowPrompt_{index}_{timestamp}"
  targetTabId: number | null;        // Chrome tab ID being automated
  anthropicApiKey: string;           // Optional user-provided API key
  anthropicModel: string;            // Default: claude-3-5-sonnet-20241022 or claude-3-7-sonnet-20250219
  debugMode: boolean;                // Verbose logging enabled
  customFlowUrlPattern: string;      // User-defined extra URL match pattern
}

export type AutomationStatus =
  | 'IDLE'
  | 'RUNNING'
  | 'PAUSED'
  | 'STOPPED'
  | 'COMPLETED'
  | 'ERROR';

export interface AutomationState {
  status: AutomationStatus;
  currentIndex: number;
  currentPromptId: string | null;
  totalCount: number;
  completedCount: number;
  processingCount: number;
  failedCount: number;
  remainingCount: number;
  skippedCount: number;
  progressPercent: number;
  estimatedRemainingSeconds: number;
  currentPromptText: string;
  currentPromptStateText: string;
  lastError: string | null;
  targetTabId: number | null;
  targetTabUrl: string | null;
  targetTabConnected: boolean;
  startedAt: number | null;
  updatedAt: number;
}

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  id: string;
  timestamp: number;
  timeFormatted: string;
  level: LogLevel;
  message: string;
  details?: unknown;
}

/**
 * Messages passed between Popup, Service Worker, and Content Script
 */
export type ExtensionMessage =
  // Popup -> Service Worker
  | { type: 'START_AUTOMATION' }
  | { type: 'PAUSE_AUTOMATION' }
  | { type: 'RESUME_AUTOMATION' }
  | { type: 'STOP_AUTOMATION' }
  | { type: 'SKIP_CURRENT_PROMPT' }
  | { type: 'RETRY_PROMPT'; promptId: string }
  | { type: 'RETRY_ALL_FAILED' }
  | { type: 'REMOVE_PROMPT'; promptId: string }
  | { type: 'SET_QUEUE'; prompts: string[]; mode: 'replace' | 'append' }
  | { type: 'CLEAR_QUEUE' }
  | { type: 'RESET_PROGRESS' }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<AutomationSettings> }
  | { type: 'GET_STATE' }
  | { type: 'GET_QUEUE' }
  | { type: 'GET_LOGS' }
  | { type: 'CLEAR_LOGS' }
  | { type: 'SET_TARGET_TAB'; tabId: number }
  | { type: 'FIND_FLOW_TABS' }
  // AI Tools
  | { type: 'AI_CLEANUP_PROMPTS'; text: string }
  | { type: 'AI_SPLIT_PROMPTS'; text: string }
  | { type: 'AI_ENHANCE_PROMPTS'; text: string; style?: string }
  | { type: 'AI_TRANSFORM_PROMPTS'; text: string; instruction: string }
  | { type: 'AI_VALIDATE_PROMPTS'; text: string }
  // Service Worker -> Content Script
  | { type: 'FLOW_CHECK_STATUS' }
  | { type: 'FLOW_INSERT_PROMPT'; prompt: string }
  | { type: 'FLOW_VERIFY_INSERTION'; prompt: string }
  | { type: 'FLOW_ATTEMPT_BUTTON_SUBMIT' }
  | { type: 'FLOW_ATTEMPT_SYNTHETIC_ENTER' }
  | { type: 'FLOW_FOCUS_COMPOSER' }
  | { type: 'FLOW_DETECT_SUBMISSION' }
  | { type: 'FLOW_SUBMIT_PROMPT' }
  | { type: 'FLOW_CHECK_GENERATION_STATE' }
  | { type: 'FLOW_WAIT_GENERATION_COMPLETE'; timeoutMs: number }
  | { type: 'FLOW_TRIGGER_DOWNLOAD'; filename?: string }
  // Content Script -> Service Worker
  | { type: 'FLOW_STATUS_RESPONSE'; isFlow: boolean; hasInput: boolean; isBusy: boolean; pageUrl: string }
  | { type: 'FLOW_ACTION_RESULT'; action: string; success: boolean; error?: string; data?: unknown }
  // Service Worker -> Popup (Broadcast or on response)
  | { type: 'STATE_CHANGED'; state: AutomationState }
  | { type: 'QUEUE_CHANGED'; queue: PromptItem[] }
  | { type: 'LOG_ADDED'; log: LogEntry };

export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Modular Flow Adapter abstraction for Google Flow DOM interactions
 */
export interface FlowAdapter {
  isFlowPage(): Promise<boolean>;
  findComposer(): Promise<Element | null>;
  findPromptInput(): Promise<Element | null>;
  insertPrompt(prompt: string): Promise<boolean>;
  verifyPromptInserted(expectedText: string): Promise<boolean>;
  findSubmitButton(): Promise<Element | null>;
  isReadyToSubmit(): Promise<boolean>;
  attemptButtonSubmit(): Promise<boolean>;
  attemptSyntheticEnter(): Promise<boolean>;
  focusComposer(): Promise<boolean>;
  detectSubmission(): Promise<boolean>;
  detectGenerationStarted(timeoutMs?: number): Promise<boolean>;
  detectGenerationCompleted(timeoutMs: number): Promise<boolean>;
  submitPrompt(): Promise<boolean>;
  waitForGenerationStart(timeoutMs?: number): Promise<boolean>;
  waitForGenerationComplete(timeoutMs: number): Promise<boolean>;
  isGenerating(): boolean;
  isGenerationComplete(): boolean;
  findDownloadControl(): Promise<Element | null>;
  downloadResult(filename?: string): Promise<boolean>;
  getStatus(): {
    isFlow: boolean;
    hasInput: boolean;
    isBusy: boolean;
    pageUrl: string;
  };
}
