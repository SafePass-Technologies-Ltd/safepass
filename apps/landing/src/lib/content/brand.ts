/**
 * Platform posture — the Road Journey Assurance Platform positioning.
 *
 * Client positioning statement (strategic direction): SafePass is not a tracker,
 * not a satnav, not even "a monitoring app". It is a Road Journey Assurance
 * Platform. The product is not tracking, GPS, or monitoring — it is *certainty*.
 *
 * To an individual that certainty means: "someone knows where I am and will act
 * if something goes wrong." To a business it means: "we can prove we fulfilled
 * our duty of care and know exactly what happened on every work journey."
 *
 * This is a PLAIN MODULE (no `'use client'`), so any Server Component can import
 * the position. Keep the category name in ONE place — the eyebrows on the three
 * audience pages and this hero positioning statement reference the same
 * category, so they cannot drift apart.
 */
export const PLATFORM_POSITION = {
  /**
   * The category SafePass owns in the market. Used verbatim as the homepage
   * hero eyebrow and (as "Road Journey Assurance — for …") the audience-page
   * eyebrows.
   */
  category: 'Road Journey Assurance Platform',
  /** The single-word promise the category stands for. */
  promise: 'certainty',
  /** One-sentence articulation, for the homepage and any shared framing line. */
  statement:
    'Every monitored journey is watched live by a SafePass officer, so you have certainty that someone knows where you are and will act if something goes wrong.',
  /**
   * The two-sided promise (individual vs business), used to keep the audience
   * pages telling the same story from their own angle.
   */
  promises: {
    individual:
      'Someone knows where I am and will act if something goes wrong.',
    business:
      'We can prove we fulfilled our duty of care and know exactly what happened on every work journey.',
  },
} as const;
