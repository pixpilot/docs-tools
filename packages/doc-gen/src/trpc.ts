import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import ts from 'typescript';

/* eslint-disable no-bitwise -- TypeScript's type and symbol flags are bit masks. */

export type ProcedureType = 'mutation' | 'query' | 'subscription';

export interface Procedure {
  /** Dotted path the client calls, such as `voice.profiles.list`. */
  path: string;
  type: ProcedureType;
  /** The input's fields (`{ id, limit? }`), its type when not an object, or none. */
  input?: string;
  /** The first line of the procedure's doc comment. */
  description?: string;
}

const MAX_INPUT_LENGTH = 80;
const ELLIPSIS = '...';
const NO_INPUT =
  ts.TypeFlags.Void |
  ts.TypeFlags.Undefined |
  ts.TypeFlags.Unknown |
  ts.TypeFlags.Any |
  ts.TypeFlags.Never;

function findTsconfig(file: string): string {
  let dir = dirname(file);
  for (;;) {
    const candidate = join(dir, 'tsconfig.json');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`No tsconfig.json above ${file}`);
    dir = parent;
  }
}

function createProgram(routerFile: string, tsconfig: string): ts.Program {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    tsconfig,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
      },
    },
  );
  if (!parsed) throw new Error(`Could not read ${tsconfig}`);
  return ts.createProgram({
    rootNames: [routerFile],
    options: { ...parsed.options, noEmit: true },
  });
}

/**
 * Every procedure of a tRPC v10/v11 router, read from its type with the
 * TypeScript compiler, so the router's runtime dependencies never load.
 */
export function readTrpcRouter(
  routerFile: string,
  typeName = 'AppRouter',
  tsconfig = findTsconfig(routerFile),
): Procedure[] {
  const program = createProgram(routerFile, tsconfig);
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(routerFile);
  const module = source && checker.getSymbolAtLocation(source);
  const symbol =
    module && checker.getExportsOfModule(module).find((s) => s.name === typeName);
  if (!source || !symbol) throw new Error(`${routerFile} does not export ${typeName}`);

  const target =
    symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const routerType =
    target.flags & ts.SymbolFlags.TypeAlias || target.flags & ts.SymbolFlags.Interface
      ? checker.getDeclaredTypeOfSymbol(target)
      : checker.getTypeOfSymbolAtLocation(target, source);

  const typeOf = (property: ts.Symbol): ts.Type =>
    checker.getTypeOfSymbolAtLocation(property, source);
  const member = (type: ts.Type, name: string): ts.Type | undefined => {
    const property = type.getProperty(name);
    return property && typeOf(property);
  };

  const describeInput = (input: ts.Type | undefined): string | undefined => {
    if (!input || input.flags & NO_INPUT) return undefined;
    const fields =
      !input.isUnion() && input.flags & ts.TypeFlags.Object ? input.getProperties() : [];
    if (fields.length > 0) {
      const names = fields.map((field) =>
        field.flags & ts.SymbolFlags.Optional ? `${field.name}?` : field.name,
      );
      return `{ ${names.join(', ')} }`;
    }
    const text = checker.typeToString(input);
    return text.length > MAX_INPUT_LENGTH
      ? `${text.slice(0, MAX_INPUT_LENGTH - ELLIPSIS.length)}${ELLIPSIS}`
      : text;
  };

  const describe = (property: ts.Symbol): string | undefined => {
    const text = ts
      .displayPartsToString(property.getDocumentationComment(checker))
      .trim();
    const first = text.split(/\r?\n/u)[0]?.trim() ?? '';
    return first === '' ? undefined : first;
  };

  const procedures: Procedure[] = [];
  const visit = (type: ts.Type, prefix: string, seen: Set<ts.Type>): void => {
    if (seen.has(type)) return;
    seen.add(type);
    const def = member(type, '_def');
    const record = def && member(def, 'record');
    const properties = record ? record.getProperties() : type.getProperties();
    for (const property of properties) {
      if (!record && (property.name === '_def' || property.name === 'createCaller'))
        continue;
      const path = prefix ? `${prefix}.${property.name}` : property.name;
      const child = typeOf(property);
      const childDef = member(child, '_def');
      if (childDef?.getProperty('procedure')) {
        const kind = member(childDef, 'type');
        const types = member(childDef, '$types');
        const description = describe(property);
        procedures.push({
          path,
          type: (kind?.isStringLiteral() ? kind.value : 'query') as ProcedureType,
          ...optional('input', describeInput(types && member(types, 'input'))),
          ...optional('description', description),
        });
      } else if (child.flags & ts.TypeFlags.Object) {
        visit(child, path, new Set(seen));
      }
    }
  };
  visit(routerType, '', new Set());
  return procedures.sort((a, b) => a.path.localeCompare(b.path));
}

function optional<K extends string>(
  key: K,
  value: string | undefined,
): Partial<Record<K, string>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, string>);
}
