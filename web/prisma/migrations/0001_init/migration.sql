-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'ESTIMATOR');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "rfqPrefix" TEXT NOT NULL DEFAULT 'CO',
    "logoPath" TEXT,
    "accentColor" TEXT NOT NULL DEFAULT '#FF6B00',
    "defaultMarkupPct" DOUBLE PRECISION,
    "overheadPct" DOUBLE PRECISION,
    "salesTaxPct" DOUBLE PRECISION,
    "projectTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bondingApproach" TEXT,
    "bondingPct" DOUBLE PRECISION,
    "rfqSubject" TEXT,
    "rfqBody" TEXT,
    "rfqSignature" TEXT,
    "quoteExpiryDays" INTEGER NOT NULL DEFAULT 30,
    "takeoffVariancePct" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "emailMethod" TEXT NOT NULL DEFAULT 'TRUEGRADE',
    "customEmailDomain" TEXT,
    "aiMonthlyLimitUsd" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "setupProgress" JSONB NOT NULL DEFAULT '{}',
    "jobCounter" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ESTIMATOR',
    "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborRole" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseWage" DOUBLE PRECISION,
    "burdenPct" DOUBLE PRECISION,
    "prevailingWage" DOUBLE PRECISION,
    "prevailingFringe" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaborRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrevailingWageRate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "county" TEXT NOT NULL,
    "projectRef" TEXT,
    "laborRoleId" TEXT,
    "classification" TEXT NOT NULL,
    "baseRate" DOUBLE PRECISION,
    "fringe" DOUBLE PRECISION,
    "source" TEXT,
    "effectiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrevailingWageRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "ownershipHourly" DOUBLE PRECISION,
    "operatingHourly" DOUBLE PRECISION,
    "standbyHourly" DOUBLE PRECISION,
    "mobilizationCost" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SUPPLIER',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SupplierCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SUPPLIER',
    "name" TEXT NOT NULL,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "serviceArea" TEXT,
    "preferred" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "unitCost" DOUBLE PRECISION,
    "categoryCode" TEXT,
    "supplierId" TEXT,
    "lastQuotedAt" TIMESTAMP(3),
    "densityTonsPerCy" DOUBLE PRECISION,
    "wastePct" DOUBLE PRECISION,
    "specNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialPriceHistory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "supplierId" TEXT,
    "quoteId" TEXT,
    "quotedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionRate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "activity" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "outputPerDay" DOUBLE PRECISION,
    "hoursPerDay" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "crew" JSONB NOT NULL DEFAULT '{"labor":[],"equipment":[]}',
    "notes" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoilType" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "swellPct" DOUBLE PRECISION,
    "shrinkPct" DOUBLE PRECISION,
    "notes" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoilType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assembly" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "description" TEXT,
    "productionRateId" TEXT,
    "materials" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assembly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner" TEXT,
    "ownerType" TEXT,
    "projectNumber" TEXT,
    "location" TEXT,
    "bidDueAt" TIMESTAMP(3),
    "preBidMeeting" TEXT,
    "quoteDueAt" TIMESTAMP(3),
    "deliveryLocation" TEXT,
    "laborMode" TEXT NOT NULL DEFAULT 'OPEN',
    "estimatorId" TEXT,
    "markupPct" DOUBLE PRECISION,
    "overheadPct" DOUBLE PRECISION,
    "taxPct" DOUBLE PRECISION,
    "bondPct" DOUBLE PRECISION,
    "haulMiles" DOUBLE PRECISION,
    "permitsCost" DOUBLE PRECISION,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'BIDDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mime" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'OTHER',
    "kindConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "suggestedKind" TEXT,
    "pageCount" INTEGER,
    "hasText" BOOLEAN,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "statusDetail" TEXT,
    "scanStatus" TEXT NOT NULL DEFAULT 'NOT_SCANNED',
    "addendumNumber" INTEGER,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sheet" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "pageIndex" INTEGER NOT NULL,
    "sheetNumber" TEXT,
    "title" TEXT,
    "discipline" TEXT,
    "classification" TEXT,
    "classConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "hasText" BOOLEAN NOT NULL DEFAULT false,
    "scaleText" TEXT,
    "feetPerUnit" DOUBLE PRECISION,
    "calibratedById" TEXT,

    CONSTRAINT "Sheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadSession" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "receivedBytes" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL DEFAULT 'OTHER',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "itemNumber" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "specSection" TEXT,
    "unit" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "section" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceNote" TEXT,
    "documentId" TEXT,
    "pageIndex" INTEGER,
    "confidence" TEXT NOT NULL DEFAULT 'HIGH',
    "aiExtracted" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "specRequirement" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BidItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TakeoffMarkup" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pageIndex" INTEGER NOT NULL,
    "bidItemId" TEXT,
    "tool" TEXT NOT NULL,
    "points" JSONB NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#FF6B00',
    "label" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TakeoffMarkup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidItemAssembly" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "bidItemId" TEXT NOT NULL,
    "assemblyId" TEXT NOT NULL,
    "qtyFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "aiSuggested" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BidItemAssembly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobOverride" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateVersion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "label" TEXT,
    "snapshot" JSONB NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstimateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "materialId" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "wastePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "specRequirement" TEXT,
    "specSection" TEXT,
    "categoryCode" TEXT,
    "bidItemRefs" JSONB NOT NULL DEFAULT '[]',
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "selectedQuoteLineId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rfq" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "categoryCode" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "number" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "superseded" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rfq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqRecipient" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "supplierId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "method" TEXT NOT NULL DEFAULT 'OUTSIDE',
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "token" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "RfqRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqDownload" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "userId" TEXT,
    "format" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "supplierId" TEXT,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RfqDownload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "rfqId" TEXT,
    "rfqRevision" INTEGER,
    "supplierId" TEXT,
    "supplierName" TEXT,
    "source" TEXT NOT NULL,
    "documentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REVIEW',
    "quoteNumber" TEXT,
    "quotedAt" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "taxIncluded" BOOLEAN,
    "freightIncluded" BOOLEAN,
    "minimumOrder" TEXT,
    "exclusions" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "materialLineId" TEXT,
    "lineRef" TEXT,
    "section" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "unitPrice" DOUBLE PRECISION,
    "extended" DOUBLE PRECISION,
    "leadTime" TEXT,
    "notes" TEXT,
    "isAlternate" BOOLEAN NOT NULL DEFAULT false,
    "confidence" TEXT NOT NULL DEFAULT 'HIGH',
    "matchMethod" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_subdomain_key" ON "Company"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "User_companyId_email_key" ON "User"("companyId", "email");

-- CreateIndex
CREATE INDEX "Session_companyId_idx" ON "Session"("companyId");

-- CreateIndex
CREATE INDEX "LaborRole_companyId_idx" ON "LaborRole"("companyId");

-- CreateIndex
CREATE INDEX "PrevailingWageRate_companyId_idx" ON "PrevailingWageRate"("companyId");

-- CreateIndex
CREATE INDEX "Equipment_companyId_idx" ON "Equipment"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCategory_companyId_code_key" ON "SupplierCategory"("companyId", "code");

-- CreateIndex
CREATE INDEX "Supplier_companyId_idx" ON "Supplier"("companyId");

-- CreateIndex
CREATE INDEX "Contact_companyId_idx" ON "Contact"("companyId");

-- CreateIndex
CREATE INDEX "Material_companyId_idx" ON "Material"("companyId");

-- CreateIndex
CREATE INDEX "MaterialPriceHistory_companyId_materialId_idx" ON "MaterialPriceHistory"("companyId", "materialId");

-- CreateIndex
CREATE INDEX "ProductionRate_companyId_idx" ON "ProductionRate"("companyId");

-- CreateIndex
CREATE INDEX "SoilType_companyId_idx" ON "SoilType"("companyId");

-- CreateIndex
CREATE INDEX "Assembly_companyId_idx" ON "Assembly"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_companyId_jobNumber_key" ON "Project"("companyId", "jobNumber");

-- CreateIndex
CREATE INDEX "Document_companyId_projectId_idx" ON "Document"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "Sheet_companyId_projectId_idx" ON "Sheet"("companyId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Sheet_documentId_pageIndex_key" ON "Sheet"("documentId", "pageIndex");

-- CreateIndex
CREATE INDEX "UploadSession_companyId_idx" ON "UploadSession"("companyId");

-- CreateIndex
CREATE INDEX "BidItem_companyId_projectId_idx" ON "BidItem"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "TakeoffMarkup_companyId_projectId_idx" ON "TakeoffMarkup"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "BidItemAssembly_companyId_projectId_idx" ON "BidItemAssembly"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "JobOverride_companyId_idx" ON "JobOverride"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "JobOverride_projectId_targetType_targetId_field_key" ON "JobOverride"("projectId", "targetType", "targetId", "field");

-- CreateIndex
CREATE INDEX "EstimateVersion_companyId_projectId_idx" ON "EstimateVersion"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "MaterialLine_companyId_projectId_idx" ON "MaterialLine"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "Rfq_companyId_projectId_idx" ON "Rfq"("companyId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Rfq_companyId_number_key" ON "Rfq"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "RfqRecipient_token_key" ON "RfqRecipient"("token");

-- CreateIndex
CREATE INDEX "RfqRecipient_companyId_rfqId_idx" ON "RfqRecipient"("companyId", "rfqId");

-- CreateIndex
CREATE INDEX "RfqDownload_companyId_rfqId_idx" ON "RfqDownload"("companyId", "rfqId");

-- CreateIndex
CREATE INDEX "Quote_companyId_projectId_idx" ON "Quote"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "QuoteLine_companyId_quoteId_idx" ON "QuoteLine"("companyId", "quoteId");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- CreateIndex
CREATE INDEX "Job_companyId_idx" ON "Job"("companyId");

-- CreateIndex
CREATE INDEX "AiUsage_companyId_idx" ON "AiUsage"("companyId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_idx" ON "AuditLog"("companyId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

