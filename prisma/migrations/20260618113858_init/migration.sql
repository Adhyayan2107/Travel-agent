-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('PLANNING', 'SEARCHING', 'ASSEMBLING', 'CONFIRMED', 'CHANGED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'PLANNING',
    "rawBrief" TEXT NOT NULL,
    "parsedBrief" JSONB,
    "itinerary" JSONB,
    "budgetSummary" JSONB,
    "conflicts" JSONB NOT NULL DEFAULT '[]',
    "changeLog" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "checkpoints" JSONB NOT NULL DEFAULT '[]',
    "thoughtLog" JSONB NOT NULL DEFAULT '[]',
    "toolCallLog" JSONB NOT NULL DEFAULT '[]',
    "rtkSavings" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'running',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
