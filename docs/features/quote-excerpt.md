# Quoting part of a message

Select some text inside a message and press **Quote**: only the selected part is
quoted. With nothing selected, Quote behaves as upstream and quotes the whole message.

## Model

A quote travels as a permalink in the message text, `[ ](…?msg=<id>)`, and whoever
renders the message rebuilds the quote attachment from it: the server for plain
rooms, the client for encrypted ones. A partial quote adds the chosen text to that
same link as an `excerpt` query parameter, so nothing new is stored and both
builders keep working from one source. When an excerpt is present the quote shows
that text alone, without the original's markdown, translations or attachments. The
link still points at the full message.

The selection counts only when it lies entirely inside that message's body, and it
is cut at 500 characters on the client and 1000 on the server. The composer keeps
the excerpt beside the quoted message until the quote is sent or dismissed.

## Where it lives

- `apps/meteor/client/lib/getSelectedMessageExcerpt.ts` reads the selection;
  `QuoteMessageAction.tsx` stores it in `client/lib/quoteExcerpts.ts`.
- `apps/meteor/client/lib/utils/prependReplies.ts` puts it on the permalink;
  `MessageBoxReply.tsx` previews it.
- `apps/meteor/lib/createQuoteAttachment.ts` applies it, called from the server hook
  `BeforeSaveJumpToMessage.ts` and from the E2EE parser in `rocketchat.e2e.ts`.
