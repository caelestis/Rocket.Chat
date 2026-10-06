import type { MessageAttachmentDefault } from '@rocket.chat/core-typings';

import { forwardFilesToRoom } from './forwardDecryptedFiles';
import { uploadFileToRoom } from './uploadFileToRoom';
import { sdk } from '../../../../lib/SDKClient';
import { e2e } from '../../../../lib/e2ee';
import { settings } from '../../../../lib/settings';

jest.mock('../../../../lib/SDKClient', () => ({ sdk: { rest: { post: jest.fn() } } }));
jest.mock('../../../../lib/e2ee', () => ({ e2e: { getInstanceByRoomId: jest.fn() } }));
jest.mock('../../../../lib/settings', () => ({ settings: { peek: jest.fn() } }));
jest.mock('../../../../lib/getURL', () => ({ getURL: (path: string) => path }));
jest.mock('../../../../../app/utils/lib/i18n', () => ({ t: (key: string) => key }));
jest.mock('./uploadFileToRoom', () => ({ uploadFileToRoom: jest.fn() }));

const mockedPost = jest.mocked(sdk.rest.post);
const mockedGetInstanceByRoomId = jest.mocked(e2e.getInstanceByRoomId);
const mockedPeek = jest.mocked(settings.peek);
const mockedUpload = jest.mocked(uploadFileToRoom);

const authorCard: MessageAttachmentDefault = { author_name: 'Alice', text: 'caption' };

const plainFile = { name: 'notes.txt', type: 'text/plain', blob: new Blob(['hello'], { type: 'text/plain' }), description: 'desc' };

const createE2ERoom = () => ({
	isReady: jest.fn(() => true),
	encryptFile: jest.fn(async (file: File) => ({
		file: new File(['encrypted'], 'hashed-name'),
		key: { kty: 'oct', k: `key-for-${file.name}` },
		iv: 'iv-base64',
		type: file.type,
		hash: 'sha256-of-file',
	})),
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
	mockedPeek.mockReturnValue(false);
	mockedPost.mockResolvedValue({} as never);
	let counter = 0;
	mockedUpload.mockImplementation(async () => {
		counter += 1;
		return { _id: `upload-${counter}`, url: `/file-upload/upload-${counter}/x` };
	});
});

describe('forwardFilesToRoom', () => {
	it('uploads plain copies and posts one message with the author card for an unencrypted room', async () => {
		await forwardFilesToRoom({ rid: 'room-a', files: [plainFile], authorCard });

		expect(mockedUpload).toHaveBeenCalledTimes(1);
		const [rid, file, content] = mockedUpload.mock.calls[0];
		expect(rid).toBe('room-a');
		expect(file.name).toBe('notes.txt');
		expect(content).toBeUndefined();

		expect(mockedPost).toHaveBeenCalledWith('/v1/rooms.mediaConfirmMultiple', {
			rid: 'room-a',
			msg: '',
			attachments: [authorCard],
			files: [{ fileId: 'upload-1', fileName: 'notes.txt', description: 'desc' }],
		});
	});

	it('refuses to drop plain files into an encrypted room that forbids unencrypted messages', async () => {
		mockedGetInstanceByRoomId.mockResolvedValue(createE2ERoom() as never);
		mockedPeek.mockReturnValue(false);

		await expect(forwardFilesToRoom({ rid: 'room-a', files: [plainFile], authorCard })).rejects.toThrow(
			'You_cant_send_unencrypted_files_in_an_encrypted_room',
		);
		expect(mockedUpload).not.toHaveBeenCalled();
	});

	it('encrypts each file with a new key and the whole message with the room key for an encrypted room', async () => {
		const e2eRoom = createE2ERoom();
		mockedGetInstanceByRoomId.mockResolvedValue(e2eRoom as never);
		mockedPeek.mockImplementation((key: string) => (key === 'E2E_Enable_Encrypt_Files') as never);

		await forwardFilesToRoom({ rid: 'room-e', files: [plainFile], authorCard });

		expect(e2eRoom.encryptFile).toHaveBeenCalledTimes(1);

		// The upload carries the encrypted blob plus encrypted metadata, never the real name.
		const [, uploadedFile, uploadedContent] = mockedUpload.mock.calls[0];
		expect(uploadedFile.name).toBe('hashed-name');
		expect(JSON.parse(uploadedContent!.ciphertext)).toMatchObject({ name: 'notes.txt', type: 'text/plain' });

		const [endpoint, body] = mockedPost.mock.calls[0];
		expect(endpoint).toBe('/v1/rooms.mediaConfirmMultiple');
		const { t, msg, content, files, attachments } = body as unknown as {
			t: string;
			msg: string;
			content: { ciphertext: string };
			files: { fileId: string; fileContent: unknown }[];
			attachments?: unknown;
		};
		expect(t).toBe('e2e');
		expect(msg).toBe('');
		expect(attachments).toBeUndefined();
		expect(files).toEqual([{ fileId: 'upload-1', fileContent: expect.objectContaining({ algorithm: 'rc.v2.aes-sha2' }) }]);

		const decoded = JSON.parse(content.ciphertext);
		expect(decoded.attachments[0]).toEqual(authorCard);
		expect(decoded.attachments[1]).toMatchObject({ type: 'file', title: 'notes.txt', fileId: 'upload-1', encryption: { iv: 'iv-base64' } });
		expect(decoded.files).toEqual([expect.objectContaining({ _id: 'upload-1', name: 'notes.txt', type: 'text/plain' })]);
	});
});
