const NAME = String.raw`(?:jesse|jessie|jessy|jessi|jesi|jessa|jess|chessie|jassy|jesse's)`;
const FILLER = String.raw`(?:(?:hi|hey|hello|okay|ok|oh|so|um|uh|yo)[,!.]?\s+)*`;
const ASK = /^(?:what|what's|whats|when|who|who's|where|why|how|which|can|could|would|will|do|does|did|is|are|am|should|shall|remind|tell|add|note|save|remember|forget|find|help|give|show|schedule|set|book|send|text|call|plan|check|look|please|let's|i need|i want)\b/i;

const WAKE = new RegExp(String.raw`\b(?:hi|hey|hello|okay|ok)[,!.]?\s+${NAME}\b`, 'i');
const LEADING = new RegExp(String.raw`^\W*${FILLER}${NAME}\b[\s,!.?:-]*(.*)$`, 'is');
const COMMA = new RegExp(String.raw`\b${NAME}\s*,\s*(.*)$`, 'is');
const TRAILING = new RegExp(String.raw`\b${NAME}\W*$`, 'i');

export function heardWake(text: string) {
  return WAKE.test(text);
}

export function addressedTo(text: string): string | null {
  const match = text.match(LEADING) ?? text.match(COMMA);
  if (!match) return null;
  const rest = match[1].trim().replace(/^(?:(?:hi|hey|hello|okay|ok|um|uh)[,!.]?\s*)+/i, '');
  if (rest.split(/\s+/).filter(Boolean).length < 2) return null;
  return rest.endsWith('?') || ASK.test(rest) ? rest : null;
}

export function endsWithName(text: string) {
  return TRAILING.test(text);
}
