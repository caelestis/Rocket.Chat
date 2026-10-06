import type { IMessage } from '@rocket.chat/core-typings';
import { Box, Icon, IconButton, Skeleton } from '@rocket.chat/fuselage';
import { useTranslation } from 'react-i18next';

import { useTranscriptionsStore } from '../../../lib/transcription/transcriptionsStore';

type MessageTranscriptionProps = {
	mid: IMessage['_id'];
};

/** The transcription this browser asked for, shown under the voice message to the requester only. */
const MessageTranscription = ({ mid }: MessageTranscriptionProps) => {
	const { t } = useTranslation();
	const transcription = useTranscriptionsStore((state) => state.byMessage[mid]);
	const clear = useTranscriptionsStore((state) => state.clear);

	if (!transcription) {
		return null;
	}

	return (
		<Box
			is='section'
			aria-label={t('Transcription')}
			marginBlockStart={8}
			paddingInline={12}
			paddingBlock={8}
			borderRadius='small'
			borderWidth='default'
			borderColor='extra-light'
			backgroundColor='surface-tint'
			maxWidth='x600'
		>
			<Box display='flex' alignItems='center' justifyContent='space-between' marginBlockEnd={4}>
				<Box display='flex' alignItems='center' fontScale='c2' color='hint'>
					<Icon name='mic' size='x16' marginInlineEnd={4} />
					{t('Transcription')} · {t('Transcription_only_visible_to_you')}
				</Box>
				<IconButton icon='cross' tiny title={t('Hide_transcription')} onClick={() => clear(mid)} />
			</Box>
			{transcription.status === 'pending' && <Skeleton width='80%' />}
			{transcription.status === 'error' && (
				<Box fontScale='p2' color='danger'>
					{transcription.error}
				</Box>
			)}
			{transcription.status === 'done' && (
				<Box fontScale='p2' color='default' style={{ whiteSpace: 'pre-wrap' }}>
					{transcription.text}
				</Box>
			)}
		</Box>
	);
};

export default MessageTranscription;
