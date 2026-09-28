import type { ReactNode } from "react";

import { CONTACT_URL, TextLink } from "./site";

export const LEGAL_EFFECTIVE_DATE = "September 28, 2026";

/** Shared shell for the legal pages: title, effective date, then long-form sections. */
export const LegalPage = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <main id="main" className="wrap pt-page-top max-w-[680px]">
    <h1 className="font-book text-5xl leading-none tracking-tight md:text-6xl">
      {title}
    </h1>
    <p className="text-muted-foreground mt-5 text-sm">
      Effective {LEGAL_EFFECTIVE_DATE}
    </p>
    <article className="text-muted-foreground [&_h2]:text-foreground [&_a]:text-brand leading-letter [&_p]:leading-letter [&_strong]:text-foreground mt-10 text-base [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:leading-tight [&_h2]:font-medium [&_h2]:tracking-tight [&_li]:mb-2 [&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6">
      {children}
    </article>
  </main>
);

/** The contact line every legal page ends with. */
export const LegalContact = () => (
  <>
    <h2>Contact</h2>
    <p>
      Questions, data requests, or concerns can go to Jake Bodea through the
      contact page below.
    </p>
    <p>
      <TextLink href={CONTACT_URL}>Contact Jake</TextLink>
    </p>
  </>
);

/** A plain anchor: marketing pages navigate by full document load. */
export const PrivacyLink = () => <a href="/privacy">Privacy Policy</a>;
