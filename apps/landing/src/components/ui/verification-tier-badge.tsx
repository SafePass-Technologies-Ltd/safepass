import { BadgeCheck, CircleHelp, ShieldQuestion, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { VerificationTier } from '@safepass/shared';
import { cn } from '@/lib/utils';

/**
 * Verification-Tier Badge — shared component per screens.md.
 *
 * Colour is NEVER the only signal. Each tier pairs a colour with a distinct
 * icon AND a text label, per branding.md Section 4's Color Independence rule,
 * which itself echoes the core product's verification-tier convention.
 *
 * That matters more here than on a typical badge: the entire purpose of this
 * component is to communicate how much a given safety claim can be trusted. A
 * colourblind visitor who can't distinguish "Verified" from "Disputed" is
 * being misinformed about safety data, not merely inconvenienced.
 */

interface TierPresentation {
  label: string;
  icon: LucideIcon;
  classes: string;
}

const TIERS: Record<VerificationTier, TierPresentation> = {
  verified: {
    label: 'Verified',
    icon: BadgeCheck,
    classes: 'bg-success/10 text-success border-success/30',
  },
  partially_confirmed: {
    label: 'Partially Confirmed',
    icon: ShieldQuestion,
    classes: 'bg-warning/10 text-warning border-warning/30',
  },
  unverified: {
    label: 'Unverified',
    icon: CircleHelp,
    classes: 'bg-surface-secondary text-text-secondary border-border',
  },
  disputed: {
    label: 'Disputed',
    icon: TriangleAlert,
    classes: 'bg-warning/10 text-warning border-warning/30',
  },
};

export function VerificationTierBadge({
  tier,
  className,
}: {
  tier: VerificationTier;
  className?: string;
}) {
  const { label, icon: Icon, classes } = TIERS[tier];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-xs rounded-full border px-sm py-xs',
        'text-caption font-medium uppercase tracking-wide',
        classes,
        className
      )}
    >
      {/* Decorative: the adjacent text label already carries the meaning, so
          announcing the icon too would just make a screen reader repeat it. */}
      <Icon size={14} aria-hidden="true" strokeWidth={2} />
      {label}
    </span>
  );
}
