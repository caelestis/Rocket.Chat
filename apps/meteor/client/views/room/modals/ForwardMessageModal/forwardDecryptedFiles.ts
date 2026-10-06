import type { FileProp, IMessage, MessageAttachment, MessageAttachmentDefault } from '@rocket.chat/core-typings';

import { uploadFileToRoom } from './uploadFileToRoom';
import { t } from '../../../../../app/utils/lib/i18n';
import { getFileExtension } from '../../../../../lib/utils/getFileExtension';
import { sdk } from '../../../../lib/SDKClient';
import type { EncryptedUpload } from '../../../../lib/chats/Upload';
import { getAttachmentForFile } from '../../../../lib/chats/flows/processMessageUploads';
import { e2e } from '../../../../lib/e2ee';
import type { DecryptedFile } from '../../../../lib/files/fetchDecryptedFiles';
import { settings } from '../../../../lib/settings';

type ForwardFilesToRoomParams = {
	rid: IMessage['rid'];
	files: DecryptedFile[];
	authorCard: MessageAttachmentDefault;
};

const toFileProp = (upload: EncryptedUpload): FileProp => ({
	_id: upload.id,
	name: upload.file.name,
	type: upload.file.type,
	size: upload.file.size,
	format: getFileExtension(upload.file.name),
});

/**
 * Uploads fresh copies of the files into one room and posts them as a single message
 * headed by the author card. An encrypted room gets each file encrypted with a new key
 * and the whole message encrypted with that room's key, exactly as the composer does.
 */
export const forwardFilesToRoom = async ({ rid, files, authorCard }: ForwardFilesToRoomParams): Promise<void> => {
	const e2eRoom = await e2e.getInstanceByRoomId(rid);
	const encrypt = !!e2eRoom && !!settings.peek('E2E_Enable_Encrypt_Files');

	if (e2eRoom && !encrypt && !settings.peek('E2E_Allow_Unencrypted_Messages')) {
		throw new Error(t('You_cant_send_unencrypted_files_in_an_encrypted_room'));
	}

	if (!encrypt) {
		const uploaded = [];
		for (const { name, type, blob, description } of files) {
			const { _id } = await uploadFileToRoom(rid, new File([blob], name, { type }));
			uploaded.push({ fileId: _id, fileName: name, description });
		}

		await sdk.rest.post('/v1/rooms.mediaConfirmMultiple', { rid, msg: '', attachments: [authorCard], files: uploaded });
		return;
	}

	if (!e2eRoom.isReady()) {
		throw new Error(t('Error_encrypting_file'));
	}

	const uploads: (EncryptedUpload & { fileContent: NonNullable<Awaited<ReturnType<typeof e2eRoom.encryptMessageContent>>> })[] = [];
	for (const { name, type, blob, description } of files) {
		const file = new File([blob], name, { type });
		const encryptedFile = await e2eRoom.encryptFile(file);

		if (!encryptedFile) {
			throw new Error(t('Error_encrypting_file'));
		}

		const metadataForEncryption = {
			type: file.type,
			typeGroup: file.type.split('/')[0],
			name: file.name,
			encryption: { key: encryptedFile.key, iv: encryptedFile.iv },
			hashes: { sha256: encryptedFile.hash },
		};
		const fileContent = await e2eRoom.encryptMessageContent(metadataForEncryption);
		const { _id, url } = await uploadFileToRoom(rid, encryptedFile.file, fileContent);

		uploads.push({ id: _id, url, file, percentage: 100, altText: description, encryptedFile, metadataForEncryption, fileContent });
	}

	const attachments: MessageAttachment[] = [authorCard, ...(await Promise.all(uploads.map((upload) => getAttachmentForFile(upload))))];
	const fileProps = uploads.map(toFileProp);
	const content = await e2eRoom.encryptMessageContent({ msg: '', attachments, files: fileProps, file: fileProps[0] });

	await sdk.rest.post('/v1/rooms.mediaConfirmMultiple', {
		rid,
		t: 'e2e',
		msg: '',
		content,
		files: uploads.map(({ id, fileContent }) => ({ fileId: id, fileContent })),
	});
};
