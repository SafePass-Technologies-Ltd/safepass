/**
 * Organization Routes — corporate & transport partner management.
 *
 * /v1/organizations              — User: create + get own org
 * /v1/organizations/staff        — User: manage staff
 * /v1/organizations/wallet       — User: org wallet
 * /v1/admin/organizations        — Admin: list all, verify
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth';
import {
  createOrganization,
  getOrganizationById,
  getAllOrganizations,
  updateOrganization,
  updateOrgVerification,
  addStaffMember,
  removeStaffMember,
  getOrganizationStaff,
  getOrganizationWallet,
  getOrganizationWalletTransactions,
  requestOrgRoleUpgrade,
} from '../services/organization.service';

// ────────────────────────────────────────────────────────────
// Validation schemas
// ────────────────────────────────────────────────────────────

const OrgCreateSchema = z.object({
  type: z.enum(['corporate', 'transport_partner']),
  name: z.string().min(1, 'Organization name is required'),
  rcNumber: z.string().optional(),
  industry: z.string().optional(),
  address: z.string().optional(),
  contactPerson: z.string().min(1, 'Contact person is required'),
  contactPhone: z.string().min(1, 'Contact phone is required'),
  contactEmail: z.string().email().optional(),
});

const OrgUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  rcNumber: z.string().optional(),
  industry: z.string().optional(),
  address: z.string().optional(),
  contactPerson: z.string().min(1).optional(),
  contactPhone: z.string().min(1).optional(),
  contactEmail: z.string().email().optional(),
});

const StaffAddSchema = z.object({
  userId: z.string().uuid(),
});

// ────────────────────────────────────────────────────────────
// User-facing organization routes
// ────────────────────────────────────────────────────────────

const orgRoutes = new Hono();
orgRoutes.use('*', authMiddleware);

/**
 * POST /v1/organizations
 * Create a new organization (corporate or transport partner).
 *
 * The requesting user does NOT get dashboard access immediately — this
 * would let anyone self-sign-up as corporate_admin/transport_partner.
 * Instead a pending role_upgrade_requests row is created; the user keeps
 * role `user` and no organizationId until an admin approves the request.
 */
orgRoutes.post('/', zValidator('json', OrgCreateSchema), async (c) => {
  const user = c.get('user');
  const data = c.req.valid('json');

  // Only plain users can initiate an org signup.
  if (!['user', 'corporate_admin', 'transport_partner'].includes(user.role)) {
    return c.json(
      { error: { code: 403, message: 'You are not authorized to create an organization' } },
      403
    );
  }

  const org = await createOrganization(data);

  // Submit a pending role upgrade request instead of granting access immediately.
  await requestOrgRoleUpgrade(org.id, user.sub, org.type as 'corporate' | 'transport_partner');

  return c.json(
    {
      organization: org,
      status: 'pending_review',
      message: 'Your organization has been created and is pending admin approval. You will gain dashboard access once approved.',
    },
    201
  );
});

/**
 * GET /v1/organizations/:id
 * Get organization details. User must belong to the organization or be admin.
 */
orgRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const orgId = c.req.param('id');

  const org = await getOrganizationById(orgId);
  if (!org) {
    return c.json({ error: { code: 404, message: 'Organization not found' } }, 404);
  }

  // Authorization: user must belong to the org or be admin.
  const isAdmin = ['admin', 'monitoring_officer', 'super_admin'].includes(user.role);
  if (!isAdmin && user.orgId !== orgId) {
    return c.json({ error: { code: 403, message: 'Access denied' } }, 403);
  }

  return c.json(org);
});

/**
 * PATCH /v1/organizations/:id
 * Update organization details.
 */
orgRoutes.patch('/:id', zValidator('json', OrgUpdateSchema), async (c) => {
  const user = c.get('user');
  const orgId = c.req.param('id');

  const org = await getOrganizationById(orgId);
  if (!org) {
    return c.json({ error: { code: 404, message: 'Organization not found' } }, 404);
  }

  const isAdmin = ['admin', 'monitoring_officer', 'super_admin'].includes(user.role);
  if (!isAdmin && user.orgId !== orgId) {
    return c.json({ error: { code: 403, message: 'Access denied' } }, 403);
  }

  const updated = await updateOrganization(orgId, c.req.valid('json'));
  return c.json(updated);
});

// ────────────────────────────────────────────────────────────
// Staff Management (C-02)
// ────────────────────────────────────────────────────────────

/**
 * GET /v1/organizations/:id/staff
 * List all staff members of an organization.
 */
orgRoutes.get('/:id/staff', async (c) => {
  const user = c.get('user');
  const orgId = c.req.param('id');

  const org = await getOrganizationById(orgId);
  if (!org) {
    return c.json({ error: { code: 404, message: 'Organization not found' } }, 404);
  }

  const isAdmin = ['admin', 'monitoring_officer', 'super_admin'].includes(user.role);
  if (!isAdmin && user.orgId !== orgId) {
    return c.json({ error: { code: 403, message: 'Access denied' } }, 403);
  }

  const staff = await getOrganizationStaff(orgId);
  return c.json({ staff });
});

/**
 * POST /v1/organizations/:id/staff
 * Add a user as a staff member.
 */
orgRoutes.post('/:id/staff', zValidator('json', StaffAddSchema), async (c) => {
  const user = c.get('user');
  const orgId = c.req.param('id');
  const { userId } = c.req.valid('json');

  const org = await getOrganizationById(orgId);
  if (!org) {
    return c.json({ error: { code: 404, message: 'Organization not found' } }, 404);
  }

  // Only the org's own corporate_admin/transport_partner, or platform admins, can add staff.
  const isAdmin = ['admin', 'monitoring_officer', 'super_admin'].includes(user.role);
  const isOrgOwner = ['corporate_admin', 'transport_partner'].includes(user.role) && user.orgId === orgId;
  if (!isAdmin && !isOrgOwner) {
    return c.json({ error: { code: 403, message: 'Access denied' } }, 403);
  }

  const staff = await addStaffMember(orgId, userId);
  return c.json(staff, 201);
});

/**
 * DELETE /v1/organizations/:id/staff/:userId
 * Remove a staff member from the organization.
 */
orgRoutes.delete('/:id/staff/:userId', async (c) => {
  const user = c.get('user');
  const orgId = c.req.param('id');
  const targetUserId = c.req.param('userId');

  const isAdmin = ['admin', 'monitoring_officer', 'super_admin'].includes(user.role);
  const isOrgOwner = ['corporate_admin', 'transport_partner'].includes(user.role) && user.orgId === orgId;
  if (!isAdmin && !isOrgOwner) {
    return c.json({ error: { code: 403, message: 'Access denied' } }, 403);
  }

  const staff = await removeStaffMember(orgId, targetUserId);
  return c.json(staff);
});

// ────────────────────────────────────────────────────────────
// Organization Wallet
// ────────────────────────────────────────────────────────────

/**
 * GET /v1/organizations/:id/wallet
 * Get the organization's wallet balance.
 */
orgRoutes.get('/:id/wallet', async (c) => {
  const user = c.get('user');
  const orgId = c.req.param('id');

  const isAdmin = ['admin', 'monitoring_officer', 'super_admin'].includes(user.role);
  if (!isAdmin && user.orgId !== orgId) {
    return c.json({ error: { code: 403, message: 'Access denied' } }, 403);
  }

  const wallet = await getOrganizationWallet(orgId);
  if (!wallet) {
    return c.json({ error: { code: 404, message: 'Wallet not found' } }, 404);
  }

  return c.json(wallet);
});

/**
 * GET /v1/organizations/:id/wallet/transactions
 * Get the organization's wallet transaction history.
 */
orgRoutes.get('/:id/wallet/transactions', async (c) => {
  const user = c.get('user');
  const orgId = c.req.param('id');

  const isAdmin = ['admin', 'monitoring_officer', 'super_admin'].includes(user.role);
  if (!isAdmin && user.orgId !== orgId) {
    return c.json({ error: { code: 403, message: 'Access denied' } }, 403);
  }

  const limit = parseInt(c.req.query('limit') ?? '50', 10);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  const transactions = await getOrganizationWalletTransactions(orgId, limit, offset);
  return c.json({ transactions });
});

// ────────────────────────────────────────────────────────────
// Admin organization routes
// ────────────────────────────────────────────────────────────

const adminOrgRoutes = new Hono();
adminOrgRoutes.use('*', authMiddleware);
adminOrgRoutes.use('*', requireRole('admin', 'monitoring_officer', 'super_admin'));

/**
 * GET /v1/admin/organizations
 * List all organizations.
 * Query: ?type=corporate&isActive=true
 */
adminOrgRoutes.get('/', async (c) => {
  const type = c.req.query('type');
  const isActive = c.req.query('isActive');

  const orgs = await getAllOrganizations(
    type,
    isActive === undefined ? undefined : isActive === 'true'
  );

  return c.json({ organizations: orgs });
});

/**
 * PATCH /v1/admin/organizations/:id/verify
 * Update organization verification status.
 * Body: { verificationStatus: 'pending'|'verified'|'rejected' }
 */
const OrgVerifySchema = z.object({
  verificationStatus: z.enum(['pending', 'verified', 'rejected']),
});

adminOrgRoutes.patch('/:id/verify', zValidator('json', OrgVerifySchema), async (c) => {
  const orgId = c.req.param('id');
  const { verificationStatus } = c.req.valid('json');

  const org = await updateOrgVerification(orgId, verificationStatus);
  return c.json(org);
});

export { orgRoutes, adminOrgRoutes };
