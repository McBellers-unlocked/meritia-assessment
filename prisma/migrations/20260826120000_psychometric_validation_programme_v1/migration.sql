-- Study-ready psychometric validation programme.
--
-- This migration does not label any assessment as validated. It adds immutable
-- assessment versions, version-specific validity programmes, evidence records,
-- pilot-cohort linkage and independent rater data kept separate from operational
-- hiring marks. Existing cohorts remain valid with a null version reference.

CREATE TYPE "RecruitmentPsychometricProgrammeStatus" AS ENUM (
  'DRAFT', 'STUDY_READY', 'PILOT_ACTIVE', 'ANALYSIS', 'EVIDENCE_REVIEW', 'ARCHIVED'
);
CREATE TYPE "RecruitmentPsychometricEvidenceCategory" AS ENUM (
  'CONTENT', 'RESPONSE_PROCESS', 'RATER_RELIABILITY',
  'RELATIONS_TO_OTHER_VARIABLES', 'FAIRNESS', 'CONSEQUENCES'
);
CREATE TYPE "RecruitmentPsychometricEvidenceStatus" AS ENUM (
  'NOT_STARTED', 'PLANNED', 'IN_PROGRESS', 'EVIDENCE_AVAILABLE',
  'INSUFFICIENT', 'NOT_APPLICABLE'
);
CREATE TYPE "RecruitmentPsychometricConclusion" AS ENUM (
  'NOT_EVALUATED', 'INSUFFICIENT_EVIDENCE', 'SUPPORTS_INTENDED_USE',
  'SUPPORTS_WITH_LIMITATIONS', 'DOES_NOT_SUPPORT_INTENDED_USE'
);
CREATE TYPE "RecruitmentPilotVersionBasis" AS ENUM (
  'CAPTURED_AT_CREATION', 'LINKED_BEFORE_PARTICIPATION', 'RETROSPECTIVE_ATTESTATION'
);
CREATE TYPE "RecruitmentRaterAssignmentStatus" AS ENUM (
  'ASSIGNED', 'IN_PROGRESS', 'SUBMITTED'
);

CREATE TABLE "recruitment_assessment_versions" (
  "id" TEXT NOT NULL,
  "scenario_id" TEXT NOT NULL,
  "scenario_hash" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "scenario_snapshot" JSONB NOT NULL,
  "assessment_mode" "RecruitmentAssessmentMode" NOT NULL,
  "mode_policy_version" TEXT NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recruitment_assessment_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "recruitment_assessment_versions_scenario_hash_key"
  ON "recruitment_assessment_versions"("scenario_id", "scenario_hash");
CREATE INDEX "recruitment_assessment_versions_scenario_created_idx"
  ON "recruitment_assessment_versions"("scenario_id", "created_at");

ALTER TABLE "recruitment_assessments"
  ADD COLUMN "assessment_version_id" TEXT;
CREATE INDEX "recruitment_assessments_assessment_version_id_idx"
  ON "recruitment_assessments"("assessment_version_id");

CREATE TABLE "recruitment_psychometric_programmes" (
  "id" TEXT NOT NULL,
  "scenario_id" TEXT NOT NULL,
  "assessment_version_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "intended_use" TEXT NOT NULL,
  "target_population" TEXT NOT NULL,
  "construct_definition" TEXT NOT NULL,
  "decision_context" TEXT NOT NULL,
  "status" "RecruitmentPsychometricProgrammeStatus" NOT NULL DEFAULT 'DRAFT',
  "conclusion" "RecruitmentPsychometricConclusion" NOT NULL DEFAULT 'NOT_EVALUATED',
  "limitations" TEXT,
  "independent_reviewer_name" TEXT,
  "independent_reviewer_credentials" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "recruitment_psychometric_programmes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "recruitment_psychometric_programmes_scenario_created_idx"
  ON "recruitment_psychometric_programmes"("scenario_id", "created_at");
CREATE INDEX "recruitment_psychometric_programmes_assessment_version_idx"
  ON "recruitment_psychometric_programmes"("assessment_version_id");

CREATE TABLE "recruitment_psychometric_evidence" (
  "id" TEXT NOT NULL,
  "programme_id" TEXT NOT NULL,
  "category" "RecruitmentPsychometricEvidenceCategory" NOT NULL,
  "status" "RecruitmentPsychometricEvidenceStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "summary" TEXT,
  "methodology" TEXT,
  "sample_description" TEXT,
  "findings" TEXT,
  "limitations" TEXT,
  "updated_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "recruitment_psychometric_evidence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "recruitment_psychometric_evidence_programme_category_key"
  ON "recruitment_psychometric_evidence"("programme_id", "category");
CREATE INDEX "recruitment_psychometric_evidence_programme_status_idx"
  ON "recruitment_psychometric_evidence"("programme_id", "status");

CREATE TABLE "recruitment_psychometric_pilot_cohorts" (
  "id" TEXT NOT NULL,
  "programme_id" TEXT NOT NULL,
  "assessment_id" TEXT NOT NULL,
  "version_basis" "RecruitmentPilotVersionBasis" NOT NULL,
  "retrospective_attestation" TEXT,
  "included_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recruitment_psychometric_pilot_cohorts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "recruitment_psychometric_pilot_cohorts_programme_assessment_key"
  ON "recruitment_psychometric_pilot_cohorts"("programme_id", "assessment_id");
CREATE INDEX "recruitment_psychometric_pilot_cohorts_assessment_idx"
  ON "recruitment_psychometric_pilot_cohorts"("assessment_id");

CREATE TABLE "recruitment_psychometric_rater_assignments" (
  "id" TEXT NOT NULL,
  "programme_id" TEXT NOT NULL,
  "candidate_id" TEXT NOT NULL,
  "rater_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "status" "RecruitmentRaterAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
  "due_at" TIMESTAMP(3),
  "submitted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "recruitment_psychometric_rater_assignments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "recruitment_psychometric_rater_assignments_programme_candidate_rater_key"
  ON "recruitment_psychometric_rater_assignments"("programme_id", "candidate_id", "rater_id");
CREATE INDEX "recruitment_psychometric_rater_assignments_rater_status_idx"
  ON "recruitment_psychometric_rater_assignments"("rater_id", "status");
CREATE INDEX "recruitment_psychometric_rater_assignments_programme_candidate_idx"
  ON "recruitment_psychometric_rater_assignments"("programme_id", "candidate_id");

CREATE TABLE "recruitment_psychometric_ratings" (
  "id" TEXT NOT NULL,
  "assignment_id" TEXT NOT NULL,
  "response_id" TEXT NOT NULL,
  "task_number" INTEGER NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "criterion_scores" JSONB,
  "comments" TEXT,
  "submitted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "recruitment_psychometric_ratings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "recruitment_psychometric_ratings_assignment_response_key"
  ON "recruitment_psychometric_ratings"("assignment_id", "response_id");
CREATE INDEX "recruitment_psychometric_ratings_response_idx"
  ON "recruitment_psychometric_ratings"("response_id");

ALTER TABLE "recruitment_assessment_versions" ADD CONSTRAINT "recruitment_assessment_versions_scenario_fkey"
  FOREIGN KEY ("scenario_id") REFERENCES "recruitment_scenarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recruitment_assessment_versions" ADD CONSTRAINT "recruitment_assessment_versions_creator_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recruitment_assessments" ADD CONSTRAINT "recruitment_assessments_assessment_version_fkey"
  FOREIGN KEY ("assessment_version_id") REFERENCES "recruitment_assessment_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recruitment_psychometric_programmes" ADD CONSTRAINT "recruitment_psychometric_programmes_scenario_fkey"
  FOREIGN KEY ("scenario_id") REFERENCES "recruitment_scenarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recruitment_psychometric_programmes" ADD CONSTRAINT "recruitment_psychometric_programmes_version_fkey"
  FOREIGN KEY ("assessment_version_id") REFERENCES "recruitment_assessment_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recruitment_psychometric_programmes" ADD CONSTRAINT "recruitment_psychometric_programmes_creator_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recruitment_psychometric_evidence" ADD CONSTRAINT "recruitment_psychometric_evidence_programme_fkey"
  FOREIGN KEY ("programme_id") REFERENCES "recruitment_psychometric_programmes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recruitment_psychometric_evidence" ADD CONSTRAINT "recruitment_psychometric_evidence_updater_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recruitment_psychometric_pilot_cohorts" ADD CONSTRAINT "recruitment_psychometric_pilot_cohorts_programme_fkey"
  FOREIGN KEY ("programme_id") REFERENCES "recruitment_psychometric_programmes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recruitment_psychometric_pilot_cohorts" ADD CONSTRAINT "recruitment_psychometric_pilot_cohorts_assessment_fkey"
  FOREIGN KEY ("assessment_id") REFERENCES "recruitment_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recruitment_psychometric_rater_assignments" ADD CONSTRAINT "recruitment_psychometric_rater_assignments_programme_fkey"
  FOREIGN KEY ("programme_id") REFERENCES "recruitment_psychometric_programmes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recruitment_psychometric_rater_assignments" ADD CONSTRAINT "recruitment_psychometric_rater_assignments_candidate_fkey"
  FOREIGN KEY ("candidate_id") REFERENCES "recruitment_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recruitment_psychometric_rater_assignments" ADD CONSTRAINT "recruitment_psychometric_rater_assignments_rater_fkey"
  FOREIGN KEY ("rater_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recruitment_psychometric_ratings" ADD CONSTRAINT "recruitment_psychometric_ratings_assignment_fkey"
  FOREIGN KEY ("assignment_id") REFERENCES "recruitment_psychometric_rater_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recruitment_psychometric_ratings" ADD CONSTRAINT "recruitment_psychometric_ratings_response_fkey"
  FOREIGN KEY ("response_id") REFERENCES "recruitment_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
