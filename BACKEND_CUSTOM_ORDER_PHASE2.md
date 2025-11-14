# Custom Order Phase 2 Payload & Pricing Contract

Extends Phase 1 (see BACKEND_CUSTOM_ORDER_PHASE1.md). Adds dynamic pricing surcharges and breakdown transparency.

## Additional Pricing Logic
- printingTypeSurcharges:
  - dye-sublimation: +₱0
  - heat-transfer: +₱40
  - vinyl-print: +₱60
- sizeSurcharges (applied per entry then averaged for unit price):
  - XS: 0, S: 0, M: 0, L: 10, XL: 15

If teamMode=false: unitPrice = basePrice + printingTypeSurcharge.
If teamMode=true: unitPrice = basePrice + printingTypeSurcharge + average(sizeSurcharge across entries).
Total = unitPrice * quantity (where quantity = number of team entries if teamMode, else user input).

## New/Changed Fields (multipart/form-data)
- unitPrice (number) Computed client-side; must be revalidated server-side.
- pricingBreakdown (string JSON) Detailed structure for auditing:
```json
{
  "basePrice":530,
  "printingType":"heat-transfer",
  "printingSurcharge":40,
  "sizeSurcharges":[{"size":"M","surcharge":0},{"size":"L","surcharge":10}],
  "unitPrice":580,
  "totalPrice":1160,
  "quantity":2
}
```

(Existing Phase 1 fields remain unchanged.)
Additionally:
- requestType (string) Use `quote` to indicate this is a quote request. Server should mark status as `pending_admin_review` and avoid sending customer-facing totals until approved.

## Server-Side Validation Steps
1. Recompute surcharges from authoritative tables (ignore client maps).
2. Verify quantity consistency: if teamMode true, quantity === teamEntries.length.
3. Recompute unitPrice and totalPrice and compare with received. If mismatch beyond tolerance, overwrite and flag.
4. Validate uniqueness of jersey numbers (client now enforces, server must confirm).
5. Confirm size list & printingType against allowed sets.
6. If `requestType==='quote'`, respond with minimal data (e.g., `quoteNumber`) and no totals to customer.
7. Rate-limit repetitive quote requests (optional future improvement).

## Error Response Recommendation
```json
{
  "errors": ["quantity mismatch", "invalid printingType"],
  "expected": {"unitPrice":580, "totalPrice":1740}
}
```

## Future Phase (Phase 3) Ideas
- Per-entry customization cost increments (multiple text/design elements fee).
- Bulk discount tiers (e.g., 10+, 25+, 50+).
- Separate quote vs. confirmed order endpoints.
- Image proof generation endpoint referencing designElements.

## Security Notes
- Treat all numeric values as untrusted; recalc server-side.
- Sanitize player names; enforce max length (e.g., 24 chars) and whitelist characters.
- Consider logging pricingBreakdown for audit but store canonical server recomputation.
