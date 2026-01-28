/**
 * Elimination Service
 * 
 * Handles elimination logic for ELIMINATION quiz type.
 * After each question, calculates bottom X% of participants based on current rankings
 * and marks them as eliminated. Eliminated participants transition to spectator mode.
 * 
 * Requirements: 6.9, 7.2, 7.3
 */

import { mongodbService } from './mongodb.service';
import { redisService } from './redis.service';
import { pubSubService } from './pubsub.service';
import { EliminationSettings } from '../models/types';

interface EliminationResult {
  eliminatedParticipants: string[];
  remainingParticipants: string[];
  eliminationPercentage: number;
}

class EliminationService {
  /**
   * Calculate and apply elimination after a question
   * 
   * Steps:
   * 1. Get elimination settings from quiz
   * 2. Get current leaderboard from Redis
   * 3. Calculate bottom X% of participants
   * 4. Mark eliminated participants in MongoDB and Redis
   * 5. Update session's eliminatedParticipants list
   * 6. Broadcast elimination events to affected participants
   * 
   * Requirements: 6.9, 7.2, 7.3
   * 
   * @param sessionId - Session ID
   * @param questionId - Question ID that just completed
   * @returns Elimination result with eliminated and remaining participants
   */
  async processElimination(
    sessionId: string
  ): Promise<EliminationResult | null> {
    try {
      const db = mongodbService.getDb();
      const redis = redisService.getClient();

      // 1. Get session and quiz to check elimination settings
      const session = await db.collection('sessions').findOne({ sessionId });
      if (!session) {
        console.error('[Elimination] Session not found:', sessionId);
        return null;
      }

      const quiz = await db.collection('quizzes').findOne({ _id: session.quizId });
      if (!quiz || quiz.quizType !== 'ELIMINATION') {
        console.error('[Elimination] Not an elimination quiz');
        return null;
      }

      const eliminationSettings = quiz.eliminationSettings as EliminationSettings;
      if (!eliminationSettings) {
        console.error('[Elimination] No elimination settings found');
        return null;
      }

      // 2. Get current leaderboard from Redis (sorted by score, ascending)
      const leaderboardKey = `session:${sessionId}:leaderboard`;
      const leaderboardRaw = await redis.zrange(leaderboardKey, 0, -1, 'WITHSCORES');

      if (leaderboardRaw.length === 0) {
        console.log('[Elimination] No participants in leaderboard');
        return null;
      }

      // Parse leaderboard (format: [member1, score1, member2, score2, ...])
      const leaderboard: Array<{ value: string; score: number }> = [];
      for (let i = 0; i < leaderboardRaw.length; i += 2) {
        leaderboard.push({
          value: leaderboardRaw[i],
          score: parseFloat(leaderboardRaw[i + 1]),
        });
      }

      // 3. Calculate how many participants to eliminate
      const totalParticipants = leaderboard.length;
      const eliminationPercentage = eliminationSettings.eliminationPercentage;
      const numToEliminate = Math.floor(totalParticipants * (eliminationPercentage / 100));

      if (numToEliminate === 0) {
        console.log('[Elimination] No participants to eliminate (percentage too low)');
        return {
          eliminatedParticipants: [],
          remainingParticipants: leaderboard.map(entry => entry.value),
          eliminationPercentage
        };
      }

      // 4. Identify bottom X% participants (lowest scores)
      // Note: zRangeWithScores returns in ascending order by default
      const bottomParticipants = leaderboard.slice(0, numToEliminate);
      const eliminatedParticipantIds = bottomParticipants.map(entry => entry.value);

      console.log(`[Elimination] Eliminating ${numToEliminate} out of ${totalParticipants} participants (${eliminationPercentage}%)`);

      // 5. Mark participants as eliminated in MongoDB
      await db.collection('participants').updateMany(
        {
          sessionId,
          participantId: { $in: eliminatedParticipantIds }
        },
        {
          $set: {
            isEliminated: true,
            isSpectator: true,
            isActive: false
          }
        }
      );

      // 6. Update participants in Redis
      for (const participantId of eliminatedParticipantIds) {
        const participantKey = `participant:${participantId}:session`;
        await redis.hset(participantKey, 'isEliminated', 'true');
        await redis.hset(participantKey, 'isSpectator', 'true');
        await redis.hset(participantKey, 'isActive', 'false');
      }

      // 7. Update session's eliminatedParticipants list
      await db.collection('sessions').updateOne(
        { sessionId },
        {
          $addToSet: {
            eliminatedParticipants: { $each: eliminatedParticipantIds }
          },
          $set: {
            activeParticipants: leaderboard
              .slice(numToEliminate)
              .map(entry => entry.value)
          },
          $inc: {
            participantCount: -numToEliminate
          }
        }
      );

      // 8. Get participant details for broadcasting
      const eliminatedParticipants = await db.collection('participants')
        .find({ participantId: { $in: eliminatedParticipantIds } })
        .toArray();

      // 9. Broadcast elimination events to each eliminated participant
      for (const participant of eliminatedParticipants) {
        await pubSubService.publishToParticipant(
          participant.participantId,
          'eliminated',
          {
            participantId: participant.participantId,
            finalRank: this.calculateRank(leaderboard, participant.participantId),
            finalScore: participant.totalScore,
            message: `You have been eliminated. You can continue watching as a spectator.`
          }
        );
      }

      // 10. Broadcast updated participant count to all clients
      const remainingParticipantIds = leaderboard
        .slice(numToEliminate)
        .map(entry => entry.value);

      await pubSubService.publishToParticipants(
        sessionId,
        'participant_count_updated',
        {
          participantCount: remainingParticipantIds.length,
          eliminatedCount: eliminatedParticipantIds.length
        }
      );

      console.log(`[Elimination] Successfully eliminated ${eliminatedParticipantIds.length} participants`);

      return {
        eliminatedParticipants: eliminatedParticipantIds,
        remainingParticipants: remainingParticipantIds,
        eliminationPercentage
      };
    } catch (error) {
      console.error('[Elimination] Error processing elimination:', error);
      return null;
    }
  }

  /**
   * Calculate participant's rank in leaderboard
   * 
   * @param leaderboard - Leaderboard entries (ascending order by score)
   * @param participantId - Participant ID
   * @returns Rank (1-based, where 1 is highest score)
   */
  private calculateRank(
    leaderboard: Array<{ value: string; score: number }>,
    participantId: string
  ): number {
    // Find participant in leaderboard
    const index = leaderboard.findIndex(entry => entry.value === participantId);
    if (index === -1) return 0;

    // Convert to rank (reverse order since leaderboard is ascending)
    return leaderboard.length - index;
  }

  /**
   * Check if participant is eliminated
   * 
   * @param participantId - Participant ID
   * @returns True if participant is eliminated
   */
  async isParticipantEliminated(participantId: string): Promise<boolean> {
    try {
      const redis = redisService.getClient();
      const participantKey = `participant:${participantId}:session`;
      const isEliminated = await redis.hget(participantKey, 'isEliminated');
      return isEliminated === 'true';
    } catch (error) {
      console.error('[Elimination] Error checking if participant is eliminated:', error);
      return false;
    }
  }

  /**
   * Get elimination settings for a session
   * 
   * @param sessionId - Session ID
   * @returns Elimination settings or null
   */
  async getEliminationSettings(sessionId: string): Promise<EliminationSettings | null> {
    try {
      const db = mongodbService.getDb();
      const session = await db.collection('sessions').findOne({ sessionId });
      if (!session) return null;

      const quiz = await db.collection('quizzes').findOne({ _id: session.quizId });
      if (!quiz || quiz.quizType !== 'ELIMINATION') return null;

      return quiz.eliminationSettings as EliminationSettings || null;
    } catch (error) {
      console.error('[Elimination] Error getting elimination settings:', error);
      return null;
    }
  }
}

// Export singleton instance
export const eliminationService = new EliminationService();
