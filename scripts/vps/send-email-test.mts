import type { RowDataPacket } from 'mysql2/promise';
import { getMysqlPool } from '../../lib/mysql';
import { decryptValue } from '../../lib/encryption';
import { sendDraft } from '../../lib/envelopes';
import { dispatchInvitations, verifyMailConnection } from '../../lib/signing-mail';
import { appendAuditEvent } from '../../lib/audit';
import { safeErrorCode } from '../../lib/mail-security';

const id='d7232096-bdf4-480e-a629-2ae893c5b7f6';
const pool=getMysqlPool();
try {
  const [rows]=await pool.query<Array<RowDataPacket & {status:string;created_by:string}>>(
    'SELECT status,created_by FROM envelopes WHERE id=?',[id],
  );
  const envelope=rows[0];
  if (!envelope || !['draft','sent','viewed','partially_signed'].includes(envelope.status))
    throw new Error('Test document is not available for sending');
  const [signers]=await pool.query<Array<RowDataPacket & {id:string;email_encrypted:string}>>(
    'SELECT id,email_encrypted FROM signers WHERE envelope_id=?',[id],
  );
  if (signers.length!==2 || signers.some(signer=>
    decryptValue(signer.email_encrypted,'signer:'+signer.id+':email')!=='akwaed@gmail.com'))
    throw new Error('Test recipients do not match the approved address');
  const [otherPending]=await pool.query<Array<RowDataPacket & {total:number}>>(
    "SELECT COUNT(*) AS total FROM notification_outbox o JOIN signers s ON s.id=o.signer_id WHERE o.status='pending' AND s.envelope_id<>?",[id],
  );
  if (Number(otherPending[0]?.total)>0)
    throw new Error('Other unsent notifications exist; refusing a broad dispatch');
  await verifyMailConnection();
  if (envelope.status==='draft') {
    const result=await sendDraft(id,envelope.created_by);
    await appendAuditEvent({actorType:'system',envelopeId:id,eventType:'DOCUMENT_SENT',
      details:{purpose:'synthetic SMTP invitation test',preparedHash:result.hash}});
  }
  const results=await dispatchInvitations();
  console.log(JSON.stringify({
    documentId:id,
    sent:results.filter(result=>result.sent).length,
    failed:results.filter(result=>!result.sent).length,
  }));
  if (results.some(result=>!result.sent)) process.exitCode=1;
} catch (error) {
  console.error('Synthetic email test stopped:',safeErrorCode(error));
  process.exitCode=1;
} finally {
  await pool.end();
}
