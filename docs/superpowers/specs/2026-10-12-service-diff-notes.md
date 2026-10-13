# Service diff — reviewer notes (hand-written)

_Maintained by hand; `scripts/report-service-diff.js` appends this file to the generated `2026-10-12-service-diff.md` under "Reviewer notes"._

Decisions the tables encode that need a ruling (detail in `.superpowers/sdd/2026-10-12-network-coverage-and-matching/task-6-report.md`):

1. **Cambridge South.** OSM has the station (node 11336907005: operator Greater Anglia, `start_date=2026-06-28`), but no OSM route relation lists it as a stop yet. It is added from knowledge to the GA Liverpool Street–Cambridge stopper, the GN King's Cross–Cambridge stopper and King's Lynn service (trimmed), and Thameslink Cambridge–Brighton. Which of these call there?
2. **Southeastern rests mostly on knowledge.** OSM's Southeastern metro relations are sparse: the Greenwich line relation is empty and the Sidcup, Bexleyheath and Sevenoaks stoppers leave out intermediate stops. The knowledge-only list above holds every stop added this way.
3. **Southeastern via the Catford loop.** OSM relation 21622606 (Victoria–Gillingham, peak) calls at Crofton Park and Bellingham, which adds both to Southeastern. Keep these or drop them?
4. **How "Sevenoaks (both routes)" was cut.** Southeastern's Maidstone East trains are cut at Otford, and the Chatham main line at Swanley. That removes Longfield, Meopham and Kemsing.
5. **Southern removals: Earlswood, Salfords, Horley.** No Southern OSM relation calls at them now; Thameslink still serves them. Faygate and Ifield stay on Southern through a peak stopper that rests on knowledge alone.
6. **SWR.** The Hampton Court and Chessington OSM relations are incomplete, so those services come from knowledge. The Epsom-line services that rest on knowledge are Stoneleigh, and Ashtead, Leatherhead and Box Hill to Dorking. OSM relation 21260677 (the Woking stopper) tags one stop "Horsham"; it is read as Hersham.
7. **Names.**
   - Dorking: now "Dorking" in every table (user decision; see item 10).
   - The new station is "Garston (Herts)" (National Rail form; OSM has "Garston").
   - "Ashford (Surrey)" replaces "Ashford Platform 1/2".
   - "Ebbsfleet International (domestic)" is merged into "Ebbsfleet International".
   - St Pancras is named per line as in features.json: "St Pancras International" on Thameslink and Eurostar, "London St Pancras" on EMR and SE high speed.
8. **Greater Anglia Southend Victoria** is a knowledge-only service with no OSM relation. Romford appears only on the Chelmsford (Braintree) pattern, as OSM has it.
9. **Thameslink Rainham service (fix round 1).** It now follows OSM relations 15045723, 17541127, 17541241 and 17541242. It skips Woolwich Dockyard, Belvedere and Erith and calls at Plumstead and Slade Green. Those three stations stay on Southeastern only (Greenwich line).
10. **Dorking rename (user decision; Task 8 to do).** Every service table now uses the National Rail name "Dorking". **Task 8 must rename "Dorking Main" to "Dorking" in features.json and keep "Dorking Main" as an alternate name.** Until then the diff shows Dorking as to add and Dorking Main as to remove on Southern; on SWR, Dorking is simply to add. `'dorking'` has been removed from `ambiguous` in `aliases.ts`: Dorking Deepdene and Dorking West drop out of scope, so only one Dorking is left.
11. **St Margarets rename (user decision; Task 8 to do).** The tables use "St Margarets (London)" for SWR and "St Margarets (Herts)" for Greater Anglia. **Task 8 must apply these display names in features.json**, so each diff currently shows the new name as to add and "St Margarets" as to remove. `aliases.ts` now has the group `['St Margarets (London)', 'St Margarets (Herts)']` and the alias `'st margarets' → 'St Margarets (London)'`, so one guess lights both. Both entries do nothing until the rename, because aliases that point at missing stations are ignored.
12. **Peak-only calls count (user decision).** Any regular call counts, peak-only patterns included. Kept: Southeastern at Crofton Park and Bellingham (OSM 21622606/7), Gatwick Express peak calls at Burgess Hill, Hassocks and Preston Park, Southern at Faygate (knowledge-only service, renamed "London – Horsham peak stoppers via Faygate"), and Chiltern at Sudbury & Harrow Road. No in-scope peak call had been dropped on membership grounds: every removed station lies beyond its line's end stations, and Southern's Earlswood, Salfords and Horley have no Southern OSM relation at all. The OSM patterns earlier skipped as redundant subsets are now restored as services; the task-6 report lists them.
