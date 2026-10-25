# Weekly summary payload (app -> Worker) - the ONLY thing that ever leaves the phone
# Rules: aggregates only. No notes, no names, no single transactions, no free text.
# Every string is from a fixed enum. Every number is app-computed.

{
  "v": 1,                          // schema version
  "week": {
    "start": "2026-10-19",          // ISO dates of the current Mon-Sun week
    "end": "2026-10-25",
    "days_elapsed": 6               // days with any data so far this week
  },
  "budget": 860,                    // weekly budget, or null when unset
  "spent_total": 640,
  "entry_count": 6,
  "categories": { "food": 260, "college": 150, "travel": 120, "fun": 110 },
  "needs": 270,                     // totals from labelled entries only
  "wants": 370,
  "pace_projection": 747,           // spent_total / days_elapsed * 7, app-computed
  "facts": [                        // app-computed candidate facts the model may reference
    { "id": "P1", "kind": "biggest_category", "category": "food", "amount": 260, "share_pct": 41 },
    { "id": "P2", "kind": "wants_majority",   "wants": 370, "share_pct": 58 },
    { "id": "P3", "kind": "pace",             "projection": 747, "budget": 860, "under_budget": true }
  ]
}

# Fact kinds are a closed enum: biggest_category, wants_majority, pace,
# no_budget, low_data. Single-expense facts (e.g. a biggest individual
# expense) are never included: the approved scope is aggregates only.
# The model must answer with a pattern_id from THIS list - it never writes numbers.

# CONTRACT UPDATE (25 Oct, after live model testing):
# facts[] MUST be ordered by the app, most decision-relevant fact FIRST.
# The Worker instructs the model to always use facts[0] and the app renders
# that fact's numbers. Salience ranking is app-owned and deterministic;
# the model only wordsmiths. Live-tested: this is what made quality pass.
