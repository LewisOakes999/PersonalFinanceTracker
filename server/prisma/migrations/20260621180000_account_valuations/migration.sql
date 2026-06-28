-- CreateTable
CREATE TABLE "AccountValuation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountValuation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountValuation_userId_idx" ON "AccountValuation"("userId");

-- CreateIndex
CREATE INDEX "AccountValuation_accountId_idx" ON "AccountValuation"("accountId");

-- AddForeignKey
ALTER TABLE "AccountValuation" ADD CONSTRAINT "AccountValuation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountValuation" ADD CONSTRAINT "AccountValuation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

