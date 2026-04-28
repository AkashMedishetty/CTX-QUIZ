'use client';

import { useEffect, useState } from 'react';
import { useOrganizationStore } from '@/store/organization-store';
import { useSubscriptionStore } from '@/store/subscription-store';
import {
  getTiers,
  upgradeSubscription,
  downgradeSubscription,
  cancelSubscription,
  createSubscription,
  downloadInvoice,
  type PricingTier,
  type Invoice,
} from '@/lib/billing-client';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// ============================================================================
// Billing Page
// ============================================================================

export default function BillingPage() {
  const { currentOrganization } = useOrganizationStore();
  const {
    currentTier,
    invoices,
    fetchCurrentTier,
    fetchInvoices,
    isLoading,
  } = useSubscriptionStore();

  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isOwner = currentOrganization?.role === 'owner';
  const activeTierName = currentTier?.tierName ?? currentOrganization?.currentTier ?? 'free';

  useEffect(() => {
    fetchCurrentTier();
    fetchInvoices();
    getTiers()
      .then(setTiers)
      .catch(() => {});
  }, [fetchCurrentTier, fetchInvoices]);

  const handleUpgrade = async (tier: PricingTier) => {
    if (!tier.razorpayPlanId) return;
    setActionLoading(true);
    setActionMsg(null);
    try {
      if (activeTierName === 'free') {
        // Create new subscription — redirect to Razorpay
        const result = await createSubscription(tier.razorpayPlanId);
        if (result.shortUrl) {
          window.location.href = result.shortUrl;
          return;
        }
      } else {
        await upgradeSubscription(tier.razorpayPlanId);
      }
      setActionMsg({ type: 'success', text: `Upgraded to ${tier.displayName}` });
      await fetchCurrentTier();
    } catch (err: any) {
      setActionMsg({
        type: 'error',
        text: err?.response?.data?.message || err?.message || 'Upgrade failed',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDowngrade = async (tierName: string) => {
    setActionLoading(true);
    setActionMsg(null);
    try {
      await downgradeSubscription(tierName);
      setActionMsg({ type: 'success', text: 'Downgrade scheduled for end of billing period' });
      await fetchCurrentTier();
    } catch (err: any) {
      setActionMsg({
        type: 'error',
        text: err?.response?.data?.message || err?.message || 'Downgrade failed',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Cancel your subscription? You will be downgraded to Free at the end of the billing period.')) return;
    setActionLoading(true);
    setActionMsg(null);
    try {
      await cancelSubscription();
      setActionMsg({ type: 'success', text: 'Subscription cancelled. Active until end of billing period.' });
      await fetchCurrentTier();
    } catch (err: any) {
      setActionMsg({
        type: 'error',
        text: err?.response?.data?.message || err?.message || 'Cancellation failed',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadInvoice = async (invoiceId: string) => {
    try {
      const { downloadUrl } = await downloadInvoice(invoiceId);
      window.open(downloadUrl, '_blank');
    } catch {
      setActionMsg({ type: 'error', text: 'Failed to download invoice' });
    }
  };

  if (!currentOrganization) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-[var(--text-muted)]">No organization selected</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-h2 font-semibold text-[var(--text-primary)]">
        Billing
      </h1>

      {actionMsg && (
        <div
          className={`p-3 rounded-md text-body-sm font-medium ${
            actionMsg.type === 'success'
              ? 'bg-success/10 text-success border border-success/30'
              : 'bg-error/10 text-error border border-error/30'
          }`}
        >
          {actionMsg.text}
        </div>
      )}

      {/* Current Plan & Next Billing */}
      <div className="card">
        <h2 className="text-h3 font-semibold text-[var(--text-primary)] mb-4">
          Current Plan
        </h2>
        {isLoading && !currentTier ? (
          <p className="text-[var(--text-muted)] text-body-sm">Loading…</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-body-lg font-semibold text-primary capitalize">
                {activeTierName}
              </span>
              {currentTier?.status && (
                <StatusBadge status={currentTier.status} />
              )}
            </div>
            {currentTier?.currentPeriodEnd && (
              <p className="text-body-sm text-[var(--text-secondary)]">
                Next billing date:{' '}
                <span className="font-medium">
                  {new Date(currentTier.currentPeriodEnd).toLocaleDateString('en-IN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              </p>
            )}
            {currentTier?.pendingDowngradeTier && (
              <div className="p-3 rounded-md bg-warning/10 border border-warning/30">
                <p className="text-body-sm text-warning font-medium">
                  Pending downgrade to{' '}
                  <span className="capitalize">{currentTier.pendingDowngradeTier}</span>{' '}
                  at end of billing period
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Plan Selection */}
      {isOwner && tiers.length > 0 && (
        <div className="card">
          <h2 className="text-h3 font-semibold text-[var(--text-primary)] mb-4">
            Manage Plan
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {tiers.map((tier) => {
              const isCurrent = tier.name === activeTierName;
              const isUpgrade =
                tierOrder(tier.name) > tierOrder(activeTierName);
              const isDowngrade =
                tierOrder(tier.name) < tierOrder(activeTierName);

              return (
                <div
                  key={tier.name}
                  className={`rounded-lg p-5 space-y-3 transition-all duration-fast ${
                    isCurrent ? 'neu-pressed' : 'neu-raised-sm'
                  }`}
                >
                  <h3 className="text-body-lg font-semibold text-[var(--text-primary)]">
                    {tier.displayName}
                  </h3>
                  <p className="text-h3 font-bold text-primary">
                    {tier.monthlyPriceINR === 0
                      ? 'Free'
                      : `₹${(tier.monthlyPriceINR / 100).toLocaleString('en-IN')}/mo`}
                  </p>
                  <ul className="space-y-1 text-body-sm text-[var(--text-secondary)]">
                    {tier.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-success mt-0.5">✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <div className="pt-2">
                      <span className="text-body-sm font-medium text-primary">
                        Current plan
                      </span>
                      {activeTierName !== 'free' && (
                        <button
                          onClick={handleCancel}
                          disabled={actionLoading}
                          className="block mt-2 text-caption text-error hover:underline"
                        >
                          Cancel subscription
                        </button>
                      )}
                    </div>
                  ) : isUpgrade ? (
                    <button
                      onClick={() => handleUpgrade(tier)}
                      disabled={actionLoading}
                      className="btn-base w-full px-4 py-2 neu-raised-sm text-white bg-primary rounded-md hover:bg-primary-light disabled:opacity-50"
                    >
                      Upgrade
                    </button>
                  ) : isDowngrade ? (
                    <button
                      onClick={() => handleDowngrade(tier.name)}
                      disabled={actionLoading}
                      className="btn-base w-full px-4 py-2 neu-raised-sm text-[var(--text-secondary)] rounded-md hover:bg-[var(--neu-surface)] disabled:opacity-50"
                    >
                      Downgrade
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Usage History Chart */}
      <UsageHistoryChart invoices={invoices} />

      {/* Invoice History */}
      <div className="card overflow-x-auto">
        <h2 className="text-h3 font-semibold text-[var(--text-primary)] mb-4">
          Invoice History
        </h2>
        {isLoading && invoices.length === 0 ? (
          <p className="text-[var(--text-muted)] text-body-sm">Loading…</p>
        ) : invoices.length === 0 ? (
          <p className="text-[var(--text-muted)] text-body-sm">No invoices yet</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="pb-3 text-caption font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  Date
                </th>
                <th className="pb-3 text-caption font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  Amount
                </th>
                <th className="pb-3 text-caption font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  Plan
                </th>
                <th className="pb-3 text-caption font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  Status
                </th>
                <th className="pb-3 text-caption font-semibold text-[var(--text-muted)] uppercase tracking-wider text-right">
                  Download
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr
                  key={inv.invoiceId}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td className="py-3 text-body-sm text-[var(--text-primary)]">
                    {new Date(inv.createdAt).toLocaleDateString('en-IN', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="py-3 text-body-sm text-[var(--text-primary)] font-medium">
                    ₹{(inv.amount / 100).toLocaleString('en-IN')}
                  </td>
                  <td className="py-3 text-body-sm text-[var(--text-secondary)] capitalize">
                    {inv.planName}
                  </td>
                  <td className="py-3">
                    <InvoiceStatusBadge status={inv.status} />
                  </td>
                  <td className="py-3 text-right">
                    <button
                      onClick={() => handleDownloadInvoice(inv.invoiceId)}
                      className="text-caption text-primary hover:underline"
                    >
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Usage History Chart (sessions per day, last 30 days)
// ============================================================================

function UsageHistoryChart({ invoices }: { invoices: Invoice[] }) {
  // Build a simple 30-day chart from invoice data
  // In a real app this would come from a dedicated usage-history API
  const labels: string[] = [];
  const dataPoints: number[] = [];
  const now = new Date();

  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    labels.push(
      d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
    );
    // Simulate session counts from invoice dates (placeholder)
    const dayStr = d.toISOString().slice(0, 10);
    const count = invoices.filter(
      (inv) => inv.createdAt.slice(0, 10) === dayStr,
    ).length;
    dataPoints.push(count);
  }

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Sessions',
        data: dataPoints,
        backgroundColor: '#275249',
        borderRadius: 4,
        maxBarThickness: 24,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: false },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          maxRotation: 45,
          font: { size: 11 },
          color: '#9ca3af',
        },
      },
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
          font: { size: 11 },
          color: '#9ca3af',
        },
        grid: {
          color: 'rgba(0,0,0,0.05)',
        },
      },
    },
  } as const;

  return (
    <div className="card">
      <h2 className="text-h3 font-semibold text-[var(--text-primary)] mb-4">
        Usage History (Last 30 Days)
      </h2>
      <div className="h-64">
        <Bar data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

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

function InvoiceStatusBadge({ status }: { status: 'paid' | 'failed' }) {
  const cls =
    status === 'paid'
      ? 'bg-success/15 text-success'
      : 'bg-error/15 text-error';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-caption font-medium ${cls}`}>
      {status}
    </span>
  );
}

function tierOrder(name: string): number {
  const order: Record<string, number> = { free: 0, pro: 1, enterprise: 2 };
  return order[name] ?? 0;
}
