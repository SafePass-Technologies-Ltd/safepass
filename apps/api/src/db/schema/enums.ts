import { pgEnum } from 'drizzle-orm/pg-core';

// =============================================================================
// All PostgreSQL enums for the SafePass database.
// Imported by table definition files.
// =============================================================================

// --- Identity & Auth ---

export const userRoleEnum = pgEnum('user_role', [
  'user',
  'admin',
  'corporate_admin',
  'transport_partner',
  'monitoring_officer',
  'super_admin',
]);

export const authProviderEnum = pgEnum('auth_provider', ['google', 'facebook', 'apple', 'phone']);

export const roleUpgradeRequestedRoleEnum = pgEnum('role_upgrade_requested_role', [
  'admin',
  'super_admin',
  'corporate_admin',
  'transport_partner',
  'monitoring_officer',
]);

export const roleUpgradeStatusEnum = pgEnum('role_upgrade_status', [
  'pending',
  'approved',
  'rejected',
]);

// --- Organization ---

export const orgTypeEnum = pgEnum('org_type', ['corporate', 'transport_partner']);

export const subscriptionPlanEnum = pgEnum('subscription_plan', [
  'starter',
  'business',
  'enterprise',
  'standard',
  'fleet',
  'none',
]);

export const orgVerificationEnum = pgEnum('org_verification', ['pending', 'verified', 'rejected']);

// --- Trip ---

export const tripModeEnum = pgEnum('trip_mode', ['driver', 'passenger']);

export const tripStatusEnum = pgEnum('trip_status', [
  'draft',
  'active',
  'delayed',
  'emergency',
  'escalated',
  'completed',
  'cancelled',
]);

export const vehicleTypeEnum = pgEnum('vehicle_type', [
  'car',
  'bus',
  'suv',
  'truck',
  'motorcycle',
  'other',
]);

// --- Payment & Wallet ---

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'processing',
  'successful',
  'failed',
  'refunded',
]);

export const paymentTypeEnum = pgEnum('payment_type', ['trip', 'subscription', 'refund']);

export const paymentGatewayEnum = pgEnum('payment_gateway', ['paystack', 'flutterwave', 'stripe']);

export const walletOwnerTypeEnum = pgEnum('wallet_owner_type', ['user', 'organization']);

export const transactionTypeEnum = pgEnum('transaction_type', [
  'deposit',
  'trip_charge',
  'subscription_charge',
  'refund',
  'admin_adjustment',
  'withdrawal',
]);

export const transactionStatusEnum = pgEnum('transaction_status', [
  'pending',
  'completed',
  'failed',
  'reversed',
]);

// --- Messaging ---

export const senderRoleEnum = pgEnum('sender_role', [
  'user',
  'admin',
  'monitoring_officer',
  'system',
]);

export const messageTypeEnum = pgEnum('message_type', [
  'text',
  'check_in',
  'alert',
  'system',
]);

// --- Incident & Safety ---

export const incidentTypeEnum = pgEnum('incident_type', [
  'kidnapping',
  'armed_robbery',
  'accident',
  'roadblock',
  'police_checkpoint',
  'fake_checkpoint',
  'bad_road',
  'vehicle_breakdown',
  'suspicious_activity',
]);

export const verificationStatusEnum = pgEnum('verification_status', [
  'unverified',
  'partially_confirmed',
  'verified',
  'disputed',
  'rejected',
]);

export const severityEnum = pgEnum('severity', ['low', 'medium', 'high', 'critical']);

// --- Map Markers ---

export const markerTypeEnum = pgEnum('marker_type', [
  'kidnapping_hotspot',
  'checkpoint',
  'high_risk_zone',
  'recent_attack',
  'safe_zone',
  'admin_marker',
]);

export const markerSourceEnum = pgEnum('marker_source', [
  'user_report',
  'admin_manual',
  'news_archive',
  'police_report',
  'security_advisory',
  'partner_data',
]);

export const markerActionEnum = pgEnum('marker_action', [
  'confirm',
  'dispute_not_there',
  'reclassify_police',
  'reclassify_suspicious',
]);

// --- Emergency ---

export const triggerTypeEnum = pgEnum('trigger_type', [
  'panic_button',
  'auto_detect_crash',
  'auto_detect_stop',
  'auto_detect_deviation',
  'admin_manual',
]);

export const emergencyStatusEnum = pgEnum('emergency_status', [
  'active',
  'acknowledged',
  'escalated',
  'resolved_false_alarm',
  'resolved_incident',
]);

export const escalationStatusEnum = pgEnum('escalation_status', [
  'pending',
  'acknowledged',
  'in_progress',
  'resolved',
  'closed',
]);

// --- Check-Ins ---

export const checkInMethodEnum = pgEnum('checkin_method', ['message', 'call', 'sms']);

export const checkInResponseEnum = pgEnum('checkin_response', [
  'pending',
  'confirmed_safe',
  'no_response',
  'concern_raised',
]);

// --- Documents ---

export const documentEntityEnum = pgEnum('document_entity', ['vehicle', 'driver', 'organization']);

export const documentTypeEnum = pgEnum('document_type', [
  'vehicle_registration',
  'vehicle_insurance',
  'roadworthiness',
  'drivers_license',
  'company_cac_registration',
  'other',
]);
