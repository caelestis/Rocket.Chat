import type { IMessage } from '@rocket.chat/core-typings';

import { searchDecryptedMessages } from './searchDecryptedMessages';

const at = (iso: string) => new Date(iso);
const msg = (id: string, text: string, ts: string, attachments?: unknown[]) =>
	({ _id: id, msg: text, ts: at(ts), attachments }) as unknown as IMessage;

const messages = [
	msg('a', 'Deploy on Friday evening', '2026-01-01T10:00:00Z'),
	msg('b', 'Nothing to see here', '2026-01-02T10:00:00Z', [{ type: 'file', title: 'Friday-report.pdf' }]),
	msg('c', 'friday was quiet, deploy postponed', '2026-01-03T10:00:00Z'),
	msg('d', '', '2026-01-04T10:00:00Z', [{ author_name: 'Alice', text: 'quoted deploy notes' }]),
];

describe('searchDecryptedMessages', () => {
	it('matches text case-insensitively and returns newest first', () => {
		expect(searchDecryptedMessages(messages, 'FRIDAY').map((m) => m._id)).toEqual(['c', 'b', 'a']);
	});

	it('requires every word of the query', () => {
		expect(searchDecryptedMessages(messages, 'deploy friday').map((m) => m._id)).toEqual(['c', 'a']);
	});

	it('looks into attachment names and quoted text', () => {
		expect(searchDecryptedMessages(messages, 'report').map((m) => m._id)).toEqual(['b']);
		expect(searchDecryptedMessages(messages, 'notes').map((m) => m._id)).toEqual(['d']);
	});

	it('honours the limit, skips duplicates and returns nothing for an empty query', () => {
		expect(searchDecryptedMessages([...messages, messages[0]], 'deploy', 2).map((m) => m._id)).toEqual(['d', 'c']);
		expect(searchDecryptedMessages(messages, '   ')).toEqual([]);
	});
});
