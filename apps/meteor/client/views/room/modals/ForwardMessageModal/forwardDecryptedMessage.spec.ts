import type { IMessage, MessageAttachmentDefault } from '@rocket.chat/core-typings';

import { forwardFilesToRoom } from './forwardDecryptedFiles';
import { forwardDecryptedMessage } from './forwardDecryptedMessage';
import { sdk } from '../../../../lib/SDKClient';
import { onClientBeforeSendMessage } from '../../../../lib/onClientBeforeSendMessage';

jest.mock('../../../../lib/SDKClient', () => ({ sdk: { rest: { post: jest.fn() } } }));
jest.mock('../../../../lib/onClientBeforeSendMessage', () => ({ onClientBeforeSendMessage: jest.fn() }));
jest.mock('./forwardDecryptedFiles', () => ({ forwardFilesToRoom: jest.fn() }));

const mockedPost = jest.mocked(sdk.rest.post);
const mockedOnClientBeforeSendMessage = jest.mocked(onClientBeforeSendMessage);
const mockedForwardFilesToRoom = jest.mocked(forwardFilesToRoom);

const quote: MessageAttachmentDefault = {
	author_name: 'Alice',
	author_icon: 'https://example.com/avatar/alice',
	author_link: 'https://example.com/group/secret?msg=original',
	text: 'decrypted text',
	mrkdwn_in: ['text'],
};

const sentMessages = () => mockedPost.mock.calls.map(([, body]) => (body as unknown as { message: Partial<IMessage> }).message);

describe('forwardDecryptedMessage', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockedOnClientBeforeSendMessage.mockImplementation(async (message) => message);
	});

	it('sends one quote message per target room through the client send hooks', async () => {
		await forwardDecryptedMessage({ quote, roomIds: ['room-a', 'room-b'] });

		expect(mockedOnClientBeforeSendMessage).toHaveBeenCalledTimes(2);
		expect(mockedOnClientBeforeSendMessage).toHaveBeenCalledWith(
			expect.objectContaining({ rid: 'room-a', msg: '', attachments: [quote], _id: expect.any(String) }),
		);
		expect(mockedOnClientBeforeSendMessage).toHaveBeenCalledWith(
			expect.objectContaining({ rid: 'room-b', msg: '', attachments: [quote], _id: expect.any(String) }),
		);

		expect(mockedPost).toHaveBeenCalledTimes(2);
		expect(mockedPost).toHaveBeenCalledWith('/v1/chat.sendMessage', {
			message: expect.objectContaining({ rid: 'room-a', attachments: [quote] }),
		});
		expect(mockedPost).toHaveBeenCalledWith('/v1/chat.sendMessage', {
			message: expect.objectContaining({ rid: 'room-b', attachments: [quote] }),
		});
	});

	it('gives every copy its own message id', async () => {
		await forwardDecryptedMessage({ quote, roomIds: ['room-a', 'room-b'] });

		const ids = sentMessages().map((message) => message._id);
		expect(new Set(ids).size).toBe(2);
	});

	// The e2e flag is client bookkeeping; the composer strips it too before the request.
	it('sends the encrypted payload produced by the hooks without the client-only e2e flag', async () => {
		mockedOnClientBeforeSendMessage.mockImplementation(async ({ _id, rid }) => ({
			_id,
			rid,
			msg: '',
			t: 'e2e',
			e2e: 'pending',
			content: { algorithm: 'rc.v2.aes-sha2', ciphertext: 'xxx', iv: 'iv', kid: 'kid' },
		}));

		await forwardDecryptedMessage({ quote, roomIds: ['room-a'] });

		const [message] = sentMessages();
		expect(message).toMatchObject({ rid: 'room-a', t: 'e2e' });
		expect(message).not.toHaveProperty('e2e');
		expect(message).not.toHaveProperty('attachments');
	});

	it('hands a message with files to the per-room file forwarder instead of posting text', async () => {
		const files = [{ name: 'voice.mp3', type: 'audio/mpeg', blob: new Blob(['x']) }];

		await forwardDecryptedMessage({ quote, roomIds: ['room-a', 'room-b'], files });

		expect(mockedPost).not.toHaveBeenCalled();
		expect(mockedForwardFilesToRoom).toHaveBeenCalledTimes(2);
		expect(mockedForwardFilesToRoom).toHaveBeenCalledWith({ rid: 'room-a', files, authorCard: quote });
		expect(mockedForwardFilesToRoom).toHaveBeenCalledWith({ rid: 'room-b', files, authorCard: quote });
	});

	it('rejects when any target room fails', async () => {
		mockedPost.mockRejectedValueOnce(new Error('error-not-allowed'));

		await expect(forwardDecryptedMessage({ quote, roomIds: ['room-a', 'room-b'] })).rejects.toThrow('error-not-allowed');
	});
});
