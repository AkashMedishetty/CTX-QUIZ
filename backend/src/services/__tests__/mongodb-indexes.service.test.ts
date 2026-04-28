/**
 * MongoDB Indexes Service Tests
 * Tests for index creation and management
 */

import { mongodbService } from '../mongodb.service';
import { mongodbIndexesService } from '../mongodb-indexes.service';

describe('MongoDBIndexesService', () => {
  beforeAll(async () => {
    await mongodbService.connect();
  });

  afterAll(async () => {
    await mongodbService.disconnect();
  });

  describe('createIndexes', () => {
    it('should create all required indexes', async () => {
      // Create indexes
      await mongodbIndexesService.createIndexes();

      // List all indexes
      const indexes = await mongodbIndexesService.listIndexes();

      // Verify quizzes collection indexes
      expect(indexes.quizzes).toBeDefined();
      const quizzesIndexNames = indexes.quizzes.map((idx: any) => idx.name);
      expect(quizzesIndexNames).toContain('idx_quizzes_createdBy_createdAt');
      expect(quizzesIndexNames).toContain('idx_quizzes_createdAt');

      // Verify sessions collection indexes
      expect(indexes.sessions).toBeDefined();
      const sessionsIndexNames = indexes.sessions.map((idx: any) => idx.name);
      expect(sessionsIndexNames).toContain('idx_sessions_joinCode');
      expect(sessionsIndexNames).toContain('idx_sessions_state_createdAt');
      expect(sessionsIndexNames).toContain('idx_sessions_sessionId');
      expect(sessionsIndexNames).toContain('idx_sessions_createdAt');

      // Verify sessions joinCode index is unique
      const joinCodeIndex = indexes.sessions.find((idx: any) => idx.name === 'idx_sessions_joinCode');
      expect(joinCodeIndex?.unique).toBe(true);

      // Verify participants collection indexes
      expect(indexes.participants).toBeDefined();
      const participantsIndexNames = indexes.participants.map((idx: any) => idx.name);
      expect(participantsIndexNames).toContain('idx_participants_sessionId_isActive');
      expect(participantsIndexNames).toContain('idx_participants_sessionId_totalScore');
      expect(participantsIndexNames).toContain('idx_participants_participantId');
      expect(participantsIndexNames).toContain('idx_participants_sessionId');
      expect(participantsIndexNames).toContain('idx_participants_sessionId_ipAddress');

      // Verify answers collection indexes
      expect(indexes.answers).toBeDefined();
      const answersIndexNames = indexes.answers.map((idx: any) => idx.name);
      expect(answersIndexNames).toContain('idx_answers_sessionId_questionId');
      expect(answersIndexNames).toContain('idx_answers_participantId_questionId');
      expect(answersIndexNames).toContain('idx_answers_answerId');
      expect(answersIndexNames).toContain('idx_answers_sessionId');
      expect(answersIndexNames).toContain('idx_answers_sessionId_questionId_submittedAt');

      // Verify auditLogs collection indexes
      expect(indexes.auditLogs).toBeDefined();
      const auditLogsIndexNames = indexes.auditLogs.map((idx: any) => idx.name);
      expect(auditLogsIndexNames).toContain('idx_auditLogs_timestamp');
      expect(auditLogsIndexNames).toContain('idx_auditLogs_sessionId_timestamp');
      expect(auditLogsIndexNames).toContain('idx_auditLogs_eventType_timestamp');

      // Verify SaaS: organizationId indexes on quizzes and sessions
      expect(quizzesIndexNames).toContain('idx_quizzes_organizationId_createdAt');
      expect(sessionsIndexNames).toContain('idx_sessions_organizationId_createdAt');

      // Verify users collection indexes
      expect(indexes.users).toBeDefined();
      const usersIndexNames = indexes.users.map((idx: any) => idx.name);
      expect(usersIndexNames).toContain('idx_users_email');
      expect(usersIndexNames).toContain('idx_users_userId');

      // Verify organizations collection indexes
      expect(indexes.organizations).toBeDefined();
      const orgsIndexNames = indexes.organizations.map((idx: any) => idx.name);
      expect(orgsIndexNames).toContain('idx_organizations_organizationId');
      expect(orgsIndexNames).toContain('idx_organizations_slug');
      expect(orgsIndexNames).toContain('idx_organizations_ownerId');

      // Verify organization_members collection indexes
      expect(indexes.organization_members).toBeDefined();
      const orgMembersIndexNames = indexes.organization_members.map((idx: any) => idx.name);
      expect(orgMembersIndexNames).toContain('idx_organization_members_orgId_userId');
      expect(orgMembersIndexNames).toContain('idx_organization_members_userId');

      // Verify invitations collection indexes
      expect(indexes.invitations).toBeDefined();
      const invitationsIndexNames = indexes.invitations.map((idx: any) => idx.name);
      expect(invitationsIndexNames).toContain('idx_invitations_token');
      expect(invitationsIndexNames).toContain('idx_invitations_email_orgId');
      expect(invitationsIndexNames).toContain('idx_invitations_expiresAt');

      // Verify refresh_tokens collection indexes
      expect(indexes.refresh_tokens).toBeDefined();
      const refreshTokensIndexNames = indexes.refresh_tokens.map((idx: any) => idx.name);
      expect(refreshTokensIndexNames).toContain('idx_refresh_tokens_token');
      expect(refreshTokensIndexNames).toContain('idx_refresh_tokens_userId');
      expect(refreshTokensIndexNames).toContain('idx_refresh_tokens_expiresAt');

      // Verify subscriptions collection indexes
      expect(indexes.subscriptions).toBeDefined();
      const subscriptionsIndexNames = indexes.subscriptions.map((idx: any) => idx.name);
      expect(subscriptionsIndexNames).toContain('idx_subscriptions_organizationId');
      expect(subscriptionsIndexNames).toContain('idx_subscriptions_razorpaySubscriptionId');

      // Verify invoices collection indexes
      expect(indexes.invoices).toBeDefined();
      const invoicesIndexNames = indexes.invoices.map((idx: any) => idx.name);
      expect(invoicesIndexNames).toContain('idx_invoices_organizationId_createdAt');
      expect(invoicesIndexNames).toContain('idx_invoices_invoiceId');

      // Verify pricing_tiers collection indexes
      expect(indexes.pricing_tiers).toBeDefined();
      const pricingTiersIndexNames = indexes.pricing_tiers.map((idx: any) => idx.name);
      expect(pricingTiersIndexNames).toContain('idx_pricing_tiers_name');
    });

    it('should verify index properties for quizzes collection', async () => {
      const indexes = await mongodbIndexesService.listIndexes();
      
      // Check createdBy + createdAt compound index
      const createdByIndex = indexes.quizzes.find(
        (idx: any) => idx.name === 'idx_quizzes_createdBy_createdAt'
      );
      expect(createdByIndex).toBeDefined();
      expect(createdByIndex.key).toEqual({ createdBy: 1, createdAt: -1 });
    });

    it('should verify index properties for sessions collection', async () => {
      const indexes = await mongodbIndexesService.listIndexes();
      
      // Check joinCode unique index
      const joinCodeIndex = indexes.sessions.find(
        (idx: any) => idx.name === 'idx_sessions_joinCode'
      );
      expect(joinCodeIndex).toBeDefined();
      expect(joinCodeIndex.key).toEqual({ joinCode: 1 });
      expect(joinCodeIndex.unique).toBe(true);

      // Check state + createdAt compound index
      const stateIndex = indexes.sessions.find(
        (idx: any) => idx.name === 'idx_sessions_state_createdAt'
      );
      expect(stateIndex).toBeDefined();
      expect(stateIndex.key).toEqual({ state: 1, createdAt: -1 });
    });

    it('should verify index properties for participants collection', async () => {
      const indexes = await mongodbIndexesService.listIndexes();
      
      // Check sessionId + isActive compound index
      const sessionActiveIndex = indexes.participants.find(
        (idx: any) => idx.name === 'idx_participants_sessionId_isActive'
      );
      expect(sessionActiveIndex).toBeDefined();
      expect(sessionActiveIndex.key).toEqual({ sessionId: 1, isActive: 1 });

      // Check sessionId + totalScore compound index (for leaderboard)
      const leaderboardIndex = indexes.participants.find(
        (idx: any) => idx.name === 'idx_participants_sessionId_totalScore'
      );
      expect(leaderboardIndex).toBeDefined();
      expect(leaderboardIndex.key).toEqual({ sessionId: 1, totalScore: -1 });
    });

    it('should verify index properties for answers collection', async () => {
      const indexes = await mongodbIndexesService.listIndexes();
      
      // Check sessionId + questionId compound index
      const sessionQuestionIndex = indexes.answers.find(
        (idx: any) => idx.name === 'idx_answers_sessionId_questionId'
      );
      expect(sessionQuestionIndex).toBeDefined();
      expect(sessionQuestionIndex.key).toEqual({ sessionId: 1, questionId: 1 });

      // Check participantId + questionId compound index
      const participantQuestionIndex = indexes.answers.find(
        (idx: any) => idx.name === 'idx_answers_participantId_questionId'
      );
      expect(participantQuestionIndex).toBeDefined();
      expect(participantQuestionIndex.key).toEqual({ participantId: 1, questionId: 1 });

      // Check FFI index (sessionId + questionId + submittedAt)
      const ffiIndex = indexes.answers.find(
        (idx: any) => idx.name === 'idx_answers_sessionId_questionId_submittedAt'
      );
      expect(ffiIndex).toBeDefined();
      expect(ffiIndex.key).toEqual({ sessionId: 1, questionId: 1, submittedAt: 1 });
    });

    it('should verify index properties for auditLogs collection', async () => {
      const indexes = await mongodbIndexesService.listIndexes();
      
      // Check timestamp index
      const timestampIndex = indexes.auditLogs.find(
        (idx: any) => idx.name === 'idx_auditLogs_timestamp'
      );
      expect(timestampIndex).toBeDefined();
      expect(timestampIndex.key).toEqual({ timestamp: -1 });

      // Check sessionId + timestamp compound index
      const sessionTimestampIndex = indexes.auditLogs.find(
        (idx: any) => idx.name === 'idx_auditLogs_sessionId_timestamp'
      );
      expect(sessionTimestampIndex).toBeDefined();
      expect(sessionTimestampIndex.key).toEqual({ sessionId: 1, timestamp: -1 });
    });

    it('should handle creating indexes multiple times (idempotent)', async () => {
      // Create indexes first time
      await mongodbIndexesService.createIndexes();
      
      // Create indexes second time (should not throw error)
      await expect(mongodbIndexesService.createIndexes()).resolves.not.toThrow();
      
      // Verify indexes still exist
      const indexes = await mongodbIndexesService.listIndexes();
      expect(indexes.quizzes.length).toBeGreaterThan(1);
    });
  });

  describe('listIndexes', () => {
    it('should list indexes for all collections', async () => {
      const indexes = await mongodbIndexesService.listIndexes();

      expect(indexes).toHaveProperty('quizzes');
      expect(indexes).toHaveProperty('sessions');
      expect(indexes).toHaveProperty('participants');
      expect(indexes).toHaveProperty('answers');
      expect(indexes).toHaveProperty('auditLogs');
      expect(indexes).toHaveProperty('users');
      expect(indexes).toHaveProperty('organizations');
      expect(indexes).toHaveProperty('organization_members');
      expect(indexes).toHaveProperty('invitations');
      expect(indexes).toHaveProperty('refresh_tokens');
      expect(indexes).toHaveProperty('subscriptions');
      expect(indexes).toHaveProperty('invoices');
      expect(indexes).toHaveProperty('pricing_tiers');

      // Each collection should have at least the default _id index
      expect(indexes.quizzes.length).toBeGreaterThan(0);
      expect(indexes.sessions.length).toBeGreaterThan(0);
      expect(indexes.participants.length).toBeGreaterThan(0);
      expect(indexes.answers.length).toBeGreaterThan(0);
      expect(indexes.auditLogs.length).toBeGreaterThan(0);
      expect(indexes.users.length).toBeGreaterThan(0);
      expect(indexes.organizations.length).toBeGreaterThan(0);
      expect(indexes.organization_members.length).toBeGreaterThan(0);
      expect(indexes.invitations.length).toBeGreaterThan(0);
      expect(indexes.refresh_tokens.length).toBeGreaterThan(0);
      expect(indexes.subscriptions.length).toBeGreaterThan(0);
      expect(indexes.invoices.length).toBeGreaterThan(0);
      expect(indexes.pricing_tiers.length).toBeGreaterThan(0);
    });
  });

  describe('dropAllIndexes', () => {
    it('should drop all indexes except _id', async () => {
      // First create indexes
      await mongodbIndexesService.createIndexes();

      // Drop all indexes
      await mongodbIndexesService.dropAllIndexes();

      // List indexes
      const indexes = await mongodbIndexesService.listIndexes();

      // Each collection should only have the _id index
      const allCollections = [
        'quizzes', 'sessions', 'participants', 'answers', 'auditLogs',
        'users', 'organizations', 'organization_members', 'invitations',
        'refresh_tokens', 'subscriptions', 'invoices', 'pricing_tiers',
      ];

      for (const col of allCollections) {
        expect(indexes[col].length).toBe(1);
        expect(indexes[col][0].name).toBe('_id_');
      }

      // Recreate indexes for other tests
      await mongodbIndexesService.createIndexes();
    });
  });
});
