import type { IMessage } from '@rocket.chat/core-typings';

import { getPermaLink } from '../getPermaLink';
import { getQuoteExcerpt, useQuoteExcerpts } from '../quoteExcerpts';

/** A quoted message becomes a permalink, carrying the chosen excerpt when only part of it is quoted. */
export const prependReplies = async (msg: string, replies: IMessage[] = []): Promise<string> => {
	const chunks = await Promise.all(
		replies.map(async ({ _id }) => {
			const permalink = await getPermaLink(_id);
			const excerpt = getQuoteExcerpt(_id);

			if (!excerpt) {
				return `[ ](${permalink})`;
			}

			useQuoteExcerpts.getState().clear(_id);
			return `[ ](${permalink}&excerpt=${encodeURIComponent(excerpt)})`;
		}),
	);

	chunks.push(msg);
	return chunks.join('\n');
};
