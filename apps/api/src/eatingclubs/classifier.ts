/**
 * LLM-based classifier for eating club events.
 *
 * Uses Gemini Flash Lite via OpenRouter to determine if a WHITMANWIRE
 * email is about an eating club event, and if so, which club.
 */

export interface EatingClub {
  name: string;
  aliases: string[];
  lat: number;
  lng: number;
  sprite: string;
}

export const EATING_CLUBS: EatingClub[] = [
  { name: "Tiger Inn", aliases: ["ti", "tiger inn", "tiger"], lat: 40.3490, lng: -74.6523, sprite: "tiger-inn" },
  { name: "Ivy Club", aliases: ["ivy", "ivy club"], lat: 40.3482, lng: -74.6522, sprite: "ivy" },
  { name: "Cottage Club", aliases: ["cottage", "cottage club", "ucc"], lat: 40.3483, lng: -74.6517, sprite: "cottage" },
  { name: "Cap and Gown", aliases: ["cap", "cap and gown", "cap & gown", "cng"], lat: 40.3483, lng: -74.6510, sprite: "cap-and-gown" },
  { name: "Colonial Club", aliases: ["colonial", "colonial club"], lat: 40.3489, lng: -74.6528, sprite: "colonial" },
  { name: "Terrace Club", aliases: ["terrace", "terrace club", "tfc", "terrace f club"], lat: 40.3472, lng: -74.6539, sprite: "terrace" },
  { name: "Tower Club", aliases: ["tower", "tower club", "ptc", "princeton tower club"], lat: 40.3477, lng: -74.6540, sprite: "tower" },
  { name: "Quadrangle Club", aliases: ["quad", "quadrangle", "quadrangle club"], lat: 40.3480, lng: -74.6527, sprite: "quadrangle" },
  { name: "Charter Club", aliases: ["charter", "charter club", "pcc"], lat: 40.3488, lng: -74.6500, sprite: "charter" },
  { name: "Cloister Inn", aliases: ["cloister", "cloister inn"], lat: 40.3486, lng: -74.6506, sprite: "cloister" },
  { name: "Cannon Dial Elm", aliases: ["cannon", "cannon dial elm", "cde", "dial elm"], lat: 40.3478, lng: -74.6534, sprite: "cannon-dial-elm" },
];

const CLUB_NAMES = EATING_CLUBS.map((c) => c.name).join(", ");

/** Keywords that suggest an email might be about an eating club event. */
const EC_KEYWORDS = [
  "tiger inn", " ti ", "ivy club", "cottage", "cap and gown", "cap & gown",
  "colonial club", "terrace", "tower club", "quadrangle", " quad ",
  "charter", "cloister", "cannon", "dial elm", "eating club",
  "puid", "list party", "open party", "bicker", "prospect ave",
  "the street", "lawnparties", "lawn parties", "tap night",
  "[ti]", "[tfc]", "[ptc]", "[quad]", "[pcc]", "[cde]",
  "@ tiger", "@ ivy", "@ cottage", "@ cap", "@ colonial",
  "@ terrace", "@ tower", "@ quad", "@ charter", "@ cloister", "@ cannon",
];

/** Quick keyword pre-filter to avoid unnecessary LLM calls. */
export function mightBeEatingClubEvent(subject: string, bodyText: string): boolean {
  const text = ` ${subject} ${bodyText.slice(0, 500)} `.toLowerCase();
  return EC_KEYWORDS.some((kw) => text.includes(kw));
}

export interface ClassificationResult {
  isEatingClubEvent: boolean;
  clubName: string | null;
  eventType: string | null;
}

const SYSTEM_PROMPT = `You classify Princeton University emails as eating club events.

Eating clubs are social/dining clubs on Prospect Avenue. Events include: PUID parties, LIST parties, open parties, tap nights, bicker events, lawnparties, band nights, themed parties, formals, study breaks, and club-specific social events.

NOT eating club events: academic talks, club sports, student org meetings, selling tickets, lost & found, job postings, performances (unless AT an eating club).

Eating clubs: ${CLUB_NAMES}

Common abbreviations: TI=Tiger Inn, TFC=Terrace Club, PTC=Tower Club, UCC=Cottage, CNG=Cap and Gown, PCC=Charter, CDE=Cannon Dial Elm

Respond in this exact format (nothing else):
EVENT: yes or no
CLUB: exact club name from the list above, or NONE
TYPE: party/tap-night/bicker/lawnparties/social/other, or NONE`;

/**
 * Classify an email using Gemini Flash Lite.
 * Returns null if the API is unavailable.
 */
export async function classifyEmail(
  subject: string,
  bodyText: string,
): Promise<ClassificationResult | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-lite-001";
  const truncated = bodyText.split("-----")[0].trim().slice(0, 400);

  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Subject: ${subject}\n\n${truncated}` },
        ],
        max_tokens: 80,
        temperature: 0,
      }),
    });

    if (!resp.ok) {
      console.error(`[eatingclubs] LLM API error: ${resp.status}`);
      return null;
    }

    const data = (await resp.json()) as any;
    const answer = data.choices?.[0]?.message?.content?.trim() || "";

    const eventMatch = answer.match(/EVENT:\s*(yes|no)/i);
    const clubMatch = answer.match(/CLUB:\s*(.+)/i);
    const typeMatch = answer.match(/TYPE:\s*(.+)/i);

    const isEvent = eventMatch?.[1]?.toLowerCase() === "yes";
    const clubRaw = clubMatch?.[1]?.trim();
    const typeRaw = typeMatch?.[1]?.trim();

    if (!isEvent) return { isEatingClubEvent: false, clubName: null, eventType: null };

    // Resolve club name to canonical name
    const club = resolveClub(clubRaw || "");

    return {
      isEatingClubEvent: true,
      clubName: club?.name ?? null,
      eventType: typeRaw === "NONE" ? null : typeRaw ?? null,
    };
  } catch (err: any) {
    console.error(`[eatingclubs] LLM call failed: ${err.message}`);
    return null;
  }
}

/** Resolve a raw club name/alias to the canonical EatingClub entry. */
export function resolveClub(raw: string): EatingClub | null {
  const lower = raw.toLowerCase().trim();
  if (!lower || lower === "none") return null;
  return (
    EATING_CLUBS.find((c) => c.name.toLowerCase() === lower) ??
    EATING_CLUBS.find((c) => c.aliases.some((a) => a === lower)) ??
    EATING_CLUBS.find((c) => lower.includes(c.name.toLowerCase())) ??
    null
  );
}
