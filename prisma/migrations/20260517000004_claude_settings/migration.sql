-- AlterTable
ALTER TABLE "Tournament"
  ADD COLUMN "customSystemPrompt" TEXT,
  ADD COLUMN "claudeModel"        TEXT,
  ADD COLUMN "claudeMaxTokens"    INTEGER,
  ADD COLUMN "claudeTemperature"  DOUBLE PRECISION;
