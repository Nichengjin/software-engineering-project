-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'PROFESSOR', 'REGISTRAR');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'GRADUATED');

-- CreateEnum
CREATE TYPE "ProfessorStatus" AS ENUM ('ACTIVE', 'DEPARTED');

-- CreateEnum
CREATE TYPE "CloseState" AS ENUM ('OPEN', 'CLOSING', 'CLOSED');

-- CreateEnum
CREATE TYPE "OfferingStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RegistrationSource" AS ENUM ('SUBMIT', 'LEVELING', 'SUPPLEMENT');

-- CreateEnum
CREATE TYPE "RegistrationState" AS ENUM ('ENROLLED', 'COMMITTED', 'REMOVED');

-- CreateEnum
CREATE TYPE "Grade" AS ENUM ('A', 'B', 'C', 'D', 'F', 'I');

-- CreateEnum
CREATE TYPE "GradeSource" AS ENUM ('PROFESSOR', 'IMPORT');

-- CreateEnum
CREATE TYPE "NoticeKind" AS ENUM ('TIME_CONFLICT', 'PREREQUISITE', 'OFFERING_DELETED');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('PENDING', 'IN_FLIGHT', 'RETRY', 'ACKNOWLEDGED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL,
    "account" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "studentId" UUID,
    "professorId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfHash" TEXT NOT NULL,
    "accountId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" UUID NOT NULL,
    "studentNumber" TEXT NOT NULL DEFAULT ('S'::text || lpad((nextval('student_number_seq'::regclass))::text, 6, '0'::text)),
    "name" TEXT NOT NULL,
    "birthDate" DATE NOT NULL,
    "ssn" TEXT NOT NULL,
    "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "graduationDate" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Professor" (
    "id" UUID NOT NULL,
    "professorNumber" TEXT NOT NULL DEFAULT ('P'::text || lpad((nextval('professor_number_seq'::regclass))::text, 6, '0'::text)),
    "name" TEXT NOT NULL,
    "birthDate" DATE NOT NULL,
    "ssn" TEXT NOT NULL,
    "status" "ProfessorStatus" NOT NULL DEFAULT 'ACTIVE',
    "department" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Professor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonIdentity" (
    "ssn" TEXT NOT NULL,
    "studentId" UUID,
    "professorId" UUID,

    CONSTRAINT "PersonIdentity_pkey" PRIMARY KEY ("ssn")
);

-- CreateTable
CREATE TABLE "Term" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "isLaunchTerm" BOOLEAN NOT NULL DEFAULT false,
    "teachingStartsAt" TIMESTAMPTZ(3) NOT NULL,
    "initialStartsAt" TIMESTAMPTZ(3) NOT NULL,
    "initialEndsAt" TIMESTAMPTZ(3) NOT NULL,
    "addDropStartsAt" TIMESTAMPTZ(3) NOT NULL,
    "addDropEndsAt" TIMESTAMPTZ(3) NOT NULL,
    "closeState" "CloseState" NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "closedAt" TIMESTAMPTZ(3),
    "closeAttemptId" UUID,
    "lastCloseError" JSONB,
    "closeResult" JSONB,
    "closedCatalogSnapshot" JSONB,
    "pricePerCreditYuan" DECIMAL(12,2),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Term_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogSnapshot" (
    "termId" UUID NOT NULL,
    "revision" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "observedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CatalogSnapshot_pkey" PRIMARY KEY ("termId")
);

-- CreateTable
CREATE TABLE "CourseMirror" (
    "externalCourseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "credits" DECIMAL(5,2) NOT NULL,
    "prerequisiteIds" JSONB NOT NULL,
    "revision" TEXT NOT NULL,

    CONSTRAINT "CourseMirror_pkey" PRIMARY KEY ("externalCourseId")
);

-- CreateTable
CREATE TABLE "Offering" (
    "externalOfferingId" TEXT NOT NULL,
    "termId" UUID NOT NULL,
    "courseId" TEXT NOT NULL,
    "status" "OfferingStatus" NOT NULL DEFAULT 'OPEN',
    "cancelReason" TEXT,
    "professorId" UUID,
    "catalogDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Offering_pkey" PRIMARY KEY ("externalOfferingId")
);

-- CreateTable
CREATE TABLE "TeachingVersion" (
    "professorId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TeachingVersion_pkey" PRIMARY KEY ("professorId","termId")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "exists" BOOLEAN NOT NULL DEFAULT false,
    "firstSubmittedAt" TIMESTAMPTZ(3),
    "savedChoices" JSONB NOT NULL DEFAULT '{"primaryOfferingIds":[],"alternateOfferingIds":[]}',
    "submittedChoices" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Registration" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "offeringId" TEXT NOT NULL,
    "source" "RegistrationSource" NOT NULL,
    "state" "RegistrationState" NOT NULL DEFAULT 'ENROLLED',
    "removedReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeachingHistory" (
    "id" UUID NOT NULL,
    "professorId" UUID NOT NULL,
    "offeringId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),

    CONSTRAINT "TeachingHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Qualification" (
    "professorId" UUID NOT NULL,
    "courseId" TEXT NOT NULL,

    CONSTRAINT "Qualification_pkey" PRIMARY KEY ("professorId","courseId")
);

-- CreateTable
CREATE TABLE "GradeRecord" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "courseId" TEXT NOT NULL,
    "offeringId" TEXT,
    "value" "Grade",
    "source" "GradeSource" NOT NULL,
    "courseNameSnapshot" TEXT NOT NULL,
    "updatedByAccountId" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GradeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogNotice" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "offeringId" TEXT NOT NULL,
    "relatedOfferingId" TEXT,
    "kind" "NoticeKind" NOT NULL,
    "message" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "revision" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingOutbox" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "businessId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "amountYuan" DECIMAL(12,2) NOT NULL,
    "status" "BillingStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMPTZ(3),
    "lastErrorCode" TEXT,
    "acknowledgedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "requestId" TEXT NOT NULL,
    "actorAccountId" UUID,
    "processName" TEXT,
    "action" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT NOT NULL,
    "errorCode" TEXT,
    "minimalDetails" JSONB NOT NULL,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_account_key" ON "Account"("account");

-- CreateIndex
CREATE UNIQUE INDEX "Account_studentId_key" ON "Account"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_professorId_key" ON "Account"("professorId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_accountId_idx" ON "Session"("accountId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Student_studentNumber_key" ON "Student"("studentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Student_ssn_key" ON "Student"("ssn");

-- CreateIndex
CREATE UNIQUE INDEX "Professor_professorNumber_key" ON "Professor"("professorNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Professor_ssn_key" ON "Professor"("ssn");

-- CreateIndex
CREATE UNIQUE INDEX "PersonIdentity_studentId_key" ON "PersonIdentity"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonIdentity_professorId_key" ON "PersonIdentity"("professorId");

-- CreateIndex
CREATE UNIQUE INDEX "Term_ordinal_key" ON "Term"("ordinal");

-- CreateIndex
CREATE INDEX "Offering_termId_status_idx" ON "Offering"("termId", "status");

-- CreateIndex
CREATE INDEX "Offering_professorId_idx" ON "Offering"("professorId");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_studentId_termId_key" ON "Schedule"("studentId", "termId");

-- CreateIndex
CREATE INDEX "Registration_offeringId_state_idx" ON "Registration"("offeringId", "state");

-- CreateIndex
CREATE INDEX "Registration_studentId_state_idx" ON "Registration"("studentId", "state");

-- CreateIndex
CREATE INDEX "TeachingHistory_professorId_idx" ON "TeachingHistory"("professorId");

-- CreateIndex
CREATE INDEX "TeachingHistory_offeringId_idx" ON "TeachingHistory"("offeringId");

-- CreateIndex
CREATE INDEX "GradeRecord_offeringId_idx" ON "GradeRecord"("offeringId");

-- CreateIndex
CREATE UNIQUE INDEX "GradeRecord_studentId_courseId_termId_key" ON "GradeRecord"("studentId", "courseId", "termId");

-- CreateIndex
CREATE INDEX "CatalogNotice_studentId_termId_resolved_idx" ON "CatalogNotice"("studentId", "termId", "resolved");

-- CreateIndex
CREATE UNIQUE INDEX "BillingOutbox_businessId_key" ON "BillingOutbox"("businessId");

-- CreateIndex
CREATE INDEX "BillingOutbox_status_nextAttemptAt_idx" ON "BillingOutbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingOutbox_studentId_termId_version_key" ON "BillingOutbox"("studentId", "termId", "version");

-- CreateIndex
CREATE INDEX "AuditEvent_requestId_idx" ON "AuditEvent"("requestId");

-- CreateIndex
CREATE INDEX "AuditEvent_at_idx" ON "AuditEvent"("at");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonIdentity" ADD CONSTRAINT "PersonIdentity_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonIdentity" ADD CONSTRAINT "PersonIdentity_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogSnapshot" ADD CONSTRAINT "CatalogSnapshot_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offering" ADD CONSTRAINT "Offering_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offering" ADD CONSTRAINT "Offering_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingVersion" ADD CONSTRAINT "TeachingVersion_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingVersion" ADD CONSTRAINT "TeachingVersion_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("externalOfferingId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingHistory" ADD CONSTRAINT "TeachingHistory_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingHistory" ADD CONSTRAINT "TeachingHistory_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("externalOfferingId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Qualification" ADD CONSTRAINT "Qualification_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeRecord" ADD CONSTRAINT "GradeRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeRecord" ADD CONSTRAINT "GradeRecord_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeRecord" ADD CONSTRAINT "GradeRecord_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("externalOfferingId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeRecord" ADD CONSTRAINT "GradeRecord_updatedByAccountId_fkey" FOREIGN KEY ("updatedByAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogNotice" ADD CONSTRAINT "CatalogNotice_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogNotice" ADD CONSTRAINT "CatalogNotice_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogNotice" ADD CONSTRAINT "CatalogNotice_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("externalOfferingId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogNotice" ADD CONSTRAINT "CatalogNotice_relatedOfferingId_fkey" FOREIGN KEY ("relatedOfferingId") REFERENCES "Offering"("externalOfferingId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingOutbox" ADD CONSTRAINT "BillingOutbox_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingOutbox" ADD CONSTRAINT "BillingOutbox_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorAccountId_fkey" FOREIGN KEY ("actorAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

