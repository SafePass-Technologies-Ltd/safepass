'use client';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Central GSAP setup.
 *
 * Every module imports gsap and ScrollTrigger FROM HERE, never directly from
 * the package. Plugin registration is global and idempotent-but-order-sensitive;
 * routing it through one module means a component can't forget to register
 * ScrollTrigger and fail only in production where its section happens to load
 * first.
 */

// `registerPlugin` is safe to call repeatedly, but guard on `window` so this
// module can also be imported from code paths that run during SSR.
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

export { gsap, ScrollTrigger };
