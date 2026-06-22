export type HeaderMap =
  | Record<string, string | string[] | undefined>
  | { get(name: string): string | null };

export type VisitorRequestContext = {
  ipAddress?: string | null;
  path: string;
  method?: string | null;
  userAgent?: string | null;
  acceptLanguage?: string | null;
  referer?: string | null;
  country?: string | null;
  city?: string | null;
};

export type BotDetectionResult = {
  isBot: boolean;
  botReason: string | null;
};

export type VisitorAudience = "human" | "bot" | "all";