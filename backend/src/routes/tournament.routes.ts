/**
 * Tournament Routes
 * 
 * REST API endpoints for tournament management:
 * - POST /api/tournaments - Create tournament
 * - GET /api/tournaments - List all tournaments
 * - GET /api/tournaments/:tournamentId - Get tournament details
 * - POST /api/tournaments/:tournamentId/rounds - Add round
 * - POST /api/tournaments/:tournamentId/start - Start tournament
 * - POST /api/tournaments/:tournamentId/rounds/:roundNumber/start - Start round
 * - POST /api/tournaments/:tournamentId/rounds/:roundNumber/end - End round
 * - GET /api/tournaments/:tournamentId/bracket - Get bracket visualization
 * - DELETE /api/tournaments/:tournamentId - Delete tournament
 * 
 * Requirements: 3.1, 3.2, 3.5, 3.7
 */

import { Router, Request, Response, NextFunction } from 'express';
import { tournamentService } from '../services/tournament.service';
import {
  validateRequest,
  createTournamentRequestSchema,
  addTournamentRoundRequestSchema,
} from '../models/validation';

const router = Router();

/**
 * POST /api/tournaments
 * Create a new tournament
 */
router.post(
  '/',
  validateRequest(createTournamentRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // For now, use a placeholder host ID (would come from auth in production)
      const hostId = req.headers['x-host-id'] as string || 'admin';
      const tournament = await tournamentService.createTournament(req.body, hostId);
      
      res.status(201).json({
        success: true,
        tournament,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/tournaments
 * List all tournaments
 */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const tournaments = await tournamentService.getAllTournaments();
    
    res.json({
      success: true,
      tournaments,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/tournaments/:tournamentId
 * Get tournament details
 */
router.get('/:tournamentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tournamentId } = req.params;
    const tournament = await tournamentService.getTournament(tournamentId);
    
    if (!tournament) {
      res.status(404).json({
        success: false,
        error: 'Tournament not found',
      });
      return;
    }
    
    res.json({
      success: true,
      tournament,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/tournaments/:tournamentId/rounds
 * Add a round to a tournament
 */
router.post(
  '/:tournamentId/rounds',
  validateRequest(addTournamentRoundRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tournamentId } = req.params;
      const { quizId } = req.body;
      
      const round = await tournamentService.addRound(tournamentId, quizId);
      
      res.status(201).json({
        success: true,
        round,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Tournament not found') {
          res.status(404).json({
            success: false,
            error: error.message,
          });
          return;
        }
        if (error.message.includes('DRAFT state')) {
          res.status(400).json({
            success: false,
            error: error.message,
          });
          return;
        }
      }
      next(error);
    }
  }
);

/**
 * POST /api/tournaments/:tournamentId/start
 * Start a tournament (move from DRAFT to LOBBY)
 */
router.post('/:tournamentId/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tournamentId } = req.params;
    const tournament = await tournamentService.startTournament(tournamentId);
    
    res.json({
      success: true,
      tournament,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Tournament not found') {
        res.status(404).json({
          success: false,
          error: error.message,
        });
        return;
      }
      if (error.message.includes('DRAFT state') || error.message.includes('at least one round')) {
        res.status(400).json({
          success: false,
          error: error.message,
        });
        return;
      }
    }
    next(error);
  }
});

/**
 * POST /api/tournaments/:tournamentId/rounds/:roundNumber/start
 * Start a specific round
 */
router.post(
  '/:tournamentId/rounds/:roundNumber/start',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tournamentId, roundNumber } = req.params;
      const round = await tournamentService.startRound(tournamentId, parseInt(roundNumber, 10));
      
      res.json({
        success: true,
        round,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Tournament not found') {
          res.status(404).json({
            success: false,
            error: error.message,
          });
          return;
        }
        if (
          error.message.includes('Invalid round number') ||
          error.message.includes('PENDING state') ||
          error.message.includes('Previous round')
        ) {
          res.status(400).json({
            success: false,
            error: error.message,
          });
          return;
        }
      }
      next(error);
    }
  }
);

/**
 * POST /api/tournaments/:tournamentId/rounds/:roundNumber/end
 * End a round and calculate advancing participants
 */
router.post(
  '/:tournamentId/rounds/:roundNumber/end',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tournamentId, roundNumber } = req.params;
      const round = await tournamentService.endRound(tournamentId, parseInt(roundNumber, 10));
      
      res.json({
        success: true,
        round,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Tournament not found') {
          res.status(404).json({
            success: false,
            error: error.message,
          });
          return;
        }
        if (
          error.message.includes('Invalid round number') ||
          error.message.includes('ACTIVE state') ||
          error.message.includes('no associated session')
        ) {
          res.status(400).json({
            success: false,
            error: error.message,
          });
          return;
        }
      }
      next(error);
    }
  }
);

/**
 * GET /api/tournaments/:tournamentId/bracket
 * Get tournament bracket visualization data
 */
router.get('/:tournamentId/bracket', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tournamentId } = req.params;
    const bracket = await tournamentService.getTournamentBracket(tournamentId);
    
    res.json({
      success: true,
      bracket,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Tournament not found') {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }
    next(error);
  }
});

/**
 * DELETE /api/tournaments/:tournamentId
 * Delete a tournament
 */
router.delete('/:tournamentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tournamentId } = req.params;
    const deleted = await tournamentService.deleteTournament(tournamentId);
    
    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'Tournament not found',
      });
      return;
    }
    
    res.json({
      success: true,
      message: 'Tournament deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
