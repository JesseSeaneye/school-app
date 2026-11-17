/*
  Warnings:

  - You are about to drop the column `feeStructureId` on the `StudentFee` table. All the data in the column will be lost.
  - You are about to drop the `FeeStructure` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `name` to the `StudentFee` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "StudentFee" DROP CONSTRAINT "StudentFee_feeStructureId_fkey";

-- AlterTable
ALTER TABLE "StudentFee" DROP COLUMN "feeStructureId",
ADD COLUMN     "name" TEXT NOT NULL;

-- DropTable
DROP TABLE "FeeStructure";
