-- CreateTable
CREATE TABLE "SmartDevices" (
    "deviceId" UUID NOT NULL,
    "deviceName" VARCHAR(50) NOT NULL,
    "devicePass" VARCHAR(255) NOT NULL,

    CONSTRAINT "SmartDevices_pkey" PRIMARY KEY ("deviceId")
);
