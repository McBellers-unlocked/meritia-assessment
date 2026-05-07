// Roles allowed on the admin surface. The candidate flow is token-based and
// does not consult roles at all.
//
// FULL_ADMIN_ROLES — your full-trust operator accounts (Cognito-issued).
// SCENARIO_BUILDER_ROLES — full admins PLUS demo-session users (tokenized
//   self-serve URLs handed to prospects). DEMO accounts are scoped by
//   `createdById` on every scenario read/write — they only ever see
//   resources they themselves created.
//
// Routes that touch other admins' candidates, cohorts, or results must
// gate with FULL_ADMIN_ROLES. Anything in the scenario-builder surface
// (WIPO picker, from-jd flow, scenarios CRUD) gates with
// SCENARIO_BUILDER_ROLES + a per-resource ownership check.
export const FULL_ADMIN_ROLES = ["ADMIN"] as const;
export const SCENARIO_BUILDER_ROLES = ["ADMIN", "DEMO"] as const;

// Backwards compat for callers that haven't been audited yet —
// preserves existing behaviour (ADMIN-only) until they're updated to
// pick the right list explicitly.
export const ADMIN_ROLES = FULL_ADMIN_ROLES;
