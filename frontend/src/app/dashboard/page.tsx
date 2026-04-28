'use client';

import { useEffect } from 'react';
import { useOrganizationStore } from '@/store/organization-store';
import { useSubscriptionStore } from '@/store/subscription-store';
import { getMembers } from '@/lib/org-client';
import { useState } from 'react';

// ============================================================================
// Usage Progress Bar
// ============================================================================

function UsageBar({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const isUnlimited = limit === -1;
  const pct = isUnlimited ? 0 : limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const isWarning = !isUnlimited && pct >= 80 && pct < 100;
  const isError = !isUnlimited && pct >= 100;

  const barColor = isError
    ? 'bg-error'
    : isWarning
      ? 'bg-warning'
      : 'bg-primary';

  const limitLabel = isUnlimited ? '∞' : limit;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-body-sm">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className="font-medium text-[var(--text-primary)]">
          {used} / {limitLabel}
        </span>
      </div>
      <div className="h-3 rounded-full neu-pressed-sm overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-slow ${barColor}`}
          style={{ width: isUnlimited ? '0%' : `${pct}%` }}
        />
      </div>
      {isWarning && (
        <p className="text-caption text-warning font-medium">
          ⚠ Approaching limit — consider upgrading your plan
        </p>
      )}
      {isError && (
        <p className="text-caption text-error font-medium">
          ✕ Limit reached —{' '}
          <a href="/dashboard/billing" className="underline">
            upgrade now
          </a>
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Dashboard Overview Page
// ============================================================================

export default function DashboardPage() {
  const { currentOrganization } = useOrganizationStore();
  const {
    currentTier,
    usageStats,
    fetchCurrentTier,
    fetchUsage,
    isLoading,
  } = useSubscriptionStore();

  const [memberCount, setMemberCount] = useState<number | null>(null);

  useEffect(() => {
    fetchCurrentTier();
    fetchUsage();
  }, [fetchCurrentTier, fetchUsage]);

  useEffect(() => {
    if (!currentOrganization) return;
    getMembers(currentOrganization.organizationId)
      .then((members) => setMemberCount(members.length))
      .catch(() => setMemberCount(null));
  }, [currentOrganization]);

  if (!currentOrganization) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-[var(--text-muted)]">No organization selected</p>
      </div>
    );
  }

  const org = currentOrganization;
  const createdDate = new Date(org.createdAt).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-6">
      <h1 className="text-h2 font-semibold text-[var(--text-primary)]">
        Dashboard
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Organization Overview Card */}
        <div className="card space-y-4">
          <h2 className="text-h3 font-semibold text-[var(--text-primary)]">
            Organization
          </h2>
          <div className="space-y-3">
            <InfoRow label="Name" value={org.name} />
            <InfoRow label="Slug" value={org.slug} />
            <InfoRow
              label="Members"
              value={memberCount !== null ? String(memberCount) : '—'}
            />
            <InfoRow label="Tier" value={capitalize(org.currentTier)} />
            <InfoRow label="Created" value={createdDate} />
          </div>
        </div>

        {/* Subscription Status Card */}
        <div className="card space-y-4">
          <h2 className="text-h3 font-semibold text-[var(--text-primary)]">
            Subscription
          </h2>
          {isLoading && !currentTier ? (
            <p className="text-[var(--text-muted)] text-body-sm">Loading…</p>
          ) : currentTier ? (
            <div className="space-y-3">
              <InfoRow label="Plan" value={capitalize(currentTier.tierName)} />
              <InfoRow label="Status" value={<StatusBadge status={currentTier.status} />} />
              {currentTier.currentPeriodEnd && (
                <InfoRow
                  label="Next billing"
                  value={new Date(currentTier.currentPeriodEnd).toLocaleDateString('en-IN', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                />
              )}
              {currentTier.pendingDowngradeTier && (
                <div className="mt-2 p-3 rounded-md bg-warning/10 border border-warning/30">
                  <p className="text-body-sm text-warning font-medium">
                    Pending downgrade to {capitalize(currentTier.pendingDowngradeTier)} at end of billing period
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <InfoRow label="Plan" value="Free" />
              <InfoRow label="Status" value={<StatusBadge status="active" />} />
            </div>
          )}
        </div>

        {/* Usage Card */}
        <div className="card space-y-5 lg:col-span-2">
          <h2 className="text-h3 font-semibold text-[var(--text-primary)]">
            Usage
          </h2>
          {isLoading && !usageStats ? (
            <p className="text-[var(--text-muted)] text-body-sm">Loading…</p>
          ) : usageStats ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <UsageBar
                label="Sessions this month"
                used={usageStats.sessionsUsed}
                limit={usageStats.sessionsLimit}
              />
              <UsageBar
                label="Active participants"
                used={usageStats.activeParticipants}
                limit={usageStats.participantLimit}
              />
            </div>
          ) : (
            <p className="text-[var(--text-muted)] text-body-sm">
              No usage data available
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-body-sm text-[var(--text-muted)]">{label}</span>
      <span className="text-body-sm font-medium text-[var(--text-primary)]">
        {value}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-success/15 text-success',
    pending: 'bg-warning/15 text-warning',
    cancelled: 'bg-error/15 text-error',
    payment_failed: 'bg-error/15 text-error',
  };
  const cls = styles[status] ?? 'bg-[var(--neu-surface)] text-[var(--text-muted)]';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-caption font-medium ${cls}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
