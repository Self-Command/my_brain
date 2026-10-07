const { getDefaultConfig } = require("expo/metro-config");
const fs = require("fs");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Allow Metro to follow workspace packages outside apps/mobile.
config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// pnpm keeps dependencies beside their importing package, including core and RN.
config.resolver.disableHierarchicalLookup = false;
config.resolver.unstable_enableSymlinks = true;


const defaultResolveRequest = config.resolver.resolveRequest;

/**
 * @my-brain/core uses TypeScript ESM-style relative imports with a `.js` suffix.
 * Metro must map those to `.ts`/`.tsx` sources when no compiled `.js` file exists.
 */
const betterSqliteDriverShim = path.resolve(
  projectRoot,
  "shims/betterSqliteDriver.js",
);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === "better-sqlite3" ||
    (moduleName.startsWith(".") && moduleName.includes("betterSqliteDriver"))
  ) {
    return {
      type: "sourceFile",
      filePath: betterSqliteDriverShim,
    };
  }

  if (moduleName.startsWith(".") && moduleName.endsWith(".js")) {
    const originDir = path.dirname(context.originModulePath);
    const jsPath = path.join(originDir, moduleName);

    if (!fs.existsSync(jsPath)) {
      const tsPath = `${jsPath.slice(0, -3)}.ts`;
      if (fs.existsSync(tsPath)) {
        return (defaultResolveRequest ?? context.resolveRequest)(
          {
            ...context,
            resolveRequest: defaultResolveRequest ?? undefined,
          },
          `${moduleName.slice(0, -3)}.ts`,
          platform,
        );
      }

      const tsxPath = `${jsPath.slice(0, -3)}.tsx`;
      if (fs.existsSync(tsxPath)) {
        return (defaultResolveRequest ?? context.resolveRequest)(
          {
            ...context,
            resolveRequest: defaultResolveRequest ?? undefined,
          },
          `${moduleName.slice(0, -3)}.tsx`,
          platform,
        );
      }
    }
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;


