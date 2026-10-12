// Resolve the admitted fixture's locked Expo config, never a global package.
import { createRequire } from 'node:module';
const require = createRequire('/work/fixture/package.json');
const expo = require('eslint-config-expo/flat');
export default [...expo, { ignores: ['android/**', 'node_modules/**', '.expo/**'] }];
