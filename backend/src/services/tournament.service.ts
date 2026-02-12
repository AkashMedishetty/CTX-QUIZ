/**
 * Tournament Service
 * 
 * Manages multi-round tournament functionality including:
 * - Tournament creation and configuration
 * - Round management (add, start, end)
 * - Participant progression calculation (TOP_N, TOP_PERCENTAGE)
 * - Score carry-over between rounds
 * - Tournament bracket visualization data
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.8
 */

import { ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { mongodbService } from './mongodb.service';
import type {
  Tournament,
  TournamentRound,
  CreateTournamentRequest,
  TournamentBracket,
  Branding,
  Participant,
} from '../models/types';

/**
 * Default branding for tournaments
 */
const DEFAULT_BRANDING: Branding = {
  primaryColor: '#275249',
  secondaryColor: '#6B3093',
};

class TournamentService {
  private readonly collectionName = 'tournaments';

  /**
   * Create a new tournament
   */
  async createTournament(data: CreateTournamentRequest, hostId: string): Promise<Tournament> {
    const tournament: Tournament = {
      tournamentId: uuidv4(),
      title: data.title,
      description: data.description,
      branding: data.branding || DEFAULT_BRANDING,
      rounds: [],
      progressionRules: data.progressionRules,
      state: 'DRAFT',
      currentRoundIndex: 0,
      createdAt: new Date(),
      hostId,
    };

    const db = mongodbService.getDb();
    const result = await db.collection(this.collectionName).insertOne(tournament);
    tournament._id = result.insertedId;

    return tournament;
  }

  /**
   * Get tournament by ID
   */
  async getTournament(tournamentId: string): Promise<Tournament | null> {
    const db = mongodbService.getDb();
    return db.collection<Tournament>(this.collectionName).findOne({ tournamentId });
  }

  /**
   * Get all tournaments
   */
  async getAllTournaments(): Promise<Tournament[]> {
    const db = mongodbService.getDb();
    return db.collection<Tournament>(this.collectionName)
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
  }

  /**
   * Add a round to a tournament
   */
  async addRound(tournamentId: string, quizId: string): Promise<TournamentRound> {
    const tournament = await this.getTournament(tournamentId);
    if (!tournament) {
      throw new Error('Tournament not found');
    }

    if (tournament.state !== 'DRAFT') {
      throw new Error('Can only add rounds to tournaments in DRAFT state');
    }

    const round: TournamentRound = {
      roundNumber: tournament.rounds.length + 1,
      quizId: new ObjectId(quizId),
      qualifiedParticipants: [],
      state: 'PENDING',
    };

    const db = mongodbService.getDb();
    await db.collection(this.collectionName).updateOne(
      { tournamentId },
      { $push: { rounds: round } as any }
    );

    return round;
  }

  /**
   * Start a tournament (move from DRAFT to LOBBY)
   */
  async startTournament(tournamentId: string): Promise<Tournament> {
    const tournament = await this.getTournament(tournamentId);
    if (!tournament) {
      throw new Error('Tournament not found');
    }

    if (tournament.state !== 'DRAFT') {
      throw new Error('Can only start tournaments in DRAFT state');
    }

    if (tournament.rounds.length === 0) {
      throw new Error('Tournament must have at least one round');
    }

    const db = mongodbService.getDb();
    await db.collection(this.collectionName).updateOne(
      { tournamentId },
      {
        $set: {
          state: 'LOBBY',
          startedAt: new Date(),
        },
      }
    );

    return (await this.getTournament(tournamentId))!;
  }

  /**
   * Start a specific round
   */
  async startRound(tournamentId: string, roundNumber: number): Promise<TournamentRound> {
    const tournament = await this.getTournament(tournamentId);
    if (!tournament) {
      throw new Error('Tournament not found');
    }

    if (tournament.state !== 'LOBBY' && tournament.state !== 'IN_PROGRESS') {
      throw new Error('Tournament must be in LOBBY or IN_PROGRESS state to start a round');
    }

    const roundIndex = roundNumber - 1;
    if (roundIndex < 0 || roundIndex >= tournament.rounds.length) {
      throw new Error('Invalid round number');
    }

    const round = tournament.rounds[roundIndex];
    if (round.state !== 'PENDING') {
      throw new Error('Round is not in PENDING state');
    }

    // For rounds after the first, check that previous round is completed
    if (roundIndex > 0) {
      const previousRound = tournament.rounds[roundIndex - 1];
      if (previousRound.state !== 'COMPLETED') {
        throw new Error('Previous round must be completed before starting this round');
      }
    }

    const db = mongodbService.getDb();
    await db.collection(this.collectionName).updateOne(
      { tournamentId },
      {
        $set: {
          [`rounds.${roundIndex}.state`]: 'ACTIVE',
          [`rounds.${roundIndex}.startedAt`]: new Date(),
          state: 'IN_PROGRESS',
          currentRoundIndex: roundIndex,
        },
      }
    );

    return (await this.getTournament(tournamentId))!.rounds[roundIndex];
  }

  /**
   * End a round and calculate advancing participants
   */
  async endRound(tournamentId: string, roundNumber: number): Promise<TournamentRound> {
    const tournament = await this.getTournament(tournamentId);
    if (!tournament) {
      throw new Error('Tournament not found');
    }

    const roundIndex = roundNumber - 1;
    if (roundIndex < 0 || roundIndex >= tournament.rounds.length) {
      throw new Error('Invalid round number');
    }

    const round = tournament.rounds[roundIndex];
    if (round.state !== 'ACTIVE') {
      throw new Error('Round is not in ACTIVE state');
    }

    // Calculate advancing participants
    const advancingParticipants = await this.calculateAdvancingParticipants(
      tournamentId,
      roundNumber
    );

    const db = mongodbService.getDb();
    const updateData: Record<string, unknown> = {
      [`rounds.${roundIndex}.state`]: 'COMPLETED',
      [`rounds.${roundIndex}.endedAt`]: new Date(),
    };

    // If there's a next round, set its qualified participants
    if (roundIndex + 1 < tournament.rounds.length) {
      updateData[`rounds.${roundIndex + 1}.qualifiedParticipants`] = advancingParticipants;
    } else {
      // This was the last round, tournament is complete
      updateData.state = 'COMPLETED';
      updateData.endedAt = new Date();
    }

    await db.collection(this.collectionName).updateOne(
      { tournamentId },
      { $set: updateData }
    );

    return (await this.getTournament(tournamentId))!.rounds[roundIndex];
  }

  /**
   * Calculate which participants advance to the next round
   */
  async calculateAdvancingParticipants(
    tournamentId: string,
    roundNumber: number
  ): Promise<string[]> {
    const tournament = await this.getTournament(tournamentId);
    if (!tournament) {
      throw new Error('Tournament not found');
    }

    const roundIndex = roundNumber - 1;
    const round = tournament.rounds[roundIndex];
    if (!round.sessionId) {
      throw new Error('Round has no associated session');
    }

    // Get leaderboard for the session
    const db = mongodbService.getDb();
    const participants = await db.collection<Participant>('participants')
      .find({ sessionId: round.sessionId, isEliminated: false })
      .sort({ totalScore: -1, totalTimeMs: 1 }) // Sort by score desc, time asc (tiebreaker)
      .toArray();

    if (participants.length === 0) {
      return [];
    }

    const { type, value } = tournament.progressionRules;
    let advancingCount: number;

    if (type === 'TOP_N') {
      advancingCount = Math.min(value, participants.length);
    } else {
      // TOP_PERCENTAGE
      advancingCount = Math.ceil(participants.length * value / 100);
    }

    return participants.slice(0, advancingCount).map(p => p.participantId);
  }

  /**
   * Get tournament bracket visualization data
   */
  async getTournamentBracket(tournamentId: string): Promise<TournamentBracket> {
    const tournament = await this.getTournament(tournamentId);
    if (!tournament) {
      throw new Error('Tournament not found');
    }

    const db = mongodbService.getDb();
    const rounds: TournamentBracket['rounds'] = [];

    for (const round of tournament.rounds) {
      const roundData: TournamentBracket['rounds'][0] = {
        roundNumber: round.roundNumber,
        state: round.state,
        participants: [],
      };

      if (round.sessionId) {
        // Get participants for this round's session
        const participants = await db.collection<Participant>('participants')
          .find({ sessionId: round.sessionId })
          .sort({ totalScore: -1, totalTimeMs: 1 })
          .toArray();

        // Determine which participants are qualified for next round
        const nextRound = tournament.rounds[round.roundNumber];
        const qualifiedForNext = nextRound?.qualifiedParticipants || [];

        roundData.participants = participants.map(p => ({
          participantId: p.participantId,
          nickname: p.nickname,
          score: p.totalScore,
          isQualified: qualifiedForNext.includes(p.participantId),
          isEliminated: p.isEliminated || (round.state === 'COMPLETED' && !qualifiedForNext.includes(p.participantId)),
        }));
      } else if (round.qualifiedParticipants.length > 0) {
        // Round hasn't started but has qualified participants from previous round
        // Get participant details from previous round's session
        const prevRound = tournament.rounds[round.roundNumber - 2];
        if (prevRound?.sessionId) {
          const participants = await db.collection<Participant>('participants')
            .find({
              sessionId: prevRound.sessionId,
              participantId: { $in: round.qualifiedParticipants },
            })
            .toArray();

          roundData.participants = participants.map(p => ({
            participantId: p.participantId,
            nickname: p.nickname,
            score: tournament.progressionRules.scoreCarryOver ? p.totalScore : 0,
            isQualified: true,
            isEliminated: false,
          }));
        }
      }

      rounds.push(roundData);
    }

    return {
      tournamentId: tournament.tournamentId,
      title: tournament.title,
      state: tournament.state,
      currentRoundIndex: tournament.currentRoundIndex,
      rounds,
    };
  }

  /**
   * Check if a participant is qualified for a specific round
   */
  async isParticipantQualified(
    tournamentId: string,
    roundNumber: number,
    participantId: string
  ): Promise<boolean> {
    const tournament = await this.getTournament(tournamentId);
    if (!tournament) {
      return false;
    }

    const roundIndex = roundNumber - 1;
    if (roundIndex < 0 || roundIndex >= tournament.rounds.length) {
      return false;
    }

    const round = tournament.rounds[roundIndex];

    // First round - everyone is qualified
    if (roundIndex === 0) {
      return true;
    }

    // Subsequent rounds - check qualified list
    return round.qualifiedParticipants.includes(participantId);
  }

  /**
   * Link a session to a tournament round
   */
  async linkSessionToRound(
    tournamentId: string,
    roundNumber: number,
    sessionId: string
  ): Promise<void> {
    const tournament = await this.getTournament(tournamentId);
    if (!tournament) {
      throw new Error('Tournament not found');
    }

    const roundIndex = roundNumber - 1;
    if (roundIndex < 0 || roundIndex >= tournament.rounds.length) {
      throw new Error('Invalid round number');
    }

    const db = mongodbService.getDb();
    await db.collection(this.collectionName).updateOne(
      { tournamentId },
      { $set: { [`rounds.${roundIndex}.sessionId`]: sessionId } }
    );
  }

  /**
   * Delete a tournament
   */
  async deleteTournament(tournamentId: string): Promise<boolean> {
    const db = mongodbService.getDb();
    const result = await db.collection(this.collectionName).deleteOne({ tournamentId });
    return result.deletedCount > 0;
  }
}

export const tournamentService = new TournamentService();
