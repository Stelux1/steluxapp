# 1.02 Project data import sheet (CSV) voorbereiden (Prepare project data import sheet)
URL: https://websonik.com/kennisbank/1-2-project-data-import-sheet-csv-voorbereiden/ — Updated 12-06-2026

Statements:
- CSV is flat data with no formatting and cannot represent special characters; importing such characters into the SQL database gives unwanted results.
- Example: inch marks (") and degree signs written in Excel formatting break in CSV. Replace unwanted characters with text before import: degree sign -> "gr", inch/quote mark -> "in". Do this with Excel Find & Replace.
- After preparing, copy data and paste into the import sheet **without formatting (paste as plain values)**; always paste without formatting in the CSV.
- No column list is given in this article (the article does NOT list the columns of any import sheet). The screenshots show the Excel vs CSV view of the same data and the find/replace dialog, and pasting without formatting (images 9, 10 and lazy ones; not read for column names).
