import { getSelectedMessageExcerpt } from './getSelectedMessageExcerpt';

const selectText = (node: Node, start: number, end: number) => {
	const range = document.createRange();
	range.setStart(node, start);
	range.setEnd(node, end);
	const selection = window.getSelection();
	selection?.removeAllRanges();
	selection?.addRange(range);
};

describe('getSelectedMessageExcerpt', () => {
	beforeEach(() => {
		document.body.innerHTML = '<div id="m1-content">hello brave new world</div><div id="m2-content">other message</div>';
		window.getSelection()?.removeAllRanges();
	});

	it('returns the selected words when they sit inside the message body', () => {
		selectText(document.getElementById('m1-content')!.firstChild!, 6, 15);

		expect(getSelectedMessageExcerpt('m1')).toBe('brave new');
	});

	it('ignores a selection that belongs to another message or is empty', () => {
		selectText(document.getElementById('m2-content')!.firstChild!, 0, 5);
		expect(getSelectedMessageExcerpt('m1')).toBeUndefined();

		window.getSelection()?.removeAllRanges();
		expect(getSelectedMessageExcerpt('m1')).toBeUndefined();
	});

	it('shortens an excerpt that is too long', () => {
		document.body.innerHTML = `<div id="m1-content">${'x'.repeat(600)}</div>`;
		selectText(document.getElementById('m1-content')!.firstChild!, 0, 600);

		expect(getSelectedMessageExcerpt('m1')).toHaveLength(500);
	});
});
