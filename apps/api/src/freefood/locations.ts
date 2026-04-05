/**
 * LLM-based location matching for FREEFOOD emails.
 *
 * Uses Gemini Flash Lite via OpenRouter to extract the building/location
 * from an email subject + body, then resolves coordinates from a curated
 * campus location list.
 */

import type { Database } from "bun:sqlite";

export interface CampusLocation {
  name: string;
  lat: number;
  lng: number;
}

/** Curated list of Princeton campus locations commonly referenced in freefood emails. */
export const CAMPUS_LOCATIONS: CampusLocation[] = [
  // ── Academic buildings ──────────────────────────────
  { name: "Friend Center", lat: 40.3503, lng: -74.6528 },
  { name: "Corwin Hall", lat: 40.3490, lng: -74.6541 },
  { name: "Robertson Hall", lat: 40.3484, lng: -74.6547 },
  { name: "McCosh Hall", lat: 40.3483, lng: -74.6565 },
  { name: "Nassau Hall", lat: 40.3487, lng: -74.6593 },
  { name: "Morrison Hall", lat: 40.3480, lng: -74.6597 },
  { name: "Marx Hall", lat: 40.3482, lng: -74.6559 },
  { name: "Wallace Hall", lat: 40.3495, lng: -74.6531 },
  { name: "Bowen Hall", lat: 40.3495, lng: -74.6503 },
  { name: "Jadwin Hall", lat: 40.3449, lng: -74.6518 },
  { name: "Fine Hall", lat: 40.3458, lng: -74.6523 },
  { name: "Peyton Hall", lat: 40.3462, lng: -74.6519 },
  { name: "McDonnell Hall", lat: 40.3454, lng: -74.6531 },
  { name: "Green Hall", lat: 40.3489, lng: -74.6578 },
  { name: "Dickinson Hall", lat: 40.3494, lng: -74.6565 },
  { name: "Woolworth", lat: 40.3473, lng: -74.6558 },
  { name: "Alexander Hall", lat: 40.3481, lng: -74.6609 },
  { name: "Scheide Caldwell House", lat: 40.3494, lng: -74.6585 },
  { name: "Bendheim House", lat: 40.3488, lng: -74.6535 },
  { name: "Palmer House", lat: 40.3490, lng: -74.6643 },
  { name: "Architecture Building", lat: 40.3479, lng: -74.6563 },
  { name: "Prospect House", lat: 40.3471, lng: -74.6566 },
  { name: "Lewis Library", lat: 40.3462, lng: -74.6527 },
  { name: "Firestone Library", lat: 40.3495, lng: -74.6573 },
  { name: "Mudd Library", lat: 40.3496, lng: -74.6520 },
  { name: "Stokes Library", lat: 40.3493, lng: -74.6536 },
  { name: "Chancellor Green", lat: 40.3491, lng: -74.6586 },
  { name: "Maclean House", lat: 40.3491, lng: -74.6602 },
  { name: "Henry House", lat: 40.3495, lng: -74.6590 },
  { name: "Carl A. Fields Center", lat: 40.3492, lng: -74.6517 },
  { name: "Little Hall", lat: 40.3465, lng: -74.6590 },
  { name: "Spelman Hall", lat: 40.3450, lng: -74.6594 },
  { name: "Community Hall", lat: 40.3442, lng: -74.6576 },
  { name: "Lewis Center for the Arts", lat: 40.3507, lng: -74.6547 },
  { name: "Olden House", lat: 40.3511, lng: -74.6524 },

  // ── Engineering Quad ───────────────────────────────
  { name: "Engineering Quadrangle (EQuad)", lat: 40.3506, lng: -74.6510 },
  { name: "EQuad Cafe", lat: 40.3505, lng: -74.6514 },
  { name: "Equad E-Wing", lat: 40.3498, lng: -74.6511 },
  { name: "Equad G-Wing", lat: 40.3505, lng: -74.6498 },
  { name: "Keller Center", lat: 40.3504, lng: -74.6507 },
  { name: "Computer Science Building (CS)", lat: 40.3503, lng: -74.6528 },

  // ── Frist & Student Life ───────────────────────────
  { name: "Frist Campus Center", lat: 40.3467, lng: -74.6551 },
  { name: "Murray-Dodge Hall", lat: 40.3480, lng: -74.6577 },
  { name: "PACE Center", lat: 40.3467, lng: -74.6552 },
  { name: "Davis International Center", lat: 40.3493, lng: -74.6549 },
  { name: "Center for Jewish Life", lat: 40.3467, lng: -74.6536 },
  { name: "Paul Robeson Center", lat: 40.3521, lng: -74.6611 },

  // ── Residential Colleges ───────────────────────────
  { name: "Butler College", lat: 40.3441, lng: -74.6561 },
  { name: "Forbes College", lat: 40.3424, lng: -74.6611 },
  { name: "Mathey College", lat: 40.3477, lng: -74.6617 },
  { name: "Rockefeller College", lat: 40.3486, lng: -74.6617 },
  { name: "Whitman College", lat: 40.3438, lng: -74.6579 },
  { name: "Yeh College", lat: 40.3421, lng: -74.6542 },
  { name: "New College West", lat: 40.3419, lng: -74.6553 },
  { name: "Hobson College", lat: 40.3453, lng: -74.6566 },
  { name: "Graduate College", lat: 40.3412, lng: -74.6656 },
  { name: "Lakeside Apartments", lat: 40.3380, lng: -74.6545 },

  // ── Dining Halls ───────────────────────────────────
  { name: "Butler Dining Hall (Wilcox)", lat: 40.3441, lng: -74.6561 },
  { name: "Forbes Dining Hall", lat: 40.3422, lng: -74.6612 },
  { name: "Mathey Dining Hall", lat: 40.3481, lng: -74.6622 },
  { name: "Rockefeller Dining Hall (Madison)", lat: 40.3485, lng: -74.6622 },
  { name: "Whitman Dining Hall", lat: 40.3442, lng: -74.6576 },
  { name: "Yeh Dining Hall (Choi)", lat: 40.3422, lng: -74.6540 },
  { name: "Graduate College Dining Hall", lat: 40.3408, lng: -74.6654 },
  { name: "Center for Jewish Life Dining Hall", lat: 40.3467, lng: -74.6536 },
  { name: "Lakeside Dining (Commons)", lat: 40.3380, lng: -74.6545 },

  // ── Eating Clubs ───────────────────────────────────
  { name: "Cap and Gown", lat: 40.3483, lng: -74.6510 },
  { name: "Charter Club", lat: 40.3488, lng: -74.6500 },
  { name: "Cloister Inn", lat: 40.3486, lng: -74.6506 },
  { name: "Colonial Club", lat: 40.3489, lng: -74.6528 },
  { name: "Cottage Club", lat: 40.3483, lng: -74.6517 },
  { name: "Ivy Club", lat: 40.3482, lng: -74.6522 },
  { name: "Quadrangle Club", lat: 40.3480, lng: -74.6527 },
  { name: "Terrace Club", lat: 40.3472, lng: -74.6539 },
  { name: "Tiger Inn", lat: 40.3490, lng: -74.6523 },
  { name: "Tower Club", lat: 40.3477, lng: -74.6540 },
  { name: "Cannon Dial Elm", lat: 40.3478, lng: -74.6534 },

  // ── Missing academic buildings ──────────────────────
  { name: "East Pyne Hall", lat: 40.3490, lng: -74.6587 },
  { name: "West College", lat: 40.3484, lng: -74.6597 },
  { name: "Julis Romo Rabinowitz Building (JRR)", lat: 40.3488, lng: -74.6535 },
  { name: "Whig Hall", lat: 40.3483, lng: -74.6580 },
  { name: "Clio Hall", lat: 40.3487, lng: -74.6580 },
  { name: "Icahn Laboratory", lat: 40.3451, lng: -74.6502 },
  { name: "McGraw Hall", lat: 40.3476, lng: -74.6563 },
  { name: "Louis A. Simpson International Building", lat: 40.3484, lng: -74.6550 },
  { name: "Bien Hall", lat: 40.3496, lng: -74.6506 },
  { name: "Briger Hall", lat: 40.3498, lng: -74.6509 },
  { name: "Meadows Commons", lat: 40.3389, lng: -74.6447 },
  { name: "Palmer Square", lat: 40.3498, lng: -74.6607 },
  { name: "Schultz Laboratory", lat: 40.3448, lng: -74.6510 },
  { name: "Thomas Laboratory", lat: 40.3454, lng: -74.6506 },
  { name: "Guyot Hall", lat: 40.3462, lng: -74.6547 },
  { name: "McCormick Hall", lat: 40.3478, lng: -74.6570 },
  { name: "Aaron Burr Hall", lat: 40.3502, lng: -74.6566 },
  { name: "Broadmead Street", lat: 40.3480, lng: -74.6450 },

  // ── Other common spots ─────────────────────────────
  { name: "Wawa", lat: 40.3500, lng: -74.6603 },
  { name: "McCarter Theatre", lat: 40.3442, lng: -74.6606 },
  { name: "Arts Tower", lat: 40.3427, lng: -74.6597 },
  { name: "Baker Hall", lat: 40.3434, lng: -74.6582 },
  { name: "Blair Hall", lat: 40.3478, lng: -74.6607 },
  { name: "Holder Hall", lat: 40.3479, lng: -74.6599 },
  { name: "Dod Hall", lat: 40.3485, lng: -74.6591 },
  { name: "Brown Hall", lat: 40.3484, lng: -74.6584 },
  { name: "Witherspoon Hall", lat: 40.3476, lng: -74.6582 },
  { name: "Edwards Hall", lat: 40.3478, lng: -74.6577 },
  { name: "1901 Hall", lat: 40.3482, lng: -74.6571 },
  { name: "Cuyler Hall", lat: 40.3478, lng: -74.6572 },
  { name: "Patton Hall", lat: 40.3479, lng: -74.6566 },
  { name: "Pyne Hall", lat: 40.3490, lng: -74.6607 },
  { name: "Joline Hall", lat: 40.3481, lng: -74.6615 },
  { name: "Campbell Hall", lat: 40.3479, lng: -74.6622 },
  { name: "Wendell Hall", lat: 40.3474, lng: -74.6620 },
  { name: "Scully Hall", lat: 40.3438, lng: -74.6590 },
  { name: "Fisher Hall", lat: 40.3435, lng: -74.6575 },
  { name: "Lauritzen Hall", lat: 40.3438, lng: -74.6569 },
  { name: "Hargadon Hall", lat: 40.3432, lng: -74.6583 },
  { name: "Wendell B.", lat: 40.3472, lng: -74.6623 },
  { name: "26 Prospect Avenue", lat: 40.3479, lng: -74.6548 },
  { name: "SPIA (School of Public and International Affairs)", lat: 40.3484, lng: -74.6547 },

  // ── Backfill: commonly referenced but previously missing ──
  { name: "Campus Club", lat: 40.3487, lng: -74.6495 },
  { name: "Maeder Hall", lat: 40.3505, lng: -74.6514 },
  { name: "Lewis Arts Complex (LAS)", lat: 40.3507, lng: -74.6547 },
  { name: "Sherrerd Hall", lat: 40.3502, lng: -74.6520 },
  { name: "Bloomberg Hall", lat: 40.3499, lng: -74.6519 },
  { name: "Peretsman Scully Hall (PSH)", lat: 40.3449, lng: -74.6527 },
  { name: "Princeton Neuroscience Institute (PNI)", lat: 40.3449, lng: -74.6527 },
  { name: "Frick Chemistry Lab", lat: 40.3460, lng: -74.6510 },
  { name: "Andlinger Center", lat: 40.3491, lng: -74.6586 },
  { name: "Sonia Sotomayor Hall", lat: 40.3471, lng: -74.6615 },
  { name: "Jones Hall", lat: 40.3492, lng: -74.6544 },
  { name: "Kanji Hall", lat: 40.3421, lng: -74.6542 },
  { name: "EBCAO (Edwards-Brown-Cuyler-Adams-Ott)", lat: 40.3478, lng: -74.6575 },
  { name: "Drapkin Studio", lat: 40.3507, lng: -74.6547 },
  { name: "Brush Gallery", lat: 40.3507, lng: -74.6547 },
  { name: "Studio 34", lat: 40.3507, lng: -74.6547 },
  { name: "U-Store Courtyard", lat: 40.3487, lng: -74.6600 },
  { name: "CampusRec Lobby", lat: 40.3453, lng: -74.6582 },
  { name: "Fu Hall", lat: 40.3496, lng: -74.6506 },
  { name: "Old Graduate College (OGC)", lat: 40.3407, lng: -74.6651 },
  { name: "RoMa Theatre", lat: 40.3486, lng: -74.6617 },
  { name: "Poe Field", lat: 40.3445, lng: -74.6478 },
  { name: "Addy Lounge", lat: 40.3425, lng: -74.6552 },
  { name: "New South", lat: 40.3419, lng: -74.6553 },
  { name: "LTL (Lewis Thomas Lab)", lat: 40.3454, lng: -74.6506 },
  { name: "McLain Pavilion", lat: 40.3452, lng: -74.6552 },
];

/** Build the location list string for the LLM prompt. */
function locationListStr(): string {
  return CAMPUS_LOCATIONS.map((l) => l.name).join("\n");
}

const SYSTEM_PROMPT = `You are a location extractor for Princeton University free food emails.

Given a free food email (subject + body), identify which Princeton campus building or location the food is available at.

RULES:
- Respond with ONLY the exact location name from the list below — nothing else.
- If the email mentions a food brand (Tacoria, Olives, Domino's, etc.) that is being SERVED at a campus building, return the CAMPUS BUILDING, not the restaurant name.
- "CS" or "CS building" = "Computer Science Building (CS)" (same as Friend Center)
- "EQuad" = "Engineering Quadrangle (EQuad)"
- "Murray Dodge" = "Murray-Dodge Hall"
- "SPIA" = "SPIA (School of Public and International Affairs)" (same building as Robertson Hall)
- "Prospect" or "26 Prospect" = "26 Prospect Avenue"
- "Rocky" = "Rockefeller College"
- "Caf" or "the caf" = "Lakeside Dining (Commons)"
- "JRR" = "Julis Romo Rabinowitz Building (JRR)"
- "East Pyne" or "Pyne" (without "Hall") = "East Pyne Hall"
- "Icahn" = "Icahn Laboratory"
- "Simpson" (building context) = "Louis A. Simpson International Building"
- "Briger" = "Briger Hall"
- "Bien" = "Bien Hall"
- "McGraw" = "McGraw Hall"
- "Whig" = "Whig Hall"
- "Meadows" = "Meadows Commons"
- "Campus Club" = "Campus Club"
- "LAS" or "Lewis Arts" = "Lewis Arts Complex (LAS)"
- "PSH" = "Peretsman Scully Hall (PSH)"
- "PNI" = "Princeton Neuroscience Institute (PNI)"
- "Frick" or "Frick atrium" = "Frick Chemistry Lab"
- "OGC" = "Old Graduate College (OGC)"
- "EBCAO" = "EBCAO (Edwards-Brown-Cuyler-Adams-Ott)"
- "Maeder" = "Maeder Hall"
- "Bloomberg" = "Bloomberg Hall"
- "Jones" (building context) = "Jones Hall"
- "Kanji" = "Kanji Hall"
- "LTL" = "LTL (Lewis Thomas Lab)"
- "Fu Hall" = "Fu Hall"
- "CAF" or "caf" followed by a room number = "Lakeside Dining (Commons)"
- "New South" = "New South"
- "Sherrerd" = "Sherrerd Hall"
- If you truly cannot determine the location, respond with exactly: UNKNOWN

Known locations:
${locationListStr()}`;

/** Look up coordinates for a location name returned by the LLM. */
function resolveLocation(name: string): CampusLocation | null {
  const lower = name.toLowerCase().trim();
  return (
    CAMPUS_LOCATIONS.find((l) => l.name.toLowerCase() === lower) ??
    CAMPUS_LOCATIONS.find((l) => lower.includes(l.name.toLowerCase())) ??
    null
  );
}

/**
 * Call Gemini Flash Lite via OpenRouter to extract the location from an email.
 * Returns null if the location can't be determined or API is unavailable.
 */
async function callLLM(subject: string, bodyText: string): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-lite-001";
  const truncatedBody = bodyText.split("-----")[0].trim().slice(0, 400);

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
          { role: "user", content: `Subject: ${subject}\n\n${truncatedBody}` },
        ],
        max_tokens: 60,
        temperature: 0,
      }),
    });

    if (!resp.ok) {
      console.error(`[freefood] LLM API error: ${resp.status}`);
      return null;
    }

    const data = (await resp.json()) as any;
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer || answer === "UNKNOWN") return null;
    return answer;
  } catch (err: any) {
    console.error(`[freefood] LLM call failed: ${err.message}`);
    return null;
  }
}

/**
 * Match locations for all unmatched freefood emails using the LLM.
 * Processes in batches to avoid rate limits.
 */
export async function matchLocations(freefoodDb: Database): Promise<number> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.log("[freefood] Skipping LLM location matching (OPENROUTER_API_KEY not set)");
    return 0;
  }

  // Get emails that don't have a location yet
  const unmatched = freefoodDb
    .prepare(
      `SELECT id, subject, body_text FROM freefood_emails
       WHERE location_name IS NULL
       ORDER BY date DESC`,
    )
    .all() as { id: number; subject: string; body_text: string }[];

  if (unmatched.length === 0) return 0;

  console.log(`[freefood] Matching locations for ${unmatched.length} emails via LLM...`);

  const updateStmt = freefoodDb.prepare(
    `UPDATE freefood_emails SET location_name = ?, location_lat = ?, location_lng = ? WHERE id = ?`,
  );
  const markUnknown = freefoodDb.prepare(
    `UPDATE freefood_emails SET location_name = 'UNKNOWN' WHERE id = ?`,
  );

  let matched = 0;
  for (const email of unmatched) {
    const locationName = await callLLM(email.subject, email.body_text || "");

    if (locationName) {
      const loc = resolveLocation(locationName);
      if (loc) {
        updateStmt.run(loc.name, loc.lat, loc.lng, email.id);
        matched++;
      } else {
        // LLM returned a name we don't recognize — store it but no coordinates
        markUnknown.run(email.id);
      }
    } else {
      markUnknown.run(email.id);
    }

    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`[freefood] Matched ${matched}/${unmatched.length} emails to locations`);
  return matched;
}
