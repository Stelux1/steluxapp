# Izveštaj o paritetu — Weld Pilot i MTO Pilot prema WeldPilot i MTOPilot

Datum: 16.11.2026. Kod: `df5617a` (grana `claude/blitzkrieg-detailed-audit-615f44`). **Pušteno 16.11.2026. uveče: živa baza je nadograđena po redosledu iz README-a (rezervna kopija `backups/before-welding-live-2026-11-16T20-17-44.845Z/`), `main` je na `858a0e3`, živi sajt isporučuje novi build (health 200, stil i polja nove verzije). Posle prijave na živom sajtu ništa nije provereno — to čeka vlasnika.** Prva verzija radi na `2f41d99`. Drugi i treći bezbednosni pregled i drugi prolaz kroz scenarije su gotovi; završna (četvrta) proba nadogradnje na `df5617a`, na svežoj kopiji živih podataka, prošla je 20 od 20 koraka. Kratak četvrti bezbednosni pregled je u toku; odluku o puštanju upisuje lead.

Ukratko: referenca je snimljena samo čitanjem, upoređena oblast po oblast (605 nalaza), svaki nalaz je proverio drugi čitalac, prošli smo 17 radnih scenarija i napravili četiri talasa ispravki (52 toka). Konačno stanje nalaza (proveravao sam skriptom na JSON fajlovima): **ispravljeno 475, delimično 30, pogrešan nalaz 8, nije ispravljeno 2** (od 515 nalaza sa ishodom). Sedam delimičnih je kasnije zatvoreno pod drugim brojem, pa je stvarno stanje 482 ispravljeno i 23 delimično. Testovi na `df5617a` (lead-ov ceo lanac): 1097 testova, 1083 prolazi, 0 grešaka, 14 preskočeno (PostgreSQL); na PostgreSQL-u 1097 od 1097, nijedan preskočen; svi build-ovi prolaze.

Oznake u tabelama:
- **Isto** — snimak i naše se poklapaju (ili je referenca stavku sakrila, pa je nema ni kod nas).
- **Ispravljeno sada** — razlika je nađena i ispravka je spojena; sitni ostaci su navedeni.
- **Razlika ostaje** — korisnik reference će primetiti razliku; razlog je naveden.
- **Nije moglo da se utvrdi** — stranica je za naš nalog bez prava ili red nije u snimku; građeno po uputstvu.

Brojevi u zagradama su nalazi iz `reference/montavar/raw/_findings/LEDGER.json`.

## (a) Svaka stavka referentnog menija

### Weld Pilot (redosled iz `weld__start__dashboard.txt`)

| Grupa → stavka | Stanje | Dokaz |
|---|---|---|
| General data → Project sites | Ispravljeno sada | shell-general-001..015, -003, -012; ostaje: brisanje arhivira, server prima sajt bez težina (-R1), Duplicate bez opcija ISO Book / Memo / Daily reporting |
| General data → Companies | Ispravljeno sada | shell-general-027 |
| General data → Attachment names | Ispravljeno sada | shell-general-028, -029; u seed-u je zaključan samo ITP |
| Start → Dashboard | Ispravljeno sada | weld-dashboard-reports-001..021, -029, delta-I2b-006, -007; ostaje: Repaired po podrazumevanom (R3), Project book nije napravljen (R2), sadržaj PDF izveštaja delimično poznat |
| Start → Daily reporting | Razlika ostaje — odloženo (D6) | weld-dashboard-reports-025 |
| Handheld → Scan weld | Razlika ostaje — odloženo | weld-punch-flanges-010 |
| Handheld → Scan flange QR label | Razlika ostaje — odloženo | weld-punch-flanges-010 |
| Handheld → Add punch | Razlika ostaje — odloženo (ručni unos ostaje na Punch lists i izometriji) | weld-punch-flanges-010 |
| Welder data → Welders | Ispravljeno sada | weld-catalogs-welder-weld-001..020, delta-I2a-001, -002, w1-left-8 |
| Welder data → Roles | Ispravljeno sada | weld-catalogs-welder-weld-014, w1-left-7 |
| Welder data → Certificates | Razlika ostaje (sitno) | naslov stranice i dugme dodavanja nisu prevedeni na referentne (weld-catalogs-welder-weld-015 delimično) |
| Welder data → Customs | Razlika ostaje (sitno) | -016, -017 ispravljeni; naslov kao kod Certificates (-015) |
| Weld data → PQR | Ispravljeno sada | weld-catalogs-welder-weld-021..027, -041, w1-left-9, -10 |
| Weld data → WPS Designer | Razlika ostaje — odloženo (D6) | — |
| Weld data → WPS methods | Ispravljeno sada | weld-catalogs-welder-weld-028..031, delta-I2a-003, -004; kopija nosi sufiks „(<sajt>)" jer su brojevi WPS jedinstveni |
| Weld data → Weld process (u referenci skriveno) | Isto | uklonjeno iz našeg menija (shell-general-025) |
| Weld data → Weld type | Ispravljeno sada | weld-catalogs-welder-weld-032, -033, -038, -039 |
| Weld data → Coating | Ispravljeno sada | isto |
| Weld data → Spools | Ispravljeno sada | weld-catalogs-welder-weld-034, -035; Edit pokazuje samo trenutni glavni projekat |
| Report generator → Form designer | Razlika ostaje — odloženo (D6) | — |
| Report generator → My templates | Razlika ostaje — odloženo (D6) | — |
| Material data → Weld diameters | Ispravljeno sada | weld-catalogs-material-ndt-007..009; naš dodatak Export (-006) |
| Material data → Material part | Ispravljeno sada | -010, -011 |
| Material data → Type of material | Ispravljeno sada | -012..-014; format kolone ISO / ASME nije moglo da se vidi (-015) |
| Material data → Material supplier | Ispravljeno sada | -016, -017 |
| Material data → Welding wire | Razlika ostaje | -018, -019 ispravljeni; nema dugmeta Refresh (-022); brojevi žica nisu nezavisni po glavnom projektu zbog jedinstvenog indeksa (-023); Note je običan tekst |
| Material data → Certifications | Ispravljeno sada | -024..-032, delta-I2a-005, w1-left-5; raspored uvoza je naš (pitanje klijentu 1); naš dodatak Certification index (-033) |
| NDT data → NDT process groups | Ispravljeno sada | -034 |
| NDT data → NDT process | Ispravljeno sada | -035, -036 |
| NDT data → Defect codes | Ispravljeno sada | -037..-041, w1-left-3 (svih 98 kodova) |
| NDT data → NDT locations | Ispravljeno sada | -042; w1-left-2 pogrešan nalaz |
| NDT data → PWHT process | Ispravljeno sada | -005 (naslovi) |
| NDT data → PWHT locations | Ispravljeno sada | -042; polje Notes nije provereno (beleška talasa 3) |
| Welding data → Projects | Ispravljeno sada | iso-shared-022, -025..-028; pravilo Status (%) nepoznato (-023, -024) |
| Welding data → Isometrics list | Ispravljeno sada | iso-shared-001..010; KPI PWHT Approved i Documentation nepotvrđeni (-006); nema Refresh data (uživo) |
| Welding data → ITPs | Nije moglo da se utvrdi | stranica bez prava; građeno po uputstvu §18 (weld-releases-033, -034); ITP matrix i templates nisu napravljeni |
| Welding data → Iso overview | Razlika ostaje | iso-shared-037 ispravljen; nema Set ITP (mass), Import calculations, Undo last import |
| Welding data → NDT/PWHT Manager | Ispravljeno sada | weld-inspections-020..032; izvoz arhiva samo CSV |
| Welding data → NDT Batch Import | Nije moglo da se utvrdi | stranica bez prava; napravljeno po uputstvu §21 (shell-general-024) |
| Welding data → ISO PDF Import (u referenci skriveno) | Isto | skriveno u referenci, kod nas ne postoji |
| Welding data → QA/QC engineers | Ispravljeno sada | weld-catalogs-material-ndt-043 |
| Welding data → Export weld data | Razlika ostaje | stranica ispravljena (weld-dashboard-reports-022, -023); kolone su naš Data LISL jer referentne nisu snimljene (-024) |
| Releases → Prefab release | Ispravljeno sada | weld-releases-001, -002, -008..-012, -014..-018 |
| Releases → Field release | Ispravljeno sada | isto |
| Releases → Assign Iso to FWP | Razlika ostaje (sitno) | weld-releases-030, -031 ispravljeni; paketi imaju naše Project / Package no. i arhivu (-032) |
| Releases → Hydrotest release | Ispravljeno sada | weld-releases-020, -022..-028 |
| Releases → Request archive (u referenci skriveno) | Isto | uklonjeno iz našeg Weld menija (weld-releases-029, mto-logistics-001) |
| Releases → Punch lists | Ispravljeno sada | weld-punch-flanges-001..017, -031, -R1..-R3, delta-I2c-001..003; bez izbora jezika, Print se preuzima |
| Releases → Flange Management | Razlika ostaje | stranica prirubnice napravljena (-020); Add / Edit flange opet čuvaju (`8b06dde`); posle potpisanog zapisnika Status ostaje „Planned" (SB2 N9-2); nema predloga iz tablica pritezanja (-023), status izveden (-026), nema Excel uvoza (-027), Export je CSV (-019), natpisi se razlikuju (-022) |
| System → Change password | Ispravljeno sada | shell-general-021, access-users-profiles-R1; najmanja dužina ostaje 10 |
| System → Change theme | Razlika ostaje | nije napravljeno (shell-general-020; pitanje vlasniku V12) |
| System → User accounts | Razlika ostaje | profil po sajtu (access-users-profiles-001) i lista ispravljeni; nema posebnog Username, drugo pravilo lozinke (-002, -003, -023) |
| System → Profiles | Ispravljeno sada | access-users-profiles-006..-013; nema oblasti 125 (-007) |
| System → Signatures | Ispravljeno sada | access-users-profiles-014..-016; raspored i JPEG su naši (-017) |
| Zaglavlje → User Manuals | Razlika ostaje | nije napravljeno (shell-general-019) |
| Zaglavlje → Change project site / Logout | Ispravljeno sada | shell-general-015, -017, w1-left-12 („Change site") |
| Zaglavlje → jezici (NL, EN, DE, FR) | Razlika ostaje — odloženo | samo engleski (D9) |
| Zaglavlje → zvonce, Expire warnings | Ispravljeno sada | shell-general-016, weld-catalogs-welder-weld-018..020 |
| Zaglavlje → svetlo / tamno | Razlika ostaje | nije napravljeno |

Naše stavke kojih nema u referentnom Weld meniju:

| Stavka | Stanje | Dokaz |
|---|---|---|
| General data → Documents | naš dodatak | predlog: ukloniti iz menija (shell-general-026; pitanje vlasniku V3) |
| Welding data → Weld register | naš dodatak | predlog: ukloniti iz menija (weld-dashboard-reports-026) |
| Welding data → Data LISL | naš dodatak | predlog: ukloniti; kolone su sada u Export weld data (-027) |
| Welding data → Inspection results | naš dodatak | predlog: ukloniti iz menija (-028) |
| System → Company data | ostaje | uputstva navode Edit company data za administratora (access-users-profiles-022, shell-general-022) |

### MTO Pilot (redosled iz `mto__start__dashboard.txt`)

Napomena: MTO snimci ne prikazuju redove koji su već snimljeni na drugim stranicama. Naslovi grupa General data, Start, System, stavke Change password, Change theme i red posle Pick List archive (Iso overview) su rekonstruisani po broju redova (shell-general-026).

| Grupa → stavka | Stanje | Dokaz |
|---|---|---|
| General data → Project sites | Ispravljeno sada | shell-general-011 (Import Materials DB from another project site) i isto kao Weld |
| General data → Storehouses | Nije moglo da se utvrdi | stranica bez prava; građeno po MTO uputstvu §5 (mto-catalogs-023, -024, mto-procurement-stock-R1, -R2, -012, -029, -030); isto ime skladišta se odbija |
| Start → Dashboard | Ispravljeno sada | mto-iso-execution-018..025, delta-I3-003, mto-logistics-020; nema Readiness focus za startable grupu ni podnaslova panela |
| Materials → Material database | Razlika ostaje | mto-catalogs-001..009, -011, -014 ispravljeni; Delete material arhivira za sve glavne projekte, referenca briše samo za trenutni sajt |
| Materials → Material part | Ispravljeno sada | mto-catalogs-009 |
| Materials → Type of material | Ispravljeno sada | mto-catalogs-009 |
| Materials → UOMs | Ispravljeno sada | mto-catalogs-020; sadržaj liste su klijentovi podaci (-019) |
| Materials → Spools | Ispravljeno sada | weld-catalogs-welder-weld-034, mto-catalogs-022 |
| Materials → Operation Phases | Ispravljeno sada | mto-catalogs-015, -017; sadržaj liste su klijentovi podaci (-016) |
| Materials → Material supplier | Ispravljeno sada | weld-catalogs-material-ndt-016, -017 |
| Order / Take in → Order materials | Ispravljeno sada | mto-procurement-stock-013..016, -021, -025, -033; otvorena porudžbina se oduzima jednom (`b651bbf`, SC2 N-A) |
| Order / Take in → Pending order | Ispravljeno sada | mto-procurement-stock-024; naši dodaci (-027) |
| Order / Take in → Material take in | Razlika ostaje (sitno) | -017, -018, -026 ispravljeni; nema Receive all materials, dugmadi izvoza i kolone Audit |
| Order / Take in → Material inventory | Razlika ostaje (sitno) | -001..-008, -022..-024, -028, -031, -032 ispravljeni; nema stranice Import (-022) |
| Order / Take in → Materials list | Razlika ostaje | mto-iso-execution-026 ispravljen; naša lista je uživo, referenca noćni snimak (-027) |
| Order / Take in → Order archive | Ispravljeno sada | mto-procurement-stock-019, -020; stranica sadržaja bez kolone Audit |
| Order / Take in → Certifications | Ispravljeno sada | kao u Weld Pilot |
| Projects data → Projects | Ispravljeno sada | kao u Weld Pilot; obe stavke uvoza vidljive (referenca u MTO samo ikonica) |
| Projects data → Isometrics list | Ispravljeno sada | iso-shared-005 (MTO kartice); Documentation 0 naspram 1/7 |
| Projects data → Isometric execution | Ispravljeno sada | mto-iso-execution-013..017, delta-I3-001, -R1; dugmad u Options opet klikabilna (`b651bbf`); Start izdaje sve dostupne redove i na Shop čipu (SC2 N-B), da li referenca uzima samo izabrani Type — nepoznato (delta-I3-002) |
| Projects data → Pick List archive | Ispravljeno sada | mto-iso-execution-014..016; naša dodatna kolona Lines |
| Projects data → Iso overview | Nije moglo da se utvrdi | red sakriven u snimku, rekonstruisan po broju redova; naša stavka otvara isti dijalog kao u Weld Pilot |
| Logistic → Service companies | Ispravljeno sada | mto-logistics-016, -022 |
| Logistic → Service request | Ispravljeno sada | mto-logistics-002..007, -012..-014, -019; nema straničenja po 100 redova (-015) |
| Logistic → Service req. - Materials | Ispravljeno sada | mto-logistics-010, delta-I3-010; -011 pogrešan nalaz |
| Logistic → Request archive | Ispravljeno sada | mto-logistics-004, -005, -008, -009, -023; zatvaranje skeniranjem QR koda odloženo |
| Logistic → Laydown areas | Ispravljeno sada | mto-logistics-017 |
| Logistic → Laydown materials | Ispravljeno sada | mto-logistics-018 |
| System → Change password | Ispravljeno sada | kao u Weld Pilot |
| System → Change theme | Razlika ostaje | nije napravljeno |
| System → User accounts | Razlika ostaje | kao u Weld Pilot; Storehouse manager dodat (delta-I2b-005) |
| System → Profiles | Ispravljeno sada | kao u Weld Pilot |

Naše stavke kojih nema u referentnom MTO meniju:

| Stavka | Stanje | Dokaz |
|---|---|---|
| General data → Documents | naš dodatak | predlog: ukloniti iz menija (V3) |
| Calculations → MTO & calculations, Calculation norms | ostaje | tvoja odluka D8 (mto-catalogs-010) |
| System → Company data | ostaje | kao u Weld Pilot |
| Transfer orders | već uklonjeno iz menija (talas 4) | otvara se dugmetom na Storehouses (mto-procurement-stock-010) |
| Isometric materials | već uklonjeno iz menija (talas 3) | mto-procurement-stock-011 |

## (b) Ispravke po talasu i toku, sa commit-ovima spajanja

Iz `git log --oneline --first-parent c1c123a..e5209c9`. Broj u zagradi: nalazi tog toka (ispravljeno / delimično / pogrešan nalaz / nije ispravljeno).

**Talas 1** (91 nalaz: 82 / 9 / 0 / 0)

| Tok | Šta | Spajanje |
|---|---|---|
| C1 | opšti katalozi i NDT podaci (Delete, Enable on this site, Options, naslovi, defect kodovi) | `6dfbe8d` |
| C2a | Material data (prečnici, delovi, tipovi materijala, dobavljači, žice) | `d57a3cc` |
| C2b | Certifications i veza žica / sertifikata sa sajtom | `451cb44` |
| C3 | Welder data | `ccd4181` |
| C4 | WPS i PQR | `903fb84` |
| S1a | ljuska: Project sites, zvonce, meni naloga, prazna stanja | `d639f00` |
| lead | Roles natpisi; pripremni niz nadogradnje | `63f010c`, `e211351` |

**Talas 2** (137 nalaza: 120 / 14 / 3 / 0)

| Tok | Šta | Spajanje |
|---|---|---|
| w2-upgrade-additive | nadogradnja samo umeće | `6927516` |
| w2-refusal-texts | tekstovi odbijanja i 409 | `9148fd6` |
| w2-flanges | lista i forma prirubnica | `f1fbe69` |
| w2-itp-register | ITPs, Scope, Link ITP | `7fcbe60` |
| w2-visual-inspection | VT hub | `68d6afd` |
| w2-mto-material-db | Material database, uvoz, UOM, faze | `6bb7285` |
| w2-mto-spool-logistics | Logistic za spool-ove | `43cdb82` |
| w2-iso-pages | Projects, IRN, Add rev, Add new | `48e8aec` |
| w2-hydrotest | Hydrotest release | `2654b18` |
| w2-punch-model | punch model i odobrenje | `3ec961f` |
| w2-ndt-results-tracers | NDT dijalog i traceri | `6f5489c` |
| w2-access-core | profil po sajtu, ulazak u pilot, oblasti | `82df868` |
| w2-iso-state-core | Prefab / Field complete, blokade, zaključavanje | `f90497c` |
| w2-mto-stock-core | model zalihe i Material status | `f0041db` |
| lead | sitne ispravke posle spajanja | `e29f267` … `9836f11` |

**Talas 3** (225 nalaza: 213 / 7 / 4 / 1)

| Tok | Šta | Spajanje |
|---|---|---|
| w3-security-fixes | deset nalaza bezbednosnog pregleda | `8b982ff` |
| w3-catalog-shell-leftovers | ostaci kataloga i ljuske, 98 defect kodova | `ad232cf` |
| w3-welder-card | Welder card, Certificates and files | `49b2b6e` |
| w3-flange-record | stranica prirubnice i zapisnik | `f49ddda` |
| w3-vt-site-settings | VT V2 podešavanja | `c5630e4` |
| w3-mto-execution | Isometric execution, Start, Undo, pick liste | `26758bb` |
| w3-service-request-docs | PDF zahteva servisa i Sign online | `0ad2ac8` |
| w3-mto-dashboard | MTO dashboard | `17dbc54` |
| w3-access-ui | korisnici, profili, potpisi, lozinka | `6471a48` |
| w3-punch-lists | punch dijalog po izometriji | `7c9b9f6` |
| w3-mto-iso-materials | Materials na MTO izometriji | `14f48d6` |
| w3-mto-material-sites | materijali po glavnom projektu, Clean import | `b2b98af` |
| w3-mto-procurement | porudžbine i prijem | `6e391aa` |
| w3-mto-stock-ui | skladišta i inventar | `1e79e89` |
| w3-access-session-sites | sajt u sesiji, brisanje sajta | `608f74e` |
| w3-ndt-manager | NDT/PWHT Manager | `a9f972c` |
| w3-release-pages | stranice izdavanja | `c4557ac` |
| w3-iso-page-dialogs | blokade kao linkovi, Attachments, Audit trail, ITPS | `71a3904` |
| w3-weld-table | tabela varova, Mass edit, Stamp | `813fc1d` |
| w3-weld-form | forma vara | `c395927` |
| w3-iso-list-metrics | Isometrics list, M / E / W, napredak | `89ce756` |
| lead E1–E10 | usklađivanje posle spajanja | `9b3a86a` … `861bb38`, `b46182d`, `a4d94a8` |

**Talas 4** (63 nalaza: 60 / 1 / 1 / 1)

| Tok | Šta | Spajanje |
|---|---|---|
| w4-inspection-cell | ćelije pregleda u tabeli varova | `6e4a5a4` |
| w4-project-iso-pages | Projects, Iso overview, Add / Edit isometric | `aed2c2d` |
| w4-weld-form-rules | Validation on WPS, prečnik, Add welds | `46dc617` |
| w4-spool-catalog | katalog spool imena | `29edb70` |
| w4-transfer-orders | transfer nalozi | `1066f1f` |
| w4-memo-templates | memo šabloni, ISO Book prekidači | `78dc6b2` |
| w4-weld-dashboard | Weld dashboard | `40186eb` |
| w4-dashboard-reports | izveštaji sa dashboard-a | `3c225ea` |
| w4-exports | izvozi po pravu Export | `f03a432` |
| w4-ndt-batch-import | NDT Batch Import | `ea8e210` |
| w4-project-import | uvoz projekata | `f2683a5` |
| lead | izveštaji posle novih pravila, natpisi uvoza, test nadogradnje, Add / Edit weld ponovo otvara | `105199a`, `b15621c`, `88d7f44`, `e5209c9` |

**Posle talasa 4** (integration/final, pa grana audita)

| Šta | Commit | Spajanje |
|---|---|---|
| Bezbednosni pregled 2: visoki nalazi (prava profila u dosegu urednika; Undo NDT zahteva traži Delete) | `cb66367` | `915a7fd` / `bba3055` / `a6490c8` |
| Bezbednosni pregled 2: srednji nalazi (poručivanje u opsegu, Storehouse manager kao promena pristupa, zatvoren dokaz prirubnice, isključeni projekti) | `cc2ed5e` | isto |
| Bezbednosni pregled 2: niski nalazi | `89b9a18` | isto |
| Drugi prolaz: prirubnice (Add / Edit opet čuvaju, stress samo uz Target Stress, lokalno vreme u PDF-u) | `8b06dde` | isto |
| Drugi prolaz: MTO (otvorena porudžbina jednom, dugmad izvršenja, Material log, prijem) | `b651bbf` | isto |
| Drugi prolaz: Weld (kvalifikacije uzornih zavarivača, Bring back, potvrda Unlink ITP, Field release na Shop+Field ITP, PDF odbijanja 403, oznake zavarivača za ograničene naloge, tekst zahteva) | `925062a` | isto |
| Nadogradnja samo umeće; proba poredi red po red | `6e64e64` | isto |
| Duplikat na PostgreSQL-u više ne daje internu grešku; PostgreSQL testovi prolaze; stara zaliha po glavnom projektu | `a1cda34`, `5c7e6c9`, `db4dea4` | `88e4c40` |
| Stara zaliha se broji za svoj glavni projekat i na hosted serveru i u pregledaču (izvedene vrednosti `legacySiteId`, `legacyClaimed`, nikad sačuvane); stari otvoren transfer nalog opet pokazuje izvor i može da se završi | `cf99e5e` | `df5617a` |

## (c) Šta nije provereno

- **Živi sajt posle prijave** — ništa; treba da se prijaviš ti.
- **Sadržaj dokumenata prema PDF-ovima reference** — nijedan dokument reference nije otvoren (LISL varijante, weld card, labels, ISO Book, Punch list - blank, Flange report, PDF zahteva, izveštaji dashboard-a, Export.xlsx), jer otvaranje pravi dokument; naši su upoređeni samo sa uputstvom. Čeka tvoju dozvolu (V9).
- **Stranice bez prava na referenci** — ITPs, ITP templates, Storehouses, NDT Batch Import, uvoz prirubnica; građeno po uputstvu.
- **PostgreSQL** — ceo paket prolazi na PostgreSQL-u (1097 od 1097 u četvrtoj probi); nisu provereni row-level security u pravom radu ni više instanci servera (bezbednosni pregled 3).
- **Pregledači i širine telefona** — Safari i Firefox nisu pogledani (nijedan izveštaj ih ne pominje). Širina telefona je proverena samo u tokovima C4, w2-ndt-results-tracers, w2-mto-material-db, w3-mto-material-sites, w3-service-request-docs, w3-mto-procurement, w3-flange-record, w3-mto-dashboard, w4-ndt-batch-import, w4-project-import i w4-weld-dashboard.
- **Ekrani koje nijedan graditelj nije otvorio u pregledaču** — C1, C2a, C3, w2-iso-pages, w2-refusal-texts, w2-upgrade-additive, w2-visual-inspection (VT hub), w3-access-session-sites, w3-access-ui (korisnici, profili, potpisi, lozinka), w3-mto-iso-materials (izbor Type), w3-punch-lists, w3-release-pages (izveštaj ne pominje), w3-vt-site-settings, w3-weld-table (tabela varova, Mass edit, Stamp), w3-welder-card, w4-exports, w4-inspection-cell, w4-weld-form-rules (forma vara). Ni dijalozi uvoza sertifikata i ZIP, kopija WPS-a, Material log i lista transakcija skladišta, NDT Generate dijalozi i Undo / restart.
- **Spojen kod kao celina** — drugi prolaz kroz scenarije je bio pregled u pregledaču na `e5209c9`. Ispravke posle njega su pokrivene testovima i trećim bezbednosnim pregledom, ali nisu ponovo prođene na ekranu. Ni u jednom prolazu: prevlačenje reda varova, izbor PDF fajla, crtanje potpisa u Sign online, Remove punch item, Upload signed docs, Create release doc, Manage ITP/KNR, Edit flange, forme etiketa i odstupanja prirubnice.
- **React klijent** dalje od odgovora servera (bezbednosni pregledi 2 i 3).

### Drugi prolaz kroz scenarije (S1–S17 na `e5209c9`)

**Svih 17 scenarija je stiglo do cilja, 5 uz zaobilaznicu:** S2 (zavarivač je prvo morao da se kvalifikuje za WPS), S4 (NDT lokacija i proces prvo u Mass edit), S9 (Add flange nije mogao da sačuva; prirubnica napravljena preko API-ja), S13 (Order materials je sakrio cev), S17 (WPS traži čekiran sajt, kao u prvom prolazu). S15 je stigao do cilja sa rupom: Sign online i Upload su otvoreni, ali nisu završeni na ekranu.

Razlike iz prvog prolaza: 110 nestalo, 28 ostalo, 16 promenjeno. Greške iz prvog prolaza: sve u SB nestale; u SA ostala D6 (tracer varovi u NDT blokadi dok se ne ispitaju), D1 i D2 nisu ponovo proveravane; u SC ostala D9 (PDF van opsega 404) — ispravljena posle (`925062a`).

Nove greške i šta je s njima:

| Greška | Šta je urađeno |
|---|---|
| Nema ponuđenih zavarivača za WPS na uzornim podacima (SA2 N-D1) | ispravljeno (`925062a`) |
| Posle Bring back ostaje prazan prikaz obrisanih (SA2 N-D2) | ispravljeno (`925062a`) |
| Tekstovi zahteva: „R00001", upozorenje „NDT Request" u PWHT dijalogu, bez uputstva gde se podešava NDT proces | ispravljeno (`925062a`) |
| PWHT request manager i dalje pokazuje varove sa prihvaćenim PWHT (SA2 N-D3) | nije menjano: i referenca ih pokazuje |
| Add flange ne može da sačuva (SB2 N9-1, visoka) | ispravljeno (`8b06dde`) |
| Vreme u UTC u PDF-u prirubnice (SB2 N9-3) | ispravljeno (`8b06dde`) |
| Status prirubnice ostaje „Planned" posle potpisanog zapisnika (SB2 N9-2) | nije menjano: nema pravila u snimcima — pitanje klijentu 9 |
| Prefab može da se otvori dok je Field završen (SB2 N7-1) | nije menjano: referenca to dozvoljava |
| Field release filter samo po ITP No 2; Unlink ITP bez potvrde (SB2 N7-2, N10-1) | ispravljeno (`925062a`) |
| Order materials dvaput oduzima otvorenu porudžbinu (SC2 N-A) | ispravljeno (`b651bbf`) |
| Start na Shop čipu izdaje i Field redove (SC2 N-B) | nije menjano: Start izdaje sve dostupne redove; treba snimak — pitanje klijentu 4 |
| Reserve se ne može kliknuti (SC2 N-C); dupli tekst u Material log; Today rec. ostaje posle čuvanja | ispravljeno (`b651bbf`) |
| Ograničen čitalac dobija varove zavarivača koje ne sme da čita (SC2 N-H) | ispravljeno: dobija samo šifru i ime zavarivača (`925062a`) |
| Transfer to project otvara se sa praznom količinom; Weld čitalac čita katalog materijala (SC2 N-E, N-G) | nije obuhvaćeno ispravkama |

### Bezbednost

- **Pregled 2** (talasi 3 i 4): 13 nalaza — 2 visoka, 4 srednja, 7 niskih; svi ispravljeni (`cb66367`, `cc2ed5e`, `89b9a18`), testovi u `tests/security-review-2.test.ts`.
- **Pregled 3** (sve posle `e5209c9`): nema kritičnih, visokih ni srednjih nalaza; dva niska ostavljena namerno (sec3-001, sec3-002 — pitanja V21, V22). Zaključak pregleda: kod sme da se pusti sa stanovišta prijave, prava i granica glavnog projekta i pilota. Nije provereno: row-level security na PostgreSQL-u u pravom radu, više instanci servera, React klijent.

**Pregled 4 (a6490c8..df5617a):** nema kritičnih, visokih ni srednjih nalaza; jedan nizak ostaje otvoren (sec4-001: stari transfer nalog kome se ne može odrediti izvorni glavni projekat može da dodeli, pikuje ili otkaže svaki nalog koji ga vidi; završetak se odbija i zaliha se ne pomera; nije nazadovanje). Ocena pregledača: sme na izdanje.

### Nadogradnja

Druga proba (kopija današnjih živih podataka): svih 20 koraka prošlo. Treća proba (na `88e4c40`): svi koraci baze prošli, ali je pokazala da hosted filter polja gubi glavni projekat skladišta, pa se stara zaliha i dalje nije brojala u zaglavlju izometrije, listi i panelu Materials — ispravljeno u `cf99e5e`.

**Završna proba na `df5617a`:** četvrta proba, na svežoj kopiji živih podataka (backup `backups/2026-11-16T20-00-27.304Z/` u glavnom checkout-u): **20 od 20 koraka prošlo**; svaki postojeći red nepromenjen u svih 93 tabele, brojači uključeni; drugo pokretanje nije dodalo ništa; podizanje servera, prijava i bootstrap oba pilota prošli. Dodato: audit 583, diameters 488, ndt_defect_codes 82, spool_names 9, stock 2, movements 2. Napravljeno: 16 tabela, 47 referentnih kolona, 3 jedinstvena indeksa, row-level security na tih 16 tabela. Ceo paket na PostgreSQL-u: 1097 od 1097, nijedan preskočen.

### Šta će korisnici primetiti posle nadogradnje

Brojke koje hosted server daje pre → posle nadogradnje na živim podacima (četvrta proba; 19 izometrija; živi podaci su demo skup, jedan korisnik):

| Glavni projekat | Izometrije | Material status / Inv. pre → posle |
|---|---|---|
| North fabrication yard | svih šest | bez promene: 100, 100, 25, 100, 100, 100 %, Inv. isto |
| Riverside installation | sve tri | 100 % → 0 %, Inv. → 0: njihov materijal leži samo u skladištu koje pripada North-u |
| Demo – Riverside | ST-004, ST-006, ST-005 | ST-004 100 → 0 %; ST-006 86,5 → 0 %; ST-005 ostaje 100 %, Inv. 180 → 0 |
| Demo – North | CW-003, SK-008, ostale | CW-003 100 → 91 %; SK-008 47,7 → 34 % (sada se računaju rezervacije i nepreuzete pick liste drugih izometrija); ostale bez promene |

Razlog: živa verzija broji zalihu svih skladišta bez obzira na glavni projekat; nova broji samo glavni projekat izometrije, kao referenca. Tri izometrije su ručno preračunate iz redova i slažu se sa serverom.

Na svakoj izometriji i u listama:
- jedna blokada „release" više (Prefab i Field se navode odvojeno);
- „Ready" umesto krstića na Pfb / Fld gde svaki var ima zavarivača;
- Quality bez varova popravke (jedna demo izometrija 75 → 66,7 %);
- Progress promenjen na dve demo izometrije;
- 488 prečnika i 82 defect koda više u listama;
- nov nalog počinje sa oba pilota isključena;
- Adjust quantity traži administratora ili čekiran Storehouse manager — posle nadogradnje niko nije čekiran.

## (d) Odloženo po tvojoj odluci

| Funkcija | Šta će korisnik primetiti | Obim |
|---|---|---|
| Report generator (Form designer, My templates) | nema grupe Report generator; nema sopstvenih formi i šablona | **XL** — dizajner formi sa skladištem šablona i ispisom u svaki dokument je proizvod za sebe |
| WPS Designer | nema stavke WPS Designer; WPS se unosi kao zapis sa PDF-om | **L** — strukturisan uređivač WPS-a sa sopstvenim izgledom i dokumentom |
| Handheld skeniranje (Scan weld, Scan flange QR label, Add punch, zatvaranje zahteva QR kodom) | nema grupe Handheld; QR kodovi na karticama, etiketama i zahtevima ne otvaraju ništa | **L** — skeniranje kamerom, dijalozi za telefon i stranica završetka zahteva |
| Dnevni e-mail izveštaji (Start → Daily reporting) | nema stavke; nema dnevnih e-mailova | **M** — stranica pretplate, planer i slanje pošte |
| AI paneli (npr. skriven panel „AI Suggesties" u NDT dijalogu) | nema AI predloga | **M** po panelu — ponašanje iza njih nije snimljeno |
| Jezici osim engleskog (Nederlands, Deutsch, Français; izbor jezika na dokumentima) | nema linkova za jezik; nema izbora jezika na punch štampi, izveštaju prirubnica, ISO Book i zahtevima | **XL** — svaki tekst ekrana i svaki dokument na četiri jezika |

## (e) Razlike koje korisnik primećuje i koje ostaju, po uticaju

1. **Zaliha i brojke posle nadogradnje.** Nadogradnja samo umeće. Stara zaliha se pri čitanju računa kao inventar glavnog projekta kome je pripadalo njeno skladište, nikad preko glavnih projekata, i na hosted serveru i u pregledaču (`db4dea4`, `cf99e5e`). Živa verzija broji zalihu svih skladišta bez obzira na glavni projekat, pa izometrije koje su se oslanjale na zalihu drugog glavnog projekta padaju: na živim podacima tri izometrije Riverside installation idu sa 100 % na 0 % jer im materijal leži samo u skladištu North-a (V7; sve brojke u odeljku (c), „Šta će korisnici primetiti posle nadogradnje"). Uz to: blokada „release" više po izometriji, „Ready" na Pfb / Fld, Quality bez popravki, više prečnika i defect kodova, nov nalog bez pilota, Adjust quantity samo za administratora ili Storehouse manager-a (niko nije čekiran).
2. **Prijava i lozinka.** E-mail umesto posebnog Username; najmanje 10 znakova umesto 8 sa velikim, malim slovom i cifrom (V1, V2).
3. **Prirubnice.** Nema predloga iz tablica pritezanja, status je izveden, nema Excel uvoza, izvoz je CSV, Flange ID bez vrednosti samo jednom po izometriji, natpisi se razlikuju (pitanja klijentu 8, 9; V6, V16).
4. **Brojke koje se ne poklapaju.** Quality % na 0001 (81,3 % naspram 72,7 %), Status (%) projekta, KPI PWHT Approved / Documentation, otvorene tačke Material status, Inv. po redu istog materijala, Repaired na dashboard-u — svaka je podrazumevana vrednost iza jedne funkcije dok klijent ne odgovori (pitanja 2, 3, 11, 12, 13, 15).
5. **Export weld data** ima naše kolone (Data LISL); sadržaj izveštaja sa dashboard-a je samo delimično poznat (pitanja 14, 16).
6. **Izdavanje.** Jedan slobodan razlog za Reopen umesto Reason + Notes; novo izdavanje sa pozivima na potpis nije napravljeno (pitanje 5, V15).
7. **Brisanje materijala** arhivira za sve glavne projekte umesto samo za trenutni; „Delete" na katalozima, sajtovima i UOM-ovima arhivira ispod (V5).
8. **Liste uživo.** Isometrics list i Materials list nemaju Refresh data / Last refresh (V14).
9. **Jedinstvena imena.** Isto ime skladišta i brojevi žica po glavnom projektu se odbijaju zbog postojećih indeksa (V6).
10. **Nije napravljeno (nije na listi odloženog):** Change theme i prekidač teme, User Manuals, Privacy Policy link, dvostepena verifikacija, ITP matrix i ITP templates, uvoz u Material inventory, izveštaj Project book, brisanje revizije, Set ITP (mass) / Import calculations / Undo last import na Iso overview, izmena globalnih memo šablona, provera broja vara pri kucanju, Receive all materials, katalog Sleeve, „Set as completed" za hydrotest, sedam delova ISO Book bez dela knjige, ISO PDF Import (skriven u referenci).
11. **Formatiran tekst** je svuda običan tekst (V4).
12. **Sitni natpisi i raspored:** naslovi kataloga Certificates, Customs i stranica Material data; izbor jezika i štampa u novoj kartici kod punch-a; straničenje po 100 na Service request; zaglavlje tabele profila se ne ponavlja; crtica „—" u praznim ćelijama WPS / D / S; obe stavke uvoza u MTO Projects.
13. **Primer podataka** (samo lokalno): stari brojevi zahteva, prečnici varova ne odgovaraju sertifikatima, nijedan uzorni profil nema oblast 121.

Gde su izvori bili u neskladu (kasniji pobeđuje): ishod mto-catalogs-008 kaže da forma materijala još nudi Progress class, a kasnije spojen mto-catalogs-007 ga je uklonio; iso-shared-030 kaže da IRN polje nije sivo, iso-shared-031 (talas 4) ga sivi; -037 / -039 kažu da 58 kodova fali, w1-left-3 ih isporučuje; PARITY.md je imao „isti projekat za test sistem" kao naš dodatak, a talas 2 dozvoljava više projekata u jednom sistemu — stavka je uklonjena.
