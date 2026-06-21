-- Friction is a derived value (premium + spread) and is no longer stored or exposed.
ALTER TABLE "gold_metrics" DROP COLUMN "friction_pct";
