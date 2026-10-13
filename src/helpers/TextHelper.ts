const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…"
};

const BREAKS = /<\s*(br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi;
const TAGS = /<\/?[a-z][^>]*>/gi;

const decode = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });

/**
 * WordPress/ACF titles can arrive with HTML in them ("Tom &amp; Jerry", "Faith<br>Hope",
 * "<em>First</em> Day"). The app shows plain text, so strip tags and decode entities.
 */
export const decodeEntities = (s?: string | null): string => {
  if (!s) return "";
  let out = s.replace(BREAKS, " ").replace(TAGS, "");
  out = decode(out);
  out = out.replace(BREAKS, " ").replace(TAGS, ""); // tags that were stored escaped (&lt;b&gt;)
  return out.replace(/\s+/g, " ").trim();
};

/** "2026-09-27" -> "Sep 27, 2026" (or "September 27, 2026"). Parsed by hand so no timezone shifts the day. */
export const formatScheduleDate = (ymd?: string | null, style: "short" | "long" = "short"): string => {
  if (!ymd) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(undefined, { month: style === "long" ? "long" : "short", day: "numeric", year: "numeric" });
};
