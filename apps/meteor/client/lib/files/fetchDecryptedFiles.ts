import { Base64 } from '@rocket.chat/base64';
import type { FileAttachmentProps, IMessage } from '@rocket.chat/core-typings';
import {
	isFileAttachment,
	isFileAudioAttachment,
	isFileImageAttachment,
	isFileVideoAttachment,
	isRemovedFileAttachment,
} from '@rocket.chat/core-typings';

import { t } from '../../../app/utils/lib/i18n';
import { getURL } from '../getURL';

export type DecryptedFile = {
	name: string;
	type: string;
	blob: Blob;
	description?: string;
};

export type LinkedFileAttachment = FileAttachmentProps & { title_link: string };

type Encryption = NonNullable<FileAttachmentProps['encryption']>;

/** The file attachments of a message that still point at a stored file. */
export const getFileAttachments = (message: IMessage): LinkedFileAttachment[] =>
	(message.attachments ?? []).filter(
		(attachment): attachment is LinkedFileAttachment =>
			isFileAttachment(attachment) && !isRemovedFileAttachment(attachment) && typeof attachment.title_link === 'string',
	);

/** The server-side path of a file, with the client-only decrypting prefix and key stripped. */
const toStoragePath = (link: string): string =>
	link.startsWith('/file-decrypt/') ? link.replace('/file-decrypt/', '/').split('?')[0] : link;

const decryptFile = async ({ key, iv }: Encryption, data: ArrayBuffer): Promise<ArrayBuffer> => {
	const cryptoKey = await crypto.subtle.importKey('jwk', key, { name: 'AES-CTR' }, false, ['decrypt']);
	return crypto.subtle.decrypt({ name: 'AES-CTR', counter: Base64.decode(iv), length: 64 }, cryptoKey, data);
};

const mediaType = (attachment: FileAttachmentProps): string | undefined => {
	if (isFileImageAttachment(attachment)) {
		return attachment.image_type;
	}
	if (isFileAudioAttachment(attachment)) {
		return attachment.audio_type;
	}
	if (isFileVideoAttachment(attachment)) {
		return attachment.video_type;
	}
	return undefined;
};

const captionOf = (attachment: FileAttachmentProps): string | undefined =>
	attachment.description ?? (isFileImageAttachment(attachment) ? attachment.image_alt : undefined);

/**
 * Downloads the given file attachments of a decrypted message and, for encrypted uploads,
 * decrypts each in memory with the key carried by its attachment. Nothing is written back.
 */
export const fetchDecryptedFiles = async (
	message: IMessage,
	attachments: LinkedFileAttachment[] = getFileAttachments(message),
): Promise<DecryptedFile[]> =>
	Promise.all(
		attachments.map(async (attachment) => {
			const response = await fetch(getURL(toStoragePath(attachment.title_link)), { credentials: 'include' });

			if (!response.ok) {
				throw new Error(t('FileUpload_Error'));
			}

			const stored = await response.arrayBuffer();
			const data = attachment.encryption ? await decryptFile(attachment.encryption, stored) : stored;
			const type = mediaType(attachment) ?? (attachment.encryption ? '' : (response.headers.get('content-type') ?? ''));

			return {
				name: attachment.title ?? 'file',
				type,
				blob: new Blob([data], { type }),
				description: captionOf(attachment),
			};
		}),
	);
