// Helpers the @borrowdale packages share. They are not public API and can change in any release: the
// packages depend on each other at exact versions, so each always gets the core it was built with.
export { escaped, show } from './show.js';
export { ownOptions } from './options.js';
export { OPTION_NAMES, ownDash } from './validate.js';
export { COLOR_RULE, isColor, isPaint, MAX_PAINT, notXml, PAINT_RULE } from './paint.js';
export { fitPath, type FitBox } from './fit-path.js';
