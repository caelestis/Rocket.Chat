import type { RoomToolboxActionConfig } from '@rocket.chat/ui-contexts';
import { useSetModal } from '@rocket.chat/ui-contexts';
import { useMemo } from 'react';

import { useRoom } from '../../views/room/contexts/RoomContext';
import JumpToDateModal from '../../views/room/modals/JumpToDateModal';

export const useJumpToDateRoomAction = () => {
	const room = useRoom();
	const setModal = useSetModal();

	return useMemo(
		(): RoomToolboxActionConfig => ({
			id: 'jump-to-date',
			groups: ['channel', 'group', 'direct', 'direct_multiple', 'live', 'team'],
			title: 'Jump_to_date',
			icon: 'calendar',
			order: 6,
			action: () => {
				setModal(<JumpToDateModal rid={room._id} onClose={() => setModal(null)} />);
			},
		}),
		[room._id, setModal],
	);
};
