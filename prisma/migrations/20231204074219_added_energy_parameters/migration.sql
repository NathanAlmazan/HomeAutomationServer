/*
  Warnings:

  - You are about to drop the column `kiloWattHour` on the `EnergyMonitoring` table. All the data in the column will be lost.
  - Added the required column `current` to the `EnergyMonitoring` table without a default value. This is not possible if the table is not empty.
  - Added the required column `energy` to the `EnergyMonitoring` table without a default value. This is not possible if the table is not empty.
  - Added the required column `frequency` to the `EnergyMonitoring` table without a default value. This is not possible if the table is not empty.
  - Added the required column `power` to the `EnergyMonitoring` table without a default value. This is not possible if the table is not empty.
  - Added the required column `powerFactor` to the `EnergyMonitoring` table without a default value. This is not possible if the table is not empty.
  - Added the required column `voltage` to the `EnergyMonitoring` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "EnergyMonitoring" DROP COLUMN "kiloWattHour",
ADD COLUMN     "current" DECIMAL(65,30) NOT NULL,
ADD COLUMN     "energy" DECIMAL(65,30) NOT NULL,
ADD COLUMN     "frequency" DECIMAL(65,30) NOT NULL,
ADD COLUMN     "power" DECIMAL(65,30) NOT NULL,
ADD COLUMN     "powerFactor" DECIMAL(65,30) NOT NULL,
ADD COLUMN     "voltage" DECIMAL(65,30) NOT NULL;
