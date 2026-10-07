import type { IMessage, MessageAttachment } from '@rocket.chat/core-typings';

const attachmentText = (attachment: MessageAttachment): string =>
	[attachment.title, attachment.description, attachment.text, 'author_name' in attachment ? attachment.author_name : undefined]
		.filter((part): part is string => typeof part === 'string' && part.length > 0)
		.join(' ');

const haystackOf = (message: IMessage): string =>
	[message.msg, ...(message.attachments ?? []).map(attachmentText)].filter(Boolean).join('\n').toLowerCase();

/**
 * Case-insensitive search over decrypted messages: every word of the query must appear in
 * the text or in an attachment's name, caption or quoted text. Newest matches come first.
 */
export const searchDecryptedMessages = (messages: readonly IMessage[], query: string, limit = Infinity): IMessage[] => {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);

	if (!words.length) {
		return [];
	}

	const seen = new Set<IMessage['_id']>();

	return [...messages]
		.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
		.filter((message) => {
			if (seen.has(message._id)) {
				return false;
			}
			seen.add(message._id);
			const haystack = haystackOf(message);
			return words.every((word) => haystack.includes(word));
		})
		.slice(0, limit);
};
