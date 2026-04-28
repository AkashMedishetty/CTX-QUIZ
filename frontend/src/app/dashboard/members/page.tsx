'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useOrganizationStore } from '@/store/organization-store';
import {
  getMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
  type OrganizationMember,
} from '@/lib/org-client';

// ============================================================================
// Members Page
// ============================================================================

export default function MembersPage() {
  const { currentOrganization } = useOrganizationStore();
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'owner' | 'member'>('member');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  const orgId = currentOrganization?.organizationId;
  const isOwner = currentOrganization?.role === 'owner';

  const loadMembers = async () => {
    if (!orgId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getMembers(orgId);
      setMembers(data);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load members');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!orgId || !inviteEmail.trim()) return;
    setInviteLoading(true);
    setInviteMsg(null);
    try {
      const res = await inviteMember(orgId, inviteEmail.trim(), inviteRole);
      setInviteMsg(res.message || 'Invitation sent');
      setInviteEmail('');
      setInviteRole('member');
    } catch (err: any) {
      setInviteMsg(err?.response?.data?.message || err?.message || 'Failed to send invite');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: 'owner' | 'member') => {
    if (!orgId) return;
    try {
      await updateMemberRole(orgId, userId, newRole);
      await loadMembers();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to update role');
    }
  };

  const handleRemove = async (userId: string) => {
    if (!orgId) return;
    if (!window.confirm('Remove this member from the organization?')) return;
    try {
      await removeMember(orgId, userId);
      await loadMembers();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to remove member');
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
        Members
      </h1>

      {/* Invite Form (owner only) */}
      {isOwner && (
        <div className="card">
          <h2 className="text-h3 font-semibold text-[var(--text-primary)] mb-4">
            Invite Member
          </h2>
          <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              placeholder="Email address"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              className="input-base flex-1"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'owner' | 'member')}
              className="input-base sm:w-36"
            >
              <option value="member">Member</option>
              <option value="owner">Owner</option>
            </select>
            <button
              type="submit"
              disabled={inviteLoading}
              className="btn-base px-6 py-3 neu-raised-sm text-white bg-primary rounded-md hover:bg-primary-light disabled:opacity-50"
            >
              {inviteLoading ? 'Sending…' : 'Invite'}
            </button>
          </form>
          {inviteMsg && (
            <p className="mt-3 text-body-sm text-[var(--text-secondary)]">
              {inviteMsg}
            </p>
          )}
        </div>
      )}

      {/* Members Table */}
      <div className="card overflow-x-auto">
        {error && (
          <p className="text-body-sm text-error mb-4">{error}</p>
        )}
        {isLoading ? (
          <p className="text-[var(--text-muted)] text-body-sm">Loading members…</p>
        ) : members.length === 0 ? (
          <p className="text-[var(--text-muted)] text-body-sm">No members found</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="pb-3 text-caption font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  Name
                </th>
                <th className="pb-3 text-caption font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  Email
                </th>
                <th className="pb-3 text-caption font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  Role
                </th>
                <th className="pb-3 text-caption font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  Joined
                </th>
                {isOwner && (
                  <th className="pb-3 text-caption font-semibold text-[var(--text-muted)] uppercase tracking-wider text-right">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr
                  key={m.userId}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td className="py-3 text-body-sm text-[var(--text-primary)]">
                    {m.name || '—'}
                  </td>
                  <td className="py-3 text-body-sm text-[var(--text-secondary)]">
                    {m.email || '—'}
                  </td>
                  <td className="py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-caption font-medium ${
                        m.role === 'owner'
                          ? 'bg-primary/15 text-primary'
                          : 'bg-[var(--neu-surface)] text-[var(--text-secondary)]'
                      }`}
                    >
                      {m.role}
                    </span>
                  </td>
                  <td className="py-3 text-body-sm text-[var(--text-muted)]">
                    {new Date(m.joinedAt).toLocaleDateString('en-IN', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  {isOwner && (
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <select
                          value={m.role}
                          onChange={(e) =>
                            handleRoleChange(m.userId, e.target.value as 'owner' | 'member')
                          }
                          className="text-caption px-2 py-1 rounded-md neu-pressed-sm"
                        >
                          <option value="member">Member</option>
                          <option value="owner">Owner</option>
                        </select>
                        <button
                          onClick={() => handleRemove(m.userId)}
                          className="text-caption text-error hover:text-error-dark px-2 py-1 rounded-md hover:bg-error/10 transition-colors duration-fast"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
