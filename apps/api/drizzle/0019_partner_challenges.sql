-- Adds leads.current_challenges: the operator's self-selected primary
-- challenge from the SafePassLanding transport-partner inquiry form
-- ("What challenges are you facing?" — client-requested dropdown). Captured on
-- partner_inquiry leads so the partnerships/sales team can frame the first
-- conversation around the operator's own stated concern (see
-- docs/SafePassLanding/screens/04 and the leads admin view).
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "current_challenges" text;