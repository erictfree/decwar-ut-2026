// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Verbatim player-facing strings, transcribed byte-for-byte from `MSG.MAC` (and the OCOND
 * condition strings from `WARMAC.MAC:2497–2503`). This text is PRODUCT and is reproduced
 * exactly (INSTRUCTIONS §11). Labels embed literal TABs (`\t`) and trailing spaces exactly as
 * the `asciz` strings do; the medium-format labels are padded to 7 columns.
 *
 * Line citations are `MSG.MAC:<line>`. Newlines (`crlf`) are emitted separately by the
 * renderer as `\r\n`, not embedded here.
 */

// ── command dispatch feedback ─────────────────────────────────────────────────────────────
export const AMBCOM = "Ambiguous command"; // MSG.MAC:7
export const UNKCOM = "Unknown command"; // MSG.MAC:372
export const FORHLP = " -- for help type HELP"; // MSG.MAC:92
export const SYNTAX = "%Syntax error"; // MSG.MAC:311

// ── prompt ──────────────────────────────────────────────────────────────────────────────
export const COMLIN = "Command: "; // MSG.MAC:38

// ── STATUS labels (long = *L, medium = *M) ─────────────────────────────────────────────────
export const STAT2L = "Stardate\t"; // MSG.MAC:292
export const STAT2M = "SDate  "; // MSG.MAC:293
export const STAT3L = "Shields\t        "; // MSG.MAC:294  (tab + 8 spaces)
export const STAT3M = "Shlds  "; // MSG.MAC:295
export const STAT05 = " units"; // MSG.MAC:296
export const STAT6L = "Location\t"; // MSG.MAC:297
export const STAT6M = "Loc    "; // MSG.MAC:298
export const STAT7L = "Condition\t"; // MSG.MAC:299
export const STAT7M = "Cond   "; // MSG.MAC:300
export const STAT8L = "Torpedoes\t"; // MSG.MAC:301
export const STAT8M = "Torps  "; // MSG.MAC:302
export const STAT9L = "Energy left\t"; // MSG.MAC:303
export const STAT9M = "Ener   "; // MSG.MAC:304
export const STA10L = "Damage\t\t"; // MSG.MAC:305  (two tabs)
export const STA10M = "Dam    "; // MSG.MAC:306
export const STAT11 = "damaged"; // MSG.MAC:307  (radio damaged)
export const RADIO1 = "Radio\t\t"; // MSG.MAC:249  (long, two tabs)
export const RADIO3 = "Radio  "; // MSG.MAC:251  (medium, two spaces)

// ── lobby / pre-game (SETMSG.MAC; embedded newlines map to CRLF at render) ─────────────────
export const STRTUP = "\r\nEnter HELp, PREgame, or blank\r\nline: "; // SETMSG.MAC:43
export const PGAME1 = "\r\nNow entering DECWAR Pre-game; type\r\nACtivate to enter game."; // :11
export const MAICOM = "This command unavailable in Pre-game "; // SETMSG.MAC:8 (trailing space)
export const SETU01 = "Sorry, but all ships are in use.\r\nI will start a new game."; // :15

// ── ENDGAM banner messages (MSG.MAC:54–66) ─────────────────────────────────────────────────
export const ENDGM0 = "THE WAR IS OVER!!"; // :54–55
export const ENDGM1 = "The entire known galaxy has been depopulated.\r\n\r\nBOTH sides lose!!"; // :56–58
export const ENDGM3 = "The Klingon Empire is VICTORIOUS!!"; // :59–60
export const ENDGM4 = "The Federation has successfully repelled the Klingon hordes!"; // :61–62
export const ENDGM5 = "Please proceed to the nearest Klingon slave planet."; // :63
export const ENDGM6 = "Congratulations.  Freedom again reigns the galaxy."; // :64
export const ENDGM7 = "The Empire salutes you.  Begin slave operations immediately."; // :65
export const ENDGM8 = "The Empire has fallen.  Initiate self-destruction procedure."; // :66
export const PG_PROMPT = "PG> "; // out2c('PG'); out2c('> ')  (SETUP.FOR:500)

// SETUP opt-in prompts (SETMSG.MAC:17–22)
export const SETU02 = "Regular or Tournament game? (Regular) "; // :17
export const SETU03 = "Tournament name or number: "; // :18
export const SETU04 = "\r\nIs the Romulan Empire involved in this conflict? (yes) "; // :19–20
export const SETU05 = "\r\nDo you want black holes? (no) "; // :21–22

// SETUP side-banner + side-prompt (SETMSG.MAC:33–42)
export const SETU16 = "\r\nCurrently there are "; // :33–34
export const SETU17 = "\r\nFederation ships and "; // :35–36
export const STU17A = "\r\nEmpire ships.\r\n"; // :37–39
export const SETU18 = "\r\nWhich side do you wish to join?\r\n(Federation or Empire) "; // :40–42

// SETUP ship-selection (SETMSG.MAC:23–32)
export const SETU11 = "\r\nYou will join the Federation."; // :23–24
export const SETU12 = "\r\nYou will join the Klingon Empire."; // :25–26
export const SETU13 = "\r\nThese vessels are available:"; // :27–28
export const SETU14 = "\r\nWhich vessel do you desire? "; // :29–30
export const SETU15 = "\r\nSorry, that vessel is being used."; // :31–32

// KILCHK reincarnation-countdown strings (SETMSG.MAC:3–7)
export const KILCH4 = "You are scheduled for reincarnation in "; // :3
export const KILCH5 = " minutes and "; // :4
export const KILCH6 = " seconds."; // :5
export const KILCH8 = "\r\nTime left:  "; // :6–7

// SETUP same-ship / defect prompts (literals in SETUP.FOR:330–355)
export const DEFECT_FED = "Sorry, Captain, but the Federation"; // SETUP.FOR:330
export const DEFECT_EMP = "Sorry, Captain, but the Empire"; // SETUP.FOR:331
export const DEFECT_FLEETCAP = "fleet is at capacity."; // SETUP.FOR:332
export const DEFECT_PROMPT = "Do you wish to defect? "; // SETUP.FOR:333
export const REASSIGN_PREFIX = "Sorry, Captain, but the "; // SETUP.FOR:345
export const REASSIGN_BEEN = "has been reassigned."; // SETUP.FOR:348
export const REASSIGN_PROMPT = "Do you wish to choose another ship? "; // SETUP.FOR:349

/**
 * Ship names by slot (DECWAR.FOR:488–506). 1-based: Federation 1–9, Empire ("Klingon") 10–18.
 * Index 0 unused. Product data — reproduced verbatim.
 */
export const SHIP_NAMES: readonly string[] = [
  "",
  "Excalibur", "Farragut", "Intrepid", "Lexington", "Nimitz",
  "Savannah", "Trenton", "Vulcan", "Yorktown", // Federation 1–9
  "Buzzard", "Cobra", "Demon", "Goblin", "Hawk",
  "Jackal", "Manta", "Panther", "Wolf", // Empire 10–18
];

// ── MOVE / IMPULSE / LOCATE (MSG.MAC; embedded newlines map to CRLF) ───────────────────────
export const WRPDAM = "Warp engines damaged."; // MSG.MAC:381
export const IMPDAM = "Impulse engines damaged."; // :95
export const MOVE1A = "Captain, the impulse engines won't take it.  "; // :131
export const MOVE1B = "Maximum speed warp 1."; // :132
export const MOVE2L = "Captain, our warp engines are damaged.  I can only give you warp 3."; // :133
export const MOVE2S = "Engines damaged, warp 3 max."; // :134
export const MOVE3L = "Engineering Officer:  The engines won't take it Captain.\r\nI can only give you warp "; // :135
export const MOVE3S = "Maximum warp "; // :137
export const MOVE5L = "Captain, our engines are overheating!"; // :138
export const MOVE5S = "Engines overheating."; // :139
export const MOVE06 = "EEEEERRRRRROOOOOOOMMMMMmmmmm!!\r\nCaptain, the engines suffered "; // :140
export const MOVE08 = " units of damage."; // :142
export const MOVE09 = "Captain, repairs will take approximately "; // :143 (followed by oflt(time,2) + STRDAT)
export const ENGOFF = "Engineering Officer:  "; // :77 (prefix to MOVE5L in LONG mode)
export const MOVE10 = '\r\nNavigation Officer:  "Collision averted, Captain!"'; // :144
export const ERROR1 = "ERROR detected by computer!!  You have attempted\r\nto use your present location."; // :85
export const ERROR2 = "ERROR!  Own location used!"; // :87
export const COORD1 = "Coordinates: "; // :39
export const DAMCOM = "Computer inoperative."; // :40
export const ERLOC1 = "Wrong number of coordinates specified."; // :78
export const ERLOC7 = "Non-numeric coordinate."; // :82
export const ERLOC8 = "X coordinate lies outside galaxy."; // :83
export const ERLOC9 = "Y coordinate lies outside galaxy."; // :84
export const NOSHIP = "Player not in game."; // :152
export const MAIN02 = "RUNS OUT OF ENERGY!!"; // :126
export const LIFDAM = "\r\nWARNING!!  Life Support damaged.\r\nReserves of "; // :101
export const STRDAT = " stardates."; // :308

// ── PHASER combat (MSG.MAC) ────────────────────────────────────────────────────────────────
export const PHACN0 = "Phasers critically damaged."; // MSG.MAC:196
export const PHACN1 = "Target out of range."; // :197
export const PHACN2 = "High speed shield control activated."; // :198
export const PHACN4 = "WARNING! WARNING!  PHASERS OVERHEATING."; // :200
export const PHACN5 = "********** CRACKLE! POP! SIZZLE! POOF! **********\r\nPHASERS DAMAGED."; // :201
export const PHACN7 = "\r\nPhaser control unable to lock on target, Captain."; // :203
export const PHACN8 = "\r\nWeapons Officer:  Improper energy consumption for phaser hit, Captain."; // :205
export const PHACN9 = "\r\nWeapons Officer:  Attempting to hit friendly object, Captain."; // :207

// ── TORPEDO combat (MSG.MAC) ───────────────────────────────────────────────────────────────
export const TORP00 = "Torpedo tubes critically damaged."; // MSG.MAC:341
export const TORP01 = "You have already used your supply of torpedoes!"; // :342
export const TORP02 = "Number in burst (1-3) and "; // :343
export const TORP03 = "Insufficient torpedoes for burst!"; // :344
export const TORP04 = "Torpedo "; // :345
export const TORP05 = " MISFIRES!"; // :346
export const TORP06 = "PHOTON TUBES DAMAGED!"; // :347
export const TORP07 = " torpedoes left."; // :348
export const TORMIS = "Weapons Officer:  Captain, torpedo "; // :340

// ── OUTHIT fragments (MSG.MAC) ─────────────────────────────────────────────────────────────
export const OUTH01 = "novas"; // :161  (iwhat=7 long — star goes nova)
export const OUTH02 = "makes"; // :162
export const OUTH03 = " unit "; // :163
export const OUTH04 = "hit on "; // :164  (iwhat=8 long — star damages someone)
export const OUTH05 = "torpedo hit on "; // :165
export const OUTH06 = "phaser hit on "; // :166
export const OUTH07 = "damaged "; // :167
export const OUTH08 = "dam "; // :168
export const OUTH09 = " displaced by blast into BLACK HOLE!"; // :169 (long — klflg=2 long)
export const OUTH10 = " -> BH"; // :170  (medium — klflg=2 short/medium)
export const OUTH12 = " lost "; // :171  (iwhat=4 long — torpedo missed)
export const OUTH13 = " miss "; // :172  (iwhat=4 medium — torpedo miss)
export const OUTH14 = " swallowed by black hole "; // :173 (iwhat=5 long)
export const OUTH15 = " gulp "; // :174  (iwhat=5 medium — into black hole)
export const OUTH16 = " is under attack, Captain."; // :175 (iwhat=9 long)
export const OUTH17 = " attacked"; // :176  (iwhat=9 medium)
export const OUTH18 = " has been destroyed, Captain."; // :177 (iwhat=10 long)
export const OUTH19 = " dead"; // :178  (iwhat=10 medium)
export const OUTH20 = "detected"; // :179  (iwhat=11 long — Romulan detected at ...)
export const OUTH21 = " transfers "; // :180  (iwhat=12 long: "<sender> transfers N units of energy to the <recv>")
export const OUTH22 = " units of energy to the "; // :181
export const OUTH23 = "\r\nTractor beam activated, Captain."; // :182 (leading newline)
export const OUTH24 = "Trac. Beam on"; // :184
export const OUTH25 = "\r\nTractor beam broken, Captain."; // :185 (leading newline)
export const OUTH26 = "Trac. Beam off"; // :187
export const OUTH27 = " neutralized by friendly object "; // :188
export const OUTH28 = " neutralized "; // :189
export const OUTH29 = "deflected T"; // :190
export const OUTH30 = "has torpedo deflected by "; // :191
export const OUTH31 = "Critical hit on starbase, shields down!"; // :192
export const OUTH32 = "Starbase attempts to re-establish shields using emergency power!"; // :193
export const OUTH33 = "Base shields RE-ESTABLISHED!!"; // :194
export const OUTH34 = "Base FAILS to re-establish shields........BOOM!! "; // :195
export const DISPLC = "displaced to "; // :46 (LONG displacement)
export const STAR02 = " UNAFFECTED by Photon Torpedo!"; // :291
export const DESTRY = "DESTROYED!!"; // :45
export const UNITS1 = " units"; // :371

/** Object names by class (MSG.MAC fedshp/empshp/…); used by ODISP/OUTHIT rendering. */
export const OBJ_NAMES: Record<number, string> = {
  1: "Federation ship",
  2: "Empire ship",
  3: "Federation base",
  4: "Empire base",
  5: "Romulan",
  6: "neutral planet",
  7: "Federation planet",
  8: "Empire planet",
  9: "Star",
};

/** Device mnemonics — `device(9)` BLOCK DATA "SH WA IM LS TO PH CO RA TR" (1-based). */
export const DEVICE_NAMES: readonly string[] = [
  "", "SH", "WA", "IM", "LS", "TO", "PH", "CO", "RA", "TR",
];

/** Medium-format device names (ODEV `meddev`, WARMAC.MAC:2456–2464; 1-based). */
export const DEVICE_MED: readonly string[] = [
  "", "Shields", "Warp", "Impulse", "Life Sup", "Torps", "Phasers", "Computer", "Radio", "Tractor",
];

/** Single-letter ship scan tags (names(i,3); 1-based: Fed 1–9, Empire 10–18). */
export const SHIP_TAGS: readonly string[] = [
  "", "E", "F", "I", "L", "N", "S", "T", "V", "Y", "B", "C", "D", "G", "H", "J", "M", "P", "W",
];

// ── TYPE / USERS (MSG.MAC) ─────────────────────────────────────────────────────────────────
export const TYPE01 = "\r\nDo you wish to see the OUTPUT or OPTION switches? "; // MSG.MAC:360
export const TYPE02 = "\r\nCurrent output switch settings:"; // :362
export const TYPE03 = "output format."; // :364
export const TYPE04 = "command prompt."; // :365
export const TYPE05 = "SCAN format."; // :366
export const TYPE06 = "Romulans are NOT in this game."; // :367
export const TYPE07 = "Black holes are NOT in this game."; // :368
export const TYPE08 = "coordinates are default for input."; // :369
export const TYPE09 = "coordinates are default for output."; // :370
export const AMBSWI = "\r\nAmbiguous switch for TYPE."; // :8
export const SHTFRM = "Short "; // :290
export const MEDFRM = "Medium "; // :127
export const LNGFRM = "Long "; // :104
export const BTHFRM = "Both "; // :11
export const NORMAL = "Normal "; // :150
export const INFORM = "Informative "; // :96
export const SET008 = "Terminal type:  "; // :274
export const SETU06 = "There are Romulans in this game."; // SETMSG/MSG:278
export const SETU07 = "There are Black holes in this game."; // :279
export const FEDERA = "Federation"; // :88
export const EMPIRE = "    Empire"; // :50
export const ROMULA = "  Romulans"; // :258
/** Version string. NOTE: the reconstruction prints the CompuServe "Version 2.3" residue (OQ
 * Q-LC-5 — the UT-original version string is unconfirmed; flag for reconciliation). */
export const DECVER = "[DECWAR Version 2.3, 20-Nov-81]"; // MSG.MAC:44 (CompuServe residue)
export const USERS1 = "Ship       Captain       Baud  User ID     TTY       Job"; // :375
export const USERS2 = "  Location"; // :376
export const USERS5 = "----"; // :380

// ── POINTS (MSG.MAC :209–247) ──────────────────────────────────────────────────────────────
export const POI03S = "Tot Pts  ";
export const POI03L = "Total points:     ";
export const POIN04 = "Incorrect input, POINTS aborted.";
export const POI05S = "Pts / Pl ";
export const POI05L = "Pts. / player:    ";
export const POI06S = "Pts / SD ";
export const POI06L = "Pts. / stardate:  ";
export const POI07S = "# of shps";
export const POI07L = "Number of ships:  ";
export const POI11S = "Dam E's  "; export const POI11L = "Damage to enemies ";
export const POI12S = "E's dest "; export const POI12L = "Enemies destroyed ";
export const POI13S = "Dam B's  "; export const POI13L = "Damage to bases   ";
export const POI14S = "@'s capt "; export const POI14L = "Planets captured  ";
export const POI15S = "B's built"; export const POI15L = "Bases built       ";
export const POI16S = "Dam ??'s "; export const POI16L = "Damage to Romulans";
export const POI17S = "*'s dest "; export const POI17L = "Stars destroyed   ";
export const POI18S = "@'s dest "; export const POI18L = "Planets destroyed ";
export const POIN19 = " (-100)"; export const POIN20 = " ( -50)";
export const POIN21 = " ( 100)"; export const POIN22 = " ( 500)";
export const POIN23 = " (1000)";

// ── LIST family (MSG.MAC) ──────────────────────────────────────────────────────────────────
export const INGAME = " in game"; // MSG.MAC:97
export const INRANG = " in range"; // :98
export const INSPRA = " in specified range"; // :99
export const KNOWN = " known"; // :100
export const LSTS01 = "Null group illegal"; // :105
export const LSTS02 = "Illegal keyword "; // :106
export const LSTS03 = "Syntax error near keyword "; // :107

// ── DAMAGES (MSG.MAC) ──────────────────────────────────────────────────────────────────────
export const ALLDOK = "All devices functional."; // MSG.MAC:6
export const DAMREP = "Damage Report for "; // :43
export const DMHDR1 = "Device    "; // :41
export const DMHDR2 = "Damage"; // :42

// ── RADIO / TELL / OUTMSG (MSG.MAC) ────────────────────────────────────────────────────────
export const RADIO0 = "Turn radio ON or OFF, GAG or UNGAG individual ship?  "; // MSG.MAC:248
export const RADIO2 = "Ship name:  "; // :250
export const RADGAG = "Radio gagged against "; // :252
export const RADOFF = "Radio turned off, Captain."; // :253
export const RADON0 = "Radio turned on, Captain."; // :254
export const RADUNG = "Radio ungagged against "; // :255
export const UNKSHP = "Unknown ship name."; // :373
export const MESS01 = "\r\nMessage from "; // :128
export const MESS02 = "to "; // :130
export const TELL01 = "\r\nSub-Space radio damaged."; // :312
export const TELL02 = "\r\nTo ship:  "; // :314
export const TELL03 = "\r\nUnrecognized player or group name:  "; // :316
export const TELL04 = "\r\nAmbiguous group name:  "; // :318
export const TELL05 = "\r\nSelf excluded from message."; // :320
export const TELL06 = "\r\nPlayer is not in the game:  "; // :322
export const TELL07 = "\r\nCommunications:  Captain, we cannot raise the "; // :324
export const TELL08 = "\r\nNo message sent."; // :326
export const TELL09 = "\r\nWake up, Captain, I just sent that message!"; // :328
export const MSG_PROMPT = "Msg: "; // MAKMSG body prompt (WARMAC)

/** The 7 standard message groups (SETUP order; FRIENDLY/ENEMY are relative to the player). */
export const GROUP_NAMES: readonly string[] = [
  "", "ALL", "KLINGON", "EMPIRE", "HUMAN", "FEDERATION", "FRIENDLY", "ENEMY",
];

// ── SET command (MSG.MAC:259–277) ──────────────────────────────────────────────────────────
export const SET001 = "\r\nName, Output, Ttytype, Prompt, Scans,\r\nInput or Output location defaults (ICDEF, OCDEF)? "; // :259
export const SET002 = "\r\nDesired name:  "; // :262
export const SET003 = "\r\nShort, Medium, or Long output? "; // :264
export const SET004 = "\r\nNormal or Informative command prompt? "; // :266
export const SET005 = "\r\nShort or Long scans? "; // :268
export const SET006 = "\r\nAbsolute or Relative default for location input? "; // :270
export const SET007 = "\r\nAbsolute, Relative, or Both for location output? "; // :272
// Keyword forms (SHTFRM/MEDFRM/LNGFRM/NORMAL/INFORM/BTHFRM are defined earlier; ABSFRM/RELFRM here).
export const ABSFRM = "Absolute "; // :5
export const RELFRM = "Relative "; // :256

// ── QUIT confirm + ^C-while-RED refusal (MSG.MAC:151, 309–310) ─────────────────────────────
export const SURE00 = "\r\nDo you really want to quit? "; // :309 (leading newline)
export const NOQUIT = "Use QUIT to terminate while under RED alert."; // :151

// ── TIME (MSG.MAC:330–339) ─────────────────────────────────────────────────────────────────
// (Each label includes a leading CRLF per source.)
export const TIME01 = "\r\nGame's elapsed time:  "; // :330
export const TIME02 = "\r\nShip's elapsed time:  "; // :332
export const TIME03 = "\r\nRun time in game:     "; // :334
export const TIME04 = "\r\nJob's total run time: "; // :336
export const TIME05 = "\r\nCurrent time of day:  "; // :338

// ── TRACTOR (MSG.MAC:349–357) ──────────────────────────────────────────────────────────────
export const TRACT1 = "Ship to apply tractor beam to:  "; // :349
export const TRACT2 = "Tractor beam not in operation at this time, Captain."; // :350
export const TRACT3 = "Tractor beam already active, Captain."; // :351
export const TRACT4 = "Beg your pardon, Captain?  You want to apply a tractor\r\nbeam to your own ship?"; // :352
export const TRACT5 = "Can not apply tractor beam to enemy ship."; // :354
export const TRACT6 = "already has tractor beam active."; // :355  (preceded by odisp of target)
export const TRACT7 = "Can not apply tractor beam through shields, Captain."; // :356
export const TRACT8 = "has his shields up.  Unable to apply tractor beam."; // :357  (preceded by odisp)

// ── ENERGY (MSG.MAC:67–76, 152, 10) ────────────────────────────────────────────────────────
export const BEGYRP = "Beg your pardon, Captain?  "; // :10
export const ENER1S = "Ship, energy: "; // :67
export const ENER1L = "Destination ship name and energy to transfer: "; // :68
export const ENERG2 = "Can not transfer energy to enemy ship."; // :69
export const ENERG3 = "Not adjacent to destination ship."; // :70
export const ENER4S = "Insufficient ship energy."; // :71
export const ENER4L = "Captain, our ship doesn't possess that much energy!"; // :72
export const ENERG5 = "Transfer aborted."; // :73
export const ENERG6 = "Energy transferred, Captain."; // :74
export const ENERG7 = "Transfer energy to US!?!"; // :75
export const ENERG8 = "Illegal energy transfer.  "; // :76
// NOSHIP is defined earlier in the file (:152) and reused.

// ── BUILD / CAPTURE (MSG.MAC:12–37, 148–160) ───────────────────────────────────────────────
export const BUILD1 = "builds planet "; // :12
export const BUILD2 = " into a "; // :13
export const BUILD3 = " build"; // :14 (followed by optional 's' for n>1)
export const BUILD4 = "\r\nAll "; // :15
export const BUILD5 = "s still functional, captain."; // :17
export const BUILD7 = "\r\nPlanet not yet captured."; // :18
export const CAPTU0 = "capturing "; // :20
export const CAPTU1 = "\r\n\r\nScience Officer:  Captain, that was a MOST illogical tactic."; // :21 (Fed death)
export const CAPTU2 = "\r\n\r\nFirst Officer:  Commander, because of your incompetence\r\nwe must suffer the shame of DEFEAT!!"; // :24 (Emp death)
export const CAPTU4 = "DESTROYED during capture of planet!!"; // :28
export const CAPTU5 = "not adjacent to planet."; // :29
export const CAPTU6 = "\r\nCaptain, are you feeling well?\r\nWe are orbiting a FEDERATION planet!"; // :30
export const CAPTU7 = "\r\nPlanet already captured, Captain."; // :33
export const CAPTU8 = "\r\nMESSAGE FROM PLANET:  Veer off you idiot!\r\nWe are ALREADY part of the Klingon Empire!"; // :35
export const NOPLNT = "\r\nNo planet at those coordinates, Captain."; // :148
export const NOSUR1 = "\r\nBut Captain, he's already on our side!"; // :153
export const NOSUR2 = "\r\nCaptain, the enemy refuses our surrender ultimatum!"; // :155
export const NOSUR3 = "\r\nCaptain, the Romulan refuses to surrender!"; // :157
export const NOSUR4 = "\r\nCapture THAT??  You have GOT to be kidding!!"; // :159

// ── DOCK (MSG.MAC:47–49) ───────────────────────────────────────────────────────────────────
export const DOCK01 = " not adjacent to base!!"; // :47 (leading space — comes after odisp ship marker)
export const DOCKIN = "\r\nDOCKED."; // :48 (leading newline)

// ── SHIELDS (MSG.MAC:280–289) ──────────────────────────────────────────────────────────────
export const SHLD01 = "Transfer, Up, Down  ? "; // :280
export const SHLD02 = "Units of energy to transfer to shields: "; // :281
export const SHLD03 = "Transferring all ship energy to shields.  Confirm? "; // :282
export const SHLD04 = "Energy NOT transferred."; // :283
export const SHLD05 = "Energy transferred, Captain."; // :284
export const SHLD06 = "Shields raised, Captain."; // :285
export const SHLD07 = "\r\nShield control uses remaining ship energy!"; // :286 (leading newline)
export const SHLD08 = "Shields lowered, Captain."; // :288
export const SHLD09 = "Captain, unable to raise shields due to critical damage."; // :289

// ── OCOND condition strings (WARMAC.MAC:2497–2503) ─────────────────────────────────────────
export const COND_LONG = ["Green", "Yellow", "Red"] as const; // index 0..2 == condition 1..3
export const COND_SHORT = ["G", "Y", "R"] as const;
export const DOCKED_LONG = "Docked+";
export const DOCKED_SHORT = "D+";
