# 5.05 Dashboard
URL: https://websonik.com/kennisbank/5-05-dashboard/ — Updated 16-04-2025

- Dashboard opens first when WeldPilot starts. Default filter = one month period; period and filters changeable (filters on the left, e.g. date).
- Menu **View** (top right, next to menu **Reports**): switch the weld display between **millimetres** and **numbers (counts)**; shows how many welds are completed in a period/project phase.
- Button 'Report'/menu 'Reports' generates reports with the entered parameters.
- Report to monitor NDT percentage (NDO-percentage): select period between two dates; select a welder; select WPS method; click 'Filter'; wait until dashboard refreshed; Reports => 'Welder tracking – NDT tracking'; in pop-up give percentage to show, e.g. <25%; choose whether tested welds are also shown; click 'Go'.
- Revisions report: Dashboard => 'Rapporten' => 'Revisies rapport' (Revisions report).
- Global welder report with NDT welds as basis for periodic extension of welder certificates: Dashboard, select period, select welder, optionally WPS, Filter, then Reports.
- Article gives NO KPI definitions (no examined %, repair rate, repair performance text). Screenshot 1 (Scherm 2025-04-16 12.56.29, 1024x515) shows the dashboard; screenshot content to be added in appended section if read.

## Screenshot findings (from screenshot)
- Dashboard header: "WeldPilot" app bar, breadcrumb "Project 10 / Dashboard", language flag, warning triangle icon, user menu ("Administrator"). Panel title "Dashboard". Top right of panel: **View: Welds length** dropdown (options "Welds length" / "Number of welds") and **Reports** dropdown.
- **Left filter panel** fields (labels): From Date, To Date (default span 1 month, e.g. 17.03.2025 - 16.04.2025), Company, Weld type, Intern prj. no. (default "All projects"), Welder, ITP No, Test system, Piping class, IRN, PED Cat.-Mod, Material, NDT process group ("All NDT Groups"), NDT process ("All NDT processes"), WPS method ("All wps methods"); button **Filter** (magnifier icon) at bottom. Welder selector shows items like "BNI-02 | Henk Slomp".
- **KPI/pie panels** (top row of header cards: date range, "Project: All", "Welder: All", "Chart type: Pie chart"):
  1. **Examined / Total weld length** pie (legend Examined / Not examined). Example: 34% examined, 66% not examined. Card below: "Total weld length: 5782mm", "Examined: 1964mm".
  2. **Repaired / Total weld length** pie (legend Repaired / Total length). Example 99.7% total / rest repaired. Card "Repaired: 15mm".
  3. **Repaired / Examined** pie (legend Repaired / Examined). Example 99.2% examined.
  4. **Weld types ratio** pie (legend per weld type incl. Field Weld / Shop Weld, paged 1/2 with arrows) with text list of counts per type, e.g. "Butt Weld - Field", "Branch welds- Field", "Socked welds -Shop", "Butt Weld - Shop", "Reinforcment Pad GW -Shop", "Branch welds- Shop", "Reinforcment Pad -Field", "Longitudinal Welds - Shop/Field", "Reinforcment Pad FW -Shop", "Fillet Weld - Shop/Field", "HOOK-UP". In count mode the card shows "Field Weld: 548 / Shop Weld: 1325".
  So: examined % = examined length / total weld length; repair-related KPIs = repaired / total length and repaired / examined. (No formula text beyond the chart titles.)
- **Reports dropdown entries** (versions differ between screenshots): Welder report; Welder report - All sites; Welder tracking; Welder tracking [GU]; WDI tracking; **Welder tracking - With tracer**; Welder tracking - NDT tracking; Open welds; Revisions report.
- **Welder tracking - NDT tracking popup**: Language (English), "Percentage?" (example 25), checkboxes "Include examined welds" and "Show test pressured welds" (both ticked in example), buttons Go / Cancel. Output PDF "Welder tracking - NDT < 25%": header block (Home location, Project, Date range, Welder, WPS method, Weld type; right side PED Cat.-Mod, ITP nr., IRN, Company, Piping class, Test system), table columns Welder, WPS method, Welds, Total, %, Good, Rejected, followed by rows (system e.g. "Sewer", isometric no., diameter, weld no. such as "BP 01").
- **Revisions report** PDF: title "Revisions", Home location, Project, columns Project, Isometric, Revision number, Comment (e.g. "Bolt length change", "Material change", "Bolt length change - Pipe added").
- **Welder report** PDF: columns Weld no./Type, Project/ISO No, Ind.No., Material, Diameter / W.T. / Sch., Charge number, WPS number, Welder, Welded (date), NDT, Examined result, NA; footer per welder with NDT process, WPS method and totals box "Examined (mm) / Repaired / Repaired percent".
