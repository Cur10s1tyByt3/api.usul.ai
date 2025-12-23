/*
  Warnings:

  - You are about to drop the column `currentNameTransliteration` on the `Region` table. All the data in the column will be lost.
  - You are about to drop the `RegionCurrentName` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "RegionCurrentName" DROP CONSTRAINT "RegionCurrentName_regionId_fkey";

-- AlterTable
ALTER TABLE "Region" DROP COLUMN "currentNameTransliteration";

-- DropTable
DROP TABLE "RegionCurrentName";
