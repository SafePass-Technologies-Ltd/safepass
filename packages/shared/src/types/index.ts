// API-specific types inferred from shared schemas (not re-exported by default)
// These are provided here for convenience when using schemas directly.

import type {
  User,
  UserCreate,
  UserUpdate,
  UserRole,
  EmergencyContact,
  AuthProvider,
} from '../schemas/user.schema';

import type {
  UserVehicle,
  UserVehicleCreate,
  UserVehicleUpdate,
  VehicleType,
} from '../schemas/user-vehicle.schema';

import type {
  Trip,
  TripCreate,
  TripStatus,
  TripGpsUpdate,
} from '../schemas/trip.schema';

import type { Payment, PaymentStatus } from '../schemas/payment.schema';

import type {
  Wallet,
  WalletTransaction,
  WalletFund,
} from '../schemas/wallet.schema';

import type { Message, MessageCreate } from '../schemas/message.schema';

import type { Incident, IncidentCreate, IncidentType } from '../schemas/incident.schema';

import type {
  MapMarker,
  MapMarkerCreate,
} from '../schemas/map-marker.schema';

import type {
  MapMarkerInteraction,
  MapMarkerInteractionCreate,
} from '../schemas/map-marker-interaction.schema';

import type { EmergencyEvent, EmergencyTrigger } from '../schemas/emergency-event.schema';

import type { Escalation, EscalationCreate } from '../schemas/escalation.schema';

import type { CheckIn, CheckInCreate } from '../schemas/checkin.schema';

import type { Organization } from '../schemas/organization.schema';

import type { TransportVehicle, TransportVehicleCreate } from '../schemas/vehicle.schema';

import type { Driver, DriverCreate } from '../schemas/driver.schema';

import type { Document } from '../schemas/document.schema';

export type {
  User,
  UserCreate,
  UserUpdate,
  UserRole,
  EmergencyContact,
  AuthProvider,
  UserVehicle,
  UserVehicleCreate,
  UserVehicleUpdate,
  VehicleType,
  Trip,
  TripCreate,
  TripStatus,
  TripGpsUpdate,
  Payment,
  PaymentStatus,
  Wallet,
  WalletTransaction,
  WalletFund,
  Message,
  MessageCreate,
  Incident,
  IncidentCreate,
  IncidentType,
  MapMarker,
  MapMarkerCreate,
  MapMarkerInteraction,
  MapMarkerInteractionCreate,
  EmergencyEvent,
  EmergencyTrigger,
  Escalation,
  EscalationCreate,
  CheckIn,
  CheckInCreate,
  Organization,
  TransportVehicle,
  TransportVehicleCreate,
  Driver,
  DriverCreate,
  Document,
};
