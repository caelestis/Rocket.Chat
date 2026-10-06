import type { IMessage, MessageQuoteAttachment } from '@rocket.chat/core-typings';
import { Random } from '@rocket.chat/random';

import { sdk } from '../../../../lib/SDKClient';
import { onClientBeforeSendMessage } from '../../../../lib/onClientBeforeSendMessage';

type ForwardDecryptedMessageParams = {
	quote: MessageQuoteAttachment;
	roomIds: IMessage['rid'][];
};

/**
 * Sends a quote of an already decrypted E2EE message to each target room.
 *
 * The copy runs through the same client send hooks as the composer, so a target
 * room that is encrypted receives it encrypted with that room's key. The server
 * only ever sees the plaintext for target rooms that are not encrypted.
 */
export const forwardDecryptedMessage = async ({ quote, roomIds }: ForwardDecryptedMessageParams): Promise<void> => {
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
