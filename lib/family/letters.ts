/**
 * Letters to the baby: one question a week, a different one each week,
 * answerable aloud in about a minute (master run §8). Pure.
 *
 * The questions are written to be answered by either parent, before or
 * after the birth, and to read well years later. None asks for a list or a
 * plan; each asks for one small true thing.
 */

export const LETTER_QUESTIONS: readonly string[] = [
  "What were you doing when you found out about them, and what was the first thing you said?",
  "Describe the room you are in right now, so they can picture it one day.",
  "What is a sound from this week you would like them to hear?",
  "What did you eat today, and would they like it?",
  "Tell them about the street you live on.",
  "What made you laugh this week?",
  "What is one thing you are quietly worried about, and what would you tell them about worrying?",
  "What song has been in your head lately? Tell them why.",
  "Who can't wait to meet them, and what are they like?",
  "What is the weather doing, and what does the day smell like?",
  "Describe the other parent to them as they are this week.",
  "What is something small you are looking forward to showing them?",
  "What did your own parents or grandparents do that you want to keep going?",
  "What is one thing you hope they never have to learn the hard way?",
  "Tell them about a place you want to take them, and what you will do there first.",
  "What have you bought or been given for them that you like best?",
  "What do you imagine their voice will sound like?",
  "What is a family joke they will need explained?",
  "What were you like at seven? Tell them one story.",
  "What is the best advice you have been given about them so far, and the worst?",
  "What did you do today that you would like them to know was ordinary for you?",
  "Tell them about a friend of yours they should get to know.",
  "What is in your pockets or your bag right now?",
  "What is something you changed your mind about this year?",
  "What does home sound like in the evening?",
  "What would a perfect slow Sunday with them look like?",
  "What is a film, book or game you are saving to share with them?",
  "What have you noticed about yourself since you knew they were coming?",
  "What is the kindest thing someone did for you this week?",
  "Tell them about the animal in your life, or the one you wish you had.",
  "What do you want them to know about money that nobody told you?",
  "What is a smell that takes you straight back to being small?",
  "What are you proud of this week, however small?",
  "What name nearly was theirs, and what is the story?",
  "What is the view from the window nearest you?",
  "What would you like to be better at by the time they can ask you about it?",
  "Tell them about the day the two of you met, the other parent and you.",
  "What does your week look like, hour by hour, in one breath?",
  "What tradition do you want to start with them?",
  "What is something you made with your hands, and would you make it with them?",
  "What is a mistake you made that turned out fine?",
  "What is the last thing that made you cry, happy or sad?",
  "What do you hope they inherit from the other parent?",
  "What is your favourite thing about the place you live, and your least?",
  "What does a hug from your own mum or dad feel like? Tell them.",
  "What did you want to be when you grew up, and what happened instead?",
  "What is on the news that you think they will find strange one day?",
  "What is a rule of yours that you hope they break?",
  "Tell them about tonight: who is in the house and what everyone is doing.",
  "What have they already taught you?",
  "What do you want them to remember about this year, if they could?",
  "Finish this for them: \"The thing I most want you to know is…\"",
];

const DAY = 86_400_000;

/** The Monday that starts the week a day is in (YYYY-MM-DD in, Monday out). */
export function weekStart(day: string): string {
  const t = Date.parse(`${day}T00:00:00Z`);
  const dow = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
  return new Date(t - dow * DAY).toISOString().slice(0, 10);
}

/** Weeks since a fixed Monday, so the sequence never depends on the year turning. */
export function weekIndex(day: string): number {
  const epoch = Date.parse("2026-01-05T00:00:00Z"); // a Monday
  return Math.floor((Date.parse(`${weekStart(day)}T00:00:00Z`) - epoch) / (7 * DAY));
}

/**
 * This week's question. The family starts somewhere in the list (their own
 * `offset`, taken from the space id) and walks it in order, so two
 * households do not get the same question the same week and nobody sees a
 * repeat until the whole list has gone round (a year).
 */
export function questionFor(day: string, offset = 0): { index: number; week_of: string; question: string } {
  const n = LETTER_QUESTIONS.length;
  const index = (((weekIndex(day) + offset) % n) + n) % n;
  return { index, week_of: weekStart(day), question: LETTER_QUESTIONS[index] };
}

/** A stable number from a space id, for the starting place in the list. */
export function offsetFor(spaceId: string): number {
  let h = 0;
  for (const c of spaceId.replace(/-/g, "")) h = (h * 31 + parseInt(c, 16)) % 100_003;
  return h;
}
