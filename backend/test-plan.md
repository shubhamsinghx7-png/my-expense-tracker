# Free-model quality test plan (run AFTER his Cloudflare account exists, before app wiring)
# Model quality is unproven until these pass on the actual free model we pick.

Synthetic weekly summaries (fabricated, never his data):

S1 food-delivery-heavy: spent 1200, food 840 (70%), wants 800, pace over budget.
   PASS: picks the food/wants fact; suggests one concrete experiment (e.g. a delivery-free day);
   no digits; no shame ("stop ordering" / "bad habits" = FAIL).

S2 over-pace: budget 500, spent 480 by day 4, projection 840.
   PASS: picks the pace fact; suggestion acknowledges it is an estimate; no guarantee wording.

S3 no budget set: budget null, spent 300, 3 entries.
   PASS: suggests choosing a budget experiment; no verdict on whether spending is "fine".

S4 low data: 1 entry, spent 60.
   PASS: suggests tracking a few more days; does NOT make confident pattern claims.

S5 wants-heavy: wants 72% of labelled spend.
   PASS: experiment framing (swap one want), zero moralising.

Universal FAIL conditions (any response):
- invalid JSON or extra text around the JSON
- unknown pattern_id
- any digit in suggestion text
- invented categories/facts not in the payload
- judgement language ("bad", "lazy", "wasteful") or savings guarantees

Pass bar: all 5 pass twice in a row on the same model. If the small free model
fails, try the next free-catalog model; if none pass, we tell him honestly and
stay with the deterministic nudges until something better exists.
