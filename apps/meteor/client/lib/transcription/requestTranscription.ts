import { t } from '../../../app/utils/lib/i18n';
import { sdk } from '../SDKClient';

/** Sends one audio file to the workspace's transcription endpoint and resolves with the text it heard. */
export const requestTranscription = (file: File): Promise<string> =>
	new Promise((resolve, reject) => {
		const fail = (reason?: unknown) => reject(reason instanceof Error ? reason : new Error(t('Transcription_failed')));

		const xhr = sdk.rest.upload(
			'/v1/transcription.transcribe',
			{ file },
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
				if (xhr.status === 200 && typeof body.text === 'string') {
					resolve(body.text);
					return;
				}
				fail(new Error(body.error ?? t('Transcription_failed')));
			} catch (error) {
				fail(error);
			}
		};
	});
