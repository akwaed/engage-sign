'use client';

import { useEffect } from 'react';

import { downloadLegalArchive } from '@/lib/client-legal-export';

export function LegalExportWebMcp() {
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    void Promise.resolve(
      context.registerTool(
        {
          name: 'create_legal_archive_export',
          title: 'Create legal archive export',
          description:
            'Download a complete Engage Sign legal archive containing documents, signer records, audit events, a manifest, and SHA-256 checksums.',
          inputSchema: {
            type: 'object',
            properties: {
              acknowledgedSensitiveData: {
                type: 'boolean',
                const: true,
                description:
                  'Must be true to acknowledge that the archive may contain sensitive personal data.',
              },
            },
            required: ['acknowledgedSensitiveData'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          async execute(input: unknown) {
            if (
              typeof input !== 'object' ||
              input === null ||
              !('acknowledgedSensitiveData' in input) ||
              input.acknowledgedSensitiveData !== true
            ) {
              throw new Error(
                'Sensitive-data acknowledgment is required before creating an archive.',
              );
            }
            return downloadLegalArchive();
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    return () => lifecycle.abort();
  }, []);

  return null;
}
