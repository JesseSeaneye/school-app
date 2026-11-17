-- CreateTable
CREATE TABLE "StaffRecommendation" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffRecommendation_teacherId_idx" ON "StaffRecommendation"("teacherId");

-- AddForeignKey
ALTER TABLE "StaffRecommendation" ADD CONSTRAINT "StaffRecommendation_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
