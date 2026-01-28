# Profanity Filter Service Usage

## Overview

The profanity filter service validates participant nicknames for:
- Length requirements (2-20 characters)
- Profanity detection using the bad-words library
- Leetspeak normalization to catch obfuscated profanity

## Requirements

- **Requirements 3.3**: Profanity filter validates nicknames and rejects inappropriate content
- **Requirements 9.5**: Profanity filter validates all participant nicknames

## API

### `validateNickname(nickname: string): ValidationResult`

Validates a nickname and returns a result object.

**Parameters:**
- `nickname` (string): The nickname to validate

**Returns:**
```typescript
interface ValidationResult {
  isValid: boolean;
  reason?: string;  // Only present when isValid is false
}
```

**Validation Rules:**
1. Nickname must be provided (not null, undefined, or non-string)
2. After trimming whitespace, nickname must not be empty
3. Nickname must be at least 2 characters long
4. Nickname must be no more than 20 characters long
5. Nickname must not contain profanity (checked in both original and leetspeak-normalized forms)

**Leetspeak Normalization:**
The service normalizes leetspeak characters before checking for profanity:
- `0` → `o`
- `1` → `i`
- `3` → `e`
- `4` → `a`
- `5` → `s`
- `7` → `t`

This helps catch obfuscated profanity like:
- `h3ll0` → `hello`
- `b4dw0rd` → `badword`
- `5h1t` → `shit`

## Usage Example

### In the Join Endpoint (Task 12.1)

```typescript
import { profanityFilterService } from '../services';

// POST /api/sessions/join
router.post('/join', async (req: Request, res: Response): Promise<void> => {
  try {
    const { joinCode, nickname } = req.body;

    // Validate nickname using profanity filter
    const validation = profanityFilterService.validateNickname(nickname);
    
    if (!validation.isValid) {
      res.status(400).json({
        success: false,
        error: 'Invalid nickname',
        message: validation.reason,
      });
      return;
    }

    // Continue with join logic...
    // - Verify join code exists
    // - Check rate limiting
    // - Create participant record
    // - Generate session token
    // etc.

  } catch (error: any) {
    console.error('[Session] Error joining session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to join session',
      message: error.message || 'An unexpected error occurred',
    });
  }
});
```

## Custom Word Management

The service provides methods to add or remove custom words from the filter:

### `addCustomWords(...words: string[]): void`

Add custom words to the profanity filter.

```typescript
// Add single word
profanityFilterService.addCustomWords('customword');

// Add multiple words
profanityFilterService.addCustomWords('word1', 'word2', 'word3');
```

### `removeWords(...words: string[]): void`

Remove words from the profanity filter (useful for allowing words that are incorrectly flagged).

```typescript
// Remove single word
profanityFilterService.removeWords('okword');

// Remove multiple words
profanityFilterService.removeWords('word1', 'word2', 'word3');
```

## Error Messages

The service returns the following error messages:

| Condition | Error Message |
|-----------|--------------|
| Nickname is null, undefined, or non-string | "Nickname is required" |
| Nickname is empty or only whitespace | "Nickname is required" |
| Nickname is less than 2 characters | "Nickname must be at least 2 characters long" |
| Nickname is more than 20 characters | "Nickname must be no more than 20 characters long" |
| Nickname contains profanity | "Nickname contains inappropriate content" |

## Testing

Comprehensive unit tests are available in:
- `backend/src/services/__tests__/profanity-filter.service.test.ts`

Run tests with:
```bash
npm test -- profanity-filter.service.test.ts
```

## Implementation Details

- **Library**: Uses the `bad-words` npm package (v3.0.4)
- **Singleton**: Exported as a singleton instance for consistent state across the application
- **Case-insensitive**: Profanity checking is case-insensitive
- **Whitespace handling**: Trims whitespace before validation
- **Leetspeak detection**: Normalizes common leetspeak substitutions before checking

## Future Enhancements

Potential improvements for future iterations:
1. Add support for multiple languages
2. Implement custom word lists per quiz/session
3. Add severity levels for different types of inappropriate content
4. Implement fuzzy matching for more sophisticated obfuscation detection
5. Add logging/analytics for blocked nicknames
