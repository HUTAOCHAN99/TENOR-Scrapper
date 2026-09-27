export type TenorMediaType = "image/gif" | "video/mp4" | "video/webm" | "unknown";

export interface TenorResult {
  id: string;
  title: string;
  pageUrl: string;
  mediaUrl: string;
  previewUrl: string;
  mediaType: TenorMediaType;
  width: number;
  height: number;
  source: "tenor";
}

export type TenorErrorCode =
  | "TENOR_UNAVAILABLE"
  | "SCRAPE_TIMEOUT"
  | "NO_RESULTS"
  | "INVALID_QUERY"
  | "MEDIA_PARSE_FAILED"
  | "RATE_LIMITED";

export class TenorError extends Error {
  code: TenorErrorCode;

  constructor(code: TenorErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "TenorError";
  }
}
