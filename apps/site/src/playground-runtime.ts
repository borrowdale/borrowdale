import { parse } from 'acorn';
import * as charts from '@borrowdale/charts';
import * as core from '@borrowdale/core';
import * as text from '@borrowdale/text';
import * as fills from '@borrowdale/fills';
import { excalifontFiles } from '@borrowdale/text/excalifont-files';

const modules: Record<string, Record<string, unknown>> = {
  '@borrowdale/charts': charts,
  '@borrowdale/core': core,
  '@borrowdale/text': text,
  '@borrowdale/fills': fills,
  '@borrowdale/text/excalifont-files': { excalifontFiles },
};

export function executeExample(code: string): string {
  const program = parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  let source = code;
  let moduleArgument = '__borrowdaleModules';
  while (code.includes(moduleArgument)) moduleArgument += '_';
  const imports: string[] = [];
  for (const node of [...program.body].reverse()) {
    if (node.type !== 'ImportDeclaration') continue;
    const module = String(node.source.value);
    if (!Object.hasOwn(modules, module))
      throw new Error(`This playground only imports the local BorrowdaleJS packages: ${module}`);
    const names = node.specifiers.map((binding) => {
      if (binding.type !== 'ImportSpecifier') throw new Error('Use named imports in the playground.');
      const imported =
        binding.imported.type === 'Identifier' ? binding.imported.name : String(binding.imported.value);
      if (!Object.hasOwn(modules[module], imported)) throw new Error(`Unknown import: ${imported}`);
      return `${JSON.stringify(imported)}: ${binding.local.name}`;
    });
    imports.unshift(`const { ${names.join(', ')} } = ${moduleArgument}[${JSON.stringify(module)}];`);
    source = source.slice(0, node.start) + source.slice(node.end);
  }
  let output = '';
  const render = (markup: unknown) => {
    if (typeof markup !== 'string') throw new Error('render() expects SVG or HTML markup.');
    if (markup.length > 2_000_000) throw new Error('Preview exceeds the 2 MB playground limit.');
    output = markup;
  };
  const execute = new Function(moduleArgument, 'render', `"use strict";\n${imports.join('\n')}\n${source}`);
  execute(modules, render);
  if (!output) throw new Error('Call render(svg) to display your drawing.');
  return output;
}
