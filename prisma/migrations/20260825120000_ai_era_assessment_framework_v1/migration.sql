-- AI-era assessment framework v1
-- Additive migration: existing scenarios/cohorts default to Evidence Mode and
-- existing cohorts keep defence disabled. No candidate response is rewritten.

CREATE TYPE "RecruitmentAssessmentMode" AS ENUM ('EVIDENCE', 'COPILOT', 'OPEN_AGENT');
CREATE TYPE "RecruitmentEvidenceVerificationStatus" AS ENUM ('VERIFIED', 'UNVERIFIED', 'INFERENCE');
CREATE TYPE "RecruitmentEvidenceDisposition" AS ENUM ('SAVED', 'CHECKED', 'REJECTED', 'DISMISSED');
CREATE TYPE "RecruitmentValidationRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "RecruitmentScenarioReviewType" AS ENUM ('SUBJECT_MATTER', 'ASSESSMENT_DESIGN', 'ACCESSIBILITY');
CREATE TYPE "RecruitmentScenarioReviewDecision" AS ENUM ('APPROVED', 'CHANGES_REQUIRED', 'APPROVED_WITH_LIMITATIONS');

ALTER TABLE "recruitment_scenarios"
  ADD COLUMN "assessment_mode" "RecruitmentAssessmentMode" NOT NULL DEFAULT 'EVIDENCE',
  ADD COLUMN "mode_policy_version" TEXT NOT NULL DEFAULT '1',
  ADD COLUMN "defence_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "defence_question_count" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "defence_minutes" INTEGER NOT NULL DEFAULT 5;

ALTER TABLE "recruitment_assessments"
  ADD COLUMN "assessment_mode" "RecruitmentAssessmentMode" NOT NULL DEFAULT 'EVIDENCE',
  ADD COLUMN "mode_policy_version" TEXT NOT NULL DEFAULT '1',
  ADD COLUMN "defence_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "defence_question_count" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "defence_minutes" INTEGER NOT NULL DEFAULT 5;

ALTER TABLE "recruitment_candidates"
  ADD COLUMN "work_locked_at" TIMESTAMP(3),
  ADD COLUMN "tool_declaration" JSONB,
  ADD COLUMN "tool_declaration_submitted_at" TIMESTAMP(3);

ALTER TABLE "recruitment_responses"
  ADD COLUMN "criterion_scores" JSONB;

ALTER TABLE "recruitment_interactions"
  ADD COLUMN "structured_payload" JSONB,
  ADD COLUMN "schema_version" TEXT,
  ADD COLUMN "model" TEXT,
  ADD COLUMN "prompt_policy_version" TEXT,
  ADD COLUMN "assessment_mode" "RecruitmentAssessmentMode",
  ADD COLUMN "source_validation" JSONB,
  ADD COLUMN "content_version" TEXT;

ALTER TABLE "recruitment_scenario_exhibits" ADD COLUMN "source_id" TEXT;
UPDATE "recruitment_scenario_exhibits" SET "source_id" = "id" WHERE "source_id" IS NULL;
CREATE UNIQUE INDEX "recruitment_scenario_exhibits_scenario_id_source_id_key"
  ON "recruitment_scenario_exhibits"("scenario_id", "source_id");

CREATE TABLE "recruitment_candidate_evidence" (
  "id" TEXT NOT NULL,
  "candidate_id" TEXT NOT NULL,
  "task_id" TEXT,
  "task_number" INTEGER NOT NULL,
  "interaction_id" UUID,
  "evidence_card_id" TEXT NOT NULL,
  "claim" TEXT NOT NULL,
  "source_id" TEXT,
  "source_title" TEXT,
  "source_excerpt" TEXT,
  "source_verification_status" "RecruitmentEvidenceVerificationStatus" NOT NULL,
  "candidate_disposition" "RecruitmentEvidenceDisposition" NOT NULL DEFAULT 'SAVED',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "recruitment_candidate_evidence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "recruitment_candidate_evidence_candidate_interaction_card_key"
  ON "recruitment_candidate_evidence"("candidate_id", "interaction_id", "evidence_card_id");
CREATE INDEX "recruitment_candidate_evidence_candidate_task_idx"
  ON "recruitment_candidate_evidence"("candidate_id", "task_number");

CREATE TABLE "recruitment_candidate_defences" (
  "id" TEXT NOT NULL,
  "candidate_id" TEXT NOT NULL,
  "assessment_mode" "RecruitmentAssessmentMode" NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'questions_ready',
  "questions" JSONB NOT NULL,
  "answers" JSONB NOT NULL,
  "personalised" BOOLEAN NOT NULL DEFAULT false,
  "model" TEXT,
  "prompt_version" TEXT NOT NULL,
  "content_version" TEXT NOT NULL DEFAULT '1',
  "generation_error" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL,
  "deadline" TIMESTAMP(3) NOT NULL,
  "submitted_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recruitment_candidate_defences_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "recruitment_candidate_defences_candidate_id_key"
  ON "recruitment_candidate_defences"("candidate_id");
CREATE INDEX "recruitment_candidate_defences_status_deadline_idx"
  ON "recruitment_candidate_defences"("status", "deadline");

CREATE TABLE "recruitment_scenario_criteria" (
  "id" TEXT NOT NULL,
  "scenario_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "source_requirement" TEXT,
  "observable_behaviours" JSONB NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "recruitment_scenario_criteria_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "recruitment_scenario_criteria_scenario_code_key"
  ON "recruitment_scenario_criteria"("scenario_id", "code");
CREATE INDEX "recruitment_scenario_criteria_scenario_order_idx"
  ON "recruitment_scenario_criteria"("scenario_id", "order");

CREATE TABLE "recruitment_scenario_criterion_tasks" (
  "id" TEXT NOT NULL,
  "criterion_id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "expected_candidate_evidence" TEXT NOT NULL,
  "rubric_element_ids" JSONB NOT NULL,
  "marks" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "recruitment_scenario_criterion_tasks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "recruitment_scenario_criterion_tasks_criterion_task_key"
  ON "recruitment_scenario_criterion_tasks"("criterion_id", "task_id");
CREATE INDEX "recruitment_scenario_criterion_tasks_task_idx"
  ON "recruitment_scenario_criterion_tasks"("task_id");

CREATE TABLE "recruitment_scenario_validation_runs" (
  "id" TEXT NOT NULL,
  "scenario_id" TEXT NOT NULL,
  "scenario_hash" TEXT NOT NULL,
  "assessment_mode" "RecruitmentAssessmentMode" NOT NULL,
  "status" "RecruitmentValidationRunStatus" NOT NULL DEFAULT 'QUEUED',
  "progress_stage" TEXT NOT NULL DEFAULT 'Preparing scenario snapshot',
  "overall_readiness" TEXT,
  "prompt_version" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "content_version" TEXT NOT NULL DEFAULT '1',
  "scenario_snapshot" JSONB,
  "deterministic_checks" JSONB,
  "findings" JSONB,
  "criterion_coverage" JSONB,
  "synthetic_profiles" JSONB,
  "policy_tests" JSONB,
  "summary" TEXT,
  "error" TEXT,
  "created_by_id" TEXT NOT NULL,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recruitment_scenario_validation_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "recruitment_scenario_validation_runs_scenario_created_idx"
  ON "recruitment_scenario_validation_runs"("scenario_id", "created_at");
CREATE INDEX "recruitment_scenario_validation_runs_status_created_idx"
  ON "recruitment_scenario_validation_runs"("status", "created_at");

CREATE TABLE "recruitment_scenario_reviews" (
  "id" TEXT NOT NULL,
  "scenario_id" TEXT NOT NULL,
  "validation_run_id" TEXT,
  "review_type" "RecruitmentScenarioReviewType" NOT NULL,
  "decision" "RecruitmentScenarioReviewDecision" NOT NULL,
  "notes" TEXT NOT NULL,
  "reviewer_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recruitment_scenario_reviews_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "recruitment_scenario_reviews_scenario_created_idx"
  ON "recruitment_scenario_reviews"("scenario_id", "created_at");
CREATE INDEX "recruitment_scenario_reviews_validation_run_idx"
  ON "recruitment_scenario_reviews"("validation_run_id");

CREATE TABLE "recruitment_scenario_publication_overrides" (
  "id" TEXT NOT NULL,
  "scenario_id" TEXT NOT NULL,
  "scenario_hash" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recruitment_scenario_publication_overrides_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "recruitment_scenario_publication_overrides_scenario_created_idx"
  ON "recruitment_scenario_publication_overrides"("scenario_id", "created_at");

ALTER TABLE "recruitment_candidate_evidence" ADD CONSTRAINT "recruitment_candidate_evidence_candidate_fkey"
  FOREIGN KEY ("candidate_id") REFERENCES "recruitment_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recruitment_candidate_evidence" ADD CONSTRAINT "recruitment_candidate_evidence_task_fkey"
  FOREIGN KEY ("task_id") REFERENCES "recruitment_scenario_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "recruitment_candidate_evidence" ADD CONSTRAINT "recruitment_candidate_evidence_interaction_fkey"
  FOREIGN KEY ("interaction_id") REFERENCES "recruitment_interactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "recruitment_candidate_defences" ADD CONSTRAINT "recruitment_candidate_defences_candidate_fkey"
  FOREIGN KEY ("candidate_id") REFERENCES "recruitment_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recruitment_scenario_criteria" ADD CONSTRAINT "recruitment_scenario_criteria_scenario_fkey"
  FOREIGN KEY ("scenario_id") REFERENCES "recruitment_scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recruitment_scenario_criterion_tasks" ADD CONSTRAINT "recruitment_scenario_criterion_tasks_criterion_fkey"
  FOREIGN KEY ("criterion_id") REFERENCES "recruitment_scenario_criteria"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recruitment_scenario_criterion_tasks" ADD CONSTRAINT "recruitment_scenario_criterion_tasks_task_fkey"
  FOREIGN KEY ("task_id") REFERENCES "recruitment_scenario_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recruitment_scenario_validation_runs" ADD CONSTRAINT "recruitment_scenario_validation_runs_scenario_fkey"
  FOREIGN KEY ("scenario_id") REFERENCES "recruitment_scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recruitment_scenario_validation_runs" ADD CONSTRAINT "recruitment_scenario_validation_runs_creator_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recruitment_scenario_reviews" ADD CONSTRAINT "recruitment_scenario_reviews_scenario_fkey"
  FOREIGN KEY ("scenario_id") REFERENCES "recruitment_scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recruitment_scenario_reviews" ADD CONSTRAINT "recruitment_scenario_reviews_validation_run_fkey"
  FOREIGN KEY ("validation_run_id") REFERENCES "recruitment_scenario_validation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "recruitment_scenario_reviews" ADD CONSTRAINT "recruitment_scenario_reviews_reviewer_fkey"
  FOREIGN KEY ("reviewer_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recruitment_scenario_publication_overrides" ADD CONSTRAINT "recruitment_scenario_publication_overrides_scenario_fkey"
  FOREIGN KEY ("scenario_id") REFERENCES "recruitment_scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recruitment_scenario_publication_overrides" ADD CONSTRAINT "recruitment_scenario_publication_overrides_user_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
