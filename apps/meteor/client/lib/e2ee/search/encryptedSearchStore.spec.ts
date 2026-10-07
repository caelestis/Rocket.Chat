import type { IMessage } from '@rocket.chat/core-typings';

import { ENCRYPTED_SEARCH_TTL_MS, useEncryptedSearchStore } from './encryptedSearchStore';

const message = (id: string) => ({ _id: id, msg: id, ts: new Date() }) as unknown as IMessage;
const index = () => useEncryptedSearchStore.getState().byRoom.rid;

beforeEach(() => {
	jest.useFakeTimers();
	useEncryptedSearchStore.setState({ byRoom: {} });
});

afterEach(() => {
	jest.useRealTimers();
});

describe('encryptedSearchStore', () => {
	it('drops the decrypted history by itself once the TTL has passed', () => {
		const { begin, append, finish } = useEncryptedSearchStore.getState();
		begin('rid');
		append('rid', [message('a')], 1);
		finish('rid', 'ready');

		expect(index()).toMatchObject({ status: 'ready', expiresAt: expect.any(Number) });

		jest.advanceTimersByTime(ENCRYPTED_SEARCH_TTL_MS - 1);
		expect(index()).toBeDefined();

		jest.advanceTimersByTime(1);
		expect(index()).toBeUndefined();
	});

	it('restarts the clock when the history is loaded again', () => {
		const { begin, finish } = useEncryptedSearchStore.getState();
		begin('rid');
		finish('rid', 'ready');
		jest.advanceTimersByTime(ENCRYPTED_SEARCH_TTL_MS - 1000);

		begin('rid');
		finish('rid', 'ready');
		jest.advanceTimersByTime(ENCRYPTED_SEARCH_TTL_MS - 1000);
		expect(index()).toBeDefined();

		jest.advanceTimersByTime(1000);
		expect(index()).toBeUndefined();
	});

	it('does not keep duplicates and counts every page it was given', () => {
		const { begin, append } = useEncryptedSearchStore.getState();
		begin('rid');
		append('rid', [message('a'), message('b')], 3);
		append('rid', [message('b'), message('c')], 3);

		expect(index().messages.map((m) => m._id)).toEqual(['a', 'b', 'c']);
		expect(index()).toMatchObject({ loaded: 4, total: 3 });
	});
});
