import fs from 'fs';

import { Meteor } from 'meteor/meteor';

import { convertToWav, isProviderExtension } from '../../lib/transcription/convertAudio';
import { sniffAudioExtension, transcribeAudio } from '../../lib/transcription/transcribeAudio';
import { settings } from '../../settings';
import { API } from '../api';
import { MultipartUploadHandler } from '../lib/MultipartUploadHandler';

API.v1.addRoute(
	'transcription.transcribe',
	{ authRequired: true, permissionsRequired: ['transcribe-voice-messages'] },
	{
		async post() {
			if (!settings.get<boolean>('Transcription_Enabled')) {
				throw new Meteor.Error('error-transcription-disabled', 'Transcription is disabled');
			}

			const { file } = await MultipartUploadHandler.parseRequest(this.incoming, {
				field: 'file',
				maxSize: settings.get<number>('FileUpload_MaxFileSize'),
			});

			if (!file) {
				throw new Meteor.Error('error-no-file-uploaded', 'No file was uploaded');
			}

			let convertedPath: string | undefined;

			try {
				let data = await fs.promises.readFile(file.tempFilePath);
				let { mimetype } = file;

				// Mobile voice messages arrive as raw AAC, which no provider decodes; anything the
				// provider does not list is rewritten as wav first.
				if (!isProviderExtension(sniffAudioExtension(data))) {
					convertedPath = await convertToWav(file.tempFilePath);
					data = await fs.promises.readFile(convertedPath);
					mimetype = 'audio/wav';
				}

				const text = await transcribeAudio({ data, filename: file.filename, mimetype });

				return API.v1.success({ text });
			} finally {
				await MultipartUploadHandler.cleanup(file.tempFilePath);
				if (convertedPath) {
					await MultipartUploadHandler.cleanup(convertedPath);
				}
			}
		},
	},
);
