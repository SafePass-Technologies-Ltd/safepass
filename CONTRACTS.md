# SafePass — API Contracts

## Purpose and source

This file freezes the API surface the SafePass team builds against. It was derived from the implemented backend (`apps/api/src/routes/`) and the canonical validation schemas in `@safepass/shared` (`packages/shared/src/schemas/`). Every endpoint listed is `Frozen`: a change after freeze is a change request, updating this file (revision) and re-dispatching the owning frontend and backend slices. The shared Zod schemas are the authoritative request/response shape source; this file states the surface and the highest-traffic contracts in detail.

## Conventions

- **Base path:** `https://api.safepass-tech.com` (dev: `http://localhost:3000`). All API routes live under `/v1`; a small set of public deep-link routes live at the root.
- **Auth:** `Authorization: Bearer <accessToken>` on authenticated routes. Access tokens are short-lived (15 min); `POST /v1/auth/refresh` issues a new pair. Exceptions: token-exchange, refresh, lead intake (service key), and the public root routes are unauthenticated.
- **Roles:** `user`, `admin`, `super_admin`, `monitoring_officer`, `corporate_admin`, `transport_partner`. Admin routes require an admin, super admin, or monitoring officer role as noted.
- **Error envelope:** every error response is `{ "error": { "code": <string|number>, "message": <string> } }`.
- **Rate limiting:** global 100 req/min per IP; `/v1/auth/*` 10 req/min per IP.
- **Money:** all amounts are in naira (NGN), stored as decimal values.
- **Enums:** trip status, incident type, marker type, verification status, severity, lead type/status, and all other enums are defined in `packages/shared/src/schemas/` and `apps/api/src/db/schema/enums.ts`.

## Contract inventory

### Public root routes (no `/v1`, unauthenticated)

| Method | Path | Contract | Purpose |
|---|---|---|---|
| GET | `/health` | Frozen | Health check |
| GET | `/join/:token` | Frozen | Resolve an org invite token (deep link) |
| GET | `/verify/v/:token` | Frozen | Public vehicle QR verification |
| GET | `/.well-known/apple-app-site-association` | Frozen | iOS universal link file |
| GET | `/.well-known/assetlinks.json` | Frozen | Android app link file |

### v1 — user and public API

| Method | Path | Auth | Contract | Purpose |
|---|---|---|---|---|
| POST | `/v1/auth/token-exchange` | none | C-001 | Exchange sign-in token for a session |
| POST | `/v1/auth/refresh` | none | C-002 | Refresh access token |
| POST | `/v1/leads` | service key | C-003 | Marketing lead intake |
| GET | `/v1/users/me` | user | Frozen | Current profile |
| PATCH | `/v1/users/me` | user | Frozen | Update profile |
| GET | `/v1/users/me/emergency-contacts` | user | Frozen | List emergency contacts |
| PUT | `/v1/users/me/emergency-contacts` | user | Frozen | Replace emergency contacts |
| GET | `/v1/users/me/vehicles` | user | Frozen | List saved vehicles |
| POST | `/v1/users/me/vehicles` | user | Frozen | Add saved vehicle |
| PATCH | `/v1/users/me/vehicles/:vehicleId` | user | Frozen | Update saved vehicle |
| DELETE | `/v1/users/me/vehicles/:vehicleId` | user | Frozen | Delete saved vehicle |
| POST | `/v1/users/me/fcm-token` | user | Frozen | Register push token |
| DELETE | `/v1/users/me/fcm-token` | user | Frozen | Unregister push token |
| POST | `/v1/users/me/deletion-request` | user | Frozen | Request account deletion |
| GET | `/v1/users/me/deletion-request` | user | Frozen | Read deletion request |
| DELETE | `/v1/users/me/deletion-request` | user | Frozen | Cancel deletion request |
| POST | `/v1/trips/scheduled` | user | Frozen | Create scheduled journey |
| GET | `/v1/trips/scheduled` | user | Frozen | List scheduled journeys |
| PATCH | `/v1/trips/scheduled/:id` | user | Frozen | Update scheduled journey |
| DELETE | `/v1/trips/scheduled/:id` | user | Frozen | Cancel scheduled journey |
| POST | `/v1/trips` | user | C-004 | Create trip (draft) |
| POST | `/v1/trips/start` | user | C-005 | Start monitoring (charge or cover) |
| GET | `/v1/trips` | user | Frozen | List own trips |
| GET | `/v1/trips/destinations/recent` | user | Frozen | Recent destinations |
| GET | `/v1/trips/:tripId` | user | Frozen | Trip detail |
| GET | `/v1/trips/:tripId/summary` | user | Frozen | Trip summary stats |
| POST | `/v1/trips/:tripId/gps` | user | C-006 | Report GPS position |
| POST | `/v1/trips/:tripId/complete` | user | Frozen | Confirm safe arrival |
| POST | `/v1/trips/:tripId/cancel` | user | Frozen | Cancel trip |
| PATCH | `/v1/trips/:tripId/vehicle` | user | Frozen | Update draft vehicle fields |
| POST | `/v1/trips/:tripId/tag-invites` | user | Frozen | Tag an org member on the journey |
| POST | `/v1/trips/tag-invites/:inviteId/accept` | user | Frozen | Accept a tag invite |
| GET | `/v1/wallets/me` | user | C-008 | Own wallet balance |
| GET | `/v1/wallets/me/transactions` | user | C-008 | Own transaction history |
| POST | `/v1/payments/initialize` | user | C-009 | Initialize a wallet top-up |
| POST | `/v1/payments/verify` | user | Frozen | Verify a payment reference |
| POST | `/v1/payments/webhook` | gateway | Frozen | Gateway charge callback |
| GET | `/v1/messages/conversations` | user | Frozen | List conversations |
| GET | `/v1/messages/conversations/:tripId/messages` | user | Frozen | Conversation thread |
| POST | `/v1/messages` | user | C-012 | Send a journey-scoped message |
| GET | `/v1/trips/:tripId/messages` | user/admin | Frozen | Trip message thread |
| POST | `/v1/trips/:tripId/messages` | user/admin | C-012 | Send trip message |
| POST | `/v1/trips/:tripId/messages/read` | user/admin | Frozen | Mark thread read |
| POST | `/v1/incidents` | user | C-013 | Report an incident |
| GET | `/v1/incidents` | user | Frozen | List own incident reports |
| GET | `/v1/incidents/nearby` | user | Frozen | Proximity incidents |
| GET | `/v1/markers/nearby` | user | C-014 | Markers near a point |
| POST | `/v1/markers/:id/interact` | user | C-014 | Act on a marker (confirm, dispute, reclassify) |
| GET | `/v1/markers/:id/interactions` | user | Frozen | Marker interaction history |
| POST | `/v1/organizations` | user | Frozen | Register an organization |
| GET | `/v1/organizations/:id` | member | Frozen | Org profile |
| PATCH | `/v1/organizations/:id` | member | Frozen | Update org profile |
| GET | `/v1/organizations/:id/staff` | member | Frozen | List org staff |
| POST | `/v1/organizations/:id/staff` | member | Frozen | Register a staff trip |
| DELETE | `/v1/organizations/:id/staff/:userId` | member | Frozen | Remove staff |
| GET | `/v1/organizations/:id/wallet` | member | Frozen | Org wallet |
| GET | `/v1/organizations/:id/wallet/transactions` | member | Frozen | Org wallet transactions |
| GET | `/v1/org/slots` | org admin | Frozen | List slots |
| POST | `/v1/org/slots` | org admin | Frozen | Create slot |
| POST | `/v1/org/slots/generate-token` | org admin | Frozen | Generate invite token |
| POST | `/v1/org/slots/bulk-generate-tokens` | org admin | Frozen | Bulk generate tokens |
| POST | `/v1/org/slots/bulk-export-csv` | org admin | Frozen | Export tokens CSV |
| DELETE | `/v1/org/slots/:slotId/member` | org admin | Frozen | Revoke member |
| POST | `/v1/org/join/resolve` | user | C-015 | Resolve invite token to org |
| POST | `/v1/org/join` | user | C-015 | Join org with token |
| GET | `/v1/org/membership` | user | Frozen | Read membership |
| DELETE | `/v1/org/membership` | user | Frozen | Leave org |
| GET | `/v1/org/subscription` | org admin | Frozen | Read subscription |
| GET | `/v1/org/subscription/price` | org admin | Frozen | Plan pricing |
| POST | `/v1/org/subscription/activate` | org admin | Frozen | Activate a plan |
| POST | `/v1/org/subscription/request` | org admin | Frozen | Request plan change |
| GET | `/v1/geocoding/reverse` | user | Frozen | Reverse geocode |
| GET | `/v1/geocoding/autocomplete` | user | Frozen | Place search |
| GET | `/v1/geocoding/place` | user | Frozen | Resolve a place |
| GET | `/v1/vehicles` | partner | Frozen | List fleet vehicles |
| POST | `/v1/vehicles` | partner | Frozen | Add vehicle |
| PATCH | `/v1/vehicles/:id` | partner | Frozen | Update vehicle |
| GET | `/v1/vehicles/:id` | partner | Frozen | Vehicle detail |
| POST | `/v1/vehicles/:id/qr` | partner | Frozen | Generate vehicle QR |
| DELETE | `/v1/vehicles/:id` | partner | Frozen | Remove vehicle |
| GET | `/v1/drivers` | partner | Frozen | List drivers |
| POST | `/v1/drivers` | partner | Frozen | Add driver |
| PATCH | `/v1/drivers/:id/vehicle` | partner | Frozen | Assign driver to vehicle |
| GET | `/v1/documents` | partner | Frozen | List documents |
| POST | `/v1/documents` | partner | Frozen | Upload document |
| DELETE | `/v1/documents/:id` | partner | Frozen | Delete document |
| POST | `/v1/emergency/trigger` | user | C-010 | Trigger emergency (panic) |
| POST | `/v1/emergency/:id/audio` | user | C-011 | Upload an audio chunk |
| POST | `/v1/emergency/:tripId/check-in` | user | Frozen | Emergency check-in response |
| GET | `/v1/emergency/alerts` | user | Frozen | Emergency alert state |
| POST | `/v1/role-upgrades/request` | user | Frozen | Request role upgrade |
| GET | `/v1/role-upgrades/mine` | user | Frozen | Read own upgrade requests |

### v1/admin — operations (role-gated)

| Method | Path | Auth | Contract | Purpose |
|---|---|---|---|---|
| GET | `/v1/admin/trips/active` | officer+ | Frozen | Live active trips |
| GET | `/v1/admin/trips/:tripId` | officer+ | Frozen | Admin trip detail |
| GET | `/v1/admin/trips/:tripId/route-history` | officer+ | Frozen | Sampled route history |
| PATCH | `/v1/admin/trips/:tripId/status` | officer+ | Frozen | Change trip status (complete = admin+) |
| GET | `/v1/admin/wallets/:ownerType/:ownerId` | admin+ | Frozen | Wallet by owner |
| GET | `/v1/admin/wallets/:walletId/transactions` | admin+ | Frozen | Wallet transactions |
| POST | `/v1/admin/wallets/:walletId/freeze` | admin+ | Frozen | Freeze or unfreeze wallet |
| GET | `/v1/admin/users` | admin+ | Frozen | Search users |
| GET | `/v1/admin/users/:id` | admin+ | Frozen | User detail |
| PATCH | `/v1/admin/users/:id/suspend` | admin+ | Frozen | Suspend or activate |
| POST | `/v1/admin/users/:id/force-delete` | super_admin | Frozen | Force delete (legal erasure) |
| GET | `/v1/admin/incidents` | officer+ | Frozen | Incident queue |
| GET | `/v1/admin/incidents/:id` | officer+ | Frozen | Incident detail |
| PATCH | `/v1/admin/incidents/:id/verify` | officer+ | Frozen | Verify or reject incident |
| DELETE | `/v1/admin/incidents/:id` | officer+ | Frozen | Delete incident |
| GET | `/v1/admin/markers` | officer+ | Frozen | Marker list |
| POST | `/v1/admin/markers` | officer+ | Frozen | Place marker |
| GET | `/v1/admin/markers/csv-template` | officer+ | Frozen | CSV import template |
| POST | `/v1/admin/markers/bulk-import` | officer+ | Frozen | Bulk import markers |
| GET | `/v1/admin/markers/:id` | officer+ | Frozen | Marker detail |
| PATCH | `/v1/admin/markers/:id` | officer+ | Frozen | Update marker |
| DELETE | `/v1/admin/markers/:id` | officer+ | Frozen | Remove marker |
| GET | `/v1/admin/organizations` | admin+ | Frozen | Organization list |
| PATCH | `/v1/admin/organizations/:id/verify` | admin+ | Frozen | Verify organization |
| GET | `/v1/admin/emergencies` | officer+ | Frozen | Emergency queue |
| GET | `/v1/admin/emergencies/:id` | officer+ | Frozen | Emergency detail |
| GET | `/v1/admin/emergencies/:id/audio/url` | officer+ | Frozen | Evidence playback URL |
| PATCH | `/v1/admin/emergencies/:id` | officer+ | Frozen | Resolve or update emergency |
| GET | `/v1/admin/escalations` | officer+ | Frozen | Escalation list |
| POST | `/v1/admin/escalations` | officer+ | Frozen | Create escalation |
| PATCH | `/v1/admin/escalations/:id` | officer+ | Frozen | Update escalation |
| GET | `/v1/admin/checkins` | officer+ | Frozen | Check-in list |
| POST | `/v1/admin/checkins` | officer+ | Frozen | Log check-in |
| PATCH | `/v1/admin/checkins/:id` | officer+ | Frozen | Update check-in |
| GET | `/v1/admin/messages/unread-count` | officer+ | Frozen | Unread message count |
| GET | `/v1/admin/role-upgrades` | admin+ | Frozen | Role upgrade queue |
| PATCH | `/v1/admin/role-upgrades/:id` | admin+ | Frozen | Approve or reject |
| GET | `/v1/admin/subscriptions` | admin+ | Frozen | Subscription requests |
| PATCH | `/v1/admin/subscriptions/:id/approve` | admin+ | Frozen | Approve subscription |
| PATCH | `/v1/admin/subscriptions/:id/reject` | admin+ | Frozen | Reject subscription |
| GET | `/v1/admin/account-deletions` | admin+ | Frozen | Deletion queue |
| POST | `/v1/admin/account-deletions/:id/override` | super_admin | Frozen | Override hold or force |
| GET | `/v1/admin/leads` | admin+ | Frozen | Marketing leads |
| PATCH | `/v1/admin/leads/:id` | admin+ | Frozen | Triage a lead |

## Core contract details

### C-001 — POST /v1/auth/token-exchange
Status: Frozen
Description: Exchange a sign-in provider token for a SafePass session.
Auth: none (rate-limited 10/min).

Request:
```json
{ "firebaseIdToken": "string" }
```
Response 200:
```json
{
  "accessToken": "string",
  "refreshToken": "string",
  "user": { "id": "string", "role": "string", "phone": "string|null", "fullName": "string" }
}
```
Errors: 401 (invalid sign-in token).

### C-002 — POST /v1/auth/refresh
Status: Frozen
Description: Issue a new token pair from a valid refresh token.
Auth: none.

Request:
```json
{ "refreshToken": "string" }
```
Response 200: `{ "accessToken": "string", "refreshToken": "string" }`
Errors: 401 (invalid or expired refresh token).

### C-003 — POST /v1/leads
Status: Frozen
Description: Marketing lead intake from the landing site. Shape per `lead.schema.ts` in `@safepass/shared`.
Auth: service key (anonymous visitor).
Request: `LeadSubmission` per docs/SafePassLanding/schema.md (submissionId, leadType, sourcePage, submittedAt, contact and type-specific fields).
Response 201: `{ "id": "string", "status": "new" }`
Errors: 400 (validation), 409 (duplicate submissionId reconciled to the existing lead).
Note: the landing site never stores leads; this endpoint is the system of record.

### C-004 — POST /v1/trips
Status: Frozen
Description: Create a trip in draft state with the unified journey form data.
Auth: user.
Request:
```json
{
  "origin": { "name": "string", "lat": "number", "lng": "number" },
  "destination": { "name": "string", "lat": "number", "lng": "number" },
  "transportCompany": "string|null",
  "vehiclePlateNumber": "string|null",
  "vehicleDescription": "string|null",
  "scheduledDeparture": "date|null"
}
```
Response 201: `{ "id": "string", "status": "draft", "routePolyline": "string|null" }`
Errors: 400 (validation), 401.

### C-005 — POST /v1/trips/start
Status: Frozen
Description: Begin monitoring. Individual travellers are charged the monitoring fee from their wallet; active org members start covered.
Auth: user.
Request: `{ "tripId": "string" }`
Response 200: `{ "tripId": "string", "status": "active", "coveredByOrg": "boolean", "balanceAfter": "number|null" }`
Errors: 400, 402 (insufficient wallet balance), 409 (trip already started or another trip active).

### C-006 — POST /v1/trips/:tripId/gps
Status: Frozen
Description: Report a GPS position during an active trip. Writes the live-state entry and, on significant change, a sampled history point.
Auth: user (trip owner).
Request: `{ "lat": "number", "lng": "number", "speed": "number|null", "heading": "number|null", "recordedAt": "date" }`
Response 200: `{ "received": true, "arrived": "boolean" }`
Errors: 400, 404 (trip not found or not active).

### C-007 — POST /v1/trips/:tripId/complete · POST /v1/trips/:tripId/cancel
Status: Frozen
Description: End the trip. Completion writes the trip summary archive; both terminal states disable messaging.
Auth: user (trip owner).
Response 200: `{ "tripId": "string", "status": "completed|cancelled" }`
Errors: 409 (invalid state transition).

### C-008 — GET /v1/wallets/me · GET /v1/wallets/me/transactions
Status: Frozen
Description: Own wallet balance and transaction history.
Auth: user.
Response 200 (wallet): `{ "id": "string", "balance": "number", "currency": "NGN" }`
Response 200 (transactions): `{ "transactions": [{ "id": "string", "type": "string", "amount": "number", "balanceAfter": "number", "description": "string|null", "createdAt": "date" }] }`

### C-009 — POST /v1/payments/initialize
Status: Frozen
Description: Initialize a wallet top-up at the payment gateway.
Auth: user.
Request: `{ "amount": "number", "ownerType": "user|organization", "ownerId": "string" }`
Response 200: `{ "reference": "string", "checkoutUrl": "string" }`
Errors: 400 (amount below minimum).

### C-010 — POST /v1/emergency/trigger
Status: Frozen
Description: Raise an emergency for a trip (panic flow) and start evidence capture.
Auth: user (trip owner).
Request: `{ "tripId": "string", "triggerType": "panic_button" }`
Response 201: `{ "emergencyId": "string", "status": "active" }`
Errors: 400, 404.

### C-011 — POST /v1/emergency/:id/audio
Status: Frozen
Description: Upload one finished audio chunk; appends to the emergency's recording URLs.
Auth: user (trip owner).
Request: multipart audio file.
Response 200: `{ "chunkIndex": "number", "url": "string" }`
Errors: 400, 404.

### C-012 — POST /v1/messages · POST /v1/trips/:tripId/messages
Status: Frozen
Description: Send a journey-scoped message. Blocked on terminal trips.
Auth: user, officer, or admin (sender role in the body).
Request: `{ "tripId": "string", "content": "string" }`
Response 201: `{ "id": "string", "senderRole": "string", "createdAt": "date" }`
Errors: 422 (trip ended), 400.

### C-013 — POST /v1/incidents
Status: Frozen
Description: Report an incident. Enters the verification queue; never appears on the map unverified.
Auth: user.
Request:
```json
{
  "incidentType": "string",
  "location": { "lat": "number", "lng": "number" },
  "description": "string",
  "tripId": "string|null",
  "photoUrl": "string|null"
}
```
Response 201: `{ "id": "string", "verificationStatus": "unverified" }`
Errors: 400.

### C-014 — GET /v1/markers/nearby · POST /v1/markers/:id/interact
Status: Frozen
Description: Markers near a point for route alerts; user interactions that move verification state.
Auth: user.
Request (nearby): `{ "lat": "number", "lng": "number", "radiusMeters": "number" }`
Request (interact): `{ "action": "confirm|dispute_not_there|reclassify_police|reclassify_suspicious" }`
Response 200 (nearby): `{ "markers": [{ "id", "markerType", "lat", "lng", "title", "severity", "verificationStatus" }] }`
Response 200 (interact): `{ "markerId": "string", "verificationStatus": "string", "verificationWeight": "number" }`

### C-015 — POST /v1/org/join/resolve · POST /v1/org/join
Status: Frozen
Description: Resolve an invite token to its org, then join with consent.
Auth: user.
Request (resolve): `{ "token": "string" }`
Request (join): `{ "token": "string", "consent": true }`
Response 200 (resolve): `{ "organization": { "id", "name", "type" } }`
Response 201 (join): `{ "slotId": "string", "organizationId": "string" }`
Errors: 400 (expired, used, or invalid token), 409 (already in an org).

## Change process

A change to any Frozen contract is a change request: update this file to `Frozen (revision N)`, re-dispatch the owning backend and frontend slices, and re-verify. The shared Zod schemas in `@safepass/shared` must be updated in the same change.