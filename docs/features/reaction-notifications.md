# Notifications for reactions

Upstream only notifies about new messages. This fork also notifies the author of a
message, on desktop and on mobile, when **someone else** reacts to it.

## Model

A reaction is not a message, so it never enters the message notification pipeline.
Instead the `afterSetReaction` callback hands the reaction to a dedicated sender.
It emits a desktop notification straight away, the same event a new message would
raise, when the author is connected and not busy; and it drops one push item into
the notification queue new messages use. Removing a reaction never notifies.

The notification names the reactor, the emoji and quotes a short excerpt of the
message. For an unencrypted message the server quotes it. For an encrypted one the
server has nothing to quote, so the desktop payload carries the ciphertext and a
`reaction` marker: the client decrypts the message and appends the quote itself,
instead of replacing the whole text as it does for a new encrypted message. The
mobile push never carries the message body in either case.

The push says who reacted with which emoji, and appends a short snippet of the
message when the workspace allows message content in pushes. The emoji travels as
unicode so the lock screen can render it; a custom emoji keeps its `:name:`.

The author's existing switches are honoured: the `Notifications_On_Reactions` setting
(General → Notifications), the troubleshooting kill switch, the room subscription
(`desktopNotifications`, `mobilePushNotifications`, `disableNotifications`), the
account defaults for each channel, and for mobile the workspace-wide push toggle.
Deactivated users and users no longer in the room get nothing.

The push is always self-contained. Workspaces that normally make the app fetch the
message body (`Push_request_content_from_server`) still receive the reaction text
directly, because the message body would describe the wrong event. For the same
reason the payload never carries the message text or its encrypted content.

Tapping the push opens the room, like a message push; it has no reply action.

## Where it lives

- `apps/meteor/server/lib/notifications/reactions/sendReactionNotifications.ts`
  decides whether to notify and builds both notifications.
- `apps/meteor/server/hooks/messages/sendNotificationsOnReaction.ts` wires it to
  `afterSetReaction`.
- `Notifications_On_Reactions` is registered in the Notifications section of
  `apps/meteor/server/settings/general.ts`.
