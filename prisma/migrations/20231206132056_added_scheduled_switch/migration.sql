/*
  Warnings:

  - You are about to drop the column `hour` on the `ScheduledSwitch` table. All the data in the column will be lost.
  - You are about to drop the column `minute` on the `ScheduledSwitch` table. All the data in the column will be lost.
  - Added the required column `endHour` to the `ScheduledSwitch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `endMinute` to the `ScheduledSwitch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startHour` to the `ScheduledSwitch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startMinute` to the `ScheduledSwitch` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ScheduledSwitch" DROP COLUMN "hour",
DROP COLUMN "minute",
ADD COLUMN     "endHour" INTEGER NOT NULL,
ADD COLUMN     "endMinute" INTEGER NOT NULL,
ADD COLUMN     "startHour" INTEGER NOT NULL,
ADD COLUMN     "startMinute" INTEGER NOT NULL;
