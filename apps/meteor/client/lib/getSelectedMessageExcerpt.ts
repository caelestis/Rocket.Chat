import type { IMessage } from '@rocket.chat/core-typings';

export const MAX_EXCERPT_LENGTH = 500;

/** The text currently selected inside a message's body, when the whole selection lies within it. */
export const getSelectedMessageExcerpt = (mid: IMessage['_id']): string | undefined => {
	const selection = window.getSelection();
	const text = selection?.toString().trim();

	if (!selection || !text || selection.rangeCount === 0) {
		return undefined;
	}

	const body = document.getElementById(`${mid}-content`);
	if (!body?.contains(selection.getRangeAt(0).commonAncestorContainer)) {
		return undefined;
	}

	return text.length > MAX_EXCERPT_LENGTH ? `${text.slice(0, MAX_EXCERPT_LENGTH - 1)}…` : text;
};
