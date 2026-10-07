import type { IRoom } from '@rocket.chat/core-typings';
import { isE2EEMessage } from '@rocket.chat/core-typings';

import { useEncryptedSearchStore } from './encryptedSearchStore';
import { t } from '../../../../app/utils/lib/i18n';
import { sdk } from '../../SDKClient';
import { mapMessageFromApi } from '../../utils/mapMessageFromApi';
import { e2e } from '../rocketchat.e2e';

export const HISTORY_PAGE_SIZE = 100;

const running = new Map<IRoom['_id'], AbortController>();

const historyEndpoint = (room: Pick<IRoom, 't'>): '/v1/groups.messages' | '/v1/im.messages' | undefined => {
	if (room.t === 'p') {
		return '/v1/groups.messages';
	}
	if (room.t === 'd') {
		return '/v1/im.messages';
	}
	return undefined;
};

/**
 * Downloads a room's history page by page, decrypts it in this browser and feeds the
 * search index. Messages this client cannot decrypt are kept as they are, so a search
 * still finds their author and date. Resolves when the whole history is in or the
 * load was stopped.
 */
export const loadEncryptedRoomHistory = async (room: Pick<IRoom, '_id' | 't'>): Promise<void> => {
	const endpoint = historyEndpoint(room);
	const store = useEncryptedSearchStore.getState();

	if (!endpoint) {
		store.finish(room._id, 'error', t('Encrypted_search_unsupported_room'));
		return;
	}

	running.get(room._id)?.abort();
	const controller = new AbortController();
	running.set(room._id, controller);
	store.begin(room._id);

	const e2eRoom = await e2e.getInstanceByRoomId(room._id);

	try {
		let offset = 0;
		for (;;) {
			const { messages, total } = await sdk.rest.get(endpoint, {
				roomId: room._id,
				count: HISTORY_PAGE_SIZE,
				offset,
				sort: '{ "ts": -1 }',
			});

			if (controller.signal.aborted) {
				return;
			}

			const decrypted = await Promise.all(
				messages.map(async (raw) => {
					const message = mapMessageFromApi(raw);
					if (!e2eRoom || !isE2EEMessage(message)) {
						return message;
					}
					try {
						return await e2eRoom.decryptMessage(message);
					} catch {
						return message;
					}
				}),
			);

			useEncryptedSearchStore.getState().append(room._id, decrypted, total);
			offset += messages.length;

			if (messages.length === 0 || offset >= total) {
				break;
			}
		}

		useEncryptedSearchStore.getState().finish(room._id, 'ready');
	} catch (error) {
		if (!controller.signal.aborted) {
			useEncryptedSearchStore.getState().finish(room._id, 'error', error instanceof Error ? error.message : t('Encrypted_search_failed'));
		}
	} finally {
		if (running.get(room._id) === controller) {
			running.delete(room._id);
		}
	}
};

export const stopLoadingEncryptedRoomHistory = (rid: IRoom['_id']): void => {
	const controller = running.get(rid);
	if (!controller) {
		return;
	}
	controller.abort();
	running.delete(rid);
	useEncryptedSearchStore.getState().finish(rid, 'stopped');
};
