import type { IMessage, MessageAttachmentDefault } from '@rocket.chat/core-typings';
import { Random } from '@rocket.chat/random';

import { forwardFilesToRoom, type ForwardableFile } from './forwardDecryptedFiles';
import { sdk } from '../../../../lib/SDKClient';
import { onClientBeforeSendMessage } from '../../../../lib/onClientBeforeSendMessage';

type ForwardDecryptedMessageParams = {
	/**
	 * Must not carry `message_link`: the server drops every quote-shaped attachment on
	 * save and rebuilds quotes from permalinks in `msg`, which would resolve to the
	 * still-encrypted original.
	 */
	quote: MessageAttachmentDefault;
	roomIds: IMessage['rid'][];
	/** Decrypted copies of the original's files; when present each room gets them re-uploaded under the author card. */
	files?: ForwardableFile[];
};

/**
 * Sends a copy of an already decrypted E2EE message to each target room as an
 * attachment with the original author and text.
 *
 * The copy runs through the same client send hooks as the composer, so a target
 * room that is encrypted receives it encrypted with that room's key. The server
 * only ever sees the plaintext for target rooms that are not encrypted.
 */
export const forwardDecryptedMessage = async ({ quote, roomIds, files = [] }: ForwardDecryptedMessageParams): Promise<void> => {
	if (files.length) {
		for (const rid of roomIds) {
			await forwardFilesToRoom({ rid, files, authorCard: quote });
		}
		return;
	}

	await Promise.all(
		roomIds.map(async (rid) => {
			const { e2e: _clientOnly, ...message } = await onClientBeforeSendMessage({
				_id: Random.id(),
				rid,
				msg: '',
				attachments: [quote],
			});

			await sdk.rest.post('/v1/chat.sendMessage', { message });
		}),
	);
};
