/*
  Warnings:

  - A unique constraint covering the columns `[deviceId]` on the table `ScheduledSwitch` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `deviceId` to the `ScheduledSwitch` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ScheduledSwitch" ADD COLUMN     "deviceId" UUID NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledSwitch_deviceId_key" ON "ScheduledSwitch"("deviceId");

-- AddForeignKey
ALTER TABLE "ScheduledSwitch" ADD CONSTRAINT "ScheduledSwitch_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "SmartDevices"("deviceId") ON DELETE RESTRICT ON UPDATE CASCADE;
