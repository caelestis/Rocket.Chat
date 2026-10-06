import type { IMessage } from '@rocket.chat/core-typings';
import { isFileAudioAttachment } from '@rocket.chat/core-typings';

import { requestTranscription } from './requestTranscription';
import { useTranscriptionsStore } from './transcriptionsStore';
import { t } from '../../../app/utils/lib/i18n';
import { fetchDecryptedFiles, getFileAttachments, type LinkedFileAttachment } from '../files/fetchDecryptedFiles';

export const getVoiceAttachments = (message: IMessage): LinkedFileAttachment[] =>
	getFileAttachments(message).filter((attachment) => isFileAudioAttachment(attachment));

/**
 * Transcribes the audio of a message for the person asking and keeps the text in this
 * browser only. The audio is decrypted here and only ever leaves the browser towards the
 * workspace's own transcription endpoint; nothing is posted and nobody else is told.
 */
export const transcribeVoiceMessage = async (message: IMessage): Promise<string> => {
	const { set } = useTranscriptionsStore.getState();
	const voices = getVoiceAttachments(message);

	if (!voices.length) {
		throw new Error(t('Transcription_failed'));
	}

	set(message._id, { status: 'pending' });

	try {
		const files = await fetchDecryptedFiles(message, voices);
		const texts = await Promise.all(files.map(({ name, type, blob }) => requestTranscription(new File([blob], name, { type }))));
		const transcript = texts
			.map((text) => text.trim())
			.filter(Boolean)
			.join('\n\n');

		if (!transcript) {
			throw new Error(t('Transcription_empty'));
		}

		set(message._id, { status: 'done', text: transcript });
		return transcript;
	} catch (error) {
		set(message._id, { status: 'error', error: error instanceof Error ? error.message : t('Transcription_failed') });
		throw error;
	}
};
