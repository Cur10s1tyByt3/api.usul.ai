/*
  Warnings:

  - You are about to drop the `Location` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `LocationCityName` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_AuthorToLocation` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Location" DROP CONSTRAINT "Location_regionId_fkey";

-- DropForeignKey
ALTER TABLE "LocationCityName" DROP CONSTRAINT "LocationCityName_locationId_fkey";

-- DropForeignKey
ALTER TABLE "_AuthorToLocation" DROP CONSTRAINT "_AuthorToLocation_A_fkey";

-- DropForeignKey
ALTER TABLE "_AuthorToLocation" DROP CONSTRAINT "_AuthorToLocation_B_fkey";

-- DropTable
DROP TABLE "Location";

-- DropTable
DROP TABLE "LocationCityName";

-- DropTable
DROP TABLE "_AuthorToLocation";

-- DropEnum
DROP TYPE "LocationType";
