import { MergerFn } from '@graphql-mesh/types';
import { stitchSchemas } from '@graphql-tools/stitch';
import { wrapSchema } from '@graphql-tools/wrap';
import { mergeSingleSchema } from './mergeSingleSchema';
import { groupTransforms, applySchemaTransforms, meshDefaultCreateProxyingResolver } from '@graphql-mesh/utils';
import { StitchingInfo } from '@graphql-tools/delegate';
import { stitchingDirectives } from '@graphql-tools/stitching-directives';

const mergeUsingStitching: MergerFn = async function (options) {
  if (options.rawSources.length === 1) {
    return mergeSingleSchema(options);
  }
  const { rawSources, typeDefs, resolvers, transforms } = options;
  /*
    rawSources.forEach(rawSource => {
      if (!rawSource.executor) {
        const originalSchema = rawSource.schema;
        rawSource.executor = jitExecutorFactory(originalSchema, rawSource.name) as any;
        rawSource.schema = buildSchema(printSchema(originalSchema));
      }
    });
  */
  const defaultStitchingDirectives = stitchingDirectives();
  let unifiedSchema = stitchSchemas({
    subschemas: rawSources.map(rawSource => ({
      createProxyingResolver: meshDefaultCreateProxyingResolver,
      ...rawSource,
    })),
    typeDefs,
    resolvers,
    subschemaConfigTransforms: [defaultStitchingDirectives.stitchingDirectivesTransformer],
  });
  unifiedSchema.extensions = unifiedSchema.extensions || {};
  Object.assign(unifiedSchema.extensions, {
    get sourceMap() {
      const stitchingInfo: StitchingInfo = unifiedSchema.extensions.stitchingInfo;
      const entries = stitchingInfo.subschemaMap.entries();
      return new Map(
        [...entries].map(([subschemaConfig, subschema]) => [subschemaConfig, subschema.transformedSchema])
      );
    },
  });
  if (transforms?.length) {
    const { noWrapTransforms, wrapTransforms } = groupTransforms(transforms);
    if (wrapTransforms.length) {
      unifiedSchema = wrapSchema({
        schema: unifiedSchema,
        batch: true,
        transforms: wrapTransforms,
        createProxyingResolver: meshDefaultCreateProxyingResolver,
      });
    }
    if (noWrapTransforms.length) {
      unifiedSchema = applySchemaTransforms(unifiedSchema, { schema: unifiedSchema }, null, noWrapTransforms);
    }
  }
  return unifiedSchema;
};

export default mergeUsingStitching;
