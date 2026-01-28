/**
 * Quiz Management Routes
 * 
 * Provides endpoints for:
 * - Create quiz (POST /api/quizzes)
 * - List quizzes (GET /api/quizzes)
 * - Get quiz by ID (GET /api/quizzes/:quizId)
 * - Update quiz (PUT /api/quizzes/:quizId)
 * - Delete quiz (DELETE /api/quizzes/:quizId)
 * 
 * Requirements: 1.1, 1.7, 16.1
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { mongodbService } from '../services';
import { createQuizRequestSchema, updateQuizRequestSchema, questionCreateSchema, updateQuestionRequestSchema, validateAndSanitizeRequest } from '../models/validation';
import { Quiz } from '../models/types';

const router = Router();

/**
 * POST /api/quizzes
 * 
 * Create a new quiz with metadata, branding, and questions
 * 
 * Request Body:
 * - title: string (required, 1-200 chars)
 * - description: string (max 1000 chars)
 * - quizType: 'REGULAR' | 'ELIMINATION' | 'FFI' (required)
 * - branding: object with primaryColor, secondaryColor, optional logoUrl, backgroundImageUrl
 * - eliminationSettings: object (required if quizType is ELIMINATION)
 * - ffiSettings: object (required if quizType is FFI)
 * - questions: array of question objects (at least 1 required)
 * 
 * Response:
 * - 201: Quiz created successfully
 * - 400: Validation error
 * - 500: Server error
 * 
 * Validates: Requirements 1.1, 1.7, 9.8 (XSS prevention via input sanitization)
 */
router.post(
  '/',
  validateAndSanitizeRequest(createQuizRequestSchema),
  async (req: Request, res: Response) => {
    try {
      const validatedData = (req as any).validatedBody;

      // Generate unique IDs for questions and options if not provided
      // Handle case where questions array might be empty or undefined
      const questionsWithIds = (validatedData.questions || []).map((question: any) => ({
        ...question,
        questionId: question.questionId || uuidv4(),
        options: question.options.map((option: any) => ({
          ...option,
          optionId: option.optionId || uuidv4(),
        })),
      }));

      // Create quiz document
      const quiz: Quiz = {
        title: validatedData.title,
        description: validatedData.description,
        quizType: validatedData.quizType,
        createdBy: 'admin', // TODO: Replace with actual user ID from authentication
        createdAt: new Date(),
        updatedAt: new Date(),
        branding: validatedData.branding,
        eliminationSettings: validatedData.eliminationSettings,
        ffiSettings: validatedData.ffiSettings,
        questions: questionsWithIds,
      };

      // Insert into MongoDB
      const collection = mongodbService.getCollection<Quiz>('quizzes');
      const result = await mongodbService.withRetry(async () => {
        return await collection.insertOne(quiz);
      });

      // Return created quiz with ID
      const createdQuiz = {
        ...quiz,
        _id: result.insertedId,
        quizId: result.insertedId.toString(),
      };

      res.status(201).json({
        success: true,
        message: 'Quiz created successfully',
        quiz: createdQuiz,
      });
    } catch (error) {
      console.error('Error creating quiz:', error);
      
      // Handle MongoDB errors
      if (error instanceof Error) {
        res.status(500).json({
          success: false,
          error: 'Failed to create quiz',
          message: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to create quiz',
          message: 'Unknown error occurred',
        });
      }
    }
  }
);

/**
 * GET /api/quizzes
 * 
 * List all quizzes with pagination and search functionality
 * 
 * Query Parameters:
 * - page: number (default: 1) - Page number for pagination
 * - limit: number (default: 10, max: 100) - Number of quizzes per page
 * - search: string (optional) - Search term for title/description
 * 
 * Response:
 * - 200: Quizzes retrieved successfully
 * - 400: Invalid query parameters
 * - 500: Server error
 * 
 * Validates: Requirements 1.1
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // Parse and validate query parameters
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const search = (req.query.search as string)?.trim() || '';

    // Calculate skip for pagination
    const skip = (page - 1) * limit;

    // Build search filter
    const filter: any = {};
    if (search) {
      // Case-insensitive search on title and description
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    // Get collection
    const collection = mongodbService.getCollection<Quiz>('quizzes');

    // Execute queries with retry logic
    const [quizzes, total] = await mongodbService.withRetry(async () => {
      return await Promise.all([
        collection
          .find(filter)
          .sort({ createdAt: -1 }) // Most recent first
          .skip(skip)
          .limit(limit)
          .toArray(),
        collection.countDocuments(filter),
      ]);
    });

    // Transform quizzes to include quizId
    const transformedQuizzes = quizzes.map((quiz) => ({
      ...quiz,
      quizId: quiz._id.toString(),
    }));

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      quizzes: transformedQuizzes,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    console.error('Error listing quizzes:', error);

    if (error instanceof Error) {
      res.status(500).json({
        success: false,
        error: 'Failed to list quizzes',
        message: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to list quizzes',
        message: 'Unknown error occurred',
      });
    }
  }
});

/**
 * GET /api/quizzes/:quizId
 * 
 * Retrieve a specific quiz by ID with full details including questions and options
 * 
 * Path Parameters:
 * - quizId: string (required) - MongoDB ObjectId of the quiz
 * 
 * Response:
 * - 200: Quiz retrieved successfully
 * - 400: Invalid quiz ID format
 * - 404: Quiz not found
 * - 500: Server error
 * 
 * Validates: Requirements 1.1
 */
router.get('/:quizId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { quizId } = req.params;

    // Validate ObjectId format
    if (!quizId || quizId.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(quizId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid quiz ID format',
        message: 'Quiz ID must be a valid 24-character hexadecimal string',
      });
      return;
    }

    // Import ObjectId from mongodb
    const { ObjectId } = require('mongodb');

    // Get collection
    const collection = mongodbService.getCollection<Quiz>('quizzes');

    // Query quiz by _id
    const quiz = await mongodbService.withRetry(async () => {
      return await collection.findOne({ _id: new ObjectId(quizId) });
    });

    // Handle not found
    if (!quiz) {
      res.status(404).json({
        success: false,
        error: 'Quiz not found',
        message: `No quiz found with ID: ${quizId}`,
      });
      return;
    }

    // Transform quiz to include quizId
    const transformedQuiz = {
      ...quiz,
      quizId: quiz._id.toString(),
    };

    res.status(200).json({
      success: true,
      quiz: transformedQuiz,
    });
  } catch (error) {
    console.error('Error retrieving quiz:', error);

    if (error instanceof Error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve quiz',
        message: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve quiz',
        message: 'Unknown error occurred',
      });
    }
  }
});

/**
 * PUT /api/quizzes/:quizId
 * 
 * Update an existing quiz with partial updates
 * 
 * Path Parameters:
 * - quizId: string (required) - MongoDB ObjectId of the quiz
 * 
 * Request Body (all fields optional):
 * - title: string (1-200 chars)
 * - description: string (max 1000 chars)
 * - quizType: 'REGULAR' | 'ELIMINATION' | 'FFI'
 * - branding: object with primaryColor, secondaryColor, optional logoUrl, backgroundImageUrl
 * - eliminationSettings: object (required if quizType is ELIMINATION)
 * - ffiSettings: object (required if quizType is FFI)
 * - questions: array of question objects
 * 
 * Response:
 * - 200: Quiz updated successfully
 * - 400: Validation error or invalid quiz ID format
 * - 404: Quiz not found
 * - 500: Server error
 * 
 * Validates: Requirements 1.1
 */
router.put(
  '/:quizId',
  validateAndSanitizeRequest(updateQuizRequestSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { quizId } = req.params;
      const validatedData = (req as any).validatedBody;

      // Validate ObjectId format
      if (!quizId || quizId.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(quizId)) {
        res.status(400).json({
          success: false,
          error: 'Invalid quiz ID format',
          message: 'Quiz ID must be a valid 24-character hexadecimal string',
        });
        return;
      }

      // Import ObjectId from mongodb
      const { ObjectId } = require('mongodb');

      // Get collection
      const collection = mongodbService.getCollection<Quiz>('quizzes');

      // Check if quiz exists
      const existingQuiz = await mongodbService.withRetry(async () => {
        return await collection.findOne({ _id: new ObjectId(quizId) });
      });

      if (!existingQuiz) {
        res.status(404).json({
          success: false,
          error: 'Quiz not found',
          message: `No quiz found with ID: ${quizId}`,
        });
        return;
      }

      // Generate IDs for new questions and options if provided
      if (validatedData.questions) {
        validatedData.questions = validatedData.questions.map((question: any) => ({
          ...question,
          questionId: question.questionId || uuidv4(),
          options: question.options.map((option: any) => ({
            ...option,
            optionId: option.optionId || uuidv4(),
          })),
        }));
      }

      // Build update object with only provided fields
      const updateFields: any = {
        updatedAt: new Date(),
      };

      // Add provided fields to update
      if (validatedData.title !== undefined) updateFields.title = validatedData.title;
      if (validatedData.description !== undefined) updateFields.description = validatedData.description;
      if (validatedData.quizType !== undefined) updateFields.quizType = validatedData.quizType;
      if (validatedData.branding !== undefined) updateFields.branding = validatedData.branding;
      if (validatedData.eliminationSettings !== undefined) updateFields.eliminationSettings = validatedData.eliminationSettings;
      if (validatedData.ffiSettings !== undefined) updateFields.ffiSettings = validatedData.ffiSettings;
      if (validatedData.questions !== undefined) updateFields.questions = validatedData.questions;

      // Update quiz in MongoDB
      const result = await mongodbService.withRetry(async () => {
        return await collection.findOneAndUpdate(
          { _id: new ObjectId(quizId) },
          { $set: updateFields },
          { returnDocument: 'after' }
        );
      });

      if (!result) {
        res.status(404).json({
          success: false,
          error: 'Quiz not found',
          message: `No quiz found with ID: ${quizId}`,
        });
        return;
      }

      // Transform quiz to include quizId
      const updatedQuiz = {
        ...result,
        quizId: result._id.toString(),
      };

      res.status(200).json({
        success: true,
        message: 'Quiz updated successfully',
        quiz: updatedQuiz,
      });
    } catch (error) {
      console.error('Error updating quiz:', error);

      if (error instanceof Error) {
        res.status(500).json({
          success: false,
          error: 'Failed to update quiz',
          message: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to update quiz',
          message: 'Unknown error occurred',
        });
      }
    }
  }
);

/**
 * DELETE /api/quizzes/:quizId
 * 
 * Delete a quiz by ID
 * 
 * Path Parameters:
 * - quizId: string (required) - MongoDB ObjectId of the quiz
 * 
 * Response:
 * - 200: Quiz deleted successfully
 * - 400: Invalid quiz ID format or quiz has active sessions
 * - 404: Quiz not found
 * - 500: Server error
 * 
 * Validates: Requirements 1.1
 */
router.delete('/:quizId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { quizId } = req.params;

    // Validate ObjectId format
    if (!quizId || quizId.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(quizId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid quiz ID format',
        message: 'Quiz ID must be a valid 24-character hexadecimal string',
      });
      return;
    }

    // Import ObjectId from mongodb
    const { ObjectId } = require('mongodb');
    const quizObjectId = new ObjectId(quizId);

    // Get collections
    const quizzesCollection = mongodbService.getCollection<Quiz>('quizzes');
    const sessionsCollection = mongodbService.getCollection('sessions');

    // Check if quiz exists
    const quiz = await mongodbService.withRetry(async () => {
      return await quizzesCollection.findOne({ _id: quizObjectId });
    });

    if (!quiz) {
      res.status(404).json({
        success: false,
        error: 'Quiz not found',
        message: `No quiz found with ID: ${quizId}`,
      });
      return;
    }

    // Check for active sessions using this quiz
    const activeSessions = await mongodbService.withRetry(async () => {
      return await sessionsCollection.countDocuments({
        quizId: quizObjectId,
        state: { $ne: 'ENDED' }, // Any state except ENDED is considered active
      });
    });

    if (activeSessions > 0) {
      res.status(400).json({
        success: false,
        error: 'Cannot delete quiz with active sessions',
        message: `This quiz has ${activeSessions} active session(s). Please end all sessions before deleting the quiz.`,
      });
      return;
    }

    // Delete the quiz
    const deleteResult = await mongodbService.withRetry(async () => {
      return await quizzesCollection.deleteOne({ _id: quizObjectId });
    });

    if (deleteResult.deletedCount === 0) {
      res.status(404).json({
        success: false,
        error: 'Quiz not found',
        message: `No quiz found with ID: ${quizId}`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Quiz deleted successfully',
      quizId: quizId,
    });
  } catch (error) {
    console.error('Error deleting quiz:', error);

    if (error instanceof Error) {
      res.status(500).json({
        success: false,
        error: 'Failed to delete quiz',
        message: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to delete quiz',
        message: 'Unknown error occurred',
      });
    }
  }
});

/**
 * POST /api/quizzes/:quizId/questions
 * 
 * Add a new question to an existing quiz
 * 
 * Path Parameters:
 * - quizId: string (required) - MongoDB ObjectId of the quiz
 * 
 * Request Body:
 * - questionText: string (required, 1-1000 chars)
 * - questionType: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SCALE_1_10' | 'NUMBER_INPUT' | 'OPEN_ENDED' (required)
 * - questionImageUrl: string (optional, valid URL)
 * - timeLimit: number (required, 5-120 seconds)
 * - options: array of option objects (at least 1 required)
 * - scoring: object with basePoints, speedBonusMultiplier, partialCreditEnabled
 * - shuffleOptions: boolean (required)
 * - explanationText: string (optional, max 2000 chars)
 * - speakerNotes: string (optional, max 2000 chars)
 * 
 * Response:
 * - 201: Question added successfully
 * - 400: Validation error or invalid quiz ID format
 * - 404: Quiz not found
 * - 500: Server error
 * 
 * Validates: Requirements 1.2
 */
router.post(
  '/:quizId/questions',
  validateAndSanitizeRequest(questionCreateSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { quizId } = req.params;
      const validatedData = (req as any).validatedBody;

      // Validate ObjectId format
      if (!quizId || quizId.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(quizId)) {
        res.status(400).json({
          success: false,
          error: 'Invalid quiz ID format',
          message: 'Quiz ID must be a valid 24-character hexadecimal string',
        });
        return;
      }

      // Import ObjectId from mongodb
      const { ObjectId } = require('mongodb');
      const quizObjectId = new ObjectId(quizId);

      // Get collection
      const collection = mongodbService.getCollection<Quiz>('quizzes');

      // Check if quiz exists
      const quiz = await mongodbService.withRetry(async () => {
        return await collection.findOne({ _id: quizObjectId });
      });

      if (!quiz) {
        res.status(404).json({
          success: false,
          error: 'Quiz not found',
          message: `No quiz found with ID: ${quizId}`,
        });
        return;
      }

      // Generate unique IDs for question and options if not provided
      const questionWithIds = {
        ...validatedData,
        questionId: validatedData.questionId || uuidv4(),
        options: validatedData.options.map((option: any) => ({
          ...option,
          optionId: option.optionId || uuidv4(),
        })),
      };

      // Add question to quiz
      const result = await mongodbService.withRetry(async () => {
        return await collection.findOneAndUpdate(
          { _id: quizObjectId },
          {
            $push: { questions: questionWithIds },
            $set: { updatedAt: new Date() },
          },
          { returnDocument: 'after' }
        );
      });

      if (!result) {
        res.status(404).json({
          success: false,
          error: 'Quiz not found',
          message: `No quiz found with ID: ${quizId}`,
        });
        return;
      }

      res.status(201).json({
        success: true,
        message: 'Question added successfully',
        question: questionWithIds,
        quizId: quizId,
      });
    } catch (error) {
      console.error('Error adding question:', error);

      if (error instanceof Error) {
        res.status(500).json({
          success: false,
          error: 'Failed to add question',
          message: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to add question',
          message: 'Unknown error occurred',
        });
      }
    }
  }
);

/**
 * PUT /api/quizzes/:quizId/questions/:questionId
 * 
 * Update an existing question in a quiz with partial updates
 * 
 * Path Parameters:
 * - quizId: string (required) - MongoDB ObjectId of the quiz
 * - questionId: string (required) - UUID of the question to update
 * 
 * Request Body (all fields optional):
 * - questionText: string (1-1000 chars)
 * - questionType: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SCALE_1_10' | 'NUMBER_INPUT' | 'OPEN_ENDED'
 * - questionImageUrl: string (valid URL)
 * - timeLimit: number (5-120 seconds)
 * - options: array of option objects (at least 1 required if provided)
 * - scoring: object with basePoints, speedBonusMultiplier, partialCreditEnabled
 * - shuffleOptions: boolean
 * - explanationText: string (max 2000 chars)
 * - speakerNotes: string (max 2000 chars)
 * 
 * Response:
 * - 200: Question updated successfully
 * - 400: Validation error or invalid ID format
 * - 404: Quiz or question not found
 * - 500: Server error
 * 
 * Validates: Requirements 1.2
 */
router.put(
  '/:quizId/questions/:questionId',
  validateAndSanitizeRequest(updateQuestionRequestSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { quizId, questionId } = req.params;
      const validatedData = (req as any).validatedBody;

      // Validate ObjectId format for quizId
      if (!quizId || quizId.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(quizId)) {
        res.status(400).json({
          success: false,
          error: 'Invalid quiz ID format',
          message: 'Quiz ID must be a valid 24-character hexadecimal string',
        });
        return;
      }

      // Validate UUID format for questionId
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!questionId || !uuidRegex.test(questionId)) {
        res.status(400).json({
          success: false,
          error: 'Invalid question ID format',
          message: 'Question ID must be a valid UUID',
        });
        return;
      }

      // Import ObjectId from mongodb
      const { ObjectId } = require('mongodb');
      const quizObjectId = new ObjectId(quizId);

      // Get collection
      const collection = mongodbService.getCollection<Quiz>('quizzes');

      // Find the quiz and check if question exists
      const quiz = await mongodbService.withRetry(async () => {
        return await collection.findOne({ _id: quizObjectId });
      });

      if (!quiz) {
        res.status(404).json({
          success: false,
          error: 'Quiz not found',
          message: `No quiz found with ID: ${quizId}`,
        });
        return;
      }

      // Find the question in the quiz
      const questionIndex = quiz.questions.findIndex(
        (q: any) => q.questionId === questionId
      );

      if (questionIndex === -1) {
        res.status(404).json({
          success: false,
          error: 'Question not found',
          message: `No question found with ID: ${questionId} in quiz ${quizId}`,
        });
        return;
      }

      // Generate IDs for new options if provided
      if (validatedData.options) {
        validatedData.options = validatedData.options.map((option: any) => ({
          ...option,
          optionId: option.optionId || uuidv4(),
        }));
      }

      // Build update object for the specific question
      const updateFields: any = {};
      
      // Update only provided fields
      if (validatedData.questionText !== undefined) {
        updateFields['questions.' + questionIndex + '.questionText'] = validatedData.questionText;
      }
      if (validatedData.questionType !== undefined) {
        updateFields['questions.' + questionIndex + '.questionType'] = validatedData.questionType;
      }
      if (validatedData.questionImageUrl !== undefined) {
        updateFields['questions.' + questionIndex + '.questionImageUrl'] = validatedData.questionImageUrl;
      }
      if (validatedData.timeLimit !== undefined) {
        updateFields['questions.' + questionIndex + '.timeLimit'] = validatedData.timeLimit;
      }
      if (validatedData.options !== undefined) {
        updateFields['questions.' + questionIndex + '.options'] = validatedData.options;
      }
      if (validatedData.scoring !== undefined) {
        updateFields['questions.' + questionIndex + '.scoring'] = validatedData.scoring;
      }
      if (validatedData.shuffleOptions !== undefined) {
        updateFields['questions.' + questionIndex + '.shuffleOptions'] = validatedData.shuffleOptions;
      }
      if (validatedData.explanationText !== undefined) {
        updateFields['questions.' + questionIndex + '.explanationText'] = validatedData.explanationText;
      }
      if (validatedData.speakerNotes !== undefined) {
        updateFields['questions.' + questionIndex + '.speakerNotes'] = validatedData.speakerNotes;
      }

      // Always update the quiz's updatedAt timestamp
      updateFields.updatedAt = new Date();

      // Update the question in MongoDB
      const result = await mongodbService.withRetry(async () => {
        return await collection.findOneAndUpdate(
          { _id: quizObjectId },
          { $set: updateFields },
          { returnDocument: 'after' }
        );
      });

      if (!result) {
        res.status(404).json({
          success: false,
          error: 'Quiz not found',
          message: `No quiz found with ID: ${quizId}`,
        });
        return;
      }

      // Find and return the updated question
      const updatedQuestion = result.questions.find(
        (q: any) => q.questionId === questionId
      );

      res.status(200).json({
        success: true,
        message: 'Question updated successfully',
        question: updatedQuestion,
        quizId: quizId,
      });
    } catch (error) {
      console.error('Error updating question:', error);

      if (error instanceof Error) {
        res.status(500).json({
          success: false,
          error: 'Failed to update question',
          message: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to update question',
          message: 'Unknown error occurred',
        });
      }
    }
  }
);

/**
 * PUT /api/quizzes/:quizId/questions/reorder
 * 
 * Reorder questions in a quiz
 * 
 * Path Parameters:
 * - quizId: string (required) - MongoDB ObjectId of the quiz
 * 
 * Request Body:
 * - questionIds: string[] (required) - Array of question IDs in the new order
 * 
 * Response:
 * - 200: Questions reordered successfully
 * - 400: Invalid ID format or missing questionIds
 * - 404: Quiz not found
 * - 500: Server error
 * 
 * Validates: Requirements 1.1
 */
router.put('/:quizId/questions/reorder', async (req: Request, res: Response): Promise<void> => {
  try {
    const { quizId } = req.params;
    const { questionIds } = req.body;

    // Validate ObjectId format for quizId
    if (!quizId || quizId.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(quizId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid quiz ID format',
        message: 'Quiz ID must be a valid 24-character hexadecimal string',
      });
      return;
    }

    // Validate questionIds array
    if (!questionIds || !Array.isArray(questionIds) || questionIds.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Invalid request body',
        message: 'questionIds must be a non-empty array of question IDs',
      });
      return;
    }

    // Import ObjectId from mongodb
    const { ObjectId } = require('mongodb');
    const quizObjectId = new ObjectId(quizId);

    // Get collection
    const collection = mongodbService.getCollection<Quiz>('quizzes');

    // Find the quiz
    const quiz = await mongodbService.withRetry(async () => {
      return await collection.findOne({ _id: quizObjectId });
    });

    if (!quiz) {
      res.status(404).json({
        success: false,
        error: 'Quiz not found',
        message: `No quiz found with ID: ${quizId}`,
      });
      return;
    }

    // Validate that all questionIds exist in the quiz
    const existingQuestionIds = quiz.questions.map((q: any) => q.questionId);
    const allIdsExist = questionIds.every((id: string) => existingQuestionIds.includes(id));
    
    if (!allIdsExist) {
      res.status(400).json({
        success: false,
        error: 'Invalid question IDs',
        message: 'Some question IDs do not exist in this quiz',
      });
      return;
    }

    // Reorder questions based on the provided order
    const reorderedQuestions = questionIds
      .map((id: string) => quiz.questions.find((q: any) => q.questionId === id))
      .filter((q): q is NonNullable<typeof q> => q !== undefined);

    // Update the quiz with reordered questions
    const result = await mongodbService.withRetry(async () => {
      return await collection.findOneAndUpdate(
        { _id: quizObjectId },
        {
          $set: {
            questions: reorderedQuestions as any,
            updatedAt: new Date(),
          },
        },
        { returnDocument: 'after' }
      );
    });

    if (!result) {
      res.status(404).json({
        success: false,
        error: 'Quiz not found',
        message: `No quiz found with ID: ${quizId}`,
      });
      return;
    }

    // Transform quiz to include quizId
    const updatedQuiz = {
      ...result,
      quizId: result._id.toString(),
    };

    res.status(200).json({
      success: true,
      message: 'Questions reordered successfully',
      quiz: updatedQuiz,
    });
  } catch (error) {
    console.error('Error reordering questions:', error);

    if (error instanceof Error) {
      res.status(500).json({
        success: false,
        error: 'Failed to reorder questions',
        message: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to reorder questions',
        message: 'Unknown error occurred',
      });
    }
  }
});

/**
 * DELETE /api/quizzes/:quizId/questions/:questionId
 * 
 * Remove a question from a quiz
 * 
 * Path Parameters:
 * - quizId: string (required) - MongoDB ObjectId of the quiz
 * - questionId: string (required) - UUID of the question to delete
 * 
 * Response:
 * - 200: Question deleted successfully
 * - 400: Invalid ID format
 * - 404: Quiz or question not found
 * - 500: Server error
 * 
 * Validates: Requirements 1.2
 */
router.delete('/:quizId/questions/:questionId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { quizId, questionId } = req.params;

    // Validate ObjectId format for quizId
    if (!quizId || quizId.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(quizId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid quiz ID format',
        message: 'Quiz ID must be a valid 24-character hexadecimal string',
      });
      return;
    }

    // Validate UUID format for questionId
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!questionId || !uuidRegex.test(questionId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid question ID format',
        message: 'Question ID must be a valid UUID',
      });
      return;
    }

    // Import ObjectId from mongodb
    const { ObjectId } = require('mongodb');
    const quizObjectId = new ObjectId(quizId);

    // Get collection
    const collection = mongodbService.getCollection<Quiz>('quizzes');

    // Find the quiz and check if question exists
    const quiz = await mongodbService.withRetry(async () => {
      return await collection.findOne({ _id: quizObjectId });
    });

    if (!quiz) {
      res.status(404).json({
        success: false,
        error: 'Quiz not found',
        message: `No quiz found with ID: ${quizId}`,
      });
      return;
    }

    // Check if question exists in the quiz
    const questionExists = quiz.questions.some(
      (q: any) => q.questionId === questionId
    );

    if (!questionExists) {
      res.status(404).json({
        success: false,
        error: 'Question not found',
        message: `No question found with ID: ${questionId} in quiz ${quizId}`,
      });
      return;
    }

    // Remove the question using MongoDB $pull operator
    const result = await mongodbService.withRetry(async () => {
      return await collection.findOneAndUpdate(
        { _id: quizObjectId },
        {
          $pull: { questions: { questionId: questionId } },
          $set: { updatedAt: new Date() },
        },
        { returnDocument: 'after' }
      );
    });

    if (!result) {
      res.status(404).json({
        success: false,
        error: 'Quiz not found',
        message: `No quiz found with ID: ${quizId}`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Question deleted successfully',
      questionId: questionId,
      quizId: quizId,
    });
  } catch (error) {
    console.error('Error deleting question:', error);

    if (error instanceof Error) {
      res.status(500).json({
        success: false,
        error: 'Failed to delete question',
        message: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to delete question',
        message: 'Unknown error occurred',
      });
    }
  }
});

export default router;
