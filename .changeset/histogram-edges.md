---
"@borrowdale/charts": minor
---

Reject a histogram edge that the x axis' format cannot write exactly: with a fixed `format.decimals`, one such as 0.5 written as 1, and otherwise one with more than 20 decimals. Each bin's tooltip states its edges, and a rounded edge misstated the bin, or wrote an empty one such as `[1, 1)`.
