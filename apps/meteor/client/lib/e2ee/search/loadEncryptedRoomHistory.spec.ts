import type { IRoom } from '@rocket.chat/core-typings';

import { useEncryptedSearchStore } from './encryptedSearchStore';
import { loadEncryptedRoomHistory, stopLoadingEncryptedRoomHistory } from './loadEncryptedRoomHistory';
import { sdk } from '../../SDKClient';
import { e2e } from '../rocketchat.e2e';

jest.mock('../../SDKClient', () => ({ sdk: { rest: { get: jest.fn() } } }));
jest.mock('../rocketchat.e2e', () => ({ e2e: { getInstanceByRoomId: jest.fn() } }));
jest.mock('../../../../app/utils/lib/i18n', () => ({ t: (key: string) => key }));
jest.mock('../../utils/mapMessageFromApi', () => ({ mapMessageFromApi: (m: unknown) => m }));

const mockedGet = jest.mocked(sdk.rest.get);
const mockedInstance = jest.mocked(e2e.getInstanceByRoomId);

const room = { _id: 'rid', t: 'p' } as Pick<IRoom, '_id' | 't'>;
const index = () => useEncryptedSearchStore.getState().byRoom.rid;

const page = (ids: string[], total: number, encrypted = true) => ({
	messages: ids.map((id) => ({
		_id: id,
		rid: 'rid',
		ts: new Date().toISOString(),
		msg: '',
		...(encrypted && { t: 'e2e', content: { ciphertext: id } }),
	})),
	total,
	count: ids.length,
	offset: 0,
	success: true,
});

beforeEach(() => {
	jest.clearAllMocks();
	useEncryptedSearchStore.setState({ byRoom: {} });
	mockedInstance.mockResolvedValue({
		decryptMessage: jest.fn(async (message: { _id: string }) => ({ ...message, msg: `plain-${message._id}`, e2e: 'done' })),
	} as never);
});

describe('loadEncryptedRoomHistory', () => {
	it('pages through the room newest first, decrypts every page and marks the index ready', async () => {
		mockedGet.mockResolvedValueOnce(page(['a', 'b'], 3) as never).mockResolvedValueOnce(page(['c'], 3) as never);

		await loadEncryptedRoomHistory(room);

		expect(mockedGet).toHaveBeenNthCalledWith(1, '/v1/groups.messages', { roomId: 'rid', count: 100, offset: 0, sort: '{ "ts": -1 }' });
		expect(mockedGet).toHaveBeenNthCalledWith(2, '/v1/groups.messages', expect.objectContaining({ offset: 2 }));
		expect(index()).toMatchObject({ status: 'ready', loaded: 3, total: 3 });
		expect(index().messages.map((m) => m.msg)).toEqual(['plain-a', 'plain-b', 'plain-c']);
	});

	it('uses the direct-message endpoint for DMs and refuses other room types', async () => {
		mockedGet.mockResolvedValueOnce(page([], 0) as never);
		await loadEncryptedRoomHistory({ _id: 'rid', t: 'd' });
		expect(mockedGet).toHaveBeenCalledWith('/v1/im.messages', expect.anything());

		await loadEncryptedRoomHistory({ _id: 'rid', t: 'c' });
		expect(index()).toMatchObject({ status: 'error', error: 'Encrypted_search_unsupported_room' });
	});

	it('keeps a message it cannot decrypt instead of dropping the page', async () => {
		mockedInstance.mockResolvedValue({
			decryptMessage: jest.fn(async () => {
				throw new Error('no key');
			}),
		} as never);
		mockedGet.mockResolvedValueOnce(page(['a'], 1) as never);

		await loadEncryptedRoomHistory(room);

		expect(index()).toMatchObject({ status: 'ready', loaded: 1 });
		expect(index().messages[0]).toMatchObject({ _id: 'a', msg: '' });
	});

	it('can be stopped between pages and reports the failure of a page', async () => {
		let release: () => void = () => undefined;
		mockedGet.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = () => resolve(page(['a'], 5) as never);
				}),
		);

		const pending = loadEncryptedRoomHistory(room);
		await Promise.resolve();
		stopLoadingEncryptedRoomHistory('rid');
		release();
		await pending;
		expect(index().status).toBe('stopped');
		expect(mockedGet).toHaveBeenCalledTimes(1);

		mockedGet.mockRejectedValueOnce(new Error('boom'));
		await loadEncryptedRoomHistory(room);
		expect(index()).toMatchObject({ status: 'error', error: 'boom' });
	});
});
