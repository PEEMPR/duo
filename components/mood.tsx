export const MOODS = ["😢", "😕", "😐", "🙂", "🥰"] as const;
export const moodEmoji = (n: number | null | undefined) => (n ? MOODS[n - 1] : "·");
