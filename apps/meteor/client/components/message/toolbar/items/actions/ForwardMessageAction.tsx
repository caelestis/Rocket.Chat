import { isE2EEMessage } from '@rocket.chat/core-typings';
import type { IRoom, IMessage } from '@rocket.chat/core-typings';
import { useSetModal } from '@rocket.chat/ui-contexts';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { getPermaLink } from '../../../../../lib/getPermaLink';
import ForwardMessageModal from '../../../../../views/room/modals/ForwardMessageModal';
import { getForwardableFileAttachments } from '../../../../../views/room/modals/ForwardMessageModal/forwardableAttachments';
import MessageToolbarItem from '../../MessageToolbarItem';

export type ForwardMessageActionProps = {
	message: IMessage;
	room: IRoom;
};

/** An E2EE message can be forwarded once this client has decrypted it and there is text or a file to copy. */
const isForwardableEncryptedMessage = (message: IMessage): boolean =>
	isE2EEMessage(message) && message.e2e === 'done' && (message.msg.trim().length > 0 || getForwardableFileAttachments(message).length > 0);

const ForwardMessageAction = ({ message, room }: ForwardMessageActionProps) => {
	const setModal = useSetModal();
	const { t } = useTranslation();

	const encryptedContentUnavailable = isE2EEMessage(message) && !isForwardableEncryptedMessage(message);
	const isABACEnabled = !!room.abacAttributes;

	const getTitle = useMemo(() => {
		if (encryptedContentUnavailable) {
			return t('Action_not_available_encrypted_content', { action: t('Forward_message') });
		}
		if (isABACEnabled) {
			return t('Not_available_for_ABAC_enabled_rooms');
		}
		return t('Forward_message');
	}, [encryptedContentUnavailable, isABACEnabled, t]);

	return (
		<MessageToolbarItem
			id='forward-message'
			icon='arrow-forward'
			title={getTitle}
			disabled={encryptedContentUnavailable || isABACEnabled}
			onClick={async () => {
				const permalink = await getPermaLink(message._id);
				setModal(
					<ForwardMessageModal
						message={message}
						permalink={permalink}
						onClose={() => {
							setModal(null);
						}}
					/>,
				);
			}}
		/>
	);
};

export default ForwardMessageAction;
