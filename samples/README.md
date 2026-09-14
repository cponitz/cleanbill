# Samples

Finished outputs of the prototype, checked in so they stay addressable. All synthetic — every file here uses the test lead `TRD-TEST-0001` and the synthetic property account `999000001` (3675 DUVAL ST). No real homeowner data is in this folder.

| File | What it is |
|---|---|
| `sample-form-50114-packet.pdf` | A packet produced by the live `process-claim` function: the official Comptroller Form 50-114 (Rev. 02-26/39) filled from an extracted driver's license, typed `/s/` signature on the signature line, flattened, plus the electronic-signature and preparer record as an attachment page. |
| `sample-outreach-letter-variant-a.pdf` | Outreach letter with the refund math, a QR code to the claim page, and the Texas Property Code §41.0051 advertisement disclaimer in 14-point bold. |
| `system-map.html` | Architecture diagram plus a 12-step linked walkthrough for viewing and testing every component. Open it in a browser. |
| `architecture-diagram.png` | The three-lane architecture diagram on its own, for slides. |
| `screenshot-claim-page.png` | The claim page as rendered on a phone. |
| `screenshot-ops-dashboard.png` | The ops dashboard showing a processed claim: extraction, validation findings, packet link, and the agent's draft awaiting approval. |

The 25-lead verification pack is **not** here: it contains real owner names and addresses. It lives in `~/Desktop/ClaudeCowork/texas-refund-desk/artifacts/`.
