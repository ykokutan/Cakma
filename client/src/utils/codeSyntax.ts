export type NormalizedCodeLang =
  | 'ts'
  | 'python'
  | 'rust'
  | 'csharp'
  | 'sql'
  | 'json'
  | 'bash'
  | 'diff'
  | 'plain';

export type CodeTokenKind =
  | 'plain'
  | 'comment'
  | 'string'
  | 'number'
  | 'keyword'
  | 'type'
  | 'key'
  | 'diffAdd'
  | 'diffDel'
  | 'diffHunk';

export interface CodeToken {
  text: string;
  kind: CodeTokenKind;
}

const LANG_ALIASES: Record<string, NormalizedCodeLang> = {
  ts: 'ts',
  tsx: 'ts',
  js: 'ts',
  jsx: 'ts',
  typescript: 'ts',
  javascript: 'ts',
  py: 'python',
  python: 'python',
  rs: 'rust',
  rust: 'rust',
  cs: 'csharp',
  csharp: 'csharp',
  'c#': 'csharp',
  sql: 'sql',
  postgres: 'sql',
  sqlite: 'sql',
  json: 'json',
  jsonc: 'json',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  powershell: 'bash',
  ps1: 'bash',
  diff: 'diff',
  patch: 'diff',
};

const KEYWORDS_BY_LANG: Record<Exclude<NormalizedCodeLang, 'diff' | 'plain' | 'json'>, Set<string>> = {
  ts: new Set([
    'const', 'let', 'var', 'function', 'return', 'import', 'export', 'from', 'default',
    'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'try', 'catch',
    'finally', 'throw', 'new', 'class', 'extends', 'implements', 'interface', 'type',
    'enum', 'async', 'await', 'true', 'false', 'null', 'undefined', 'void', 'as', 'in', 'of',
  ]),
  python: new Set([
    'def', 'class', 'return', 'import', 'from', 'as', 'if', 'elif', 'else', 'for', 'while',
    'break', 'continue', 'try', 'except', 'finally', 'raise', 'with', 'async', 'await',
    'yield', 'lambda', 'pass', 'True', 'False', 'None', 'and', 'or', 'not', 'in', 'is',
  ]),
  rust: new Set([
    'fn', 'let', 'mut', 'const', 'pub', 'struct', 'enum', 'impl', 'trait', 'for', 'in',
    'while', 'loop', 'if', 'else', 'match', 'return', 'use', 'mod', 'crate', 'async',
    'await', 'move', 'where', 'true', 'false', 'Some', 'None', 'Ok', 'Err', 'self', 'Self',
  ]),
  csharp: new Set([
    'using', 'namespace', 'class', 'struct', 'interface', 'enum', 'public', 'private',
    'protected', 'internal', 'static', 'readonly', 'async', 'await', 'return', 'var',
    'new', 'if', 'else', 'foreach', 'for', 'while', 'switch', 'case', 'try', 'catch',
    'finally', 'throw', 'true', 'false', 'null', 'void', 'record',
  ]),
  sql: new Set([
    'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
    'CREATE', 'TABLE', 'INDEX', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'ON', 'GROUP', 'BY',
    'ORDER', 'LIMIT', 'AS', 'AND', 'OR', 'NOT', 'NULL', 'PRIMARY', 'KEY', 'IF', 'EXISTS',
    'select', 'from', 'where', 'insert', 'into', 'values', 'update', 'set', 'delete',
    'create', 'table', 'index', 'join', 'left', 'right', 'inner', 'on', 'group', 'by',
    'order', 'limit', 'as', 'and', 'or', 'not', 'null', 'primary', 'key', 'if', 'exists',
  ]),
  bash: new Set([
    'if', 'then', 'else', 'elif', 'fi', 'for', 'do', 'done', 'while', 'case', 'esac',
    'function', 'export', 'local', 'return', 'exit', 'echo', 'cd', 'npm', 'git', 'cargo',
    'sudo', 'true', 'false',
  ]),
};

const TYPE_NAMES = new Set([
  'string', 'number', 'boolean', 'unknown', 'never', 'any', 'Promise', 'Record', 'Array',
  'Map', 'Set', 'Vec', 'Option', 'Result', 'String', 'str', 'i32', 'u32', 'i64', 'u64',
  'usize', 'bool', 'Task', 'int', 'float', 'dict', 'list', 'tuple', 'INTEGER', 'TEXT',
]);

export function normalizeCodeLanguage(raw?: string): NormalizedCodeLang {
  const clean = String(raw || '').trim().toLowerCase();
  return LANG_ALIASES[clean] || 'plain';
}

export function tokenizeCodeLine(line: string, lang: NormalizedCodeLang): CodeToken[] {
  if (!line) return [{ text: ' ', kind: 'plain' }];

  if (lang === 'diff') {
    if (line.startsWith('@@')) return [{ text: line, kind: 'diffHunk' }];
    if (line.startsWith('+') && !line.startsWith('+++')) return [{ text: line, kind: 'diffAdd' }];
    if (line.startsWith('-') && !line.startsWith('---')) return [{ text: line, kind: 'diffDel' }];
    return [{ text: line, kind: 'plain' }];
  }

  if (lang === 'json') {
    const jsonRegex = /("(?:\\.|[^"\\])*")(?=\s*:)|("(?:\\.|[^"\\])*")|(\b-?\d+(?:\.\d+)?\b)|\b(true|false|null)\b/g;
    const tokens: CodeToken[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = jsonRegex.exec(line)) !== null) {
      if (m.index > last) tokens.push({ text: line.slice(last, m.index), kind: 'plain' });
      if (m[1]) tokens.push({ text: m[1], kind: 'key' });
      else if (m[2]) tokens.push({ text: m[2], kind: 'string' });
      else if (m[3]) tokens.push({ text: m[3], kind: 'number' });
      else if (m[4]) tokens.push({ text: m[4], kind: 'keyword' });
      last = jsonRegex.lastIndex;
    }
    if (last < line.length) tokens.push({ text: line.slice(last), kind: 'plain' });
    return tokens.length > 0 ? tokens : [{ text: line, kind: 'plain' }];
  }

  const kwSet =
    lang === 'plain' ? KEYWORDS_BY_LANG.ts : KEYWORDS_BY_LANG[lang];
  const tokenRegex = /(\/\/.*$|#.*$|--\s.*$|\/\*.*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b)/g;
  const parts: CodeToken[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(line)) !== null) {
    if (match.index > lastIdx) {
      parts.push({ text: line.slice(lastIdx, match.index), kind: 'plain' });
    }
    const token = match[0];
    if (
      token.startsWith('//') ||
      token.startsWith('#') ||
      token.startsWith('/*') ||
      token.startsWith('--')
    ) {
      parts.push({ text: token, kind: 'comment' });
    } else if (token.startsWith('"') || token.startsWith("'") || token.startsWith('`')) {
      parts.push({ text: token, kind: 'string' });
    } else if (/^\d/.test(token)) {
      parts.push({ text: token, kind: 'number' });
    } else if (kwSet.has(token)) {
      parts.push({ text: token, kind: 'keyword' });
    } else if (TYPE_NAMES.has(token)) {
      parts.push({ text: token, kind: 'type' });
    } else {
      parts.push({ text: token, kind: 'plain' });
    }
    lastIdx = tokenRegex.lastIndex;
  }

  if (lastIdx < line.length) {
    parts.push({ text: line.slice(lastIdx), kind: 'plain' });
  }
  return parts.length > 0 ? parts : [{ text: ' ', kind: 'plain' }];
}
