'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useOrganizationStore } from '@/store/organization-store';
import { updateOrg } from '@/lib/org-client';

// ============================================================================
// Settings Page
// ============================================================================

export default function SettingsPage() {
  const { currentOrganization, fetchOrganizations } = useOrganizationStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const orgId = currentOrganization?.organizationId;
  const isOwner = currentOrganization?.role === 'owner';

  useEffect(() => {
    if (!currentOrganization) return;
    setName(currentOrganization.name);
    setDescription(currentOrganization.description ?? '');
    setLogoUrl(currentOrganization.logoUrl ?? '');
  }, [currentOrganization]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    setMessage(null);
    try {
      await updateOrg(orgId, {
        name: name.trim(),
        description: description.trim() || undefined,
        logoUrl: logoUrl.trim() || undefined,
      });
      await fetchOrganizations();
      setMessage({ type: 'success', text: 'Settings saved' });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err?.response?.data?.message || err?.message || 'Failed to save settings',
      });
    } finally {
      setSaving(false);
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
        Settings
      </h1>

      <div className="card max-w-xl">
        <h2 className="text-h3 font-semibold text-[var(--text-primary)] mb-6">
          Organization Settings
        </h2>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label
              htmlFor="org-name"
              className="block text-body-sm font-medium text-[var(--text-secondary)]"
            >
              Organization Name
            </label>
            <input
              id="org-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={100}
              disabled={!isOwner}
              className="input-base"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="org-description"
              className="block text-body-sm font-medium text-[var(--text-secondary)]"
            >
              Description
            </label>
            <textarea
              id="org-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={!isOwner}
              placeholder="A short description of your organization"
              className="input-base resize-none"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="org-logo"
              className="block text-body-sm font-medium text-[var(--text-secondary)]"
            >
              Logo URL
            </label>
            <input
              id="org-logo"
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              disabled={!isOwner}
              placeholder="https://example.com/logo.png"
              className="input-base"
            />
          </div>

          {isOwner && (
            <button
              type="submit"
              disabled={saving}
              className="btn-base px-6 py-3 neu-raised-sm text-white bg-primary rounded-md hover:bg-primary-light disabled:opacity-50 w-full sm:w-auto"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          )}

          {!isOwner && (
            <p className="text-body-sm text-[var(--text-muted)]">
              Only organization owners can edit settings.
            </p>
          )}

          {message && (
            <p
              className={`text-body-sm font-medium ${
                message.type === 'success' ? 'text-success' : 'text-error'
              }`}
            >
              {message.text}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
