# Task 8.4: Create PUT /api/quizzes/:quizId Endpoint for Updates

## Summary

Successfully implemented the PUT endpoint for updating quizzes with partial updates support. The endpoint validates input, updates the quiz in MongoDB, and returns the updated quiz.

## Implementation Details

### Endpoint: PUT /api/quizzes/:quizId

**Path Parameters:**
- `quizId`: MongoDB ObjectId (24-character hexadecimal string)

**Request Body (all fields optional):**
- `title`: string (1-200 chars)
- `description`: string (max 1000 chars)
- `quizType`: 'REGULAR' | 'ELIMINATION' | 'FFI'
- `branding`: object with primaryColor, secondaryColor, optional logoUrl, backgroundImageUrl
- `eliminationSettings`: object (required if quizType is ELIMINATION)
- `ffiSettings`: object (required if quizType is FFI)
- `questions`: array of question objects

**Response Codes:**
- `200`: Quiz updated successfully
- `400`: Validation error or invalid quiz ID format
- `404`: Quiz not found
- `500`: Server error

### Key Features

1. **Partial Updates**: Supports updating any subset of quiz fields
2. **Validation**: Uses Zod schema validation for all input fields
3. **ID Generation**: Automatically generates UUIDs for questions and options if not provided
4. **Error Handling**: Comprehensive error handling with appropriate status codes
5. **MongoDB Integration**: Uses MongoDB ObjectId for querying and updating
6. **Timestamp Management**: Automatically updates the `updatedAt` timestamp

### Code Changes

#### Files Modified:

1. **backend/src/routes/quiz.routes.ts**
   - Added PUT endpoint handler
   - Implemented partial update logic
   - Added ObjectId validation
   - Added UUID generation for questions/options without IDs

2. **backend/src/models/validation.ts**
   - Updated `updateQuizRequestSchema` to use `questionCreateSchema` instead of `questionSchema`
   - This allows questions without IDs to be validated and IDs to be generated

3. **backend/src/routes/__tests__/quiz.routes.test.ts**
   - Added comprehensive test suite for PUT endpoint (14 tests)
   - Tests cover: successful updates, validation errors, 404 errors, MongoDB errors
   - Tests verify partial updates, ID generation, and timestamp updates

### Test Coverage

All 50 tests passing:
- ✓ Update quiz title successfully
- ✓ Update quiz description successfully
- ✓ Update multiple fields at once
- ✓ Update branding colors
- ✓ Return 404 when quiz does not exist
- ✓ Return 400 for invalid quiz ID format
- ✓ Reject invalid title (too long)
- ✓ Reject invalid branding colors
- ✓ Handle empty update (no fields provided)
- ✓ Update questions array
- ✓ Handle MongoDB errors gracefully
- ✓ Update updatedAt timestamp
- ✓ Generate IDs for new questions without IDs

### Example Usage

**Update quiz title:**
```bash
curl -X PUT http://localhost:3000/api/quizzes/507f1f77bcf86cd799439011 \
  -H "Content-Type: application/json" \
  -d '{"title": "Updated Quiz Title"}'
```

**Update multiple fields:**
```bash
curl -X PUT http://localhost:3000/api/quizzes/507f1f77bcf86cd799439011 \
  -H "Content-Type: application/json" \
  -d '{
    "title": "New Title",
    "description": "New Description",
    "branding": {
      "primaryColor": "#0000FF",
      "secondaryColor": "#00FF00"
    }
  }'
```

**Update questions:**
```bash
curl -X PUT http://localhost:3000/api/quizzes/507f1f77bcf86cd799439011 \
  -H "Content-Type: application/json" \
  -d '{
    "questions": [
      {
        "questionText": "What is 3 + 3?",
        "questionType": "MULTIPLE_CHOICE",
        "timeLimit": 30,
        "options": [
          {"optionText": "5", "isCorrect": false},
          {"optionText": "6", "isCorrect": true}
        ],
        "scoring": {
          "basePoints": 100,
          "speedBonusMultiplier": 0.5,
          "partialCreditEnabled": false
        },
        "shuffleOptions": true
      }
    ]
  }'
```

## Requirements Validated

- **Requirement 1.1**: Quiz Management - Update quiz functionality

## Technical Notes

1. **Partial Updates**: The endpoint only updates fields that are provided in the request body
2. **ID Generation**: Questions and options without IDs will have UUIDs automatically generated
3. **Validation**: All updates are validated using the same Zod schemas as creation
4. **MongoDB Operations**: Uses `findOneAndUpdate` with `returnDocument: 'after'` to return the updated document
5. **Error Handling**: Distinguishes between validation errors (400), not found errors (404), and server errors (500)

## Next Steps

The PUT endpoint is now complete and ready for use. The next task in the sequence is:
- Task 8.5: Create DELETE /api/quizzes/:quizId endpoint

## Verification

- ✅ All tests passing (50/50)
- ✅ TypeScript compilation successful
- ✅ Proper error handling implemented
- ✅ Validation working correctly
- ✅ MongoDB integration working
- ✅ ID generation working for questions/options
