/**
 * Print-oriented route group.
 *
 * No Navbar, no Footer, no motion — these pages exist to be saved as a PDF or
 * printed and forwarded internally, so site chrome would only appear as noise
 * in the output. Kept as its own route group rather than a flag on `(site)`
 * because the absence of chrome IS the layout.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <main id="main">{children}</main>;
}
