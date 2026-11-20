# Pitanja za klijenta / Questions for the client

Stanje: 16.11.2026, kod `df5617a`, pušten na živi sajt istog dana (main `858a0e3`); dopunjeno posle drugog prolaza kroz scenarije i bezbednosnih pregleda 2–4. Dokument ima četiri dela:

1. Pitanja za klijenta, srpski (latinica) — 38 pitanja i tabela sitnih stavki.
2. Isti tekst na engleskom, spreman za slanje.
3. Pitanja za Luku (vlasnika), samo srpski — 23 pitanja i tabela sitnih stavki.
4. Za vlasnika: šta se desilo sa pitanjima P1–P8 i K1–K10 iz plana prve verzije.

Kako su pitanja nastala. Svako pitanje je prvo traženo ovim redom: stranice reference (snimci samo za čitanje), njihov JavaScript, postojeći zapisi i dokumenti na test sajtu (Zandbak), klijentovi dokumenti (zahtevi, transkript sastanka) i javna dokumentacija proizvođača (uputstva u aplikaciji, baza znanja). Za stavke iz drugog prolaza (`_findings/OPEN-ITEMS.md`) ta pretraga je zapisana sa izvorima; za pitanja koja su graditelji otvorili u talasima 1–4 zapisano je iz kog snimka ili dela uputstva su gradili, a klijentovi dokumenti za te teme nemaju odgovor (`_client-docs-digest.md` §4). Pitanja na koja su izvori odgovorili su izbačena. Pitanja koja pitaju isto su spojena. Redosled: prvo ona čiji odgovor najviše menja aplikaciju. Nazivi ekrana i polja su na engleskom, tačno kako stoje u aplikaciji.

---

## Odgovori klijenta od 17.11.2026 i šta je urađeno (20.11.2026)

Klijent je odgovorio na skraćenu verziju pitanja (`pitanja- Odgovori_171126.docx`) i poslao ISO book (`ISO Book - PTP002 - M170-MET-002.PDF`: naslovna, izometrija, LISL [GU], indeks sertifikata, RT izveštaj, dva VT izveštaja) i svoj Export weld data (`Export-site2-user226-20261117-112325.xlsx`, 87 kolona, 100 613 varova). Brojevi su brojevi pitanja iz Dela 1.

| # | Odgovor klijenta (ukratko) | Šta je urađeno |
|---|---|---|
| 1 | Izometrije i sertifikati se izvoze kao „Export CSV" u Websoniku; projekti, PQR i NDT se unose ručno; ne zna šta je uvoz prirubnica. | Ništa. Za šablone uvoza trebaju nam njihovi CSV izvozi izometrija i sertifikata. |
| 2 | Da, tako (sve četiri tačke). | Ništa, ugrađeno je tako. |
| 3 | Rezervisan materijal sme da se skine / prebaci, uz pitanje „da li ste sigurni". Drugi deo nije razumeo. | Remove i transfer iz Material inventory pitaju za potvrdu kad diraju rezervisanu količinu (server odbija bez potvrde). Inv. ostaje. |
| 4 | Start pravi pick listu i skida materijal; Start je samo za predfabrikaciju (Shop); Field nema Isometric execution; field pick listu čine elementi pod „Field MTO". | Isometric execution nudi samo Shop; Start skida samo Shop redove (i „Shop missing", „Support Shop"…); server odbija Start za drugu fazu. Field pick lista nije napravljena — za sastanak. |
| 5 | Ne razume pitanje. | Ostaje; za sastanak. |
| 6 | Pita o kom dokumentu je reč. | Ostaje; za sastanak. |
| 7 | WPS, datum i šarže su obavezni za complete; otvoren pre-punch ne sme da prođe; (c) nije razumeo. | Var bez WPS, datuma zavarivanja ili šarže (ili sertifikata) blokira Prefab / Field complete; otvoren pre-punch kategorije A / B blokira complete i izdavanje. (c) ostaje. |
| 8 | Tablice se razlikuju po projektu, ostaje ručni unos. | Ništa. |
| 9, 10 | Za sastanak. | Ostaje. |
| 11 | Po inčima varova; var je zavaren kad ima zavarivača i datum zavarivanja. | WDI (Status % projekta i WDI panel) broji var kao završen tek sa zavarivačem i datumom. |
| 12 | Objasnio PWHT (ide kao NDT zahtev); Documentation nije siguran. | Ostaje; za sastanak. |
| 13 | Za sastanak. | Ostaje. |
| 14 | Možemo sami da izvezemo (poslat fajl). | Export weld data piše 87 kolona njihovog fajla, istim redom i nazivima (i sa njihovim greškama u kucanju: „Eelevation", „S chedule 2", dva puta „NDT 1 Report"), list „Sheet1", vrednosti kao tekst: Yes/No, YES/NO za NDT, „------" za prazan zavarivač/žica, materijal „3"/40/5,49/A234-WPB/Equal Tee". Data LISL nije menjan. |
| 15 | Repaired = da; odbijen var se broji kao Rejected dok se ne popravi; (c) i (f) traži više informacija. | Odbijen var prestaje da se broji kao Rejected kad je njegova popravka prihvaćena (dashboard i izveštaji). (c), (f) za sastanak. |
| 16 | Možemo da pošaljemo PDF-ove. | Čekamo PDF-ove (Project book, Welder report). |
| 17 | Tracer ide u NDT request; kandidati — da. | Ništa, ugrađeno je tako. |
| 18 | Opseg WPS-a (npr. 1"–2") se unosi ručno; zavarivaču se ručno unosi opseg po kvalifikaciji. | WPS ima „Diameter from / to (inch)"; sa uključenim Validation on WPS nudi se i prihvata samo WPS čiji opseg drži prečnik vara (WPS bez opsega nije ograničen) i samo zavarivač čija važeća kvalifikacija ima opseg koji ga drži. PQR tekst se više ne koristi. |
| 19 | Oznake GAP / SP / E / B ne poznaje; osnovna podela je Shop / Field; svaki tip vara mora biti Shop ili Field. | Ništa: nijedan od 100 613 brojeva varova u njihovom izvozu ne pada pod to pravilo; lokacija tipa vara je već obavezna. |
| 20 | Ostaje stara vrednost. | Ništa (Keep je podrazumevano). |
| 21, 22 | Ne razume / za sastanak. | Ostaje. |
| 23 | Hydrotest je završen tek kad se uploaduje potpisana dokumentacija, pa klikne Approved. | Approved traži bar jedan PDF rezultata tog test sistema (server odbija bez njega); test sistem je završen samo sa Approved. Ranije završeni sistemi ostaju završeni. |
| 24 | Poslao samo dve slike našeg menija, bez teksta. | Ostaje. |
| 25 | Za sastanak. | Ostaje. |
| 26 | Svaki sertifikat se unosi ručno i mora imati PDF. Uvoz zalihe ne koriste. | Certifications: PDF je obavezan (samo PDF), lista pokazuje „No PDF" kod starih bez fajla, server odbija fajl koji nije PDF. |
| 27 | Poručeno se ne prikazuje među onim što treba poručiti, nego u posebnom prozoru; negativan prijem ne treba; treba „additional" porudžbina i pregled dodatnog prema potrebama projekta. | Order materials ima kartice To order / Ordered / Additional vs required; Additional order (sa razlogom) ne smanjuje redovnu potrebu; take-in prima samo pozitivne količine. |
| 28 | Za sastanak. | Ostaje. |
| 29 | Dostavnica bez Print i Sign u programu; na odštampanom obrascu polja za potpis pošiljaoca i prevoznika. | Sign online je uklonjen; PDF service request-a ima blokove Sender i Carrier (transport company) za potpis na papiru. |
| 30 | Dashboard isti za sve; % poručenog i primljenog od potrebnog i % započetih izometrija. | Svi paneli za svakog ko otvara dashboard; nove kartice Ordered %, Received %, Isometrics started %. |
| 31 | VT2 treba da bude samo VT; poslat ISO book. | (Odluka Luke) prekidač Ver 2 i VT type 2 polja su skriveni; izveštaj „Visual inspection 00021", novi brojevi sa 5 cifara; opcija ISS „VT from VT report". |
| 32 | Ne razume. | Ostaje. |
| 33 | Sve ide uz kopiju (PQR je „tata", WPS „sin"). | Copy / Mass copy WPS kopira i dokumente i opseg prečnika. |
| 34 | Nov dobavljač, firma, laydown je odmah isključen, uz opciju pri dodavanju da se odmah uključi. | Material supplier, Service companies, Laydown areas, Laydown materials počinju isključeni, Add ima „Enable on this site". |
| 35 | Pita šta znači „u toku". | Ostaje; za sastanak. |
| 36 | Za sastanak; izometrija je jedinstvena. | Ništa (ISO broj je već jedinstven u projektu). |
| 37 | Izometrija sme da se obriše uvek, ali samo određeni korisnici; svi podaci se preračunavaju. | Brisanje traži samo pravo Delete na izometrijama (64); varovi, materijali, rezervacije, pick liste i ostalo što visi na izometriji se brišu (arhiviraju) sa njom; kretanja zaliha i porudžbine ostaju. Vraćanje izometrije ne vraća obrisane zapise. |
| 38 | Za sastanak. | Ostaje. |
| Napomena | Prilozi treba da se otvore za pregled u novom prozoru, ne da se odmah preuzmu. | PDF i slike se otvaraju u novoj kartici (inline, tip po sadržaju fajla); ostali fajlovi i `?download=1` se preuzimaju. |

### Dodatni zahtevi klijenta od 20.11.2026 (pet slika) i šta je urađeno

| Zahtev | Urađeno |
|---|---|
| ISO broj „KH-034708-SHEET 5" je odbijen; treba dozvoliti i druge znakove. | ISO broj prima pojedinačne razmake između delova (njihov izvoz: 72 od 7621 brojeva imaju razmak, drugih znakova nema). |
| ITP, WPS i WPQR se za svaki glavni projekat unose iznova (novi glavni projekat je nudio ITP-ove demo projekata). | Svaki ITP, WPS i PQR pripada jednom glavnom projektu i vidi se samo tamo; stariji zapisi pripadaju glavnom projektu svojih veza. Broj / naziv je jedinstven po glavnom projektu (Luka). Menja jedinstvene indekse u bazi: priprema baze pre puštanja. |
| Ne razume „Iso progress" pri kreiranju glavnog projekta. | Forma ima odeljak „How Iso progress is calculated" (svako polje, pravilo zbira i primer); Welds u progresu broji var kao zavaren sa zavarivačem i datumom, kao WDI. |
| „Welder customs" ne pripada „Welder data", nego „Weld data". | Stavka Customs je premeštena u grupu Weld data (posle Spools); nazivi grupa ostaju (Luka). |
| Spoolovi novog glavnog projekta treba da budu A, B, C …; CSV za druga imena. | Nov glavni projekat dobija A–Z (ostala imena isključena samo za njega); stranica Spools ima „Import CSV" (kolona Spool name, opciono Abbreviation; opcija da zameni listu tog glavnog projekta). |

Za sastanak („meet"): 4 (field pick lista), 5, 6, 7c, 9, 10, 12, 13, 15c/f, 21, 22, 24, 25, 28, 32, 35, 36, 38; od klijenta čekamo CSV izvoze izometrija i sertifikata iz Websonika i primere PDF-ova izveštaja.

---

## Deo 1 — Pitanja za klijenta (srpski)

Uvod za klijenta: Napravili smo Weld Pilot i MTO Pilot tako da rade kao WeldPilot i MTOPilot koje koristite. Referencu smo samo gledali, ništa na njoj nismo menjali niti slali. Za tačke ispod referenca ne pokazuje pravilo, pa smo ugradili razumno podrazumevano ponašanje. Molimo vas da za svaku tačku odgovorite kratko (da / ne, ili slovo izbora). Ako odgovor ne znate, napišite „ne znam" — tada ostaje podrazumevano.

### 1. Excel šabloni za uvoz

- **Gde u aplikaciji:** Weld Pilot / MTO Pilot → Welding data / Projects data → Projects → Import (Import projects, Import all project data); Weld Pilot → Material data → Certifications → Import certifications; Weld Pilot → Weld data → PQR → Import PQR; Weld Pilot → Welding data → NDT Batch Import → Via file; MTO Pilot → izometrija → Materials → Import in ISO; Weld Pilot → Releases → Flange Management (uvoz prirubnica).
- **Šta smo videli u referenci:** pravila uvoza su opisana u uputstvima, ali zaglavlja kolona vaših šablona nismo mogli da vidimo: preuzimanje šablona sa test sajta pravi fajl, a to nismo smeli. Stranice NDT Batch Import i uvoz prirubnica naš nalog ne može da otvori.
- **Šta smo ugradili:** sopstvene šablone. Zaglavlja su nazivi polja iz formi (Edit project / Edit isometric), opsezi varova kao Wt.Start / Wt.End; za NDT Batch Import četiri kolone iz uputstva plus Project, Isometric, WeldNo, NdtProcess, Result, NdtDate, ReportNo, FilmNo; za sertifikate Index number pa polja forme redom; za PQR 26 naziva atributa pa Valid until. Uvoz prirubnica nije napravljen.
- **Potvrdite:** (a) poslaćete prazne šablone koje koristite, (b) poslaćete po jedan popunjen fajl, ili (c) ne — ostaju naši šabloni.
- **Ako je odgovor (a) ili (b):** menja se samo raspored i nazivi kolona; pravila uvoza ostaju. Za prirubnice tek tada pravimo uvoz.

### 2. Formula za Material status %

- **Gde u aplikaciji:** MTO Pilot → izometrija → zaglavlje i Materials; Projects data → Isometric execution (kolona Mat.status).
- **Šta smo videli:** sedam izometrija na test sajtu ne određuje formulu do kraja; uputstvo daje samo opis.
- **Šta smo ugradili:** pokriveno / potrebno po redovima materijala, zaokruženo naniže na ceo procenat; računa se i nepreuzeta pick lista te izometrije i njene rezervacije; računa se sva zaliha (i iznad naručene količine); svaka izometrija vidi celu slobodnu zalihu istog materijala.
- **Potvrdite (da / ne za svaku):** (a) zaokruživanje naniže; (b) nepreuzeta pick lista izometrije se računa kao pokrivena; (c) zaliha iznad naručene količine se računa; (d) dve izometrije koje traže isti materijal vide istu slobodnu zalihu (ne dele je).
- **Ako je drugačije:** menja se jedna funkcija za status; brojke na izometriji, Isometric execution i MTO dashboard-u se menjaju zajedno.

### 3. Rezervisana zaliha i kolona Inv.

- **Gde u aplikaciji:** MTO Pilot → Order / Take in → Material inventory (transfer, Remove); izometrija → Materials → kolona Inv.
- **Šta smo videli:** nijedan snimak ne pokazuje isti materijal u dva reda jedne izometrije, niti transfer zalihe koja je rezervisana.
- **Šta smo ugradili:** transfer ili uklanjanje iz site inventory sme da uzme i rezervisanu količinu, bez upozorenja; svaki red istog materijala u koloni Inv. pokazuje celo stanje.
- **Potvrdite:** (a) sme li se rezervisana količina prebaciti ili ukloniti — da / ne / da, uz upozorenje; (b) treba li Inv. podeliti između redova istog materijala — da / ne.
- **Ako je drugačije:** (a) dodaje se provera ili upozorenje u transferu i uklanjanju; (b) menja se prikaz Inv. po redu.

### 4. Isometric execution: Start i trenutak izdavanja

- **Gde u aplikaciji:** MTO Pilot → Projects data → Isometric execution → Start; Pick List archive → Confirm material take.
- **Šta smo videli:** tekst kod Confirm material take kaže da se stavke tada skidaju sa zalihe; dugme Start nosi Type (operacionu fazu). Jedina pick lista na test sajtu je izdala red druge faze nego što je prikaz. U našem drugom prolazu Start na Shop čipu je izdao i Field redove; to nismo menjali dok ne znamo pravilo.
- **Šta smo ugradili:** Start odmah skida količine sa zalihe (najstarija šarža prva); Confirm material take ne pomera zalihu; Start uzima sve dostupne redove izometrije, a Type samo upisuje na pick listu; rezervacija se oslobađa dugmetom Release u Options reda.
- **Potvrdite:** (a) zaliha se skida na Start ili na Confirm material take; (b) Start uzima samo redove izabranog Type — da / ne.
- **Ako je drugačije:** (a) pomera se trenutak izdavanja i dashboard broji drugačije; (b) Start pravi pick listu po fazi.

### 5. Novo izdavanje (release book sa pozivima na potpis)

- **Gde u aplikaciji:** Weld Pilot → izometrija → Status → Create release doc; obaveštenja.
- **Šta smo videli:** uputstvo opisuje „novo izdavanje" koje se uključuje po sajtu (stranica izdavanja, izbor dokumenata, poziv na potpis, potpis svakog dokumenta); vaš test sajt koristi postojeći jedan dokument.
- **Šta smo ugradili:** postojeći dokument izdavanja (jedna release note po „Release selected").
- **Potvrdite:** da li vaš produkcijski sajt koristi novo izdavanje — da / ne.
- **Ako da:** dodaje se stranica release book po izometriji i fazi i pregled izdavanja (veliki posao, L).

### 6. Ko sme da ponovo otvori fazu posle dokumenta izdavanja

- **Gde u aplikaciji:** Weld Pilot → izometrija → Status → Reopen (Prefab / Field complete).
- **Šta smo videli:** uputstvo kaže da posle dokumenta izdavanja to sme samo supervizor; ko je supervizor, ne piše.
- **Šta smo ugradili:** ko ima pravo upisa u oblasti izdavanja.
- **Potvrdite:** (a) svako sa pravom izdavanja, (b) samo administrator, (c) posebno pravo u profilu („Reopen released").
- **Ako (b) ili (c):** jedna provera na serveru, i za (c) nova stavka u Profiles.

### 7. Uslovi za Prefab / Field complete

- **Gde u aplikaciji:** Weld Pilot → izometrija → Status (Prefab / Field complete, blokade „N open").
- **Šta smo videli:** uputstvo navodi zavaren var i završen NDT; ostalo nije rečeno.
- **Šta smo ugradili:** (a) var bez neobaveznih polja (WPS, datum, šarže) ne zadržava complete, samo stoji u blokadama; (b) otvoren pre-punch ne zadržava complete ni izdavanje (prva verzija je ovo blokirala); (c) stavka Repair se zatvara kad je prihvaćena bilo koja kasnija popravka u lancu.
- **Potvrdite (da / ne za svaku):** (a), (b), (c) kako je opisano.
- **Ako je drugačije:** menjaju se pravila spremnosti; to određuje kada se varovi zaključavaju.

### 8. Tablice pritezanja prirubnica

- **Gde u aplikaciji:** Weld Pilot → Releases → Flange Management → Add / Edit; podešavanje sajta „Flange tightening standard".
- **Šta smo videli:** referenca popunjava 15 praznih polja iz kataloga sajta po veličini i klasi; vrednosti su na serveru i nisu ni u jednom izvoru.
- **Šta smo ugradili:** ručni unos, bez predloga.
- **Potvrdite:** možete li poslati vrednosti ASME B16.5 (2012) i Gasunie CSW-43 tabela B po veličini i klasi, i da li smemo da ih koristimo — da / ne.
- **Ako da:** dva kataloga; popunjavaju se samo prazna polja (srednji posao, M).

### 9. Prirubnice: statusi i zatvaranje zapisnika

- **Gde u aplikaciji:** Weld Pilot → Releases → Flange Management → lista (Status) i stranica prirubnice (workflow, prolazi, zapisnik).
- **Šta smo videli:** lista ima dijaloge Set status i Status log, ali vrednosti statusa nisu u snimku (videli smo samo „Planned"). Snimak kaže tolerancija ±5 %, uputstvo kaže „Max. Deviation". Edit nema polje Finished?.
- **Šta smo ugradili:** Status u listi se izvodi iz unetih podataka (Planned / Tightened / Inspected / Finished); događaji na stranici prirubnice ga ne menjaju. Tolerancija ±5 %. Release je dozvoljen tek kad je zapisnik potpun (sve četiri tačke poravnanja, referenca odstupanja iznad 2 mm). Potpisana papirna kopija se čuva kao „čeka QA/QC" i ne računa se.
- **Potvrdite:** (a) pošaljite listu statusa i ko ih menja (ili snimak ekrana dijaloga Set status); (b) kad je zapisnik montaže potpisan, šta lista pokazuje u koloni Status: (1) i dalje Planned, (2) Tightened / Inspected, (3) status postavljen ručno kroz Set status — kod nas sada ostaje „Planned"; (c) tolerancija: ±5 % ili Max. Deviation; (d) da li papirna kopija koju QA/QC potvrdi sme da otvori Release — da / ne.
- **Ako je drugačije:** (a), (b) Status postaje sačuvana vrednost koju menjaju workflow i zapisnik; (c) jedna provera; (d) dodaje se potvrda papirne kopije.

### 10. Operacione faze i jedinice mere na početku rada

- **Gde u aplikaciji:** MTO Pilot → Materials → Operation Phases / UOMs.
- **Šta smo videli:** test sajt ima 14 faza i 20 jedinica iz vaše istorije; mi smo uneli 6 i 8 primera. Koje faze su „Shop", a koje „Field" za napredak izometrije, mi pogađamo po nazivu (npr. „Shop missing" i „Shop IYM" bi se računale kao Shop).
- **Potvrdite:** (a) učitavamo vaše liste sa test sajta kakve jesu, (b) šaljete očišćene liste, ili (c) unosite ih sami; i (d) navedite za svaku fazu: Shop, Field ili nijedno.
- **Ako (a) ili (b):** jedan unos podataka (mali posao); uvoz materijala proverava UOM, pa liste moraju biti unete pre prvog uvoza. (d) menja budžete napretka.

### 11. Status (%) projekta

- **Gde u aplikaciji:** Weld Pilot / MTO Pilot → Projects, kolona Status (%).
- **Šta smo videli:** uputstvo kaže da se računa iz izometrija projekta; na test sajtu sve izometrije imaju 0,0 %, a lista pokazuje 69,6 %. Nijedna formula koju smo probali ne daje 69,6 %.
- **Šta smo ugradili:** završenost po inčima varova (WDI) kao ceo procenat, isto u oba pilota.
- **Potvrdite:** (a) običan prosek Progress % izometrija, (b) prosek po inčima varova, (c) prosek po budžetu, ili (d) nešto drugo (opišite).
- **Ako je drugačije:** menja se samo funkcija statusa projekta.

### 12. KPI kartice na Isometrics list: PWHT Approved i Documentation

- **Gde u aplikaciji:** Weld Pilot / MTO Pilot → Isometrics list, kartice iznad tabele.
- **Šta smo videli:** test sajt pokazuje 1/7 i 1/7; uputstvo kaže samo „ISOs with PWHT approved" / „Documentation completion"; dve izometrije imaju čekiran Doc. (pretraženo: uputstvo §17, MTO uputstvo §11, baza znanja 5-28, snimci liste i izometrija).
- **Šta smo ugradili:** PWHT Approved = bar jedan var sa PWHT i svi takvi prihvaćeni; Documentation = oba polja dokumentacije u fazama čekirana. Na našem primeru MTO kartica Documentation pokazuje 0, a referenca 1/7.
- **Potvrdite:** PWHT Approved: (1) izometrija označena PWHT = Yes, (2) bar jedan prihvaćen PWHT rezultat, (3) svaki PWHT var prihvaćen. Documentation: (1) crtež postoji, (2) crtež i ITP dokument, (3) crtež i Field complete, (4) drugo.
- **Ako je drugačije:** po jedna funkcija za svaku karticu.

### 13. Quality % i tooltip po tipu vara

- **Gde u aplikaciji:** Weld Pilot → izometrija → Status (Quality %; tooltip npr. „WS 82% / FW 100%").
- **Šta smo videli:** uputstvo kaže Quality = NDT prihvaćeno naspram odbijenog. Na izometriji 0001 referenca pokazuje 72,7 %; nijedno pravilo to ne ponavlja (pet od 25 redova arhive nije snimljeno). Tooltip stoji na zajedničkoj oznaci napretka i kvaliteta.
- **Šta smo ugradili:** Accepted / (Accepted + NA) preko svih NDT i NDT Pre krugova varova koji nisu popravke; kod nas 0001 pokazuje 81,3 % (13/16). Tooltip po tipu vara nije napravljen.
- **Potvrdite:** (a) da li se u Quality računaju: tracer varovi — da / ne; NDT Pre — da / ne; popravke (R varovi) — da / ne; (b) tooltip po tipu vara je: (1) kvalitet NDT po tipu, (2) napredak po tipu.
- **Ako je drugačije:** jedna funkcija; tooltip se dodaje po odgovoru (b).

### 14. Kolone fajla Export weld data

- **Gde u aplikaciji:** Weld Pilot → Welding data → Export weld data (Export welds, Download XLS / Export all data).
- **Šta smo videli:** spisak kolona nije ni na stranici ni u uputstvu; pokretanje izvoza na test sajtu bi napravilo fajl.
- **Šta smo ugradili:** 87 kolona našeg Data LISL.
- **Potvrdite:** možete li poslati jedan Export.xlsx napravljen ovom stranicom — da / ne.
- **Ako da:** kolone i redosled se usklađuju sa fajlom.

### 15. Brojke na Weld dashboard-u

- **Gde u aplikaciji:** Weld Pilot → Start → Dashboard (Inspection compliance, defect block, Repaired, Manage ITP/KNR).
- **Šta smo videli:** formule su uglavnom u skripti stranice; nisu rešeni: šta je „Repaired", sedam zavarenih shop varova koji na referenci nisu u obračunu bez vidljivog razloga, i šta radi Archive u ITP/KNR Manager-u.
- **Šta smo ugradili:** (a) Repaired = var sa oznakom popravke; (b) odbijen var čiji NDT nije završen računa se kao Rejected, pa Reject % može preći 100 %; (c) sa filterom zavarivača prikazuju se samo grupe izabranih; (d) predlog tracera traži u grupi preko celog glavnog projekta, bez filtera dashboard-a; (e) Archive isključuje ITP (Active), ali on ostaje vezan i računa se; „Sync legacy ITP's" nije napravljen.
- **Potvrdite (da / ne za svaku):** (a), (b), (c), (d), (e); i (f) zašto su ti varovi van obračuna, ako znate.
- **Ako je drugačije:** svaka tačka je jedna funkcija; brojke na dashboard-u i u izveštajima se menjaju zajedno.

### 16. Sadržaj izveštaja sa dashboard-a (Reports)

- **Gde u aplikaciji:** Weld Pilot → Start → Dashboard → Reports (deset izveštaja).
- **Šta smo videli:** dijalozi su snimljeni, sadržaj PDF-ova samo delimično (nismo ih otvarali jer se time prave). „Project book" se u uputstvu pojavljuje kad je izabran jedan projekat; snimak nije imao izabran projekat. „Welder report – All sites" traži zavarivača, a forma nema to polje.
- **Šta smo ugradili:** deset izveštaja po snimljenim poljima; Welder report navodi sve zavarene varove, All sites varove sa prihvaćenim NDT (plus N/A i bez rezultata kad je čekirano) i uzima zavarivača sa dashboard-a; Open welds ne filtrira po datumu; Project book (jedanaesta stavka) nije napravljen.
- **Potvrdite:** (a) možete li poslati po jedan primer PDF-a ovih izveštaja (ili bar Project book i Welder report) — da / ne; (b) ostala pravila kako je opisano — da / ne.
- **Ako da:** usklađuju se redovi i kolone PDF-ova; Project book se dodaje.

### 17. Tracer varovi

- **Gde u aplikaciji:** Weld Pilot → izometrija → NDT dijalog (NA) → predlog tracera; T dugme.
- **Šta smo videli:** oba tracer vara na test sajtu imaju NDT Req. = Yes; odgovor na „Save tracers" nije snimljen (pretraženo: uputstvo §19, FAQ, best practices, baza znanja).
- **Šta smo ugradili:** povezivanje tracera mu uključuje NDT Req.; kandidati su isti zavarivač + WPS + ITP/KNR, varovi bez NDT zahteva i rezultata, ceo sajt, bez vremenskog prozora, najbliži datum prvi; traceri izabrani pre nego što je NA sačuvan čuvaju se zajedno sa NA.
- **Potvrdite (da / ne):** (a) WeldPilot sam uključuje NDT Req. na traceru; (b) skup kandidata kako je opisan.
- **Ako je drugačije:** (a) korisnik ručno čekira NDT Req.; (b) menja se jedan filter.

### 18. Validation on WPS i prečnik

- **Gde u aplikaciji:** Weld Pilot → izometrija → Welds → Add weld / Edit weld / Mass edit welds; podešavanje sajta „Validation on WPS".
- **Šta smo videli:** uputstvo kaže da se nude samo zavarivači čiji kvalifikacioni dokument navodi izabrani WPS; kako se upoređuje prečnik, ne piše.
- **Šta smo ugradili:** (a) sajt koji nikad nije sačuvao podešavanje zadržava staru proveru po procesu zavarivanja; (b) WPS odgovara prečniku kad tekst prečnika na njegovom PQR pokriva spoljni prečnik u mm; (c) zavarivač je kvalifikovan za prečnik kad važeća kvalifikacija ima opseg koji ga sadrži (bez opsega — nije); (d) šarže se filtriraju po veličini koja pada u opseg izabranih zavarivača; (e) upozorenje o grupama materijala se pokazuje kad obe šarže imaju grupu, i kad WPS nema grupe; nikad ne blokira.
- **Potvrdite (da / ne za svaku):** (a)–(e).
- **Ako je drugačije:** pravila forme vara; menja se ko se nudi i šta server odbija.

### 19. Posebni brojevi varova (GAP, SP, E, B)

- **Gde u aplikaciji:** Weld Pilot → Add weld / Edit weld; Dashboard; Export weld data.
- **Šta smo videli:** skripta reference smatra posebnim svaki broj koji počinje sa E ili B, ili sadrži GAP ili SP, i polja sakriva tek kad se kuca broj.
- **Šta smo ugradili:** strože pravilo: kod mora stajati uz cifre (npr. GAP12, E3), bez obzira na velika i mala slova; polja se sakrivaju odmah pri otvaranju dijaloga za takav var. Takvi varovi su van brojki dashboard-a i izvoza.
- **Potvrdite:** (a) strože pravilo, ili (b) pravilo reference (svaki broj na E/B, svaki sa GAP/SP).
- **Ako (b):** broj kao „B12-03" postaje poseban var: forma ga ne traži, dashboard ga ne broji.

### 20. Mass edit: polja koja nisu čekirana

- **Gde u aplikaciji:** Weld Pilot → izometrija → Welds → Mass edit welds (NDT Req. Pre, NDT Req., Pre-HT, PWHT Req., Repair, Tracer).
- **Šta smo videli:** ne vidi se da li nečekirano polje u referenci ostavlja vrednost ili je postavlja na No.
- **Šta smo ugradili:** izbor Keep / Yes / No po polju.
- **Potvrdite:** nečekirano polje (a) ostavlja vrednost, ili (b) postavlja No.
- **Ako (b):** polja postaju obični čekovi i masovna izmena briše oznake koje nisu čekirane.

### 21. NDT Batch Import

- **Gde u aplikaciji:** Weld Pilot → Welding data → NDT Batch Import (Via file, Via request number).
- **Šta smo videli:** naš nalog ne može da otvori stranicu; građeno po uputstvu §21.
- **Šta smo ugradili:** (a) NA ne pravi popravku; postojeći var „<broj>R1" se nudi kao dugme posle uvoza (uputstvo kaže da se popravka pravi za svako odbijanje); (b) kartica Via file uvozi samo NDT, NDT Pre je na kartici Via request number; (c) red čiji NDT proces nije postavljen na varu je crven i proces se ne dodaje; (d) PDF po izometriji nije obavezan, Report No. jeste.
- **Potvrdite (da / ne za svaku):** (a)–(d).
- **Ako je drugačije:** (a) uvoz pravi R varove; ostalo su provere u uvozu.

### 22. Punch: kašnjenje, Passed i ko sme šta

- **Gde u aplikaciji:** Weld Pilot → Releases → Punch lists (kartice Overdue / Deadline 7 days, Passed, Register passed); izometrija → punch dijalog.
- **Šta smo videli:** test sajt ima jednu punch stavku; brojke dolaze sa servera. Šta radi „Register passed", snimak ne pokazuje.
- **Šta smo ugradili:** (a) samo Open stavke kasne; „Deadline 7 days" = rok od danas do danas + 7; (b) faza je Passed tek kad je bar jedna stavka Finished i odobrena i sve A/B su Finished i odobrene; stavke bez izometrije nikad nisu Passed; nova A/B stavka vraća Passed fazu; (c) odobrenje sme pre Finished; svaki potpis postavlja odobrenje; (d) posle Punch Passed novu stavku dodaje samo administrator; (e) Register passed dodaje jednu stavku kategorije C (Finished i odobrenu) da faza bude Passed, odbijeno dok ima otvorenih A/B; (f) Reported by i Inspector se biraju iz liste zavarivača/osoblja.
- **Potvrdite (da / ne za svaku):** (a)–(f); za (a) posebno: Finished stavka posle roka kasni — da / ne; stavka sa rokom tačno za 7 dana je u „Deadline 7 days" — da / ne.
- **Ako je drugačije:** menja se jedan modul pravila punch-a.

### 23. Hydrotest

- **Gde u aplikaciji:** Weld Pilot → Releases → Hydrotest release (Test systems, Spools, Results).
- **Šta smo videli:** uputstvo ne kaže da li sistem završava status „Approved" ili tek prihvaćen rezultat.
- **Šta smo ugradili:** (a) i jedno i drugo završava hydrotest sistema; (b) Asset tag i Test pressure u kartici Spools su od izometrije; (c) ranije Hydrotest release ne može ponovo da se štampa sa ekrana (kao u referenci), PDF se čuva.
- **Potvrdite (da / ne za svaku):** (a)–(c).
- **Ako je drugačije:** (a) jedno pravilo; (c) dodaje se lista izdatih dokumenata.

### 24. Koje LISL varijante se nude

- **Gde u aplikaciji:** Weld Pilot → izometrija → Reports (LISL Report, [GU], [MV], [ISS], [WQ] …); podešavanje sajta „LISL ISS - VT source".
- **Šta smo videli:** nismo našli pravilo po kome referenca nudi varijante.
- **Šta smo ugradili:** svih deset varijanti su uvek na listi; podešavanje „VT from VT2 report" važi samo za [ISS], a VI može da popuni VT kad NDT VT ne postoji.
- **Potvrdite:** (a) da li vaš sajt vidi svih deset — da / ne (ako ne, koje); (b) podešavanje važi samo za [ISS] — da / ne (ili i za [WQ]).
- **Ako je drugačije:** dodaje se podešavanje po sajtu koje varijante se nude.

### 25. Transfer orders

- **Gde u aplikaciji:** MTO Pilot → General data → Storehouses → Transfer Orders; Material inventory → New Transfer Order.
- **Šta smo videli:** stranica Storehouses za naš nalog nije dostupna; građeno po MTO uputstvu §5.
- **Šta smo ugradili:** (a) lista sa sedam kolona iz uputstva (From i To odvojeno); (b) obrnut nalog nema svoj status, ostaje Completed ili Partial sa oznakom „Reversed"; (c) pick i Complete sme svako sa pravom, Assign to me preuzima nalog; (d) sertifikati kopirani pri završetku ostaju na odredištu posle Reverse; (e) Return to inventory šalje samo obaveštenje „Completed"; (f) obaveštenje o novom nalogu ide samo nalozima označenim kao Storehouse manager koji smeju da ga otvore; (g) dijalog nudi tipove: iz Material inventory 5 i 1, sa linija skladišta 2, 3, 4, sa stranice Transfer orders svih pet.
- **Potvrdite (da / ne za svaku):** (a)–(g).
- **Ako je drugačije:** svaka tačka je pravilo u jednom modulu naloga.

### 26. Skladište: sertifikat u Edit item i uvoz zalihe

- **Gde u aplikaciji:** MTO Pilot → Storehouses → linija → Edit item / Adjust / Remove; Material inventory.
- **Šta smo videli:** sertifikati pripadaju sajtu, a skladišta su zajednička za firmu; kako referenca u Edit item prikači PDF sertifikata, ne vidi se. Uputstvo pominje uvoz zalihe, stranicu nismo videli.
- **Šta smo ugradili:** Edit item bez PDF-a i šarže; Explanation obavezno samo u Edit item za razlog Other; uvoz za Material inventory nije napravljen; čitanje linija skladišta traži pravo Material inventory (16), radnje traže 75.
- **Potvrdite:** (a) kako prikačite sertifikat u Edit item (opis ili snimak ekrana); (b) da li koristite uvoz zalihe — da / ne; (c) Explanation obavezno i za Adjust / Remove sa Other — da / ne.
- **Ako je drugačije:** (a) dodaju se polja; (b) pravi se stranica uvoza (M); (c) jedna provera.

### 27. Order materials i Order archive

- **Gde u aplikaciji:** MTO Pilot → Order / Take in → Order materials, Order archive, Material take in.
- **Šta smo videli:** snimak sortira po UOM, skripta stranice po Material group; da li se PDF porudžbine čuva, ne vidi se; ko sme negativan prijem, ne piše nigde.
- **Šta smo ugradili:** (a) otvorene porudžbine se oduzimaju i kad je stranica filtrirana po izometriji; (b) materijal potpuno pokriven otvorenim porudžbinama se ne prikazuje; (c) PDF porudžbine se pravi pri otvaranju, iz redova; (d) sortiranje po Material group; (e) negativan prijem sme svako sa pravom prijema, i odbija se ako je ta zaliha već potrošena.
- **Potvrdite (da / ne za svaku):** (a)–(e).
- **Ako je drugačije:** svaka tačka je jedno pravilo na stranici ili serveru.

### 28. Material database: uvoz i novi glavni projekat

- **Gde u aplikaciji:** MTO Pilot → Materials → Material database (Import material, Mass edit materials, Home location).
- **Šta smo ugradili:** (a) red uvoza sa postojećim Material No ne menja postojeći materijal (mora se ispraviti broj); (b) prazan UOM u redu je greška; (c) glavni projekat napravljen kasnije vidi samo starije nepovezane materijale, ne počinje prazan; (d) u Mass edit, „Limit which sites receive the update" = čekiranje ili odčekiranje sajtova izabranih materijala.
- **Potvrdite (da / ne za svaku):** (a)–(d).
- **Ako je drugačije:** (a) uvoz ažurira; (b) prazno = EA; (c) novi projekat počinje prazan; (d) drugačije čuvanje veza.

### 29. Service request dokumenti i Logistic

- **Gde u aplikaciji:** MTO Pilot → Logistic → Service request, Service req. - Materials, Request archive (Print, Sign online, Upload, Download).
- **Šta smo ugradili:** (a) uploadovan sken računa se kao potpisan; posle potpisa novi upload se odbija; (b) Tracing i PWHT se štampaju YES kad Tracing Spec ima tekst, NO kad je prazno ili „-", No, N/A, NA, None, 0, Nee; (c) zahtevi za materijal imaju samo Download (bez Print i Sign); (d) grupa projekta u PDF-u nosi interni broj projekta; (e) „Signature" koristi sačuvan pun potpis, „Initials" kratki; (f) Move to inventory je radnja reda; (g) „Hide finished" krije spool čija izometrija ima završenu pripremu.
- **Potvrdite (da / ne za svaku):** (a)–(g).
- **Ako je drugačije:** pravila jednog modula; (g) jedna funkcija.

### 30. MTO dashboard

- **Gde u aplikaciji:** MTO Pilot → Start → Dashboard.
- **Šta smo videli:** naslovi i brojke se poklapaju sa dva snimka; formule iza nekih panela nisu u stranici.
- **Šta smo ugradili:** (a) paneli po oblastima prava: 1 Spools locations (logistika, starenje, filteri), 2 Pending materials (kartice, spremnost, tabla), 3 Pending orders (čipovi, Backlog by site, Open ordered); (b) skor izuzetka = nenaručeno × 2 + blokirajuća porudžbina + 1 ako je starije od 15 dana; (c) filter spool zadržava izometriju spool-a, supplier zadržava redove sa porudžbinom kod tog dobavljača; (d) brzi filter Blocked = iste izometrije kao kartica Blocked.
- **Potvrdite (da / ne za svaku):** (a)–(d).
- **Ako je drugačije:** po jedna funkcija.

### 31. Visual inspection (VT)

- **Gde u aplikaciji:** Weld Pilot → izometrija → Options → Visual inspection; podešavanje sajta Visual Inspection V2.
- **Šta smo ugradili:** (a) VT 2 prefix se ne koristi u numeraciji, štampa se u zaglavlju V2 (treba snimak pravog V2 PDF-a); (b) sa isključenim prekidačem sajt štampa samo V1; (c) Select report nudi sve napravljene izveštaje bez PDF-a; (d) brisanje izveštaja arhivira i njegove VI rezultate, pa su varovi opet slobodni.
- **Potvrdite (da / ne za svaku):** (a)–(d); za (a) pošaljite jedan V2 PDF ako možete.
- **Ako je drugačije:** numeracija i zaglavlje izveštaja.

### 32. ITPs

- **Gde u aplikaciji:** Weld Pilot → Welding data → ITPs; izometrija → ITPS / Link ITP.
- **Šta smo videli:** naš nalog ne može da otvori ITPs ni ITP templates; građeno po uputstvu §18.
- **Šta smo ugradili:** (a) postojeći ITP bez scope-a radi kao Shop+Field; (b) kad Shop i Field ITP imaju X-Ray %, izometrija uzima onaj iz ITP No, inače iz ITP No 2; (c) Import from isometrics pravi Shop i Field unose i preuzima X-Ray % i reviziju samo kad se sve izometrije slažu; (d) ITP matrix i ITP templates nisu napravljeni.
- **Potvrdite:** (a)–(c) da / ne; (d) da li koristite ITP matrix ili ITP templates — da / ne.
- **Ako (d) da:** gradi se (L), uz snimak ili nalog sa pravima.

### 33. WPS kopije i uvoz PQR

- **Gde u aplikaciji:** Weld Pilot → Weld data → WPS methods (Copy, Mass copy, Global deactivate); PQR → Import PQR.
- **Šta smo ugradili:** (a) WPS za sve projekte isključen na ovom sajtu prikazuje „No"; (b) kopija nosi sve vrednosti i PQR veze, projekte samo ciljnog sajta, bez dokumenta; (c) nov WPS bez Project nije dostupan ni na jednom projektu; (d) u uvozu PQR prazna ćelija u redu izmene zadržava vrednost; (e) po redu se nudi izračunata radnja i preskakanje.
- **Potvrdite (da / ne za svaku):** (a)–(e).
- **Ako je drugačije:** pravila kopiranja i uvoza.

### 34. „Enable on this site" na katalozima

- **Gde u aplikaciji:** Weld Pilot → Weld data → Weld type; Material data → Material supplier; MTO Pilot → Logistic → Service companies, Laydown areas, Laydown materials.
- **Šta smo ugradili:** (a) Weld type nema čekbox, nov tip je uključen svuda; (b) dobavljač nema čekbox i nov počinje isključen; (c) nova kompanija, laydown ili laydown materijala bez veze je uključena svuda.
- **Potvrdite (da / ne za svaku):** (a)–(c).
- **Ako je drugačije:** jedan red u pravilima kataloga.

### 35. Edit weld: istorija izmena i Stamp

- **Gde u aplikaciji:** Weld Pilot → izometrija → Welds → Edit weld (Previous edits, upozorenje „in progress"), Stamp.
- **Šta smo ugradili:** (a) Previous edits navodi samo unete razloge izmena; (b) „in progress" = otvoren NDT / NDT PRE / PRE-HT / PWHT zahtev; (c) Stamp nudi QA/QC osobe uključene na glavnom projektu vara.
- **Potvrdite (da / ne za svaku):** (a)–(c).
- **Ako je drugačije:** jedan filter po tački.

### 36. Import all project data: više redova

- **Gde u aplikaciji:** Projects → Import → Import all project data.
- **Šta smo ugradili:** (a) red materijala koji već postoji na izometriji se preskače, količina se ne menja; (b) ispravni redovi se upisuju, redovi sa greškom se preskaču i broje; (c) više redova jedne izometrije: popunjena polja zaglavlja važe redom (poslednji pobeđuje), svaki red dodaje svoj materijal.
- **Potvrdite (da / ne za svaku):** (a)–(c).
- **Ako je drugačije:** pravila uvoza.

### 37. Izometrija: brisanje i IRN serija

- **Gde u aplikaciji:** izometrija → Delete isometric; Projects → Options → Automatically add IRN numbers.
- **Šta smo ugradili:** (a) „započeta" izometrija (ne sme da se obriše) = postoji pick lista ili izdavanje; (b) glavni projekat bez IRN dobija sledeću slobodnu seriju od četiri slova, a postojeći IRN Code se koristi kao serija.
- **Potvrdite (da / ne za svaku):** (a), (b).
- **Ako je drugačije:** jedna provera / jedno pravilo numeracije.

### 38. Profiles: oblasti prava

- **Gde u aplikaciji:** System → Profiles; System → User accounts (pristup po sajtu).
- **Šta smo ugradili:** (a) PRE-HT rezultati su pod oblašću 116 (Visual inspection); (b) oblast „Prefab/Field release" (125) nije dodata, pa uzorni profil External ne može da sačuva taj ček; (c) novo čekiran sajt dobija profil pilota (referenca nudi prvi, „Full rights"); (d) Data LISL ne traži oblast 81.
- **Potvrdite (da / ne za svaku):** (a)–(d).
- **Ako je drugačije:** jedna stavka u matrici prava; (c) menja podrazumevani profil.

### Sitne stavke — ugrađeno kako piše, osim ako se ne slažete

| Gde | Ugrađeno |
|---|---|
| NDT process groups | Natpis „Add NDT process group" na dijalozima ostaje. |
| Weld diameters | 22 reda bez Size in inches ostaju prazna i nude se po tekstu prečnika. |
| Certifications → Add | Forma počinje prazna (bez prvog Diameter, Material part, Type of material, Supplier). |
| Certifications → Export to ZIP | Traži pravo Export na sertifikatima. |
| Welders → Certificates and files | WQ No, više WPS i upload fajla po uputstvu; kolona Customs pokazuje samo naziv. |
| Add flange | P&ID, Area/Unit i Location ostaju prazni (izometrija nema izvor); natpis „Requires enhanced control" kod High risk nije napravljen. |
| Flange QR label | Sadrži adresu prirubnice u aplikaciji; mreža 3 × 8 po A4. |
| Flange record | Preview proposals samo za čitanje; model ključa se predlaže iz Torque Wrench Type. |
| NDT dijalog | Defect type nije obavezan; izbor procesa odmah otključava kolonu. |
| NDT/PWHT Manager | Masovni zahtev bez otvorenih procesa se odbija; Date u arhivi samo datum; PWHT archive Result pokazuje sačuvano Accepted. |
| Ćelija vara | „Details" u arhivi vodi na Manager; Pre-HT nema „100%"; datum dd.mm.yyyy. hh:mm; tooltip „Generate & Print NDT Pre Request". |
| Project sites | Arhiviranje sajta sa aktivnim projektima se odbija. |
| Meni naloga | Naslov „Change site". |
| Signatures | Ime ispod potpisa nije čekirano na početku. |
| NDT process | Natpis „Welder Performance Report (WPR)" (snimak ima „Raport"); drugi fajl se dodaje uz postojeće. |
| Company data | Visina logotipa u mm i druga adresna linija ostaju sačuvane i štampaju se, ali nisu u formi. |
| Isometrics list | CSV / Excel bez kolona oznaka; Field plafon napretka = pokupljena količina cele izometrije. |
| Attachments | Redosled Report type = redosled kataloga; brisanje traži isto pravo kao upload. |
| Punch lists | Print se preuzima (ne otvara u novoj kartici); jedan izbor fajla u Add. |
| Weld types | „Reinforcment Pad GW -Field": naša lokacija, skraćenica FW. |
| Iso overview | QA značke: VI za svaki var, Pre / NDT / PWHT za varove koji ih traže, otvoreno dok poslednji rezultat nije Accepted; Started sortiranje M = 1, E = 2, W = 4; tooltip „ISO has no welds"; Weld card i Weld labels za jednu čekiranu izometriju. |
| Project sites → ISO Book | Sedam prekidača bez dela knjige (LISL V2, Weld record, WPS (Group), Welders' certifications, Welding wires, Material certificates (Group), Flange labels) se čuvaju ali nemaju dejstvo. |
| Memo templates | Nema ekrana za izmenu šest globalnih šablona. |
| Isometric blockers | Spisak NDT blokada: tracer varovi su izuzeti; koji još varovi ulaze, test sajt ne pokazuje jasno. |
| Quantity log | Revizija stavke se ne menja u logu (gde referenca nudi izbor, nije snimljeno). |
| Type of material | Kolona ISO / ASME u obliku „1.1 · P-1" (svi redovi na test sajtu su „-"). |
| Add weld | Provera broja vara pri kucanju nije napravljena; duplikat se odbija pri čuvanju. |
| Edit punch item | Unapređenje Pre-Punch → Punch kroz Promote to Punch. |
| Hydrotest na izometriji | „Set as completed" / „Set as not completed" nisu napravljeni (nije nađeno šta ih otvara). |
| Iso progress | Kad je faza van obima, preostale težine se preraspodeljuju. |
| Profiles | Uzorni profili imaju snimljena prava; Admin je naš administratorski profil. |

---

## Part 2 — Questions for the client (English)

Introduction for the client: We built Weld Pilot and MTO Pilot to work like the WeldPilot and MTOPilot you use. We only looked at the reference; we changed and submitted nothing on it. For the points below the reference does not show the rule, so we built a sensible default. Please answer each point briefly (yes / no, or the letter of a choice). If you do not know, write "don't know" — the default then stays.

### 1. Excel import templates

- **Where in the application:** Weld Pilot / MTO Pilot → Welding data / Projects data → Projects → Import (Import projects, Import all project data); Weld Pilot → Material data → Certifications → Import certifications; Weld Pilot → Weld data → PQR → Import PQR; Weld Pilot → Welding data → NDT Batch Import → Via file; MTO Pilot → isometric → Materials → Import in ISO; Weld Pilot → Releases → Flange Management (flange import).
- **What we saw in the reference:** the import rules are described in the manuals, but we could not see the column headers of your templates: downloading a template from the test site creates a file, which we were not allowed to do. Our account cannot open the NDT Batch Import and flange import pages.
- **What we built as the default:** our own templates. Headers are the form labels (Edit project / Edit isometric), weld ranges as Wt.Start / Wt.End; for NDT Batch Import the four columns of the manual plus Project, Isometric, WeldNo, NdtProcess, Result, NdtDate, ReportNo, FilmNo; for certifications Index number, then the form fields in order; for PQR the 26 attribute labels, then Valid until. The flange import is not built.
- **Please confirm:** (a) you will send the empty templates you use, (b) you will send one filled file of each, or (c) no — our templates stay.
- **If (a) or (b):** only the column order and names change; the import rules stay. The flange import is built only then.

### 2. The Material status % formula

- **Where:** MTO Pilot → isometric → header and Materials; Projects data → Isometric execution (Mat.status column).
- **What we saw:** the seven isometrics on the test site do not settle the formula fully; the manual only describes it.
- **Default built:** covered / required over the material lines, rounded down to a whole percent; the isometric's own untaken pick list and its reservations count; all stock counts (also above the ordered quantity); each isometric sees the whole free stock of the same material.
- **Please confirm (yes / no for each):** (a) rounding down; (b) the isometric's untaken pick list counts as covered; (c) stock above the ordered quantity counts; (d) two isometrics needing the same material see the same free stock (they do not share it).
- **If different:** one status function changes; the figures on the isometric, Isometric execution and the MTO dashboard change together.

### 3. Reserved stock and the Inv. column

- **Where:** MTO Pilot → Order / Take in → Material inventory (transfer, Remove); isometric → Materials → Inv. column.
- **What we saw:** no capture shows the same material on two lines of one isometric, nor a transfer of reserved stock.
- **Default built:** a transfer or removal from the site inventory may take reserved quantity, without a warning; every line of the same material shows the whole balance in Inv.
- **Please confirm:** (a) may reserved quantity be transferred or removed — yes / no / yes, with a warning; (b) should Inv. be split between lines of the same material — yes / no.
- **If different:** (a) a check or warning is added to transfer and removal; (b) the Inv. display per line changes.

### 4. Isometric execution: Start and the moment of issue

- **Where:** MTO Pilot → Projects data → Isometric execution → Start; Pick List archive → Confirm material take.
- **What we saw:** the text at Confirm material take says the items are booked out of stock then; the Start button carries a Type (operation phase). The only pick list on the test site issued a line of another phase than the one shown. In our second test walk, Start on the Shop chip also issued the Field lines; we left that unchanged until the rule is known.
- **Default built:** Start takes the quantities out of stock at once (oldest charge first); Confirm material take moves no stock; Start takes every available line of the isometric and only records the Type on the pick list; a reservation is released with a Release button in the row Options.
- **Please confirm:** (a) stock leaves at Start or at Confirm material take; (b) Start takes only the lines of the chosen Type — yes / no.
- **If different:** (a) the moment of issue moves and the dashboard counts differently; (b) Start makes a pick list per phase.

### 5. The new release (release book with signing invitations)

- **Where:** Weld Pilot → isometric → Status → Create release doc; notifications.
- **What we saw:** the manual describes a "new release" switched on per site (release page, choose documents, invite to sign, sign each document); your test site uses the existing single document.
- **Default built:** the existing release document (one release note per "Release selected").
- **Please confirm:** does your production site use the new release — yes / no.
- **If yes:** a release-book page per isometric and phase and a release overview are added (large, L).

### 6. Who may reopen a phase after the release document

- **Where:** Weld Pilot → isometric → Status → Reopen (Prefab / Field complete).
- **What we saw:** the manual says only a supervisor may do it after a release document; who the supervisor is, it does not say.
- **Default built:** anyone with the insert right in the release area.
- **Please confirm:** (a) anyone with release rights, (b) administrators only, (c) a separate profile right ("Reopen released").
- **If (b) or (c):** one server check, and for (c) a new entry in Profiles.

### 7. Conditions for Prefab / Field complete

- **Where:** Weld Pilot → isometric → Status (Prefab / Field complete, the "N open" blockers).
- **What we saw:** the manual names welded welds and completed NDT; nothing more.
- **Default built:** (a) a weld missing optional fields (WPS, date, charge numbers) does not hold complete; it is only listed as a blocker; (b) an open pre-punch holds neither complete nor the release (the first version blocked on it); (c) a Repair item closes when any later repair in its chain is accepted.
- **Please confirm (yes / no for each):** (a), (b), (c) as described.
- **If different:** the readiness rules change; they decide when welds lock.

### 8. Flange tightening tables

- **Where:** Weld Pilot → Releases → Flange Management → Add / Edit; site setting "Flange tightening standard".
- **What we saw:** the reference fills 15 empty fields from the site's catalog by size and rating; the values sit on the server and are in no source.
- **Default built:** free entry, no proposals.
- **Please confirm:** can you send the ASME B16.5 (2012) and Gasunie CSW-43 table B values per size and rating, and may we use them — yes / no.
- **If yes:** two catalogs; only empty fields are filled (medium, M).

### 9. Flanges: statuses and closing the record

- **Where:** Weld Pilot → Releases → Flange Management → list (Status) and the flange page (workflow, passes, record).
- **What we saw:** the list has Set status and Status log dialogs, but the status values are not in the capture (we saw only "Planned"). The capture says a tolerance of ±5 %, the manual says "Max. Deviation". Edit has no Finished? field.
- **Default built:** the list Status is derived from the entered data (Planned / Tightened / Inspected / Finished); events on the flange page do not change it. Tolerance ±5 %. Release is allowed only when the record is complete (all four alignment points, a deviation reference above 2 mm). A signed hard copy is stored as "awaiting QA/QC" and does not count.
- **Please confirm:** (a) send the list of statuses and who changes them (or a screenshot of the Set status dialog); (b) once the assembly record is signed, what does the list show in the Status column: (1) still Planned, (2) Tightened / Inspected, (3) the status set by hand through Set status — ours now stays "Planned"; (c) tolerance: ±5 % or Max. Deviation; (d) may a hard copy validated by QA/QC open Release — yes / no.
- **If different:** (a), (b) Status becomes a stored value changed by the workflow and the record; (c) one check; (d) a hard-copy validation is added.

### 10. Operation phases and units of measure at go-live

- **Where:** MTO Pilot → Materials → Operation Phases / UOMs.
- **What we saw:** the test site holds 14 phases and 20 units from your own history; we seeded 6 and 8 examples. Which phases are "Shop" and which "Field" for isometric progress we guess from the name (for example "Shop missing" and "Shop IYM" would count as Shop).
- **Please confirm:** (a) we load your test-site lists as they are, (b) you send cleaned lists, or (c) you enter them yourselves; and (d) for each phase: Shop, Field or neither.
- **If (a) or (b):** one data load (small); the material import checks the UOM, so the lists must be in place before the first import. (d) changes the progress budgets.

### 11. Project Status (%)

- **Where:** Weld Pilot / MTO Pilot → Projects, Status (%) column.
- **What we saw:** the manual says it is computed from the project's isometrics; on the test site every isometric is at 0.0 % while the list shows 69.6 %. No formula we tried gives 69.6 %.
- **Default built:** weld-inch completion (WDI) as a whole percent, the same in both pilots.
- **Please confirm:** (a) plain average of the isometrics' Progress %, (b) average weighted by weld inch, (c) weighted by budget, or (d) something else (please describe).
- **If different:** only the project status function changes.

### 12. Isometrics list KPI cards: PWHT Approved and Documentation

- **Where:** Weld Pilot / MTO Pilot → Isometrics list, the cards above the table.
- **What we saw:** the test site shows 1/7 and 1/7; the manual only says "ISOs with PWHT approved" / "Documentation completion"; two isometrics have Doc. ticked (searched: user manual §17, MTO manual §11, knowledge base 5-28, the list and isometric captures).
- **Default built:** PWHT Approved = at least one PWHT weld and all of them accepted; Documentation = both documentation phase boxes ticked. On our sample the MTO Documentation card shows 0 where the reference shows 1/7.
- **Please confirm:** PWHT Approved: (1) isometric marked PWHT = Yes, (2) at least one accepted PWHT result, (3) every PWHT weld accepted. Documentation: (1) drawing present, (2) drawing and ITP document, (3) drawing and Field complete, (4) other.
- **If different:** one function per card.

### 13. Quality % and the per-weld-type tooltip

- **Where:** Weld Pilot → isometric → Status (Quality %; tooltip such as "WS 82% / FW 100%").
- **What we saw:** the manual says Quality = NDT accepted against rejected. On isometric 0001 the reference shows 72.7 %; no rule reproduces it (five of 25 archive rows were not captured). The tooltip sits on the combined progress and quality anchor.
- **Default built:** Accepted / (Accepted + NA) over all NDT and NDT Pre rounds of welds that are not repairs; ours shows 81.3 % (13/16) on 0001. The per-weld-type tooltip is not built.
- **Please confirm:** (a) does Quality count: tracer welds — yes / no; NDT Pre — yes / no; repair (R) welds — yes / no; (b) the per-type tooltip is: (1) NDT quality per weld type, (2) progress per weld type.
- **If different:** one function; the tooltip is added per answer (b).

### 14. Columns of the Export weld data file

- **Where:** Weld Pilot → Welding data → Export weld data (Export welds, Download XLS / Export all data).
- **What we saw:** the column list is neither on the page nor in the manual; running the export on the test site would create a file.
- **Default built:** the 87 columns of our Data LISL.
- **Please confirm:** can you send one Export.xlsx made with this page — yes / no.
- **If yes:** columns and order are matched to the file.

### 15. Figures on the Weld dashboard

- **Where:** Weld Pilot → Start → Dashboard (Inspection compliance, defect block, Repaired, Manage ITP/KNR).
- **What we saw:** most formulas are in the page script; open are: what "Repaired" means, seven welded shop welds that the reference leaves out for no visible reason, and what Archive does in the ITP/KNR Manager.
- **Default built:** (a) Repaired = a weld with the repair flag; (b) a rejected weld whose NDT is not completed counts as Rejected, so Reject % can exceed 100 %; (c) with the welder filter set, only the chosen welders' groups are listed; (d) the tracer proposal looks in the group over the whole main project, without the dashboard filters; (e) Archive switches the ITP's Active off, but it stays linked and still counts; "Sync legacy ITP's" is not built.
- **Please confirm (yes / no for each):** (a), (b), (c), (d), (e); and (f) why those welds are left out, if you know.
- **If different:** each point is one function; dashboard and report figures change together.

### 16. Contents of the dashboard reports (Reports)

- **Where:** Weld Pilot → Start → Dashboard → Reports (ten reports).
- **What we saw:** the dialogs are captured, the PDF contents only in part (we did not open them, because opening generates them). "Project book" appears in the manual when one project is selected; the capture had none selected. "Welder report – All sites" requires a welder, but its form has no such field.
- **Default built:** the ten reports with the captured fields; Welder report lists every welded weld, All sites lists welds with an accepted NDT result (plus N/A and no-result welds when ticked) and takes the dashboard's welder; Open welds is not limited by date; Project book (an eleventh entry) is not built.
- **Please confirm:** (a) can you send one sample PDF of these reports (at least Project book and Welder report) — yes / no; (b) the other rules as described — yes / no.
- **If yes:** the PDF rows and columns are matched; Project book is added.

### 17. Tracer welds

- **Where:** Weld Pilot → isometric → NDT dialog (NA) → tracer proposal; T button.
- **What we saw:** both tracer welds on the test site have NDT Req. = Yes; the answer to "Save tracers" was not captured (searched: user manual §19, FAQ, best practices, knowledge base).
- **Default built:** linking a tracer switches its NDT Req. on; candidates are same welder + WPS + ITP/KNR, welds with no NDT request or result, the whole site, no date window, nearest date first; tracers chosen before the NA is saved are saved together with the NA.
- **Please confirm (yes / no):** (a) WeldPilot switches NDT Req. on for the tracer by itself; (b) the candidate pool as described.
- **If different:** (a) the user ticks NDT Req. by hand; (b) one filter changes.

### 18. Validation on WPS and the diameter

- **Where:** Weld Pilot → isometric → Welds → Add weld / Edit weld / Mass edit welds; site setting "Validation on WPS".
- **What we saw:** the manual says only welders whose qualification document lists the chosen WPS are offered; how the diameter is compared it does not say.
- **Default built:** (a) a site that never saved the setting keeps the old welding-process check; (b) a WPS matches a diameter when the diameter text on its PQR covers the outside diameter in mm; (c) a welder is qualified for a diameter when a valid qualification has a range that holds it (no range — not qualified); (d) charges are filtered by a size that falls in the chosen welders' ranges; (e) the material-group warning shows when both charges have a group, also when the WPS has none; it never blocks.
- **Please confirm (yes / no for each):** (a)–(e).
- **If different:** weld form rules; who is offered and what the server refuses changes.

### 19. Special weld numbers (GAP, SP, E, B)

- **Where:** Weld Pilot → Add weld / Edit weld; Dashboard; Export weld data.
- **What we saw:** the reference script treats as special any number that starts with E or B or contains GAP or SP, and hides the fields only while the number is typed.
- **Default built:** a stricter rule: the code must stand next to digits (for example GAP12, E3), in any letter case; the fields are hidden as soon as the dialog opens on such a weld. Such welds are left out of the dashboard figures and the export.
- **Please confirm:** (a) the stricter rule, or (b) the reference rule (every number starting with E/B, every number with GAP/SP).
- **If (b):** a number such as "B12-03" becomes a special weld: the form does not ask for it and the dashboard does not count it.

### 20. Mass edit: boxes that are not ticked

- **Where:** Weld Pilot → isometric → Welds → Mass edit welds (NDT Req. Pre, NDT Req., Pre-HT, PWHT Req., Repair, Tracer).
- **What we saw:** it cannot be seen whether an unticked box in the reference keeps the value or sets it to No.
- **Default built:** a Keep / Yes / No choice per field.
- **Please confirm:** an unticked box (a) keeps the value, or (b) sets No.
- **If (b):** the fields become plain check boxes and a mass edit clears flags that are not ticked.

### 21. NDT Batch Import

- **Where:** Weld Pilot → Welding data → NDT Batch Import (Via file, Via request number).
- **What we saw:** our account cannot open the page; built from the manual §21.
- **Default built:** (a) an NA does not create a repair weld; an existing "<no>R1" weld is offered as a button after the import (the manual says a repair is created for every rejection); (b) the Via file tab imports NDT only, NDT Pre is on the Via request number tab; (c) a row whose NDT process is not set on the weld is red and the process is not added; (d) the PDF per isometric is optional, the Report No. is required.
- **Please confirm (yes / no for each):** (a)–(d).
- **If different:** (a) the import creates R welds; the rest are import checks.

### 22. Punch: overdue, Passed and who may do what

- **Where:** Weld Pilot → Releases → Punch lists (cards Overdue / Deadline 7 days, Passed, Register passed); isometric → punch dialog.
- **What we saw:** the test site has one punch item; the counts come from the server. What "Register passed" does, the capture does not show.
- **Default built:** (a) only Open items are late; "Deadline 7 days" = due from today to today + 7; (b) a phase is Passed only when at least one item is Finished and approved and every A/B item is Finished and approved; items without an isometric never reach Passed; a new A/B item reopens a Passed phase; (c) approval may come before Finished; every sign-off sets the approval; (d) after Punch is Passed only the administrator adds a new item; (e) Register passed adds one category C item (Finished and approved) so the phase reads Passed, refused while open A/B items remain; (f) Reported by and Inspector are chosen from the welders / personnel list.
- **Please confirm (yes / no for each):** (a)–(f); for (a) also: a Finished item past its due date is late — yes / no; an item due exactly 7 days from today is in "Deadline 7 days" — yes / no.
- **If different:** one module of punch rules changes.

### 23. Hydrotest

- **Where:** Weld Pilot → Releases → Hydrotest release (Test systems, Spools, Results).
- **What we saw:** the manual does not say whether "Approved" alone completes a system or only an accepted result.
- **Default built:** (a) either one completes the system's hydrotest; (b) Asset tag and Test pressure on the Spools tab are the isometric's; (c) an earlier Hydrotest release cannot be printed again from the screen (as in the reference); the PDF is stored.
- **Please confirm (yes / no for each):** (a)–(c).
- **If different:** (a) one rule; (c) a list of issued documents is added.

### 24. Which LISL variants are offered

- **Where:** Weld Pilot → isometric → Reports (LISL Report, [GU], [MV], [ISS], [WQ] …); site setting "LISL ISS - VT source".
- **What we saw:** we found no rule by which the reference offers the variants.
- **Default built:** all ten variants are always listed; the setting "VT from VT2 report" applies to [ISS] only, and VI can fill VT when no NDT VT exists.
- **Please confirm:** (a) does your site see all ten — yes / no (if no, which); (b) the setting applies to [ISS] only — yes / no (or also to [WQ]).
- **If different:** a per-site setting for the offered variants is added.

### 25. Transfer orders

- **Where:** MTO Pilot → General data → Storehouses → Transfer Orders; Material inventory → New Transfer Order.
- **What we saw:** the Storehouses page is not open to our account; built from the MTO manual §5.
- **Default built:** (a) a list with the manual's seven columns (From and To separate); (b) a reversed order has no status of its own, it stays Completed or Partial with a "Reversed" badge; (c) anyone with the right may save picks and complete; Assign to me takes an order over; (d) certificates copied at completion stay at the destination after Reverse; (e) Return to inventory sends only the "Completed" notification; (f) a new-order notification goes only to accounts ticked as Storehouse manager that may open the order; (g) the dialog offers types 5 and 1 from Material inventory, 2, 3, 4 from storehouse lines, all five from the Transfer orders page.
- **Please confirm (yes / no for each):** (a)–(g).
- **If different:** each point is a rule in one order module.

### 26. Storehouse: certificate in Edit item and stock import

- **Where:** MTO Pilot → Storehouses → line → Edit item / Adjust / Remove; Material inventory.
- **What we saw:** certificates belong to a site while storehouses are company-wide; how the reference attaches a certificate PDF in Edit item cannot be seen. The manual mentions a stock import; we did not see the page.
- **Default built:** Edit item without PDF and charge fields; Explanation required only in Edit item for reason Other; no import for Material inventory; reading storehouse lines needs the Material inventory right (16), actions need 75.
- **Please confirm:** (a) how you attach a certificate in Edit item (a description or a screenshot); (b) do you use a stock import — yes / no; (c) Explanation required for Adjust / Remove with Other too — yes / no.
- **If different:** (a) fields are added; (b) an import page is built (M); (c) one check.

### 27. Order materials and Order archive

- **Where:** MTO Pilot → Order / Take in → Order materials, Order archive, Material take in.
- **What we saw:** the capture sorts by UOM, the page script by Material group; whether the order PDF is stored cannot be seen; who may book a negative receipt is written nowhere.
- **Default built:** (a) open orders are subtracted also when the page is filtered by isometric; (b) a material fully covered by open orders is not shown; (c) the order PDF is built when opened, from the order lines; (d) sorted by Material group; (e) anyone with the take-in right may book a negative receipt, refused when that stock was already used.
- **Please confirm (yes / no for each):** (a)–(e).
- **If different:** each point is one rule on the page or the server.

### 28. Material database: import and a new main project

- **Where:** MTO Pilot → Materials → Material database (Import material, Mass edit materials, Home location).
- **Default built:** (a) an import row with an existing Material No does not change that material (the number must be corrected); (b) an empty UOM in a row is an error; (c) a main project created later sees only the older unlinked materials, it does not start empty; (d) in Mass edit, "Limit which sites receive the update" = ticking or unticking the sites of the selected materials.
- **Please confirm (yes / no for each):** (a)–(d).
- **If different:** (a) the import updates; (b) empty = EA; (c) a new project starts empty; (d) the links are stored differently.

### 29. Service request documents and Logistic

- **Where:** MTO Pilot → Logistic → Service request, Service req. - Materials, Request archive (Print, Sign online, Upload, Download).
- **Default built:** (a) an uploaded scan counts as signed; after signing a new upload is refused; (b) Tracing and PWHT print YES when the Tracing Spec has text, NO when it is empty or reads "-", No, N/A, NA, None, 0, Nee; (c) material requests have Download only (no Print or Sign); (d) a project group in the PDF carries the internal project number; (e) "Signature" uses the saved full signature, "Initials" the short one; (f) Move to inventory is a row action; (g) "Hide finished" hides a spool whose isometric has its preparation finished.
- **Please confirm (yes / no for each):** (a)–(g).
- **If different:** rules of one module; (g) one function.

### 30. MTO dashboard

- **Where:** MTO Pilot → Start → Dashboard.
- **What we saw:** the titles and figures match two captures; the formulas behind some panels are not in the page.
- **Default built:** (a) panels by permission area: 1 Spools locations (logistics, aging, filters), 2 Pending materials (cards, readiness, board), 3 Pending orders (chips, Backlog by site, Open ordered); (b) exception score = not ordered × 2 + blocking backorder + 1 when older than 15 days; (c) the spool filter keeps the spool's isometric, the supplier filter keeps lines with an order line at that supplier; (d) the Blocked quick filter lists the same isometrics as the Blocked card.
- **Please confirm (yes / no for each):** (a)–(d).
- **If different:** one function each.

### 31. Visual inspection (VT)

- **Where:** Weld Pilot → isometric → Options → Visual inspection; site setting Visual Inspection V2.
- **Default built:** (a) the VT 2 prefix is not used in the numbering; it is printed in the V2 header (a capture of a real V2 PDF is needed); (b) with the switch off a site prints V1 lines only; (c) Select report offers every generated report without a PDF; (d) deleting a report also archives its VI results, so the welds are free again.
- **Please confirm (yes / no for each):** (a)–(d); for (a) please send one V2 PDF if you can.
- **If different:** report numbering and header.

### 32. ITPs

- **Where:** Weld Pilot → Welding data → ITPs; isometric → ITPS / Link ITP.
- **What we saw:** our account cannot open ITPs or ITP templates; built from the manual §18.
- **Default built:** (a) an existing ITP without a scope acts as Shop+Field; (b) when a Shop and a Field ITP both have an X-Ray %, the isometric takes the ITP No one, otherwise ITP No 2's; (c) Import from isometrics creates Shop and Field entries and takes over X-Ray % and revision only when all isometrics agree; (d) ITP matrix and ITP templates are not built.
- **Please confirm:** (a)–(c) yes / no; (d) do you use ITP matrix or ITP templates — yes / no.
- **If (d) yes:** it is built (L), with a capture or an account with rights.

### 33. WPS copies and the PQR import

- **Where:** Weld Pilot → Weld data → WPS methods (Copy, Mass copy, Global deactivate); PQR → Import PQR.
- **Default built:** (a) an all-projects WPS switched off on this site shows "No"; (b) a copy carries every value and PQR link, only the target site's projects, no document; (c) a new WPS without Project is available on no project; (d) in the PQR import an empty cell on an update row keeps the stored value; (e) per row the computed action and skip are offered.
- **Please confirm (yes / no for each):** (a)–(e).
- **If different:** copy and import rules.

### 34. "Enable on this site" on catalogs

- **Where:** Weld Pilot → Weld data → Weld type; Material data → Material supplier; MTO Pilot → Logistic → Service companies, Laydown areas, Laydown materials.
- **Default built:** (a) Weld type has no check box; a new type is on everywhere; (b) a supplier has no check box and a new one starts off; (c) a new company, laydown or material laydown without a link is on everywhere.
- **Please confirm (yes / no for each):** (a)–(c).
- **If different:** one line in the catalog rules.

### 35. Edit weld: edit history and Stamp

- **Where:** Weld Pilot → isometric → Welds → Edit weld (Previous edits, the "in progress" warning), Stamp.
- **Default built:** (a) Previous edits lists only the reasons entered for edits; (b) "in progress" = an open NDT / NDT PRE / PRE-HT / PWHT request; (c) Stamp offers the QA/QC people enabled on the weld's main project.
- **Please confirm (yes / no for each):** (a)–(c).
- **If different:** one filter per point.

### 36. Import all project data: several rows

- **Where:** Projects → Import → Import all project data.
- **Default built:** (a) a material line already on the isometric is skipped and its quantity is not changed; (b) valid rows are written, rows with errors are skipped and counted; (c) several rows for one isometric: filled header cells apply in order (the last wins), each row adds its own material line.
- **Please confirm (yes / no for each):** (a)–(c).
- **If different:** import rules.

### 37. Isometric: delete and the IRN series

- **Where:** isometric → Delete isometric; Projects → Options → Automatically add IRN numbers.
- **Default built:** (a) a "started" isometric (which cannot be deleted) = a pick list or a release exists; (b) a main project without an IRN gets the next free four-letter series, and an existing IRN Code is used as the series.
- **Please confirm (yes / no for each):** (a), (b).
- **If different:** one check / one numbering rule.

### 38. Profiles: permission areas

- **Where:** System → Profiles; System → User accounts (access per site).
- **Default built:** (a) PRE-HT results sit under area 116 (Visual inspection); (b) the area "Prefab/Field release" (125) is not added, so the sample profile External cannot store that tick; (c) a newly ticked site gets the pilot's profile (the reference offers the first one, "Full rights"); (d) Data LISL does not need area 81.
- **Please confirm (yes / no for each):** (a)–(d).
- **If different:** one entry in the rights matrix; (c) changes the default profile.

### Minor items — built as stated unless you object

| Where | Built |
|---|---|
| NDT process groups | The wording "Add NDT process group" on the dialogs stays. |
| Weld diameters | 22 rows without Size in inches stay empty and are offered by their diameter text. |
| Certifications → Add | The form starts empty (no first Diameter, Material part, Type of material, Supplier). |
| Certifications → Export to ZIP | Needs the Export right on certifications. |
| Welders → Certificates and files | WQ No, WPS multi-select and file upload from the manual; the Customs column shows the name only. |
| Add flange | P&ID, Area/Unit and Location stay empty (the isometric has no source); the "Requires enhanced control" caption on High risk is not built. |
| Flange QR label | Holds the flange's address in the application; 3 × 8 per A4. |
| Flange record | Preview proposals are read-only; the wrench model is proposed from the Torque Wrench Type. |
| NDT dialog | Defect type is optional; choosing the process unlocks the column at once. |
| NDT/PWHT Manager | A mass request without open processes is refused; archive Date is the date only; PWHT archive Result shows the stored Accepted. |
| Weld cell | "Details" in the archive leads to the Manager; Pre-HT has no "100%"; date dd.mm.yyyy. hh:mm; tooltip "Generate & Print NDT Pre Request". |
| Project sites | Archiving a site with active projects is refused. |
| Account menu | Heading "Change site". |
| Signatures | The name under the signature starts unticked. |
| NDT process | Label "Welder Performance Report (WPR)" (the capture reads "Raport"); a second file is added next to the existing ones. |
| Company data | The logo height in mm and the second address line stay stored and printed but are not on the form. |
| Isometrics list | CSV / Excel without the flag columns; the Field progress ceiling = the picked quantity of the whole isometric. |
| Attachments | Report type order = catalog order; deleting needs the same right as uploading. |
| Punch lists | Print downloads (does not open a new tab); one file picker in Add. |
| Weld types | "Reinforcment Pad GW -Field": our location, abbreviation FW. |
| Iso overview | QA badges: VI for every weld, Pre / NDT / PWHT for welds that require them, open until the latest result is Accepted; Started sort M = 1, E = 2, W = 4; tooltip "ISO has no welds"; Weld card and Weld labels for one checked isometric. |
| Project sites → ISO Book | Seven switches without a book part (LISL V2, Weld record, WPS (Group), Welders' certifications, Welding wires, Material certificates (Group), Flange labels) are stored but have no effect. |
| Memo templates | No screen to change the six global templates. |
| Isometric blockers | NDT blocker list: tracer welds are left out; which other welds it lists, the test site does not show clearly. |
| Quantity log | The revision of an entry cannot be changed in the log (where the reference offers the select was not captured). |
| Type of material | ISO / ASME column in the form "1.1 · P-1" (every test-site row shows "-"). |
| Add weld | No live weld-number check while typing; a duplicate is refused on save. |
| Edit punch item | Pre-Punch → Punch through Promote to Punch. |
| Hydrotest on the isometric | "Set as completed" / "Set as not completed" are not built (nothing found that opens them). |
| Iso progress | When a phase is out of scope, the remaining weights are redistributed. |
| Profiles | Sample profiles carry the captured rights; Admin is our administrator profile. |

---

## Deo 3 — Pitanja za Luku (vlasnika)

Ovo su odluke o proizvodu koje su naše, ne klijentove. Za svako: šta je sada ugrađeno, moj predlog i šta se menja.

### V1. Posebno korisničko ime (Username)

- **Gde:** System → User accounts; prijava.
- **Sada:** e-mail je korisničko ime; lista ima jednu kolonu „Username / email". Referenca ima obavezan Username i neobavezan Email address (access-users-profiles-002, -005, -023).
- **Predlog:** dodati Username (obavezan, jedinstven), prijava korisničkim imenom ili e-mailom; kolone Username i Email address odvojeno.
- **Šta se menja:** novo polje i kolona; postojeći nalozi dobijaju Username = e-mail (bez prepisivanja: čita se kad polje nedostaje).

### V2. Pravilo lozinke

- **Gde:** User accounts (Add / Edit user), Change password.
- **Sada:** 10–256 znakova bilo koje vrste; merač jačine radi po skoru reference i Update je onemogućen ispod skora 5, server odbija slabu lozinku (access-users-profiles-R1). Zato lozinka „Abcdef12" ima dobar skor, a server je odbija (manje od 10). Referenca: najmanje 8, veliko slovo, malo slovo i cifra; crveni baner za slabu lozinku.
- **Predlog:** (c) najmanje 10, sa sve tri vrste znakova.
- **Izbor:** (a) pravilo reference, (b) naše, (c) 10 sa tri vrste. Za (a) ili (c): `server/auth.ts`, tekst pomoći, baner (mali posao).

### V3. Naše dodatne stavke menija

Referentni meniji (snimci `weld__start__dashboard.txt`, `mto__start__dashboard.txt`) prema našem `shared/pilots.ts` na `df5617a` (nepromenjen od `e5209c9`). Talasi 3 i 4 su već: uklonili Weld process i Weld Pilot Request archive (shell-general-025), uklonili Isometric materials iz MTO menija (mto-procurement-stock-011), prebacili Transfer orders na dugme u Storehouses (mto-procurement-stock-010). Iso overview u MTO Projects data postoji i u referenci (red je u snimku sakriven, rekonstruisan po broju redova, shell-general-026).

| Pilot | Stavka | Šta je | Predlog | Zašto |
|---|---|---|---|---|
| Weld | General data → Documents | opšti spisak svih fajlova | ukloniti iz menija, ruta ostaje | referenca nema globalni spisak; fajlovi se otvaraju po izometriji i zapisu |
| Weld | Welding data → Weld register | lista svih varova | ukloniti iz menija, ruta ostaje za pretragu i linkove | varovi se rade u tabeli varova izometrije i u NDT/PWHT Manager |
| Weld | Welding data → Data LISL | 87 kolona po varu | ukloniti iz menija | njegove kolone su sada izvoz Export weld data; LISL se štampa sa izometrije i iz ISO Book |
| Weld | Welding data → Inspection results | opšta lista rezultata | ukloniti iz menija, resurs ostaje | referenca drži rezultate u NDT/PWHT Manager i arhivama |
| Weld | System → Company data | podaci firme za PDF | ostaje | uputstva navode Edit company data za administratora; naši PDF-ovi ga trebaju |
| MTO | General data → Documents | isto kao Weld | ukloniti iz menija | isto |
| MTO | Transfer orders | već van menija (talas 4) | ostaje van menija | otvara se iz Storehouses i obaveštenja, kao u uputstvu |
| MTO | Isometric materials | već van menija (talas 3) | ostaje van menija | materijali se rade na izometriji (Import in ISO je tamo); arhivirani redovi se više ne vraćaju iz menija |
| MTO | Calculations (MTO & calculations, Calculation norms) | naša grupa | ostaje | tvoja odluka D8 |
| MTO | System → Company data | isto kao Weld | ostaje | isto |

- **Šta se menja ako se slažeš:** četiri Weld i jedna MTO stavka nestaju iz menija (rute ostaju); test menija se menja; korisnik reference više ne vidi stavke koje ne poznaje.

### V4. Polja sa formatiranim tekstom (rich text)

- **Gde:** Welding wire → Note; Punch → Description; Test system → Description; Flange record → Non-conformities, Note; Memo templates / „Instructions for field personnel"; masovni NDT zahtev → Note; Reopen → Notes.
- **Sada:** svuda običan višeredni tekst; globalni šabloni su prevedeni u tekst sa „- " redovima (nijedna biblioteka nije dodata bez tebe).
- **Izbor:** (a) ostaje običan tekst, (b) mali sopstveni editor (podebljano, kurziv, liste) bez biblioteke, (c) odobrena biblioteka.
- **Predlog:** (b). **Šta se menja:** jedna komponenta i čuvanje HTML-a sa čišćenjem; PDF-ovi štampaju liste (M).

### V5. Trajno brisanje ili arhiva

- **Gde:** svi katalozi (Delete), Material database → Delete material, Project sites → Delete project site, UOMs, Field Work Packages, Flange Documents.
- **Sada:** natpisi i potvrde su kao u referenci („Delete", „Are you sure?"), a ispod se zapis arhivira (može da se vrati). Delete material arhivira materijal za sve glavne projekte; referenca ga briše samo „for the current site" (izveštaj w3-mto-material-sites).
- **Predlog:** zadržati arhivu ispod; Delete material promeniti da uklanja samo vezu sa trenutnim glavnim projektom.
- **Šta se menja:** za Delete material jedna izmena (link tabela); trajno brisanje bi tražilo novu proveru zavisnosti i nije insert-only.

### V6. Zamena jedinstvenih indeksa na živoj bazi

- **Gde:** Flange Management (isometric + Flange ID), Welding wire / Certifications (ime u celom prostoru), Storehouses (ime).
- **Sada:** indeksi ostaju: druga prirubnica bez Flange ID na istoj izometriji se odbija (weld-punch-flanges-021); broj žice preskače broj zauzet na drugom glavnom projektu (weld-catalogs-material-ndt-023, sec1-009); isto ime skladišta se odbija (mto-procurement-stock-030).
- **Izbor:** (a) ostaju, (b) zameniti indeksima po glavnom projektu ([siteId, name]) — to nije samo dodavanje: stari indeks se briše na živoj bazi.
- **Predlog:** (a) za sada; (b) u posebnoj nadogradnji sa backup-om i probom. Bezbednosni pregled 2 nije proverio da li bi nov jedinstveni indeks na postojećoj tabeli pao na starim duplikatima — to bi proba morala da pokaže pre (b).
- **Pitanje:** smemo li da zamenimo jedinstvene indekse na živoj bazi — da / ne; ako da, koje (prirubnice, žice / sertifikati, skladišta).

### V7. Čitanje stare zalihe posle nadogradnje

- **Gde:** MTO Pilot → Material inventory, izometrija → Inv., Material status, Isometric execution, MTO dashboard.
- **Ugrađeno (`db4dea4`, `cf99e5e`):** nadogradnja ništa ne prepisuje. Stari red zalihe (upisan pre nadogradnje, bez vrste lokacije) čije skladište je pripadalo glavnom projektu računa se pri čitanju kao inventar tog glavnog projekta — za Material status, slobodnu zalihu, Inv., Start, Reserve i izdavanje — nikad preko glavnih projekata, i na hosted serveru i u pregledaču (server prilaže izvedene vrednosti `legacySiteId` i `legacyClaimed` samo za čitanje; nikad se ne čuvaju niti primaju od klijenta). Stari otvoren transfer nalog opet pokazuje izvor i može da se završi; stare nepreuzete pick liste rade dalje. Novo knjiženje u takav red završava izvođenje.
- **Šta se i dalje menja:** živa verzija broji zalihu svih skladišta bez obzira na glavni projekat; nova broji samo glavni projekat izometrije, kao referenca. Izometrije koje su se oslanjale na zalihu drugog glavnog projekta padaju. Na živim podacima (četvrta proba): tri izometrije Riverside installation idu sa 100 % na 0 % i Inv. na 0, jer im materijal leži samo u skladištu koje pripada North-u; Demo – Riverside ST-004 100 → 0 %, ST-006 86,5 → 0 %, ST-005 ostaje 100 % sa Inv. 180 → 0; Demo – North CW-003 100 → 91 % i SK-008 47,7 → 34 % (sada se računaju rezervacije i nepreuzete pick liste drugih izometrija). Šest izometrija North fabrication yard ostaje isto.
- **Izbor:** (a) ostaje izvođenje po glavnom projektu; (b) jednokratni korak koji staru zalihu zapisuje kao inventar sajta njenog skladišta (samo umetanje pokreta, ali menja brojke za stalno i traži novu probu; ne pomaže Riverside-u); (c) staru zalihu računati za sve glavne projekte kao do sada (staro ponašanje, meša projekte, protiv granice glavnog projekta i reference); (d) ne računati je nigde dok se ne prebaci (Inv. 0 dok korisnik ne uradi Transfer to project).
- **Predlog:** (a), uz najavu klijentu pre puštanja; za Riverside korisnik prebacuje materijal iz North skladišta (Transfer to project) ako mu pripada.

### V8. Ograničenje prijava iza hosting proxy-ja

- **Sada:** 8 neuspelih prijava zaključava nalog 5 minuta; 40 sa jedne adrese zaključava adresu. `trust proxy` nije postavljen, pa iza zajedničkog proxy-ja limit od 40 važi za sve zajedno; brojač je u memoriji po instanci (sec1-010; bezbednosni pregled 2 potvrđuje da pravilo važi i da `X-Forwarded-For` ne menja brojanu adresu).
- **Predlog:** postaviti `trust proxy` na jedan skok hosting proxy-ja (posle provere kako hosting šalje adresu) i brojač u bazi.
- **Šta se menja:** dve izmene servera; brojač u bazi traži novu tabelu (samo dodavanje).

### V9. Otvaranje generisanih PDF-ova na referenci

- **Sada:** dokumenti koje referenca pravi pri otvaranju (LISL varijante, weld card, labels, ISO Book, Punch list blank, Flange report, PDF zahteva, Export.xlsx) nisu otvarani, jer otvaranje pravi dokument na klijentovom sajtu. Sadržaj naših dokumenata je upoređen samo sa uputstvom.
- **Pitanje:** da li smem da otvorim po jedan primerak svakog (pravi fajl, ne menja podatke) — da / ne. Ili tražimo primerke od klijenta (pitanja 1, 14, 16).

### V10. Nalog na referenci sa više prava

- **Sada:** bez prava su ITPs, ITP templates, Storehouses, NDT Batch Import i uvoz prirubnica; građeno po uputstvima. Ništa posle prijave na našem živom sajtu nije provereno (ti se prijavljuješ).
- **Pitanje:** da tražiš od klijenta nalog sa tim pravima — da / ne.

### V11. Dvostepena verifikacija

- **Sada:** nema. U referenci je uključuje samo globalni administrator proizvođača.
- **Izbor:** da (aplikacija za autentifikaciju, prekidač za naše administratore, M) / ne.

### V12. Svetla / tamna tema

- **Sada:** nema Change theme ni prekidača u zaglavlju; meni koji se skuplja u ikonice je naša zamena.
- **Izbor:** dodati prekidač svetlo / tamno po korisniku (M) — da / ne.

### V13. Uputstva u aplikaciji

- **Sada:** nema stavke User Manuals; tekst proizvođača se ne kopira.
- **Izbor:** napisati naša uputstva za Weld Pilot i MTO Pilot (M, pisanje) — da / ne.

### V14. Prikaz uživo ili snimak

- **Gde:** Isometrics list (Refresh data), Materials list (Last refresh).
- **Sada:** uživo, bez dugmeta i vremena osvežavanja. Referenca pokazuje noćni snimak sa dugmetom.
- **Predlog:** ostaje uživo. Ako ne: keš tabela i radnja osvežavanja po listi (M).

### V15. Razlozi za Reopen i polja Field work package

- **Reopen:** referenca ima obavezan Reason (NDT correction, Weld error corrected, Data entry error, Other) i Notes; mi imamo jedan slobodan tekst. Predlog: dodati Reason, Notes obavezne za Other (S).
- **FWP:** vaš sajt ima Name i Description; mi dodajemo Project, Package no., kolonu Isometrics i arhivu umesto brisanja. Predlog: uskladiti sa sajtom, Project ostaje neobavezan — da / ne.

### V16. Pravopis natpisa prirubnica

- **Sada:** „Tightening Date", „Commissioning Date" ispravno; referenca ima „Tightning", „Commisioning" (uputstvo piše ispravno). Ostali natpisi prirubnica se još razlikuju od reference.
- **Pitanje:** kopirati greške — da / ne. Predlog: ne; ostale natpise uskladiti (S).

### V17. Treći namerni prelaz granice pilota

- **Sada:** Import all project data upisuje varove (Weld Pilot) i redove materijala (MTO Pilot) iz jednog fajla; svaki deo sudi profil u pilotu kome pripada. ITP registar je čitljiv u MTO Pilot za svakoga ko čita izometrije. Drugi bezbednosni pregled je u toku.
- **Pitanje:** prihvataš li ova dva prelaza — da / ne (ako ne: uvoz po pilotu odvojeno).

### V18. ISO PDF Import i više klijenata

- **ISO PDF Import:** nije napravljen (u referenci skriven u meniju, stranica bez prava). Potvrdi da ostaje odložen — da / ne.
- **P8:** kasniji klijenti — svaki svoja baza (tvoj raniji predlog); kod se sada ne menja.

### V19. Naši sitni dodaci — zadržati?

Podrazumevano: zadržati sve. Za „ne" je svaki uklanjanje malo (S).

| Stavka | Ref. |
|---|---|
| Priority, Phases i izbor punch napretka na Status kartici izometrije | iso-shared-020 |
| Edit i Archive u redu Isometrics list (referenca: samo Open) | iso-shared-038 |
| Kolona „Prefab status" / „Field status" na listama izdavanja | weld-releases-013 |
| Kartica Flanges na izometriji | weld-punch-flanges-030 |
| Pending order: filter Subproject, Take in po redu, UOM u Ordered, „open" | mto-procurement-stock-027 |
| Pravi UOM u logu prijema (referenca „-") | mto-procurement-stock-034 |
| Export na Weld diameters i NDT process groups | weld-catalogs-material-ndt-006 |
| Dugme Certification index na Certifications | weld-catalogs-material-ndt-033 |
| Kartice Active / All / Archived, Filters i Columns na katalozima | weld-catalogs-material-ndt-R5 |
| WDI panel iznad Weld dashboard-a (zahtev klijenta) | P4 |
| Meni koji se skuplja u ikonice | QA-FINDINGS 2026-11-16 |
| „Show active welds" za povratak iz obrisanih varova | weld-iso-welds-012 |
| Administratorski izbor „Show signatures of" na Signatures; JPEG uz PNG | access-users-profiles-017 |
| Order archive CSV | W4 (w4-exports) |
| Upload NDT on multiple welds i dugmad za upload u Manager-u (u Options tabele varova je već uklonjeno) | weld-inspections-018, -019 |
| VT: „Not applicable" i „Set all to Accepted" (uklonjeni u talasu 2) — vratiti? | weld-inspections-015 |

### V20. Ostale odluke sa podrazumevanim (sitno)

| Pitanje | Ugrađeno |
|---|---|
| Zapisi nastali pre novog glavnog projekta važe i na njemu | da (nema veze = uključeno) |
| Stariji sertifikati „za sve projekte" dobijaju glavni projekat | ne, ostaju zajednički |
| Zavarivači bez sajta skriveni kad je izabran projekat | da, osim globally deployable |
| Welder 1 i 2 se brišu pri čuvanju kad je Combination isključen | da |
| Kopija WPS-a nosi sufiks „(<sajt>)" | da, broj WPS je jedinstven |
| Mass copy sa kopijom među čekiranima | ceo zahtev odbijen |
| Global deactivate za ograničen nalog | odbijen |
| Proces zavarivanja WPS-a iz teksta | ne izvodi se |
| Server odbija sajt bez ijedne težine | ne (prihvata) |
| Dodavanje naloga | Insert na 26 plus Edit na 26 i 53 |
| Company data prati prava 26 | ne, samo administrator |
| Module-level profili dobijaju oblasti za korisnike | ne |
| Brojač zahteva | jedan za ceo prostor |
| Weld edit konflikt | posebna rečenica ostaje |
| Standardni kod greške + norma | dozvoljeno, kod se zaključava; tačno poklapanje |
| Assign order to supplier | pravo Print na 17 |
| Material log, obaveštenja skladišta, broj izveštaja | naš tekst, pet cifara |
| Undo / restart NDT | Undo oblast 66, restart pravo Add |
| Punch Print bez izbora jezika; bez reči „Akkoord" | da |
| Punch sign-off kartica otvara | Punch ako ima otvorenih, inače Pre-Punch |
| ITP X-Ray izmena ograničenog naloga | ostale izometrije čekaju kasniju sinhronizaciju |
| Izometrija premeštena u projekat sa automatskim IRN | odbijeno dok ima IRN |
| Naziv fajla zahteva _S<sajt> | redni broj glavnog projekta |
| Edit reason na record rutama | samo u save-weld |
| Welder note / WQ No starih kvalifikacija / Name select na serveru / brisanje vrednosti welder card liste | opis; broj sertifikata; ne; da |
| Export dugmad bez Export polja | prate Show |
| Kolone izvoza | zaglavlja liste |
| Spool iz forme vara | dovoljno pravo čuvanja vara; seed imena uključena svuda |
| Iso book „Generate grouped" | ISO Book dijalog „by part" |
| Memo šabloni na izometriji | dovoljno View on Isometrics |
| Dashboard izveštaj, datum To | prazno; mount treba da prosledi podrazumevani datum |
| Tipovi transfer naloga u bazi | ne menjaju se; lista pokazuje tekst uputstva |
| NDT Batch Import: kasniji zahtev na varu; natpisi | siv red, ne upisuje se; „Not matched", „Not saved" |
| Rezultati MTO dashboard-a gated | samo u stranici, bez server rute |
| Arhiva zahteva (NDT) | generička ruta; samo Undo ima proveru |
| Material Details: „Ordered in this order" | samo kad se razlikuje |
| Import in ISO: kolona Spool | čita se, ne čuva |
| Clean import traži pravo delete | da |
| Ograničen nalog otkriva da Material No postoji | da, materijal se veže |
| Start / Undo u ostalim profilima | da, jedan model zalihe |

### V21. sec3-001: granica novog profila važi samo pri pravljenju

- **Sada:** profil sa pravima može da napravi samo nalog sa Edit na 26 i 53, i samo do prava sopstvenih profila (sec2-013). Prazan profil napravljen prvo može posle da se izmeni na bilo koja prava dok ga niko ne koristi (sec3-001, nisko, ostavljeno namerno).
- **Pitanje:** da li je Edit na 26 i 53 zamišljen kao puna uloga administratora prava — (a) da, ostaje ovako; (b) ne, ista granica važi i pri izmeni neiskorišćenog profila (mala izmena servera, S).

### V22. sec3-002: pravilo dosega preskače arhivirane naloge

- **Sada:** izmena prava profila se odbija kad ga koristi aktivan nalog van dosega urednika (sec2-001), ali arhivirani nalozi se ne broje; vraćen arhiviran nalog dobija izmenjena prava (sec3-002, nisko, ostavljeno namerno).
- **Izbor:** (a) ostaje; (b) brojati i arhivirane naloge (S).

### V23. Otvorene tačke iz bezbednosnog pregleda 2

- (a) Sme li sam Users Edit da čekira Storehouse manager drugom nalogu? Sada: treba Edit na 26 i 53 i doseg svih glavnih projekata u MTO Pilot. Predlog: ostaje.
- (b) Mora li QA/QC potpisnik prirubnice biti druga osoba od tehničara? Sada: ne mora. Predlog: da (S).

---

## Deo 4 — Za vlasnika: pitanja P1–P8 i K1–K10 iz plana prve verzije

| # | Pitanje | Šta se desilo |
|---|---|---|
| P1 | Nalog sa pravima na ITPs, Storehouses, NDT Batch Import | Uglavnom odgovoreno uputstvima (MTO §5, uputstvo §21, §18); sve tri su građene po uputstvu. Nalog bi još pomogao za ITP templates, uvoz prirubnica i izgled stranica — pitanje V10. |
| P2 | ISO PDF Import i NDT Batch Import sada ili kasnije | NDT Batch Import je napravljen u talasu 4 (shell-general-024). ISO PDF Import nije (u referenci skriven) — potvrda u V18. |
| P3 | „Sub Projects" / „Plant location" | Odgovoreno klijentovim zahtevima; napravljeno (iso-shared-022). |
| P4 | Compliance dashboard umesto WDI ili oba | Compliance dashboard reference je napravljen (talas 4); naš WDI panel stoji iznad njega kao dodatak — V19. |
| P5 | Izbor sajta | Odgovoreno (klijent + uputstvo): izbor posle prijave i „Change site" u meniju naloga; napravljeno (shell-general-015). |
| P6 | Demo projekat u klijentovoj bazi | Urađeno u prvoj verziji. |
| P7 | Migracije samo dodaju, sa backup-om | Urađeno; nadogradnja ovog audita takođe samo umeće (QA-FINDINGS). |
| P8 | Više klijenata | Ostaje za tebe, bez izmene koda — V18. |
| K1 | Obavezna polja vara | Odgovoreno (Mandatory fields); napravljeno. |
| K2 | Pravilo tracera | Uglavnom odgovoreno i napravljeno (predlog po grupi, weld-inspections-011); NDT Req. na traceru — klijent, pitanje 17. |
| K3 | Uslovi za Prefab / Field release | Odgovoreno uputstvom i napravljeno (dva koraka: complete pa dokument); ostatak — klijent, pitanje 7. |
| K4 | Kada se var zaključava | Odgovoreno i napravljeno (zaključan posle Prefab / Field complete). |
| K5 | Lista zavarivača u Add weld | Odgovoreno (Validation on WPS) i napravljeno; pravila prečnika — klijent, pitanje 18. |
| K6 | Limit repair performance | Odgovoreno (polje sajta, prazno = 5 %). |
| K7 | Material status %, Reserve, Start | Start, Undo i pick liste odgovoreni i napravljeni; formula — klijent, pitanja 2–4. |
| K8 | Negativan prijem; PDF ili e-mail porudžbine | PDF porudžbine napravljen, e-mail nigde ne postoji; negativan prijem prihvaćen na redu porudžbine; ko sme — klijent, pitanje 27 (e). |
| K9 | Liste statusa | Transfer order (šest statusa) i test sistem odgovoreni i napravljeni; prirubnica — klijent, pitanje 9. |
| K10 | Tekst poruka greške | Delom odgovoreno tabelama grešaka u uputstvima i napravljeno (w2-refusal-texts); ostalo po našem obrascu, nije pitanje. |
