/**
 * Google Flow Prompt Automator - Queue Manager
 * 
 * Manages prompt queue items, statuses, transitions, reordering,
 * statistics calculation, and completion time estimations.
 */

import { PromptItem, PromptStatus, DownloadStatus } from '../types';

export interface QueueStats {
  total: number;
  completed: number;
  processing: number;
  failed: number;
  remaining: number;
  skipped: number;
  percent: number;
  estimatedRemainingSeconds: number;
}

export class QueueManager {
  private queue: PromptItem[] = [];
  private listeners: Array<(queue: PromptItem[]) => void> = [];
  private completedDurationsMs: number[] = [];

  constructor(initialQueue: PromptItem[] = []) {
    this.queue = initialQueue;
  }

  public subscribe(listener: (queue: PromptItem[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    const copy = this.getQueue();
    for (const listener of this.listeners) {
      try {
        listener(copy);
      } catch (err) {
        console.error('Error in queue listener:', err);
      }
    }
  }

  public getQueue(): PromptItem[] {
    return [...this.queue];
  }

  public setQueue(queue: PromptItem[]): void {
    this.queue = queue.map((item, idx) => ({
      ...item,
      index: idx + 1,
    }));
    this.notify();
  }

  /**
   * Add raw prompt strings to the queue (either replacing or appending)
   */
  public addPrompts(prompts: string[], mode: 'replace' | 'append' = 'append'): PromptItem[] {
    const now = Date.now();
    const startIndex = mode === 'replace' ? 0 : this.queue.length;

    const newItems: PromptItem[] = prompts.map((text, idx) => ({
      id: `prompt-${now}-${startIndex + idx}-${Math.random().toString(36).slice(2, 7)}`,
      index: startIndex + idx + 1,
      text,
      status: 'PENDING',
      downloadStatus: 'NOT_REQUESTED',
      createdAt: now,
      retryCount: 0,
    }));

    if (mode === 'replace') {
      this.queue = newItems;
      this.completedDurationsMs = [];
    } else {
      this.queue = [...this.queue, ...newItems];
      // Renumber indices
      this.renumber();
    }

    this.notify();
    return this.queue;
  }

  public removePrompt(promptId: string): boolean {
    const initialLen = this.queue.length;
    this.queue = this.queue.filter((item) => item.id !== promptId);
    if (this.queue.length !== initialLen) {
      this.renumber();
      this.notify();
      return true;
    }
    return false;
  }

  public clearQueue(): void {
    this.queue = [];
    this.completedDurationsMs = [];
    this.notify();
  }

  public resetProgress(): void {
    this.queue = this.queue.map((item) => ({
      ...item,
      status: 'PENDING',
      downloadStatus: 'NOT_REQUESTED',
      submittedAt: undefined,
      completedAt: undefined,
      error: undefined,
    }));
    this.completedDurationsMs = [];
    this.notify();
  }

  public getPromptById(promptId: string): PromptItem | undefined {
    return this.queue.find((item) => item.id === promptId);
  }

  public getNextPendingPrompt(): PromptItem | undefined {
    return this.queue.find((item) => item.status === 'PENDING');
  }

  public updatePromptStatus(
    promptId: string,
    status: PromptStatus,
    error?: string
  ): PromptItem | undefined {
    const item = this.queue.find((p) => p.id === promptId);
    if (!item) return undefined;

    const now = Date.now();
    item.status = status;

    if (status === 'SUBMITTED' && !item.submittedAt) {
      item.submittedAt = now;
    }

    if (status === 'COMPLETED') {
      item.completedAt = now;
      if (item.submittedAt) {
        this.completedDurationsMs.push(now - item.submittedAt);
        // Keep last 10 durations for rolling average
        if (this.completedDurationsMs.length > 10) {
          this.completedDurationsMs.shift();
        }
      }
      item.error = undefined;
    }

    if (status === 'FAILED') {
      item.error = error || 'Automation failed';
      item.retryCount = (item.retryCount || 0) + 1;
    }

    this.notify();
    return item;
  }

  public updateDownloadStatus(
    promptId: string,
    downloadStatus: DownloadStatus
  ): PromptItem | undefined {
    const item = this.queue.find((p) => p.id === promptId);
    if (!item) return undefined;
    item.downloadStatus = downloadStatus;
    this.notify();
    return item;
  }

  public retryPrompt(promptId: string): boolean {
    const item = this.queue.find((p) => p.id === promptId);
    if (!item) return false;
    item.status = 'PENDING';
    item.error = undefined;
    item.submittedAt = undefined;
    item.completedAt = undefined;
    this.notify();
    return true;
  }

  public retryAllFailed(): number {
    let count = 0;
    for (const item of this.queue) {
      if (item.status === 'FAILED') {
        item.status = 'PENDING';
        item.error = undefined;
        item.submittedAt = undefined;
        item.completedAt = undefined;
        count++;
      }
    }
    if (count > 0) {
      this.notify();
    }
    return count;
  }

  public skipPrompt(promptId: string): boolean {
    const item = this.queue.find((p) => p.id === promptId);
    if (!item) return false;
    item.status = 'SKIPPED';
    this.notify();
    return true;
  }

  public movePrompt(promptId: string, direction: 'up' | 'down'): boolean {
    const idx = this.queue.findIndex((p) => p.id === promptId);
    if (idx === -1) return false;
    if (direction === 'up' && idx > 0) {
      const temp = this.queue[idx];
      this.queue[idx] = this.queue[idx - 1];
      this.queue[idx - 1] = temp;
      this.renumber();
      this.notify();
      return true;
    }
    if (direction === 'down' && idx < this.queue.length - 1) {
      const temp = this.queue[idx];
      this.queue[idx] = this.queue[idx + 1];
      this.queue[idx + 1] = temp;
      this.renumber();
      this.notify();
      return true;
    }
    return false;
  }

  public getStats(delays?: { submissionDelaySec: number; postGenerationDelaySec: number; maxWaitTimeSec: number }): QueueStats {
    const total = this.queue.length;
    let completed = 0;
    let processing = 0;
    let failed = 0;
    let skipped = 0;
    let remaining = 0;

    for (const item of this.queue) {
      switch (item.status) {
        case 'COMPLETED':
          completed++;
          break;
        case 'PROCESSING':
        case 'SUBMITTED':
        case 'GENERATING':
          processing++;
          break;
        case 'FAILED':
          failed++;
          break;
        case 'SKIPPED':
          skipped++;
          break;
        case 'PENDING':
        default:
          remaining++;
          break;
      }
    }

    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

    // Calculate estimated remaining seconds
    let estimatedRemainingSeconds = 0;
    if (remaining > 0 || processing > 0) {
      const pendingCount = remaining + processing;
      let avgDurationSec: number;

      if (this.completedDurationsMs.length > 0) {
        const sumMs = this.completedDurationsMs.reduce((a, b) => a + b, 0);
        avgDurationSec = sumMs / this.completedDurationsMs.length / 1000;
      } else {
        // Default estimate when no completed prompts yet
        avgDurationSec = Math.min(45, (delays?.maxWaitTimeSec || 180) / 2);
      }

      const submissionDelay = delays?.submissionDelaySec || 10;
      const postGenDelay = delays?.postGenerationDelaySec || 5;
      const cycleTimePerPrompt = avgDurationSec + submissionDelay + postGenDelay;

      estimatedRemainingSeconds = Math.round(pendingCount * cycleTimePerPrompt);
    }

    return {
      total,
      completed,
      processing,
      failed,
      remaining,
      skipped,
      percent,
      estimatedRemainingSeconds,
    };
  }

  public hasActiveOrCompletedProgress(): boolean {
    return this.queue.some(
      (item) => item.status === 'COMPLETED' || item.status === 'PROCESSING' || item.status === 'SUBMITTED' || item.status === 'GENERATING'
    );
  }

  private renumber(): void {
    this.queue.forEach((item, idx) => {
      item.index = idx + 1;
    });
  }
}
