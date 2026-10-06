import type { IE2EEMessage } from '@rocket.chat/core-typings';

import { t } from '../../../../../app/utils/lib/i18n';
import { sdk } from '../../../../lib/SDKClient';

type UploadedFile = { _id: string; url: string };

/** Uploads one file into a room's media store and resolves with the id the server assigned to it. */
export const uploadFileToRoom = (rid: string, file: File, content?: IE2EEMessage['content']): Promise<UploadedFile> =>
	new Promise((resolve, reject) => {
		const fail = (reason?: unknown) => reject(reason instanceof Error ? reason : new Error(t('FileUpload_Error')));

		const xhr = sdk.rest.upload(
			`/v1/rooms.media/${rid}`,
			{ file, ...(content && { content: JSON.stringify(content) }) },
			{
				error: () => fail(),
				abort: () => fail(),
			},
		);

		// The `load` event the client exposes belongs to the request body; the response
		// is only readable once the request itself has loaded.
		xhr.onload = () => {
			try {
				const body = JSON.parse(xhr.responseText);
				if (xhr.status === 200 && body.file?._id) {
					resolve({ _id: body.file._id, url: body.file.url });
					return;
				}
				fail(new Error(body.error ?? t('FileUpload_Error')));
			} catch (error) {
				fail(error);
			}
		};
	});
