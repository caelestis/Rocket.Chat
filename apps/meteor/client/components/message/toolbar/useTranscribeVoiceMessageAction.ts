import type { IMessage, ISubscription } from '@rocket.chat/core-typings';
import { usePermission, useSetting, useToastMessageDispatch } from '@rocket.chat/ui-contexts';
import { useMemo } from 'react';

import type { MessageActionConfig } from '../../../lib/MessageAction';
import { getVoiceAttachments, transcribeVoiceMessage } from '../../../lib/transcription/transcribeVoiceMessage';
import { useTranscriptionsStore } from '../../../lib/transcription/transcriptionsStore';

export const useTranscribeVoiceMessageAction = (
	message: IMessage,
	{ subscription }: { subscription: ISubscription | undefined },
): MessageActionConfig | null => {
	const enabled = useSetting('Transcription_Enabled', false);
	const allowed = usePermission('transcribe-voice-messages');
	const dispatchToastMessage = useToastMessageDispatch();

	const hasVoice = useMemo(() => getVoiceAttachments(message).length > 0, [message]);
	const alreadyShown = useTranscriptionsStore((state) => state.byMessage[message._id]?.status === 'done');

	if (!enabled || !allowed || !subscription || !hasVoice || alreadyShown) {
		return null;
	}

	return {
		id: 'transcribe-voice-message',
		icon: 'mic',
		label: 'Transcribe_voice_message',
		context: ['message', 'message-mobile', 'threads'],
		type: 'interaction',
		order: 6,
		group: 'menu',
		async action() {
			try {
				await transcribeVoiceMessage(message);
			} catch (error) {
				dispatchToastMessage({ type: 'error', message: error });
			}
		},
	};
};
