-- Rename Student.ville to Student.lieuNaissance ("place of birth" replaces
-- "city"), preserving any data already entered.
ALTER TABLE "Student" RENAME COLUMN "ville" TO "lieuNaissance";
