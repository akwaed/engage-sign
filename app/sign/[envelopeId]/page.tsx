import { redirect } from 'next/navigation';
import type { RowDataPacket } from 'mysql2/promise';

import { SigningForm } from '@/components/signing-form';
import { decryptValue } from '@/lib/encryption';
import { getMysqlPool } from '@/lib/mysql';
import { getRecipientSession } from '@/lib/recipient-session';
import { CONSENT_TEXT, CONSENT_VERSION } from '@/lib/signing-actions';

export const dynamic = 'force-dynamic';

type Field = RowDataPacket & {
  field_name: string;
  label: string;
  field_type: 'text' | 'date' | 'checkbox' | 'radio' | 'initials' | 'signature';
  required: number;
};

export default async function SigningPage({
  params,
}: {
  params: Promise<{ envelopeId: string }>;
}) {
  const { envelopeId } = await params;
  const session = await getRecipientSession();
  if (!session || session.envelope_id !== envelopeId)
    redirect('/sign/unavailable');
  const [fields] = await getMysqlPool().query<Field[]>(
    `SELECT f.field_name, f.label, f.field_type, f.required
     FROM template_fields f JOIN envelopes e ON e.template_version_id = f.template_version_id
     WHERE e.id = ? AND f.signer_role = ? AND f.populated_by IN ('participant', 'signer')
     ORDER BY f.display_order`,
    [envelopeId, session.signer_role],
  );
  const name = decryptValue(
    session.name_encrypted,
    `signer:${session.signer_id}:name`,
  );
  return (
    <SigningForm
      title={session.title}
      signerName={name}
      presentedHash={session.presented_document_hash}
      fields={fields.map((field) => ({
        name: field.field_name,
        label: field.label,
        type: field.field_type,
        required: Boolean(field.required),
      }))}
      consentText={CONSENT_TEXT}
      consentVersion={CONSENT_VERSION}
    />
  );
}
