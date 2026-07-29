import { pgTable, uuid, text, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { leadTypeEnum, leadStatusEnum } from './enums';

/**
 * Marketing leads captured by SafePassLanding (`docs/SafePassLanding/`).
 *
 * This table is the **system of record** for leads. That is deliberate and
 * sits on the API side of the boundary, not the marketing site's: that site's
 * README carries the explicit non-goal *"It will never become the system of
 * record for leads or user data"*, and its `architecture.md` gives it no
 * database at all. Its Lead Intake Service validates, tags, and forwards to
 * `POST /v1/leads` here — this is where a lead becomes durable.
 *
 * Why persist rather than only forward to a CRM: `risk_log.md` R-004 scores a
 * dropped lead as Impact 5 ("the lead is lost outright, directly costing
 * revenue-funnel volume"). Writing the row first means a CRM/email hand-off
 * failure downstream degrades to a delayed follow-up rather than a lost lead.
 *
 * Field shapes mirror `docs/SafePassLanding/schema.md`. The three lead types
 * have partly-disjoint fields, so type-specific columns are nullable and the
 * per-type required-field rules are enforced at the Zod layer
 * (`@safepass/shared`'s `LeadPayloadSchema`) rather than by NOT NULL
 * constraints that could only ever describe one variant.
 */
export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // --- Envelope (attached by the Lead Intake Service, all types) ---

    /**
     * Client-generated correlation ID for the submission attempt. Uniquely
     * indexed so a visitor hitting Retry after an ambiguous timeout — which
     * user_flow.md's Submission Error state explicitly invites — reconciles
     * onto the same row instead of creating a duplicate lead for sales to
     * chase twice.
     */
    submissionId: uuid('submission_id').notNull(),
    leadType: leadTypeEnum('lead_type').notNull(),
    /** Canonical page path the lead came from, e.g. '/business' — for CRM triage. */
    sourcePage: text('source_page').notNull(),
    /** When the visitor submitted, set client-side; distinct from createdAt (when we received it). */
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),

    // --- Contact (shared across types; which are populated depends on leadType) ---

    contactName: text('contact_name'),
    email: text('email'),
    phone: text('phone'),
    companyName: text('company_name'),

    // --- Type-specific ---

    /** Waitlist only — free-text city/region, used to prioritise market rollout. */
    cityOrRegion: text('city_or_region'),
    /** Demo request only — free-text, e.g. '50-200 field staff'. */
    teamSize: text('team_size'),
    /** Partner inquiry only — approximate vehicle count. */
    fleetSize: integer('fleet_size'),
    /** Demo request's needsDescription / partner inquiry's message. */
    message: text('message'),

    // --- Triage ---

    status: leadStatusEnum('status').notNull().default('new'),
    /** Free-text notes added by sales/partnerships during follow-up. */
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    submissionIdx: uniqueIndex('leads_submission_id_idx').on(table.submissionId),
    typeIdx: index('leads_type_idx').on(table.leadType),
    statusIdx: index('leads_status_idx').on(table.status),
    createdIdx: index('leads_created_idx').on(table.createdAt),
  })
);
