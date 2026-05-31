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

  return (
    <JsonLd
      data={[
        {
          "@context": "https://schema.org",
          "@type": "Organization",
          name: SITE.navBrand,
          alternateName: SITE.name,
          url: siteUrl,
          logo: absoluteUrl("/icon-512.png"),
          sameAs: [SITE.chromeStoreUrl]
        },
        {
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: SITE.navBrand,
          url: siteUrl,
          description: DEFAULT_DESCRIPTION
        },
        {
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: SITE.name,
          applicationCategory: "BrowserApplication",
          operatingSystem: "Chrome, Edge, Firefox",
          description: DEFAULT_DESCRIPTION,
          url: absoluteUrl("/product"),
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
