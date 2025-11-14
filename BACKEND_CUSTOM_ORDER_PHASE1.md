# Custom Order Phase 1 Payload Contract

This document describes the POST `/api/custom-orders/quote` multipart/form-data payload after Phase 1 (printing type + team mode).

## Fields
- garmentType (string) e.g. `tshirt` | `jersey` | `hoodie`
- selectedLocation (string) e.g. `Front`, `Back`, `Left Sleeve`
- primaryColor (string hex or name) e.g. `#3B82F6`
- secondaryColor (string) (reserved)
- accentColor (string) (reserved)
- designText (string) last added text element content or empty
- requestType (string) For this flow use `quote` to indicate a quote submission (not final order)
- quantity (number) Effective quantity (team entries count if teamMode active, else user input)
- totalPrice (number) Calculated client side = `basePrice * quantity`
- printingType (string) One of: `dye-sublimation` | `heat-transfer` | `vinyl-print`
- teamMode (string) `'true'` or `'false'`
- teamEntries (string JSON) Array of objects when teamMode true:
  ```json
  [
    {"id":"tm_1731590000000","name":"PLAYER NAME","number":"12","size":"M"}
  ]
  ```
- designElements (string JSON) Array of positioned text/design overlays:
  ```json
  [
    {
      "id":"de_1731590001000",
      "type":"text",
      "text":"SAMPLE",
      "color":"#000000",
      "font":"Arial",
      "size":36,
      "x":120,
      "y":140,
      "width":140,
      "height":56,
      "rotation":0,
      "zIndex":1
    }
  ]
  ```
- designImage (file, optional) Uploaded asset if provided.

## Backend Validation Recommendations
1. Ensure `quantity` matches `teamEntries.length` when `teamMode==='true'`.
2. Quotes vs orders: when `requestType==='quote'`, mark record as `pending_admin_review` and omit final totals from customer response.
3. Reject if `teamEntries` present but `teamMode==='false'` (or ignore teamEntries).
4. Validate `printingType` against allowed list.
5. Sanitize all text fields (names, designText) for length & disallowed characters.
6. Enforce numeric range for `number` (1-999) and sizes in set {XS,S,M,L,XL}.
7. Recompute totals server-side from authoritative pricing to prevent tampering.
8. Store raw `designElements` JSON for later rendering/proof generation.

## Example Successful Response (quote submission)
```json
{
  "data": { "quoteNumber": "Q-2025-000123" }
}
```

## Future Phase Considerations
- Add per-entry pricing modifiers (e.g., size-based or printing method upcharges).
- Support image/design layering with uploaded artwork metadata.
- Introduce validation error schema: `{ errors: ["Row 2: number invalid"] }`.
- Persist preliminary quote vs. final order distinction.

## Notes
Front-end currently sends `teamMode` as a string. Backend may normalize to boolean. `designImage` only sent if user uploaded a file.
