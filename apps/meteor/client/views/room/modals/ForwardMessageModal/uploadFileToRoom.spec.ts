import { uploadFileToRoom } from './uploadFileToRoom';
import { sdk } from '../../../../lib/SDKClient';

jest.mock('../../../../lib/SDKClient', () => ({ sdk: { rest: { upload: jest.fn() } } }));
jest.mock('../../../../../app/utils/lib/i18n', () => ({ t: (key: string) => key }));

const mockedUpload = jest.mocked(sdk.rest.upload);

type FakeXhr = { status: number; responseText: string; onload?: () => void; upload: { onload?: () => void } };

const file = new File(['x'], 'a.txt', { type: 'text/plain' });

const armUpload = (xhr: FakeXhr, events?: { error?: () => void }) => {
	mockedUpload.mockImplementation((_endpoint, _params, handlers) => {
		Object.assign(events ?? {}, handlers);
		return xhr as unknown as XMLHttpRequest;
	});
};

beforeEach(() => {
	jest.clearAllMocks();
});

describe('uploadFileToRoom', () => {
	it('resolves with the stored file once the response has arrived, not when the body finished uploading', async () => {
		const xhr: FakeXhr = { status: 0, responseText: '', upload: {} };
		armUpload(xhr);

		const pending = uploadFileToRoom('rid', file);
		let settled = false;
		pending.then(() => {
			settled = true;
		});

		// Body uploaded, response not yet there: nothing may be parsed.
		xhr.upload.onload?.();
		await Promise.resolve();
		expect(settled).toBe(false);

		xhr.status = 200;
		xhr.responseText = JSON.stringify({ success: true, file: { _id: 'f1', url: '/file-upload/f1/a.txt' } });
		xhr.onload?.();

		await expect(pending).resolves.toEqual({ _id: 'f1', url: '/file-upload/f1/a.txt' });
	});

	it('passes the encrypted metadata along as a JSON string', async () => {
		const xhr: FakeXhr = { status: 200, responseText: JSON.stringify({ file: { _id: 'f1', url: 'u' } }), upload: {} };
		armUpload(xhr);
		const content = { algorithm: 'rc.v2.aes-sha2' as const, ciphertext: 'c', iv: 'i', kid: 'k' };

		const pending = uploadFileToRoom('rid', file, content);
		xhr.onload?.();
		await pending;

		expect(mockedUpload).toHaveBeenCalledWith('/v1/rooms.media/rid', { file, content: JSON.stringify(content) }, expect.anything());
	});

	it('rejects with the server error message on a failed upload', async () => {
		const xhr: FakeXhr = { status: 400, responseText: JSON.stringify({ success: false, error: 'error-file-too-large' }), upload: {} };
		armUpload(xhr);

		const pending = uploadFileToRoom('rid', file);
		xhr.onload?.();

		await expect(pending).rejects.toThrow('error-file-too-large');
	});

	it('rejects when the network request itself fails', async () => {
		const events: { error?: () => void } = {};
		armUpload({ status: 0, responseText: '', upload: {} }, events);

		const pending = uploadFileToRoom('rid', file);
		events.error?.();

		await expect(pending).rejects.toThrow('FileUpload_Error');
	});
});
