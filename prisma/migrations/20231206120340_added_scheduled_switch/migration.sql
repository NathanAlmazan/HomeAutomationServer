-- AlterTable
ALTER TABLE "SmartDevices" ADD COLUMN     "deviceTimer" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ScheduledSwitch" (
    "scheduleId" BIGSERIAL NOT NULL,
    "hour" INTEGER NOT NULL,
    "minute" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ScheduledSwitch_pkey" PRIMARY KEY ("scheduleId")
);
