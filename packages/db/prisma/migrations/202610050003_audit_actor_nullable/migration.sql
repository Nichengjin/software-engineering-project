-- Authentication audit is retained, but is not a course/business-history deletion veto.
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_actorAccountId_fkey";
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorAccountId_fkey"
  FOREIGN KEY ("actorAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
