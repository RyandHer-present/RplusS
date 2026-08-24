-- Hangman, with words you set for each other.
--
-- The whole difficulty is that the guesser must not be able to see the word,
-- and every other game here works by putting the entire state in a row that
-- both people read. A row containing the word would be sitting in the
-- guesser's browser the moment it was dealt.
--
-- So the word lives in its own table that has row level security on and no
-- select policy at all — nothing can read it through the API, by either
-- person, ever. Guessing happens through a security definer function which
-- reads the word server-side and writes back only what has been revealed.
--
-- The visible state is stored in `games.board` as "MASKED|GUESSED", for
-- example "E_E___NT|EAOTX". Misses are not stored: a guessed letter that does
-- not appear in the mask is a miss, so the count can be derived and cannot
-- disagree with what is on screen.

create table if not exists hangman_words (
  game_id uuid primary key references games(id) on delete cascade,
  word    text not null
);

alter table hangman_words enable row level security;

-- Deliberately no policies. Row level security with no policy denies everyone,
-- which is exactly the intent; the functions below are security definer and
-- bypass it.
grant all privileges on hangman_words to service_role;

-- Six wrong letters and the game is lost, the traditional number.
create or replace function hangman_misses(board text) returns int
language sql immutable as $$
  select coalesce(
    (select count(*)::int
       from regexp_split_to_table(split_part(board, '|', 2), '') as g(letter)
      where position(g.letter in split_part(board, '|', 1)) = 0),
    0)
$$;

create or replace function hangman_mask(word text, guessed text) returns text
language sql immutable as $$
  select string_agg(
    case
      when ch = ' ' then ' '
      when position(ch in guessed) > 0 then ch
      else '_'
    end, '' order by ord)
  from regexp_split_to_table(word, '') with ordinality as t(ch, ord)
$$;

-- --------------------------------------------------------------- new game --

create or replace function hangman_new(p_word text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  setter  user_id;
  guesser user_id;
  clean   text;
  new_id  uuid;
begin
  setter := current_app_user();
  if setter is null then
    raise exception 'not signed in';
  end if;

  -- Letters and single spaces only. Anything else would make a mask that
  -- cannot be guessed with an A-Z keyboard.
  clean := upper(regexp_replace(trim(p_word), '[^A-Za-z ]', '', 'g'));
  clean := regexp_replace(clean, ' +', ' ', 'g');

  if length(replace(clean, ' ', '')) < 2 then
    raise exception 'word too short';
  end if;
  if length(clean) > 40 then
    raise exception 'word too long';
  end if;

  guesser := case when setter = 'ry' then 'sarah' else 'ry' end;

  insert into games (kind, board, turn, winner, moves, started_by)
  values ('hangman', hangman_mask(clean, '') || '|', guesser, null, 0, setter)
  returning id into new_id;

  insert into hangman_words (game_id, word) values (new_id, clean);
  return new_id;
end;
$$;

-- ----------------------------------------------------------------- guess --

create or replace function hangman_guess(p_game uuid, p_letter text) returns void
language plpgsql security definer set search_path = public as $$
declare
  caller  user_id;
  g       games%rowtype;
  word    text;
  guessed text;
  letter  text;
  masked  text;
begin
  caller := current_app_user();
  letter := upper(substring(trim(p_letter) from 1 for 1));

  if caller is null then
    raise exception 'not signed in';
  end if;
  if letter !~ '^[A-Z]$' then
    raise exception 'not a letter';
  end if;

  select * into g from games where id = p_game and kind = 'hangman';
  if not found then
    raise exception 'no such game';
  end if;
  if g.winner is not null then
    return;
  end if;
  -- Only the guesser guesses; the person who set the word already knows it.
  if g.turn <> caller then
    raise exception 'not your turn';
  end if;

  select w.word into word from hangman_words w where w.game_id = p_game;
  if word is null then
    raise exception 'word missing';
  end if;

  guessed := split_part(g.board, '|', 2);
  if position(letter in guessed) > 0 then
    return;
  end if;

  guessed := guessed || letter;
  masked := hangman_mask(word, guessed);

  update games
     set board = masked || '|' || guessed,
         moves = g.moves + 1,
         winner = case
                    when position('_' in masked) = 0 then g.turn::text
                    when hangman_misses(masked || '|' || guessed) >= 6 then g.started_by::text
                    else null
                  end,
         updated_at = now()
   where id = p_game;
end;
$$;

grant execute on function hangman_new(text) to authenticated;

grant execute on function hangman_guess(uuid, text) to authenticated;

grant execute on function hangman_mask(text, text) to authenticated;

grant execute on function hangman_misses(text) to authenticated;
