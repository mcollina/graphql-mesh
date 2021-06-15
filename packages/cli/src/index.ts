import { findAndParseConfig, DefaultLogger } from '@graphql-mesh/config';
import { getMesh } from '@graphql-mesh/runtime';
import { generateTsArtifacts } from './commands/ts-artifacts';
import { serveMesh } from './commands/serve/serve';
import { isAbsolute, resolve, join } from 'path';
import { existsSync } from 'fs';
import { FsStoreStorageAdapter, MeshStore } from '@graphql-mesh/store';
import { printSchemaWithDirectives } from '@graphql-tools/utils';
import { writeFile, pathExists, rmdirs } from '@graphql-mesh/utils';
import { spinner } from './spinner';
import { handleFatalError } from './handleFatalError';
import { createRequire } from 'module';
import { cwd, env } from 'process';

export { generateTsArtifacts, serveMesh };

export async function graphqlMesh() {
  let baseDir = cwd();
  let logger = new DefaultLogger('Mesh');

  const cjsImport = createRequire(import.meta.url);

  const yargs: typeof import('yargs') = cjsImport('yargs');

  return yargs
    .help()
    .option('r', {
      alias: 'require',
      describe: 'Loads specific require.extensions before running the codegen and reading the configuration',
      type: 'array' as const,
      default: [],
      coerce: (externalModules: string[]) =>
        Promise.all(
          externalModules.map(module => {
            const localModulePath = resolve(baseDir, module);
            const islocalModule = existsSync(localModulePath);
            return import(islocalModule ? localModulePath : module);
          })
        ),
    })
    .option('dir', {
      describe: 'Modified the base directory to use for looking for meshrc config file',
      type: 'string',
      default: baseDir,
      coerce: dir => {
        if (isAbsolute(dir)) {
          baseDir = dir;
        } else {
          baseDir = resolve(cwd(), dir);
        }
      },
    })
    .command<{ port: number; prod: boolean; validate: boolean }>(
      'dev',
      'Serves a GraphQL server with GraphQL interface to test your Mesh API',
      builder => {
        builder.option('port', {
          type: 'number',
        });
      },
      async args => {
        try {
          env.NODE_ENV = 'development';
          const result = await serveMesh({
            baseDir,
            argsPort: args.port,
          });
          logger = result.logger;
        } catch (e) {
          handleFatalError(e, logger);
        }
      }
    )
    .command<{ port: number; prod: boolean; validate: boolean }>(
      'start',
      'Serves a GraphQL server with GraphQL interface to test your Mesh API',
      builder => {
        builder.option('port', {
          type: 'number',
        });
      },
      async args => {
        try {
          if (!(await pathExists(join(baseDir, '.mesh')))) {
            throw new Error(
              `Seems like you haven't build Mesh artifacts yet to start production server! You need to build artifacts first with "mesh build" command!`
            );
            return;
          }
          env.NODE_ENV = 'production';
          const result = await serveMesh({
            baseDir,
            argsPort: args.port,
          });
          logger = result.logger;
        } catch (e) {
          handleFatalError(e, logger);
        }
      }
    )
    .command(
      'validate',
      'Validates artifacts',
      builder => {},
      async args => {
        try {
          if (!(await pathExists(join(baseDir, '.mesh')))) {
            throw new Error(
              `You cannot validate artifacts now because you don't have built artifacts yet! You need to build artifacts first with "mesh build" command!`
            );
            return;
          }
          const outputDir = join(baseDir, '.mesh');

          const store = new MeshStore(outputDir, new FsStoreStorageAdapter(), {
            readonly: false,
            validate: true,
          });

          const meshConfig = await findAndParseConfig({
            dir: baseDir,
            ignoreAdditionalResolvers: true,
            store,
          });
          logger = meshConfig.logger;

          const { destroy } = await getMesh(meshConfig);

          destroy();
        } catch (e) {
          handleFatalError(e, logger);
        }
      }
    )
    .command(
      'build',
      'Builds artifacts',
      builder => {},
      async args => {
        try {
          const outputDir = join(baseDir, '.mesh');

          spinner.start('Cleaning existing artifacts');
          await rmdirs(outputDir);

          const store = new MeshStore(outputDir, new FsStoreStorageAdapter(), {
            readonly: false,
            validate: false,
          });

          spinner.text = 'Reading Mesh configuration';
          const meshConfig = await findAndParseConfig({
            dir: baseDir,
            ignoreAdditionalResolvers: true,
            store,
          });
          logger = meshConfig.logger;

          spinner.text = 'Generating Mesh schema';
          const { schema, destroy, rawSources } = await getMesh(meshConfig);
          await writeFile(join(outputDir, 'schema.graphql'), printSchemaWithDirectives(schema));

          spinner.text = 'Generating artifacts';
          const tsArtifacts = await generateTsArtifacts({
            unifiedSchema: schema,
            rawSources,
            mergerType: meshConfig.mergerType,
            documents: meshConfig.documents,
            flattenTypes: false,
            rawConfig: meshConfig.config,
          });
          await writeFile(join(outputDir, 'index.ts'), tsArtifacts);

          spinner.text = 'Cleanup';
          destroy();
          spinner.succeed('Done! => ' + outputDir);
        } catch (e) {
          handleFatalError(e, logger);
        }
      }
    ).argv;
}
