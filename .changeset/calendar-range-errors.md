---
"@borrowdale/charts": minor
---

Name the calendar option to change when a date or range is out of bounds, and say when an end is a default. Code that matches on an error's `path` sees these changes:

- a date before a given `from` or after a given `to` is named at its place in `data`, where an omitted `to` was named before;
- a range of more than 100,000 days names `data` when the data alone span that many days, and otherwise the series, with both ends and which of them is a default, where it always named `to`.
