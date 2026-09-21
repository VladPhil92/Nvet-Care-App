const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const {withSentryConfig} = require('@sentry/react-native/metro');

/**
 * Metro configuration for the Nvet Care npm-workspaces monorepo.
 *
 * The React Native application lives in `mobile/`, while most dependencies
 * are hoisted to the repository-level `node_modules`. Some native packages
 * can still remain under `mobile/node_modules` when npm needs a workspace-
 * specific version. Metro therefore needs both locations in its resolution
 * graph for deterministic debug and release bundles.
 *
 * withSentryConfig adds Debug IDs/source-map metadata without replacing the
 * existing monorepo resolver configuration.
 */
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = {
  projectRoot,
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
  },
};

module.exports = withSentryConfig(
  mergeConfig(getDefaultConfig(projectRoot), config),
);
