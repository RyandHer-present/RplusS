-- What a jam link actually points at.
--
-- The Spotify oEmbed endpoint describes any public track, album, playlist or
-- artist without a login or an API key, and allows any origin, so the browser
-- can ask it directly. The answer is kept here rather than re-fetched on every
-- render, which also means a link stays readable in a backup export and after
-- Spotify eventually changes something.
--
-- Jam invites are the exception. They are `spotify.link` shortlinks pointing at
-- a live session rather than at a piece of content, and oEmbed times out on
-- them, so these three columns stay null for a jam and the screen says so
-- rather than showing an empty card.

alter table jams add column title     text;
alter table jams add column thumb_url text;
alter table jams add column embed_url text;
