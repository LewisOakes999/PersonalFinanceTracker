-- CreateTable
CREATE TABLE "Liability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "interestRate" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "monthlyPayment" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Liability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Liability_userId_idx" ON "Liability"("userId");

-- AddForeignKey
ALTER TABLE "Liability" ADD CONSTRAINT "Liability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

