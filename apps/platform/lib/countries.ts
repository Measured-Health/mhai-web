// Countries as core takes them: an assigned ISO 3166-1 alpha-2 code. The
// form shows names and sends the code; a hospital's page shows the name.

/** Every assigned ISO 3166-1 alpha-2 code (249). */
const CODES = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ " +
  "BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ " +
  "DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY " +
  "HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY " +
  "MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ " +
  "NA NC NE NF NG NI NL NO NP NR NU NZ OM " +
  "PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ " +
  "TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ " +
  "VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");
const ASSIGNED: ReadonlySet<string> = new Set(CODES);

/** The country most hospitals here are in: listed first, and the default. */
export const DEFAULT_COUNTRY = "NG";

/** The code upper-cased if it is an assigned one, else null. */
export function countryCode(v: string): string | null {
  const c = v.trim().toUpperCase();
  return ASSIGNED.has(c) ? c : null;
}

let names: Intl.DisplayNames | null | undefined;
/** "Nigeria" for "NG"; the code itself when the browser has no name for it. */
export function countryName(code: string): string {
  if (names === undefined) {
    try {
      names = new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      names = null;
    }
  }
  try {
    return names?.of(code) ?? code;
  } catch {
    return code;
  }
}

export type Country = { code: string; name: string };
let all: Country[] | undefined;
/** Every country: the default first, then the rest by name. */
export function countries(): Country[] {
  if (!all) {
    const rest = CODES.filter((c) => c !== DEFAULT_COUNTRY)
      .map((code) => ({ code, name: countryName(code) }))
      .sort((a, b) => a.name.localeCompare(b.name, "en"));
    all = [
      { code: DEFAULT_COUNTRY, name: countryName(DEFAULT_COUNTRY) },
      ...rest,
    ];
  }
  return all;
}

const fold = (t: string) =>
  t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
/** The countries whose name contains the text, or whose code is it. */
export function matchCountries(text: string): Country[] {
  const q = fold(text);
  if (!q) return countries();
  return countries().filter(
    (c) => fold(c.name).includes(q) || c.code.toLowerCase() === q,
  );
}
