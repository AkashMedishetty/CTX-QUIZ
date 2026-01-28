import Filter from 'bad-words';

/**
 * Profanity Filter Service
 * 
 * Validates participant nicknames for:
 * - Length requirements (2-20 characters)
 * - Profanity detection using bad-words library
 * - Leetspeak normalization to catch obfuscated profanity
 * 
 * Requirements: 3.3, 9.5
 */

export interface ValidationResult {
  isValid: boolean;
  reason?: string;
}

class ProfanityFilterService {
  private filter: Filter;
  
  constructor() {
    this.filter = new Filter();
    
    // Add custom words to the filter if needed
    // this.filter.addWords('customword1', 'customword2');
  }
  
  /**
   * Normalize leetspeak characters to their letter equivalents
   * This helps catch obfuscated profanity like "h3ll0" → "hello"
   * 
   * Mappings:
   * - 0 → o
   * - 1 → i
   * - 3 → e
   * - 4 → a
   * - 5 → s
   * - 7 → t
   */
  private normalizeLeetspeak(text: string): string {
    return text
      .replace(/0/g, 'o')
      .replace(/1/g, 'i')
      .replace(/3/g, 'e')
      .replace(/4/g, 'a')
      .replace(/5/g, 's')
      .replace(/7/g, 't');
  }
  
  /**
   * Validate a nickname for length and profanity
   * 
   * @param nickname - The nickname to validate
   * @returns ValidationResult with isValid flag and optional reason
   */
  validateNickname(nickname: string): ValidationResult {
    // Check if nickname is provided
    if (!nickname || typeof nickname !== 'string') {
      return {
        isValid: false,
        reason: 'Nickname is required'
      };
    }
    
    // Trim whitespace
    const trimmedNickname = nickname.trim();
    
    // Check if nickname is empty after trimming
    if (trimmedNickname.length === 0) {
      return {
        isValid: false,
        reason: 'Nickname is required'
      };
    }
    
    // Check length requirements (2-20 characters)
    if (trimmedNickname.length < 2) {
      return {
        isValid: false,
        reason: 'Nickname must be at least 2 characters long'
      };
    }
    
    if (trimmedNickname.length > 20) {
      return {
        isValid: false,
        reason: 'Nickname must be no more than 20 characters long'
      };
    }
    
    // Normalize leetspeak before checking for profanity
    const normalizedNickname = this.normalizeLeetspeak(trimmedNickname.toLowerCase());
    
    // Check for profanity in both original and normalized versions
    if (this.filter.isProfane(trimmedNickname) || this.filter.isProfane(normalizedNickname)) {
      return {
        isValid: false,
        reason: 'Nickname contains inappropriate content'
      };
    }
    
    // All checks passed
    return {
      isValid: true
    };
  }
  
  /**
   * Add custom words to the profanity filter
   * 
   * @param words - Array of words to add to the filter
   */
  addCustomWords(...words: string[]): void {
    this.filter.addWords(...words);
  }
  
  /**
   * Remove words from the profanity filter
   * 
   * @param words - Array of words to remove from the filter
   */
  removeWords(...words: string[]): void {
    this.filter.removeWords(...words);
  }
}

// Export singleton instance
export const profanityFilterService = new ProfanityFilterService();
