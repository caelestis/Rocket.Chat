import type { IRoom } from '@rocket.chat/core-typings';
import {
	Button,
	ButtonGroup,
	Field,
	FieldHint,
	FieldLabel,
	FieldRow,
	InputBox,
	Modal,
	ModalClose,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalTitle,
} from '@rocket.chat/fuselage';
import { useToastMessageDispatch } from '@rocket.chat/ui-contexts';
import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { jumpToDate } from '../../../../lib/jumpToDate';

type JumpToDateModalProps = {
	rid: IRoom['_id'];
	onClose: () => void;
};

const toInputValue = (date: Date): string => {
	const pad = (value: number) => String(value).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** The chosen calendar day in the viewer's own time zone, from its first instant. */
const startOfLocalDay = (value: string): Date | null => {
	const [year, month, day] = value.split('-').map(Number);
	if (!year || !month || !day) {
		return null;
	}
	return new Date(year, month - 1, day);
};

const JumpToDateModal = ({ rid, onClose }: JumpToDateModalProps) => {
	const { t } = useTranslation();
	const dispatchToastMessage = useToastMessageDispatch();
	const fieldId = useId();
	const [value, setValue] = useState(() => toInputValue(new Date()));
	const date = startOfLocalDay(value);

	const jump = useMutation({
		mutationFn: async (target: Date) => jumpToDate(rid, target),
		onSuccess: (found) => {
			if (!found) {
				dispatchToastMessage({ type: 'warning', message: t('No_messages_on_or_after_date') });
				return;
			}
			onClose();
		},
		onError: (error) => {
			dispatchToastMessage({ type: 'error', message: error });
		},
	});

	return (
		<Modal
			is='form'
			onSubmit={(event: React.FormEvent) => {
				event.preventDefault();
				if (date) {
					jump.mutate(date);
				}
			}}
		>
			<ModalHeader>
				<ModalTitle>{t('Jump_to_date')}</ModalTitle>
				<ModalClose onClick={onClose} title={t('Close')} />
			</ModalHeader>
			<ModalContent>
				<Field>
					<FieldLabel htmlFor={fieldId}>{t('Date')}</FieldLabel>
					<FieldRow>
						<InputBox
							id={fieldId}
							type='date'
							value={value}
							max={toInputValue(new Date())}
							onChange={(event: React.ChangeEvent<HTMLInputElement>) => setValue(event.currentTarget.value)}
						/>
					</FieldRow>
					<FieldHint>{t('Jump_to_date_hint')}</FieldHint>
				</Field>
			</ModalContent>
			<ModalFooter>
				<ButtonGroup>
					<Button onClick={onClose}>{t('Cancel')}</Button>
					<Button type='submit' primary disabled={!date} loading={jump.isPending}>
						{t('Jump')}
					</Button>
				</ButtonGroup>
			</ModalFooter>
		</Modal>
	);
};

export default JumpToDateModal;
