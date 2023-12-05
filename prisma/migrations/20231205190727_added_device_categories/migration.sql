-- AlterTable
ALTER TABLE "SmartDevices" ADD COLUMN     "controller" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deviceCategory" VARCHAR(50) NOT NULL DEFAULT 'Outlet';
