import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Layout container — branding.md Section 8's Perspective & Scale.
 *
 * `content` (1200px) for standard sections; `prose` (800px) for the legal and
 * about pages, whose Standard Static Page Layout in screens.md specifies a
 * single ~800px column for article-style body copy.
 */
export function Container({
  children,
  className,
  width = 'content',
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  width?: 'content' | 'prose';
  as?: ElementType;
}) {
  return (
    <Tag
      className={cn(
        'mx-auto w-full px-md sm:px-xl',
        width === 'content' ? 'max-w-(--container-content)' : 'max-w-(--container-prose)',
        className
      )}
    >
      {children}
    </Tag>
  );
}

/**
 * Standard vertical section rhythm: `space-2xl` between unrelated sections on
 * mobile, `space-3xl` on desktop (branding.md 3.3).
 */
export function Section({
  children,
  className,
  id,
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  as?: ElementType;
}) {
  return (
    <Tag id={id} className={cn('py-2xl md:py-3xl', className)}>
      {children}
    </Tag>
  );
}
