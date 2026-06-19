type JsonLdType = "WebSite" | "WebPage" | "Article" | "BlogPosting" | "CreativeWork" | "BreadcrumbList" | "Organization";

interface JsonLdBase {
  "@context": "https://schema.org";
  "@type": JsonLdType;
  [key: string]: unknown;
}

export function buildWebSiteSchema(name: string, url: string): JsonLdBase {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    url,
  };
}

export function buildWebPageSchema(opts: {
  url: string;
  title: string;
  description?: string;
  siteName?: string;
  image?: string;
  datePublished?: Date | null;
  dateModified?: Date | null;
}): JsonLdBase {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    url: opts.url,
    name: opts.title,
    ...(opts.description ? { description: opts.description } : {}),
    ...(opts.siteName ? { isPartOf: { "@type": "WebSite", name: opts.siteName } } : {}),
    ...(opts.image ? { image: opts.image } : {}),
    ...(opts.datePublished ? { datePublished: opts.datePublished.toISOString() } : {}),
    ...(opts.dateModified ? { dateModified: opts.dateModified.toISOString() } : {}),
  };
}

export function buildBreadcrumbSchema(items: { name: string; url: string }[]): JsonLdBase {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function buildOrganizationSchema(opts: {
  name: string;
  url: string;
  logo?: string;
  sameAs?: string[];
}): JsonLdBase {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: opts.name,
    url: opts.url,
    ...(opts.logo ? { logo: opts.logo } : {}),
    ...(opts.sameAs?.length ? { sameAs: opts.sameAs } : {}),
  };
}

export function buildArticleSchema(opts: {
  url: string;
  title: string;
  description?: string;
  image?: string;
  datePublished?: Date | null;
  dateModified?: Date | null;
  authorName?: string;
  publisherName?: string;
}): JsonLdBase {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    url: opts.url,
    headline: opts.title,
    ...(opts.description ? { description: opts.description } : {}),
    ...(opts.image ? { image: opts.image } : {}),
    ...(opts.datePublished ? { datePublished: opts.datePublished.toISOString() } : {}),
    ...(opts.dateModified ? { dateModified: opts.dateModified.toISOString() } : {}),
    ...(opts.authorName
      ? { author: { "@type": "Person", name: opts.authorName } }
      : {}),
    ...(opts.publisherName
      ? { publisher: { "@type": "Organization", name: opts.publisherName } }
      : {}),
  };
}
