-- Waveform shape for voice notes.
--
-- Computed once while recording and stored alongside the note, so playing one
-- back never has to download and decode the whole file just to draw its shape.

alter table voice_notes add column if not exists peaks jsonb;
