export const COURSE_COLORS_LIGHT = ['#5E7CA3', '#6B9080', '#B5735A', '#B8913F', '#B0687A', '#4F8F96', '#8A6A94', '#8B8578'] as const;
export const COURSE_COLORS_DARK = ['#8FAAD0', '#8FBFA8', '#DC9A80', '#D9B866', '#D492A2', '#7FBFC5', '#B796C2', '#B8B2A4'] as const;
export const courseColor = (index: number, dark = false): string => (dark ? COURSE_COLORS_DARK : COURSE_COLORS_LIGHT)[((index % 8) + 8) % 8] as string;
export const ACCENT_LIGHT = '#E5322D';
export const ACCENT_DARK = '#FF5A52';
