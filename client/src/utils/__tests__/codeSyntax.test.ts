import { describe, it, expect } from 'vitest';
import { normalizeCodeLanguage, tokenizeCodeLine } from '../codeSyntax';

describe('codeSyntax', () => {
  it('normalizes common language aliases cleanly', () => {
    expect(normalizeCodeLanguage('tsx')).toBe('ts');
    expect(normalizeCodeLanguage('JS')).toBe('ts');
    expect(normalizeCodeLanguage('py')).toBe('python');
    expect(normalizeCodeLanguage('rs')).toBe('rust');
    expect(normalizeCodeLanguage('C#')).toBe('csharp');
    expect(normalizeCodeLanguage('postgres')).toBe('sql');
    expect(normalizeCodeLanguage('ps1')).toBe('bash');
    expect(normalizeCodeLanguage('patch')).toBe('diff');
    expect(normalizeCodeLanguage('unknown-xyz')).toBe('plain');
  });

  it('tokenizes TypeScript keywords, types, strings, numbers and comments', () => {
    const tokens = tokenizeCodeLine('const count: number = 42; // answer', 'ts');
    expect(tokens.some((t) => t.text === 'const' && t.kind === 'keyword')).toBe(true);
    expect(tokens.some((t) => t.text === 'number' && t.kind === 'type')).toBe(true);
    expect(tokens.some((t) => t.text === '42' && t.kind === 'number')).toBe(true);
    expect(tokens.some((t) => t.text === '// answer' && t.kind === 'comment')).toBe(true);
  });

  it('tokenizes JSON keys, strings, booleans and numbers', () => {
    const tokens = tokenizeCodeLine('  "allowMultiple": true, "limit": 5', 'json');
    expect(tokens.some((t) => t.text === '"allowMultiple"' && t.kind === 'key')).toBe(true);
    expect(tokens.some((t) => t.text === 'true' && t.kind === 'keyword')).toBe(true);
    expect(tokens.some((t) => t.text === '5' && t.kind === 'number')).toBe(true);
  });

  it('classifies diff hunks, additions and deletions accurately', () => {
    expect(tokenizeCodeLine('@@ -10,2 +10,3 @@', 'diff')[0].kind).toBe('diffHunk');
    expect(tokenizeCodeLine('+const solved = true;', 'diff')[0].kind).toBe('diffAdd');
    expect(tokenizeCodeLine('-const solved = false;', 'diff')[0].kind).toBe('diffDel');
    expect(tokenizeCodeLine('+++ b/file.ts', 'diff')[0].kind).toBe('plain');
    expect(tokenizeCodeLine('--- a/file.ts', 'diff')[0].kind).toBe('plain');
  });
});
