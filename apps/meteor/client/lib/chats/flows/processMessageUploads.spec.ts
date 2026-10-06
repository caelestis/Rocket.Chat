import type { IMessage } from '@rocket.chat/core-typings';

import { processMessageUploads } from './processMessageUploads';
import { sdk } from '../../SDKClient';
import { e2e } from '../../e2ee/rocketchat.e2e';
import type { ChatAPI, UploadsAPI } from '../ChatAPI';
import type { Upload } from '../Upload';

jest.mock('../../SDKClient', () => ({ sdk: { rest: { post: jest.fn() } } }));
jest.mock('../../e2ee/rocketchat.e2e', () => ({ e2e: { getInstanceByRoomId: jest.fn() } }));
jest.mock('../../toast', () => ({ dispatchToastMessage: jest.fn() }));
jest.mock('../../../../app/utils/lib/i18n', () => ({ t: (key: string) => key }));
jest.mock('@rocket.chat/ui-client', () => ({
	imperativeModal: { open: jest.fn(), close: jest.fn() },
	GenericModal: () => null,
}));

const mockedPost = jest.mocked(sdk.rest.post);
const mockedGetInstanceByRoomId = jest.mocked(e2e.getInstanceByRoomId);

const message = { _id: 'mid', rid: 'rid', msg: 'hello', tmid: undefined } as IMessage;

const createUpload = (id: string, name: string, altText?: string): Upload => ({
	id,
	file: new File(['content'], name, { type: 'text/plain' }),
	url: `https://example.com/${id}`,
	percentage: 100,
	altText,
});

const createEncryptedUpload = (id: string, name: string): Upload => ({
	...createUpload(id, name),
	encryptedFile: {
		file: new File(['x'], 'encrypted-blob'),
		key: { k: `key-${id}` },
		iv: `iv-${id}`,
		type: 'application/octet-stream',
		hash: `hash-${id}`,
	},
	metadataForEncryption: { name, type: 'text/plain' },
});

const createStore = (uploads: Upload[]) => {
	const store = {
		get: jest.fn(() => uploads),
		removeUpload: jest.fn(),
		setProcessingUploads: jest.fn(),
	};

	return store as unknown as UploadsAPI & typeof store;
};

const createChat = (store: UploadsAPI) => ({ composer: { uploads: store } }) as unknown as ChatAPI;

const createE2ERoom = () => ({
	shouldConvertSentMessages: jest.fn(async () => true),
	encryptMessageContent: jest.fn(async (data: unknown) => ({
		algorithm: 'rc.v2.aes-sha2' as const,
		ciphertext: JSON.stringify(data),
		iv: 'iv',
		kid: 'kid',
	})),
});

beforeEach(() => {
	jest.clearAllMocks();
	mockedGetInstanceByRoomId.mockResolvedValue(null);
	mockedPost.mockResolvedValue({} as never);
});

describe('processMessageUploads', () => {
	it('returns false when there is nothing to upload', async () => {
		const store = createStore([]);

		await expect(processMessageUploads(createChat(store), message)).resolves.toBe(false);
		expect(mockedPost).not.toHaveBeenCalled();
	});

	it('confirms a single file through the per-file endpoint', async () => {
		const store = createStore([createUpload('f1', 'a.txt', 'alt a')]);

		await processMessageUploads(createChat(store), message);

		expect(mockedPost).toHaveBeenCalledTimes(1);
		expect(mockedPost).toHaveBeenCalledWith('/v1/rooms.mediaConfirm/rid/f1', {
			tmid: undefined,
			msg: 'hello',
			fileName: 'a.txt',
			description: 'alt a',
		});
		expect(store.removeUpload).toHaveBeenCalledWith('f1');
	});

	it('sends several files as one message with the text once and a description per file', async () => {
		const store = createStore([createUpload('f1', 'a.txt', 'alt a'), createUpload('f2', 'b.txt')]);

		await processMessageUploads(createChat(store), message);

		expect(mockedPost).toHaveBeenCalledTimes(1);
		expect(mockedPost).toHaveBeenCalledWith('/v1/rooms.mediaConfirmMultiple', {
			rid: 'rid',
			tmid: undefined,
			msg: 'hello',
			files: [
				{ fileId: 'f1', fileName: 'a.txt', description: 'alt a' },
				{ fileId: 'f2', fileName: 'b.txt', description: undefined },
			],
		});
		expect(store.removeUpload).toHaveBeenCalledWith('f1');
		expect(store.removeUpload).toHaveBeenCalledWith('f2');
		expect(store.setProcessingUploads).toHaveBeenLastCalledWith(false);
	});

	it('leaves a file that has not finished uploading out of the group', async () => {
		const pending: Upload = { ...createUpload('f3', 'c.txt'), url: undefined };
		const store = createStore([createUpload('f1', 'a.txt'), createUpload('f2', 'b.txt'), pending]);

		await processMessageUploads(createChat(store), message);

		expect(mockedPost).toHaveBeenCalledTimes(1);
		const [, body] = mockedPost.mock.calls[0];
		expect((body as unknown as { files: { fileId: string }[] }).files.map((file) => file.fileId)).toEqual(['f1', 'f2']);
	});

	it('encrypts the whole group once for an encrypted room', async () => {
		const e2eRoom = createE2ERoom();
		mockedGetInstanceByRoomId.mockResolvedValue(e2eRoom as never);
		const store = createStore([createEncryptedUpload('f1', 'a.txt'), createEncryptedUpload('f2', 'b.txt')]);

		await processMessageUploads(createChat(store), message);

		expect(mockedPost).toHaveBeenCalledTimes(1);
		const [endpoint, body] = mockedPost.mock.calls[0];
		expect(endpoint).toBe('/v1/rooms.mediaConfirmMultiple');

		const { t, msg, content, files } = body as unknown as {
			t: string;
			msg: string;
			content: { ciphertext: string };
			files: { fileId: string; fileContent: { ciphertext: string } }[];
		};
		expect(t).toBe('e2e');
		expect(msg).toBe('');

		// The plaintext text and both real file names travel only inside the encrypted content.
		const decoded = JSON.parse(content.ciphertext);
		expect(decoded.msg).toBe('hello');
		expect(decoded.attachments.map((attachment: { title: string }) => attachment.title)).toEqual(['a.txt', 'b.txt']);
		expect(decoded.files.map((file: { _id: string }) => file._id)).toEqual(['f1', 'f2']);

		expect(files.map((file) => file.fileId)).toEqual(['f1', 'f2']);
		expect(JSON.parse(files[0].fileContent.ciphertext)).toMatchObject({ name: 'a.txt' });
		expect(files.every((file) => !('fileName' in file))).toBe(true);
	});

	it('falls back to one message per file when only some uploads are encrypted', async () => {
		const e2eRoom = createE2ERoom();
		mockedGetInstanceByRoomId.mockResolvedValue(e2eRoom as never);
		const store = createStore([createEncryptedUpload('f1', 'a.txt'), createUpload('f2', 'b.txt')]);

		await processMessageUploads(createChat(store), message);

		expect(mockedPost).toHaveBeenCalledTimes(2);
		expect(mockedPost.mock.calls.map(([endpoint]) => endpoint)).toEqual(['/v1/rooms.mediaConfirm/rid/f1', '/v1/rooms.mediaConfirm/rid/f2']);
	});
});
