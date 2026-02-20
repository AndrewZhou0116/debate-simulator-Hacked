/**
 * Emoji patterns for output sanitization only.
 * All prompt content lives in prompts.js.
 */

/** Strip all emoji (e.g. for Chair). */
export const EMOJI_PATTERN = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F910}-\u{1F92F}]/gu;

/** Non-facial emoji (decorative/object). Remove when allowing only facial. */
export const NON_FACIAL_EMOJI_PATTERN = /[\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F90F}\u{1F930}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
