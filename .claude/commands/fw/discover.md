---
description: Start a work item — analyze a business request against the codebase and produce a requirement brief (BA Agent)
argument-hint: "<request text or path to notes>"
---

Act as the BA Agent. Use the `requirement-analysis` skill on: $ARGUMENTS

- Investigate the code read-only. If a fact in `docs/discovery/` (`backend.md`, `frontend.md`, `integration.md`) is wrong or missing for this area, correct it there. Don't create a separate report.
- Finish by presenting the brief's open questions and asking the PO for gate 1 approval. Don't start design or planning.
