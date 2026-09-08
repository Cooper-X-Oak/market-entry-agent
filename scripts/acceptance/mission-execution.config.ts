import base from './vitest.config.js';
import { createRequire } from 'node:module';
const require=createRequire(new URL('../../packages/workflows/package.json',import.meta.url));
export default {...base,resolve:{...base.resolve,alias:{...base.resolve?.alias,'@temporalio/workflow':require.resolve('@temporalio/workflow')}},test:{...base.test,include:['scripts/acceptance/mission-execution-contract.integration.test.mts']}};
