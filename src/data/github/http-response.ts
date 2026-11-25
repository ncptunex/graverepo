// The minimal response shape the error mapping and the section adapters read.
// The transport's full raw-response format (task 7.1) extends this.

export type HttpResponseLike = {
  readonly status: number;
  /** Response headers with lowercase names. */
  readonly headers: Readonly<Record<string, string>>;
  /** Parsed JSON body. Ignored when `bodyParseFailed` is true. */
  readonly body: unknown;
  /** True when the body was not valid JSON. */
  readonly bodyParseFailed?: boolean;
};

export function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}
