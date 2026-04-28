/**
 * MongoDB Indexes Service
 * Creates and manages database indexes for query optimization
 * Validates: Requirement 11.6
 */

import { Db } from 'mongodb';
import { mongodbService } from './mongodb.service';

export class MongoDBIndexesService {
  /**
   * Create all required indexes for the database
   */
  async createIndexes(): Promise<void> {
    const db = mongodbService.getDb();

    console.log('Creating MongoDB indexes...');

    try {
      await Promise.all([
        this.createQuizzesIndexes(db),
        this.createSessionsIndexes(db),
        this.createParticipantsIndexes(db),
        this.createAnswersIndexes(db),
        this.createAuditLogsIndexes(db),
        this.createUsersIndexes(db),
        this.createOrganizationsIndexes(db),
        this.createOrganizationMembersIndexes(db),
        this.createInvitationsIndexes(db),
        this.createRefreshTokensIndexes(db),
        this.createSubscriptionsIndexes(db),
        this.createInvoicesIndexes(db),
        this.createPricingTiersIndexes(db),
      ]);

      console.log('✓ All MongoDB indexes created successfully');
    } catch (error) {
      console.error('Error creating MongoDB indexes:', error);
      throw error;
    }
  }

  /**
   * Create indexes for quizzes collection
   */
  private async createQuizzesIndexes(db: Db): Promise<void> {
    const collection = db.collection('quizzes');

    await collection.createIndex(
      { createdBy: 1, createdAt: -1 },
      { name: 'idx_quizzes_createdBy_createdAt' }
    );

    await collection.createIndex(
      { createdAt: -1 },
      { name: 'idx_quizzes_createdAt' }
    );

    // SaaS: organizationId index for tenant-scoped queries
    await collection.createIndex(
      { organizationId: 1, createdAt: -1 },
      { name: 'idx_quizzes_organizationId_createdAt' }
    );

    console.log('  ✓ Created indexes for quizzes collection');
  }

  /**
   * Create indexes for sessions collection
   */
  private async createSessionsIndexes(db: Db): Promise<void> {
    const collection = db.collection('sessions');

    // Unique index on joinCode for fast lookups and uniqueness enforcement
    await collection.createIndex(
      { joinCode: 1 },
      { name: 'idx_sessions_joinCode', unique: true }
    );

    // Index on state and createdAt for filtering active sessions
    await collection.createIndex(
      { state: 1, createdAt: -1 },
      { name: 'idx_sessions_state_createdAt' }
    );

    // Index on sessionId for fast lookups
    await collection.createIndex(
      { sessionId: 1 },
      { name: 'idx_sessions_sessionId', unique: true }
    );

    // Index on createdAt for cleanup queries
    await collection.createIndex(
      { createdAt: -1 },
      { name: 'idx_sessions_createdAt' }
    );

    // SaaS: organizationId index for tenant-scoped queries
    await collection.createIndex(
      { organizationId: 1, createdAt: -1 },
      { name: 'idx_sessions_organizationId_createdAt' }
    );

    console.log('  ✓ Created indexes for sessions collection');
  }

  /**
   * Create indexes for participants collection
   */
  private async createParticipantsIndexes(db: Db): Promise<void> {
    const collection = db.collection('participants');

    // Compound index for finding active participants in a session
    await collection.createIndex(
      { sessionId: 1, isActive: 1 },
      { name: 'idx_participants_sessionId_isActive' }
    );

    // Compound index for leaderboard queries (session + score)
    await collection.createIndex(
      { sessionId: 1, totalScore: -1 },
      { name: 'idx_participants_sessionId_totalScore' }
    );

    // Index on participantId for fast lookups
    await collection.createIndex(
      { participantId: 1 },
      { name: 'idx_participants_participantId', unique: true }
    );

    // Index on sessionId for session-based queries
    await collection.createIndex(
      { sessionId: 1 },
      { name: 'idx_participants_sessionId' }
    );

    // Index on ipAddress for ban checks
    await collection.createIndex(
      { sessionId: 1, ipAddress: 1 },
      { name: 'idx_participants_sessionId_ipAddress' }
    );

    console.log('  ✓ Created indexes for participants collection');
  }

  /**
   * Create indexes for answers collection
   */
  private async createAnswersIndexes(db: Db): Promise<void> {
    const collection = db.collection('answers');

    // Compound index for finding answers by session and question
    await collection.createIndex(
      { sessionId: 1, questionId: 1 },
      { name: 'idx_answers_sessionId_questionId' }
    );

    // Compound index for finding participant's answers
    await collection.createIndex(
      { participantId: 1, questionId: 1 },
      { name: 'idx_answers_participantId_questionId' }
    );

    // Index on answerId for fast lookups
    await collection.createIndex(
      { answerId: 1 },
      { name: 'idx_answers_answerId', unique: true }
    );

    // Index on sessionId for session-based queries
    await collection.createIndex(
      { sessionId: 1 },
      { name: 'idx_answers_sessionId' }
    );

    // Index on submittedAt for FFI queries (fastest finger first)
    await collection.createIndex(
      { sessionId: 1, questionId: 1, submittedAt: 1 },
      { name: 'idx_answers_sessionId_questionId_submittedAt' }
    );

    console.log('  ✓ Created indexes for answers collection');
  }

  /**
   * Create indexes for auditLogs collection
   */
  private async createAuditLogsIndexes(db: Db): Promise<void> {
    const collection = db.collection('auditLogs');

    // Index on timestamp for time-based queries
    await collection.createIndex(
      { timestamp: -1 },
      { name: 'idx_auditLogs_timestamp' }
    );

    // Compound index for session-based audit queries
    await collection.createIndex(
      { sessionId: 1, timestamp: -1 },
      { name: 'idx_auditLogs_sessionId_timestamp' }
    );

    // Index on eventType for filtering by event type
    await collection.createIndex(
      { eventType: 1, timestamp: -1 },
      { name: 'idx_auditLogs_eventType_timestamp' }
    );

    console.log('  ✓ Created indexes for auditLogs collection');
  }

  // ==========================================================================
  // SaaS Collection Indexes
  // ==========================================================================

  /**
   * Create indexes for users collection
   */
  private async createUsersIndexes(db: Db): Promise<void> {
    const collection = db.collection('users');

    await collection.createIndex(
      { email: 1 },
      { name: 'idx_users_email', unique: true }
    );

    await collection.createIndex(
      { userId: 1 },
      { name: 'idx_users_userId', unique: true }
    );

    console.log('  ✓ Created indexes for users collection');
  }

  /**
   * Create indexes for organizations collection
   */
  private async createOrganizationsIndexes(db: Db): Promise<void> {
    const collection = db.collection('organizations');

    await collection.createIndex(
      { organizationId: 1 },
      { name: 'idx_organizations_organizationId', unique: true }
    );

    await collection.createIndex(
      { slug: 1 },
      { name: 'idx_organizations_slug', unique: true }
    );

    await collection.createIndex(
      { ownerId: 1 },
      { name: 'idx_organizations_ownerId' }
    );

    console.log('  ✓ Created indexes for organizations collection');
  }

  /**
   * Create indexes for organization_members collection
   */
  private async createOrganizationMembersIndexes(db: Db): Promise<void> {
    const collection = db.collection('organization_members');

    await collection.createIndex(
      { organizationId: 1, userId: 1 },
      { name: 'idx_organization_members_orgId_userId', unique: true }
    );

    await collection.createIndex(
      { userId: 1 },
      { name: 'idx_organization_members_userId' }
    );

    console.log('  ✓ Created indexes for organization_members collection');
  }

  /**
   * Create indexes for invitations collection
   */
  private async createInvitationsIndexes(db: Db): Promise<void> {
    const collection = db.collection('invitations');

    await collection.createIndex(
      { token: 1 },
      { name: 'idx_invitations_token', unique: true }
    );

    await collection.createIndex(
      { email: 1, organizationId: 1 },
      { name: 'idx_invitations_email_orgId' }
    );

    await collection.createIndex(
      { expiresAt: 1 },
      { name: 'idx_invitations_expiresAt', expireAfterSeconds: 0 }
    );

    console.log('  ✓ Created indexes for invitations collection');
  }

  /**
   * Create indexes for refresh_tokens collection
   */
  private async createRefreshTokensIndexes(db: Db): Promise<void> {
    const collection = db.collection('refresh_tokens');

    await collection.createIndex(
      { token: 1 },
      { name: 'idx_refresh_tokens_token', unique: true }
    );

    await collection.createIndex(
      { userId: 1 },
      { name: 'idx_refresh_tokens_userId' }
    );

    await collection.createIndex(
      { expiresAt: 1 },
      { name: 'idx_refresh_tokens_expiresAt', expireAfterSeconds: 0 }
    );

    console.log('  ✓ Created indexes for refresh_tokens collection');
  }

  /**
   * Create indexes for subscriptions collection
   */
  private async createSubscriptionsIndexes(db: Db): Promise<void> {
    const collection = db.collection('subscriptions');

    await collection.createIndex(
      { organizationId: 1 },
      { name: 'idx_subscriptions_organizationId' }
    );

    await collection.createIndex(
      { razorpaySubscriptionId: 1 },
      { name: 'idx_subscriptions_razorpaySubscriptionId', unique: true }
    );

    console.log('  ✓ Created indexes for subscriptions collection');
  }

  /**
   * Create indexes for invoices collection
   */
  private async createInvoicesIndexes(db: Db): Promise<void> {
    const collection = db.collection('invoices');

    await collection.createIndex(
      { organizationId: 1, createdAt: -1 },
      { name: 'idx_invoices_organizationId_createdAt' }
    );

    await collection.createIndex(
      { invoiceId: 1 },
      { name: 'idx_invoices_invoiceId', unique: true }
    );

    console.log('  ✓ Created indexes for invoices collection');
  }

  /**
   * Create indexes for pricing_tiers collection
   */
  private async createPricingTiersIndexes(db: Db): Promise<void> {
    const collection = db.collection('pricing_tiers');

    await collection.createIndex(
      { name: 1 },
      { name: 'idx_pricing_tiers_name', unique: true }
    );

    console.log('  ✓ Created indexes for pricing_tiers collection');
  }

  /**
   * List all indexes in the database
   */
  async listIndexes(): Promise<Record<string, any[]>> {
    const db = mongodbService.getDb();
    const collections = [
      'quizzes', 'sessions', 'participants', 'answers', 'auditLogs',
      'users', 'organizations', 'organization_members', 'invitations',
      'refresh_tokens', 'subscriptions', 'invoices', 'pricing_tiers',
    ];
    const result: Record<string, any[]> = {};

    for (const collectionName of collections) {
      const collection = db.collection(collectionName);
      const indexes = await collection.indexes();
      result[collectionName] = indexes;
    }

    return result;
  }

  /**
   * Drop all indexes (except _id) - useful for testing
   */
  async dropAllIndexes(): Promise<void> {
    const db = mongodbService.getDb();
    const collections = [
      'quizzes', 'sessions', 'participants', 'answers', 'auditLogs',
      'users', 'organizations', 'organization_members', 'invitations',
      'refresh_tokens', 'subscriptions', 'invoices', 'pricing_tiers',
    ];

    console.log('Dropping all indexes...');

    for (const collectionName of collections) {
      const collection = db.collection(collectionName);
      await collection.dropIndexes();
      console.log(`  ✓ Dropped indexes for ${collectionName}`);
    }

    console.log('✓ All indexes dropped');
  }
}

// Export singleton instance
export const mongodbIndexesService = new MongoDBIndexesService();
