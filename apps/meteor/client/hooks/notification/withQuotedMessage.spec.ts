import { withQuotedMessage } from './withQuotedMessage';

describe('withQuotedMessage', () => {
	it('quotes the message after the text', () => {
		expect(withQuotedMessage('alice: reacted with 👍 to your message', 'hello there')).toBe(
			'alice: reacted with 👍 to your message: “hello there”',
		);
	});

	it('shortens a long message', () => {
		const long = 'x'.repeat(100);

		expect(withQuotedMessage('t', long)).toBe(`t: “${'x'.repeat(59)}…”`);
	});

	it('leaves the text alone when there is nothing to quote', () => {
		expect(withQuotedMessage('t', undefined)).toBe('t');
		expect(withQuotedMessage('t', '   ')).toBe('t');
	});
});
