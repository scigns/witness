'use client';

/**
 * Program resources — presentations, briefing papers, and links a
 * facilitator makes available (Client-Ready Experience overhaul, Phase 12).
 * Every participant can browse and open these; only facilitators and admins
 * can add or remove one.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useRef, useState } from 'react';

import type { ResourceView, WorkspaceSummary } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useAuth } from '@/lib/auth';
import { Button, Card, EmptyState, ErrorNotice } from '@/components/ui';

const CAN_MANAGE_ROLES = new Set(['admin', 'facilitator']);

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatSize(bytes: number | null): string | null {
  if (bytes === null) return null;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ResourcesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready } = useSession();
  const { currentUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [resources, setResources] = useState<ResourceView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [linkTitle, setLinkTitle] = useState('');
  const [linkDescription, setLinkDescription] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const [fileTitle, setFileTitle] = useState('');
  const [fileDescription, setFileDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const [workspaceResult, resourcesResult] = await Promise.all([
          api.getWorkspace(id, user),
          api.listResources(id, user),
        ]);
        if (cancelledRef.current) return;
        setWorkspace(workspaceResult);
        setResources(resourcesResult.resources);
        setError(null);
      } catch (caught) {
        if (cancelledRef.current) return;
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    },
    [id, user],
  );

  useEffect(() => {
    if (!ready) return;
    const cancelledRef = { current: false };
    void load(cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, [ready, load]);

  const role = currentUser?.workspaces.find((w) => w.id === id)?.role ?? null;
  const canManage = role !== null && CAN_MANAGE_ROLES.has(role);

  const addLink = async () => {
    if (linkTitle.trim() === '' || linkUrl.trim() === '') return;
    setBusy(true);
    try {
      await api.createLinkResource(
        id,
        {
          title: linkTitle.trim(),
          description: linkDescription.trim() === '' ? null : linkDescription.trim(),
          externalUrl: linkUrl.trim(),
          sessionId: null,
          agendaItemId: null,
        },
        user,
      );
      setLinkTitle('');
      setLinkDescription('');
      setLinkUrl('');
      await load({ current: false });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const uploadFile = async () => {
    if (fileTitle.trim() === '' || selectedFile === null) return;
    setBusy(true);
    try {
      await api.createFileResource(
        id,
        {
          title: fileTitle.trim(),
          description: fileDescription.trim() === '' ? null : fileDescription.trim(),
          sessionId: null,
          agendaItemId: null,
        },
        selectedFile,
        user,
      );
      setFileTitle('');
      setFileDescription('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await load({ current: false });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (resourceId: string) => {
    setBusy(true);
    try {
      await api.removeResource(id, resourceId, user);
      await load({ current: false });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const download = async (resource: ResourceView) => {
    try {
      const blob = await api.getResourceBlob(id, resource.id, user);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = resource.originalFilename ?? resource.title;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    }
  };

  if (loading) {
    return <p className="text-[var(--color-ink-muted)]">Loading…</p>;
  }

  if (workspace === null) {
    return (
      <div className="space-y-4">
        <ErrorNotice message={error ?? `No program with id '${id}'.`} />
        <Link href="/workspaces" className="text-sm underline">
          ← Back to programs
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href={`/workspaces/${id}`} className="inline-block text-sm underline">
        ← Back to {workspace.name}
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Resources</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Presentations, briefing papers, and links shared for {workspace.name}.
        </p>
      </div>

      {canManage && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="space-y-3">
            <h2 className="font-semibold">Add a link</h2>
            <label htmlFor="link-title" className="sr-only">
              Link title
            </label>
            <input
              id="link-title"
              value={linkTitle}
              onChange={(event) => setLinkTitle(event.target.value)}
              placeholder="Title"
              maxLength={300}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
            <label htmlFor="link-url" className="sr-only">
              Link URL
            </label>
            <input
              id="link-url"
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              placeholder="https://…"
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
            <label htmlFor="link-description" className="sr-only">
              Link description
            </label>
            <textarea
              id="link-description"
              value={linkDescription}
              onChange={(event) => setLinkDescription(event.target.value)}
              placeholder="Description (optional)"
              rows={2}
              maxLength={2000}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
            <Button
              variant="primary"
              disabled={busy || linkTitle.trim() === '' || linkUrl.trim() === ''}
              onClick={() => void addLink()}
            >
              Add link
            </Button>
          </Card>

          <Card className="space-y-3">
            <h2 className="font-semibold">Upload a file</h2>
            <label htmlFor="file-title" className="sr-only">
              File title
            </label>
            <input
              id="file-title"
              value={fileTitle}
              onChange={(event) => setFileTitle(event.target.value)}
              placeholder="Title"
              maxLength={300}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
            <label htmlFor="file-input" className="sr-only">
              File to upload
            </label>
            <input
              id="file-input"
              ref={fileInputRef}
              type="file"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
              className="w-full text-sm"
            />
            <label htmlFor="file-description" className="sr-only">
              File description
            </label>
            <textarea
              id="file-description"
              value={fileDescription}
              onChange={(event) => setFileDescription(event.target.value)}
              placeholder="Description (optional)"
              rows={2}
              maxLength={2000}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
            <Button
              variant="primary"
              disabled={busy || fileTitle.trim() === '' || selectedFile === null}
              onClick={() => void uploadFile()}
            >
              Upload
            </Button>
          </Card>
        </div>
      )}

      {resources.length === 0 ? (
        <EmptyState
          title="No resources yet"
          body={
            canManage
              ? 'Add a presentation, briefing paper, or link for participants.'
              : 'Facilitators haven’t shared anything here yet.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {resources.map((resource) => (
            <li key={resource.id}>
              <Card className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{resource.title}</p>
                  <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">
                    {resource.uploadedByName} · {formatDate(resource.createdAt)}
                    {resource.sizeBytes !== null ? ` · ${formatSize(resource.sizeBytes)}` : ''}
                  </p>
                  {resource.description !== null && (
                    <p className="mt-2 text-sm">{resource.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {resource.resourceType === 'link' ? (
                    <a
                      href={resource.externalUrl ?? '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-accent-soft)]"
                    >
                      Open →
                    </a>
                  ) : (
                    <Button variant="secondary" onClick={() => void download(resource)}>
                      Download
                    </Button>
                  )}
                  {canManage && (
                    <Button
                      variant="danger"
                      disabled={busy}
                      onClick={() => void remove(resource.id)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
