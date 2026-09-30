/**
 * Google Flow Prompt Automator - Download Manager
 * 
 * Handles formatting download file names, filesystem sanitization,
 * coordinating downloads via chrome.downloads or Content Script DOM trigger.
 */

import { DownloadStatus } from '../types';
import { logger } from './logger';

export class DownloadManager {
  /**
   * Format a download file name based on pattern and prompt details.
   * Allowed tokens:
   *  {index} - e.g. "001"
   *  {timestamp} - e.g. "20260929_163000"
   *  {date} - e.g. "2026-09-29"
   *  {prompt_id} - e.g. "prompt-12345"
   */
  public static formatFilename(pattern: string, index: number, promptText: string): string {
    const now = new Date();
    const padIndex = String(index).padStart(3, '0');
    const dateStr = now.toISOString().split('T')[0];
    const timestampStr = now.toISOString().replace(/[-:T]/g, '').slice(0, 15);

    let filename = pattern || 'FlowPrompt_{index}_{timestamp}';
    filename = filename.replace(/\{index\}/g, padIndex);
    filename = filename.replace(/\{timestamp\}/g, timestampStr);
    filename = filename.replace(/\{date\}/g, dateStr);

    // Sanitize for file systems (remove forbidden characters: / \ : * ? " < > |)
    filename = filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
    filename = filename.trim().replace(/\.+$/, '');

    if (!filename.toLowerCase().endsWith('.mp4') && !filename.toLowerCase().endsWith('.png')) {
      filename += '.mp4'; // Default to video/media container
    }

    return filename;
  }

  /**
   * Attempt download via Chrome Downloads API if a media URL is provided.
   */
  public static async downloadUrl(url: string, filename: string): Promise<DownloadStatus> {
    if (typeof chrome === 'undefined' || !chrome.downloads) {
      logger.warn('Chrome Downloads API not available in current environment');
      return 'DOWNLOAD_FAILED';
    }

    try {
      return await new Promise<DownloadStatus>((resolve) => {
        chrome.downloads.download(
          {
            url,
            filename,
            conflictAction: 'uniquify',
            saveAs: false,
          },
          (downloadId) => {
            if (chrome.runtime.lastError || !downloadId) {
              logger.error(
                `Download failed: ${chrome.runtime.lastError?.message || 'Unknown error'}`
              );
              resolve('DOWNLOAD_FAILED');
            } else {
              logger.info(`Download started: ID #${downloadId} -> ${filename}`);
              resolve('DOWNLOADED');
            }
          }
        );
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Exception triggering download: ${msg}`);
      return 'DOWNLOAD_FAILED';
    }
  }
}
