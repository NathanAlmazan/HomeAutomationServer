-- CreateTable
CREATE TABLE "UserSettings" (
    "settingId" SERIAL NOT NULL,
    "costPerWatt" DECIMAL(65,30) NOT NULL DEFAULT 12.00,
    "maxWattPerDay" DECIMAL(65,30) NOT NULL DEFAULT 3.00,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("settingId")
);
