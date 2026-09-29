-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "emailDomainCheckedAt" TIMESTAMP(3),
ADD COLUMN     "emailDomainId" TEXT,
ADD COLUMN     "emailDomainRecords" JSONB,
ADD COLUMN     "emailDomainStatus" TEXT,
ADD COLUMN     "emailDomainVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "emailFromLocal" TEXT NOT NULL DEFAULT 'bids',
ADD COLUMN     "reminderHours" INTEGER[] DEFAULT ARRAY[48, 24]::INTEGER[],
ALTER COLUMN "emailMethod" SET DEFAULT 'PLATFORM';

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "acknowledgedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProductionRate" ADD COLUMN     "calibratedAt" TIMESTAMP(3),
ADD COLUMN     "calibrationNote" TEXT;

-- AlterTable
ALTER TABLE "RfqRecipient" ADD COLUMN     "declineReason" TEXT,
ADD COLUMN     "declinedAt" TIMESTAMP(3),
ADD COLUMN     "estimatorRemindedAt" TIMESTAMP(3),
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "openCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "openedAt" TIMESTAMP(3),
ADD COLUMN     "reminderHours" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "remindersSent" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "respondedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Sheet" ADD COLUMN     "thumbKey" TEXT;

-- AlterTable
ALTER TABLE "TakeoffMarkup" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "rfqId" TEXT,
    "recipientId" TEXT,
    "kind" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "fromName" TEXT,
    "toAddress" TEXT NOT NULL,
    "replyTo" TEXT,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "html" TEXT,
    "attachmentKey" TEXT,
    "attachmentName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "providerId" TEXT,
    "error" TEXT,
    "connectionId" TEXT,
    "sentById" TEXT,
    "fallbackNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailboxConnection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "dailyLimit" INTEGER NOT NULL,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailboxConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthState" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "verifier" TEXT NOT NULL,
    "returnTo" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "recipientId" TEXT,
    "type" TEXT NOT NULL,
    "detail" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RfqEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Surface" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EXISTING',
    "pointCount" INTEGER NOT NULL,
    "faceCount" INTEGER NOT NULL,
    "units" TEXT NOT NULL,
    "bbox" JSONB NOT NULL,
    "dataKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Surface_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EarthworkCalc" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "existingId" TEXT NOT NULL,
    "proposedId" TEXT NOT NULL,
    "gridFt" DOUBLE PRECISION NOT NULL,
    "areaSf" DOUBLE PRECISION NOT NULL,
    "cutCy" DOUBLE PRECISION NOT NULL,
    "fillCy" DOUBLE PRECISION NOT NULL,
    "soilTypeId" TEXT,
    "swellPct" DOUBLE PRECISION,
    "shrinkPct" DOUBLE PRECISION,
    "exportLooseCy" DOUBLE PRECISION,
    "importBankCy" DOUBLE PRECISION,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EarthworkCalc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidItemChange" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "bidItemId" TEXT,
    "itemNumber" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BidItemChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageVersion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "documentId" TEXT,
    "summary" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackageVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecRequirement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "bidItemId" TEXT,
    "specSection" TEXT,
    "material" TEXT,
    "requirement" TEXT NOT NULL,
    "documentId" TEXT,
    "pageIndex" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'AI',
    "confidence" TEXT NOT NULL DEFAULT 'HIGH',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "missingStandard" BOOLEAN NOT NULL DEFAULT false,
    "standardRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpecRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TakeoffSuggestion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pageIndex" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "points" JSONB NOT NULL,
    "evidence" TEXT,
    "confidence" TEXT NOT NULL DEFAULT 'LOW',
    "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "bidItemId" TEXT,
    "markupId" TEXT,
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TakeoffSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jobNumber" TEXT,
    "projectId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'HISTORICAL',
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HistoricalJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobCostFile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ACTUAL',
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "statusDetail" TEXT,
    "scanStatus" TEXT NOT NULL DEFAULT 'NOT_SCANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobCostFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobCostLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "fileId" TEXT,
    "pageIndex" INTEGER,
    "activity" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "estimatedCost" DOUBLE PRECISION,
    "actualCost" DOUBLE PRECISION,
    "estimatedHours" DOUBLE PRECISION,
    "actualHours" DOUBLE PRECISION,
    "equipment" TEXT,
    "materials" TEXT,
    "productionRateId" TEXT,
    "assemblyId" TEXT,
    "confidence" TEXT NOT NULL DEFAULT 'HIGH',
    "aiExtracted" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JobCostLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalibrationSuggestion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productionRateId" TEXT NOT NULL,
    "currentOutput" DOUBLE PRECISION,
    "actualOutput" DOUBLE PRECISION NOT NULL,
    "suggestedOutput" DOUBLE PRECISION NOT NULL,
    "basis" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "appliedOutput" DOUBLE PRECISION,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalibrationSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScopePackage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trade" TEXT,
    "description" TEXT,
    "lines" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScopePackage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailMessage_companyId_rfqId_idx" ON "EmailMessage"("companyId", "rfqId");

-- CreateIndex
CREATE INDEX "EmailMessage_connectionId_sentAt_idx" ON "EmailMessage"("connectionId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "MailboxConnection_companyId_userId_key" ON "MailboxConnection"("companyId", "userId");

-- CreateIndex
CREATE INDEX "RfqEvent_companyId_rfqId_idx" ON "RfqEvent"("companyId", "rfqId");

-- CreateIndex
CREATE INDEX "Notification_companyId_userId_readAt_idx" ON "Notification"("companyId", "userId", "readAt");

-- CreateIndex
CREATE INDEX "Surface_companyId_projectId_idx" ON "Surface"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "EarthworkCalc_companyId_projectId_idx" ON "EarthworkCalc"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "BidItemChange_companyId_projectId_idx" ON "BidItemChange"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "PackageVersion_companyId_projectId_idx" ON "PackageVersion"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "SpecRequirement_companyId_projectId_idx" ON "SpecRequirement"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "TakeoffSuggestion_companyId_projectId_idx" ON "TakeoffSuggestion"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "HistoricalJob_companyId_idx" ON "HistoricalJob"("companyId");

-- CreateIndex
CREATE INDEX "JobCostFile_companyId_jobId_idx" ON "JobCostFile"("companyId", "jobId");

-- CreateIndex
CREATE INDEX "JobCostLine_companyId_jobId_idx" ON "JobCostLine"("companyId", "jobId");

-- CreateIndex
CREATE INDEX "CalibrationSuggestion_companyId_idx" ON "CalibrationSuggestion"("companyId");

-- CreateIndex
CREATE INDEX "ScopePackage_companyId_projectId_idx" ON "ScopePackage"("companyId", "projectId");


-- Product renamed: the platform sending method is now called PLATFORM.
UPDATE "Company" SET "emailMethod" = 'PLATFORM' WHERE "emailMethod" = 'TRUEGRADE';
UPDATE "RfqRecipient" SET "method" = 'PLATFORM' WHERE "method" = 'TRUEGRADE';
