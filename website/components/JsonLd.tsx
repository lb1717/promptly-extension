import { SITE } from "@/lib/constants";
import { absoluteUrl, DEFAULT_DESCRIPTION, getSiteUrl } from "@/lib/seo";

type Props = {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
};

export function JsonLd({ data }: Props) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function SiteJsonLd() {
  const siteUrl = getSiteUrl();
  const homeUrl = absoluteUrl("/");

  return (
    <JsonLd
      data={[
        {
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Promptly Labs",
          alternateName: ["Promptly", SITE.name],
          url: siteUrl,
          logo: absoluteUrl("/icon-512.png"),
          sameAs: [SITE.chromeStoreUrl]
        },
        {
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: SITE.name,
          alternateName: "Promptly Labs",
          url: homeUrl,
          description: DEFAULT_DESCRIPTION,
          publisher: { "@type": "Organization", name: "Promptly Labs", url: siteUrl }
        },
        {
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: SITE.name,
          applicationCategory: "BrowserApplication",
          operatingSystem: "Chrome, Edge, Firefox",
          description: DEFAULT_DESCRIPTION,
          url: homeUrl,
          downloadUrl: SITE.chromeStoreUrl,
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD"
          }
        }
      ]}
    />
  );
}

/** Product homepage — reinforces the main landing page for search engines. */
export function ProductPageJsonLd() {
  const homeUrl = absoluteUrl("/");

  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "WebPage",
        "@id": `${homeUrl}#webpage`,
        url: homeUrl,
        name: "Promptly — AI Prompt Improvement Extension",
        description: DEFAULT_DESCRIPTION,
        isPartOf: { "@type": "WebSite", url: getSiteUrl(), name: "Promptly" },
        about: {
          "@type": "SoftwareApplication",
          name: SITE.name,
          applicationCategory: "BrowserApplication",
          url: homeUrl,
          downloadUrl: SITE.chromeStoreUrl
        },
        primaryImageOfPage: absoluteUrl("/icon-512.png")
      }}
    />
  );
}

type FaqItem = { question: string; answer: string };

/** Marketing content pages with optional FAQ schema for richer indexing signals. */
export function ContentPageJsonLd({
  path,
  name,
  description,
  faqs
}: {
  path: string;
  name: string;
  description: string;
  faqs?: FaqItem[];
}) {
  const pageUrl = absoluteUrl(path);
  const graph: Array<Record<string, unknown>> = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": `${pageUrl}#webpage`,
      url: pageUrl,
      name,
      description,
      isPartOf: { "@type": "WebSite", url: getSiteUrl(), name: "Promptly" },
      primaryImageOfPage: absoluteUrl("/icon-512.png")
    }
  ];

  if (faqs?.length) {
    graph.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "@id": `${pageUrl}#faq`,
      url: pageUrl,
      mainEntity: faqs.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer
        }
      }))
    });
  }

  return <JsonLd data={graph} />;
}
