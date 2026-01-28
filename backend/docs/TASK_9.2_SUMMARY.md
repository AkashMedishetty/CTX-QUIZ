# Task 9.2 Summary: PUT /api/quizzes/:quizId/questions/:questionId Endpoint

## Overview
Implemented the PUT endpoint for updating quiz questions with partial update support, proper validation, error handling, and comprehensive test coverage.

## Implementation Details

### Endpoint: PUT /api/quizzes/:quizId/questions/:questionId

**Purpose**: Update an existing question in a quiz with support for partial updates

**Path Parameters**:
- `quizId`: MongoDB ObjectId (24-character hexadecimal string)
- `questionId`: UUID string identifying the question

**Request Body** (all fields optional for partial updates):
- `questionText`: string (1-1000 chars)
- `questionType`: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SCALE_1_10' | 'NUMBER_INPUT' | 'OPEN_ENDED'
- `questionImageUrl`: string (valid URL)
- `timeLimit`: number (5-120 seconds)
- `options`: array of option objects
- `scoring`: object with basePoints, speedBonusMultiplier, partialCreditEnabled
- `shuffleOptions`: boolean
- `explanationText`: string (max 2000 chars)
- `speakerNotes`: string (max 2000 chars)

**Response Codes**:
- 200: Question updated successfully
- 400: Validation error or invalid ID format
- 404: Quiz or question not found
- 500: Server error

### Key Features

1. **Partial Updates**: Only updates fields that are provided in the request body
2. **ID Validation**: 
   - Validates MongoDB ObjectId format for quizId
   - Validates UUID format for questionId
3. **Question Lookup**: Finds question by UUID in the quiz's questions array
4. **Option ID Generation**: Automatically generates UUIDs for new options if not provided
5. **Timestamp Management**: Updates the quiz's `updatedAt` timestamp
6. **Error Handling**: Comprehensive error handling with descriptive messages

### Validation Schema Updates

Updated `updateQuestionRequestSchema` in `backend/src/models/validation.ts`:
- Removed `questionId` from body schema (comes from URL params)
- Changed to use `optionCreateSchema` instead of `optionSchema` to support options without IDs
- Made all fields optional with `.partial()`
- Added validation refinements for:
  - TRUE_FALSE questions must have exactly 2 options
  - SCALE_1_10 questions must have exactly 10 options
  - At least one correct option required (except for OPEN_ENDED and NUMBER_INPUT)

### Implementation Approach

1. **Validate Path Parameters**: Check both quizId (ObjectId) and questionId (UUID) formats
2. **Fetch Quiz**: Retrieve quiz from MongoDB using ObjectId
3. **Find Question**: Locate question in quiz's questions array by UUID
4. **Generate Option IDs**: If options are provided without IDs, generate UUIDs
5. **Build Update Object**: Create MongoDB update object with only provided fields
6. **Update Database**: Use `findOneAndUpdate` with positional array update
7. **Return Updated Question**: Extract and return the updated question from result

### MongoDB Update Strategy

Uses positional array updates to modify specific question fields:
```javascript
{
  $set: {
    'questions.0.questionText': 'Updated text',
    'questions.0.timeLimit': 60,
    'updatedAt': new Date()
  }
}
```

This approach allows updating individual fields without replacing the entire question object.

### Test Coverage

Implemented 18 comprehensive tests covering:

**Success Cases**:
- Update question text
- Update question options
- Update multiple fields at once
- Update scoring configuration
- Generate UUIDs for new options
- Partial updates (only provided fields)
- MongoDB ObjectId usage
- UUID-based question lookup

**Error Cases**:
- Invalid quiz ID format
- Invalid question ID format
- Quiz not found
- Question not found in quiz
- Invalid time limit (too short/long)
- Empty question text
- Options without correct answer
- MongoDB errors

**Edge Cases**:
- Quiz updatedAt timestamp update
- Support for partial updates
- Option ID generation

### Rate Limiting Fix

Updated `backend/src/middleware/rate-limiter.ts` to skip rate limiting in test environment:
```typescript
skip: () => config.env === 'test'
```

This prevents test failures due to rate limiting when running many tests in sequence.

## Files Modified

1. **backend/src/routes/quiz.routes.ts**
   - Added PUT /api/quizzes/:quizId/questions/:questionId endpoint
   - Imported `updateQuestionRequestSchema` for validation

2. **backend/src/models/validation.ts**
   - Updated `updateQuestionRequestSchema` to support partial updates
   - Removed questionId from body schema
   - Changed to use `optionCreateSchema` for better flexibility

3. **backend/src/routes/__tests__/quiz.routes.test.ts**
   - Added 18 comprehensive tests for PUT endpoint

4. **backend/src/middleware/rate-limiter.ts**
   - Added skip condition for test environment

## Test Results

All tests passing:
- 99 total tests in quiz.routes.test.ts (all passing)
- 54 total tests in validation.test.ts (all passing)

## Requirements Validated

**Validates: Requirements 1.2**
- Question updates with validation
- Partial update support
- Proper error handling
- MongoDB persistence

## Usage Example

```bash
# Update question text only
curl -X PUT http://localhost:3000/api/quizzes/507f1f77bcf86cd799439011/questions/123e4567-e89b-12d3-a456-426614174000 \
  -H "Content-Type: application/json" \
  -d '{
    "questionText": "What is the capital of Germany?"
  }'

# Update multiple fields
curl -X PUT http://localhost:3000/api/quizzes/507f1f77bcf86cd799439011/questions/123e4567-e89b-12d3-a456-426614174000 \
  -H "Content-Type: application/json" \
  -d '{
    "questionText": "Updated question",
    "timeLimit": 45,
    "scoring": {
      "basePoints": 200,
      "speedBonusMultiplier": 0.75,
      "partialCreditEnabled": true
    }
  }'

# Update options
curl -X PUT http://localhost:3000/api/quizzes/507f1f77bcf86cd799439011/questions/123e4567-e89b-12d3-a456-426614174000 \
  -H "Content-Type: application/json" \
  -d '{
    "options": [
      {
        "optionText": "Berlin",
        "isCorrect": true
      },
      {
        "optionText": "Munich",
        "isCorrect": false
      }
    ]
  }'
```

## Next Steps

Task 9.2 is complete. The next task in the sequence is:
- Task 9.3: Create DELETE /api/quizzes/:quizId/questions/:questionId endpoint

## Notes

- The endpoint supports true partial updates - only provided fields are modified
- MongoDB ObjectId is used for quiz lookup (_id field)
- UUID strings are used for question identification within the questions array
- Option IDs are automatically generated if not provided
- The quiz's updatedAt timestamp is always updated on any question modification
- Rate limiting is disabled in test environment to allow rapid test execution
