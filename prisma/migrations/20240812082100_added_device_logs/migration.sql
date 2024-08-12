-- CreateTable
CREATE TABLE "DeviceLogs" (
    "logId" BIGSERIAL NOT NULL,
    "deviceId" UUID NOT NULL,
    "opened" TIMESTAMP(3) NOT NULL,
    "closed" TIMESTAMP(3) NOT NULL,
    "consumed" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "DeviceLogs_pkey" PRIMARY KEY ("logId")
);

-- AddForeignKey
ALTER TABLE "DeviceLogs" ADD CONSTRAINT "DeviceLogs_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "SmartDevices"("deviceId") ON DELETE RESTRICT ON UPDATE CASCADE;
