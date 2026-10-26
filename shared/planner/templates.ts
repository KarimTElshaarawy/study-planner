import type { Method } from '../types';

export const METHOD_SEQUENCE: Method[] = ['recall', 'practice', 'association', 'pastpaper', 'quiz'];
export const REVIEW_METHODS: Method[] = ['association', 'quiz'];

export const METHOD_LABEL: Record<Method, string> = {
  recall: 'Active recall',
  practice: 'Practice questions',
  pastpaper: 'Past paper',
  association: 'Association hook',
  quiz: 'Quiz yourself',
  write: 'Write-up',
};

const NOTES: Record<Method, string[]> = {
  recall: [
    'Close the notes. Write everything you remember about {topic}, then check the gaps.',
    'Explain {topic} out loud in two minutes as if teaching a friend. Mark what you stumbled on.',
    'Blank page: draw the whole of {topic} from memory, then compare with the source.',
  ],
  practice: [
    'Solve 6 problems on {topic} without looking at solutions. Review only after the timer.',
    'Pick the three hardest questions on {topic} and work them fully, steps included.',
    'Redo the last problems you got wrong on {topic} from a blank page.',
  ],
  pastpaper: [
    'Do one past paper question set under exam timing. Mark it honestly.',
    'Take a past paper section on {topic} with a timer and no notes.',
    'Pick a past paper, solve the questions touching {topic}, and list what cost you time.',
  ],
  association: [
    'Write one vivid analogy for {topic} using something you know well. Add a one-line mnemonic.',
    'Link {topic} to a place or a story you already know. Write the chain down in your own words.',
    'Invent a mnemonic for the key steps of {topic}. Make it odd enough to stick.',
  ],
  quiz: [
    'Quiz yourself on {course}: write 10 questions from your notes, then answer them cold.',
    'Shuffle your {course} flashcards. Anything you miss goes in a restudy pile for tomorrow.',
    'Ask yourself why, not what, for 10 key ideas in {course}. Answer in full sentences.',
  ],
  write: [
    'Draft the next section of {topic}. Leave polishing for later.',
    'Outline what is left on {topic}, then write the part you are most unsure about.',
    'Finish one concrete piece of {topic} and note what remains.',
  ],
};

export const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export const noteFor = (method: Method, seed: string, topic: string, course: string): string => {
  const list = NOTES[method];
  const t = list[hash(seed) % list.length] as string;
  return t.replaceAll('{topic}', topic).replaceAll('{course}', course);
};

export const TAPER_NOTE = 'Light review only. Skim your summary sheet and stop on time.';
