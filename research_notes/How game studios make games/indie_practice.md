# How Indie Teams and Solo Developers Make and Ship Games (vs. Studio Pipelines)

Note on sourcing: howtomarketagame.com failed to resolve during fetch (DNS error), so Zukowski's benchmarks below come from search-result snippets of his pages and from secondary sites quoting him. Several "median revenue" stats come from SEO-style aggregator blogs (steampageanalyzer, voxbooster) and are flagged as lower-confidence.

## 1. What process do successful solo/small-team devs follow? Prototype-first vs doc-first?

### Takeaway
Nearly every breakout indie in the sample started as a small playable prototype (often a jam game or a hobby build for friends), not a design document. Scope grew *after* the core loop proved fun to real players, and funding/publishing/visibility came after that proof (Kickstarter, publisher DMs, streamers). Studio-style "GDD first, then production" is essentially absent from these stories.

### Cited Findings
**Balatro (LocalThunk, solo, part-time)**
- Started Dec 13, 2021 from a Lua template during vacation from an IT day job; the original idea (online multiplayer "Big Cheat") was abandoned immediately in favor of what became Balatro — [LocalThunk, "The Balatro Timeline"](https://localthunk.com/blog/balatro-timeline-3aarh)
- Core chips x mult scoring existed by end of Dec 2021; Jokers and boss blinds added Jan 2022; first builds to friends June 2022; a friend playing dozens of hours (Aug 2022) is what pushed him to expand scope — [LocalThunk](https://localthunk.com/blog/balatro-timeline-3aarh)
- Built alongside a full-time IT job; took a burnout break Mar–May 2022 — [80.lv](https://80.lv/articles/balatro-dev-reveals-early-development-footage-and-screenshots); [LocalThunk](https://localthunk.com/blog/balatro-timeline-3aarh)
- Playstack approached via Twitter DM in June 2023 (multiple publishers followed); deal finalized July 2023, after the game was ~18 months in — [LocalThunk](https://localthunk.com/blog/balatro-timeline-3aarh)
- Lessons he lists: deliberately avoided playing similar games; took breaks; hired a lawyer for the contract; listened to player feedback over his own instinct — [LocalThunk](https://localthunk.com/blog/balatro-timeline-3aarh)
- Sold 5M+ copies by January 2025 — [Wikipedia: Balatro](https://en.wikipedia.org/wiki/Balatro)

**Vampire Survivors (Luca Galante / poncle, solo)**
- Began in 2020 while unemployed, in the Phaser web framework; inspired by the mobile game Magic Survival; ~1 year to early access; spent roughly £1,100 on bought sprite packs and music; later migrated to Unity (v1.6) — [Wikipedia](https://en.wikipedia.org/wiki/Vampire_Survivors)
- itch.io release got little engagement; Steam Early Access Dec 2021 at a deliberately low price; YouTube creators drove growth; 30k+ concurrent players by late Jan 2022, 70k+ by Feb 2022 — [Wikipedia](https://en.wikipedia.org/wiki/Vampire_Survivors)
- Sold 1M+ within two to three months; Galante set up the company within six days of a SplatterCat video; poncle later grew to 25+ people — [Barclays Games and Creative (search snippet)](https://games.creative.barclays/resource-hub/games/industry-insights/how-vampire-survivors-became-a-hit-when-creator-poncle-was-ready-to-give-up/); [The Game Business](https://www.thegamebusiness.com/p/the-vampire-survivors-developer-is)

**Celeste (Maddy Thorson, Noel Berry + small team)**
- Began as a PICO-8 game made in 4 days by Thorson and Berry in an Aug 2015 jam; full development of the commercial game began around Jan 2016, with a team assembled to expand it — [Wikipedia: Celeste](https://en.wikipedia.org/wiki/Celeste_(video_game)); [Maddy Thorson](https://en.wikipedia.org/wiki/Maddy_Thorson)

**Hollow Knight (Team Cherry, core of 2 founders, later ~4)**
- Conceived during Ludum Dare 2013 as the prototype "Hungry Knight"; Kickstarter Nov 2014 with A$35,000 goal raised A$57,000+ from 2,158 backers, which funded hiring a technical director and composer; engine switched from Stencyl to Unity mid-development; released Feb 24, 2017 (~3.5 years after jam); 15M+ copies by Aug 2025 — [Wikipedia: Hollow Knight](https://en.wikipedia.org/wiki/Hollow_Knight)

**Stardew Valley (Eric Barone, solo)**
- 4.5 years solo; released Feb 26, 2016; taught himself art, music, programming and design — [Stardew Valley FAQ](https://www.stardewvalley.net/faq/)
- Reported ~12 hours/day, 7 days/week, nearly 20,000 hours — [search snippet, gamerhorizon/gamerant; secondary, lower confidence](https://gamerant.com/stardew-valley-concernedape-solo-game-development-inspiration/)

**Brotato (Thomas Gervraud / Blobfish, solo)**
- Early Access late 2022 (at $4.99), 1.0 in June 2023 after ~10 months of EA; 1M+ copies during EA; 10M+ by 2025. His two prior games had only moderate success and he was job-hunting while making Brotato — [Wikipedia: Brotato](https://en.wikipedia.org/wiki/Brotato); [Blobfish on X](https://x.com/blobfishdev/status/1574807929844387843); [Blobfish on X](https://x.com/blobfishdev/status/1672183440668590080)

**Lethal Company (Zeekerss, solo)**
- Developer began making games in 2012 on Roblox and released ~19 games before Lethal Company; first Steam game It Steals (July 2020) — [Wikipedia: Zeekerss](https://en.wikipedia.org/wiki/Zeekerss); [Push To Talk](https://www.pushtotalk.gg/p/how-lethal-company-sold-10-million-copies)
- Early Access Oct 23, 2023; ~640k estimated sales and 57k CCU within weeks; later estimated 10M copies at $10 — [Game World Observer](https://gameworldobserver.com/2023/11/16/lethal-company-sales-640k-copies-57k-ccu-new-indie-hit-zeekerss); [Game Developer](https://www.gamedeveloper.com/business/lethal-company-sold-an-estimated-10-million-copies)

**Among Us (Innersloth, 3 people at the time)**
- Development began Nov 2017; launched mobile June 2018 to 30–50 average concurrent players; co-founder said they were "really bad at marketing"; kept updating for a small vocal community (online play, Steam Nov 2018); broke out mid-2020 via streamers (Korea/Brazil first, then Sodapoppin, xQc, etc.), reaching 3.8M concurrent in Sept 2020 — [Wikipedia: Among Us](https://en.wikipedia.org/wiki/Among_Us)

**Hades (Supergiant, ~20-person indie)**
- Designed "as an Early Access game from the ground up," to evolve with community feedback; feedback led them to make a bigger game than their traditional approach — [Supergiant blog](https://www.supergiantgames.com/blog/hades-now-out-of-early-access/); [Game Developer](https://www.gamedeveloper.com/design/supergiant-s-fourth-outing-i-hades-i-introduces-a-more-mature-organized-dev-process)
- EA feedback shaped the narrative/dialogue system (GDC 2021 talk); for Hades II, community feedback led them to rewrite the ending — [GDC](https://gdconf.com/article/dive-into-the-dialogue-of-hades-at-gdc-2021/); [GamesRadar+](https://www.gamesradar.com/games/hades/weve-learned-to-love-and-trust-the-process-how-hades-2-built-on-supergiants-early-access-legacy-to-deliver-the-best-roguelike-of-2025/)

**Dave the Diver (Mintrocket / Nexon) — a counter-example, not a true indie**
- Started as a prototype in 2017, Early Access Oct 2022, 1.0 June 28, 2023; 1M copies in 10 days, 10M by Sept 2026; small team but owned by Nexon (made a wholly owned subsidiary Sept 2024) — [Wikipedia](https://en.wikipedia.org/wiki/Dave_the_Diver); [Game World Observer](https://gameworldobserver.com/2026/09/09/dave-the-diver-sold-10-million-copies); [Game Developer](https://www.gamedeveloper.com/business/nexon-spins-off-dave-the-diver-dev-mintrocket-into-a-full-corporation)
- Balancing mechanics so none became repetitive was solved "through trial and error during early access" — [search snippet, Naavik / Game World Observer](https://naavik.co/deep-dives/dave-the-diver-nexons-approach-to-fun-first/)

### Inferences
- Common sequence: tiny playable prototype -> friends/small community play it -> evidence of obsessive play (Balatro friend, VS YouTubers, Among Us vocal base) -> then invest in scope, money, publisher. Documentation follows the fun, not the reverse.
- Several hits reused/bought assets or used simple tech (VS's £1,100 asset budget, PICO-8, Phaser, Lua/LÖVE) to reach playability fast.
- Many "overnight" solo hits had long invisible apprenticeships (Zeekerss ~19 prior games; Blobfish two prior games; Innersloth 2 years of low traction).
- Contrast with studio pipelines: studios front-load pre-production docs, greenlight gates, and vertical slices to secure budget; indies substitute *player evidence* (playtime, wishlists, streamer pickup) for the greenlight gate.

### Gaps
- No primary source found for Stardew's exact process (Greenlight 2012, Chucklefish publishing) in this pass; the 20,000-hour figure is secondary.
- Did not find primary interviews stating whether any of these devs wrote a formal GDD; absence is inferred from timelines, not confirmed.

## 2. Game jams as a concept-validation pipeline

### Takeaway
Jams are a proven, cheap filter for finding a hook: 100+ Steam games came out of GMTK Game Jam alone, and several landmark indies (Celeste, Hollow Knight, TowerFall, SUPERHOT, Rollerdrome) began as jam entries. Jam success doesn't guarantee commercial success.

### Cited Findings
- 100+ Steam games started as GMTK Game Jam entries, including A Little to the Left, Rollerdrome, Boomerang X, The Baby in Yellow, Word Play; Sol Cesto sold 100k+; Omelet You Cook has 1,000+ overwhelmingly positive reviews — [GMTK / Mark Brown](https://gmtk.substack.com/p/100-steam-games-that-started-life); [GameDev.net](https://gamedev.net/news/4303-100-steam-games-that-started-life-during-gmtk-game-jam/)
- Mark Brown's advice for jam-to-commercial: add features and levels, replace programmer art with professional assets; he notes BenBonk's Wrangle Ranch lost money — [GMTK](https://gmtk.substack.com/p/100-steam-games-that-started-life)
- Rollerdrome began as a top-down twin-stick at the first GMTK jam and became a 3D game with a Roll7 publishing deal — [search snippet, GMTK/GameDev.net](https://gamedev.net/news/4303-100-steam-games-that-started-life-during-gmtk-game-jam/)
- Global Game Jam alumni: The Roottrees are Dead (GGJ 2023 -> Steam Jan 2025), Yesterday's News (GGJ 2024), The Textorcist (GGJ 2016 -> Steam 2019) — [Global Game Jam](https://globalgamejam.org/news/jam-fame-global-game-jam-projects-became-successful-published-games)
- TowerFall's first prototype was made at the Vancouver Full Indie Game Jam 2012; SUPERHOT's jam prototype became the fastest game through Steam Greenlight — [search snippet, Global Game Jam / GameMaker](https://gamemaker.io/en/blog/best-game-jam-games)
- Celeste: 4-day PICO-8 jam game -> full game (see Q1). Hollow Knight: Ludum Dare 2013 "Hungry Knight" -> full game (see Q1).

### Inferences
- Jams give an indie the "rapid prototyping of multiple ideas" step studios do in pre-production, with free external validation (jam ratings, itch plays, streamer pickup).
- Balatro and VS weren't jam games but followed the same pattern: a hobby prototype with a single strong mechanic (chips x mult; auto-attack survival) before content.

### Gaps
- No data found on the *conversion rate* of jam games to commercial releases or on how many devs deliberately prototype several ideas and pick one.

## 3. Market validation practices (wishlists, Next Fest, capsule/trailer testing, hook/genre, Early Access)

### Takeaway
Indie validation in 2023–2026 centers on the Steam page: wishlists as a demand signal, demos in Steam Next Fest, and genre/hook clarity. Pre-festival wishlist count is the strongest predictor of Next Fest results; wishlist-to-first-week-sales conversion is ~15–25%. Early Access functions as paid extended playtesting.

### Cited Findings
- Balatro wishlist curve: 48 (May 2023 beta) -> 183 (June 10) -> 2,440 (end June) -> 28,661 (end July) -> 77,380 (end Oct, after Oct 2023 Next Fest) -> 208,401 on launch day. Content-limited demo Sept 2023; two Next Fests (Oct 2023, Feb 2024). Launch day: 119,000 Steam units; "$600,000" in revenue within hours; launch was 10–20x larger than expected — [LocalThunk](https://localthunk.com/blog/balatro-timeline-3aarh)
- Zukowski's Next Fest data: pre-festival wishlist total is the strongest correlate of wishlists earned during Next Fest (Spearman r = 0.825); a game entering with 100 wishlists that gains 2,000 in the prior 2 weeks has only an 8% chance of earning 3,000 during the fest; recommends launching after your last possible Next Fest — [howtomarketagame (search snippet)](https://howtomarketagame.com/2025/03/26/benchmarks-how-many-wishlists-can-i-get-from-steam-next-fest/)
- Most games convert 15–25% of wishlists into first-week sales — [howtomarketagame benchmarks (search snippet)](https://howtomarketagame.com/benchmarks/)
- Steam's "Popular Upcoming" list historically needed ~7,000 wishlists; Valve reportedly raised it to ~100,000 (~15x). Zukowski reports the Personal Calendar now yields 300–3,000 wishlists/day vs ~1,000/day for 1–2 days from Popular Upcoming — [games.gg](https://games.gg/news/steam-popular-upcoming-indie-personal-calendar/) (secondary report of Zukowski's tracking; date of change not confirmed here)
- Zukowski: ~95% of games on physical show floors are in genres that don't sell on Steam; indies describe games vaguely ("atmospheric adventure") rather than what the player does; marketing often starts too late and teams lack a Steam page to capture interest — [Game Developer GDC Podcast](https://www.gamedeveloper.com/marketing/super-practical-indie-game-marketing-with-chris-zukowski---gdc-podcast-ep-24); [GameDev Insider summary](https://gamedevinsider.wordpress.com/2026/04/26/the-most-common-mistakes-in-indie-game-marketing/); [Zukowski, 60 Marketing Mistakes PDF](https://howtomarketagame.com/wp-content/uploads/2023/05/Zukowski_60MistakesEbookV1.pdf)
- Zukowski cautions against being "too weird" to chase press; cites Valheim as succeeding by being good and building community through open beta rather than a flashy hook — [IndieGameBusiness podcast (search snippet)](https://creators.spotify.com/pod/profile/indiegamebusiness/episodes/Chris-Zukowski---Finding-you-games-hook-and-more-marketing-tips-ea5n92)
- Early Access as playtesting: Hades built for EA from day one; Dave the Diver tuned mechanics through EA; Brotato ~10 months EA; VS and Lethal Company both launched in EA (see Q1)
- GameDiscoverCo: most Steam games earn less at 1.0 exit from Early Access than at their EA launch — [Game World Observer](https://gameworldobserver.com/2025/12/10/according-to-gamediscoverco-most-games-on-steam-earn-less-after-leaving-early-access-than-they-do-at-launch)

### Inferences
- The modern indie "greenlight gate" is a wishlist threshold. Balatro's curve shows the biggest jumps coming from publisher involvement and Next Fest demos, not from launch.
- Because EA launch is usually the bigger revenue spike, EA is not a free "soft launch"; the game needs to be fun and hooky when it enters EA.
- Genre selection is a validation step in its own right: pick a genre with proven Steam demand, then differentiate with one clear hook (Brotato and VS-likes, Balatro = roguelike deckbuilder + poker).

### Gaps
- Could not fetch howtomarketagame directly; no primary numbers on capsule/trailer A/B testing practice (e.g., using ad click-through on capsule art before building).
- No confirmed primary source for the date/magnitude of Valve's Popular Upcoming change.

## 4. Scope control for small teams

### Takeaway
Unrealistic scope is the most common problem in postmortems. The successful indies above controlled scope by starting tiny and growing only on evidence, but timelines were still multi-year (Balatro ~26 months, Hollow Knight ~3.5 years, Stardew 4.5 years).

### Cited Findings
- Across postmortem studies: 75% of projects reported unrealistic scope; 70% cut features during development; schedule cited as a problem in 25%; internal/management problems were ~300% more prevalent than other categories (technology, external) — [Academia.edu: "What went wrong? A survey of problems in game development"](https://www.academia.edu/8306789/What_went_wrong_A_survey_of_problems_in_game_development); [Ptidej: Game Industry Problems gray-literature analysis](https://assets.ptidej.net/Publications/Documents/IST21.doc.pdf) (numbers from search snippets summarizing these papers)
- Washburn et al. (Microsoft Research/RIT, ICSE 2016) analyzed 155 Gamasutra postmortems over 16 years, coding 12 categories incl. art, team, marketing, scope — [Microsoft Research](https://www.microsoft.com/en-us/research/publication/what-went-right-and-what-went-wrong-an-analysis-of-155-postmortems-from-game-development/); [Game Developer](https://www.gamedeveloper.com/audio/study-combs-through-155-gamasutra-postmortems-for-what-went-right-and-wrong)
- Hollow Knight's Kickstarter overfunding enabled scope expansion and hires — [Wikipedia](https://en.wikipedia.org/wiki/Hollow_Knight). Balatro's scope expansion was triggered by a friend's heavy play — [LocalThunk](https://localthunk.com/blog/balatro-timeline-3aarh)

### Inferences
- Indie scope rule of thumb implied by the case studies: one mechanic, reused/bought assets, a genre with a known content pattern (runs, waves, cards) that scales by adding content rather than systems. Survivors-likes and roguelike deckbuilders are content-scalable by design.
- "Vertical slice" for indies ≈ the Next Fest demo: a polished, content-limited playable that doubles as market test (Balatro's Sept 2023 demo).

### Gaps
- Found no primary source for a widely cited "recommended scope for a first commercial game" (e.g., "6–12 months") or statistics on how many indie projects are never finished. Treat any such figure as unsourced.

## 5. Tools and documentation indies actually use

### Takeaway
Indies use lightweight, game-specific task boards (Codecks, HacknPlan) or general tools (Trello, Notion), with short living design docs rather than large GDDs; devlogs and Discord double as documentation and marketing.

### Cited Findings
- Codecks: card-based "decks and hands" PM tool built by game devs for game devs; reviewers call it fast at indie scale — [Codecks blog](https://www.codecks.io/blog/project-management-tools-in-game-development/)
- HacknPlan: its "Design Model" links GDD sections directly to tasks; 4.5/5 on Capterra, 4.3/5 on G2 — [HacknPlan](https://hacknplan.com/best-project-management-tools-for-game-developers); [gamedesigning.org review](https://gamedesigning.org/gaming/hacknplan/)
- Hades' EA process relied on public update cadence and patch notes as the feedback loop — [Supergiant blog](https://www.supergiantgames.com/blog/hades-now-out-of-early-access/)

### Inferences
- The fact that HacknPlan markets "GDD linked to tasks" as a differentiator suggests most indie docs are disconnected, short, and rarely updated.

### Gaps
- No survey data found on actual tool adoption share among indies, or primary sources on which specific tools Balatro/VS/Brotato devs used.

## 6. Indie playtesting: friends, Discord, Steam Playtest, demo metrics

### Takeaway
Playtesting escalates in rings: friends -> Discord/community -> Steam Playtest or public demo -> Early Access. The key signal cited by devs is unprompted long playtime, not survey scores.

### Cited Findings
- Balatro: friends first (progress shared Jan 2022, builds June 2022), then a Discord community became central; public beta May 2023, demo Sept 2023 — [LocalThunk](https://localthunk.com/blog/balatro-timeline-3aarh)
- Vampire Survivors was originally made for the dev and his friends — [Barclays (search snippet)](https://games.creative.barclays/resource-hub/games/industry-insights/how-vampire-survivors-became-a-hit-when-creator-poncle-was-ready-to-give-up/)
- Among Us survived two years on a "small but vocal player base" whose feedback drove online play and new content — [Wikipedia](https://en.wikipedia.org/wiki/Among_Us)
- Steam Playtest: a separate app ID attached to the store page for limited play sessions, avoiding reviews/key management — [Steamworks docs](https://partner.steamgames.com/doc/features/playtest); [Steam Page Analyzer](https://www.steampageanalyzer.com/blog/steam-playtest-vs-demo)

### Inferences
- "Did testers keep playing without being asked?" is the practical indie proxy for a studio's formal playtest metrics.

### Gaps
- No sourced benchmarks for demo metrics (median playtime, demo-to-wishlist rate) — howtomarketagame pages with this data could not be fetched.

## 7. Common failure modes and what separates successes

### Takeaway
The market is extremely top-heavy; most Steam games earn little. Documented failure modes: over-scope, late or vague marketing, wrong genre for Steam, no Steam page/wishlist capture, and burnout. Successes share a clear, demonstrable hook in a proven genre, early player evidence, demos/EA, and often streamer/YouTuber pickup.

### Cited Findings
- 20,282 games shipped on Steam in 2025; only 608 (~3%) reached 1,000 reviews; median Steam game reportedly grossed ~$249 in 2025; bottom half of indies sell under 2,000 copies — [VoxBooster](https://voxbooster.com/blog/indie-game-statistics-2026/); [Steam Page Analyzer](https://www.steampageanalyzer.com/blog/indie-game-sales-statistics) (aggregator blogs citing GameDiscoverCo-type data; LOWER CONFIDENCE, figures vary between sources)
- "Triple-I" studios (50+ people) captured 53% of indie revenue in 2024 — [same aggregators, lower confidence](https://www.shanethegamer.com/research/indie-games-statistics/)
- Marketing failure modes (Zukowski): starting marketing near the end, no Steam page to capture interest, vague pitches, unsellable genres — [Zukowski 60 Mistakes](https://howtomarketagame.com/wp-content/uploads/2023/05/Zukowski_60MistakesEbookV1.pdf); [GameDev Insider](https://gamedevinsider.wordpress.com/2026/04/26/the-most-common-mistakes-in-indie-game-marketing/)
- Among Us' 2018 flop attributed by its co-founder to being "really bad at marketing" — [Wikipedia](https://en.wikipedia.org/wiki/Among_Us)
- Burnout/stress: LocalThunk took a 2-month break and had an anxiety attack before launch — [LocalThunk](https://localthunk.com/blog/balatro-timeline-3aarh)
- Streamer/YouTuber discovery drove VS (SplatterCat etc.), Among Us (Sodapoppin etc.) — [Wikipedia VS](https://en.wikipedia.org/wiki/Vampire_Survivors); [Wikipedia Among Us](https://en.wikipedia.org/wiki/Among_Us)
- Scope/feature-cut and schedule problems dominate postmortems (see Q4)

### Inferences
- What separates hits: (1) a loop that is fun in a crude prototype; (2) genre with proven Steam demand plus one legible hook; (3) watchable, streamer-friendly moments (VS, Among Us, Lethal Company); (4) a Steam page and demo early enough to compound wishlists; (5) low price and cheap production (VS, Brotato $4.99) that lowered risk.
- Survivorship bias is heavy: the same prototype-first process is used by thousands of games that sell <2,000 copies. Process is necessary, not sufficient.

### Gaps
- No primary GameDiscoverCo newsletter accessed; revenue distribution numbers are from secondary aggregators and should be verified before being stated as fact.
- Did not collect specific indie *failure* postmortems (named games that failed and why) beyond Wrangle Ranch and Among Us 2018.
