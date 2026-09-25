# Scoring algorithms

Scores are split into a **deterministic proxy** and a **semantic decision**. The proxy (IDs,
contexts, terms, trace links) narrows the candidates cheaply. The judge only makes the decisions a
proxy can't. `runner/score.py` implements everything marked *(prototype)*.

## A. Finding matching: `seeded` suites *(prototype)*

Each expected finding in `expected.yaml`:

```yaml
- id: EF-1
  types: [ambiguity, untestable]    # acceptable finding types
  affects_any: [GOAL-1, SC-1]       # at least one must appear in the finding's `affects` links
  min_severity: major               # blocker > major > minor
  routes: [human]                   # acceptable routes
  about: "…"                        # one line, used by the judge fallback and in reports
```

Procedure:
1. **Parse** the actual analysis artifact. Take each finding's `affects` targets from `trace.yaml`.
2. **Candidates:** pair an actual finding AF with an expected finding EF when `AF.affects ∩ EF.affects_any ≠ ∅`.
3. **Quality** of a candidate pair:
   - type ∈ `types`: 0.5
   - severity ≥ `min_severity`: 0.3
   - route ∈ `routes`: 0.2
4. **Assign** one-to-one, taking the highest quality first. Ties go to the lower AF number.
5. An EF with a candidate whose type doesn't match is **found-mislabelled** and gets partial credit.
   With the judge enabled, the judge confirms that AF really describes `about`. Without it, the prototype accepts the pair and marks it `unconfirmed`.

Metrics per case:

| Metric | Definition |
|---|---|
| `recall.blocker` | EFs with min_severity blocker that are matched **and rated blocker** / such EFs. An under-rated blocker wouldn't stop the pipeline, so it counts as missed. **Hard rule.** |
| `recall.all` | Σ credit / \|EF\|, where credit is 1 for a full match (type ok), 0.5 for found-mislabelled, 0 for missed |
| `severity_accuracy` | matched pairs with severity ≥ min / matched pairs |
| `route_accuracy` | matched pairs with an acceptable route / matched pairs |
| `noise` | unmatched AFs / all AFs. Each one is listed for a human to label as `valid-extra` (it joins the case's expected set) or `noise` |

## B. Alignment to a reference: `golden` suites

For requirements (design works the same way, with DES/ADR):
1. **Candidates** *(prototype)*: an actual REQ A and a reference REQ R are candidates when
   `A.context == R.context` and the Jaccard similarity of their `terms` is ≥ 0.4.
   A run's GOAL IDs need not match the reference's, so `derives-from` targets are compared only after the goals are aligned (judge).
2. **Decision** (judge): for each candidate pair, "Do A and R impose the same obligation?" → `equivalent | partial | different`.
   The prototype approximates this with term Jaccard: ≥ 0.6 counts as equivalent, 0.4–0.6 as partial.
3. **Assign** one-to-one, equivalents first, then by Jaccard, with ties going to the lower reference ID.
   **Merges:** when an actual REQ already matched covers another reference REQ equivalently, that reference REQ gets credit 0.5 (`merged`).
   The obligation is present but not atomic, and RQ-4 judges atomicity separately.
4. **AC coverage** (judge): for each matched pair, the share of R's ACs that some AC of A verifies.

The proxy can't tell *what* an obligation says, only which vocabulary it uses. So the prototype's
alignment is a candidate list for the judge, not a verdict. Its report marks every pair `unconfirmed`.

| Metric | Definition |
|---|---|
| `ref_coverage` | Σ w(R)·credit / Σ w(R), with w = 3 for must, 2 for should, 1 for could, and credit = 1 for equivalent, 0.5 for partial or merged |
| `ac_coverage` | mean AC coverage over matched pairs |
| `extras` | unmatched actual REQs, each reviewed as `valid-extra`, `scope-creep` or `duplicate` |
| `must_miss` | reference must-REQs with no match. **Hard rule: 0** |

Golden cases also compare leading metrics (`metrics.json`) with the floors in the case, and run the eval-gate judge.

## C. Consistency: `consistency` suites

Given n runs of paraphrased inputs:
- `goal_stability`: mean pairwise B-style coverage of the GOAL sets, where must-goals are aligned by judge equivalence.
- `req_stability`: mean pairwise `ref_coverage`, treating each run in turn as the reference.
- `finding_stability`: mean pairwise Jaccard similarity of the matched EF sets, when the case also has expected findings.
- `score_spread`: max − min of the eval-gate weighted score across runs.

## D. Judge criteria

Each rubric criterion is scored 1–5 against written anchors, and the judge must quote evidence (IDs plus text).
- Normalised criterion score: `(s − 1) / 4`
- Artifact score: the weighted mean of the normalised scores of **calibrated** criteria (calibration.md). Advisory criteria are reported but never counted.
- **Hard-fail:** a criterion flagged `hard_fail: true` with s ≤ 2 fails the gate, whatever the weighted score.

## E. Aggregation and reporting

- Case score: the suite's primary metric (seeded: `recall.all`; golden: `ref_coverage`; judge: verdict accuracy; consistency: `req_stability`; adversarial: assertions passed / total).
- Every case runs k = 3 times. The report shows mean, min and max. Hard rules use the **min**.
- The report per step lists every case's metrics, cost, tokens and wall time (from the litellm traces), and the delta against the baseline.
