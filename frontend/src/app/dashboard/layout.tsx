'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AuthGuard } from '@/components/AuthGuard';
import { useOrganizationStore } from '@/store/organization-store';

// ============================================================================
// Navigation items
// ============================================================================

const NAV_ITEMS = [
  {
    label: 'Overview',
    href: '/dashboard',
    icon: OverviewIcon,
  },
  {
    label: 'Members',
    href: '/dashboard/members',
    icon: MembersIcon,
  },
  {
    label: 'Settings',
    href: '/dashboard/settings',
    icon: SettingsIcon,
  },
  {
    label: 'Billing',
    href: '/dashboard/billing',
    icon: BillingIcon,
  },
] as const;

// ============================================================================
// Dashboard Layout
// ============================================================================

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard requireAuth>
      <DashboardShell>{children}</DashboardShell>
    </AuthGuard>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {
    currentOrganization,
    organizations,
    fetchOrganizations,
    switchOrg,
    isLoading,
  } = useOrganizationStore();
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-[var(--neu-bg)]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[var(--neu-bg)] border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto flex items-center justify-between h-16 px-4 lg:px-8">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center shadow-neu-raised-sm">
              <span className="text-white font-display font-bold text-body">C</span>
            </div>
            <span className="font-display font-semibold text-body-lg text-[var(--text-primary)] hidden sm:inline">
              CTX Quiz
            </span>
          </Link>

          {/* Org Switcher */}
          <div className="relative">
            <button
              onClick={() => setOrgDropdownOpen(!orgDropdownOpen)}
              className="flex items-center gap-2 px-3 py-2 rounded-md neu-raised-sm transition-all duration-fast hover:shadow-neu-raised text-body-sm touch-target"
              aria-haspopup="listbox"
              aria-expanded={orgDropdownOpen}
              aria-label="Switch organization"
            >
              {isLoading ? (
                <span className="text-[var(--text-muted)]">Loading…</span>
              ) : currentOrganization ? (
                <>
                  <span className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-white text-caption font-semibold">
                    {currentOrganization.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-[var(--text-primary)] max-w-[120px] truncate hidden sm:inline">
                    {currentOrganization.name}
                  </span>
                  <ChevronDownIcon />
                </>
              ) : (
                <span className="text-[var(--text-muted)]">No org</span>
              )}
            </button>

            {orgDropdownOpen && organizations.length > 0 && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setOrgDropdownOpen(false)}
                  aria-hidden="true"
                />
                {/* Dropdown */}
                <div
                  className="absolute right-0 mt-2 w-64 z-50 neu-raised rounded-md py-1 animate-fade-in"
                  role="listbox"
                  aria-label="Organizations"
                >
                  {organizations.map((org) => (
                    <button
                      key={org.organizationId}
                      role="option"
                      aria-selected={
                        org.organizationId ===
                        currentOrganization?.organizationId
                      }
                      onClick={() => {
                        switchOrg(org.organizationId);
                        setOrgDropdownOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors duration-fast hover:bg-[var(--neu-surface)] ${
                        org.organizationId ===
                        currentOrganization?.organizationId
                          ? 'bg-[var(--neu-surface)]'
                          : ''
                      }`}
                    >
                      <span className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-caption font-semibold shrink-0">
                        {org.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="text-body-sm font-medium text-[var(--text-primary)] truncate">
                          {org.name}
                        </p>
                        <p className="text-caption text-[var(--text-muted)] capitalize">
                          {org.currentTier} · {org.role}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto flex">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex flex-col w-56 shrink-0 py-6 pl-4 lg:pl-8 pr-2 sticky top-16 h-[calc(100vh-4rem)]">
          <nav className="flex flex-col gap-1" aria-label="Dashboard navigation">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-md text-body-sm font-medium transition-all duration-fast ${
                    active
                      ? 'neu-pressed text-primary'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--neu-surface)]'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  <item.icon active={active} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 px-4 lg:px-8 py-6 pb-24 md:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[var(--neu-bg)] border-t border-[var(--border)] safe-area-inset-bottom"
        aria-label="Dashboard navigation"
      >
        <div className="flex items-center justify-around h-16">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-md transition-colors duration-fast touch-target ${
                  active
                    ? 'text-primary'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <item.icon active={active} />
                <span className="text-caption">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

// ============================================================================
// Icons (inline SVG for zero-dependency)
// ============================================================================

function OverviewIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x="2"
        y="2"
        width="7"
        height="7"
        rx="2"
        stroke="currentColor"
        strokeWidth={active ? '2' : '1.5'}
      />
      <rect
        x="11"
        y="2"
        width="7"
        height="7"
        rx="2"
        stroke="currentColor"
        strokeWidth={active ? '2' : '1.5'}
      />
      <rect
        x="2"
        y="11"
        width="7"
        height="7"
        rx="2"
        stroke="currentColor"
        strokeWidth={active ? '2' : '1.5'}
      />
      <rect
        x="11"
        y="11"
        width="7"
        height="7"
        rx="2"
        stroke="currentColor"
        strokeWidth={active ? '2' : '1.5'}
      />
    </svg>
  );
}

function MembersIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="6"
        r="3"
        stroke="currentColor"
        strokeWidth={active ? '2' : '1.5'}
      />
      <path
        d="M2 17c0-3.314 2.686-6 6-6s6 2.686 6 6"
        stroke="currentColor"
        strokeWidth={active ? '2' : '1.5'}
        strokeLinecap="round"
      />
      <circle
        cx="15"
        cy="7"
        r="2"
        stroke="currentColor"
        strokeWidth={active ? '2' : '1.5'}
      />
      <path
        d="M16 13c1.657 0 3 1.343 3 3"
        stroke="currentColor"
        strokeWidth={active ? '2' : '1.5'}
        strokeLinecap="round"
      />
    </svg>
  );
}

function SettingsIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle
        cx="10"
        cy="10"
        r="3"
        stroke="currentColor"
        strokeWidth={active ? '2' : '1.5'}
      />
      <path
        d="M10 1v2M10 17v2M1 10h2M17 10h2M3.5 3.5l1.4 1.4M15.1 15.1l1.4 1.4M3.5 16.5l1.4-1.4M15.1 4.9l1.4-1.4"
        stroke="currentColor"
        strokeWidth={active ? '2' : '1.5'}
        strokeLinecap="round"
      />
    </svg>
  );
}

function BillingIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x="2"
        y="4"
        width="16"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth={active ? '2' : '1.5'}
      />
      <line
        x1="2"
        y1="8"
        x2="18"
        y2="8"
        stroke="currentColor"
        strokeWidth={active ? '2' : '1.5'}
      />
      <line
        x1="5"
        y1="12"
        x2="9"
        y2="12"
        stroke="currentColor"
        strokeWidth={active ? '2' : '1.5'}
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="text-[var(--text-muted)]"
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
