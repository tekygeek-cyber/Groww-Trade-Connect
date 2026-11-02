import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface AuditRecord {
  sequence: number; at: string; eventType: string; requestId: string;
  mode: 'PAPER' | 'LIVE'; simulationOnly: true;
  decision: string; reasonCodes: string[]; auditId: string;
  ruleEngineVersion: string; fixtureId: string; previousHash: string; hash: string;
}
const auditFile = () => path.join(process.cwd(),'server','data','trading-rehearsals.jsonl');
function hashBody(body: Omit<AuditRecord,'hash'>): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}
/** Single-process, append-only, fsynced local rehearsal log. Not a tamper-proof production audit store. */
export function appendRehearsalAudit(
  input: Pick<AuditRecord,'requestId'|'mode'|'decision'|'reasonCodes'|'auditId'|'ruleEngineVersion'|'fixtureId'>
): AuditRecord {
  const file = auditFile();
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const previous = readRehearsalAudits(1).at(-1);
  const body: Omit<AuditRecord,'hash'> = {
    sequence:(previous?.sequence||0)+1,at:new Date().toISOString(),
    eventType:'RISK_REHEARSAL',requestId:input.requestId,mode:input.mode,
    simulationOnly:true,decision:input.decision,reasonCodes:[...input.reasonCodes],
    auditId:input.auditId,ruleEngineVersion:input.ruleEngineVersion,
    fixtureId:input.fixtureId,previousHash:previous?.hash||'GENESIS',
  };
  const record:AuditRecord={...body,hash:hashBody(body)};
  const fd=fs.openSync(file,'a',0o600);
  try { fs.writeSync(fd,JSON.stringify(record)+'\n');fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  return record;
}
export function readRehearsalAudits(limit=30): AuditRecord[] {
  if (!Number.isInteger(limit)||limit<1||limit>100) throw new RangeError('Invalid audit limit');
  const file=auditFile();
  if (!fs.existsSync(file)) return [];
  const lines=fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean);
  // Cap persistence reads to avoid unbounded operational memory.
  if (lines.length>100_000) throw new Error('Rehearsal audit exceeds local capacity; migrate to database');
  const records:AuditRecord[]=[];
  let prev='GENESIS',seq=1;
  for(const line of lines) {
    const item=JSON.parse(line) as AuditRecord;
    if(!item || item.previousHash!==prev || item.sequence!==seq) throw new Error('Audit history chain broken');
    const {hash,...body}=item;
    if(hashBody(body)!==hash) throw new Error('Audit history integrity failed');
    prev=hash;seq++;records.push(item);
  }
  return records.slice(-limit);
}
