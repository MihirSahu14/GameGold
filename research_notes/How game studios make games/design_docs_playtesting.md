# Design Documentation, Prototyping and Playtesting in Practice at Game Studios

Scope note: ~20 searches/fetches. Primary sources where possible (GDC Vault listings, studio blogs, first-party talks, Kotaku investigations). Some claims about "current practice" come only from vendor/tooling blogs (allo.io, gamedesignskills, Wayline, Codecks) and are flagged as such: they are weaker evidence than named-studio examples.

## 1. The GDD: is the monolithic document still used, and what replaced it?

### Takeaway
The 1990s "design bible" (Tim Ryan's multi-part concept -> proposal -> full design doc model) is widely described as obsolete in practice: nobody reads long docs and they go stale as soon as the build moves. What replaced it is a mix of short visual docs (Librande one-pagers), short concept docs, living wikis/shared workspaces, feature-level specs, and design logs tied to a playable build. The playable build, not the doc, is the source of truth.

### Cited Findings
- Tim Ryan's 1999 Gamasutra series "The Anatomy of a Design Document" is the canonical formal-GDD model: a 1-2 page game-concept document ("necessarily brief and simple in order to encourage a flow of ideas") leads to a formal game proposal, and then a full design doc described as "a bible from which the producer preaches the goal." — [Game Developer (Tim Ryan, Part 1)](https://www.gamedeveloper.com/design/the-anatomy-of-a-design-document-part-1-documentation-guidelines-for-the-game-concept-and-proposal)
- Stone Librande (then EA, later Riot design lead) at GDC 2010 "One-Page Designs": argued the traditional design bible and its wiki versions fail because "no one" reads long documentation and wikis break the relationships between elements; his fix is annotated diagrams on one page with lots of white space and a strong central image. Examples shown from Diablo III, The Simpsons and Spore. — [Game Developer summary](https://www.gamedeveloper.com/design/video-one-page-designs); [GDC Vault](https://gdcvault.com/play/1012356/One-Page); [Librande's slides](http://stonetronix.com/gdc-2010/OnePageDesigns.ppt)
- Librande later reported producing over 100 one-page documents for SimCity (2013), spanning early concept to final production (GDC 2013 "Simulating a City, One Page at a Time"). — [Game Developer summary](https://www.gamedeveloper.com/design/video-one-page-designs); [GDC Vault](https://gdcvault.com/play/1017708/Simulating-a-City-One-Page)
- Daniel Cook (Lost Garden / Spry Fox) proposes "game design logs" instead of wikis or GDD bibles: a 2-10 page concept doc with just enough text/images to start, then daily dated entries added above it with play notes, prioritized next steps and ideas; the log is a supplement to a playable build made "as soon as possible" by killing graphics, features and plot that get in the way. — [Lostgarden, "Game Design Logs"](https://lostgarden.com/2011/05/03/game-design-logs/)
- Claims (from a tooling vendor blog, weaker source) that the hundred-page GDD is "functionally dead," that teams use a living hub (Notion/Confluence/Google Docs), and that mid-size studios link design pages to engineering tickets so mechanic changes flag affected epics. Same source says Larian planned Baldur's Gate 3 with logic matrices of class-vs-scene interactions rather than prose. — [allo.io blog](https://allo.io/blog/en/game-design-document-template/) (vendor; BG3 claim not independently verified here)
- Unknown Worlds (Subnautica) went further and made its internal Trello task board public as part of "open development." — [Unknown Worlds, Subnautica Open Development](https://unknownworlds.com/subnautica/subnautica-open-development/)
- Larger-studio example of "systemic artifacts": Nintendo's Breath of the Wild team validated its core physics/"chemistry" rules in a 2D top-down prototype built on the real engine systems, rather than specifying them in prose (GDC 2017, Fujibayashi/Dohta/Takizawa). — [Gamereactor](https://www.gamereactor.eu/nintendo-showed-zelda-breath-of-the-wild-2d-prototype-at-gdc/); [Bleeding Cool](https://bleedingcool.com/games/gdc-nintendos-2d-breath-wild-prototype-actually-3d/)

### Inferences
- Common real-world stack: short concept/pitch doc + pillars page + per-feature specs/one-pagers + a wiki or shared workspace + task tracker, with the build as source of truth. The monolithic GDD survives mainly in education, publisher contracts and templates.
- Sync with the game is achieved less by "keeping docs updated" and more by making docs small, dated (logs), or linked to tasks so staleness is visible. Librande's and Cook's approaches both accept that docs are disposable communication tools.

### Gaps
- No hard survey data found on what % of studios use wikis vs. one-pagers vs. full GDDs.
- Did not verify Larian's BG3 "logic matrix" claim from a primary source (e.g. Larian GDC talk).
- No primary source found on a specific AAA studio's doc-sync process (e.g. doc ownership rules, review cadence).

## 2. Design pillars / core loop / experience goals

### Takeaway
Pillars are typically ~3 short, emotional, "why"-oriented statements written early; their practical job is to reject features. Named examples: God of War (2018) — Combat, Father/Son, Exploration; Subnautica — Intoxicating Creation, Thrill of the Unknown, Cascading Hysteria; Unpacking — contemplation, discovery, expression.

### Cited Findings
- Charlie Cleveland (Unknown Worlds): pillars are the "what" — short emotional phrases that stay fixed regardless of market or team changes; "values" are the "how" (e.g. Subnautica: no direct player instruction, breadcrumbs instead; player as foreigner in an indifferent world; no manipulative reward systems). Subnautica pillars: "Intoxicating Creation", "Thrill of the Unknown", "Cascading Hysteria". He says an idea that doesn't support a pillar "can be discarded" objectively, and ideas that support multiple pillars should be implemented immediately. He admits the team mostly executed on one pillar (Unknown) with Creation secondary. — [Charlie Cleveland, "Game Pillars and Values"](https://www.charliecleveland.com/game-pillars/)
- God of War (2018) pillars per Rob Davis: Combat, Father/Son, Exploration. An early pitch to go "really minimalist and really realistic" (dropping giant set pieces) was rejected as not matching studio DNA. — [DualShockers](https://www.dualshockers.com/god-of-war-art-level-design-info/)
- Unpacking team started from a list of adjectives for the desired player experience and distilled them into three pillars: contemplation, discovery, expression. — [Game Developer](https://www.gamedeveloper.com/design/unpacking-the-design-pillars-of-a-chill-puzzle-game)
- Guidance that pillars should state the "why" (e.g. "Explore evocative alien worlds, telling a story through atmosphere" rather than "2D puzzles and platforming") and that features supporting no pillar get cut. — [Game Developer, "Design Pillars – The Core of Your Game"](https://www.gamedeveloper.com/design/design-pillars-the-core-of-your-game); [gamedesignskills](https://gamedesignskills.com/game-design/design-pillars/)
- Further case study: Eco's design pillars. — [Game Developer](https://www.gamedeveloper.com/design/the-design-pillars-of-eco)

### Inferences
- Pillars are one of the most consistently practiced artifacts across indie and AAA, because they are cheap and directly useful for cut decisions. Cleveland's admission shows pillars are aspirational and teams drift toward one dominant pillar.

### Gaps
- No primary source found for a documented instance of a specific feature cut explicitly "because it failed the pillars" at a AAA studio.
- Schell's "experience goals"/lenses and Fullerton's playcentric process not directly sourced in this pass.

## 3. Pitch documents and pitch decks

### Takeaway
Publisher pitch decks are short (roughly 10-15 slides, scannable in 2-3 minutes), lead with a hero image and logline, and are judged heavily on a playable demo, team credibility, comparables and a concrete budget.

### Cited Findings
- Recommended slides: hero image; logline; gameplay pillars with screenshots; demo (playable build link or video); competition/comparables; traction (followers, wishlists, play metrics); team; timeline/milestones; target platforms; price point; required services from the publisher (marketing, QA, porting); a specific budget figure, not a range. Make two versions (sparse for live pitching, detailed for sending). Comparisons like "Stardew Valley meets Factorio" recommended. Expect pitching to take months. — [Codecks](https://www.codecks.io/blog/game-pitch-deck/)
- Strong decks are ~10-15 slides and scannable in 2-3 minutes; link gameplay video rather than embedding. — [Viktori guide](https://viktori.co/game-pitch-deck-guide-and-template/); [Playbase](https://www.playbase.agency/blog/pitch-decks-for-game-publishers-the-do-s-and-don-ts-you-need-to-know)
- The vertical slice is what gets shown to publishers/investors to prove the team can build the game at quality. — [Xsolla](https://xsolla.com/blog/funding-101-the-impact-of-the-vertical-slice)
- Tim Ryan's older model: 1-2 page concept doc aimed at "those responsible for advancing the idea to the next step: a formal game proposal." — [Game Developer (Tim Ryan)](https://www.gamedeveloper.com/design/the-anatomy-of-a-design-document-part-1-documentation-guidelines-for-the-game-concept-and-proposal)

### Inferences
- The pitch has shifted from document to deck + build: traction data (wishlists) and a playable demo now carry more weight than written design.

### Gaps
- Sources are mostly agencies/consultancies; no publisher-side primary source (e.g. Devolver, Annapurna submission guidelines) was fetched.

## 4. Prototyping: paper, greybox, "find the fun", prototype vs first playable vs vertical slice

### Takeaway
Studios prototype single mechanics cheaply (often with placeholder art or in a reduced dimension), then build a polished representative chunk (first playable / vertical slice) before committing to production. Kill rates are high at studios that institutionalize this (Supercell: 30+ killed, ~5 hits). Skipping this phase is a recurring cause of disaster (Anthem).

### Cited Findings
- Definitions (industry glossaries): prototype = rough, internal, placeholder-art test of one system (movement, combat combo) for fun/feasibility; first playable = marks end of preproduction, core mechanics integrated with non-final but presentable visuals; vertical slice = a small section at near-final quality across gameplay, art, audio, UI, proving the team can build the game — shown to publishers. Summary line: prototype proves the idea can work, MVP proves players want it, vertical slice proves you can build it at shipping quality. — [askagamedev glossary](https://www.tumblr.com/askagamedev/746300998961741824/game-dev-glossary-prototype-vertical-slice); [Tono Game Consultants](https://tonogameconsultants.com/vertical-slice/); [p99soft](https://p99soft.com/blog/playable-prototype-vs-vertical-slice-vs-mvp)
- Mark Cerny's "Method" (GDC Europe): preproduction ("capture lightning") and production are "as different as night and day"; preproduction ends with a "publishable first playable" — a completely polished portion of the game that decides whether the project lives or dies; "once you had the level, then you make 30 of them." Projects whose first playable fails should be cancelled. — [Game Developer, Conversations from GDC Europe](https://www.gamedeveloper.com/marketing/conversations-from-gdc-europe-mark-cerny-jonty-barnes-jason-kingsley); [Cerny Method slides (SlideShare)](https://www.slideshare.net/slideshow/cerny-method/4961584)
- Nintendo, Breath of the Wild: to test physics/"chemistry" cheaply, Fujibayashi had Dohta implement the systems in an NES-style top-down prototype that was actually a top-down view of a 3D environment running the same systems as the final game — i.e. the prototype used production systems, not throwaway approximations. — [Gamereactor](https://www.gamereactor.eu/nintendo-showed-zelda-breath-of-the-wild-2d-prototype-at-gdc/); [Bleeding Cool](https://bleedingcool.com/games/gdc-nintendos-2d-breath-wild-prototype-actually-3d/)
- Double Fine "Amnesia Fortnight": during Brütal Legend's development Tim Schafer split the studio into four teams for two-week game prototypes; Costume Quest and Stacking were picked up by THQ; Iron Brigade also came from the program. — [Wikipedia: Costume Quest](https://en.wikipedia.org/wiki/Costume_Quest); [Wikipedia: Stacking](https://en.wikipedia.org/wiki/Stacking_(video_game)); [Double Fine](https://www.doublefine.com/games/amnesia-fortnight)
- Supercell: CEO Ilkka Paananen says the company has killed 30+ games and launched only 5 hits; some killed before soft launch; teams pop champagne on kills to honour the attempt; the team that killed Smash Land went on to make Clash Royale. — [Game World Observer](https://gameworldobserver.com/2024/03/14/all-games-killed-by-supercell-everdale-hay-day-pop-clash-mini); [Supercell, "What We've Learned from Failures"](https://supercell.com/en/news/learning-from-failures/); [PocketGamer.biz](https://www.pocketgamer.biz/supercell-opens-up-on-cancelled-projects-and-the-role-of-failure-in-creativity/)
- Counterexample — Anthem (BioWare): 7 years in development but came together only months before release; core flight was "yanked out and put back in countless times" until an E3 demo (made to impress EA's Patrick Söderlund and "largely fake") effectively locked it in; culture of "BioWare magic" (belief it will come together at the end). Per Schreier, based on 19 current/former staff. — [Kotaku](https://kotaku.com/how-biowares-anthem-went-wrong-1833731964); [Wccftech summary ("six to nine months")](https://wccftech.com/anthem-inside-expose-6-to-9-months/)
- Daniel Cook: make something playable ASAP, cutting graphics/features/plot that get in the way. — [Lostgarden](https://lostgarden.com/2011/05/03/game-design-logs/)

### Inferences
- "Throwaway vs production code" is not a fixed rule: Supercell/Double Fine prototypes are disposable game-level experiments; Nintendo's BotW prototype reused production systems. The shared principle is cheap presentation, real rules.
- There is no standard "number of prototypes before greenlight"; the gate is qualitative (does the first playable/vertical slice prove the fun and the production pipeline).

### Gaps
- No primary sources fetched on paper prototyping at a named AAA studio, or greybox/blockout norms (The Level Design Book likely covers blockout; only its playtest page was read).
- No data on typical preproduction length or prototype counts at AAA studios.

## 5. Playtesting cadence, user research labs, telemetry, and feedback triage

### Takeaway
Internal playtesting is weekly-ish and baked into schedules (Valve's Friday playtests); large publishers run dedicated user-research labs staffed by psychologists (Microsoft/Bungie, Riot, Valve) combining observation, surveys, interviews and telemetry heatmaps; Microsoft's RITE method fixes issues between participants. Direct observation is the core method; biometrics are experimental.

### Cited Findings
- Valve: weekly cadence. Phil Co (Valve level designer): "Every Friday, we would playtest the section of the game that we're responsible for with someone from outside the team"; Monday planning targets that Friday test. Core method is direct observation from behind the player (Mike Ambinder, GDC 2009 "Valve's Approach to Playtesting: the Application of Empiricism"). — [The Level Design Book](https://book.leveldesignbook.com/process/blockout/playtesting); [GDC Vault](https://www.gdcvault.com/play/1566/Valve-s-Approach-to-Playtesting)
- Valve biometrics (Ambinder, GDC 2011): measured skin conductance, heart rate, eye movement on Portal 2, Left 4 Dead 2, Alien Swarm; experimental L4D2 AI Director adjusting spawns/health by estimated arousal; eye-controlled Portal 2 demo. Experimental, not standard practice. — [GDC Vault](https://www.gdcvault.com/play/1014734/Biofeedback-in-Gameplay-How-Valve); [Game Developer](https://www.gamedeveloper.com/design/video-how-valve-uses-biofeedback-to-make-better-games)
- Halo 3 (Bungie + Microsoft Game Studios user research, Randy Pagulayan, John Hopson): ~600 everyday gamers, 3,000+ hours of play analyzed; cameras recorded faces and controller inputs; found grenades on the ground weren't visible enough, a gun-wielding Brute killed new players in three shots (unfun early), Needler power reviewed; players didn't know objectives -> fix was flashing objectives on screen. — [ABC News](https://abcnews.com/Technology/story?id=3506473&page=1)
- Halo 3 used heatmaps of encounters, weapons and deaths. — [Halo Fandom (Heatmaps)](https://halo.fandom.com/wiki/Heatmaps); [ResearchGate figure](https://www.researchgate.net/figure/Player-progression-chart-of-Halo-3_fig1_255564186)
- RITE (Rapid Iterative Testing and Evaluation), defined at Microsoft by Medlock, Wixon, Fulton, Terrano, Romero: fix problems between participants rather than after the study. Age of Empires II case: after changes over 10 participants, the next 6 needed no changes. Now a chapter in the "Games User Research" book (Oxford). — [Wikipedia: RITE Method](https://en.wikipedia.org/wiki/RITE_Method); [Oxford Academic](https://academic.oup.com/book/26677/chapter/195457486)
- Xbox Research ran worldwide remote playtesting via Parsec streaming. — [Microsoft Game Dev](https://developer.microsoft.com/en-us/games/articles/2023/05/how-xbox-research-accomplished-worldwide-virtual-playtesting-with-parsec/)
- John Hopson on mid-playtest feedback methods (letting players report during play). — [Medium, John Hopson](https://medium.com/@john.hopson/mid-playtest-feedback-methods-319521c01e44)
- Riot: most playtests at its West LA lab, some remote for North American players; tests cover features, modes, champions, agents and unreleased titles. Champion "player labs" (e.g. Kai'Sa): participants view concept art, test abilities in dev environments, play full 5v5 games, then surveys, 1-on-1s with researchers/designers, and a group discussion — long before PBE. Riot has a Central Playtest Infrastructure team and researchers building "milestone testing" benchmarks. — [Riot Playtest](https://www.riotgames.com/en/playtest); [League Nexus: Kai'Sa](https://nexus.leagueoflegends.com/en-us/2018/03/kaisa-evolves-in-player-labs/); [Riot job listing](https://gamejobs.co/Playtest-Operations-Manager-at-Riot-Games)
- Telemetry at small scale: Subnautica sampled framerate and player position every 2 seconds (Steam IDs hashed) to find poor-performance areas and hardware combos; players could send feedback via an in-game F8 panel; public weekly playtest sessions ran on Tuesdays. — [Unknown Worlds, telemetry](https://unknownworlds.com/en/news/creating-telemetry-system-subnautica); [Unknown Worlds forums](https://forums.unknownworlds.com/discussion/136827/subnautica-public-playtest-session-come-join-us-tuesdays-and-help-out)
- God of War Ragnarök: Rob Meyer used armor-usage telemetry across 20 playtesters to spot "clumping that might be unhealthy" for balance. — [The Level Design Book](https://book.leveldesignbook.com/process/blockout/playtesting)
- Question types: comprehension ("Did you notice the orange light? What did it mean?") vs subjective ("Was the boss easy or difficult?"); designers should not explain or defend during tests. — [The Level Design Book](https://book.leveldesignbook.com/process/blockout/playtesting)

### Inferences
- Rough division of labor: internal/weekly tests answer "does it work, is it fun, is it readable"; lab tests with fresh players answer comprehension/onboarding/difficulty (the Halo 3 findings are almost all readability and onboarding); telemetry answers "where/how much" at scale (deaths, item usage, performance); community/early-access tests answer long-term engagement and bugs.
- Triage in practice: observation finds problems, designers own the fix; RITE shows the cheapest loop is fixing between sessions rather than writing reports.

### Gaps
- Ubisoft's user research lab not researched in this pass.
- No primary source on formal feedback-triage processes (severity scales, how UR findings become tickets) at a named studio.

## 6. Systems design and balancing practice

### Takeaway
Spreadsheets are the industry-standard balancing tool (cost curves, EV calcs, progression curves, formula-derived stats), complemented by telemetry from playtests and live data; dedicated simulation tools exist but are secondary.

### Cited Findings
- Economy design commonly starts in spreadsheets: expected-value calcs, upgrade cost tables, currency conversion ratios, progression curves; formula-driven columns (e.g. weapon cost derived from damage and other properties). — [Game Developer, "My Approach To Economy Balancing Using Spreadsheets"](https://www.gamedeveloper.com/design/my-approach-to-economy-balancing-using-spreadsheets)
- Ian Schreiber and Brenda Romero's game balance work includes "Tools of the Trade: Spreadsheets, Simulations, and Iteration"; GDC microtalks where designers shared Excel techniques, including Jamey Stevenson's "Using Simple Spreadsheet Techniques to Help Balance Your Game." — [YouTube (Stevenson)](https://www.youtube.com/watch?v=WqfZV2Wlb1g)
- Spreadsheet collaboration best practices talk (GDS 2015). — [SlideShare](https://www.slideshare.net/slideshow/gds2015-spreadsheetdesign/55773761)
- Tuning a simulation game (process article). — [Game Developer](https://www.gamedeveloper.com/design/how-to-tune-a-simulation-game)
- Telemetry-informed balance: GoW Ragnarök armor clumping (above); Halo 3 Brute/Needler tuning from lab data (above). — [Level Design Book](https://book.leveldesignbook.com/process/blockout/playtesting); [ABC News](https://abcnews.com/Technology/story?id=3506473&page=1)
- Librande's SimCity one-pagers were used to communicate simulation systems (GDC 2013). — [GDC Vault](https://gdcvault.com/play/1017708/Simulating-a-City-One-Page)

### Inferences
- Typical loop: model in spreadsheet -> export/data-drive into engine -> playtest/telemetry -> adjust sheet. Tuning frequency follows playtest cadence in development and patch cadence in live games.

### Gaps
- No primary source found on tuning frequency at a named live-service studio (e.g. Riot patch balance process), or on proprietary balance tools (e.g. Machinations use at named studios).

## 7. Scope control techniques and famous cuts

### Takeaway
Scope is controlled mostly through pillars-based rejection, preproduction gates (kill the project/feature if the first playable fails), and late-stage cutting under schedule pressure. Formal methods like MoSCoW are borrowed from general software; evidence of their use in games is anecdotal.

### Cited Findings
- Pillars as filter: features that support no pillar get cut (Cleveland; Game Developer). — [Charlie Cleveland](https://www.charliecleveland.com/game-pillars/); [Game Developer](https://www.gamedeveloper.com/design/design-pillars-the-core-of-your-game)
- Project-level kills: Supercell 30+ killed titles vs ~5 hits; Cerny Method cancels projects whose first playable fails. — [Game World Observer](https://gameworldobserver.com/2024/03/14/all-games-killed-by-supercell-everdale-hay-day-pop-clash-mini); [Game Developer (Cerny)](https://www.gamedeveloper.com/marketing/conversations-from-gdc-europe-mark-cerny-jonty-barnes-jason-kingsley)
- Halo 2: troubled development and time constraints forced cuts including a more ambitious multiplayer mode and caused the cliffhanger campaign ending; the original ending had Master Chief and the Arbiter confront Truth with an Ark-collapse escape sequence. — [Wikipedia: Halo 2](https://en.wikipedia.org/wiki/Halo_2); [Halo Waypoint, Cutting Room Floor](https://www.halowaypoint.com/news/cutting-room-floor)
- BioShock: early concept centered on monstrous enemies (Aggressors, Queen insects) before shifting to human splicers; designers Bill Gardner and Hogarth De La Plante named a cut Big Daddy type as the cut content they'd most like to have kept. — [GameRant](https://gamerant.com/best-cut-content-in-video-games/); [Wikipedia: Big Daddy](https://en.wikipedia.org/wiki/Big_Daddy_(BioShock))
- God of War (2018): the "really minimalist and really realistic" direction was cut back as not matching studio DNA. — [DualShockers](https://www.dualshockers.com/god-of-war-art-level-design-info/)
- Anthem as scope/indecision failure: features repeatedly added/removed; built mostly in final months. — [Kotaku](https://kotaku.com/how-biowares-anthem-went-wrong-1833731964)

### Inferences
- The most effective scope control in cited examples is early: deciding what the game is (pillars, first playable) and being willing to kill. Late cuts (Halo 2) are the common, costly case.

### Gaps
- No source found showing MoSCoW or formal "cut lists"/content budgets used at a named studio; this is plausible but unverified here.
- Blizzard Titan -> Overwatch and other well-known project pivots not sourced in this pass.
