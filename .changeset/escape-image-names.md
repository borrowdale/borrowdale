---
"@borrowdale/charts": patch
---

Errors for a missing image, an image without raster bytes, or one without a Canvas source write the image's name quoted and escaped: a character in the name that could break or disguise a line, such as a bidirectional override, is written as its `\u` escape. The messages show the name in quotes, as in `Missing chart image: "photo"`. A name longer than 100 characters, which only a layout built by hand can hold, is described by its length instead.
