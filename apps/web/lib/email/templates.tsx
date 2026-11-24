// Branded emails (owner, 24 Nov 2026): one shared layout for every email, sign-in codes included.
// Navy header with the logo as styled text (owner, 24 Nov 2026: Outlook, PAU's mail, blocks pictures from new
// senders, so a picture logo showed as a broken icon), white body, one navy button, light footer. Arial
// stack (web fonts don't load in most email apps), 560px wide. Each email: a few short lines, one button.
import { Body, Button, Container, Head, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

export const SITE = "https://askyourslides.com";
export const TEAM = "The AskYourSlides Team";
const NAVY = "#0e1664";
const FONT = "Arial, Helvetica, sans-serif";
const LOGO_FONT = "Georgia, 'Times New Roman', serif";

const text = { fontFamily: FONT, fontSize: "16px", lineHeight: "24px", color: "#191919", margin: "0 0 16px" } as const;

const MOBILE_CSS = `
  @media only screen and (max-width: 600px) {
    .body-pad { padding: 28px 22px !important; }
  }
`;

export function Layout({ preview, children, unsubscribeUrl }: { preview: string; children: ReactNode; unsubscribeUrl?: string }) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style>{MOBILE_CSS}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#f3f5fc", margin: 0, padding: "24px 0", fontFamily: FONT }}>
        <Container style={{ maxWidth: "560px", width: "100%", margin: "0 auto", backgroundColor: "#ffffff", borderRadius: "16px", overflow: "hidden" }}>
          <Section style={{ backgroundColor: NAVY, padding: "20px 32px" }}>
            {/* The logo in text: always visible, even where pictures are blocked. The sparkle is a text
                character (not an emoji); Georgia stands in for the site's Bitter, which mail apps don't load. */}
            <Link href={`${SITE}/?ref=email-logo`} style={{ textDecoration: "none", fontFamily: LOGO_FONT, fontSize: "26px", lineHeight: "32px", fontWeight: 700, letterSpacing: "-0.3px" }}>
              <span style={{ color: "#ffffff", fontFamily: FONT, fontSize: "24px", marginRight: "10px" }}>&#10022;</span>
              <span style={{ color: "#ffffff" }}>AskYour</span>
              <span style={{ color: "#5ea3ed" }}>Slides</span>
            </Link>
          </Section>
          <Section className="body-pad" style={{ padding: "32px 36px 28px" }}>
            {children}
            <Text style={{ ...text, margin: "24px 0 0" }}>{`— ${TEAM}`}</Text>
          </Section>
          <Hr style={{ borderColor: "#e3e8f0", margin: 0 }} />
          <Section style={{ backgroundColor: "#f5f8fc", padding: "18px 36px" }}>
            <Text style={{ fontFamily: FONT, fontSize: "12px", lineHeight: "18px", color: "#5f6673", margin: 0 }}>
              For PAU students · <Link href={SITE} style={{ color: "#5f6673", textDecoration: "underline" }}>askyourslides.com</Link>
              {unsubscribeUrl && (
                <>
                  {" · "}
                  <Link href={unsubscribeUrl} style={{ color: "#5f6673", textDecoration: "underline" }}>
                    Unsubscribe
                  </Link>
                </>
              )}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

function Cta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Section style={{ margin: "8px 0 4px" }}>
      <Button
        href={href}
        style={{ backgroundColor: NAVY, color: "#ffffff", fontFamily: FONT, fontSize: "16px", fontWeight: 600, borderRadius: "999px", padding: "14px 28px", textDecoration: "none", display: "inline-block" }}
      >
        {children}
      </Button>
    </Section>
  );
}

const hi = (name: string | null) => (name ? `Hi ${name},` : "Hi,");

// ── The emails ──────────────────────────────────────────────────────────────────────────────────

export function SignInEmail({ code }: { code: string }) {
  return (
    <Layout preview={`Your sign-in code is ${code}`}>
      <Text style={text}>Here is your code to sign in to AskYourSlides:</Text>
      <Text style={{ fontFamily: FONT, fontSize: "34px", lineHeight: "40px", fontWeight: 700, letterSpacing: "6px", color: NAVY, backgroundColor: "#f3f5fc", borderRadius: "12px", padding: "14px 0", textAlign: "center", margin: "0 0 16px" }}>
        {code}
      </Text>
      <Text style={text}>Type it on the sign-in page. It expires soon, so use it now.</Text>
      <Text style={{ ...text, fontSize: "14px", color: "#5f6673" }}>Didn&apos;t ask for this? You can ignore this email.</Text>
    </Layout>
  );
}

export function WelcomeEmail({ name, url, unsubscribeUrl }: { name: string | null; url: string; unsubscribeUrl: string }) {
  return (
    <Layout preview="All your lecture slides are loaded. Ask your first question." unsubscribeUrl={unsubscribeUrl}>
      <Text style={text}>{hi(name)}</Text>
      <Text style={text}>All your course slides are already loaded on AskYourSlides.</Text>
      <Text style={text}>Ask any question about a lecture and get a clear answer, with the exact slide it came from.</Text>
      <Cta href={url}>Open my courses</Cta>
    </Layout>
  );
}

export function PastQuestionsEmail({ name, course, url, unsubscribeUrl }: { name: string | null; course: string; url: string; unsubscribeUrl: string }) {
  return (
    <Layout preview={`Past questions are live for ${course}.`} unsubscribeUrl={unsubscribeUrl}>
      <Text style={text}>{hi(name)}</Text>
      <Text style={text}>Past questions for {course} are now on AskYourSlides, with worked answers from your slides.</Text>
      <Text style={text}>A good way to see what your exam may ask.</Text>
      <Cta href={url}>Practise past questions</Cta>
    </Layout>
  );
}

export function NewSlidesEmail({ name, course, url, unsubscribeUrl }: { name: string | null; course: string; url: string; unsubscribeUrl: string }) {
  return (
    <Layout preview={`New slides in ${course}.`} unsubscribeUrl={unsubscribeUrl}>
      <Text style={text}>{hi(name)}</Text>
      <Text style={text}>New lecture slides were added to {course}.</Text>
      <Text style={text}>Ask about them now and get them explained, slide by slide.</Text>
      <Cta href={url}>Open the course</Cta>
    </Layout>
  );
}
