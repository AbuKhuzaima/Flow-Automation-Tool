/**
 * Google Flow Prompt Automator - Prompt Parser
 * 
 * Rules:
 * 1. Prompts are separated by one or more blank lines (e.g. \n\n, \r\n\r\n, \n  \t  \n).
 * 2. Ordinary single line breaks within a prompt are PRESERVED (essential for structured/detailed prompts).
 * 3. Leading and trailing whitespace of each individual prompt is trimmed.
 * 4. Completely empty entries are omitted.
 * 5. Handles both Unix (\n) and Windows (\r\n) line endings seamlessly.
 */

export interface ParsedPromptResult {
  prompts: string[];
  count: number;
  rawText: string;
}

export class PromptParser {
  /**
   * Parse a raw string of text into individual prompts separated by blank lines.
   */
  public static parse(rawText: string): ParsedPromptResult {
    if (!rawText || typeof rawText !== 'string') {
      return { prompts: [], count: 0, rawText: '' };
    }

    // Normalize Windows CRLF to standard LF for consistent processing
    const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Split on one or more blank lines (lines containing only whitespace or nothing)
    // A blank line separator is a newline followed by optional whitespace and at least one more newline
    const chunks = normalized.split(/\n\s*\n+/);

    const prompts: string[] = [];

    for (const chunk of chunks) {
      const trimmed = chunk.trim();
      if (trimmed.length > 0) {
        prompts.push(trimmed);
      }
    }

    return {
      prompts,
      count: prompts.length,
      rawText,
    };
  }

  /**
   * Parse file content from a .txt file upload.
   */
  public static parseFileContent(fileContent: string): ParsedPromptResult {
    return this.parse(fileContent);
  }

  /**
   * Preview how the text will be partitioned into prompts with indices.
   */
  public static preview(rawText: string): Array<{ index: number; preview: string; fullLength: number }> {
    const { prompts } = this.parse(rawText);
    return prompts.map((prompt, idx) => ({
      index: idx + 1,
      preview: prompt.length > 80 ? prompt.substring(0, 77) + '...' : prompt,
      fullLength: prompt.length,
    }));
  }
}
