import type { FileAttachmentProps, IMessage } from '@rocket.chat/core-typings';
import { isFileAttachment, isRemovedFileAttachment } from '@rocket.chat/core-typings';

/** The file attachments of a message that still point at a file and can therefore be copied elsewhere. */
export const getForwardableFileAttachments = (message: IMessage): (FileAttachmentProps & { title_link: string })[] =>
	(message.attachments ?? []).filter(
		(attachment): attachment is FileAttachmentProps & { title_link: string } =>
			isFileAttachment(attachment) && !isRemovedFileAttachment(attachment) && typeof attachment.title_link === 'string',
	);
