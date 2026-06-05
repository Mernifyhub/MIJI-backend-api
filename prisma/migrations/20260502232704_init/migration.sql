-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "SubUserRole" AS ENUM ('USER', 'OPERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'PENDING', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AgentTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('ON_HOLD', 'CONFIRMED', 'CANCELLED', 'VOIDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "TripType" AS ENUM ('ONE_WAY', 'ROUND_TRIP', 'MULTI_CITY');

-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('ISSUE', 'REISSUE', 'CANCEL', 'VOID', 'REFUND');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PROCESSING');

-- CreateEnum
CREATE TYPE "MarkupType" AS ENUM ('GLOBAL', 'AIRLINE', 'ROUTE', 'AGENT', 'AIRLINE_AGENT', 'ROUTE_AGENT');

-- CreateEnum
CREATE TYPE "MarkupOn" AS ENUM ('BASE_FARE', 'TOTAL');

-- CreateEnum
CREATE TYPE "RouteMatchType" AS ENUM ('EXACT', 'BIDIRECTIONAL');

-- CreateEnum
CREATE TYPE "DiscountRuleType" AS ENUM ('GLOBAL', 'AIRLINE', 'ROUTE', 'AGENT', 'AIRLINE_AGENT', 'ROUTE_AGENT', 'PROMO', 'CAMPAIGN');

-- CreateEnum
CREATE TYPE "DiscountValueType" AS ENUM ('FLAT', 'PERCENT');

-- CreateEnum
CREATE TYPE "DiscountApplyOn" AS ENUM ('BASE_FARE', 'TOTAL');

-- CreateEnum
CREATE TYPE "PassengerType" AS ENUM ('ADULT', 'CHILD', 'INFANT');

-- CreateEnum
CREATE TYPE "PassengerTitle" AS ENUM ('MR', 'MRS', 'MS', 'MISS', 'MSTR', 'INF');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'MOBILE_BANKING', 'MANUAL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('OPENING_BALANCE', 'TICKET', 'ON_HOLD', 'CANCELLED', 'VOID', 'REFUNDED', 'REISSUE', 'SERVICE', 'DEPOSIT', 'DEPOSIT_PENDING', 'DEPOSIT_FAILED', 'DEPOSIT_REFUNDED', 'REFUND', 'ACM', 'ADM', 'MANUAL_BOOKING', 'DEDUCTION', 'DATE_CHANGE', 'AMOUNT_ADD', 'CREDIT_LIMIT_ADD', 'LIMIT_ADJUST');

-- CreateEnum
CREATE TYPE "LedgerSourceType" AS ENUM ('BOOKING', 'DEPOSIT', 'MANUAL_OPERATION', 'SYSTEM', 'ADMIN');

-- CreateEnum
CREATE TYPE "LedgerStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED', 'VOIDED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "agentId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "agentAddress" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "aviationNumber" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "refreshToken" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "nidCopy" TEXT NOT NULL,
    "tradeLicense" TEXT NOT NULL,
    "logo" TEXT DEFAULT '',
    "city" TEXT DEFAULT '',
    "country" TEXT DEFAULT '',
    "status" "AgentStatus" NOT NULL DEFAULT 'PENDING',
    "tier" "AgentTier" NOT NULL DEFAULT 'BRONZE',
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "creditLimit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expiredLimit" TIMESTAMP(3),
    "usedLimit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commission" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "preBookingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastActive" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "SubUserRole" NOT NULL DEFAULT 'OPERATOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "fullName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "agentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLogin" TIMESTAMP(3),
    "depositsCreated" INTEGER NOT NULL DEFAULT 0,
    "withdrawalsCreated" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SubUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'ON_HOLD',
    "tripType" "TripType" NOT NULL,
    "route" TEXT NOT NULL,
    "departureDate" TIMESTAMP(3) NOT NULL,
    "returnDate" TIMESTAMP(3),
    "pnr" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "currency" TEXT DEFAULT 'SAR',
    "cabinClass" TEXT,
    "baggageInfo" JSONB,
    "conditions" JSONB,
    "bookingDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agentId" TEXT NOT NULL,
    "net" DECIMAL(12,2) NOT NULL,
    "gross" DECIMAL(12,2) NOT NULL,
    "commission" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "priceBreakdown" JSONB,
    "promoDiscount" DECIMAL(12,2) DEFAULT 0,
    "discountAmount" DECIMAL(12,2) DEFAULT 0,
    "discountLabels" TEXT,
    "discountRuleIds" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingRequest" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "type" "RequestType" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "adminNote" TEXT,
    "processedBy" TEXT,
    "processedAt" TIMESTAMP(3),
    "gdsPnr" TEXT,
    "ticketNumber" TEXT,
    "supplierName" TEXT,
    "issueAmount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "assignedToId" TEXT,
    "assignedAt" TIMESTAMP(3),

    CONSTRAINT "BookingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Passenger" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "title" "PassengerTitle",
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "type" "PassengerType" NOT NULL,
    "gender" "Gender",
    "dateOfBirth" TIMESTAMP(3),
    "email" TEXT,
    "phone" TEXT,
    "nationality" TEXT,
    "passportNumber" TEXT,
    "passportExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Passenger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlightSegment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "departure" TIMESTAMP(3) NOT NULL,
    "arrival" TIMESTAMP(3) NOT NULL,
    "flightNo" TEXT NOT NULL,
    "airline" TEXT NOT NULL,

    CONSTRAINT "FlightSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "transactionId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "LedgerType" NOT NULL,
    "sourceType" "LedgerSourceType" NOT NULL,
    "sourceId" TEXT,
    "debit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balanceAfter" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "invoiceNo" TEXT,
    "bookingId" TEXT,
    "depositId" TEXT,
    "operationId" TEXT,
    "reference" TEXT,
    "pnr" TEXT,
    "systemPnr" TEXT,
    "flightDate" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "status" "LedgerStatus" NOT NULL DEFAULT 'COMPLETED',
    "createdBy" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "transactionId" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "attachment" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currency_rates" (
    "id" TEXT NOT NULL,
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,
    "countryName" TEXT,
    "countryCode" TEXT,
    "flag" TEXT,
    "buyRate" DECIMAL(12,4) NOT NULL,
    "sellRate" DECIMAL(12,4) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "currency_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subdomain_currencies" (
    "id" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "countryName" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "flag" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "currencyName" TEXT NOT NULL,
    "rate" DECIMAL(12,4) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subdomain_currencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualOperation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL DEFAULT '',
    "reference" TEXT,
    "pnr" TEXT,
    "passengerName" TEXT,
    "route" TEXT,
    "travelDate" TIMESTAMP(3),
    "newLimit" DOUBLE PRECISION,
    "previousLimit" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "createdBy" TEXT NOT NULL DEFAULT 'Admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "markups" (
    "id" TEXT NOT NULL,
    "type" "MarkupType" NOT NULL,
    "airlineCode" TEXT,
    "airlineName" TEXT,
    "origin" TEXT,
    "destination" TEXT,
    "routeMatchType" "RouteMatchType" NOT NULL DEFAULT 'EXACT',
    "agentId" TEXT,
    "markupAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "markupPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "markupOn" "MarkupOn" NOT NULL DEFAULT 'BASE_FARE',
    "markupCurrency" TEXT NOT NULL DEFAULT 'SAR',
    "ruleKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "note" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "markups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_rules" (
    "id" TEXT NOT NULL,
    "type" "DiscountRuleType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "DiscountValueType" NOT NULL,
    "discountValue" DOUBLE PRECISION NOT NULL,
    "discountOn" "DiscountApplyOn" NOT NULL DEFAULT 'TOTAL',
    "maxDiscount" DOUBLE PRECISION,
    "minFare" DOUBLE PRECISION,
    "airlineCode" TEXT,
    "origin" TEXT,
    "destination" TEXT,
    "routeMatchType" "RouteMatchType" NOT NULL DEFAULT 'EXACT',
    "cabinClass" TEXT,
    "agentId" TEXT,
    "agentTier" "AgentTier",
    "promoCode" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "maxUsageTotal" INTEGER,
    "maxUsagePerAgent" INTEGER,
    "currentUsage" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 10,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isStackable" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "discount_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_usage_logs" (
    "id" TEXT NOT NULL,
    "discountRuleId" TEXT NOT NULL,
    "bookingId" TEXT,
    "agentId" TEXT,
    "discountType" "DiscountValueType" NOT NULL,
    "discountValue" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "promoCode" TEXT,
    "note" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discount_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_agentId_key" ON "User"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_tier_idx" ON "User"("tier");

-- CreateIndex
CREATE INDEX "User_country_idx" ON "User"("country");

-- CreateIndex
CREATE INDEX "User_agentId_idx" ON "User"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "SubUser_username_key" ON "SubUser"("username");

-- CreateIndex
CREATE INDEX "SubUser_agentId_idx" ON "SubUser"("agentId");

-- CreateIndex
CREATE INDEX "SubUser_username_idx" ON "SubUser"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_bookingId_key" ON "Booking"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_pnr_key" ON "Booking"("pnr");

-- CreateIndex
CREATE INDEX "Booking_agentId_idx" ON "Booking"("agentId");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE INDEX "Booking_bookingDate_idx" ON "Booking"("bookingDate");

-- CreateIndex
CREATE INDEX "Booking_pnr_idx" ON "Booking"("pnr");

-- CreateIndex
CREATE INDEX "BookingRequest_bookingId_idx" ON "BookingRequest"("bookingId");

-- CreateIndex
CREATE INDEX "BookingRequest_agentId_idx" ON "BookingRequest"("agentId");

-- CreateIndex
CREATE INDEX "BookingRequest_status_idx" ON "BookingRequest"("status");

-- CreateIndex
CREATE INDEX "BookingRequest_type_idx" ON "BookingRequest"("type");

-- CreateIndex
CREATE INDEX "BookingRequest_assignedToId_idx" ON "BookingRequest"("assignedToId");

-- CreateIndex
CREATE INDEX "Passenger_bookingId_idx" ON "Passenger"("bookingId");

-- CreateIndex
CREATE INDEX "FlightSegment_bookingId_idx" ON "FlightSegment"("bookingId");

-- CreateIndex
CREATE INDEX "Payment_bookingId_idx" ON "Payment"("bookingId");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentLedger_invoiceNo_key" ON "AgentLedger"("invoiceNo");

-- CreateIndex
CREATE INDEX "AgentLedger_userId_createdAt_idx" ON "AgentLedger"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentLedger_userId_type_idx" ON "AgentLedger"("userId", "type");

-- CreateIndex
CREATE INDEX "AgentLedger_userId_sourceType_idx" ON "AgentLedger"("userId", "sourceType");

-- CreateIndex
CREATE INDEX "AgentLedger_invoiceNo_idx" ON "AgentLedger"("invoiceNo");

-- CreateIndex
CREATE INDEX "AgentLedger_bookingId_idx" ON "AgentLedger"("bookingId");

-- CreateIndex
CREATE INDEX "AgentLedger_depositId_idx" ON "AgentLedger"("depositId");

-- CreateIndex
CREATE INDEX "AgentLedger_operationId_idx" ON "AgentLedger"("operationId");

-- CreateIndex
CREATE INDEX "AgentLedger_pnr_idx" ON "AgentLedger"("pnr");

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_reference_key" ON "Deposit"("reference");

-- CreateIndex
CREATE INDEX "Deposit_userId_idx" ON "Deposit"("userId");

-- CreateIndex
CREATE INDEX "Deposit_status_idx" ON "Deposit"("status");

-- CreateIndex
CREATE INDEX "Deposit_createdAt_idx" ON "Deposit"("createdAt");

-- CreateIndex
CREATE INDEX "currency_rates_fromCurrency_isActive_idx" ON "currency_rates"("fromCurrency", "isActive");

-- CreateIndex
CREATE INDEX "currency_rates_toCurrency_isActive_idx" ON "currency_rates"("toCurrency", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "currency_rates_fromCurrency_toCurrency_deletedAt_key" ON "currency_rates"("fromCurrency", "toCurrency", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "subdomain_currencies_subdomain_key" ON "subdomain_currencies"("subdomain");

-- CreateIndex
CREATE INDEX "subdomain_currencies_subdomain_isActive_idx" ON "subdomain_currencies"("subdomain", "isActive");

-- CreateIndex
CREATE INDEX "ManualOperation_userId_idx" ON "ManualOperation"("userId");

-- CreateIndex
CREATE INDEX "ManualOperation_type_idx" ON "ManualOperation"("type");

-- CreateIndex
CREATE INDEX "ManualOperation_status_idx" ON "ManualOperation"("status");

-- CreateIndex
CREATE INDEX "ManualOperation_createdAt_idx" ON "ManualOperation"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "markups_ruleKey_key" ON "markups"("ruleKey");

-- CreateIndex
CREATE INDEX "markups_type_isActive_idx" ON "markups"("type", "isActive");

-- CreateIndex
CREATE INDEX "markups_airlineCode_isActive_idx" ON "markups"("airlineCode", "isActive");

-- CreateIndex
CREATE INDEX "markups_origin_destination_isActive_idx" ON "markups"("origin", "destination", "isActive");

-- CreateIndex
CREATE INDEX "markups_agentId_isActive_idx" ON "markups"("agentId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "discount_rules_promoCode_key" ON "discount_rules"("promoCode");

-- CreateIndex
CREATE INDEX "discount_rules_type_isActive_idx" ON "discount_rules"("type", "isActive");

-- CreateIndex
CREATE INDEX "discount_rules_airlineCode_idx" ON "discount_rules"("airlineCode");

-- CreateIndex
CREATE INDEX "discount_rules_origin_destination_idx" ON "discount_rules"("origin", "destination");

-- CreateIndex
CREATE INDEX "discount_rules_agentId_idx" ON "discount_rules"("agentId");

-- CreateIndex
CREATE INDEX "discount_rules_promoCode_idx" ON "discount_rules"("promoCode");

-- CreateIndex
CREATE INDEX "discount_rules_validFrom_validTo_idx" ON "discount_rules"("validFrom", "validTo");

-- CreateIndex
CREATE INDEX "discount_rules_deletedAt_idx" ON "discount_rules"("deletedAt");

-- CreateIndex
CREATE INDEX "discount_usage_logs_discountRuleId_idx" ON "discount_usage_logs"("discountRuleId");

-- CreateIndex
CREATE INDEX "discount_usage_logs_bookingId_idx" ON "discount_usage_logs"("bookingId");

-- CreateIndex
CREATE INDEX "discount_usage_logs_agentId_idx" ON "discount_usage_logs"("agentId");

-- CreateIndex
CREATE INDEX "discount_usage_logs_appliedAt_idx" ON "discount_usage_logs"("appliedAt");

-- AddForeignKey
ALTER TABLE "SubUser" ADD CONSTRAINT "SubUser_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passenger" ADD CONSTRAINT "Passenger_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlightSegment" ADD CONSTRAINT "FlightSegment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentLedger" ADD CONSTRAINT "AgentLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "currency_rates" ADD CONSTRAINT "currency_rates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "currency_rates" ADD CONSTRAINT "currency_rates_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualOperation" ADD CONSTRAINT "ManualOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "markups" ADD CONSTRAINT "markups_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "markups" ADD CONSTRAINT "markups_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "markups" ADD CONSTRAINT "markups_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_rules" ADD CONSTRAINT "discount_rules_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_rules" ADD CONSTRAINT "discount_rules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_rules" ADD CONSTRAINT "discount_rules_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_usage_logs" ADD CONSTRAINT "discount_usage_logs_discountRuleId_fkey" FOREIGN KEY ("discountRuleId") REFERENCES "discount_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_usage_logs" ADD CONSTRAINT "discount_usage_logs_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_usage_logs" ADD CONSTRAINT "discount_usage_logs_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
