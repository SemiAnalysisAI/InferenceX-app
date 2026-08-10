import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  apiDocumentationGroups,
  apiOperations,
  buildOpenApiDocument,
  getApiDocumentation,
  type BilingualText,
} from './api-documentation';
import {
  apiContractSourceDigests,
  apiRouteCatalog,
  type ApiRouteHttpMethod,
  type BilingualReviewText,
} from './api-route-catalog';

const APP_DIR = path.resolve(import.meta.dirname, '..', '..');
const API_DIR = path.join(APP_DIR, 'src', 'app', 'api');
const HTTP_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
] as const satisfies readonly ApiRouteHttpMethod[];
const HTTP_METHOD: Readonly<Record<ApiRouteHttpMethod, true>> = {
  GET: true,
  POST: true,
  PUT: true,
  PATCH: true,
  DELETE: true,
  HEAD: true,
  OPTIONS: true,
};

interface DiscoveredRoute {
  readonly source: string;
  readonly path: string;
  readonly method: ApiRouteHttpMethod;
}

function discoverRouteFiles(directory: string): string[] {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return discoverRouteFiles(absolute);
      return entry.isFile() && entry.name === 'route.ts' ? [absolute] : [];
    })
    .toSorted();
}

/** Uses the compiler AST so factory-assigned handlers such as `export const GET = idQueryRoute(...)` count. */
function exportedHttpMethods(file: string): ApiRouteHttpMethod[] {
  const sourceFile = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const methods = new Set<ApiRouteHttpMethod>();

  for (const statement of sourceFile.statements) {
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    if (!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;

    if (ts.isFunctionDeclaration(statement) && statement.name) {
      const name = statement.name.text;
      if (Object.hasOwn(HTTP_METHOD, name)) methods.add(name as ApiRouteHttpMethod);
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        const name = declaration.name.text;
        if (Object.hasOwn(HTTP_METHOD, name)) methods.add(name as ApiRouteHttpMethod);
      }
    }
  }

  return [...methods].toSorted();
}

function openApiSegment(segment: string): string {
  if (!segment.startsWith('[') || !segment.endsWith(']')) return segment;

  let parameter = segment.slice(1, -1);
  if (parameter.startsWith('[') && parameter.endsWith(']')) parameter = parameter.slice(1, -1);
  if (parameter.startsWith('...')) parameter = parameter.slice(3);
  return `{${parameter}}`;
}

function routePathFromFile(file: string): string {
  const relativeDirectory = path.relative(API_DIR, path.dirname(file));
  const segments = relativeDirectory.split(path.sep).filter(Boolean).map(openApiSegment);
  return segments.length === 0 ? '/api' : `/api/${segments.join('/')}`;
}

function discoverRoutes(): DiscoveredRoute[] {
  return discoverRouteFiles(API_DIR).flatMap((file) =>
    exportedHttpMethods(file).map((method) => ({
      source: path.relative(APP_DIR, file).split(path.sep).join('/'),
      path: routePathFromFile(file),
      method,
    })),
  );
}

function sha256(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function expectLocalizedPair(label: string, value: BilingualReviewText | BilingualText): void {
  expect(value.en.trim(), `${label} is missing English copy`).not.toBe('');
  expect(value.zh.trim(), `${label} is missing Simplified Chinese copy`).not.toBe('');
}

function pathParameterNames(apiPath: string): string[] {
  return apiPath
    .split('/')
    .filter((segment) => segment.startsWith('{') && segment.endsWith('}'))
    .map((segment) => segment.slice(1, -1));
}

function expectNonempty(label: string, value: string): void {
  expect(value.trim(), `${label} must be localized`).not.toBe('');
}

describe('API route catalog', () => {
  it('has exact source, OpenAPI path, and HTTP method parity with route handlers', () => {
    const discoveredKeys = discoverRoutes()
      .map((route) => `${route.source} :: ${route.method} ${route.path}`)
      .toSorted();
    const catalogKeys = apiRouteCatalog
      .map((route) => `${route.source} :: ${route.method} ${route.path}`)
      .toSorted();

    expect(
      new Set(catalogKeys).size,
      'Duplicate catalog entry: keep one classification per source/path/method handler.',
    ).toBe(catalogKeys.length);
    expect(
      discoveredKeys,
      'Route handlers changed. Review the API documentation and add or remove the matching catalog entry and digest.',
    ).toEqual(catalogKeys);
  });

  it('forces API documentation review after every route or shared contract source edit', () => {
    for (const entry of apiRouteCatalog) {
      const absolute = path.join(APP_DIR, entry.source);
      expect(fs.existsSync(absolute), `${entry.source} is cataloged but missing`).toBe(true);
      expect(entry.sourceSha256, `${entry.source} has an invalid SHA-256 digest`).toMatch(
        /^[0-9a-f]{64}$/u,
      );
      expect(
        sha256(absolute),
        `${entry.method} ${entry.path} changed. Review its API documentation/classification and update the route SHA-256 digest in src/lib/api-route-catalog.ts.`,
      ).toBe(entry.sourceSha256);
    }

    for (const entry of apiContractSourceDigests) {
      const absolute = path.resolve(APP_DIR, entry.source);
      expectLocalizedPair(`${entry.source} review area`, entry.reviewArea);
      expect(fs.existsSync(absolute), `${entry.source} is cataloged but missing`).toBe(true);
      expect(entry.sourceSha256, `${entry.source} has an invalid SHA-256 digest`).toMatch(
        /^[0-9a-f]{64}$/u,
      );
      expect(
        sha256(absolute),
        `${entry.source} changed. Review API docs for: ${entry.reviewArea.en} Then update its shared-source SHA-256 digest in src/lib/api-route-catalog.ts.`,
      ).toBe(entry.sourceSha256);
    }
  });

  it('classifies every route and gives every unpublished handler a bilingual reason', () => {
    expect([...new Set(apiRouteCatalog.map((entry) => entry.classification))].toSorted()).toEqual(
      [
        'published-read',
        'page-bff',
        'ui-artifact-read',
        'public-mutation',
        'admin',
        'sensitive',
        'documentation',
      ].toSorted(),
    );

    for (const entry of apiRouteCatalog) {
      if (entry.classification === 'published-read') {
        expect(
          entry.operationId.trim(),
          `${entry.method} ${entry.path} needs an operationId`,
        ).not.toBe('');
      } else {
        expectLocalizedPair(
          `${entry.method} ${entry.path} exclusion reason`,
          entry.exclusionReason,
        );
        expect(
          entry.exclusionReason.zh,
          `${entry.method} ${entry.path} exclusion reason must contain Simplified Chinese copy`,
        ).toMatch(/[\u3400-\u9FFF]/u);
      }
    }
  });

  it('maps published reads one-to-one to unique documented operations', () => {
    const published = apiRouteCatalog.filter((entry) => entry.classification === 'published-read');
    const publishedIds = published.map((entry) => entry.operationId);
    const documentedIds = apiOperations.map((operation) => operation.id);

    expect(new Set(publishedIds).size, 'Published catalog operationIds must be unique.').toBe(
      publishedIds.length,
    );
    expect(new Set(documentedIds).size, 'apiOperations operationIds must be unique.').toBe(
      documentedIds.length,
    );
    expect(
      publishedIds.toSorted(),
      'Published catalog entries and apiOperations must use exactly the same operationIds.',
    ).toEqual(documentedIds.toSorted());

    for (const operation of apiOperations) {
      const entry = published.find((candidate) => candidate.operationId === operation.id);
      expect(
        entry,
        `${operation.id} is documented but has no published route classification`,
      ).toBeDefined();
      expect(entry?.path, `${operation.id} path drifted from its route catalog entry`).toBe(
        operation.path,
      );
      expect(entry?.method, `${operation.id} method drifted from its route catalog entry`).toBe(
        operation.method,
      );
    }
  });
});

describe('published API documentation invariants', () => {
  it('keeps all documentation copy complete in both locales', () => {
    for (const group of apiDocumentationGroups) {
      expectLocalizedPair(`${group.id} title`, group.title);
      expectLocalizedPair(`${group.id} description`, group.description);
    }

    for (const operation of apiOperations) {
      expectLocalizedPair(`${operation.id} summary`, operation.summary);
      expectLocalizedPair(`${operation.id} description`, operation.description);
      for (const parameter of operation.parameters) {
        expectLocalizedPair(`${operation.id} parameter ${parameter.name}`, parameter.description);
      }
      for (const response of operation.responses) {
        expectLocalizedPair(`${operation.id} response ${response.status}`, response.description);
      }
    }

    for (const locale of ['en', 'zh'] as const) {
      const documentation = getApiDocumentation(locale);
      expectNonempty(`${locale} title`, documentation.title);
      expectNonempty(`${locale} eyebrow`, documentation.eyebrow);
      expectNonempty(`${locale} description`, documentation.description);
      expectNonempty(`${locale} auth title`, documentation.auth.title);
      expectNonempty(`${locale} auth description`, documentation.auth.description);
      expectNonempty(`${locale} format title`, documentation.format.title);
      expectNonempty(`${locale} format description`, documentation.format.description);

      for (const quickstart of documentation.quickstarts) {
        expectNonempty(`${locale} quickstart ${quickstart.id} label`, quickstart.label);
        expectNonempty(`${locale} quickstart ${quickstart.id} description`, quickstart.description);
      }
      for (const convention of documentation.conventions) {
        expectNonempty(`${locale} convention ${convention.id} title`, convention.title);
        expectNonempty(`${locale} convention ${convention.id} description`, convention.description);
      }
      for (const note of documentation.schemaNotes) {
        expectNonempty(`${locale} schema note ${note.id} title`, note.title);
        expectNonempty(`${locale} schema note ${note.id} description`, note.description);
      }
      for (const group of documentation.groups) {
        expectNonempty(`${locale} group ${group.id} title`, group.title);
        expectNonempty(`${locale} group ${group.id} description`, group.description);
        for (const operation of group.operations) {
          expectNonempty(`${locale} operation ${operation.id} summary`, operation.summary);
          expectNonempty(`${locale} operation ${operation.id} description`, operation.description);
          for (const parameter of operation.parameters) {
            expectNonempty(
              `${locale} operation ${operation.id} parameter ${parameter.name}`,
              parameter.description,
            );
          }
          for (const response of operation.responses) {
            expectNonempty(
              `${locale} operation ${operation.id} response ${response.status}`,
              response.description,
            );
          }
        }
      }
    }
  });

  it('documents every path parameter and at least one successful response', () => {
    for (const operation of apiOperations) {
      const pathNames = pathParameterNames(operation.path).toSorted();
      const documentedPathParameters = operation.parameters
        .filter((parameter) => parameter.location === 'path')
        .map((parameter) => parameter.name)
        .toSorted();

      expect(
        documentedPathParameters,
        `${operation.id} must document exactly the parameters in its OpenAPI path template.`,
      ).toEqual(pathNames);
      for (const parameter of operation.parameters.filter((item) => item.location === 'path')) {
        expect(
          parameter.required,
          `${operation.id} path parameter ${parameter.name} must be required`,
        ).toBe(true);
      }
      expect(
        operation.responses.some((response) => response.status.startsWith('2')),
        `${operation.id} must document a 2xx response.`,
      ).toBe(true);
    }
  });

  it('keeps the OpenAPI paths and operations in exact parity with apiOperations', () => {
    const document = buildOpenApiDocument('https://api-docs.test');
    const projected = new Map<string, Record<string, unknown>>();

    for (const [apiPath, pathItemValue] of Object.entries(document.paths)) {
      const pathItem = pathItemValue as Record<string, unknown>;
      for (const method of HTTP_METHODS) {
        const operationValue = pathItem[method.toLowerCase()];
        if (operationValue === undefined) continue;
        projected.set(`${method} ${apiPath}`, operationValue as Record<string, unknown>);
      }
    }

    const documentedKeys = apiOperations
      .map((operation) => `${operation.method} ${operation.path}`)
      .toSorted();
    expect(
      [...projected.keys()].toSorted(),
      'OpenAPI paths/methods must exactly match the published apiOperations registry.',
    ).toEqual(documentedKeys);

    const projectedOperationIds: string[] = [];
    for (const operation of apiOperations) {
      const key = `${operation.method} ${operation.path}`;
      const openApiOperation = projected.get(key);
      expect(
        openApiOperation,
        `${operation.id} is missing from the OpenAPI projection`,
      ).toBeDefined();
      expect(
        openApiOperation?.operationId,
        `${operation.id} has a mismatched OpenAPI operationId`,
      ).toBe(operation.id);
      projectedOperationIds.push(String(openApiOperation?.operationId));

      const responses = openApiOperation?.responses as Record<string, unknown> | undefined;
      expect(
        responses && Object.keys(responses).some((status) => status.startsWith('2')),
        `${operation.id} must project a 2xx OpenAPI response.`,
      ).toBe(true);

      const parameters =
        (openApiOperation?.parameters as readonly Record<string, unknown>[] | undefined) ?? [];
      const projectedPathParameters = parameters
        .filter((parameter) => parameter.in === 'path')
        .map((parameter) => String(parameter.name))
        .toSorted();
      for (const parameter of parameters.filter((item) => item.in === 'path')) {
        expect(
          parameter.required,
          `${operation.id} OpenAPI path parameter ${String(parameter.name)} must be required.`,
        ).toBe(true);
      }
      expect(
        projectedPathParameters,
        `${operation.id} OpenAPI projection must include every path parameter.`,
      ).toEqual(pathParameterNames(operation.path).toSorted());
    }

    expect(new Set(projectedOperationIds).size, 'OpenAPI operationIds must be unique.').toBe(
      projectedOperationIds.length,
    );
  });
});
