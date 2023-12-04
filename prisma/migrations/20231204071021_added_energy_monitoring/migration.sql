-- CreateTable
CREATE TABLE "EnergyMonitoring" (
    "recordId" BIGSERIAL NOT NULL,
    "kiloWattHour" DECIMAL(65,30) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnergyMonitoring_pkey" PRIMARY KEY ("recordId")
);
