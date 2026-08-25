export const productionSiteUrl = "https://selfmali.vercel.app";

function normalizeSiteUrl(value: string) {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProtocol.endsWith("/") ? withProtocol : `${withProtocol}/`;
}

function isLegacySitesUrl(value: string) {
  try {
    return new URL(normalizeSiteUrl(value)).hostname.endsWith(".chatgpt.site");
  } catch {
    return false;
  }
}

export function getSiteUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configuredUrl && !isLegacySitesUrl(configuredUrl)) {
    return normalizeSiteUrl(configuredUrl);
  }

  return normalizeSiteUrl(productionSiteUrl);
}

export function getAuthRedirectUrl() {
  if (typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    return normalizeSiteUrl(window.location.origin);
  }

  return getSiteUrl();
}
