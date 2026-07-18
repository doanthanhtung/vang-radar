import { PRODUCT_CODES } from "@vang-radar/domain";
import type { Metadata } from "next";

export const SITE_NAME = "VangScore";
export const DEFAULT_SITE_URL = "https://vangscore.com";
export const DEFAULT_DESCRIPTION =
  "Theo dõi giá vàng Việt Nam, premium, spread, VangScore và các chỉ số thị trường được cập nhật liên tục.";

const OG_IMAGE_PATH = "/dashboard-gold.png";

export function getSiteUrl(): string {
  const configured = process.env.PUBLIC_WEB_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (!configured) return DEFAULT_SITE_URL;

  const primary = configured
    .split(",")
    .map((url) => url.trim())
    .find(Boolean);

  return (primary ?? DEFAULT_SITE_URL).replace(/\/$/, "");
}

export function absoluteUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalized, `${getSiteUrl()}/`).toString();
}

export function getPublicSitemapEntries(): Array<{ path: string }> {
  return [
    { path: "/" },
    { path: "/alerts" },
    ...PRODUCT_CODES.map((code) => ({
      path: `/gold/${code}`
    }))
  ];
}

export function createPageMetadata({
  title,
  description,
  path,
  imageAlt = SITE_NAME
}: {
  title: string;
  description: string;
  path: string;
  imageAlt?: string;
}): Metadata {
  const canonical = absoluteUrl(path);

  return {
    title,
    description,
    alternates: {
      canonical
    },
    openGraph: {
      type: "website",
      locale: "vi_VN",
      url: canonical,
      siteName: SITE_NAME,
      title,
      description,
      images: [
        {
          url: OG_IMAGE_PATH,
          alt: imageAlt
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [OG_IMAGE_PATH]
    }
  };
}

export const rootMetadata: Metadata = {
  metadataBase: new URL(`${getSiteUrl()}/`),
  title: {
    default: `${SITE_NAME} | Dữ liệu và chỉ số giá vàng Việt Nam`,
    template: `%s | ${SITE_NAME}`
  },
  description: DEFAULT_DESCRIPTION,
  alternates: {
    canonical: "/"
  },
  openGraph: {
    type: "website",
    locale: "vi_VN",
    url: "/",
    siteName: SITE_NAME,
    title: `${SITE_NAME} | Dữ liệu và chỉ số giá vàng Việt Nam`,
    description: DEFAULT_DESCRIPTION,
    images: [
      {
        url: OG_IMAGE_PATH,
        alt: SITE_NAME
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | Dữ liệu và chỉ số giá vàng Việt Nam`,
    description: DEFAULT_DESCRIPTION,
    images: [OG_IMAGE_PATH]
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1
    }
  },
  icons: {
    icon: OG_IMAGE_PATH
  }
};

export const adminMetadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false
    }
  }
};
