---
description: Release-readiness review of a work item or branch — changes, test evidence and approvals (Release Manager)
argument-hint: "<WI-NNN | branch | base..head>"
---

Use the `release-review` skill on: $ARGUMENTS

You may build a local `rc/WI-NNN` branch. Don't merge into shared branches, push, tag or deploy, even if the recommendation is GO. End by stating exactly which PO approvals (gate 4 merge, gate 5 production) are needed. For design reviews, use `/fw:design` (`architecture-review` skill) instead.
