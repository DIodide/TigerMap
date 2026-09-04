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
  {
    name: "Tiger Inn",
    aliases: ["ti", "tiger inn", "tiger"],
    lat: 40.349,
    lng: -74.6523,
    sprite: "tiger-inn",
  },
  { name: "Ivy Club", aliases: ["ivy", "ivy club"], lat: 40.3482, lng: -74.6522, sprite: "ivy" },
  {
    name: "Cottage Club",
    aliases: ["cottage", "cottage club", "ucc"],
    lat: 40.3483,
    lng: -74.6517,
    sprite: "cottage",
  },
  {
    name: "Cap and Gown",
    aliases: ["cap", "cap and gown", "cap & gown", "cng"],
    lat: 40.3483,
    lng: -74.651,
    sprite: "cap-and-gown",
  },
  {
    name: "Colonial Club",
    aliases: ["colonial", "colonial club", "colo"],
    lat: 40.3489,
    lng: -74.6528,
    sprite: "colonial",
  },
  {
    name: "Terrace Club",
    aliases: ["terrace", "terrace club", "tfc", "terrace f club"],
    lat: 40.3472,
    lng: -74.6539,
    sprite: "terrace",
  },
  {
    name: "Tower Club",
    aliases: ["tower", "tower club", "ptc", "princeton tower club"],
    lat: 40.3477,
    lng: -74.654,
    sprite: "tower",
  },
  {
    name: "Quadrangle Club",
    aliases: ["quad", "quadrangle", "quadrangle club"],
    lat: 40.348,
    lng: -74.6527,
    sprite: "quadrangle",
  },
  {
    name: "Charter Club",
    aliases: ["charter", "charter club", "pcc"],
    lat: 40.3488,
    lng: -74.65,
    sprite: "charter",
  },
  {
    name: "Cloister Inn",
    aliases: ["cloister", "cloister inn"],
    lat: 40.3486,
    lng: -74.6506,
    sprite: "cloister",
  },
  {
    name: "Cannon Dial Elm",
    aliases: ["cannon", "cannon dial elm", "cde", "dial elm"],
    lat: 40.3478,
    lng: -74.6534,
    sprite: "cannon-dial-elm",
  },
];

/** Street addresses — emails often name the venue only by address. */
const CLUB_ADDRESSES = `Cannon Dial Elm — 21 Prospect Ave (CDE)
Cap and Gown — 61 Prospect Ave (CNG, Cap)
Charter Club — 79 Prospect Ave (PCC)
Cloister Inn — 65 Prospect Ave
Colonial Club — 40 Prospect Ave (Colo)
Cottage Club — 51 Prospect Ave (UCC)
Ivy Club — 43 Prospect Ave
Quadrangle Club — 33 Prospect Ave (Quad)
Terrace Club — 62 Washington Rd (TFC)
Tiger Inn — 48 Prospect Ave (TI)
Tower Club — 13 Prospect Ave (PTC)`;

export interface ClassificationResult {
  isEatingClubEvent: boolean;
  clubName: string | null;
  eventType: string | null;
}

const SYSTEM_PROMPT = `You classify Princeton University emails as eating club events.

Eating clubs are social/dining clubs on Prospect Avenue. Events include: PUID parties, LIST parties, open parties, tap nights, bicker and pre-bicker events, lawnparties, band nights, themed parties, formals, study breaks, member dinners, trivia nights, street week events, and other club-hosted socials.

An email counts when the event is hosted by or held at one of the eleven clubs below — whether the club is named directly, by nickname or abbreviation, or only by its street address.

NOT eating club events: academic talks, club sports, student org meetings, selling tickets, lost & found, job postings, performances (unless AT an eating club), and anything not tied to one of these clubs.

Clubs and addresses:
${CLUB_ADDRESSES}

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

  const model = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash-lite";
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
      eventType: typeRaw === "NONE" ? null : (typeRaw ?? null),
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
