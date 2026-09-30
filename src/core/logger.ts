/**
 * Google Flow Prompt Automator - Logger & Debug System
 * 
 * Provides in-memory circular buffer, safe redaction of sensitive credentials,
 * formatted console output, and event subscription.
 */

import { LogEntry, LogLevel } from '../types';

export class Logger {
  private static instance: Logger;
  private logs: LogEntry[] = [];
  private maxLogs: number = 500;
  private listeners: Array<(entry: LogEntry) => void> = [];
  private debugMode: boolean = false;

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  public isDebugMode(): boolean {
    return this.debugMode;
  }

  public subscribe(listener: (entry: LogEntry) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public log(level: LogLevel, message: string, details?: unknown): LogEntry {
    if (level === 'debug' && !this.debugMode) {
      // Don't record debug logs if debug mode is off
      return {
        id: '',
        timestamp: Date.now(),
        timeFormatted: this.formatTime(Date.now()),
        level,
        message: '',
      };
    }

    const sanitizedMessage = this.redactSensitive(message);
    const sanitizedDetails = details ? this.sanitizeDetails(details) : undefined;

    const now = Date.now();
    const entry: LogEntry = {
      id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: now,
      timeFormatted: this.formatTime(now),
      level,
      message: sanitizedMessage,
      details: sanitizedDetails,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Mirror to dev console with appropriate style
    const prefix = `[FlowAutomator] [${entry.timeFormatted}]`;
    if (level === 'error') {
      console.error(prefix, sanitizedMessage, sanitizedDetails ?? '');
    } else if (level === 'warn') {
      console.warn(prefix, sanitizedMessage, sanitizedDetails ?? '');
    } else if (level === 'debug') {
      console.debug(prefix, sanitizedMessage, sanitizedDetails ?? '');
    } else {
      console.log(prefix, sanitizedMessage, sanitizedDetails ?? '');
    }

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch (err) {
        console.error('Error in log listener:', err);
      }
    }

    return entry;
  }

  public info(message: string, details?: unknown): LogEntry {
    return this.log('info', message, details);
  }

  public warn(message: string, details?: unknown): LogEntry {
    return this.log('warn', message, details);
  }

  public error(message: string, details?: unknown): LogEntry {
    return this.log('error', message, details);
  }

  public debug(message: string, details?: unknown): LogEntry {
    return this.log('debug', message, details);
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public clear(): void {
    this.logs = [];
  }

  public loadStoredLogs(storedLogs: LogEntry[]): void {
    if (Array.isArray(storedLogs)) {
      this.logs = storedLogs.slice(-this.maxLogs);
    }
  }

  public exportAsText(): string {
    return this.logs
      .map((l) => {
        const detailsStr = l.details ? ` | ${JSON.stringify(l.details)}` : '';
        return `[${l.timeFormatted}] [${l.level.toUpperCase()}] ${l.message}${detailsStr}`;
      })
      .join('\n');
  }

  private formatTime(timestamp: number): string {
    const d = new Date(timestamp);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  private redactSensitive(text: string): string {
    if (typeof text !== 'string') return text;
    // Redact Anthropic API keys (sk-ant-...) and generic auth tokens
    return text
      .replace(/sk-ant-[a-zA-Z0-9_-]{20,}/g, 'sk-ant-***REDACTED***')
      .replace(/bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi, 'Bearer ***REDACTED***')
      .replace(/key=[a-zA-Z0-9_\-]{20,}/gi, 'key=***REDACTED***');
  }

  private sanitizeDetails(details: unknown): unknown {
    try {
      const str = JSON.stringify(details);
      return JSON.parse(this.redactSensitive(str));
    } catch {
      return '[Unserializable Details]';
    }
  }
}

export const logger = Logger.getInstance();
