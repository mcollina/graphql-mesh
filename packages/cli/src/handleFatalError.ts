import { Logger } from '@graphql-mesh/types';
import { spinner } from './spinner';

export function handleFatalError(e: Error, logger: Logger): any {
  const errorText = `Unable to start GraphQL Mesh: ${e.message}`;
  if (spinner.isSpinning) {
    spinner.fail(errorText);
  } else {
    logger.error(errorText);
  }
  if (process.env.DEBUG) {
    logger.error(
      JSON.stringify({
        ...e,
        name: e.name,
        stack: e.stack,
        message: e.message,
      })
    );
  }
  process.exit(1);
}
