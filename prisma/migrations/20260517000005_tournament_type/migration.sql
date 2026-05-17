-- CreateEnum
CREATE TYPE "TournamentType" AS ENUM ('DEBATE', 'OPEN_QUESTION');

-- AlterTable: add type column with default
ALTER TABLE "Tournament" ADD COLUMN "type" "TournamentType" NOT NULL DEFAULT 'DEBATE';

-- AlterTable: make side nullable for open question registrations
ALTER TABLE "TournamentRegistration" ALTER COLUMN "side" DROP NOT NULL;
