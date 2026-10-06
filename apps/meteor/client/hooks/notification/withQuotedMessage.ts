const SNIPPET_LENGTH = 60;

/** Appends a short quoted excerpt of a message to a notification text, e.g. after decrypting it on the client. */
export const withQuotedMessage = (text: string, message: string | undefined): string => {
	const trimmed = message?.trim();

	if (!trimmed) {
		return text;
	}

	const snippet = trimmed.length > SNIPPET_LENGTH ? `${trimmed.slice(0, SNIPPET_LENGTH - 1)}…` : trimmed;

	return `${text}: “${snippet}”`;
};
