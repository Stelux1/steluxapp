# 5.201 Material Certificates
URL: https://websonik.com/kennisbank/5-20-1-material-certificates/ — Updated 29-10-2025
- Mandatory fields validation: enable option **"Mandatory Fields"** on the "Edit Project Location" page; then listed fields must be filled before saving; saving without them gives an error and is blocked (see also 5.02: Material type, Schedule, Certificate type for certificates).
- Copy certificates: open a certificate, "Bewerken Certificaat" (edit), change as needed, tick **Copy File** to include the PDF, click **Duplicate Certification** (in Certifications Index).
- Option **Project-specific Material Certificates** in Edit Project Site: when entering/editing a certificate in Certifications module you see a shortened list of only the heat/charge numbers relevant to that project.
- Certificates (e.g. for flanged valves, blind plates) linked to a project can be included in the generated Certification Index and material certificate reports.
- Supplier shown in the certificates overview; can search/filter on supplier without opening the certificate.
- Export of material certificates incl. index for customers: only for users with **'full access'** (projects can have >5000 certificates with >20 pages each; server load). Steps: overview of material certificates -> button **'Export ZIP'** -> wait (can take 5-6 minutes) -> link appears to download ZIP -> unzip, open the included index file, click a certificate link to open it.
- 15 screenshots (copy dialog; project-specific option; index/export flow).

## Screenshot findings (from screenshot)
- Certifications list header buttons: "Import certifications", "Export to ZIP", "+ Add certification", "Filter"; columns Index number (page icon = PDF uploaded), Charge number, Certificate type, ..., Supplier, Ctrl. (controlled), Accep. (accepted), Options.
- **Edit certification** dialog: Charge number, Attest number, Material (with link "Change"), Diameter, Material part, Type of material, Schedule, Wall thickness, Hot yield, Impact strength, Certificate-type, Supplier, **Project** (multi-select chips, e.g. "Project 01", "Project 02" — one certificate can be linked to several projects), checkboxes Accepted and Controlled, Note, File; buttons **Duplicate certification** (green, with checkbox "Copy file"), Update, Cancel.
