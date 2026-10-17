# Document and web editing

PINTO prepares precise visual instructions for your existing coding agent. It does not modify the PDF, HTML or project itself, and it does not send to a thread0 session automatically. Copy the request into the agent you use.

## Open and mark

Use Open or drop PDF/HTML files. A PDF becomes a group of saved pages. The shared viewer supports View/Edit, Point (default), Rectangle, Ellipse, Line, Freehand and Hand. Changing modes preserves the current page and view; view mode hides editing tools. PDF thumbnails use an edge toggle. The instruction list includes all marked pages/screens of the same document and lets you revisit them. Instruction numbering is consistent with the copied request. User-authored notes are preserved verbatim in every UI language.

PDF coordinates are PDF points (1/72 inch) with a top-left origin. Text-layer boxes add the text beneath a mark; scanned pages without a text layer still provide coordinates and a cached screen. Instructions ask the agent to edit the original HTML/DOCX/Markdown/script and regenerate the PDF when applicable, otherwise edit the PDF itself. The cached locating PNG is not the editing target.

HTML is rendered in a sandboxed, offscreen Electron window at its real file path. Relative resources under its directory can load. The original viewport stays 1280×900; full-page capture does not stretch `100vh` sections. Element boxes, CSS selectors and short text excerpts help the agent locate the intended element. Source selectors are hints, not a mapping to component source-code line numbers.

For HTML slides, use ←/→ or click with Hand (dragging only pans). Navigation is replayed from the initial load, with up to 60 actions. Saved screens are reused when their visual signature and element context match. HTML has no page-history thumbnail list; use the instruction list to revisit marked screens. Non-deterministic animations can produce different captures.

## Local web apps

Use Open web app with an HTTP loopback URL: localhost, 127.0.0.1 or [::1]. PINTO does not start a development server; run it with your coding agent first.

Open web window / Sign in opens a PINTO-owned browser window. Its session cookies are separate from other browsers and thread0. Navigate or sign in there, then Refresh current screen captures that window's current same-origin URL. Without that window, refresh uses the stored URL. A fresh snapshot can restore cookies and a route; it does not clone a different browser's localStorage, form drafts or in-memory application state. Browser-window actions are real application actions.

Web-app requests are restricted to the same origin, including its port. A backend on another port and third-party CDNs are not automatically allowed. There is no external-browser login import. For full HTML viewing outside this restricted preview, More options → Open original file uses the OS app/browser, but PINTO's capture rules remain unchanged.

## Storage and limits

- Original image schemas 1/2/3 remain readable. Documents with source context use schema 4.
- Cached page/screen PNGs and notes are stored under `.image-notes/<id>/` (or PINTO user data). Collection membership stays in `collections.json`.
- Each saved page/screen occupies one of the 20 item slots in a work. A PDF may contain at most 20 pages; password-protected PDFs are not supported.
- Source files are limited to 64 MB. PDF raster previews have a longest side of at most 2400 pixels (scale at most 3), independent of the point coordinates.
- Web captures are 1280 CSS pixels wide and at most 8000 high; truncation is displayed and included in copied instructions.
- HTML network requests and local files outside the selected file's directory are blocked. Snapshot windows expose no Node.js or PINTO IPC to the page.
- Saved snapshots remain viewable offline. Refresh or reopen the source after it changes; a stored snapshot is not a live stream of the source.

English, Spanish and Korean UI/copy formats are included. Windows behavior is tested locally; macOS requires its own CI/device validation.
