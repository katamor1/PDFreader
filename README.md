# PDFreader OCR

PDFreader OCR is a local tool for extracting tagged text values from scanned or digital PDFs.

The app covers only the extraction step. It does not check consistency across quotation requests, quotations, purchase orders, and order confirmations. Downstream systems can consume the generated JSON and compare item details, dates, document IDs, amounts, owners, and related fields.

## Features

- Recursively scans a local folder for PDF files.
- Lets each PDF choose a saved OCR format.
- Previews a PDF page and lets the user draw tagged rectangles on top of it.
- Falls back to Poppler page rasterization when PDF.js cannot preview a PDF that other readers can open.
- Saves reusable formats such as `2026年度見積依頼書フォーマット`.
- Runs OCR only inside the configured rectangles.
- Writes one JSON extraction file per PDF.
- Writes one aggregate CSV file for spreadsheet and downstream-system import.

## Run

```powershell
Set-ExecutionPolicy -Scope Process Bypass
npm install
npm run dev
```

Open the Vite URL shown by the client process, normally `http://127.0.0.1:5173`.

The API listens on `http://127.0.0.1:4174`.

## Workflow

1. Enter a PDF folder path and click `検索`.
2. Create or select a format.
3. Select a PDF and draw rectangles in the preview.
4. Select each rectangle and set its JSON tag.
5. Re-select an existing rectangle later to move it by dragging, or resize it with the four corner handles.
6. Save the format.
7. Assign formats to PDFs in the list.
8. Run OCR for the selected PDF or all assigned PDFs.
9. Save JSON files, CSV, or both.

If `出力先` is empty, files are written under `data/output`.

## Stored Data

Saved OCR formats are stored in:

```text
data/templates.json
```

The format stores rectangle coordinates as normalized page ratios, so the same format can be reused across PDFs generated from the same paper layout.

## JSON Shape

Each output file uses this high-level shape:

```json
{
  "schemaVersion": 1,
  "extractedAt": "2026-05-28T01:00:00.000Z",
  "sourcePdf": {
    "name": "quote.pdf",
    "path": "C:/docs/quote.pdf",
    "relativePath": "quote.pdf"
  },
  "format": {
    "id": "fmt-quote-2026",
    "name": "2026 quote request",
    "documentType": "quote_request"
  },
  "fields": {
    "amount": "¥ 120,000",
    "owner": "Sato"
  },
  "pages": [
    {
      "pageNumber": 1,
      "fields": [
        {
          "fieldId": "field-amount",
          "tag": "amount",
          "text": "¥ 120,000",
          "confidence": 91.2,
          "rect": {
            "x": 0.1,
            "y": 0.2,
            "width": 0.3,
            "height": 0.1
          }
        }
      ]
    }
  ],
  "warnings": []
}
```

## CSV Shape

CSV output is one aggregate file per save operation. Each recognized field becomes one row.

The CSV is UTF-8 with BOM for Excel compatibility and uses these columns:

```text
source_pdf,relative_path,format_id,format_name,document_type,extracted_at,page_number,tag,text,confidence,warning
```

## OCR Notes

OCR runs in the browser with Tesseract.js using `jpn+eng`.

The first OCR run may download language data. Before OCR, each selected rectangle is enlarged and converted to strict black-and-white pixels using automatic thresholding with a darker bias so faint scan text is retained. The preprocessing is tuned for rectangular regions containing Japanese, alphabetic text, Arabic numerals, hyphens, yen signs, dollar signs, and common amount punctuation.

Very low resolution scans, skewed pages, handwriting, stamps over text, or fields that include heavy ruled lines may still need template adjustment or better source scans.

## PDF Preview Compatibility

The normal preview path uses PDF.js in the browser. Some PDFs that Adobe Reader or Microsoft Edge can open are still malformed or unusual enough for PDF.js to reject, especially small PDFs produced by printer drivers or legacy scanners.

When PDF.js preview fails, the app asks the local API to render the requested page to PNG with `pdftocairo` and displays that image instead. The same fallback is used for OCR page rendering. This keeps the workflow available without manually re-saving the PDF through Microsoft Print to PDF.

`pdftocairo` and `pdfinfo` must be available on `PATH` for this fallback. In this environment they are provided by TeX Live.
