# PDFreader OCR

PDFreader OCR is a local tool for extracting tagged text values from scanned or digital PDFs.

The app covers only the extraction step. It does not check consistency across quotation requests, quotations, purchase orders, and order confirmations. Downstream systems can consume the generated JSON and compare item details, dates, document IDs, amounts, owners, and related fields.

## Features

- Recursively scans a local folder for PDF files.
- Lets each PDF choose a saved OCR format.
- Previews a PDF page and lets the user draw tagged rectangles on top of it.
- Saves reusable formats such as `2026年度見積依頼書フォーマット`.
- Runs OCR only inside the configured rectangles.
- Writes one JSON extraction file per PDF.

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
5. Save the format.
6. Assign formats to PDFs in the list.
7. Run OCR for the selected PDF or all assigned PDFs.
8. Save JSON files.

If `JSON出力先` is empty, files are written under `data/output`.

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

## OCR Notes

OCR runs in the browser with Tesseract.js using `jpn+eng`.

The first OCR run may download language data. The current preprocessing is tuned for rectangular regions containing Japanese, alphabetic text, Arabic numerals, hyphens, yen signs, dollar signs, and common amount punctuation.

Very low resolution scans, skewed pages, handwriting, stamps over text, or fields that include heavy ruled lines may still need template adjustment or better source scans.
