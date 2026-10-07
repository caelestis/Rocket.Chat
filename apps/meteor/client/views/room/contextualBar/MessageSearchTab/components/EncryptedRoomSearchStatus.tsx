import type { IRoom } from '@rocket.chat/core-typings';
import { Box, Button, ButtonGroup, Callout, ProgressBar } from '@rocket.chat/fuselage';
import { useTranslation } from 'react-i18next';

import { ENCRYPTED_SEARCH_TTL_MS, emptyIndex, useEncryptedSearchStore } from '../../../../../lib/e2ee/search/encryptedSearchStore';
import { loadEncryptedRoomHistory, stopLoadingEncryptedRoomHistory } from '../../../../../lib/e2ee/search/loadEncryptedRoomHistory';

type EncryptedRoomSearchStatusProps = {
	room: IRoom;
};

/** Lets the viewer pull and decrypt the room's history into this browser so it can be searched. */
const EncryptedRoomSearchStatus = ({ room }: EncryptedRoomSearchStatusProps) => {
	const { t } = useTranslation();
	const index = useEncryptedSearchStore((state) => state.byRoom[room._id] ?? emptyIndex);
	const reset = useEncryptedSearchStore((state) => state.reset);

	const start = () => void loadEncryptedRoomHistory(room);
	const percentage = index.total ? Math.min(100, Math.round((index.loaded / index.total) * 100)) : 0;

	return (
		<Callout type={index.status === 'error' ? 'danger' : 'info'} marginBlockStart={12} icon='key'>
			{index.status === 'idle' && (
				<>
					<Box marginBlockEnd={8}>{t('Encrypted_search_hint', { minutes: Math.round(ENCRYPTED_SEARCH_TTL_MS / 60000) })}</Box>
					<Button small primary onClick={start}>
						{t('Encrypted_search_load_history')}
					</Button>
				</>
			)}
			{index.status === 'loading' && (
				<>
					<Box marginBlockEnd={4}>{t('Encrypted_search_loading', { loaded: index.loaded, total: index.total ?? '…' })}</Box>
					<Box marginBlockEnd={8}>
						<ProgressBar percentage={percentage} />
					</Box>
					<Button small onClick={() => stopLoadingEncryptedRoomHistory(room._id)}>
						{t('Encrypted_search_stop')}
					</Button>
				</>
			)}
			{(index.status === 'ready' || index.status === 'stopped') && (
				<>
					<Box marginBlockEnd={8}>
						{t(index.status === 'ready' ? 'Encrypted_search_ready' : 'Encrypted_search_partial', { count: index.messages.length })}{' '}
						{t('Encrypted_search_expires', { minutes: Math.round(ENCRYPTED_SEARCH_TTL_MS / 60000) })}
					</Box>
					<ButtonGroup>
						<Button small onClick={start}>
							{t('Encrypted_search_reload')}
						</Button>
						<Button small onClick={() => reset(room._id)}>
							{t('Encrypted_search_forget')}
						</Button>
					</ButtonGroup>
				</>
			)}
			{index.status === 'error' && (
				<>
					<Box marginBlockEnd={8}>{index.error ?? t('Encrypted_search_failed')}</Box>
					<Button small onClick={start}>
						{t('Retry')}
					</Button>
				</>
			)}
		</Callout>
	);
};

export default EncryptedRoomSearchStatus;
