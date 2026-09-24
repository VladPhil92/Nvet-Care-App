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

// The dashboard workspace keeps React 18 hoisted at the repository root while
// the app runs React 19 from mobile/node_modules. Hoisted libraries (React
// Navigation, React Query, Zustand, Sentry...) would otherwise resolve the root
// React and crash with two React copies, so these singletons always resolve
// from the app itself.
const SINGLETONS = ['react', 'react-native'];
const isSingleton = moduleName =>
  SINGLETONS.some(name => moduleName === name || moduleName.startsWith(`${name}/`));

const config = {
  projectRoot,
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    resolveRequest: (context, moduleName, platform) =>
      context.resolveRequest(
        isSingleton(moduleName)
          ? {...context, originModulePath: path.join(projectRoot, 'index.js')}
          : context,
        moduleName,
        platform,
      ),
  },
};

module.exports = withSentryConfig(
  mergeConfig(getDefaultConfig(projectRoot), config),
);
