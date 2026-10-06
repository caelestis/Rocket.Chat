import { isTranslatedMessage, getUserDisplayName } from '@rocket.chat/core-typings';
import type { ITranslatedMessage, IMessage } from '@rocket.chat/core-typings';

export const MAX_QUOTE_EXCERPT_LENGTH = 1000;

/**
 * Builds the quote attachment for a message. With an excerpt only that text is quoted,
 * without the message's own markdown, translations or attachments.
 */
export function createQuoteAttachment(
	message: IMessage | ITranslatedMessage,
	messageLink: string,
	useRealName: boolean,
	userAvatarUrl: string,
	excerpt?: string,
) {
	const quotedText = excerpt?.trim().slice(0, MAX_QUOTE_EXCERPT_LENGTH);

	return {
		text: quotedText || message.msg,
		...(!quotedText && message.md && { md: message.md }),
		...(!quotedText && isTranslatedMessage(message) && { translations: message?.translations }),
		message_link: messageLink,
		author_name: message.alias || getUserDisplayName(message.u.name, message.u.username, useRealName),
		author_icon: userAvatarUrl,
		attachments: quotedText ? [] : message.attachments || [],
		ts: message.ts,
	};
}
