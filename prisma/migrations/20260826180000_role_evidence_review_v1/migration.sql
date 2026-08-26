ALTER TABLE "recruitment_scenarios"
ADD COLUMN "role_evidence_record" JSONB,
ADD COLUMN "role_evidence_reviewed_by_id" TEXT,
ADD COLUMN "role_evidence_reviewed_at" TIMESTAMP(3);

ALTER TABLE "recruitment_scenario_criteria"
ADD COLUMN "role_evidence" JSONB;
