import { Transform } from 'class-transformer';

export const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
