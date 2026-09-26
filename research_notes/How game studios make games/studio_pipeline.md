# End-to-end game development pipeline at professional studios (mid-size to AAA)

## Q1. What are the standard phases, and how do definitions differ between studios and publishers?

### Takeaway
The canonical sequence is concept/incubation → prototype → pre-production (ending in a vertical slice) → production (first playable → alpha → beta/content lock) → release candidate → platform certification → gold → launch → live ops. The names are broadly shared, but the exact exit criteria vary by studio and publisher. Because payments depend on them, that variation causes real contract disputes. Most advice is to write explicit exit-criteria documents.

### Cited Findings
- Alpha: "all features are implemented, but the game is not yet content complete and quality is not final." No new gameplay features are added after alpha. — [GameDevProducer](https://gamedevproducer.com/posts/what-is-a-game-milestone-alpha-beta-gold/); [Filament Games](https://www.filamentgames.com/blog/alpha-beta-gold-commitment-high-quality-game-development)
- Beta: all content is complete (every level, enemy, cutscene and quest exists, and the game is playable start to finish). Work shifts to closing bugs, optimizing, and preparing for certification. — [GameDevProducer](https://gamedevproducer.com/posts/what-is-a-game-milestone-alpha-beta-gold/)
- Some sources give a different definition: beta is "feature and asset complete... only bugs are being fixed" and contains no ship-blocking bugs. This is closer to a release candidate, so the term's meaning differs between sources. — [Game Development Wiki](https://gamedev.fandom.com/wiki/Game_development)
- First playable / pre-alpha covers concept lock through the first playable build. It ends with a narrow, polished slice of about 10–15 minutes of gameplay that validates the core mechanic and the visual style. — [GameDevProducer](https://gamedevproducer.com/posts/what-is-a-game-milestone-alpha-beta-gold/)
- Gold / RTM: the build has passed platform certification and meets minimum release quality. Day-one patches are now standard. — [GameDevProducer](https://gamedevproducer.com/posts/what-is-a-game-milestone-alpha-beta-gold/)
- "Different publishers use them slightly differently." Without shared definitions, studios end up in contractual disputes because payment tranches are tied to milestone approvals. The author recommends exit-criteria documents. — [GameDevProducer](https://gamedevproducer.com/posts/what-is-a-game-milestone-alpha-beta-gold/)
- A sample publisher milestone schedule has 12 steps: Prototype, First Playable, Interim Milestone, Vertical Slice, Vertical Chunk, Feature Complete (Alpha), Content Lock, Beta, Release Candidate 1, First-Party Certification, Game Release, Final Build Archive. The example runs from July 2022 to December 2024, about 2.5 years. — [Deviant Legal](https://deviantlegal.com/guide/game-developers-guide-publishing-agreements/milestone-schedules-advance-payments/)
- Riot R&D uses these phases: Incubation → Prototype → Pre-production → Production. Incubation establishes the Opportunity, the Thesis (including what the game will *not* do), and the team's leadership, all before any code is written. — [Riot: Incubation](https://www.riotgames.com/en/r-and-d-office/incubation-exploration-with-a-plan); [Riot: Opportunity, Thesis, Audience](https://www.riotgames.com/en/news/r-d-foundations-opportunity-thesis-and-audience)
- Clinton Keith (*Agile Game Development*) uses a three-part frame of pre-production, production and post-production. Pre-production explores the core mechanics. Production creates the assets (characters, levels). Post-production uses "hardening sprints" that fix issues instead of adding features. — [Agile Game Development summary](https://williammeller.com/agile-game-development-with-scrum-clinton-keith/); [O'Reilly listing](https://www.oreilly.com/library/view/agile-game-development/9780136204831/)
- Certification: a first-pass TRC/XR/Lotcheck review takes about 4–8 weeks per platform. Plan for 2–3 submission rounds per platform, and each rejection adds weeks. After certification passes, Sony's roughly four-week store setup and Nintendo's 30-day Lotcheck window add more time. These figures come from a vendor or trade blog, not from the platform holders. — [NipsApp](https://nipsapp.com/console-certification-process/); [Juego Studio](https://www.juegostudio.com/blog/console-certification-failures-outsourced-games)

### Inferences
- The most reliable cross-studio definitions are these: **alpha = feature complete**, **beta = content complete**, **gold = certification passed**. "Content complete", "content lock" and "beta" are sometimes separate milestones and sometimes the same one.
- For a tool like GameGold, each stage should carry an explicit, checkable exit-criteria list rather than relying on the label alone. That mirrors the industry advice.

### Gaps
- I could not access the primary texts of Chandler's *Game Production Handbook* or *Game Production Toolbox*, so their exact phase definitions are not cited.
- I found no platform-holder primary source for certification durations. The figures above come from QA vendors and blogs.

## Q2. Greenlight and milestone gates: who decides, what evidence is required, and how publisher payments work

### Takeaway
Gates are usually "prove it with a playable": a prototype to show the idea is fun and has an audience, then a vertical slice to show the game can be built at final quality. Publishers release money in tranches against accepted milestone builds. Decision-makers vary widely, from executives and publishers to the development team itself (Supercell).

### Cited Findings
- A vertical slice is a fully playable portion of the game at final quality that shows the intended player experience. It usually marks the end of pre-production: studios stop inventing new systems and commit to building out the existing ones. It is the demo used to convince executives or publishers to fund the rest of development. — [Xsolla](https://xsolla.com/blog/funding-101-the-impact-of-the-vertical-slice); [askagamedev](https://www.tumblr.com/askagamedev/746119896807653376/in-regard-to-the-vertical-slice-do-studios-work)
- Publishing agreements tie funding to milestones. Common payment milestones are core loop, vertical slice, alpha, beta, content complete and release candidate. — [Promise Legal](https://blog.promise.legal/game-publisher-agreements-indie-studios/); [Deviant Legal](https://deviantlegal.com/guide/game-developers-guide-publishing-agreements/milestone-schedules-advance-payments/)
- The total advance "is rarely paid upfront." Milestones should have "measurable, objective criteria: feature completion, stability, performance, or specific gameplay goals." The publisher must respond within a contractual number of business days, and a common developer protection is that no response means the milestone is deemed accepted. Rejected milestones can be resubmitted, sometimes with limited retries. — [Deviant Legal](https://deviantlegal.com/guide/game-developers-guide-publishing-agreements/milestone-schedules-advance-payments/)
- Advances are typically recouped from revenue before royalties are paid to the developer. — [Levelling The Playing Field (Rami Ismail)](https://ltpf.ramiismail.com/upfronts-guarantees-recoups/)
- Riot's prototype exit requires four things: a clear definition of the target audience, a playable experience that shows the key innovations, team understanding deep enough to carry into pre-production, and "proof that the audience likes the experience via playtesting." Teams are greenlit into prototype only after incubation. Projects are pivoted or cancelled on playtest results; one 4-month-old project was fully pivoted when cross-platform proved unviable. — [Riot: Prototype](https://www.riotgames.com/en/r-and-d-office/prototype-building-a-games-substance); [Riot: Incubation](https://www.riotgames.com/en/r-and-d-office/incubation-exploration-with-a-plan)
- Supercell "greenlights teams, not ideas." It has no management greenlight process and no milestone meetings with finance. The cell (the dev team) decides whether to kill its own game. The main gates are prototype, then soft launch (a limited-market release), then global launch. — [Game World Observer](https://gameworldobserver.com/2024/03/14/all-games-killed-by-supercell-everdale-hay-day-pop-clash-mini); [Game Developer](https://www.gamedeveloper.com/business/less-management-more-success-inside-supercell-s-upside-down-organization)
- Of Supercell's last 10 games at the time of that talk, 7 were killed at prototype, 2 at soft launch, and 1 (Clash Royale) launched globally. Game lead Jonathan Dower said the kill decision is not purely analytics-driven. Once the team has a feeling about "the game you 'should' be making... you've probably already killed your game." The team killed Smash Land in a sauna discussion. — [Game Developer](https://www.gamedeveloper.com/design/maybe-it-s-time-to-kill-your-game-and-move-on-supercell-on-cutting-its-losses)

### Inferences
- There are two gate philosophies. One is **publisher/executive gating** based on a playable build plus a contract (common in AAA and work-for-hire). The other is **team-owned gating** based on playtests and market metrics (Supercell; partly Riot, which pairs it with formal phase deliverables). Soft-launch KPIs such as retention and monetization act as the gate for mobile and free-to-play games.

### Gaps
- I found no reliable public source for typical **percentage splits of advances per milestone**. Deviant Legal explicitly gives none, and I did not use aggregator figures.
- I did not find the specific soft-launch retention thresholds Supercell uses, such as D1/D7 targets.

## Q3. Time and budget per phase; why pre-production is where games are "found"; why skipping it fails

### Takeaway
Pre-production is cheap: a small team spending roughly 10–15% of the budget, per a weaker vendor source. Production is where headcount and spend peak. Games that leave pre-production without a proven vision get built in a compressed final stretch with heavy crunch. Anthem and Mass Effect: Andromeda are the best-documented cases.

### Cited Findings
- AAA pre-production can run 12–24 months and use 10–15% of the total budget. Production on a mid-size AAA title typically spans 18–36 months and has the largest headcount. Budgets are estimated as headcount per phase × monthly burn of about $10k–15k per developer. Vendor blog source; treat as indicative. — [Innovecs Games](https://www.innovecsgames.com/blog/aaa-game-development-cost/); [salivity](https://salivity.github.io/game-development/article/how-studios-estimate-aaa-game-development-budgets)
- Insomniac (from the leaked documents of December 2023):
  - Marvel's Spider-Man 2 cost $315M against an original $270M budget, and needed about 7.2M full-price sales to break even.
  - Pre-production began in 2018; the game shipped in 2023.
  - At peak, 264 developers worked directly on the game, plus 116 in management, IT and support roles.
  - Wolverine was budgeted at about $305M, with 173 people on it at the time of the leak.
  - Spider-Man 3 was estimated at $385M.
  — [Kotaku](https://kotaku.com/what-hacked-files-tell-us-about-the-studio-behind-spide-1851115233); [GamingBolt](https://gamingbolt.com/marvels-spider-man-2-had-a-total-budget-of-315-million)
- Clinton Keith warns that starting production before the mechanics and assets are defined means building assets on evolving ideas, which causes waste and rework. — [Agile Game Development summary](https://williammeller.com/agile-game-development-with-scrum-clinton-keith/)
- **Anthem (BioWare):**
  - By the end of 2016 it had been in some form of pre-production for about four years.
  - It was still in pre-production when it was revealed at E3 2017, and it entered production with less than a year left.
  - No playable mission was implemented until 2018, the final year.
  - Leadership counted on "BioWare magic," meaning last-minute cohesion through crunch. Stress leave spread through the team.
  - BioWare publicly disputed parts of the report.
  — [Kotaku](https://kotaku.com/how-biowares-anthem-went-wrong-1833731964); [PC Gamer on BioWare response](https://www.pcgamer.com/bioware-denies-crunch-was-a-major-topic-among-employees/)
- **Mass Effect: Andromeda:** five years in development, but most developers said the bulk of the game was built in the last 18 months (end of 2015 to March 2017) after a messy pre-production. That pre-production included pursuing procedural planets and losing key leads (Casey Hudson in 2014, then director Gérard Lehiany). Some employees dispute the 18-month figure. — [Kotaku](https://kotaku.com/the-story-behind-mass-effect-andromedas-troubled-five-1795886428); [Forbes](https://www.forbes.com/sites/insertcoin/2017/06/07/report-mass-effect-andromeda-lost-its-way-chasing-no-man-s-sky-like-procedural-planets/)
- **Half-Life (Valve):** after an initial version that "wasn't any fun," Valve reworked the game, and release slipped from November 1997 to November 1998. The extra year of redesign (the Cabal process, see Q5) produced 50+ Game of the Year awards. — [Game Developer: The Cabal](https://www.gamedeveloper.com/design/the-cabal-valve-s-design-process-for-creating-i-half-life-i-)
- **Breath of the Wild (Nintendo):** Hidemaro Fujibayashi first built a 2D, NES-style prototype to test the physics and chemistry ideas (wind shaking trees, fire arrows through flames) before bringing them into 3D. This was presented at GDC 2017. — [TechRadar](https://www.techradar.com/news/zelda-breath-of-the-wilds-creators-prototyped-with-the-original-nes-classic); [Tom's Guide](https://www.tomsguide.com/uk/us/zelda-breath-wild-design,news-24586.html)

### Inferences
- The pattern is consistent. A long, unfocused pre-production *without* a vertical slice or proof of fun does not buy safety: the real game still gets made in 12–18 months of production, just under crunch. Pre-production "finds" the game because iteration is cheap only while the team is small and assets are throwaway.
- The failure mode is not only *skipping* pre-production. It is also *staying in it without converging* (Anthem, Andromeda) and then being forced into production by an external date.

### Gaps
- I found no authoritative, sourced industry-wide split of budget by phase (for example, from Chandler or a GDC survey). The 10–15% figure comes from a vendor blog.
- There are no primary figures on typical pre-production team size as a percentage of peak.

## Q4. Team roles and how staffing ramps across phases

### Takeaway
Teams start small and senior (director, leads, a few engineers and artists), grow to peak headcount during production (hundreds in AAA), then shrink after beta or gold, with QA and certification peaking at the end. Role structures vary sharply. Some studios run without producers (Naughty Dog, Valve); others have roughly one producer per ten developers.

### Cited Findings
- Riot prototype teams are small groups of "professionals with strong genre affinity," working with a throw-away-work mindset and building a "game scaffold" of the minimum representative genre features. — [Riot: Prototype](https://www.riotgames.com/en/r-and-d-office/prototype-building-a-games-substance)
- Riot has published how its R&D user research (UR) supports prototype and pre-production through playtests at key milestones (GDC talk by Austin Harley and Tom Barnes). — [YouTube: Riot R&D User Research](https://www.youtube.com/watch?v=qknAYNbffGw); [Riot: Prototype](https://www.riotgames.com/en/r-and-d-office/prototype-building-a-games-substance)
- Supercell cells have about 10–17 developers each. At one point the company had about 180 staff, with about 70 of them developers. — [Game World Observer](https://gameworldobserver.com/2024/03/14/all-games-killed-by-supercell-everdale-hay-day-pop-clash-mini); [Game Developer](https://www.gamedeveloper.com/design/maybe-it-s-time-to-kill-your-game-and-move-on-supercell-on-cutting-its-losses)
- Naughty Dog has no one titled "producer." Richard Lemarchand (DICE 2010) described the philosophy as empowering developers to organize themselves and make decisions. At a peak of more than 300 staff it had only two "production coordinators," compared with the industry norm of "a producer per ten people." — [Game Developer: DICE 2010](https://gamedeveloper.com/pc/dice-2010-naughty-dog-s-lemarchand-on-why-the-studio-has-no-producers); [Game Developer](https://www.gamedeveloper.com/production/ex-naughty-dog-dev-explores-the-perks-of-a-studio-devoid-of-dedicated-management-)
- Staffing curve examples:
  - Spider-Man 2 peaked at 264 direct developers plus 116 support staff. — [Kotaku](https://kotaku.com/what-hacked-files-tell-us-about-the-studio-behind-spide-1851115233)
  - Wolverine had 173 people before full ramp, with reports of full-scale teams of 450–500. The 450–500 figure comes from a secondary source (WN Hub) and is unverified. — [WN Hub](https://wnhub.io/news/investment/item-42610)
- Valve's Half-Life Cabal had no dedicated designers. Every member (3 engineers, 1 level designer, 1 writer, 1 animator initially) also built shipping content. — [Game Developer: The Cabal](https://www.gamedeveloper.com/design/the-cabal-valve-s-design-process-for-creating-i-half-life-i-)

### Inferences
- A typical ramp:
  - Concept/incubation: about 3–10 people (director, lead designer, tech director, art director, producer).
  - Prototype: about 5–15 people, adding systems designer and engineers; UR joins for playtests.
  - Pre-production: tens of people, adding level designers and pipeline/tools engineers to build the vertical slice.
  - Production: peak, 100–300+ people in AAA, plus outsourcing.
  - Alpha to beta: QA peaks.
  - Post-gold: the team shrinks to a live-ops or DLC crew.

  This is synthesized from the examples above, not taken from a single source.
- Studio-size difference: mid-size and mobile studios keep the same small team through every phase (Supercell). AAA studios use a small "core" team that is later scaled up, often with co-dev partners.

### Gaps
- I found no authoritative per-phase headcount table and no published role-by-phase RACI chart from a named studio.

## Q5. Concrete named-studio practices and postmortems

### Takeaway
Named studios differ mainly in *who* holds the gate and *how cheaply* they kill projects. Valve iterates through cross-discipline cabals and heavy playtesting, Blizzard cancels about half its projects, Supercell's teams kill their own games, and Riot uses phase gates backed by user research. Postmortem research shows that management and scope problems, not technology, dominate what goes wrong.

### Cited Findings
- **Valve's Cabal process (Half-Life):**
  - Structure: an initial 1-month prototype phase, then the Cabal met 4 days a week, 6 hours a day, for 5 months, and on and off until ship. Later cabals had 8–12+ people, members rotated monthly, and "mini-cabals" formed for specific problems.
  - Output: a design document of 200+ pages.
  - Playtesting: 200+ sessions of 2 hours each. Observers stayed silent, each session produced about 100 action items, and results were graphed to find boring, too-easy or too-hard areas.
  - Guiding concepts: "experiential density" and "player acknowledgment."
  — [Game Developer: The Cabal (Ken Birdwell)](https://www.gamedeveloper.com/design/the-cabal-valve-s-design-process-for-creating-i-half-life-i-)
- **Blizzard:**
  - Former Blizzard president Mike Morhaime said the studio has historically cancelled about 50% of the games it works on. His view: "It's way more important that the game is great — it's way less important that you hit the date." — [GamesRadar](https://www.gamesradar.com/blizzard-canceled-games/)
  - Titan (an MMO) was in development about seven years (circa 2007–2014) and cost an estimated $80M. About 40 Titan members reused its assets to make Overwatch (2016). — [Wikipedia: Titan](https://en.wikipedia.org/wiki/Titan_(cancelled_Blizzard_Entertainment_video_game)); [Wikipedia: Development of Overwatch](https://en.wikipedia.org/wiki/Development_of_Overwatch)
- **Supercell:** 30+ games killed and only about 5–7 shipped globally (the count depends on date). The global hits are estimated to have made over $13.5B in lifetime revenue. The revenue figure comes from a secondary source. — [Game World Observer](https://gameworldobserver.com/2024/03/14/all-games-killed-by-supercell-everdale-hay-day-pop-clash-mini); [CellString](https://cellstring.com/news/article/30-killed-games-the-secret-history-of-supercells-graveyard)
- **Riot:** the Opportunity/Thesis/Audience framework in incubation, prototype exit criteria that include playtest proof, and willingness to pivot a project at month four. — [Riot R&D](https://www.riotgames.com/en/r-and-d-office/prototype-building-a-games-substance); [Riot: Game Over, Good Game](https://www.riotgames.com/en/r-and-d-office/game-over-good-game)
- **Nintendo:** prototypes a mechanic in the simplest possible form before investing in it (the 2D prototype for Breath of the Wild). — [TechRadar](https://www.techradar.com/news/zelda-breath-of-the-wilds-creators-prototyped-with-the-original-nes-classic)
- **Postmortem research:** Washburn et al. (RIT and Microsoft Research, ICSE 2016) analyzed 155 Gamasutra postmortems spanning 16 years, across 12 categories (art, team, marketing, scope and others), and distilled best practices and pitfalls. An earlier ACM study of 20 postmortems (Petrillo et al.) found that game development suffers mostly from management problems rather than technical ones, with unrealistic scope and feature creep prominent. — [Game Developer summary](https://www.gamedeveloper.com/audio/study-combs-through-155-gamasutra-postmortems-for-what-went-right-and-wrong); [Microsoft Research PDF](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/06/washburn-icse-2016-2.pdf); [ACM: What went wrong?](https://dl.acm.org/doi/abs/10.1145/1486508.1486521)

### Inferences
- The studios with the strongest reputations for quality (Valve, Blizzard, Nintendo, Supercell) share a willingness to delay or kill a project based on a playable, and they own that decision internally. Studios under publisher or date pressure (BioWare's Anthem) are the ones that crunch.

### Gaps
- I did not verify the specific category percentages in the Washburn study (claims such as "75% scope issues" appeared only on aggregator sites). Consult the primary PDF before citing numbers.
- I did not locate an Insomniac primary source on its formal greenlight process. GDC Spider-Man talks cover creative and technical topics, not gating.
- I did not fetch the Valve *Handbook for New Employees* (flat structure, "cabals" as self-formed project teams); it is only referenced here.

## Q6. Agile/Scrum vs. milestone-driven production; crunch tied to phase failures

### Takeaway
Most studios run a hybrid. Agile or Scrum sprints handle iteration during pre-production and production, and a milestone plan satisfies publishers, marketing and platform certification. Crunch comes most reliably from a failed or late transition out of pre-production, which pushes the real work into a fixed-date end game.

### Cited Findings
- Clinton Keith (15+ years in games, 7 with Scrum) adapts Scrum to games. He warns against starting production early and recommends "hardening sprints" before release that focus on refinement instead of features. — [Agile Game Development with Scrum](https://www.amazon.com/Agile-Development-Scrum-Addison-Wesley-Signature/dp/0321618521); [Game Developer: Agile Game Development with Scrum: Teams](https://www.gamedeveloper.com/production/agile-game-development-with-scrum-teams)
- Milestone contracts impose fixed deliverables and dates (see Q2). Their exit criteria are objective checkpoints, while the work in between is often run iteratively. — [Deviant Legal](https://deviantlegal.com/guide/game-developers-guide-publishing-agreements/milestone-schedules-advance-payments/)
- IGDA Developer Satisfaction Survey 2023: 28% said their job involved crunch, and another 25% reported periods of long hours or extended overtime that they did not call crunch. Many, especially freelancers, see crunch as an expected part of the job. — [IGDA press release](https://igda.org/news-archive/press-release-the-igda-and-western-university-release-2023-developer-satisfaction-survey/); [GamesMarket](https://www.gamesmarket.global/developer-satisfaction-survey-crunch-or-long-hours-expected-as-a-normal-part-of-the-job-dc7d25d8a3f42026a076cfe9fa1e8ac7/)
- Anthem's reliance on "BioWare magic" is a documented case of crunch caused directly by a pre-production failure. — [Kotaku](https://kotaku.com/how-biowares-anthem-went-wrong-1833731964); [Engadget](https://www.engadget.com/2019-04-04-anthem-crunch-bioware-ea-game-development.html)

### Inferences
- Crunch maps to specific phase failures:
  1. Leaving pre-production without a proven vertical slice, so the design churns during production.
  2. Late scope cuts and feature creep after alpha.
  3. Certification or submission deadlines fixed by platform holders or marketing beats (E3 reveals).
- Agile helps most in phases 1–3 (prototype through production). It helps least against immovable external dates.

### Gaps
- I found no rigorous comparative study (as opposed to practitioner opinion) that measures Agile vs. waterfall/milestone outcomes in games.
