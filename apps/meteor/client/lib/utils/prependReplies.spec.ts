import type { IMessage } from '@rocket.chat/core-typings';

import { prependReplies } from './prependReplies';
import { getPermaLink } from '../getPermaLink';
import { useQuoteExcerpts } from '../quoteExcerpts';

jest.mock('../getPermaLink', () => ({ getPermaLink: jest.fn(async (id: string) => `https://chat.example/group/x?msg=${id}`) }));

const reply = (id: string) => ({ _id: id }) as IMessage;

beforeEach(() => {
	jest.mocked(getPermaLink).mockClear();
	useQuoteExcerpts.setState({ byMessage: {} });
});

describe('prependReplies', () => {
	it('prepends one permalink per quoted message', async () => {
		await expect(prependReplies('hi', [reply('a'), reply('b')])).resolves.toBe(
			'[ ](https://chat.example/group/x?msg=a)\n[ ](https://chat.example/group/x?msg=b)\nhi',
		);
	});

	it('carries the chosen excerpt in the permalink and forgets it once used', async () => {
		useQuoteExcerpts.getState().set('a', 'brave & new');

		await expect(prependReplies('hi', [reply('a')])).resolves.toBe('[ ](https://chat.example/group/x?msg=a&excerpt=brave%20%26%20new)\nhi');
		expect(useQuoteExcerpts.getState().byMessage).toEqual({});
	});
});
