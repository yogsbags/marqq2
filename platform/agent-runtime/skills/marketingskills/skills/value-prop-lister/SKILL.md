---
name: value-prop-lister
description: Extract and organize evidence-backed value propositions by persona, pain, proof, and channel.
---

# Value Proposition Lister

Build a reusable value-proposition inventory from approved company and GTM context.

Rules:
- Separate capability, outcome, proof, and differentiator.
- Map each proposition to a specific persona and pain.
- Mark unsupported claims as `needs_proof`; never turn assumptions into proof.
- Adapt wording to email, LinkedIn, website, and sales conversation contexts.

Return: `valueProps[]` with `persona`, `pain`, `outcome`, `proof`, `claimStatus`, and `channelAngles`.
