/**
 * Input Sanitization Service
 * 
 * Provides XSS prevention by sanitizing all user-provided text inputs.
 * Removes/escapes HTML tags, script content, and potentially dangerous characters.
 * 
 * Requirements: 9.8 - THE System SHALL validate all WebSocket messages for proper format and authorization
 * 
 * This service sanitizes:
 * - Quiz titles and descriptions
 * - Question text and explanation text
 * - Option text
 * - Participant nicknames
 * - Speaker notes
 */

/**
 * HTML entities map for encoding special characters
 */
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

/**
 * Patterns for detecting potentially dangerous content
 */
const DANGEROUS_PATTERNS = [
  // Script tags and content
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  // Event handlers
  /\bon\w+\s*=/gi,
  // JavaScript URLs
  /javascript:/gi,
  // Data URLs with script content
  /data:\s*text\/html/gi,
  // VBScript URLs
  /vbscript:/gi,
  // Expression CSS
  /expression\s*\(/gi,
  // Import statements
  /@import/gi,
  // Binding expressions
  /\{\{.*\}\}/g,
  // Angular/Vue expressions
  /\[\[.*\]\]/g,
];

/**
 * Patterns for HTML tags to strip
 */
const HTML_TAG_PATTERN = /<[^>]*>/g;

/**
 * Patterns for control characters that should be removed
 */
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Options for sanitization
 */
export interface SanitizationOptions {
  /** Whether to strip all HTML tags (default: true) */
  stripHtml?: boolean;
  /** Whether to encode HTML entities (default: true) */
  encodeEntities?: boolean;
  /** Whether to trim whitespace (default: true) */
  trim?: boolean;
  /** Whether to normalize whitespace (collapse multiple spaces) (default: false) */
  normalizeWhitespace?: boolean;
  /** Maximum length to truncate to (default: no limit) */
  maxLength?: number;
  /** Whether to allow newlines (default: true) */
  allowNewlines?: boolean;
}

/**
 * Default sanitization options
 */
const DEFAULT_OPTIONS: SanitizationOptions = {
  stripHtml: true,
  encodeEntities: true,
  trim: true,
  normalizeWhitespace: false,
  allowNewlines: true,
};

/**
 * Input Sanitization Service
 * 
 * Provides methods to sanitize user input and prevent XSS attacks.
 */
class InputSanitizationService {
  /**
   * Sanitize a string input to prevent XSS attacks
   * 
   * @param input - The input string to sanitize
   * @param options - Sanitization options
   * @returns The sanitized string
   */
  sanitize(input: string | null | undefined, options: SanitizationOptions = {}): string {
    // Handle null/undefined
    if (input == null) {
      return '';
    }

    // Convert to string if not already
    let sanitized = String(input);

    // Merge options with defaults
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Remove control characters
    sanitized = sanitized.replace(CONTROL_CHAR_PATTERN, '');

    // Remove dangerous patterns first (before any encoding)
    for (const pattern of DANGEROUS_PATTERNS) {
      sanitized = sanitized.replace(pattern, '');
    }

    // Strip HTML tags if requested
    if (opts.stripHtml) {
      sanitized = this.stripHtmlTags(sanitized);
    }

    // Encode HTML entities if requested
    if (opts.encodeEntities) {
      sanitized = this.encodeHtmlEntities(sanitized);
    }

    // Handle newlines
    if (!opts.allowNewlines) {
      sanitized = sanitized.replace(/[\r\n]/g, ' ');
    }

    // Normalize whitespace if requested
    if (opts.normalizeWhitespace) {
      sanitized = sanitized.replace(/\s+/g, ' ');
    }

    // Trim if requested
    if (opts.trim) {
      sanitized = sanitized.trim();
    }

    // Truncate if maxLength specified
    if (opts.maxLength && sanitized.length > opts.maxLength) {
      sanitized = sanitized.substring(0, opts.maxLength);
    }

    return sanitized;
  }

  /**
   * Strip all HTML tags from a string
   * 
   * @param input - The input string
   * @returns String with HTML tags removed
   */
  stripHtmlTags(input: string): string {
    // First decode any HTML entities that might be hiding tags
    let decoded = input
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#60;/gi, '<')
      .replace(/&#62;/gi, '>')
      .replace(/&#x3c;/gi, '<')
      .replace(/&#x3e;/gi, '>');

    // Remove all HTML tags
    decoded = decoded.replace(HTML_TAG_PATTERN, '');

    return decoded;
  }

  /**
   * Encode HTML special characters to prevent XSS
   * 
   * @param input - The input string
   * @returns String with HTML entities encoded
   */
  encodeHtmlEntities(input: string): string {
    return input.replace(/[&<>"'`=\/]/g, (char) => HTML_ENTITIES[char] || char);
  }

  /**
   * Sanitize a quiz title
   * 
   * @param title - The quiz title to sanitize
   * @returns Sanitized title
   */
  sanitizeQuizTitle(title: string | null | undefined): string {
    return this.sanitize(title, {
      stripHtml: true,
      encodeEntities: true,
      trim: true,
      normalizeWhitespace: true,
      allowNewlines: false,
      maxLength: 200,
    });
  }

  /**
   * Sanitize a quiz description
   * 
   * @param description - The quiz description to sanitize
   * @returns Sanitized description
   */
  sanitizeQuizDescription(description: string | null | undefined): string {
    return this.sanitize(description, {
      stripHtml: true,
      encodeEntities: true,
      trim: true,
      normalizeWhitespace: false,
      allowNewlines: true,
      maxLength: 1000,
    });
  }

  /**
   * Sanitize question text
   * 
   * @param text - The question text to sanitize
   * @returns Sanitized question text
   */
  sanitizeQuestionText(text: string | null | undefined): string {
    return this.sanitize(text, {
      stripHtml: true,
      encodeEntities: true,
      trim: true,
      normalizeWhitespace: false,
      allowNewlines: true,
      maxLength: 1000,
    });
  }

  /**
   * Sanitize option text
   * 
   * @param text - The option text to sanitize
   * @returns Sanitized option text
   */
  sanitizeOptionText(text: string | null | undefined): string {
    return this.sanitize(text, {
      stripHtml: true,
      encodeEntities: true,
      trim: true,
      normalizeWhitespace: true,
      allowNewlines: false,
      maxLength: 500,
    });
  }

  /**
   * Sanitize explanation text
   * 
   * @param text - The explanation text to sanitize
   * @returns Sanitized explanation text
   */
  sanitizeExplanationText(text: string | null | undefined): string {
    return this.sanitize(text, {
      stripHtml: true,
      encodeEntities: true,
      trim: true,
      normalizeWhitespace: false,
      allowNewlines: true,
      maxLength: 2000,
    });
  }

  /**
   * Sanitize speaker notes
   * 
   * @param notes - The speaker notes to sanitize
   * @returns Sanitized speaker notes
   */
  sanitizeSpeakerNotes(notes: string | null | undefined): string {
    return this.sanitize(notes, {
      stripHtml: true,
      encodeEntities: true,
      trim: true,
      normalizeWhitespace: false,
      allowNewlines: true,
      maxLength: 2000,
    });
  }

  /**
   * Sanitize a participant nickname
   * 
   * @param nickname - The nickname to sanitize
   * @returns Sanitized nickname
   */
  sanitizeNickname(nickname: string | null | undefined): string {
    return this.sanitize(nickname, {
      stripHtml: true,
      encodeEntities: true,
      trim: true,
      normalizeWhitespace: true,
      allowNewlines: false,
      maxLength: 20,
    });
  }

  /**
   * Sanitize answer text (for open-ended questions)
   * 
   * @param text - The answer text to sanitize
   * @returns Sanitized answer text
   */
  sanitizeAnswerText(text: string | null | undefined): string {
    return this.sanitize(text, {
      stripHtml: true,
      encodeEntities: true,
      trim: true,
      normalizeWhitespace: false,
      allowNewlines: true,
      maxLength: 5000,
    });
  }

  /**
   * Sanitize a complete quiz object
   * 
   * @param quiz - The quiz object to sanitize
   * @returns Quiz object with all text fields sanitized
   */
  sanitizeQuiz<T extends {
    title?: string;
    description?: string;
    questions?: Array<{
      questionText?: string;
      explanationText?: string;
      speakerNotes?: string;
      options?: Array<{
        optionText?: string;
      }>;
    }>;
  }>(quiz: T): T {
    const sanitized = { ...quiz };

    if (sanitized.title !== undefined) {
      sanitized.title = this.sanitizeQuizTitle(sanitized.title);
    }

    if (sanitized.description !== undefined) {
      sanitized.description = this.sanitizeQuizDescription(sanitized.description);
    }

    if (sanitized.questions) {
      sanitized.questions = sanitized.questions.map((question) => ({
        ...question,
        questionText: question.questionText !== undefined 
          ? this.sanitizeQuestionText(question.questionText) 
          : question.questionText,
        explanationText: question.explanationText !== undefined 
          ? this.sanitizeExplanationText(question.explanationText) 
          : question.explanationText,
        speakerNotes: question.speakerNotes !== undefined 
          ? this.sanitizeSpeakerNotes(question.speakerNotes) 
          : question.speakerNotes,
        options: question.options?.map((option) => ({
          ...option,
          optionText: option.optionText !== undefined 
            ? this.sanitizeOptionText(option.optionText) 
            : option.optionText,
        })),
      }));
    }

    return sanitized;
  }

  /**
   * Sanitize a question object
   * 
   * @param question - The question object to sanitize
   * @returns Question object with all text fields sanitized
   */
  sanitizeQuestion<T extends {
    questionText?: string;
    explanationText?: string;
    speakerNotes?: string;
    options?: Array<{
      optionText?: string;
    }>;
  }>(question: T): T {
    const sanitized = { ...question };

    if (sanitized.questionText !== undefined) {
      sanitized.questionText = this.sanitizeQuestionText(sanitized.questionText);
    }

    if (sanitized.explanationText !== undefined) {
      sanitized.explanationText = this.sanitizeExplanationText(sanitized.explanationText);
    }

    if (sanitized.speakerNotes !== undefined) {
      sanitized.speakerNotes = this.sanitizeSpeakerNotes(sanitized.speakerNotes);
    }

    if (sanitized.options) {
      sanitized.options = sanitized.options.map((option) => ({
        ...option,
        optionText: option.optionText !== undefined 
          ? this.sanitizeOptionText(option.optionText) 
          : option.optionText,
      }));
    }

    return sanitized;
  }

  /**
   * Check if a string contains potentially dangerous content
   * 
   * @param input - The input string to check
   * @returns True if dangerous content is detected
   */
  containsDangerousContent(input: string | null | undefined): boolean {
    if (input == null) {
      return false;
    }

    const str = String(input);

    // Check for dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(str)) {
        return true;
      }
    }

    // Check for HTML tags
    if (HTML_TAG_PATTERN.test(str)) {
      return true;
    }

    return false;
  }
}

// Export singleton instance
export const inputSanitizationService = new InputSanitizationService();

// Export class for testing
export { InputSanitizationService };
