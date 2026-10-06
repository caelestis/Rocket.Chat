# Jump to date

Adds a **Jump to date** action to the room toolbar. Picking a day scrolls the room to
the first message sent on that day in the viewer's time zone, or to the next message
after it when the day was quiet.

## Model

The room view already knows how to jump to any message: the `?msg=<id>` query
parameter loads the messages around it, scrolls there and highlights it. This feature
only has to find the right id. The client sends the first instant of the chosen day to
`chat.findMessageByDate`; the server returns the id of the first visible message at or
after it, main timeline only, and the client sets the query parameter.

Nothing is stored. Access is the same as for reading the room.

## Where it lives

- `apps/meteor/client/hooks/roomActions/useJumpToDateRoomAction.tsx` is the toolbar
  action, registered in `client/ui.ts`; it opens `JumpToDateModal`.
- `apps/meteor/client/lib/jumpToDate.ts` asks the server and performs the jump.
- `apps/meteor/server/api/v1/chat-find-message-by-date.ts` is the endpoint.
