# Several files in one message

Upstream posts one message per attached file: the composer text rides on the first
one and the rest go out empty. This fork sends every file attached to a single send
as **one message** with one attachment per file.

## Model

A message already carries `files[]` and `attachments[]`, and deletion, retention and
per-file removal read those arrays. Nothing new is stored: the only change is how
many messages a multi-file send produces.

The client decides at send time:

- one finished upload keeps upstream's per-file confirm call;
- two or more finished uploads go to `rooms.mediaConfirmMultiple` in one request,
  with the composer text once and each file's own description;
- in an encrypted room the whole group is encrypted once, so the real file names
  and the text exist only inside the message's encrypted content, exactly as for a
  single encrypted file;
- a mix of encrypted and plain uploads, which should not happen, falls back to
  upstream's one-message-per-file path.

The server confirms every upload of the group, builds attachments for each in the
order sent, and posts one message. The first file also fills the legacy `file` field
so readers that only know that field still find something. The `afterFileUpload`
callback runs once per message, not per file.

Uploads that failed or have not finished are handled exactly as upstream does before
the group is formed.

## Where it lives

- `apps/meteor/client/lib/chats/flows/processMessageUploads.ts` picks per-file or
  grouped sending.
- `apps/meteor/server/api/v1/rooms-media-confirm-multiple.ts` is the endpoint;
  `apps/meteor/server/meteor-methods/messages/sendFilesMessage.ts` builds and posts
  the message.
- Request typing: `RoomsMediaConfirmMultipleProps` in `@rocket.chat/rest-typings`.
